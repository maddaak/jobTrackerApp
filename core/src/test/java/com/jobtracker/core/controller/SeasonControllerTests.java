package com.jobtracker.core.controller;

import com.jayway.jsonpath.JsonPath;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.UserRepository;
import com.jobtracker.core.service.SeasonService;
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

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class SeasonControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository users;

    @Autowired
    private JobDetailRepository details;

    @Autowired
    private SeasonService seasons;

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

    private Long owner(String username) {
        User user = users.save(new User(username, "hash"));
        seasons.startFirstSeason(user);
        return user.getId();
    }

    private Long addJob(Long owner, String company) throws Exception {
        String body = as(owner, post("/jobs").contentType("application/json")
                .content("{\"company\":\"" + company + "\",\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(body, "$.id")).longValue();
    }

    private Long newSeason(Long owner, String name) throws Exception {
        String body = as(owner, post("/seasons").contentType("application/json").content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(body, "$.id")).longValue();
    }

    private void view(Long owner, Long seasonId) throws Exception {
        as(owner, put("/seasons/active").contentType("application/json").content("{\"seasonId\":" + seasonId + "}"))
                .andExpect(status().isNoContent());
    }

    // The point of a season: starting a new search hides the last one everywhere, until "all" brings it back.
    @Test
    void aNewSeasonStartsEmptyAndHidesTheLastOneOnEveryPage() throws Exception {
        Long owner = owner("season-hide");
        Long oldJob = addJob(owner, "Old Co");
        as(owner, patch("/jobs/" + oldJob).contentType("application/json").content(
                "{\"company\":\"Old Co\",\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\","
                        + "\"currentStage\":\"OFFER_STAGE\",\"outcome\":\"ACTIVE\"}"))
                .andExpect(status().isOk());
        as(owner, post("/interviews").contentType("application/json").content(
                "{\"jobId\":" + oldJob + ",\"interviewDateTime\":\"2026-01-05T15:00:00Z\",\"interviewType\":\"RECRUITER_PHONE_SCREEN\"}"))
                .andExpect(status().isOk());

        newSeason(owner, "Spring hunt");
        Long newJob = addJob(owner, "New Co");

        as(owner, get("/jobs")).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].id").value(newJob));
        as(owner, get("/offers")).andExpect(jsonPath("$", hasSize(0)));
        as(owner, get("/interviews")).andExpect(jsonPath("$", hasSize(0)));
        as(owner, get("/metrics")).andExpect(jsonPath("$.summary.totalJobs").value(1));

        view(owner, null);
        as(owner, get("/jobs")).andExpect(jsonPath("$", hasSize(2)));
        as(owner, get("/offers")).andExpect(jsonPath("$", hasSize(1)));
        as(owner, get("/interviews")).andExpect(jsonPath("$", hasSize(1)));
        as(owner, get("/seasons"))
                .andExpect(jsonPath("$[*].name").value(org.hamcrest.Matchers.contains("My job hunt", "Spring hunt")))
                .andExpect(jsonPath("$[*].jobCount").value(org.hamcrest.Matchers.contains(1, 1)))
                .andExpect(jsonPath("$[?(@.active == true)]", hasSize(0)));
    }

    // The season was made at upgrade, long after the hunt, so its dates come from the applications.
    @Test
    void aSeasonIsDatedByItsFirstAndLastApplicationAndAnEmptyOneIsNot() throws Exception {
        Long owner = owner("season-dates");
        as(owner, post("/jobs/import").contentType("application/json").content(
                "{\"jobs\":[{\"company\":\"Later Co\",\"role\":\"Engineer\",\"appliedOn\":\"2025-04-20\"},"
                        + "{\"company\":\"Early Co\",\"role\":\"Engineer\",\"appliedOn\":\"2025-01-06\"}]}"))
                .andExpect(status().isOk());
        newSeason(owner, "Empty");

        as(owner, get("/seasons"))
                .andExpect(jsonPath("$[0].firstApplied").value(org.hamcrest.Matchers.startsWith("2025-01-06")))
                .andExpect(jsonPath("$[0].lastApplied").value(org.hamcrest.Matchers.startsWith("2025-04-20")))
                .andExpect(jsonPath("$[1].firstApplied").isEmpty())
                .andExpect(jsonPath("$[1].lastApplied").isEmpty());
    }

    // With every season showing there is no "current" one, so a new job goes to the newest search.
    @Test
    void aJobAddedWhileViewingAllGoesIntoTheNewestSeason() throws Exception {
        Long owner = owner("season-all");
        Long newest = newSeason(owner, "Second");
        view(owner, null);

        addJob(owner, "Acme");

        view(owner, newest);
        as(owner, get("/jobs")).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].seasonId").value(newest));
    }

    // Deleting a season can never take a job with it, and an account always has somewhere to put one.
    @Test
    void onlyAnEmptySeasonThatIsNotTheLastCanBeDeleted() throws Exception {
        Long owner = owner("season-delete");
        Long first = JsonPath.<Number>read(as(owner, get("/seasons")).andReturn().getResponse().getContentAsString(),
                "$[0].id").longValue();
        as(owner, delete("/seasons/" + first)).andExpect(status().isConflict());

        addJob(owner, "Acme");
        Long empty = newSeason(owner, "Empty");
        as(owner, delete("/seasons/" + first)).andExpect(status().isConflict());

        as(owner, delete("/seasons/" + empty)).andExpect(status().isNoContent());
        as(owner, get("/seasons")).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].active").value(true));
    }

    @Test
    void aJobMovesBetweenSeasonsButNeverIntoSomeoneElses() throws Exception {
        Long owner = owner("season-move");
        Long other = owner("season-move-other");
        Long otherSeason = newSeason(other, "Theirs");
        Long job = addJob(owner, "Acme");
        Long later = newSeason(owner, "Later");

        as(owner, put("/seasons/" + otherSeason + "/jobs/" + job)).andExpect(status().isNotFound());
        as(owner, put("/seasons/" + later + "/jobs/" + job)).andExpect(status().isNoContent());

        as(owner, get("/jobs")).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].id").value(job));
    }

    // Applying again in a later search is a new application, so the importer only skips repeats within a season.
    @Test
    void importSkipsRepeatsWithinTheSeasonOnly() throws Exception {
        Long owner = owner("season-import");
        String sheet = "{\"jobs\":[{\"company\":\"Acme\",\"role\":\"Engineer\"}]}";
        as(owner, post("/jobs/import").contentType("application/json").content(sheet))
                .andExpect(jsonPath("$.imported").value(1));
        as(owner, post("/jobs/import").contentType("application/json").content(sheet))
                .andExpect(jsonPath("$.skipped").value(1));

        newSeason(owner, "Next year");
        as(owner, post("/jobs/import").contentType("application/json").content(sheet))
                .andExpect(jsonPath("$.imported").value(1));
    }

    // A backup carries each job's season by name, and the restored account opens on the latest search.
    @Test
    void aBackupKeepsSeasonsAndOpensOnTheNewestOne() throws Exception {
        Long owner = owner("season-backup");
        addJob(owner, "First Co");
        newSeason(owner, "Second hunt");
        addJob(owner, "Second Co");
        byte[] backup = as(owner, get("/account/export")).andReturn().getResponse().getContentAsByteArray();

        Long restored = owner("season-backup-restored");
        as(restored, post("/account/restore").contentType("application/json").content(backup))
                .andExpect(status().isOk());

        String seasonList = as(restored, get("/seasons")).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<List<String>>read(seasonList, "$[*].name")).containsExactly("My job hunt", "Second hunt");
        assertThat(JsonPath.<List<String>>read(seasonList, "$[?(@.active == true)].name")).containsExactly("Second hunt");
        as(restored, get("/jobs")).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].company").value("Second Co"));
    }

    // The Seasons page compares every season, whichever one is on screen.
    @Test
    void eachSeasonGetsItsOwnNumbersWhicheverIsShown() throws Exception {
        Long owner = owner("season-stats");
        Long first = JsonPath.<Number>read(as(owner, get("/seasons")).andReturn().getResponse().getContentAsString(),
                "$[0].id").longValue();
        Long interviewed = addJob(owner, "Interviewed Co");
        addJob(owner, "Quiet Co");
        for (String outcome : List.of("ACTIVE", "REJECTED")) {
            as(owner, patch("/jobs/" + interviewed).contentType("application/json").content(
                    "{\"company\":\"Interviewed Co\",\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\","
                            + "\"currentStage\":\"INTERVIEW_STAGE\",\"outcome\":\"" + outcome + "\"}"))
                    .andExpect(status().isOk());
        }
        Long second = newSeason(owner, "Second");
        addJob(owner, "Fresh Co");

        String stats = as(owner, get("/metrics/seasons")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String firstStats = "$[?(@.seasonId == " + first + ")]";
        assertThat(JsonPath.<List<Integer>>read(stats, firstStats + ".applications")).containsExactly(2);
        assertThat(JsonPath.<List<Integer>>read(stats, firstStats + ".heardBack")).containsExactly(1);
        assertThat(JsonPath.<List<Integer>>read(stats, firstStats + ".interviewed")).containsExactly(1);
        assertThat(JsonPath.<List<Integer>>read(stats, firstStats + ".active")).containsExactly(1);
        assertThat(JsonPath.<List<Integer>>read(stats, "$[?(@.seasonId == " + second + ")].applications")).containsExactly(1);
    }

    @Test
    void aSeasonNeedsAName() throws Exception {
        Long owner = owner("season-name");
        as(owner, post("/seasons").contentType("application/json").content("{\"name\":\"  \"}"))
                .andExpect(status().isBadRequest());
    }
}
