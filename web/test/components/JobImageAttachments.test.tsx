import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import JobImageAttachments from "../../src/components/JobImageAttachments";

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

const diagram = {
  id: "a1b2c3d4e5f6a1b2c3d4e5f6",
  fileName: "system-design.png",
  contentType: "image/png",
  sizeBytes: 245_760,
  uploadedAt: "2026-08-30T12:00:00Z",
};

function pngFile(name = "diagram.png") {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: "image/png" });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("JobImageAttachments", () => {
  it("lists an existing attachment as a link to its bytes, not an inline image", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, [diagram]));

    render(<JobImageAttachments jobId={5} />);

    const link = await screen.findByRole("link", { name: /system-design\.png/ });
    expect(link).toHaveAttribute("href", `/jobs/5/images/${diagram.id}`);
    expect(link).toHaveAttribute("target", "_blank");
    // The whole point of linking out: opening a job never downloads its screenshots.
    expect(document.querySelector("img")).toBeNull();
  });

  it("shows the file size so a large screenshot is obvious before opening it", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, [diagram]));

    render(<JobImageAttachments jobId={5} />);

    expect(await screen.findByText("240 KB")).toBeInTheDocument();
  });

  it("prompts for an upload when the job has no attachments", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));

    render(<JobImageAttachments jobId={5} />);

    expect(await screen.findByText(/Paste a screenshot/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("uploads a pasted screenshot and adds it to the list", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));
    render(<JobImageAttachments jobId={5} />);
    await screen.findByText(/Paste a screenshot/);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, diagram));
    const paste = new Event("paste") as Event & { clipboardData: unknown };
    paste.clipboardData = { files: [pngFile()] };
    fireEvent(window, paste);

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/jobs/5/images", expect.objectContaining({ method: "POST" })),
    );
    expect(await screen.findByRole("link", { name: /system-design\.png/ })).toBeInTheDocument();
  });

  it("leaves a paste into a text field alone even when the clipboard carries an image", async () => {
    // Copying from a spreadsheet puts text and an image on the clipboard; the text is what was meant.
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));
    render(
      <>
        <textarea aria-label="Job description" />
        <JobImageAttachments jobId={5} />
      </>,
    );
    await screen.findByText(/Paste a screenshot/);

    const paste = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
    paste.clipboardData = { files: [pngFile()] };
    fireEvent(screen.getByLabelText("Job description"), paste);

    expect(paste.defaultPrevented).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("renames a pasted screenshot so repeated pastes aren't all image.png", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));
    render(<JobImageAttachments jobId={5} />);
    await screen.findByText(/Paste a screenshot/);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, diagram));
    const paste = new Event("paste") as Event & { clipboardData: unknown };
    // The name Chrome gives every pasted image.
    paste.clipboardData = { files: [pngFile("image.png")] };
    fireEvent(window, paste);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const body = (fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body as FormData;
    expect((body.get("file") as File).name).toMatch(/^screenshot-.*\.png$/);
  });

  it("keeps a real filename when one is dropped or picked", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));
    render(<JobImageAttachments jobId={5} />);
    await screen.findByText(/Paste a screenshot/);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, diagram));
    const paste = new Event("paste") as Event & { clipboardData: unknown };
    paste.clipboardData = { files: [pngFile("architecture-v2.png")] };
    fireEvent(window, paste);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const body = (fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body as FormData;
    expect((body.get("file") as File).name).toBe("architecture-v2.png");
  });

  it("ignores a paste that carries no image", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));
    render(<JobImageAttachments jobId={5} />);
    await screen.findByText(/Paste a screenshot/);
    (fetch as ReturnType<typeof vi.fn>).mockClear();

    const paste = new Event("paste") as Event & { clipboardData: unknown };
    paste.clipboardData = { files: [new File(["hello"], "notes.txt", { type: "text/plain" })] };
    fireEvent(window, paste);

    // Pasting text into the notes field must not fire an upload.
    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
  });

  it("uploads a dropped image", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));
    render(<JobImageAttachments jobId={5} />);
    const zone = await screen.findByText(/Paste a screenshot/);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, diagram));
    fireEvent.drop(zone.parentElement!, { dataTransfer: { files: [pngFile()] } });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/jobs/5/images", expect.objectContaining({ method: "POST" })),
    );
  });

  it("sends the file as multipart without forcing a content type", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));
    render(<JobImageAttachments jobId={5} />);
    await screen.findByText(/Paste a screenshot/);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, diagram));
    fireEvent.change(screen.getByLabelText("Attach an image"), { target: { files: [pngFile()] } });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[1][1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    // Setting it by hand would omit the multipart boundary and core would reject the upload.
    expect(init.headers).toBeUndefined();
  });

  it("surfaces the server's reason when an upload is rejected", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));
    render(<JobImageAttachments jobId={5} />);
    await screen.findByText(/Paste a screenshot/);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(400, { error: "only PNG, JPEG, and WebP images are supported" }),
    );
    fireEvent.change(screen.getByLabelText("Attach an image"), { target: { files: [pngFile("fake.png")] } });

    expect(await screen.findByRole("alert"))
      .toHaveTextContent("only PNG, JPEG, and WebP images are supported");
  });

  it("deletes an attachment and drops it from the list", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, [diagram]));
    render(<JobImageAttachments jobId={5} />);
    await screen.findByRole("link", { name: /system-design\.png/ });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { deleted: true }));
    fireEvent.click(screen.getByLabelText("Delete system-design.png"));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/jobs/5/images/${diagram.id}`,
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /system-design\.png/ })).not.toBeInTheDocument(),
    );
  });

  it("keeps the attachment listed when the delete fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, [diagram]));
    render(<JobImageAttachments jobId={5} />);
    await screen.findByRole("link", { name: /system-design\.png/ });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(500, { error: "boom" }));
    fireEvent.click(screen.getByLabelText("Delete system-design.png"));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /system-design\.png/ })).toBeInTheDocument();
  });

  it("reports a failure to load rather than rendering an empty list", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(500, { error: "mongo is down" }));

    render(<JobImageAttachments jobId={5} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("mongo is down");
  });

  it("reloads when the modal switches to a different job", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, [diagram]));
    const { rerender } = render(<JobImageAttachments jobId={5} />);
    await screen.findByRole("link", { name: /system-design\.png/ });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));
    rerender(<JobImageAttachments jobId={9} />);

    // Job 5's attachment must not linger on job 9.
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /system-design\.png/ })).not.toBeInTheDocument(),
    );
    // request() omits the init argument entirely on a plain GET.
    expect(fetch).toHaveBeenCalledWith("/jobs/9/images");
  });
});
