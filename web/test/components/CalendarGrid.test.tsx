import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CalendarGrid from "../../src/components/CalendarGrid";
import type { Interview } from "../../src/api/interviewsApi";

const interviews: Interview[] = [
  {
    stageEventId: 1,
    jobId: 10,
    company: "Acme",
    role: "Engineer",
    stage: "INTERVIEW_STAGE",
    interviewDateTime: "2026-08-14T18:00:00.000Z",
    interviewType: "SYSTEM_DESIGN",
    meetingLink: null,
    location: null,
    interviewers: [],
  },
];

describe("CalendarGrid", () => {
  it("renders a 7-column grid with weekday headers and 42 day cells", () => {
    render(
      <CalendarGrid
        interviews={[]}
        month={new Date(2026, 7, 1)}
        onSelectDay={vi.fn()}
        onSelectInterview={vi.fn()}
      />,
    );

    for (const label of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("gridcell")).toHaveLength(42);
  });

  it("places an interview chip on the correct day and omits it from other days", () => {
    render(
      <CalendarGrid
        interviews={interviews}
        month={new Date(2026, 7, 1)}
        onSelectDay={vi.fn()}
        onSelectInterview={vi.fn()}
      />,
    );

    expect(screen.getByText(/Acme/)).toBeInTheDocument();
    expect(screen.getAllByText(/Acme/)).toHaveLength(1);
  });

  it("calls onSelectInterview (not onSelectDay) when a chip is clicked", () => {
    const onSelectDay = vi.fn();
    const onSelectInterview = vi.fn();
    render(
      <CalendarGrid
        interviews={interviews}
        month={new Date(2026, 7, 1)}
        onSelectDay={onSelectDay}
        onSelectInterview={onSelectInterview}
      />,
    );

    fireEvent.click(screen.getByText(/Acme/));

    expect(onSelectInterview).toHaveBeenCalledWith(interviews[0]);
    expect(onSelectDay).not.toHaveBeenCalled();
  });

  it("calls onSelectDay when clicking empty space on a day cell", () => {
    const onSelectDay = vi.fn();
    render(
      <CalendarGrid
        interviews={[]}
        month={new Date(2026, 7, 1)}
        onSelectDay={onSelectDay}
        onSelectInterview={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText(new Date(2026, 7, 10).toDateString()));

    expect(onSelectDay).toHaveBeenCalledWith(new Date(2026, 7, 10));
  });
});
