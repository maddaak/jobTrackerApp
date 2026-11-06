package com.jobtracker.core.controller;

import com.jobtracker.core.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(HealthController.class)
class UnknownRouteTests {

    @Autowired
    private MockMvc mockMvc;

    // The session filter loads with every web slice and reads accounts; this slice has no database.
    @MockitoBean
    private UserRepository users;

    // The catch-all 500 handler used to swallow this, so a typo'd path looked like a server fault.
    @Test
    void anUnknownRouteIsNotFoundNotAServerError() throws Exception {
        mockMvc.perform(get("/no-such-route").header("X-Internal-Token", "test-internal-token"))
            .andExpect(status().isNotFound())
            .andExpect(content().json("{\"error\":\"not found\"}"));
    }
}
