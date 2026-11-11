package com.jobtracker.core.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(OutputCaptureExtension.class)
class RequestLoggingTests {

    private void run(String path, int status) throws Exception {
        new RequestLogging().doFilter(new MockHttpServletRequest("GET", path), new MockHttpServletResponse(),
                (request, response) -> ((MockHttpServletResponse) response).setStatus(status));
    }

    // The point: a 500 that reaches the browser as "an unexpected error occurred" names its call in the log.
    @Test
    void logsAServerErrorWithItsMethodAndPath(CapturedOutput output) throws Exception {
        run("/jobs/7/detail", 500);

        assertThat(output).contains("GET /jobs/7/detail -> 500");
    }

    // Everyday traffic stays out of the log, so the lines that are there stand out.
    @Test
    void staysQuietForAnOrdinaryRequest(CapturedOutput output) throws Exception {
        run("/jobs", 200);
        run("/jobs/9", 404);

        assertThat(output).doesNotContain("/jobs");
    }
}
