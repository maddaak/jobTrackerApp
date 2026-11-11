package com.jobtracker.core.controller;

import com.jayway.jsonpath.JsonPath;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.UserRepository;
import com.jobtracker.core.support.InMemoryMongo;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class SampleDataControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository users;

    @Autowired
    private JobDetailRepository details;

    @DynamicPropertySource
    static void mongoProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.mongodb.uri", InMemoryMongo::connectionString);
    }

    @BeforeEach
    void clearDocuments() {
        details.deleteAll();
    }

    private ResultActions as(Long userId, AbstractMockHttpServletRequestBuilder<?> request) throws Exception {
        return mockMvc.perform(request.header("X-Internal-Token", "test-internal-token").header("X-User-Id", userId));
    }

    // Enough of every page to try the app with: something on the board, offers to compare, rounds to come.
    @Test
    void theSampleFillsEveryPageAndHasRoundsComingUp() throws Exception {
        Long owner = users.save(new User("sample-fill", "hash")).getId();

        int loaded = JsonPath.read(as(owner, post("/account/sample")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.jobs");

        String jobs = as(owner, get("/jobs")).andExpect(jsonPath("$", hasSize(loaded))).andReturn().getResponse().getContentAsString();
        for (String outcome : List.of("ACTIVE", "REJECTED", "GHOSTED", "WITHDRAWN", "PAUSED")) {
            assertThat(JsonPath.<List<?>>read(jobs, "$[?(@.outcome=='" + outcome + "')]")).as(outcome).isNotEmpty();
        }
        for (String phase : List.of("INITIAL_SCREEN", "MID_ROUNDS", "PANEL")) {
            assertThat(JsonPath.<List<?>>read(jobs, "$[?(@.boardPhase=='" + phase + "')]")).as(phase).isNotEmpty();
        }
        as(owner, get("/offers")).andExpect(jsonPath("$[?(@.baseSalary)]", hasSize(2)));
        List<String> starts = JsonPath.read(as(owner, get("/interviews")).andReturn().getResponse().getContentAsString(),
                "$[*].interviewDateTime");
        assertThat(starts.stream().map(Instant::parse).filter(start -> start.isAfter(Instant.now()))).isNotEmpty();
        as(owner, get("/metrics")).andExpect(status().isOk()).andExpect(jsonPath("$.resumeResponses", hasSize(2)));
        as(owner, get("/reminders/follow-ups")).andExpect(jsonPath("$", hasSize(1)));
        as(owner, get("/account/sample")).andExpect(jsonPath("$.jobs").value(loaded));
    }

    // Removing the sample takes only its own jobs, so a real one added meanwhile stays.
    @Test
    void removingTheSampleKeepsRealJobsAndASecondLoadIsRefused() throws Exception {
        Long owner = users.save(new User("sample-remove", "hash")).getId();
        as(owner, post("/account/sample")).andExpect(status().isOk());
        as(owner, post("/account/sample")).andExpect(status().isConflict());
        as(owner, post("/jobs").contentType("application/json")
                .content("{\"company\":\"Real Co\",\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\"}"))
            .andExpect(status().isOk());

        as(owner, delete("/account/sample")).andExpect(status().isOk());

        as(owner, get("/jobs")).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].company").value("Real Co"));
        as(owner, get("/account/sample")).andExpect(jsonPath("$.jobs").value(0));
    }

    // A new, empty season isn't a new account: the sample can't load there, and isn't what's on screen.
    @Test
    void anEmptySeasonBesideTheSampleNeitherOffersNorShowsIt() throws Exception {
        Long owner = users.save(new User("sample-season", "hash")).getId();
        as(owner, get("/account/sample")).andExpect(jsonPath("$.jobs").value(0)).andExpect(jsonPath("$.canLoad").value(true));
        as(owner, post("/account/sample")).andExpect(status().isOk());

        as(owner, post("/seasons").contentType("application/json").content("{\"name\":\"Next hunt\"}"))
            .andExpect(status().isCreated());

        as(owner, get("/account/sample")).andExpect(jsonPath("$.jobs").value(0)).andExpect(jsonPath("$.canLoad").value(false));
    }
}
