import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";

export interface BoardColumnProps {
  id: string;
  label: string;
  // Null while the jobs are still loading, so an empty column isn't read as "nothing here".
  count: number | null;
  children: ReactNode;
}

export default function BoardColumn({ id, label, count, children }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={[
        "flex min-h-0 min-w-48 flex-1 flex-col rounded-lg bg-neutral-100 p-2 dark:bg-neutral-800/60",
        isOver ? "ring-2 ring-blue-400" : "",
      ].join(" ")}
    >
      <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
        {label}
        <span className="rounded-full bg-neutral-200 px-2 text-xs font-medium dark:bg-neutral-700">{count ?? "…"}</span>
      </h2>
      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto">{children}</div>
    </section>
  );
}
