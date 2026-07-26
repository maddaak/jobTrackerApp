package com.jobtracker.core.controller;

import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class MetricsControllerTests {

    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String INTERNAL_TOKEN_VALUE = "test-internal-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository users;

    private Long createUser(String username) {
        return users.save(new User(username, "hash")).getId();
    }

    private void createJobFor(Long ownerId, String company) throws Exception {
        mockMvc.perform(post("/jobs")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("{\"company\":\"" + company + "\",\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\"}"))
            .andExpect(status().isOk());
    }

    @Test
    void metricsReturnsFullFunnelScopedToCaller() throws Exception {
        Long ownerId = createUser("metrics_alice");
        Long otherId = createUser("metrics_bob");
        createJobFor(ownerId, "Acme");
        createJobFor(otherId, "Globex");

        mockMvc.perform(get("/metrics")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.funnel", hasSize(11)))
            .andExpect(jsonPath("$.funnel[0].stage").value("RESUME_CHECK"))
            .andExpect(jsonPath("$.funnel[0].count").value(1))
            .andExpect(jsonPath("$.outcomeCounts", hasSize(5)))
            .andExpect(jsonPath("$.interviewRoundCounts", hasSize(12)))
            .andExpect(jsonPath("$.sankeyLinks", hasSize(0)));
    }

    @Test
    void requestWithoutInternalTokenIsRejected() throws Exception {
        mockMvc.perform(get("/metrics").header("X-User-Id", 1L))
            .andExpect(status().isUnauthorized());
    }
}
