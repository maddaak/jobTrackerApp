import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CalendarGrid from "../../src/components/CalendarGrid";
import type { Interview } from "../../src/api/interviewsApi";

const interviews: Interview[] = [
  {
    roundId: "round-1",
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

  it("shows the interview time and sorts same-day interviews chronologically", () => {
    const sameDay: Interview[] = [
      { ...interviews[0], roundId: "round-later", company: "Later Co", interviewDateTime: "2026-08-14T20:00:00.000Z" },
      { ...interviews[0], roundId: "round-earlier", company: "Earlier Co", interviewDateTime: "2026-08-14T13:00:00.000Z" },
    ];

    render(
      <CalendarGrid interviews={sameDay} month={new Date(2026, 7, 1)} onSelectDay={vi.fn()} onSelectInterview={vi.fn()} />,
    );

    const chips = screen.getAllByRole("button", { name: /Co/ });
    expect(chips[0]).toHaveTextContent("Earlier Co");
    expect(chips[1]).toHaveTextContent("Later Co");
    expect(chips[0]).toHaveTextContent(new Date(sameDay[1].interviewDateTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
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
