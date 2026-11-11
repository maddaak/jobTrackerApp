import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SeasonsPage from "../../src/pages/SeasonsPage";
import type { Season } from "../../src/api/seasonsApi";

const OPEN = { closedAt: null, acceptedJobId: null, firstApplied: null, lastApplied: null };
const SEASONS: Season[] = [
  { id: 1, name: "Fall search", createdAt: "2026-01-01T00:00:00Z", jobCount: 12, active: false, ...OPEN },
  { id: 2, name: "Spring search", createdAt: "2026-06-01T00:00:00Z", jobCount: 0, active: true, ...OPEN },
];
const OFFERS = [
  { jobId: 7, company: "Initech", role: "Engineer", accepted: false, acceptedOn: null, startDate: null },
  { jobId: 8, company: "Globex", role: "Staff Engineer", accepted: true, acceptedOn: "2026-10-18", startDate: "2026-11-16" },
];

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
  onSeasonChanged.mockClear();
  onSeasonsRenamed.mockClear();
  vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => {
    const method = options?.method ?? "GET";
    const body = typeof options?.body === "string" ? JSON.parse(options.body) : null;
    requests.push({ url, method, body });
    if (url === "/metrics/seasons") return reply(200, STATS);
    if (url === "/metrics/seasons/1/summary") return reply(200, { offers: OFFERS });
    if (url === "/seasons/1/close") return reply(200, { ...SEASONS[0], closedAt: "2026-11-11T00:00:00Z", ...body });
    if (url.endsWith("/offer/acceptance")) return reply(200, {});
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
      <Routes>
        <Route element={<><Outlet context={{ onSeasonChanged, onSeasonsRenamed }} /><Where /></>}>
          <Route path="/seasons" element={<SeasonsPage />} />
          <Route path="*" element={null} />
        </Route>
      </Routes>
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

    fireEvent.click(screen.getByRole("button", { name: "+ Start a new season" }));
    fireEvent.change(screen.getByLabelText("Name for the new season"), { target: { value: "Summer search" } });
    fireEvent.click(screen.getByRole("button", { name: "Start season" }));
    await waitFor(() => expect(onSeasonChanged).toHaveBeenCalledTimes(2));
    expect(requests.find(r => r.url === "/seasons" && r.method === "POST")?.body).toEqual({ name: "Summer search" });
  });

  // The offer already accepted is the likely answer, with the days the Offers page saved on it. A change here
  // goes back to the offer, so there's one accepted day and one start date.
  it("closes a season with the offer taken, starting from the days saved on it, then shows its summary", async () => {
    renderPage();
    const fall = await screen.findByRole("article", { name: "Fall search" });

    fireEvent.click(within(fall).getByRole("button", { name: "Close season" }));
    const offer = await screen.findByLabelText("Offer you accepted");
    await waitFor(() => expect(offer).toHaveValue("8"));
    expect(screen.getByLabelText("Day you accepted")).toHaveValue("2026-10-18");
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-11-16");
    fireEvent.change(screen.getByLabelText("Day you accepted"), { target: { value: "2026-10-20" } });
    fireEvent.click(screen.getByRole("button", { name: "Close season" }));

    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/seasons/1/summary"));
    expect(requests.find(r => r.url === "/jobs/8/offer/acceptance")).toMatchObject({
      method: "PUT", body: { acceptedOn: "2026-10-20", startDate: "2026-11-16" },
    });
    expect(requests.find(r => r.url === "/seasons/1/close")?.body).toEqual({ acceptedJobId: 8 });
    expect(onSeasonChanged).toHaveBeenCalled();
  });

  // An offer with nothing saved yet starts the day accepted at today and leaves the start date blank.
  it("starts an offer with no days yet at today", async () => {
    renderPage();
    fireEvent.click(within(await screen.findByRole("article", { name: "Fall search" })).getByRole("button", { name: "Close season" }));
    await waitFor(() => expect(screen.getByLabelText("Offer you accepted")).toHaveValue("8"));

    fireEvent.change(screen.getByLabelText("Offer you accepted"), { target: { value: "7" } });

    expect((screen.getByLabelText("Day you accepted") as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(screen.getByLabelText("Start date")).toHaveValue("");
  });

  it("closes without an offer, touching no offer", async () => {
    renderPage();
    const fall = await screen.findByRole("article", { name: "Fall search" });

    fireEvent.click(within(fall).getByRole("button", { name: "Close season" }));
    await waitFor(() => expect(screen.getByLabelText("Offer you accepted")).toHaveValue("8"));
    fireEvent.change(screen.getByLabelText("Offer you accepted"), { target: { value: "" } });
    expect(screen.queryByLabelText("Day you accepted")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close season" }));

    await waitFor(() => expect(requests.find(r => r.url === "/seasons/1/close")?.body).toEqual({ acceptedJobId: null }));
    expect(requests.find(r => r.url.endsWith("/offer/acceptance"))).toBeUndefined();
  });

  // A closed season offers its summary and Edit, which reopens it, instead of closing again.
  it("shows a closed season as closed, with its summary and an Edit that reopens it", async () => {
    SEASONS[0] = { ...SEASONS[0], closedAt: "2026-04-01T12:00:00Z" };
    try {
      renderPage();
      const fall = await screen.findByRole("article", { name: "Fall search" });

      expect(within(fall).getByText(/^Closed /)).toBeInTheDocument();
      expect(within(fall).queryByRole("button", { name: "Close season" })).not.toBeInTheDocument();
      fireEvent.click(within(fall).getByRole("button", { name: "Edit Fall search" }));

      await waitFor(() => expect(requests.find(r => r.url === "/seasons/1/reopen")?.method).toBe("POST"));
      await waitFor(() => expect(within(fall).getByRole("button", { name: "Close season" })).toBeInTheDocument());
      expect(onSeasonChanged).toHaveBeenCalled();
    } finally {
      SEASONS[0] = { ...SEASONS[0], ...OPEN };
    }
  });
});
