import type { WeeklyActivity } from "../../api/metricsApi";

const BAR_HEIGHT_PX = 96;

const weekLabel = (weekStart: string) =>
  new Date(`${weekStart}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

// Pace, not outcome: a search goes quiet in weeks nobody notices until the replies stop.
export default function WeeklyActivityChart({ weeks }: { weeks: WeeklyActivity[] }) {
  const top = Math.max(1, ...weeks.flatMap(week => [week.applications, week.interviews]));
  const current = weeks[weeks.length - 1];
  const average = weeks.reduce((sum, week) => sum + week.applications, 0) / Math.max(1, weeks.length);

  return (
    <div>
      <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-300">
        This week: {current?.applications ?? 0} {current?.applications === 1 ? "application" : "applications"},{" "}
        {current?.interviews ?? 0} {current?.interviews === 1 ? "interview" : "interviews"}. Over {weeks.length} weeks,{" "}
        {average.toFixed(1)} applications a week on average.
      </p>
      <ol className="flex items-end gap-2" aria-label="Applications and interviews by week">
        {weeks.map(week => (
          <li
            key={week.weekStart}
            aria-label={`Week of ${weekLabel(week.weekStart)}: ${week.applications} applications, ${week.interviews} interviews`}
            className="flex w-9 flex-col items-center gap-1"
          >
            <div className="flex items-end gap-0.5" style={{ height: BAR_HEIGHT_PX }} aria-hidden>
              <div
                title={`${week.applications} applications`}
                className="w-3 rounded-t bg-blue-500"
                style={{ height: Math.round((week.applications / top) * BAR_HEIGHT_PX) }}
              />
              <div
                title={`${week.interviews} interviews`}
                className="w-3 rounded-t bg-violet-500"
                style={{ height: Math.round((week.interviews / top) * BAR_HEIGHT_PX) }}
              />
            </div>
            <span aria-hidden className="whitespace-nowrap text-[10px] text-neutral-500 dark:text-neutral-400">
              {weekLabel(week.weekStart)}
            </span>
          </li>
        ))}
      </ol>
      <p aria-hidden className="mt-2 flex gap-4 text-xs text-neutral-500 dark:text-neutral-400">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-blue-500" />Applications</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-violet-500" />Interviews held</span>
      </p>
    </div>
  );
}
