// Days as a date input holds them (YYYY-MM-DD), in the person's own time zone rather than UTC's.

export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Read as that calendar day: parsed as UTC midnight it shows the day before anywhere west of UTC.
export function formatDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
