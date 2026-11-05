import type { NextFunction, Request, Response } from "express";
import multer from "multer";

// Multer reports a rejected upload through next(err), which would otherwise surface as a 500.
export function uploadErrors(tooLargeMessage: string) {
  return (err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (!(err instanceof multer.MulterError)) {
      next(err);
      return;
    }
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: tooLargeMessage });
      return;
    }
    res.status(400).json({ error: "invalid file upload" });
  };
}
