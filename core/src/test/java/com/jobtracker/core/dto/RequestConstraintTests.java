package com.jobtracker.core.dto;

import com.jobtracker.core.model.InterviewType;
import com.jobtracker.core.model.Resume;
import com.jobtracker.core.model.Stage;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

// These constraints are the only thing stopping a direct API call from doing what the UI forbids,
// so they are worth pinning independently of any controller.
class RequestConstraintTests {

    private static Validator validator;

    @BeforeAll
    static void setUp() {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            validator = factory.getValidator();
        }
    }

    private CreateInterviewRequest interviewAt(Stage stage) {
        return new CreateInterviewRequest(1L, stage, Instant.parse("2026-08-01T18:00:00Z"),
                InterviewType.SYSTEM_DESIGN, null, null, List.of());
    }

    @Test
    void interviewStageAcceptsOnlyTheThreeInterviewStages() {
        for (Stage allowed : List.of(Stage.INTERVIEW_REQUEST, Stage.INTERVIEW_STAGE, Stage.WAITING_INTERVIEW_RESULTS)) {
            assertThat(validator.validate(interviewAt(allowed))).isEmpty();
        }
    }

    @Test
    void interviewStageRejectsStagesThatWouldJumpThePipeline() {
        // createInterview calls advanceStageIfFurther, so these would move the job without an interview.
        for (Stage rejected : List.of(Stage.RESUME_CHECK, Stage.OFFER_STAGE, Stage.FINALIZED)) {
            assertThat(validator.validate(interviewAt(rejected)))
                    .as("stage %s", rejected)
                    .isNotEmpty();
        }
    }

    @Test
    void interviewTypeIsRequiredOnCreateAndUpdate() {
        var create = new CreateInterviewRequest(1L, Stage.INTERVIEW_STAGE,
                Instant.parse("2026-08-01T18:00:00Z"), null, null, null, List.of());
        assertThat(validator.validate(create)).isNotEmpty();

        var update = new UpdateInterviewRequest(Instant.parse("2026-08-01T18:00:00Z"), null, null, null, List.of());
        assertThat(validator.validate(update)).isNotEmpty();
    }

    @Test
    void analysisStatusAcceptsOnlyTheKnownConstants() {
        for (String allowed : List.of(Resume.AnalysisStatus.PENDING, Resume.AnalysisStatus.OK,
                Resume.AnalysisStatus.NOT_CONFIGURED, Resume.AnalysisStatus.UNAVAILABLE)) {
            assertThat(validator.validate(new ApplyResumeAnalysisRequest("{}", allowed, "AI"))).isEmpty();
        }
    }

    @Test
    void analysisStatusRejectsWrongCaseAndUnknownValues() {
        // "OK" stored fine before and then made the resume invisible to the recommender, because
        // AnalysisStatus.OK.equals(...) is case-sensitive.
        for (String rejected : List.of("OK", "Ok", "done", "")) {
            assertThat(validator.validate(new ApplyResumeAnalysisRequest("{}", rejected, "AI")))
                    .as("status %s", rejected)
                    .isNotEmpty();
        }
        assertThat(validator.validate(new ApplyResumeAnalysisRequest("{}", null, "AI"))).isNotEmpty();
    }
}
