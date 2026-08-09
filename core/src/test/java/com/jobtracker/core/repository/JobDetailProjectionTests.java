package com.jobtracker.core.repository;

import com.jobtracker.core.model.InterviewRound;
import com.jobtracker.core.model.InterviewType;
import com.jobtracker.core.model.Interviewer;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.JobJourney;
import com.jobtracker.core.model.Stage;
import com.jobtracker.core.support.InMemoryMongo;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

// The projection's two guarantees only hold at runtime, so they are asserted against a real Mongo
// rather than reasoned about: F71 (the JD blobs stay behind) and F74 (what comes back is not a
// JobDetail that could be saved with the projected-away fields nulled).
@SpringBootTest
class JobDetailProjectionTests {

    @DynamicPropertySource
    static void mongoProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.mongodb.uri", InMemoryMongo::connectionString);
    }

    @Autowired
    private JobDetailRepository jobDetails;

    @Test
    void projectionReturnsAJourneyRecordWithTheNestedDataIntact() {
        JobDetail detail = new JobDetail(9191L, 55L, "jd bytes".getBytes(), "interview notes");
        detail.setNotes("notes");
        detail.recordStage(Stage.RESUME_CHECK, Instant.parse("2026-01-01T00:00:00Z"), null);
        detail.recordStage(Stage.INTERVIEW_STAGE, Instant.parse("2026-01-02T00:00:00Z"), null);
        detail.addInterview(new InterviewRound(Instant.parse("2026-01-03T00:00:00Z"),
                InterviewType.SYSTEM_DESIGN, "https://meet.example", "NYC",
                List.of(new Interviewer("Dana", null))));
        jobDetails.save(detail);

        JobJourney journey = jobDetails.findJourneysByOwnerId(55L).get(0);

        // Not a JobDetail, so no cast or instanceof reaches an entity that could be saved back.
        assertThat(journey).isExactlyInstanceOf(JobJourney.class);
        assertThat(journey.jobId()).isEqualTo(9191L);
        assertThat(journey.stageHistory()).extracting(e -> e.getStage())
                .containsExactly(Stage.RESUME_CHECK, Stage.INTERVIEW_STAGE);

        InterviewRound round = journey.interviews().get(0);
        assertThat(round.getRoundId()).isNotNull();
        assertThat(round.getInterviewType()).isEqualTo(InterviewType.SYSTEM_DESIGN);
        assertThat(round.getMeetingLink()).isEqualTo("https://meet.example");
        assertThat(round.getInterviewers()).extracting(Interviewer::getName).containsExactly("Dana");
    }

    @Test
    void aDocumentWithNoHistoryOrRoundsProjectsToEmptyListsNotNulls() {
        jobDetails.save(new JobDetail(9192L, 56L, new byte[0], ""));

        JobJourney journey = jobDetails.findJourneysByOwnerId(56L).get(0);

        assertThat(journey.stageHistory()).isEmpty();
        assertThat(journey.interviews()).isEmpty();
    }
}
