import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import StageHistorySection from "../../src/components/job/StageHistorySection";

function fakeResponse(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

describe("StageHistorySection", () => {
  // The status control and a new round both live in the same modal; their entry must show without reopening it.
  it("reloads when the job's stage changes elsewhere in the modal", async () => {
    const applied = { stage: "RESUME_CHECK", enteredAt: "2026-08-01T12:00:00Z", note: null };
    const contacted = { stage: "INTERVIEW_REQUEST", enteredAt: "2026-08-03T12:00:00Z", note: null };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(fakeResponse({ stageEvents: [applied] }))
      .mockResolvedValueOnce(fakeResponse({ stageEvents: [applied, contacted] })));
    const props = { jobId: 7, onError: vi.fn(), onChanged: vi.fn() };

    const { rerender } = render(<StageHistorySection {...props} currentStage="RESUME_CHECK" />);
    expect(await screen.findByText("Resume Check")).toBeInTheDocument();
    expect(screen.queryByText("Interview Request")).not.toBeInTheDocument();

    rerender(<StageHistorySection {...props} currentStage="INTERVIEW_REQUEST" />);

    expect(await screen.findByText("Interview Request")).toBeInTheDocument();
  });

  const entry = (stage: string, day: number) => ({ stage, enteredAt: `2026-08-0${day}T12:00:00Z`, note: null });
  // Ticked on, off, and on again: still one interview row, because waiting is a pause inside it.
  const toggled = [
    entry("RESUME_CHECK", 1), entry("INTERVIEW_STAGE", 2),
    entry("WAITING_INTERVIEW_RESULTS", 3), entry("INTERVIEW_STAGE", 4), entry("WAITING_INTERVIEW_RESULTS", 5),
  ];

  it("adds no rows for ticking Waiting on results on and off", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(fakeResponse({ stageEvents: toggled })));

    render(<StageHistorySection jobId={7} currentStage="WAITING_INTERVIEW_RESULTS" onError={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Interview Stage")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText("Waiting Interview Results")).not.toBeInTheDocument();
  });

  it("deleting a row removes the Waiting entries folded into it, each under its own stage", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fakeResponse({ stageEvents: toggled }));
    for (let i = 0; i < 4; i++) fetchMock.mockResolvedValueOnce(fakeResponse([toggled[0]]));
    vi.stubGlobal("fetch", fetchMock);
    render(<StageHistorySection jobId={7} currentStage="WAITING_INTERVIEW_RESULTS" onError={vi.fn()} onChanged={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Interview Stage history entry" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    const deleted = fetchMock.mock.calls.slice(1).map(([url]) => new URL(url as string, "http://x").searchParams.get("stage"));
    expect(deleted).toEqual(["INTERVIEW_STAGE", "WAITING_INTERVIEW_RESULTS", "INTERVIEW_STAGE", "WAITING_INTERVIEW_RESULTS"]);
  });
});
