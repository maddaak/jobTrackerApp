import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OfferForm from "../../src/components/offers/OfferForm";
import type { Offer } from "../../src/api/offersApi";

const offer: Offer = {
  jobId: 7, company: "Initech", role: "Senior Engineer", location: null, city: null, outcome: "ACTIVE", offerTitle: null,
  baseSalary: 150000, bonusAmount: null, bonusPercent: null, equityGrant: null, equityShares: null, sharePrice: null,
  priceGrowthPercent: null, vestingYears: null, vestingSchedule: null, vestedShares: null, signOnBonus: null, signOnByYear: [],
  signOnPaidByYear: [],
  annualBonus: null,
  equityByYear: [], equitySharesByYear: [], equityProjectedByYear: [], equityPerYear: null, averagePerYear: 150000, averagedOverYears: 1,
  compByYear: [150000], projectedCompByYear: [], startDate: null, decisionDeadline: null, notes: null,
  marketCheck: null, marketCheckStale: false, negotiationDraft: null,
};

const inDollars = () => fireEvent.click(screen.getByRole("button", { name: "Dollar value" }));

// Everything shown under one vesting year, top to bottom.
const column = (year: number) => screen.getByText(`Year ${year}`, { selector: "p" }).parentElement!.textContent;

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

const sentBody = () => JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);

