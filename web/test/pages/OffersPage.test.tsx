import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthProvider } from "../../src/context/AuthContext";
import { JobsProvider } from "../../src/context/JobsContext";
import OffersPage from "../../src/pages/OffersPage";

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

function offer(jobId: number, company: string, outcome: string, baseSalary: number | null) {
  return {
    jobId, company, role: "Engineer", location: null, outcome, offerTitle: null as string | null, baseSalary,
    bonusAmount: null, bonusPercent: null as number | null, equityGrant: null as number | null,
    vestingYears: null as number | null, vestingSchedule: null as number[] | null, vestedShares: null as number[] | null, signOnBonus: null as number | null,
    signOnByYear: [] as number[], signOnPaidByYear: [] as number[],
    equityShares: null as number | null, sharePrice: null as number | null, equitySharesByYear: [] as number[],
    priceGrowthPercent: null as number | null, equityProjectedByYear: [] as number[], projectedCompByYear: [] as number[],
    annualBonus: null as number | null, equityByYear: [] as number[], equityPerYear: null as number | null,
    averagePerYear: baseSalary, averagedOverYears: 4, compByYear: [] as number[], startDate: null, decisionDeadline: null, notes: null,
    marketCheck: null as unknown,
    marketCheckStale: false,
  };
}

function marketCheck(searched: boolean) {
  return {
    verdict: "below", typicalLow: 180000, typicalHigh: 220000, summary: "Surveys put this role higher.",
    negotiationPoints: ["Ask for a higher base."], searched,
    sources: searched ? [{ title: "Pay survey", url: "https://pay.example/survey" }] : [],
    checkedAt: "2026-10-09T12:00:00Z",
  };
}

function summary(id: number, company: string, outcome: string) {
  return {
    id, company, role: "Engineer", sourceCategory: "SELF_APPLIED", currentStage: "OFFER_STAGE",
    interviewPhase: null, boardPhase: "PANEL", outcome, url: null, location: null, compMin: null, compMax: null,
    createdAt: "2026-01-01T00:00:00Z", latestInterview: null, links: [],
  };
}

// Initech came in a level down, with a percent bonus, a back-loaded grant of shares, and a two-year sign-on.
const DOWNLEVELED = {
  ...offer(3, "Initech", "OFFER_DECLINED", 120000), offerTitle: "Engineer II", bonusPercent: 10, annualBonus: 12000,
  equityGrant: 100000, equityShares: 500, sharePrice: 200, vestingYears: 4, vestingSchedule: [5, 15, 40, 40],
  equityByYear: [5000, 15000, 40000, 40000], equitySharesByYear: [25, 75, 200, 200], equityPerYear: 25000,
  // (167,000 + 169,250 + 184,900 + 192,840) / 4: sign-on and the assumed growth both count.
  signOnByYear: [30000, 20000], signOnPaidByYear: [30000, 20000], averagePerYear: 178498, averagedOverYears: 4, compByYear: [167000, 167000, 172000, 172000],
  priceGrowthPercent: 15, projectedCompByYear: [167000, 169250, 184900, 192840],
};
const OFFERS = [offer(1, "Acme", "ACTIVE", 150000), offer(2, "Globex", "ACTIVE", null), DOWNLEVELED];
const JOBS = [summary(1, "Acme", "ACTIVE"), summary(2, "Globex", "ACTIVE"), summary(3, "Initech", "OFFER_DECLINED")];

let requests: { url: string; method: string; body: unknown }[];

const COMPARED = {
  status: "ok", recommendedJobId: 1, summary: "Acme pays more and is remote.",
  assessments: [{ jobId: 1, pros: ["Higher base"], cons: [], negotiationPoints: ["Ask for a sign-on"] }],
  priorities: "remote", createdAt: "2026-10-20T12:00:00Z",
};

