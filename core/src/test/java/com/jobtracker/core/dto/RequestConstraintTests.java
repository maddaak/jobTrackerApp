package com.jobtracker.core.dto;

import com.jobtracker.core.model.InterviewType;
import com.jobtracker.core.model.Resume;
import com.jobtracker.core.model.SourceCategory;
import com.jobtracker.core.model.Stage;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

// The only thing stopping a direct API call from doing what the UI forbids, so pinned on their own.
class RequestConstraintTests {

    private static Validator validator;

    @BeforeAll
    static void setUp() {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            validator = factory.getValidator();
        }
    }

    @Test
    void aNewJobCanOnlyStartAsAppliedOrContacted() {
        for (Stage stage : Stage.values()) {
            var request = new CreateJobRequest("Acme", "Engineer", SourceCategory.SELF_APPLIED,
                    null, null, null, null, null, null, stage, null, null);
            boolean allowed = stage == Stage.RESUME_CHECK || stage == Stage.INTERVIEW_REQUEST;
            assertThat(validator.validate(request).isEmpty()).as("stage %s", stage).isEqualTo(allowed);
        }
    }

    @Test
    void interviewTypeIsRequiredOnCreateAndUpdate() {
        var create = new CreateInterviewRequest(1L,
                Instant.parse("2026-08-01T18:00:00Z"), null, null, null, null, List.of());
        assertThat(validator.validate(create)).isNotEmpty();

        var update = new UpdateInterviewRequest(Instant.parse("2026-08-01T18:00:00Z"), null, null, null, null, List.of());
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
        // AnalysisStatus.OK.equals is case-sensitive, so "OK" stored fine and then hid the resume.
        for (String rejected : List.of("OK", "Ok", "done", "")) {
            assertThat(validator.validate(new ApplyResumeAnalysisRequest("{}", rejected, "AI")))
                    .as("status %s", rejected)
                    .isNotEmpty();
        }
        assertThat(validator.validate(new ApplyResumeAnalysisRequest("{}", null, "AI"))).isNotEmpty();
    }
}
