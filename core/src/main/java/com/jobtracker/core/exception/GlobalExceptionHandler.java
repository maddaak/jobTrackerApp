package com.jobtracker.core.exception;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import java.io.UncheckedIOException;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(UsernameTakenException.class)
    public ResponseEntity<Map<String, String>> handleUsernameTaken(UsernameTakenException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(InvalidPasswordException.class)
    public ResponseEntity<Map<String, String>> handleInvalidPassword(InvalidPasswordException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(InvalidUsernameException.class)
    public ResponseEntity<Map<String, String>> handleInvalidUsername(InvalidUsernameException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<Map<String, String>> handleInvalidCredentials(InvalidCredentialsException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(JobNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleJobNotFound(JobNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(UnsupportedResumeTypeException.class)
    public ResponseEntity<Map<String, String>> handleUnsupportedResumeType(UnsupportedResumeTypeException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(ResumeNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleResumeNotFound(ResumeNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    // A required request header (e.g. X-User-Id) was absent. This is a client mistake, not a
    // server fault, so return 400 instead of letting it surface as a raw 500.
    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<Map<String, String>> handleMissingRequestHeader(MissingRequestHeaderException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", "missing required header: " + ex.getHeaderName()));
    }

    // Bean validation on a request body failed (a @Valid DTO field violated a constraint). This
    // is a client mistake, so return 400 with the first field error rather than letting the
    // catch-all handler below turn it into a 500.
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleMethodArgumentNotValid(MethodArgumentNotValidException ex) {
        FieldError first = ex.getBindingResult().getFieldError();
        String message = first == null
                ? "request validation failed"
                : first.getField() + " " + first.getDefaultMessage();
        return ResponseEntity.badRequest().body(Map.of("error", message));
    }

    // The request body could not be parsed (e.g. malformed JSON or an unreadable value). A bad
    // payload is the caller's problem, so return 400 instead of a raw 500.
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> handleNotReadable(HttpMessageNotReadableException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", "malformed request body"));
    }

    // A path variable or request parameter could not be converted to the expected type (e.g. a
    // non-numeric id where a Long is required). This is a client mistake, so return 400.
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, String>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid value for parameter: " + ex.getName()));
    }

    // Wraps an IOException from reading/parsing an uploaded resume (see ResumeController and
    // ResumeTextExtractor). A corrupt or unreadable upload is the caller's problem, so return
    // 422 with a generic message rather than leaking the underlying stack trace as a 500.
    @ExceptionHandler(UncheckedIOException.class)
    public ResponseEntity<Map<String, String>> handleUncheckedIO(UncheckedIOException ex) {
        return ResponseEntity.unprocessableEntity().body(Map.of("error", "could not read the uploaded file"));
    }

    // A persistence constraint was violated (e.g. a unique index). Report a 409 with a generic
    // message so the underlying SQL/constraint detail never reaches the client.
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "the request conflicts with existing data"));
    }

    // Last-resort handler so any unhandled failure returns a clean 500 instead of leaking a
    // stack trace or internal exception message to the client.
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "an unexpected error occurred"));
    }
}
