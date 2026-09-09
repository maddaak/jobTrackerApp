package com.jobtracker.core.exception;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// The catch-all shadows any framework exception without a handler of its own, turning a 4xx into a 500.
class GlobalExceptionHandlerTests {

    @RestController
    static class ThrowingController {
        private Exception toThrow;

        @GetMapping("/boom")
        String boom() throws Exception {
            throw toThrow;
        }
    }

    @Test
    void frameworkExceptionsKeepTheirOwnStatusRatherThanFallingThroughTo500() throws Exception {
        Map<Exception, HttpStatus> expected = new LinkedHashMap<>();
        expected.put(new MaxUploadSizeExceededException(10L), HttpStatus.PAYLOAD_TOO_LARGE);
        expected.put(new MissingServletRequestPartException("file"), HttpStatus.BAD_REQUEST);
        expected.put(new MissingServletRequestParameterException("enteredAt", "Instant"), HttpStatus.BAD_REQUEST);
        expected.put(new HttpRequestMethodNotSupportedException("PATCH"), HttpStatus.METHOD_NOT_ALLOWED);
        expected.put(new HttpMediaTypeNotSupportedException("text/plain"), HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        expected.put(new UncheckedIOException(new IOException("unreadable")), HttpStatus.UNPROCESSABLE_ENTITY);
        expected.put(new DataIntegrityViolationException("duplicate"), HttpStatus.CONFLICT);

        ThrowingController controller = new ThrowingController();
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();

        for (Map.Entry<Exception, HttpStatus> entry : expected.entrySet()) {
            controller.toThrow = entry.getKey();
            mockMvc.perform(get("/boom"))
                    .andExpect(status().is(entry.getValue().value()))
                    // The message is ours, so no framework detail reaches the client.
                    .andExpect(jsonPath("$.error").exists());
        }
    }
}
