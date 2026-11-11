import type { ReactNode } from "react";

interface EditToggleCellProps {
  isEditing: boolean;
  onStartEdit: () => void;
  onDone: () => void;
  editLabel: string;
  display: ReactNode;
  editor: ReactNode;
}

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828Z" />
    </svg>
  );
}

// Text fields edit behind a pencil and save on Done, so typing never fires a request per keystroke.
export default function EditToggleCell({ isEditing, onStartEdit, onDone, editLabel, display, editor }: EditToggleCellProps) {
  if (isEditing) {
    return (
      <div className="flex flex-col gap-1">
        {editor}
        <button
          type="button"
          onClick={onDone}
          className="self-start text-xs text-blue-600 hover:underline dark:text-blue-400"
        >
          Done
        </button>
      </div>
    );
  }
  return (
    // Transparent box matching the inputs' border so display text lines up with the bordered cells beside it.
    <div className="flex items-center justify-center gap-1.5 border border-transparent px-1.5 py-1">
      <div className="min-w-0 flex-1 text-sm">{display}</div>
      <button
        type="button"
        aria-label={editLabel}
        onClick={onStartEdit}
        className="shrink-0 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
      >
        <PencilIcon />
      </button>
    </div>
  );
}
