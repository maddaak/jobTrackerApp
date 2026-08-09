package com.jobtracker.core.dto;

import com.jobtracker.core.model.Resume;
import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.Set;

@Documented
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = AnalysisStatusValue.Validator.class)
public @interface AnalysisStatusValue {

    String message() default "status must be one of the known analysis statuses";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<AnalysisStatusValue, String> {

        private static final Set<String> ALLOWED = Set.of(
                Resume.AnalysisStatus.PENDING, Resume.AnalysisStatus.OK,
                Resume.AnalysisStatus.NOT_CONFIGURED, Resume.AnalysisStatus.UNAVAILABLE);

        @Override
        public boolean isValid(String value, ConstraintValidatorContext context) {
            // Null is @NotNull's job to report, not this constraint's.
            return value == null || ALLOWED.contains(value);
        }
    }
}
