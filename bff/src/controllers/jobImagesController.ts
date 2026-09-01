import type { Response } from "express";
import {
  listJobImages,
  uploadJobImage,
  downloadJobImage,
  deleteJobImage,
} from "../services/jobImagesClient.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";
import { sendUpstream } from "../middleware/upstreamResponse.js";

export async function list(req: AuthedRequest, res: Response) {
  const result = await listJobImages(req.userId!, req.params.id as string);
  sendUpstream(res, result);
}

export async function upload(req: AuthedRequest, res: Response) {
  if (!req.file) {
    res.status(400).json({ error: "missing required file upload" });
    return;
  }
  const result = await uploadJobImage(
    req.userId!,
    req.params.id as string,
    req.file.originalname,
    req.file.mimetype,
    req.file.buffer,
  );
  sendUpstream(res, result);
}

export async function download(req: AuthedRequest, res: Response) {
  const result = await downloadJobImage(
    req.userId!, req.params.id as string, req.params.imageId as string);
  if (!result.ok || !result.body) {
    // Only a real 404 is a missing image; a core outage or timeout must not read as data loss.
    const status = result.status === 200 ? 502 : result.status;
    const error = status >= 500 ? "internal error" : status === 404 ? "image not found" : "failed to load attachment";
    res.status(status).json({ error });
    return;
  }
  // nosniff matters here specifically: this is user-uploaded content served from our own origin.
  res.setHeader("Content-Type", result.contentType!);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (result.contentDisposition) {
    res.setHeader("Content-Disposition", result.contentDisposition);
  }
  // Immutable: an image is never edited in place, only added or deleted.
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.send(result.body);
}

export async function remove(req: AuthedRequest, res: Response) {
  const result = await deleteJobImage(
    req.userId!, req.params.id as string, req.params.imageId as string);
  sendUpstream(res, result);
}
