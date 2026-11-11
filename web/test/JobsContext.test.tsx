import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { JobsProvider } from "../src/context/JobsContext";
import { useJobsContext } from "../src/hooks/useJobsContext";
import type { JobSummary } from "../src/api/jobsApi";

function summary(id: number, company: string): JobSummary {
  return {
    id, company, role: "Engineer", sourceCategory: "SELF_APPLIED", currentStage: "INTERVIEW_REQUEST",
    interviewPhase: null, boardPhase: null, outcome: "ACTIVE", url: null, location: null, city: null,
    compMin: null, compMax: null, createdAt: "2026-01-01T00:00:00Z", latestInterview: null, links: [],
    needsScheduling: false, seasonId: 1,
  };
}

let context: ReturnType<typeof useJobsContext>;
function Probe() {
  context = useJobsContext();
  return <p>{context.jobs.map(job => job.company).join(",")}</p>;
}

describe("JobsProvider", () => {
  // A drag moves a card locally while an earlier drag's refresh is still out; that older answer
  // must not land over the newer placement.
  it("drops a load that was in flight when the list was edited locally", async () => {
    let answerStale: (value: unknown) => void = () => {};
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([summary(1, "Initech")]) })
      .mockReturnValueOnce(new Promise(resolve => { answerStale = resolve; }));
    vi.stubGlobal("fetch", fetchMock);

    render(<JobsProvider><Probe /></JobsProvider>);
    await screen.findByText("Initech");

    let staleRefresh: Promise<void> = Promise.resolve();
    act(() => { staleRefresh = context.refresh(); });
    act(() => { context.setJobs(previous => previous.map(job => ({ ...job, company: "Moved" }))); });
    await act(async () => {
      answerStale({ ok: true, status: 200, json: () => Promise.resolve([summary(1, "Stale")]) });
      await staleRefresh;
    });

    await waitFor(() => expect(screen.getByText("Moved")).toBeInTheDocument());
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
  });

  // An edit before the first load lands has no list under it, so the list is loaded again, not left unloaded.
  it("still loads the list when it's edited before the first load lands", async () => {
    let answerFirst: (value: unknown) => void = () => {};
    vi.stubGlobal("fetch", vi.fn()
      .mockReturnValueOnce(new Promise(resolve => { answerFirst = resolve; }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([summary(1, "Initech"), summary(2, "Added")]) }));

    render(<JobsProvider><Probe /></JobsProvider>);
    act(() => { context.setJobs(previous => [...previous, summary(2, "Added")]); });
    await act(async () => {
      answerFirst({ ok: true, status: 200, json: () => Promise.resolve([summary(1, "Initech")]) });
    });

    await waitFor(() => expect(context.loaded).toBe(true));
    expect(screen.getByText("Initech,Added")).toBeInTheDocument();
  });
});
