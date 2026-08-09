package com.jobtracker.core.dto;

import com.jobtracker.core.model.Stage;
import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.EnumSet;
import java.util.Set;

@Documented
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = InterviewStage.Validator.class)
public @interface InterviewStage {

    String message() default "stage must be one of the interview stages";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<InterviewStage, Stage> {

        private static final Set<Stage> ALLOWED = EnumSet.of(
                Stage.INTERVIEW_REQUEST, Stage.INTERVIEW_STAGE, Stage.WAITING_INTERVIEW_RESULTS);

        @Override
        public boolean isValid(Stage value, ConstraintValidatorContext context) {
            // Null is @NotNull's job to report, not this constraint's.
            return value == null || ALLOWED.contains(value);
        }
    }
}
