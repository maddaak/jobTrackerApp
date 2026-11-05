export const DEFAULT_LENGTH_MS = 60 * 60 * 1000;

export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Otherwise moving a saved round's start leaves an end before it, which core rejects. A blank end on a
// moved round stays blank since its length is unknown; a first start gets a default hour.
export function endFollowingStart(nextStart: string, previousStart: string, currentEnd: string): string {
  const next = new Date(nextStart).getTime();
  if (Number.isNaN(next) || (!currentEnd && previousStart)) return currentEnd;
  const length = new Date(currentEnd).getTime() - new Date(previousStart).getTime();
  return toDatetimeLocalValue(new Date(next + (length > 0 ? length : DEFAULT_LENGTH_MS)));
}

// formatRange collapses what the two ends share, so a same-afternoon round reads "2:00 – 3:00 PM"
// rather than repeating the meridiem, and it does that per locale rather than by our own rule.
function range(start: string, end: string | null, options: Intl.DateTimeFormatOptions): string {
  const formatter = new Intl.DateTimeFormat(undefined, options);
  const from = new Date(start);
  if (!end) return formatter.format(from);
  const to = new Date(end);
  return Number.isNaN(to.getTime()) ? formatter.format(from) : formatter.formatRange(from, to);
}

// Clock time only: the calendar cell already sits under its date.
export function formatTimeRange(start: string, end: string | null): string {
  return range(start, end, { hour: "numeric", minute: "2-digit" });
}

export function formatDateTimeRange(start: string, end: string | null): string {
  return range(start, end, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatFullDateTimeRange(start: string, end: string | null): string {
  return range(start, end, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatWeekdayDateTimeRange(start: string, end: string | null): string {
  return range(start, end, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
