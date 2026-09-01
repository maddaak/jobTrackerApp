import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";

const JWT_SECRET = "test-secret-not-for-production-use-only-in-tests-hs512-min-64-bytes";
const IMAGE_ID = "a1b2c3d4e5f6a1b2c3d4e5f6";

function authCookie(userId = "1", username = "alice") {
  const token = jwt.sign({ sub: userId, username }, JWT_SECRET, { expiresIn: "7d", algorithm: "HS512" });
  return `token=${token}`;
}

function fakeCoreResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

// The download path reads bytes and headers rather than json, so it needs a different fake.
function fakeBinaryResponse(status: number, bytes: Buffer, contentType: string, disposition?: string) {
  const headers: Record<string, string | undefined> = {
    "content-type": contentType,
    "content-disposition": disposition,
  };
  return {
    ok: status < 400,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    json: () => Promise.reject(new Error("not json")),
  };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

const imageMeta = {
  id: IMAGE_ID,
  fileName: "diagram.png",
  contentType: "image/png",
  sizeBytes: PNG.length,
  uploadedAt: "2026-08-30T12:00:00Z",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("GET /jobs/:id/images", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).get("/jobs/1/images");
    expect(res.status).toBe(401);
  });

  it("returns the job's attachment metadata", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, [imageMeta]));

    const res = await request(app).get("/jobs/1/images").set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([imageMeta]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/jobs/1/images"),
      expect.objectContaining({ headers: expect.objectContaining({ "X-User-Id": "42" }) }),
    );
  });

  it("proxies core's 404 when the job isn't the caller's", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(404, { error: "job not found" }));

    const res = await request(app).get("/jobs/1/images").set("Cookie", authCookie());

    expect(res.status).toBe(404);
  });
});

describe("POST /jobs/:id/images", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).post("/jobs/1/images").attach("file", PNG, "diagram.png");
    expect(res.status).toBe(401);
  });

  it("forwards the uploaded file and returns the stored metadata", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, imageMeta));

    const res = await request(app)
      .post("/jobs/1/images")
      .set("Cookie", authCookie("42"))
      .attach("file", PNG, "diagram.png");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(imageMeta);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/jobs/1/images"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-User-Id": "42" }),
      }),
    );
  });

  it("returns 400 when no file part is present, without calling core", async () => {
    const res = await request(app).post("/jobs/1/images").set("Cookie", authCookie());

    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("proxies core's rejection of a file that isn't really an image", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeCoreResponse(400, { error: "only PNG, JPEG, and WebP images are supported" }),
    );

    const res = await request(app)
      .post("/jobs/1/images")
      .set("Cookie", authCookie())
      .attach("file", Buffer.from("<svg/>"), "diagram.png");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "only PNG, JPEG, and WebP images are supported" });
  });
});

describe("GET /jobs/:id/images/:imageId", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).get(`/jobs/1/images/${IMAGE_ID}`);
    expect(res.status).toBe(401);
  });

  it("returns the raw bytes with core's detected content type", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeBinaryResponse(200, PNG, "image/png"));

    const res = await request(app).get(`/jobs/1/images/${IMAGE_ID}`).set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(Buffer.from(res.body)).toEqual(PNG);
  });

  it("sets nosniff so the browser can't reinterpret user-uploaded bytes", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeBinaryResponse(200, PNG, "image/png"));

    const res = await request(app).get(`/jobs/1/images/${IMAGE_ID}`).set("Cookie", authCookie());

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("passes core's filename through, so a saved attachment isn't named after its id", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeBinaryResponse(200, PNG, "image/png", 'inline; filename="diagram.png"'));

    const res = await request(app).get(`/jobs/1/images/${IMAGE_ID}`).set("Cookie", authCookie());

    expect(res.headers["content-disposition"]).toBe('inline; filename="diagram.png"');
  });

  it("returns 400 for a malformed image id without calling core", async () => {
    const res = await request(app).get("/jobs/1/images/..%2Fetc%2Fpasswd").set("Cookie", authCookie());

    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("proxies core's 404 for an image the caller doesn't own", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeBinaryResponse(404, Buffer.alloc(0), "application/json"));

    const res = await request(app).get(`/jobs/1/images/${IMAGE_ID}`).set("Cookie", authCookie());

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "image not found" });
  });

  it("reports a core outage as an outage rather than a missing image", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const res = await request(app).get(`/jobs/1/images/${IMAGE_ID}`).set("Cookie", authCookie());

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "internal error" });
  });
});

describe("DELETE /jobs/:id/images/:imageId", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).delete(`/jobs/1/images/${IMAGE_ID}`);
    expect(res.status).toBe(401);
  });

  it("forwards the delete and returns success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, { deleted: true }));

    const res = await request(app).delete(`/jobs/1/images/${IMAGE_ID}`).set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/jobs/1/images/${IMAGE_ID}`),
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ "X-User-Id": "42" }),
      }),
    );
  });

  it("returns 400 for a malformed image id without calling core", async () => {
    const res = await request(app).delete("/jobs/1/images/nope").set("Cookie", authCookie());

    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
