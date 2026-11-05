import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FollowUpsDue from "../../src/components/FollowUpsDue";

const DUE = [
  { jobId: 4, company: "Initech", role: "Engineer", contactName: "Dana", contactRole: "RECRUITER", followUpOn: "2026-10-12" },
  { jobId: 9, company: "Globex", role: "Designer", contactName: "Sam", contactRole: "REFERRER", followUpOn: "2026-10-14" },
];

function stubFetch(body: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) })));
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("FollowUpsDue", () => {
  it("lists who is due and opens their job", async () => {
    stubFetch(DUE);
    const onOpenJob = vi.fn();

    render(<FollowUpsDue refreshSignal={0} onOpenJob={onOpenJob} />);

    expect(await screen.findByText("2 follow-ups due")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sam (Referrer) at Globex, Designer" }));
    expect(onOpenJob).toHaveBeenCalledWith(9);
  });

  // Nothing due and a failed check look the same: the board shouldn't carry a box about it either way.
  it("shows nothing when no one is due or the check fails", async () => {
    stubFetch([]);
    const { container, rerender } = render(<FollowUpsDue refreshSignal={0} onOpenJob={() => {}} />);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();

    stubFetch({ error: "nope" }, false);
    rerender(<FollowUpsDue refreshSignal={1} onOpenJob={() => {}} />);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
