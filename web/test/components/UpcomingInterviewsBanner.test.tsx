import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import UpcomingInterviewsBanner from "../../src/components/UpcomingInterviewsBanner";
import type { Interview } from "../../src/api/interviewsApi";

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

const acmeInterview: Interview = {
  stageEventId: 5,
  jobId: 1,
  company: "Acme",
  role: "Backend Engineer",
  stage: "INTERVIEW_STAGE",
  interviewDateTime: "2026-08-01T18:00:00.000Z",
  interviewType: "SYSTEM_DESIGN",
  meetingLink: null,
  location: null,
  interviewers: [],
};

const globexInterview: Interview = { ...acmeInterview, stageEventId: 6, jobId: 2, company: "Globex" };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

function renderBanner(refreshSignal = 0, onInterviewChanged = vi.fn()) {
  return render(
    <MemoryRouter>
      <UpcomingInterviewsBanner refreshSignal={refreshSignal} onInterviewChanged={onInterviewChanged} />
    </MemoryRouter>,
  );
}

describe("UpcomingInterviewsBanner", () => {
  it("renders nothing when there are no upcoming interviews", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, []));

    const { container } = renderBanner();

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/interviews/upcoming"));
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each upcoming interview's company as a clickable line", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, [acmeInterview, globexInterview]));

    renderBanner();

    expect(await screen.findByText("Upcoming interviews:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acme" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Globex" })).toBeInTheDocument();
  });

  it("clicking a company opens the interview details modal", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, [acmeInterview]));

    renderBanner();

    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Acme — Backend Engineer")).toBeInTheDocument();
  });

  it("the X button dismisses the banner without an auto-timer", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, [acmeInterview]));

    renderBanner();
    await screen.findByText("Upcoming interviews:");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByText("Upcoming interviews:")).not.toBeInTheDocument();
  });

  it("stays dismissed on an unrelated refresh with no new interview", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, [acmeInterview]));
    const { rerender } = renderBanner(0);
    await screen.findByText("Upcoming interviews:");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, [acmeInterview]));
    rerender(
      <MemoryRouter>
        <UpcomingInterviewsBanner refreshSignal={1} onInterviewChanged={vi.fn()} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Upcoming interviews:")).not.toBeInTheDocument();
  });

  it("reopens a dismissed banner when a newly-qualifying interview appears", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, [acmeInterview]));
    const { rerender } = renderBanner(0);
    await screen.findByText("Upcoming interviews:");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, [acmeInterview, globexInterview]));
    rerender(
      <MemoryRouter>
        <UpcomingInterviewsBanner refreshSignal={1} onInterviewChanged={vi.fn()} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Upcoming interviews:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Globex" })).toBeInTheDocument();
  });
});
