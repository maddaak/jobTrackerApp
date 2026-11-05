import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SeasonPicker from "../../src/components/job/SeasonPicker";
import type { JobSummary } from "../../src/api/jobsApi";

const JOB = { id: 7, company: "Acme", role: "Engineer", seasonId: 1 } as JobSummary;

const SEASONS = [
  { id: 1, name: "Fall search", createdAt: "2026-01-01T00:00:00Z", jobCount: 4, active: true },
  { id: 2, name: "Spring search", createdAt: "2026-06-01T00:00:00Z", jobCount: 0, active: false },
];

function stubFetch(seasons: unknown) {
  const mock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(
    url === "/seasons" && !init
      ? { ok: true, status: 200, json: () => Promise.resolve(seasons) }
      : { ok: true, status: 204, json: () => Promise.reject(new Error("empty")) }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("SeasonPicker", () => {
  it("loads seasons only when asked, then moves the job", async () => {
    const fetchMock = stubFetch(SEASONS);
    const onChanged = vi.fn();
    render(<SeasonPicker job={JOB} onError={() => {}} onChanged={onChanged} />);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Move to another season" }));
    fireEvent.change(await screen.findByLabelText("Season"), { target: { value: "2" } });

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenLastCalledWith("/seasons/2/jobs/7", expect.objectContaining({ method: "PUT" }));
  });

  it("explains where to start another season when there is only one", async () => {
    stubFetch([SEASONS[0]]);
    render(<SeasonPicker job={JOB} onError={() => {}} onChanged={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Move to another season" }));

    expect(await screen.findByText(/This is your only season/)).toBeInTheDocument();
  });
});
