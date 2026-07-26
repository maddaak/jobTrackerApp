import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import CalendarPage from "../../src/pages/CalendarPage";

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

function dateInCurrentMonth(day: number) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), day, 18, 0, 0).toISOString();
}

function renderCalendarPage() {
  return render(
    <MemoryRouter>
      <CalendarPage />
    </MemoryRouter>,
  );
}

describe("CalendarPage", () => {
  it("loads and displays interviews for the current month", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/interviews") {
          return Promise.resolve(
            fakeResponse(200, [
              {
                stageEventId: 1,
                jobId: 1,
                company: "Acme",
                role: "Engineer",
                stage: "INTERVIEW_STAGE",
                interviewDateTime: dateInCurrentMonth(15),
                interviewType: "SYSTEM_DESIGN",
                meetingLink: null,
                location: null,
                interviewers: [],
              },
            ]),
          );
        }
        throw new Error(`unexpected fetch to ${url}`);
      }),
    );

    renderCalendarPage();

    expect(await screen.findByText(/Acme/)).toBeInTheDocument();
  });

  it("clicking an empty day opens the create-interview modal", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(fakeResponse(200, []))));

    renderCalendarPage();

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/interviews"));
    fireEvent.click(screen.getAllByRole("gridcell")[10]);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Job")).toBeInTheDocument();
  });

  it("clicking an interview chip opens edit mode pre-filled with its details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/interviews") {
          return Promise.resolve(
            fakeResponse(200, [
              {
                stageEventId: 1,
                jobId: 1,
                company: "Acme",
                role: "Engineer",
                stage: "INTERVIEW_STAGE",
                interviewDateTime: dateInCurrentMonth(15),
                interviewType: "SYSTEM_DESIGN",
                meetingLink: null,
                location: null,
                interviewers: [{ id: 1, name: "Jordan Lee", linkedInUrl: null }],
              },
            ]),
          );
        }
        throw new Error(`unexpected fetch to ${url}`);
      }),
    );

    renderCalendarPage();

    fireEvent.click(await screen.findByText(/Acme/));

    expect(await screen.findByLabelText("Interviewer name")).toHaveValue("Jordan Lee");
  });
});
