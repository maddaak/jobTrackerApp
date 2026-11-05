package com.jobtracker.core.model;

import com.jobtracker.core.exception.InvalidOfferException;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.stream.IntStream;

import static java.util.Objects.requireNonNullElse;

// A grant's total value, the years it vests over, and the percent vesting each year. No schedule means
// even; a back-loaded one (5/15/40/40) pays far less in year one than its average says. A grant given as
// shares keeps the count and the price it was valued at, and value is their product. growthPercent is the
// yearly share-price rise a letter assumes; null when none was given. vestedShares, optional, is the
// letter's own count for each year: letters round their vests in ways no percent rule reproduces.
public record EquityGrant(int value, int years, List<Double> schedule, Integer shares, Double sharePrice,
        Double growthPercent, List<Integer> vestedShares) {

    public static final int MAX_YEARS = 10;
    public static final double MAX_GROWTH_PERCENT = 100;
    // Room for percents typed to one decimal, such as 33.3 three times.
    private static final double SUM_TOLERANCE = 0.5;

    public EquityGrant {
        if (growthPercent != null && (growthPercent < 0 || growthPercent > MAX_GROWTH_PERCENT)) {
            throw new InvalidOfferException("expected price growth must be 0 to " + (int) MAX_GROWTH_PERCENT + "% a year");
        }
        // Zero growth projects nothing different, so it's stored as none.
        if (growthPercent != null && growthPercent == 0) {
            growthPercent = null;
        }
        if (years < 1 || years > MAX_YEARS) {
            throw new InvalidOfferException("equity must vest over 1 to " + MAX_YEARS + " years");
        }
        if (schedule != null) {
            if (schedule.size() != years) {
                throw new InvalidOfferException("the vesting schedule needs one percent for each of its " + years + " years");
            }
            if (schedule.stream().anyMatch(percent -> percent == null || percent < 0)) {
                throw new InvalidOfferException("each year of the vesting schedule needs a percent of 0 or more");
            }
            double sum = schedule.stream().mapToDouble(Double::doubleValue).sum();
            if (Math.abs(sum - 100) > SUM_TOLERANCE) {
                throw new InvalidOfferException("the vesting schedule adds up to " + sum + "%, not 100%");
            }
            schedule = List.copyOf(schedule);
        }
        if (vestedShares != null) {
            if (shares == null) {
                throw new InvalidOfferException("shares by year need a grant given in shares");
            }
            if (vestedShares.size() != years) {
                throw new InvalidOfferException("shares by year need one count for each of its " + years + " years");
            }
            if (vestedShares.stream().anyMatch(count -> count == null || count < 0)) {
                throw new InvalidOfferException("each year needs a share count of 0 or more");
            }
            int sum = vestedShares.stream().mapToInt(Integer::intValue).sum();
            if (sum != shares) {
                throw new InvalidOfferException("shares by year add up to " + sum + ", not the grant's " + shares);
            }
            vestedShares = List.copyOf(vestedShares);
        }
    }

    // A grant stated in dollars, with no growth assumed.
    public EquityGrant(int value, int years, List<Double> schedule) {
        this(value, years, schedule, null, null, null, null);
    }

    // A grant stated in shares, as most letters for public companies give it. Valued at the price given,
    // so a later price change is a matter of editing that one number.
    public static EquityGrant ofShares(int shares, double sharePrice, int years, List<Double> schedule,
            Double growthPercent, List<Integer> vestedShares) {
        if (shares <= 0 || sharePrice <= 0) {
            throw new InvalidOfferException("a grant in shares needs a share count and a share price above 0");
        }
        return new EquityGrant((int) Math.round(shares * sharePrice), years, schedule, shares, sharePrice,
                growthPercent, vestedShares);
    }

    // Each year's vest at today's price.
    public List<Integer> byYear() {
        return grownBy(0);
    }

    // Each year's vest at the letter's assumed growth. Empty when none is assumed, so the page shows no projection.
    public List<Integer> projectedByYear() {
        return growthPercent == null ? List.of() : grownBy(growthPercent);
    }

    // What offers are compared on: the letter's own assumption, which is no growth when it states none.
    public List<Integer> expectedByYear() {
        return grownBy(requireNonNullElse(growthPercent, 0.0));
    }

    // Year 1 at today's price, year 2 at (1 + growth) times it, compounding. A grant in dollars vests dollars;
    // one in shares vests whole shares, each at that year's price to the cent, as letters quote it.
    private List<Integer> grownBy(double percent) {
        double rise = 1 + percent / 100;
        List<Integer> units = shares == null ? yearly(value) : sharesByYear();
        return IntStream.range(0, units.size())
                .mapToObj(year -> {
                    double grown = Math.pow(rise, year);
                    double unitPrice = shares == null ? grown : Math.round(sharePrice * grown * 100) / 100.0;
                    return (int) Math.round(units.get(year) * unitPrice);
                })
                .toList();
    }

    // Shares vesting each year: the letter's counts when given, else split by the schedule. Empty for dollars.
    public List<Integer> sharesByYear() {
        if (shares == null) return List.of();
        return vestedShares != null ? vestedShares : yearly(shares);
    }

    // The grant spread evenly, as pay sites quote equity; the market check compares on it, offers don't.
    public int perYear() {
        return (int) Math.round((double) value / years);
    }

    // Rounding each year on its own can vest more than the grant (30 shares at 5/15/45/35 gave 32). So each year
    // gets its whole part, and the units left over go to the largest fractions, earlier years first on a tie.
    private List<Integer> yearly(int total) {
        List<Double> percents = schedule != null ? schedule : Collections.nCopies(years, 100.0 / years);
        double[] exact = percents.stream().mapToDouble(percent -> total * percent / 100).toArray();
        int[] whole = Arrays.stream(exact).mapToInt(amount -> (int) Math.floor(amount)).toArray();
        long left = Math.round(Arrays.stream(exact).sum()) - Arrays.stream(whole).sum();
        IntStream.range(0, exact.length).boxed()
                .sorted(Comparator.comparingLong(year -> -Math.round((exact[year] - whole[year]) * 1_000_000)))
                .limit(Math.max(0, left))
                .forEach(year -> whole[year]++);
        return Arrays.stream(whole).boxed().toList();
    }
}
