import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ClosedSeasonBanner from "../../src/components/seasons/ClosedSeasonBanner";

const CLOSED = { id: 4, name: "Spring hunt", createdAt: "2026-01-01T00:00:00Z", jobCount: 3, active: true,
  closedAt: "2026-04-20T15:00:00Z", acceptedJobId: null, firstApplied: null, lastApplied: null };

describe("ClosedSeasonBanner", () => {
  it("says the season on screen is closed, links its summary, and Edit reopens it", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ...CLOSED, closedAt: null }) }));
    vi.stubGlobal("fetch", fetchMock);
    const onReopened = vi.fn();
    render(<MemoryRouter><ClosedSeasonBanner season={CLOSED} onReopened={onReopened} /></MemoryRouter>);

    expect(screen.getByText(/is closed, so it's read-only/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See summary" })).toHaveAttribute("href", "/seasons/4/summary");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    await waitFor(() => expect(onReopened).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]).toEqual(["/seasons/4/reopen", expect.objectContaining({ method: "POST" })]);
  });
});
