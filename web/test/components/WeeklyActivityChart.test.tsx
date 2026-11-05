import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WeeklyActivityChart from "../../src/components/metrics/WeeklyActivityChart";

describe("WeeklyActivityChart", () => {
  it("gives each week its counts and sums up the pace", () => {
    render(<WeeklyActivityChart weeks={[
      { weekStart: "2026-09-28", applications: 4, interviews: 0 },
      { weekStart: "2026-10-05", applications: 0, interviews: 2 },
      { weekStart: "2026-10-12", applications: 1, interviews: 1 },
    ]} />);

    expect(screen.getByText(/This week: 1 application, 1 interview\. Over 3 weeks, 1\.7 applications a week/)).toBeInTheDocument();
    const weeks = screen.getAllByRole("listitem");
    expect(weeks).toHaveLength(3);
    expect(weeks[1]).toHaveAccessibleName(/2 interviews/);
  });
});
