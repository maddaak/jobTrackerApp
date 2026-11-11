package com.jobtracker.core.model;

import com.jobtracker.core.exception.InvalidOfferException;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.IntStream;

import static java.util.Objects.requireNonNullElse;

// Embedded in JobDetail: only the Offers page shows it, and few jobs ever have one. Holds what the offer
// letter says; the yearly figures are worked out here so every page and the AI see the same numbers.
public class Offer {

    // Set when the offer came in under a different title or level than the posting (a downlevel): pay is
    // judged against this, not the job's role.
    private String title;
    private Integer baseSalary;
    // One or the other, as the letter states it: a dollar amount, or a percent of base.
    private Integer bonusAmount;
    private Double bonusPercent;
    private EquityGrant equity;
    // Paid once, in year 1. Offers saved before the split kept their one amount here too.
    private Integer signOnBonus;
    // The offset: cash paid in year 1, year 2, and so on beside the vesting, for the years a grant leaves thin.
    private List<Integer> signOnByYear;
    private LocalDate startDate;
    private LocalDate decisionDeadline;
    // The day it was accepted; the start date beside it is the day the job begins.
    private LocalDate acceptedOn;
    private String notes;
    private MarketCheck marketCheck;

    public static final int MAX_SIGN_ON_YEARS = EquityGrant.MAX_YEARS;

    protected Offer() {
    }

    public Offer(String title, Integer baseSalary, Integer bonusAmount, Double bonusPercent, EquityGrant equity,
            Integer signOnBonus, List<Integer> signOnByYear, LocalDate startDate, LocalDate decisionDeadline,
            String notes) {
        if (bonusAmount != null && bonusPercent != null) {
            throw new InvalidOfferException("give the bonus as an amount or a percent of base, not both");
        }
        if (signOnBonus != null && signOnBonus < 0) {
            throw new InvalidOfferException("a sign-on bonus needs an amount of 0 or more");
        }
        if (signOnByYear != null && signOnByYear.size() > MAX_SIGN_ON_YEARS) {
            throw new InvalidOfferException("a sign-on bonus can be spread over at most " + MAX_SIGN_ON_YEARS + " years");
        }
        if (signOnByYear != null && signOnByYear.stream().anyMatch(amount -> amount == null || amount < 0)) {
            throw new InvalidOfferException("each year's sign-on bonus needs an amount of 0 or more");
        }
        this.title = title == null || title.isBlank() ? null : title.trim();
        this.baseSalary = baseSalary;
        this.bonusAmount = bonusAmount;
        this.bonusPercent = bonusPercent;
        this.equity = equity;
        this.signOnBonus = signOnBonus;
        // Trailing zeros are years with nothing paid, so they'd only lengthen the year-by-year view.
        List<Integer> trimmed = signOnByYear == null ? List.of() : List.copyOf(signOnByYear);
        while (!trimmed.isEmpty() && trimmed.getLast() == 0) {
            trimmed = trimmed.subList(0, trimmed.size() - 1);
        }
        this.signOnByYear = trimmed.isEmpty() ? null : List.copyOf(trimmed);
        this.startDate = startDate;
        this.decisionDeadline = decisionDeadline;
        this.notes = notes;
    }

    public String getTitle() {
        return title;
    }

    public Integer getBaseSalary() {
        return baseSalary;
    }

    public Integer getBonusAmount() {
        return bonusAmount;
    }

    public Double getBonusPercent() {
        return bonusPercent;
    }

    public EquityGrant getEquity() {
        return equity;
    }

    public Integer getSignOnBonus() {
        return signOnBonus;
    }

    public List<Integer> signOnByYear() {
        return signOnByYear == null ? List.of() : signOnByYear;
    }

    // All cash beyond base and bonus, by the year it's paid: the sign-on is year 1's, added to that year's offset.
    public List<Integer> signOnPaidByYear() {
        List<Integer> once = signOnBonus == null ? List.of() : List.of(signOnBonus);
        List<Integer> offsets = signOnByYear();
        return IntStream.range(0, Math.max(once.size(), offsets.size()))
                .map(year -> (year < once.size() ? once.get(year) : 0) + (year < offsets.size() ? offsets.get(year) : 0))
                .boxed()
                .toList();
    }

    public Integer signOnTotal() {
        List<Integer> years = signOnPaidByYear();
        return years.isEmpty() ? null : years.stream().mapToInt(Integer::intValue).sum();
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public LocalDate getDecisionDeadline() {
        return decisionDeadline;
    }

    public String getNotes() {
        return notes;
    }

    public LocalDate getAcceptedOn() {
        return acceptedOn;
    }

    public void accept(LocalDate acceptedOn, LocalDate startDate) {
        this.acceptedOn = acceptedOn;
        this.startDate = startDate;
    }

    // The form holds no accepted day, so an edit through it carries the old one over.
    public void recordAcceptedOn(LocalDate acceptedOn) {
        this.acceptedOn = acceptedOn;
    }

    public MarketCheck getMarketCheck() {
        return marketCheck;
    }

    public void recordMarketCheck(MarketCheck marketCheck) {
        this.marketCheck = marketCheck;
    }

    // A percent with no base yet is unknown, not zero.
    public Integer annualBonus() {
        if (bonusAmount != null) return bonusAmount;
        if (bonusPercent == null || baseSalary == null) return null;
        return (int) Math.round(baseSalary * bonusPercent / 100);
    }

    public Integer equityPerYear() {
        return equity == null ? null : equity.perYear();
    }

    public List<Integer> equityByYear() {
        return equity == null ? List.of() : equity.byYear();
    }

    // As long as the vesting or the sign-on runs, and at least a year.
    public int yearsPaid() {
        return Math.max(1, Math.max(equityByYear().size(), signOnPaidByYear().size()));
    }

    // What each year actually pays: base, bonus, that year's vesting, and that year's sign-on. This is where
    // a back-loaded grant topped up by a two-year sign-on shows its real shape. Empty until anything is known.
    public List<Integer> compByYear() {
        return payByYear(equityByYear(), yearsPaid());
    }

    // The same years with each vest at the letter's assumed price growth; empty when none is assumed.
    public List<Integer> projectedCompByYear() {
        List<Integer> projected = equity == null ? List.of() : equity.projectedByYear();
        return projected.isEmpty() ? List.of() : payByYear(projected, yearsPaid());
    }

    // What offers are compared on: everything paid over the same span of years, divided by it. A sign-on counts
    // because it's what fills the years a back-loaded grant leaves thin; past an offer's own years, only base
    // and bonus continue. Null until anything is known.
    public Integer averagePerYear(int years) {
        List<Integer> pay = payByYear(equity == null ? List.of() : equity.expectedByYear(), years);
        return pay.isEmpty() ? null : (int) Math.round(pay.stream().mapToInt(Integer::intValue).average().orElseThrow());
    }

    private List<Integer> payByYear(List<Integer> equityYears, int years) {
        Integer bonus = annualBonus();
        List<Integer> signOnYears = signOnPaidByYear();
        if (baseSalary == null && bonus == null && equityYears.isEmpty() && signOnYears.isEmpty()) {
            return List.of();
        }
        int recurring = requireNonNullElse(baseSalary, 0) + requireNonNullElse(bonus, 0);
        return IntStream.range(0, years)
                .map(year -> recurring
                        + (year < equityYears.size() ? equityYears.get(year) : 0)
                        + (year < signOnYears.size() ? signOnYears.get(year) : 0))
                .boxed()
                .toList();
    }
}