// existingCheck starts Acme with a market check already saved, and savedComparison the season with a
// comparison already run; each current or stale.
function stubFetch(aiConfigured: boolean, checked = marketCheck(true), existingCheck?: { stale: boolean },
  savedComparison?: { stale: boolean }) {
  requests = [];
  let offers = existingCheck
    ? OFFERS.map(o => (o.jobId === 1 ? { ...o, marketCheck: checked, marketCheckStale: existingCheck.stale } : o))
    : OFFERS;
  vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => {
    const method = options?.method ?? "GET";
    requests.push({ url, method, body: options?.body ? JSON.parse(options.body as string) : null });
    if (url === "/auth/me") return Promise.resolve(fakeResponse(200, { username: "alice" }));
    if (url === "/ai-status") return Promise.resolve(fakeResponse(200, { aiConfigured }));
    if (url === "/offers") return Promise.resolve(fakeResponse(200, offers));
    if (url === "/jobs/1/offer/market-check" && method === "DELETE") {
      offers = offers.map(o => (o.jobId === 1 ? { ...o, marketCheck: null, marketCheckStale: false } : o));
      return Promise.resolve(fakeResponse(200, offers[0]));
    }
    if (url === "/jobs/1/offer/market-check") {
      offers = offers.map(o => (o.jobId === 1 ? { ...o, marketCheck: checked } : o));
      return Promise.resolve(fakeResponse(200, { status: "ok", offer: offers[0] }));
    }
    if (url === "/jobs") return Promise.resolve(fakeResponse(200, JOBS));
    if (url === "/offers/compare" && method === "GET") {
      return Promise.resolve(fakeResponse(200, { comparison: savedComparison ? { ...COMPARED, ...savedComparison } : null }));
    }
    if (url === "/offers/compare") return Promise.resolve(fakeResponse(200, { ...COMPARED, stale: false }));
    return Promise.resolve(fakeResponse(200, {}));
  }));
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <JobsProvider>
          <OffersPage />
        </JobsProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("OffersPage", () => {
  it("separates undecided offers from decided ones and totals what is known", async () => {
    stubFetch(false);
    renderPage();

    const undecided = (await screen.findByRole("heading", { name: "Undecided" })).closest("section")!;
    expect(within(undecided).getByText("Acme")).toBeInTheDocument();
    expect(within(undecided).getByText("Globex")).toBeInTheDocument();
    const decided = screen.getByRole("heading", { name: "Decided" }).closest("section")!;
    expect(within(decided).getByText("Initech")).toBeInTheDocument();
    expect(within(decided).getByText("Offer Declined")).toBeInTheDocument();
    // An offer with no amounts yet asks for them rather than showing a zero.
    expect(within(undecided).getByRole("button", { name: "Add details" })).toBeInTheDocument();
  });

  it("shows the title offered, a percent bonus in dollars, the grant in shares, and what each year pays", async () => {
    stubFetch(false);
    renderPage();

    const decided = (await screen.findByRole("heading", { name: "Decided" })).closest("section")!;
    expect(within(decided).getByText("Offered as Engineer II")).toBeInTheDocument();
    expect(within(decided).getByText("$12,000 (10%)")).toBeInTheDocument();
    expect(within(decided).getByText(/500 shares at \$200\.00 \(\$100,000\) over 4 years: 25 \/ 75 \/ 200 \/ 200 shares by year/))
      .toBeInTheDocument();
    expect(within(decided).getByText("$30,000 + $20,000")).toBeInTheDocument();
    const years = (label: string) => within(within(decided).getByRole("list", { name: label })).getAllByRole("listitem")
      .map(item => item.textContent);
    expect(years("Pay by year at today's price")).toEqual(["Year 1 $167,000", "Year 2 $167,000", "Year 3 $172,000", "Year 4 $172,000"]);
    expect(within(decided).getByText(/If the stock grows 15% a year, as the letter assumes \(not guaranteed\)/)).toBeInTheDocument();
    expect(years("Pay by year with the assumed growth")).toEqual(
      ["Year 1 $167,000", "Year 2 $169,250", "Year 3 $184,900", "Year 4 $192,840"]);
    // The headline is those years averaged, and says what went into it.
    expect(within(decided).getByText("$178,498")).toBeInTheDocument();
    expect(within(decided).getByText(
      "Averaged over 4 years, sign-on and offsets included, with the stock growing 15% a year as the letter assumes"))
      .toBeInTheDocument();
  });

  it("hides the AI comparison when no API key is configured", async () => {
    stubFetch(false);
    renderPage();

    await screen.findByText("Acme");
    expect(screen.queryByRole("button", { name: "Compare offers" })).not.toBeInTheDocument();
  });

  it("compares offers with the stated priorities and marks the recommendation", async () => {
    stubFetch(true);
    renderPage();

    fireEvent.change(await screen.findByLabelText("What matters most to you?"), { target: { value: "remote" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare offers" }));

    expect(await screen.findByText("Acme pays more and is remote.")).toBeInTheDocument();
    expect(screen.getByText("Recommended")).toBeInTheDocument();
    expect(screen.getByText("Ask for a sign-on")).toBeInTheDocument();
    expect(requests.find(r => r.url === "/offers/compare" && r.method === "POST")?.body).toEqual({ priorities: "remote" });
  });

  // Saved for the season, so coming back shows the last answer without paying for another.
  it("shows the last comparison with its priorities, and asks the AI nothing", async () => {
    stubFetch(true, undefined, undefined, { stale: false });
    renderPage();

    expect(await screen.findByText("Acme pays more and is remote.")).toBeInTheDocument();
    expect(screen.getByLabelText("What matters most to you?")).toHaveValue("remote");
    expect(screen.getByText("Recommended")).toBeInTheDocument();
    expect(requests.some(r => r.url === "/offers/compare" && r.method === "POST")).toBe(false);
  });

  // The verdict was about offers that have since changed, so it's kept for reference but off the cards.
  it("says when the offers changed since the last comparison, and drops its marks from the cards", async () => {
    stubFetch(true, undefined, undefined, { stale: true });
    renderPage();

    expect(await screen.findByText(/Your offers have changed since/)).toBeInTheDocument();
    expect(screen.getByText("Acme pays more and is remote.")).toBeInTheDocument();
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(screen.queryByText("Ask for a sign-on")).not.toBeInTheDocument();
  });

  it("keeps the last comparison and the typed priorities when a new one fails", async () => {
    stubFetch(true, undefined, undefined, { stale: false });
    const stubbed = vi.mocked(fetch);
    vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) =>
      url === "/offers/compare" && options?.method === "POST"
        ? Promise.resolve(fakeResponse(200, { status: "unavailable" }))
        : stubbed(url, options)));
    renderPage();
    await screen.findByText("Acme pays more and is remote.");

    fireEvent.change(screen.getByLabelText("What matters most to you?"), { target: { value: "remote, then pay" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare offers" }));

    expect(await screen.findByText(/The comparison is unavailable right now/)).toBeInTheDocument();
    expect(screen.getByText("Acme pays more and is remote.")).toBeInTheDocument();
    expect(screen.getByLabelText("What matters most to you?")).toHaveValue("remote, then pay");
  });

  it("says why the page is empty when every offer is paused", async () => {
    stubFetch(false);
    const stubbed = vi.mocked(fetch);
    vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) =>
      url === "/offers"
        ? Promise.resolve(fakeResponse(200, [offer(1, "Acme", "PAUSED", 150000)]))
        : stubbed(url, options)));
    renderPage();

    expect(await screen.findByText(/Every offer is paused/)).toBeInTheDocument();
  });

  it("records a decision picked on the card, keeping the rest of the job", async () => {
    stubFetch(false);
    renderPage();

    await screen.findByText("Acme");
    // Wait for the job list too, since deciding PATCHes back the whole job record.
    await waitFor(() => expect(requests.some(r => r.url === "/jobs")).toBe(true));
    const decision = within(screen.getByText("Acme").closest("article")!).getByLabelText("Decision");
    expect(decision).toHaveValue("ACTIVE");
    fireEvent.change(decision, { target: { value: "OFFER_ACCEPTED" } });

    await waitFor(() => expect(requests.find(r => r.method === "PATCH")).toMatchObject({
      url: "/jobs/1",
      body: { outcome: "OFFER_ACCEPTED", currentStage: "OFFER_STAGE", interviewPhase: null },
    }));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("sets a decided offer back to undecided", async () => {
    stubFetch(false);
    renderPage();

    await screen.findByText("Initech");
    await waitFor(() => expect(requests.some(r => r.url === "/jobs")).toBe(true));
    fireEvent.change(within(screen.getByText("Initech").closest("article")!).getByLabelText("Decision"), {
      target: { value: "ACTIVE" },
    });

    await waitFor(() => expect(requests.find(r => r.method === "PATCH")).toMatchObject({
      url: "/jobs/3", body: { outcome: "ACTIVE" },
    }));
  });
});

describe("OffersPage market check", () => {
  const card = async (company: string) => (await screen.findByText(company)).closest("article")! as HTMLElement;

  it("checks an offer against the market and shows what the search found", async () => {
    stubFetch(true);
    renderPage();

    fireEvent.click(await within(await card("Acme")).findByRole("button", { name: "Check the market" }));

    const result = await within(await card("Acme")).findByRole("region", { name: "Market check" });
    expect(within(result).getByText("Below market")).toBeInTheDocument();
    expect(within(result).getByText(/Researched on the web/)).toBeInTheDocument();
    expect(requests.find(r => r.url === "/jobs/1/offer/market-check")?.method).toBe("POST");

    // Opens as one line; the write-up is a click away and folds back up.
    expect(within(result).queryByText("Surveys put this role higher.")).not.toBeInTheDocument();
    fireEvent.click(within(result).getByRole("button", { name: "Show analysis" }));
    expect(within(result).getByText("Surveys put this role higher.")).toBeInTheDocument();
    expect(within(result).getByRole("link", { name: /Pay survey/ })).toHaveAttribute("href", "https://pay.example/survey");
    fireEvent.click(within(result).getByRole("button", { name: "Hide analysis" }));
    expect(within(result).queryByText("Surveys put this role higher.")).not.toBeInTheDocument();
  });

  it("says plainly when the offer has changed since its check", async () => {
    stubFetch(true, marketCheck(true), { stale: true });
    renderPage();

    const result = await within(await card("Acme")).findByRole("region", { name: "Market check" });
    expect(within(result).getByText(/Out of date: you've changed this offer's pay, title, or location/)).toBeInTheDocument();
    expect(within(result).getByRole("button", { name: "Check again" })).toBeInTheDocument();
  });

  it("removes a check after confirming", async () => {
    stubFetch(true, marketCheck(true), { stale: false });
    renderPage();

    const result = await within(await card("Acme")).findByRole("region", { name: "Market check" });
    fireEvent.click(within(result).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(requests.some(r => r.url === "/jobs/1/offer/market-check" && r.method === "DELETE")).toBe(true));
    expect(await within(await card("Acme")).findByRole("button", { name: "Check the market" })).toBeInTheDocument();
  });

  it("labels an answer from a provider that can't search as an estimate with no sources", async () => {
    stubFetch(true, marketCheck(false));
    renderPage();

    fireEvent.click(await within(await card("Acme")).findByRole("button", { name: "Check the market" }));

    const result = await within(await card("Acme")).findByRole("region", { name: "Market check" });
    expect(within(result).getByText(/estimate from the AI model's general knowledge/)).toBeInTheDocument();
    expect(within(result).queryByText("Sources")).not.toBeInTheDocument();
  });

  it("offers no new check on a decided offer", async () => {
    stubFetch(true);
    renderPage();

    await within(await card("Acme")).findByRole("button", { name: "Check the market" });
    expect(within(await card("Initech")).queryByRole("button", { name: "Check the market" })).not.toBeInTheDocument();
  });

  it("offers no check without an AI provider", async () => {
    stubFetch(false);
    renderPage();

    await card("Acme");
    expect(screen.queryByRole("button", { name: "Check the market" })).not.toBeInTheDocument();
  });
});
