import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CloseJobDialog from "../../src/components/CloseJobDialog";
import type { JobSummary } from "../../src/api/jobsApi";

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

const job: JobSummary = {
  id: 7, company: "Acme", role: "Engineer", sourceCategory: "SELF_APPLIED", currentStage: "INTERVIEW_STAGE",
  interviewPhase: "PANEL", boardPhase: "PANEL", outcome: "ACTIVE", url: null, location: null, compMin: null, compMax: null,
  createdAt: "2026-01-01T00:00:00Z", latestInterview: null, needsScheduling: false, links: [], city: null, seasonId: 1,
};

function stubFetch(calls: { url: string; method: string; body: unknown }[]) {
  vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => {
    calls.push({ url, method: options?.method ?? "GET", body: options?.body ? JSON.parse(options.body as string) : null });
    return Promise.resolve(fakeResponse(200, {}));
  }));
}

describe("CloseJobDialog", () => {
  it("closes as rejected and saves only the reason, leaving the stored JD and notes alone", async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    stubFetch(calls);
    const onClosed = vi.fn();

    render(<CloseJobDialog job={job} onClose={vi.fn()} onClosed={onClosed} />);
    fireEvent.change(screen.getByLabelText("Rejected reason"), { target: { value: "wanted more Go" } });
    fireEvent.click(screen.getByRole("button", { name: "Close job" }));

    await waitFor(() => expect(onClosed).toHaveBeenCalledWith(undefined));
    expect(calls).toEqual([
      expect.objectContaining({ url: "/jobs/7", method: "PATCH", body: expect.objectContaining({ outcome: "REJECTED" }) }),
      { url: "/jobs/7/detail", method: "PUT", body: { rejectedReason: "wanted more Go" } },
    ]);
  });

  it("still reports the job closed when only the reason fails to save, so the page refreshes", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) =>
      Promise.resolve(url === "/jobs/7/detail" ? fakeResponse(500, { error: "boom" }) : fakeResponse(200, {}))));
    const onClosed = vi.fn();

    render(<CloseJobDialog job={job} onClose={vi.fn()} onClosed={onClosed} />);
    fireEvent.change(screen.getByLabelText("Rejected reason"), { target: { value: "wanted more Go" } });
    fireEvent.click(screen.getByRole("button", { name: "Close job" }));

    await waitFor(() => expect(onClosed).toHaveBeenCalledWith(expect.stringContaining("reason didn't save")));
  });

  it("closes with another outcome without touching the detail document", async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    stubFetch(calls);
    const onClosed = vi.fn();

    render(<CloseJobDialog job={job} onClose={vi.fn()} onClosed={onClosed} />);
    fireEvent.click(screen.getByLabelText("Ghosted"));
    expect(screen.queryByLabelText("Rejected reason")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close job" }));

    await waitFor(() => expect(onClosed).toHaveBeenCalled());
    expect(calls).toEqual([expect.objectContaining({ url: "/jobs/7", method: "PATCH", body: expect.objectContaining({ outcome: "GHOSTED" }) })]);
  });
});
