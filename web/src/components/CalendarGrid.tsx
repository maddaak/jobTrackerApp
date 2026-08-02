import { INTERVIEW_TYPE_LABELS, type Interview } from "../api/interviewsApi";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getMonthGridDays(month: Date): Date[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const startWeekday = new Date(year, monthIndex, 1).getDay();
  const gridStart = new Date(year, monthIndex, 1 - startWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    return day;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export interface CalendarGridProps {
  interviews: Interview[];
  month: Date;
  onSelectDay: (date: Date) => void;
  onSelectInterview: (interview: Interview) => void;
}

export default function CalendarGrid({ interviews, month, onSelectDay, onSelectInterview }: CalendarGridProps) {
  const days = getMonthGridDays(month);
  const today = new Date();

  return (
    <div
      role="grid"
      aria-label="Calendar"
      className="grid grid-cols-7 gap-px overflow-hidden rounded border border-neutral-200 bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-800"
    >
      {WEEKDAY_LABELS.map(label => (
        <div
          key={label}
          className="bg-neutral-50 p-2 text-center text-xs font-medium text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400"
        >
          {label}
        </div>
      ))}
      {days.map(day => {
        const dayInterviews = interviews.filter(interview => isSameDay(new Date(interview.interviewDateTime), day));
        const inMonth = isSameMonth(day, month);
        return (
          <div
            key={day.toISOString()}
            role="gridcell"
            tabIndex={0}
            aria-label={day.toDateString()}
            onClick={() => onSelectDay(day)}
            onKeyDown={e => {
              // Only handle the cell's own key events; otherwise Enter/Space on a focused interview button bubbles here and opens the create modal instead of editing.
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectDay(day);
              }
            }}
            className={`min-h-24 cursor-pointer bg-white p-1 dark:bg-neutral-950 ${inMonth ? "" : "opacity-40"} ${
              isSameDay(day, today) ? "ring-2 ring-inset ring-blue-400" : ""
            }`}
          >
            <div className="text-xs text-neutral-500 dark:text-neutral-400">{day.getDate()}</div>
            <div className="mt-1 flex flex-col gap-0.5">
              {dayInterviews.map(interview => (
                <button
                  key={interview.stageEventId}
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    onSelectInterview(interview);
                  }}
                  className="truncate rounded bg-blue-100 px-1 py-0.5 text-left text-xs text-blue-800 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900"
                >
                  {interview.company}
                  {interview.interviewType && ` · ${INTERVIEW_TYPE_LABELS[interview.interviewType]}`}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
