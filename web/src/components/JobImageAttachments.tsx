import { useCallback, useEffect, useRef, useState } from "react";
import {
  listJobImages,
  uploadJobImage,
  deleteJobImage,
  jobImageUrl,
  formatFileSize,
  type JobImage,
} from "../api/jobImagesApi";

export interface JobImageAttachmentsProps {
  jobId: number;
}

const labelClass = "mb-1 block text-sm font-medium";

// Chrome names every pasted screenshot "image.png", so the list would be rows of identical names.
function pastedName(original: string): string {
  if (original && original !== "image.png") return original;
  return `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
}

export default function JobImageAttachments({ jobId }: JobImageAttachmentsProps) {
  const [images, setImages] = useState<JobImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let ignore = false;
    setImages([]);
    setError(null);
    listJobImages(jobId)
      .then(loaded => {
        if (!ignore) setImages(loaded);
      })
      .catch(err => {
        if (!ignore) setError(err instanceof Error ? err.message : "failed to load attachments");
      });
    return () => {
      ignore = true;
    };
  }, [jobId]);

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const uploaded = await uploadJobImage(jobId, file);
        setImages(prev => [...prev, uploaded]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "failed to upload attachment");
      } finally {
        setBusy(false);
      }
    },
    [jobId],
  );

  // Window-level so Cmd+V works anywhere in the modal rather than only inside a focused drop zone.
  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      // Copying from a spreadsheet puts text and an image on the clipboard, so stealing this would drop the text.
      const target = e.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea"))) {
        return;
      }
      const file = Array.from(e.clipboardData?.files ?? []).find(f => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      await upload(new File([file], pastedName(file.name), { type: file.type }));
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [upload]);

  async function handleDelete(imageId: string) {
    setBusy(true);
    setError(null);
    try {
      await deleteJobImage(jobId, imageId);
      setImages(prev => prev.filter(image => image.id !== imageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to delete attachment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className={labelClass}>Attachments</p>
      {error && <p role="alert" className="mb-1 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {images.length > 0 && (
        <ul className="mb-2 space-y-1 text-sm">
          {images.map(image => (
            <li
              key={image.id}
              className="flex items-center justify-between gap-2 rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700"
            >
              <a
                href={jobImageUrl(jobId, image.id)}
                target="_blank"
                rel="noreferrer"
                className="truncate text-blue-600 hover:underline dark:text-blue-400"
                title={image.fileName}
              >
                {image.fileName} ↗
              </a>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {formatFileSize(image.sizeBytes)}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Delete ${image.fileName}`}
                  onClick={() => handleDelete(image.id)}
                  className="text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div
        onDragOver={e => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith("image/"));
          if (file) void upload(file);
        }}
        className={`rounded border border-dashed px-3 py-3 text-center text-sm ${
          dragging
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
            : "border-neutral-300 dark:border-neutral-600"
        }`}
      >
        <span className="text-neutral-500 dark:text-neutral-400">
          {busy ? "Uploading…" : "Paste a screenshot, drop an image, or "}
        </span>
        {!busy && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            choose a file
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          aria-label="Attach an image"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            // Clear it, or picking the same file twice in a row fires no change event.
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
