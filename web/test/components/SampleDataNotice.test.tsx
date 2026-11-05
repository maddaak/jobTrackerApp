import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JobsProvider } from "../../src/context/JobsContext";
import SampleDataNotice from "../../src/components/SampleDataNotice";

function fakeResponse(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

// A server holding the jobs shown and a sample count, which loading and removing the sample change.
// canLoad is core's answer for the whole account, which may hold jobs in seasons not shown.
function stubServer(start: { jobs: unknown[]; sample: number; canLoad?: boolean }) {
  const state = { ...start };
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => {
    const method = options?.method ?? "GET";
    calls.push(`${method} ${url}`);
    if (url === "/jobs") return Promise.resolve(fakeResponse(state.jobs));
    if (url === "/account/sample" && method === "POST") {
      state.sample = 3;
      state.jobs = [{ id: 1 }, { id: 2 }, { id: 3 }];
      return Promise.resolve(fakeResponse({ jobs: 3 }));
    }
    if (url === "/account/sample" && method === "DELETE") {
      state.sample = 0;
      state.jobs = [];
      return Promise.resolve(fakeResponse({ removed: 3 }));
    }
    if (url === "/account/sample") {
      return Promise.resolve(fakeResponse({ jobs: state.sample, canLoad: state.canLoad ?? state.jobs.length === 0 }));
    }
    throw new Error(`unexpected fetch to ${url}`);
  }));
  return calls;
}

function Harness({ onChanged }: { onChanged: () => void }) {
  return <JobsProvider><SampleDataNotice onChanged={onChanged} /></JobsProvider>;
}

describe("SampleDataNotice", () => {
  it("offers the sample to an empty account and loads it", async () => {
    const calls = stubServer({ jobs: [], sample: 0 });
    const onChanged = vi.fn();
    render(<Harness onChanged={onChanged} />);

    fireEvent.click(await screen.findByRole("button", { name: "Try it with sample data" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(calls).toContain("POST /account/sample");
  });

  it("says when the jobs shown are made up, and removes them", async () => {
    const calls = stubServer({ jobs: [{ id: 1 }], sample: 1 });
    const onChanged = vi.fn();
    render(<Harness onChanged={onChanged} />);

    expect(await screen.findByText(/You're looking at sample data: 1 made-up jobs/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove sample data" }));

    await waitFor(() => expect(calls).toContain("DELETE /account/sample"));
    expect(onChanged).toHaveBeenCalled();
  });

  // Core refuses the sample once the account has a job anywhere, so a new season doesn't offer a button that errors.
  it("doesn't offer the sample in an empty season of an account with jobs elsewhere", async () => {
    const calls = stubServer({ jobs: [], sample: 0, canLoad: false });
    render(<Harness onChanged={vi.fn()} />);

    expect(await screen.findByText(/Nothing here yet/)).toBeInTheDocument();
    expect(calls).toContain("GET /account/sample");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("stays out of the way of a real search", async () => {
    const calls = stubServer({ jobs: [{ id: 1 }], sample: 0 });
    render(<Harness onChanged={vi.fn()} />);

    await waitFor(() => expect(calls).toContain("GET /account/sample"));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
