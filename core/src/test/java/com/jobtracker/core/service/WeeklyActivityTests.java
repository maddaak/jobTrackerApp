package com.jobtracker.core.service;

import com.jobtracker.core.dto.WeeklyActivity;
import com.jobtracker.core.model.InterviewRound;
import com.jobtracker.core.model.InterviewType;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.SourceCategory;
import com.jobtracker.core.model.Stage;
import com.jobtracker.core.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class WeeklyActivityTests {

    // A Wednesday, so its week began on Monday the 12th.
    private static final Instant NOW = Instant.parse("2026-10-14T12:00:00Z");

    private static Job appliedAt(long id, Instant at) {
        Job job = new Job("Initech", "Engineer", new User("owner", "hash"), SourceCategory.SELF_APPLIED,
                null, null, null, null);
        job.restoreState(Stage.RESUME_CHECK, null, Outcome.ACTIVE, at);
        ReflectionTestUtils.setField(job, "id", id);
        return job;
    }

    private static InterviewRound roundAt(Instant at) {
        return new InterviewRound(at, null, InterviewType.BEHAVIOR, null, null, List.of());
    }

    @Test
    void eachWeekCountsWhatWasSentAndHeldInIt() {
        Job thisWeek = appliedAt(1, Instant.parse("2026-10-12T00:30:00Z"));
        Job lastSunday = appliedAt(2, Instant.parse("2026-10-11T23:30:00Z"));
        Job tooOld = appliedAt(3, NOW.minus(Duration.ofDays(7L * MetricsService.ACTIVITY_WEEKS)));
        Map<Long, List<InterviewRound>> rounds = Map.of(1L, List.of(
                roundAt(Instant.parse("2026-10-13T15:00:00Z")),
                // Not held yet, so not counted.
                roundAt(NOW.plus(Duration.ofDays(1)))));

        List<WeeklyActivity> weeks = MetricsService.weeklyActivity(List.of(thisWeek, lastSunday, tooOld), rounds, NOW);

        assertThat(weeks).hasSize(MetricsService.ACTIVITY_WEEKS);
        assertThat(weeks.get(weeks.size() - 1)).isEqualTo(new WeeklyActivity(LocalDate.parse("2026-10-12"), 1, 1));
        assertThat(weeks.get(weeks.size() - 2)).isEqualTo(new WeeklyActivity(LocalDate.parse("2026-10-05"), 1, 0));
        assertThat(weeks.get(0).weekStart()).isEqualTo(LocalDate.parse("2026-10-12").minusWeeks(MetricsService.ACTIVITY_WEEKS - 1));
        assertThat(weeks.stream().mapToInt(WeeklyActivity::applications).sum()).isEqualTo(2);
    }
}
