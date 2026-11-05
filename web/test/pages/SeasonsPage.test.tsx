import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SeasonsPage from "../../src/pages/SeasonsPage";

const SEASONS = [
  { id: 1, name: "Fall search", createdAt: "2026-01-01T00:00:00Z", jobCount: 12, active: false },
  { id: 2, name: "Spring search", createdAt: "2026-06-01T00:00:00Z", jobCount: 0, active: true },
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
});
