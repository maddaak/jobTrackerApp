import { useDroppable } from "@dnd-kit/core";

export interface BoardDropZoneProps {
  id: string;
  label: string;
  hint: string;
  tone: "green" | "slate" | "red";
}

const TONE_CLASS = {
  green: "border-green-400 text-green-700 dark:border-green-700 dark:text-green-300",
  slate: "border-slate-400 text-slate-600 dark:border-slate-600 dark:text-slate-300",
  red: "border-red-400 text-red-700 dark:border-red-700 dark:text-red-300",
};

const OVER_CLASS = {
  green: "bg-green-50 dark:bg-green-950/40",
  slate: "bg-slate-100 dark:bg-slate-900",
  red: "bg-red-50 dark:bg-red-950/40",
};

// The exits off the board: dropping here moves a card to another page rather than another column.
export default function BoardDropZone({ id, label, hint, tone }: BoardDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      aria-label={label}
      className={`flex flex-1 flex-col items-center justify-center rounded-lg border-2 border-dashed p-3 text-center ${TONE_CLASS[tone]} ${isOver ? OVER_CLASS[tone] : ""}`}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs opacity-80">{hint}</span>
    </div>
  );
}
