import { fireEvent, render as renderPlain, screen, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SeasonSwitcher from "../../src/components/SeasonSwitcher";

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}{location.hash}</p>;
}

function Router({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}<Where /></MemoryRouter>;
}

// The switcher links to Profile, so every render needs a router around it.
const render = (ui: ReactElement) => renderPlain(ui, { wrapper: Router });

const SEASONS = [
  { id: 1, name: "Fall search", createdAt: "2026-01-01T00:00:00Z", jobCount: 40, active: false },
  { id: 2, name: "Spring search", createdAt: "2026-06-01T00:00:00Z", jobCount: 3, active: true },
];

let calls: { url: string; init?: RequestInit }[] = [];

function mockFetch(seasons: unknown) {
  calls = [];
  return vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url === "/seasons" && !init) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(seasons) });
    }
    if (url === "/seasons" && init?.method === "POST") {
      return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ ...SEASONS[1], id: 3 }) });
    }
    return Promise.resolve({ ok: true, status: 204, json: () => Promise.reject(new Error("empty")) });
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("SeasonSwitcher", () => {
  it("shows the active season with each season's job count", async () => {
    vi.stubGlobal("fetch", mockFetch(SEASONS));

    render(<SeasonSwitcher onSwitched={() => {}} />);

    const select = await screen.findByLabelText("Season");
    expect(select).toHaveValue("2");
    expect(screen.getByRole("option", { name: "Fall search (40)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "All seasons" })).toBeInTheDocument();
  });

  // With one season, "All seasons" would show exactly the same thing.
  it("offers all seasons only once there is more than one", async () => {
    vi.stubGlobal("fetch", mockFetch([{ ...SEASONS[0], active: true }]));

    render(<SeasonSwitcher onSwitched={() => {}} />);

    await screen.findByLabelText("Season");
    expect(screen.queryByRole("option", { name: "All seasons" })).not.toBeInTheDocument();
  });

  it("switches to every season at once and asks the app to reload", async () => {
    vi.stubGlobal("fetch", mockFetch(SEASONS));
    const onSwitched = vi.fn();
    render(<SeasonSwitcher onSwitched={onSwitched} />);

    fireEvent.change(await screen.findByLabelText("Season"), { target: { value: "all" } });

    await waitFor(() => expect(onSwitched).toHaveBeenCalled());
    const put = calls.find(call => call.url === "/seasons/active");
    expect(JSON.parse(put!.init!.body as string)).toEqual({ seasonId: null });
  });

  it("starts a new season by name", async () => {
    vi.stubGlobal("fetch", mockFetch(SEASONS));
    const onSwitched = vi.fn();
    render(<SeasonSwitcher onSwitched={onSwitched} />);

    fireEvent.change(await screen.findByLabelText("Season"), { target: { value: "new" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Summer search " } });
    fireEvent.click(screen.getByRole("button", { name: "Start season" }));

    await waitFor(() => expect(onSwitched).toHaveBeenCalled());
    const post = calls.find(call => call.init?.method === "POST");
    expect(JSON.parse(post!.init!.body as string)).toEqual({ name: "Summer search" });
  });

  it("opens the Seasons page from the picker", async () => {
    vi.stubGlobal("fetch", mockFetch(SEASONS));
    render(<SeasonSwitcher onSwitched={() => {}} />);

    fireEvent.change(await screen.findByLabelText("Season"), { target: { value: "manage" } });

    expect(screen.getByTestId("where")).toHaveTextContent("/seasons");
  });

  // The sidebar has no Seasons entry; its heading is the way there.
  it("opens the Seasons page from its heading", async () => {
    vi.stubGlobal("fetch", mockFetch(SEASONS));
    render(<SeasonSwitcher onSwitched={() => {}} />);

    fireEvent.click(await screen.findByRole("link", { name: "Season" }));

    expect(screen.getByTestId("where")).toHaveTextContent("/seasons");
  });

  it("says so instead of crashing when the list doesn't load", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "nope" }));

    render(<SeasonSwitcher onSwitched={() => {}} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("failed to load seasons");
  });
});