async function save(onSaved = vi.fn()) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, offer));
  fireEvent.click(screen.getByRole("button", { name: "Save offer" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
}

function renderForm(initial: Offer = offer, onSaved = vi.fn()) {
  render(<OfferForm offer={initial} onSaved={onSaved} onCancel={vi.fn()} />);
  return onSaved;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("OfferForm", () => {
  it("opens with what's already known about the offer", () => {
    renderForm({ ...offer, bonusPercent: 10, equityGrant: 100000, vestingYears: 4, vestingSchedule: [5, 15, 40, 40] });

    expect(screen.getByLabelText("Base salary")).toHaveValue(150000);
    expect(screen.getByLabelText("Annual bonus")).toHaveValue(10);
    expect(screen.getByRole("button", { name: "% of base" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Annual bonus").parentElement).toHaveTextContent("%");
    expect(screen.getByLabelText("Schedule")).toHaveValue("custom");
    expect(screen.getByLabelText("Year 3 %")).toHaveValue(40);
    // A saved dollar grant reopens in dollars, not on the shares a new offer starts with.
    expect(screen.getByRole("button", { name: "Dollar value" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Total grant")).toHaveValue(100000);
  });

  // Zero would read as "no bonus" and drag the comparison down; unknown has to stay unknown.
  it("sends a blank amount as unknown, not as zero, and the rest as entered", async () => {
    const onSaved = renderForm();

    fireEvent.change(screen.getByLabelText("Decision deadline"), { target: { value: "2026-12-01" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "  remote first  " } });
    await save(onSaved);

    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("/jobs/7/offer");
    expect(sentBody()).toEqual({
      offerTitle: null, baseSalary: 150000, bonusAmount: null, bonusPercent: null, equityGrant: null,
      equityShares: null, sharePrice: null, priceGrowthPercent: null, vestingYears: null, vestingSchedule: null,
      vestedShares: null, signOnBonus: null, signOnByYear: null,
      startDate: null, decisionDeadline: "2026-12-01", notes: "remote first",
    });
  });

  it("takes the bonus as a percent of base and shows what that comes to", async () => {
    const onSaved = renderForm();

    fireEvent.change(screen.getByLabelText("Annual bonus"), { target: { value: "12.5" } });
    expect(screen.getByRole("button", { name: "Dollar amount" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "% of base" }));

    expect(screen.getByText(/18,750 a year/)).toBeInTheDocument();
    await save(onSaved);
    expect(sentBody()).toMatchObject({ bonusAmount: null, bonusPercent: 12.5 });
  });

  it("works out equity by year for an even grant, and sends no schedule for it", async () => {
    const onSaved = renderForm();

    inDollars();
    fireEvent.change(screen.getByLabelText("Total grant"), { target: { value: "100000" } });

    [1, 2, 3, 4].forEach(year => expect(column(year)).toContain("Stock value$25,000"));
    await save(onSaved);
    expect(sentBody()).toMatchObject({ equityGrant: 100000, vestingYears: 4, vestingSchedule: null });
  });

  it("takes a custom schedule, starting from an even split, and says when it doesn't add up", async () => {
    const onSaved = renderForm();

    inDollars();
    fireEvent.change(screen.getByLabelText("Total grant"), { target: { value: "90000" } });
    fireEvent.change(screen.getByLabelText("Vests over"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Schedule"), { target: { value: "custom" } });
    expect(screen.getByLabelText("Year 3 %")).toHaveValue(33.4);

    fireEvent.change(screen.getByLabelText("Year 1 %"), { target: { value: "10" } });
    expect(screen.getByText("Adds up to 76.7%, needs 100%")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Year 2 %"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Year 3 %"), { target: { value: "60" } });

    ["$9,000", "$27,000", "$54,000"].forEach((stock, i) => expect(column(i + 1)).toContain(`Stock value${stock}`));
    await save(onSaved);
    expect(sentBody()).toMatchObject({ equityGrant: 90000, vestingYears: 3, vestingSchedule: [10, 30, 60] });
  });

  // As a big-tech letter gives it: a share count, valued at a price, on a back-loaded schedule.
  it("takes a grant in shares, values it at the share price, and vests it share by share", async () => {
    const onSaved = renderForm();

    fireEvent.change(screen.getByLabelText("Shares"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText(/Share price/), { target: { value: "185" } });
    fireEvent.change(screen.getByLabelText("Schedule"), { target: { value: "custom" } });
    ["5", "15", "40", "40"].forEach((percent, i) =>
      fireEvent.change(screen.getByLabelText(`Year ${i + 1} %`), { target: { value: percent } }));

    expect(screen.getByText(/\$222,000 in all at this price/)).toBeInTheDocument();
    expect(screen.getByLabelText("Shares, year 1")).toHaveAttribute("placeholder", "60");
    expect(column(1)).toContain("Stock value$11,100");
    expect(screen.getByLabelText("Shares, year 2")).toHaveAttribute("placeholder", "180");
    expect(column(2)).toContain("Stock value$33,300");
    await save(onSaved);
    expect(sentBody()).toMatchObject({
      equityGrant: null, equityShares: 1200, sharePrice: 185, vestingYears: 4, vestingSchedule: [5, 15, 40, 40],
    });
  });

  // A letter assuming the stock rises 15% a year, compounding.
  it("projects each later vest at an assumed yearly price growth, compounding", async () => {
    const onSaved = renderForm({ ...offer, baseSalary: 185000 });

    fireEvent.change(screen.getByLabelText("Shares"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText(/Share price/), { target: { value: "185" } });
    fireEvent.change(screen.getByLabelText("Schedule"), { target: { value: "custom" } });
    ["5", "15", "40", "40"].forEach((percent, i) =>
      fireEvent.change(screen.getByLabelText(`Year ${i + 1} %`), { target: { value: percent } }));
    fireEvent.change(screen.getByLabelText(/Expected price growth/), { target: { value: "15" } });

    // Year 2 vests 180 shares at $212.75 (185 x 1.15): $38,295 on top of base.
    expect(column(2)).toContain("Total pay$218,300With 15% growth$223,295");
    expect(column(4)).toContain("Total pay$273,800With 15% growth$320,053");
    await save(onSaved);
    expect(sentBody()).toMatchObject({ equityShares: 1200, sharePrice: 185, priceGrowthPercent: 15 });
  });

  // Rounding each year alone would vest 32 of 30 shares; the form previews what core saves.
  it("vests whole shares that add up to the grant", () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Shares"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText(/Share price/), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Schedule"), { target: { value: "custom" } });
    ["5", "15", "45", "35"].forEach((percent, i) =>
      fireEvent.change(screen.getByLabelText(`Year ${i + 1} %`), { target: { value: percent } }));

    [[2, "$200"], [5, "$500"], [13, "$1,300"], [10, "$1,000"]].forEach(([shares, stock], i) => {
      expect(screen.getByLabelText(`Shares, year ${i + 1}`)).toHaveAttribute("placeholder", String(shares));
      expect(column(i + 1)).toContain(`Stock value${stock}`);
    });
  });

  // A letter's table can round its vests differently from any split of its percents; its own counts win.
  it("takes the letter's own share counts, and says when they don't add up to the grant", async () => {
    const onSaved = renderForm();

    fireEvent.change(screen.getByLabelText("Shares"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText(/Share price/), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Schedule"), { target: { value: "custom" } });
    ["5", "15", "45", "35"].forEach((percent, i) =>
      fireEvent.change(screen.getByLabelText(`Year ${i + 1} %`), { target: { value: percent } }));
    fireEvent.change(screen.getByLabelText("Shares, year 1"), { target: { value: "3" } });

    expect(column(1)).toContain("Stock value$300");
    expect(screen.getByText("Shares by year add up to 31, not the grant's 30")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Shares, year 4"), { target: { value: "9" } });
    expect(screen.queryByText(/Shares by year add up to/)).not.toBeInTheDocument();

    await save(onSaved);
    expect(sentBody()).toMatchObject({ equityShares: 30, vestedShares: [3, 5, 13, 9] });
  });

  // A back-loaded grant's letter often pays cash in the thin years, so each vesting year has its own box.
  it("takes an offset beside each vesting year, and the sign-on in year 1", async () => {
    const onSaved = renderForm();

    fireEvent.change(screen.getByLabelText("Shares"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText(/Share price/), { target: { value: "185" } });
    fireEvent.change(screen.getByLabelText("Schedule"), { target: { value: "custom" } });
    ["5", "15", "40", "40"].forEach((percent, i) =>
      fireEvent.change(screen.getByLabelText(`Year ${i + 1} %`), { target: { value: percent } }));
    fireEvent.change(screen.getByLabelText("Offset, year 1"), { target: { value: "60000" } });
    fireEvent.change(screen.getByLabelText("Offset, year 2"), { target: { value: "45000" } });
    // A sign-on as well: it lands in year 1, beside that year's offset.
    fireEvent.change(screen.getByLabelText("Sign-on bonus"), { target: { value: "10000" } });

    expect(screen.getByLabelText("Offset, year 4")).toHaveValue(null);
    expect(column(1)).toContain("Total pay$231,100");
    expect(column(2)).toContain("Total pay$228,300");
    expect(column(3)).toContain("Total pay$238,800");
    await save(onSaved);
    expect(sentBody()).toMatchObject({ signOnBonus: 10000, signOnByYear: [60000, 45000, 0, 0] });
  });

  // With no equity there's no vest to offset: just the sign-on, paid in year 1.
  it("takes a sign-on with no equity", async () => {
    const onSaved = renderForm();

    fireEvent.change(screen.getByLabelText("Sign-on bonus"), { target: { value: "40000" } });

    expect(screen.queryByLabelText("Offset, year 1")).not.toBeInTheDocument();
    expect(screen.getByText("Year 1: $190,000")).toBeInTheDocument();
    await save(onSaved);
    expect(sentBody()).toMatchObject({ signOnBonus: 40000, signOnByYear: null });
  });

  it("sends the offered title only when one is given", async () => {
    const onSaved = renderForm();

    fireEvent.change(screen.getByLabelText("Offered title"), { target: { value: "  Engineer II " } });
    await save(onSaved);

    expect(sentBody()).toMatchObject({ offerTitle: "Engineer II" });
  });

  it("keeps the form open with the reason when the save fails", async () => {
    const onSaved = renderForm();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(400, { error: "the vesting schedule adds up to 90.0%, not 100%" }));

    fireEvent.click(screen.getByRole("button", { name: "Save offer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("adds up to 90.0%");
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save offer" })).toBeEnabled();
  });

  it("cancels without saving", () => {
    const onCancel = vi.fn();
    render(<OfferForm offer={offer} onSaved={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
