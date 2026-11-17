import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../src/context/AuthContext";
import SeasonsPage from "../../src/pages/SeasonsPage";
import type { Season } from "../../src/api/seasonsApi";

const OPEN = { closedAt: null, acceptedJobId: null, firstApplied: null, lastApplied: null };
const SEASONS: Season[] = [
  { id: 1, name: "Fall search", createdAt: "2026-01-01T00:00:00Z", jobCount: 12, active: false, ...OPEN },
  { id: 2, name: "Spring search", createdAt: "2026-06-01T00:00:00Z", jobCount: 0, active: true, ...OPEN },
];
const OFFERS = [
  { jobId: 7, company: "Initech", role: "Engineer", outcome: "OFFER_DECLINED", acceptedOn: null, startDate: null },
  { jobId: 8, company: "Globex", role: "Staff Engineer", outcome: "OFFER_ACCEPTED", acceptedOn: "2026-10-18", startDate: "2026-11-16" },
];
let summaryOffers: unknown[] = OFFERS;

const STATS = [
  { seasonId: 1, applications: 12, active: 2, heardBack: 6, interviewed: 3, offers: 1,
    firstApplied: "2026-01-05T15:00:00Z", lastApplied: "2026-03-20T15:00:00Z" },
];

let requests: { url: string; method: string; body: unknown }[] = [];
const onSeasonChanged = vi.fn();
const onSeasonsRenamed = vi.fn();

function reply(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => (body === undefined ? Promise.reject(new Error("empty")) : Promise.resolve(body)) });
}

beforeEach(() => {
  requests = [];
  summaryOffers = OFFERS;
  onSeasonChanged.mockClear();
  onSeasonsRenamed.mockClear();
  vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => {
    const method = options?.method ?? "GET";
    const body = typeof options?.body === "string" ? JSON.parse(options.body) : null;
    requests.push({ url, method, body });
    if (url === "/metrics/seasons") return reply(200, STATS);
    if (url === "/metrics/seasons/1/summary") return reply(200, { offers: summaryOffers, openApplications: 12 });
    if (url === "/seasons/1/close") return reply(200, { ...SEASONS[0], closedAt: "2026-11-11T00:00:00Z", acceptedJobId: 8 });
    if (url === "/seasons/1/reopen") return reply(200, { ...SEASONS[0], closedAt: null });
    if (url === "/seasons" && method === "GET") return reply(200, SEASONS);
    if (url === "/seasons" && method === "POST") return reply(201, { ...SEASONS[1], id: 3, ...body });
    if (method === "PATCH") return reply(200, { ...SEASONS[0], ...body });
    return reply(204, undefined);
  }));
});

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

