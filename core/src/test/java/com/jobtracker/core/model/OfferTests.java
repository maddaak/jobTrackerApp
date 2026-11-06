package com.jobtracker.core.model;

import com.jobtracker.core.exception.InvalidOfferException;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OfferTests {

    private static Offer offer(Integer base, Integer bonusAmount, Double bonusPercent, EquityGrant equity) {
        return new Offer(null, base, bonusAmount, bonusPercent, equity, null, null, null, null, null);
    }

    @Test
    void aBonusIsTheAmountGivenOrItsPercentOfBase() {
        assertThat(offer(150000, 20000, null, null).annualBonus()).isEqualTo(20000);
        assertThat(offer(150000, null, 12.5, null).annualBonus()).isEqualTo(18750);
        assertThat(offer(null, null, 10.0, null).annualBonus()).as("no base yet: unknown, not zero").isNull();
    }

    @Test
    void evenVestingSplitsTheGrantEquallyAndABackLoadedOneSaysSo() {
        assertThat(new EquityGrant(100000, 4, null).byYear()).containsExactly(25000, 25000, 25000, 25000);
        EquityGrant backLoaded = new EquityGrant(100000, 4, List.of(5.0, 15.0, 40.0, 40.0));
        assertThat(backLoaded.byYear()).containsExactly(5000, 15000, 40000, 40000);
        assertThat(backLoaded.perYear()).isEqualTo(25000);
        assertThat(new EquityGrant(100000, 3, List.of(33.3, 33.3, 33.4)).byYear()).containsExactly(33300, 33300, 33400);
    }

    private record Shape(String name, Offer offer, int averageOverFourYears) {
    }

    // One formula for every shape of offer: all pay over the same four years, at the letter's growth, divided by four.
    @Test
    void everyShapeOfOfferIsAveragedOverTheSameYears() {
        List<Shape> shapes = List.of(
                new Shape("back-loaded shares, two-year sign-on, 15% growth", new Offer(null, 185000, null, null,
                        EquityGrant.ofShares(1200, 185.0, 4, List.of(5.0, 15.0, 40.0, 40.0), 15.0, null), null,
                        List.of(60000, 45000), null, null, null), 286721), // (256,100 + 268,295 + 302,437 + 320,053) / 4
                new Shape("even vest, no sign-on", offer(150000, null, 10.0, new EquityGrant(100000, 4, null)), 190000),
                new Shape("even vest, a sign-on and a year-one offset", new Offer(null, 150000, null, null,
                        new EquityGrant(100000, 4, null), 20000, List.of(10000), null, null, null), 182500),
                new Shape("nothing vests in year one", offer(100000, null, null,
                        new EquityGrant(80000, 4, List.of(0.0, 50.0, 25.0, 25.0))), 120000),
                new Shape("dollar grant over two years, 10% growth", offer(100000, null, null,
                        new EquityGrant(40000, 2, null, null, null, 10.0, null)), (400000 + 20000 + 22000) / 4),
                new Shape("base and a one-time sign-on", new Offer(null, 220000, null, null, null, 40000, null,
                        null, null, null), 230000),
                new Shape("base only", offer(150000, null, null, null), 150000));

        for (Shape shape : shapes) {
            assertThat(shape.offer().averagePerYear(4)).as(shape.name()).isEqualTo(shape.averageOverFourYears());
        }
    }

    @Test
    void anOfferWithNothingRecordedHasNoFigures() {
        Offer empty = offer(null, null, null, null);
        assertThat(empty.averagePerYear(4)).isNull();
        assertThat(empty.equityByYear()).isEmpty();
        assertThat(empty.compByYear()).isEmpty();
    }

    // A letter gives a share count; the grant is worth it at the price given, and vests by the same schedule.
    @Test
    void aGrantInSharesIsValuedAtItsPriceAndVestsShareByShare() {
        EquityGrant grant = EquityGrant.ofShares(1200, 185.0, 4, List.of(5.0, 15.0, 40.0, 40.0), null, null);

        assertThat(grant.value()).isEqualTo(222000);
        assertThat(grant.sharesByYear()).containsExactly(60, 180, 480, 480);
        assertThat(grant.byYear()).containsExactly(11100, 33300, 88800, 88800);
        assertThat(new EquityGrant(100000, 4, null).sharesByYear()).as("a grant in dollars").isEmpty();
    }

    // The point of splitting the sign-on: years 1 and 2 are topped up while a back-loaded grant vests slowly.
    @Test
    void eachYearPaysBaseBonusThatYearsVestingAndThatYearsSignOn() {
        Offer backLoaded = new Offer(null, 185000, null, null,
                EquityGrant.ofShares(1200, 185.0, 4, List.of(5.0, 15.0, 40.0, 40.0), null, null), null,
                List.of(60000, 45000, 0), null, null, null);

        assertThat(backLoaded.compByYear()).containsExactly(256100, 263300, 273800, 273800);
        assertThat(backLoaded.signOnByYear()).as("a trailing zero year is dropped").containsExactly(60000, 45000);
        assertThat(backLoaded.signOnTotal()).isEqualTo(105000);
        assertThat(new Offer(null, 100000, null, null, null, null, List.of(10000, 5000, 5000), null, null, null).compByYear())
                .as("a sign-on longer than any equity still gets its years").containsExactly(110000, 105000, 105000);
    }

    // Only whole shares vest. Rounding each year alone vests 32 of these 30 shares (2/5/14/11); the
    // leftover units go to the largest fractions, earlier years first.
    @Test
    void wholeSharesVestAndAddUpToTheGrant() {
        EquityGrant grant = EquityGrant.ofShares(30, 100.0, 4, List.of(5.0, 15.0, 45.0, 35.0), null, null);

        assertThat(grant.sharesByYear()).containsExactly(2, 5, 13, 10);
        assertThat(grant.byYear()).as("valued share by share").containsExactly(200, 500, 1300, 1000);
        assertThat(new EquityGrant(30, 4, List.of(5.0, 15.0, 45.0, 35.0)).byYear()).as("dollars split the same way")
                .containsExactly(2, 5, 13, 10);
    }

    // A letter's own counts can differ from any split of its percents by a share or two; given, they're used as is.
    @Test
    void aLettersOwnShareCountsOverrideTheSplit() {
        EquityGrant grant = EquityGrant.ofShares(100, 50.0, 4, List.of(5.0, 15.0, 45.0, 35.0), 10.0, List.of(6, 16, 44, 34));

        assertThat(grant.sharesByYear()).containsExactly(6, 16, 44, 34);
        assertThat(grant.byYear()).containsExactly(300, 800, 2200, 1700);
        // Year 3: 44 shares at $60.50 (50 x 1.1 squared).
        assertThat(grant.projectedByYear()).containsExactly(300, 880, 2662, 2263);

        List<List<Integer>> wrong = List.of(List.of(6, 16, 44, 30), List.of(50, 50));
        for (List<Integer> counts : wrong) {
            assertThatThrownBy(() -> EquityGrant.ofShares(100, 50.0, 4, null, null, counts))
                    .as(counts.toString()).isInstanceOf(InvalidOfferException.class);
        }
        assertThatThrownBy(() -> new EquityGrant(5000, 4, null, null, null, null, List.of(1, 1, 1, 1)))
                .as("a grant in dollars").isInstanceOf(InvalidOfferException.class);
    }

    // A letter assuming 15% a year compounds it: year 2's vest at 1.15 times today's price, year 3's at 1.15
    // squared, each price to the cent. Today's figures are left as they are.
    @Test
    void anAssumedPriceGrowthCompoundsEachLaterVestAndLeavesTodaysFiguresAlone() {
        Offer offer = new Offer(null, 185000, null, null,
                EquityGrant.ofShares(1200, 185.0, 4, List.of(5.0, 15.0, 40.0, 40.0), 15.0, null), null,
                List.of(60000, 45000), null, null, null);

        // Year 3 is 480 shares at $244.66 (185 x 1.15 squared, to the cent).
        assertThat(offer.getEquity().projectedByYear()).containsExactly(11100, 38295, 117437, 135053);
        assertThat(offer.projectedCompByYear()).containsExactly(256100, 268295, 302437, 320053);
        assertThat(offer.compByYear()).as("today's price, unchanged").containsExactly(256100, 263300, 273800, 273800);
        assertThat(offer.equityPerYear()).isEqualTo(55500);
    }

    @Test
    void noGrowthProjectsNothing() {
        assertThat(EquityGrant.ofShares(100, 10.0, 4, null, 0.0, null).growthPercent()).isNull();
        assertThat(new EquityGrant(40000, 4, null).projectedByYear()).isEmpty();
        assertThat(offer(100000, null, null, new EquityGrant(40000, 4, null)).projectedCompByYear()).isEmpty();
    }

    // The sign-on is paid in year 1, on top of that year's offset. Offers saved before the split stored
    // their one amount the same way, so they read unchanged.
    @Test
    void theSignOnIsPaidInYearOneBesideTheOffsets() {
        Offer offer = new Offer(null, 150000, null, null, null, 20000, List.of(10000, 5000), null, null, null);

        assertThat(offer.signOnPaidByYear()).containsExactly(30000, 5000);
        assertThat(offer.signOnTotal()).isEqualTo(35000);
        assertThat(offer.compByYear()).containsExactly(180000, 155000);
        assertThatThrownBy(() -> new Offer(null, 150000, null, null, null, -1, null, null, null, null))
                .isInstanceOf(InvalidOfferException.class);
    }
}