// Inside a route with the context ProtectedRoute hands its pages.
function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/seasons"]}>
      <AuthProvider>
        <Routes>
          <Route element={<><Outlet context={{ onSeasonChanged, onSeasonsRenamed }} /><Where /></>}>
            <Route path="/seasons" element={<SeasonsPage />} />
            <Route path="*" element={null} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("SeasonsPage", () => {
  it("shows each season, newest first, with how it went", async () => {
    renderPage();

    const cards = await screen.findAllByRole("article");
    expect(cards.map(card => within(card).getByRole("heading").textContent)).toEqual(["Spring search", "Fall search"]);
    const fall = within(cards[1]);
    expect(fall.getByText("Applications").nextSibling).toHaveTextContent("12");
    expect(fall.getByText("50% of applications")).toBeInTheDocument();
    // Still open, so it runs to now; its latest application is shown on its own.
    expect(fall.getByText("Jan 5, 2026 to now")).toBeInTheDocument();
    expect(fall.getByText("Last applied Mar 20, 2026")).toBeInTheDocument();
    expect(within(cards[0]).getByText("No jobs yet")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Showing now")).toBeInTheDocument();
  });

  // A rename changes only a name: the heading updates in place and the sidebar's picker reloads, nothing else.
  it("renames a season in place", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Rename Fall search" }));
    fireEvent.change(screen.getByLabelText("New name for Fall search"), { target: { value: "Fall 2026 search" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("heading", { name: "Fall 2026 search" })).toBeInTheDocument();
    expect(requests.find(r => r.method === "PATCH")).toMatchObject({ url: "/seasons/1", body: { name: "Fall 2026 search" } });
    expect(onSeasonsRenamed).toHaveBeenCalledTimes(1);
    expect(onSeasonChanged).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Rename Spring search" }));
    fireEvent.keyDown(screen.getByLabelText("New name for Spring search"), { key: "Escape" });
    expect(screen.getByRole("heading", { name: "Spring search" })).toBeInTheDocument();
  });

  it("opens a season's Insights by switching to it first", async () => {
    renderPage();

    const fall = (await screen.findByRole("article", { name: "Fall search" }));
    fireEvent.click(within(fall).getByRole("button", { name: "See Insights" }));

    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/insights"));
    expect(requests.find(r => r.url === "/seasons/active")?.body).toEqual({ seasonId: 1 });
    expect(onSeasonChanged).toHaveBeenCalled();
  });

  // Deleting a season can never take a job with it, so the button says why before anyone clicks.
  it("deletes only an empty season, and starts a new one", async () => {
    renderPage();

    const fallDelete = await screen.findByRole("button", { name: "Delete Fall search" });
    expect(fallDelete).toBeDisabled();
    expect(fallDelete).toHaveAttribute("title", "Move or delete this season's jobs first");
    fireEvent.click(screen.getByRole("button", { name: "Delete Spring search" }));
    await waitFor(() => expect(onSeasonChanged).toHaveBeenCalledTimes(1));
    expect(requests.find(r => r.url === "/seasons/2")?.method).toBe("DELETE");

    fireEvent.change(screen.getByLabelText("Name for the new hunt"), { target: { value: "Summer search" } });
    fireEvent.click(screen.getByRole("button", { name: "Start hunt" }));
    await waitFor(() => expect(onSeasonChanged).toHaveBeenCalledTimes(2));
    expect(requests.find(r => r.url === "/seasons" && r.method === "POST")?.body).toEqual({ name: "Summer search" });
  });

  function openCloseDialog(fall: HTMLElement) {
    fireEvent.click(within(fall).getByRole("button", { name: "Close season" }));
    return screen.findByRole("region", { name: "Job search result" });
  }

  // The Offers page decides; closing only reports what it decided, so the request names no offer.
  it("closes a season reporting the offer accepted, then shows its summary", async () => {
    renderPage();
    const result = await openCloseDialog(await screen.findByRole("article", { name: "Fall search" }));

    expect(result).toHaveTextContent("You accepted Globex, Staff Engineer on Oct 18, 2026.");
    expect(result).toHaveTextContent("Starting Nov 16, 2026. You declined 1 other offer.");
    expect(result).toHaveTextContent("12 applications are still open or paused. Closing marks them Withdrawn, since the hunt is over.");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close season" }));

    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/seasons/1/summary"));
    expect(requests.find(r => r.url === "/seasons/1/close")).toMatchObject({ method: "POST", body: null });
    expect(onSeasonChanged).toHaveBeenCalled();
  });

  it("holds closing while an offer is undecided and sends you to decide it", async () => {
    summaryOffers = [{ ...OFFERS[0], outcome: "ACTIVE" }];
    renderPage();
    const result = await openCloseDialog(await screen.findByRole("article", { name: "Fall search" }));

    expect(result).toHaveTextContent("Initech, Engineer is still undecided.");
    expect(screen.getByRole("button", { name: "Close season" })).toBeDisabled();
    fireEvent.click(within(result).getByRole("button", { name: "Go to the Offers page" }));

    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/offers"));
    expect(requests.find(r => r.url === "/seasons/active")?.body).toEqual({ seasonId: 1 });
    expect(requests.find(r => r.url === "/seasons/1/close")).toBeUndefined();
  });

  it.each([
    [[OFFERS[0]], "You didn't accept an offer: you declined the one you got."],
    [[], "This hunt ended without an offer."],
  ])("says how a hunt ended without an offer taken", async (offers, said) => {
    summaryOffers = offers;
    renderPage();
    const result = await openCloseDialog(await screen.findByRole("article", { name: "Fall search" }));

    expect(result).toHaveTextContent(said);
    expect(screen.getByRole("button", { name: "Close season" })).toBeEnabled();
  });

  // The lobby leads with a new hunt, then splits the open hunts from the finished ones.
  it("leads with a new hunt, then lists hunts as Active and Past", async () => {
    SEASONS[0] = { ...SEASONS[0], closedAt: "2026-04-01T12:00:00Z" };
    try {
      renderPage();

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Start a new job hunt");
      const active = await screen.findByRole("region", { name: "Active" });
      expect(within(active).getAllByRole("article").map(card => card.getAttribute("aria-label"))).toEqual(["Spring search"]);
      const past = screen.getByRole("region", { name: "Past" });
      expect(within(past).queryByRole("button")).not.toBeInTheDocument();

      // Straight to its summary, switched to it first so the sidebar's pages are that hunt's.
      fireEvent.click(within(past).getByRole("link", { name: /Fall search/ }));
      await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/seasons/1/summary"));
      expect(requests.find(r => r.url === "/seasons/active")?.body).toEqual({ seasonId: 1 });
      expect(onSeasonChanged).toHaveBeenCalled();
    } finally {
      SEASONS[0] = { ...SEASONS[0], ...OPEN };
    }
  });
});
