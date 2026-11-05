package com.jobtracker.core.controller;

import com.jayway.jsonpath.JsonPath;
import com.jobtracker.core.model.AiKind;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.AccountAiResultRepository;
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

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AiResultControllerTests {

    private static final String CONTENT = "{\"content\":{\"summary\":\"Looks good\",\"items\":[\"one\",\"two\"]}}";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository users;

    @Autowired
    private JobDetailRepository details;

    @Autowired
    private AccountAiResultRepository accountAiResults;

    private Long owner;

    @DynamicPropertySource
    static void mongoProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.mongodb.uri", InMemoryMongo::connectionString);
    }

    @BeforeEach
    void setUp() {
        details.deleteAll();
        accountAiResults.deleteAll();
        owner = users.save(new User("ai-owner", "hash")).getId();
    }

    private ResultActions as(Long userId, AbstractMockHttpServletRequestBuilder<?> request) throws Exception {
        return mockMvc.perform(request.header("X-Internal-Token", "test-internal-token").header("X-User-Id", userId));
    }

    private ResultActions save(String url, String body) throws Exception {
        return as(owner, put(url).contentType("application/json").content(body));
    }

    private Long createJob() throws Exception {
        String body = as(owner, post("/jobs").contentType("application/json")
                .content("{\"company\":\"Acme\",\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(body, "$.id")).longValue();
    }

    private String addRound(Long jobId) throws Exception {
        String body = as(owner, post("/interviews").contentType("application/json")
                .content("{\"jobId\":" + jobId + ",\"interviewDateTime\":\"2026-09-01T15:00:00Z\",\"interviewType\":\"SYSTEM_DESIGN\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.roundId");
    }

    private void moveToOffer(Long jobId) throws Exception {
        as(owner, patch("/jobs/" + jobId).contentType("application/json")
                .content("{\"company\":\"Acme\",\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\",\"currentStage\":\"OFFER_STAGE\",\"outcome\":\"ACTIVE\"}"))
            .andExpect(status().isOk());
    }

    // Every job kind, once each rule for it is met, saves onto the detail and clears again.
    @Test
    void everyJobKindIsSavedWithTheJobAndCleared() throws Exception {
        Long job = createJob();
        addRound(job);
        moveToOffer(job);
        for (AiKind kind : AiKind.values()) {
            if (AiKind.find(kind.key(), AiKind.Scope.JOB).isEmpty()) {
                continue;
            }
            String query = kind == AiKind.INTERVIEW_PREP ? "?interviewType=BEHAVIOR" : "";
            String stored = kind == AiKind.INTERVIEW_PREP ? "prep:BEHAVIOR" : kind.key();
            save("/jobs/" + job + "/ai/" + kind.key() + query, CONTENT)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.items[1]").value("two"))
                .andExpect(jsonPath("$.createdAt").exists());
            as(owner, get("/jobs/" + job + "/detail"))
                .andExpect(jsonPath("$.aiResults['" + stored + "'].content.summary").value("Looks good"));

            as(owner, delete("/jobs/" + job + "/ai/" + kind.key() + query)).andExpect(status().isNoContent());
            as(owner, get("/jobs/" + job + "/detail")).andExpect(jsonPath("$.aiResults['" + stored + "']").doesNotExist());
        }
        as(owner, get("/offers")).andExpect(jsonPath("$[0].negotiationDraft").isEmpty());
    }

    @Test
    void theNegotiationDraftShowsOnTheOffer() throws Exception {
        Long job = createJob();
        moveToOffer(job);

        save("/jobs/" + job + "/ai/negotiation", CONTENT).andExpect(status().isOk());

        as(owner, get("/offers")).andExpect(jsonPath("$[0].negotiationDraft.content.summary").value("Looks good"));
    }

    // Held in core, so a direct call can't keep a draft the page would never offer for this job.
    @Test
    void aDraftNeedsWhatItIsAbout() throws Exception {
        Long job = createJob();

        save("/jobs/" + job + "/ai/negotiation", CONTENT).andExpect(status().isConflict());
        save("/jobs/" + job + "/ai/follow-up", CONTENT)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error", containsString("interview round")));

        addRound(job);
        save("/jobs/" + job + "/ai/follow-up", CONTENT).andExpect(status().isOk());
    }

    // Kept per kind of round, so prepping for one doesn't replace another, and possible before any is scheduled.
    @Test
    void prepIsKeptPerInterviewType() throws Exception {
        Long job = createJob();

        save("/jobs/" + job + "/ai/prep?interviewType=SYSTEM_DESIGN", CONTENT).andExpect(status().isOk());
        save("/jobs/" + job + "/ai/prep?interviewType=BEHAVIOR", "{\"content\":{\"summary\":\"Stories\"}}")
            .andExpect(status().isOk());

        as(owner, get("/jobs/" + job + "/detail"))
            .andExpect(jsonPath("$.aiResults['prep:SYSTEM_DESIGN'].content.summary").value("Looks good"))
            .andExpect(jsonPath("$.aiResults['prep:BEHAVIOR'].content.summary").value("Stories"));
        for (String query : new String[] {"", "?interviewType=", "?interviewType=ASTROLOGY"}) {
            save("/jobs/" + job + "/ai/prep" + query, CONTENT).andExpect(status().isBadRequest());
        }
    }

    @Test
    void everyRoundKindIsSavedWithTheRoundAndOutlivesAnEdit() throws Exception {
        Long job = createJob();
        String round = addRound(job);
        for (AiKind kind : AiKind.values()) {
            if (AiKind.find(kind.key(), AiKind.Scope.ROUND).isEmpty()) {
                continue;
            }
            save("/interviews/" + round + "/ai/" + kind.key(), CONTENT).andExpect(status().isOk());
            as(owner, patch("/interviews/" + round).contentType("application/json")
                    .content("{\"interviewDateTime\":\"2026-09-02T15:00:00Z\",\"interviewType\":\"BEHAVIOR\",\"interviewers\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aiResults['" + kind.key() + "'].content.summary").value("Looks good"));

            as(owner, delete("/interviews/" + round + "/ai/" + kind.key())).andExpect(status().isNoContent());
            as(owner, get("/interviews")).andExpect(jsonPath("$[0].aiResults['" + kind.key() + "']").doesNotExist());
        }
    }

    // One brief per company, however its name was typed on each job.
    @Test
    void aCompanyBriefIsSharedAcrossSpellingsOfTheName() throws Exception {
        as(owner, get("/ai/company-brief").param("company", "Acme Corp")).andExpect(status().isNotFound());

        as(owner, put("/ai/company-brief").param("company", "Acme  Corp").contentType("application/json").content(CONTENT))
            .andExpect(status().isOk());

        as(owner, get("/ai/company-brief").param("company", " acme corp"))
            .andExpect(jsonPath("$.content.summary").value("Looks good"));
        as(owner, delete("/ai/company-brief").param("company", "ACME Corp")).andExpect(status().isNoContent());
        as(owner, get("/ai/company-brief").param("company", "Acme Corp")).andExpect(status().isNotFound());
        save("/ai/company-brief", CONTENT).andExpect(status().isBadRequest());
    }

    // Insights and the offer comparison are made from the season shown, so switching shows that season's own.
    @Test
    void eachSeasonKeepsItsOwnInsightsAndOfferComparison() throws Exception {
        Long other = users.save(new User("ai-other", "hash")).getId();
        for (AiKind kind : AiKind.values()) {
            if (!kind.perSeason()) {
                continue;
            }
            accountAiResults.deleteAll();
            Long first = newSeason("First hunt " + kind.key());
            save("/ai/" + kind.key(), CONTENT).andExpect(status().isOk());
            save("/ai/" + kind.key(), "{\"content\":{\"summary\":\"Newer\"}}").andExpect(status().isOk());

            Long second = newSeason("Second hunt " + kind.key());
            as(owner, get("/ai/" + kind.key())).andExpect(status().isNotFound());
            save("/ai/" + kind.key(), "{\"content\":{\"summary\":\"Second\"}}").andExpect(status().isOk());

            view(first);
            as(owner, get("/ai/" + kind.key())).andExpect(jsonPath("$.content.summary").value("Newer"));
            view(second);
            as(owner, get("/ai/" + kind.key())).andExpect(jsonPath("$.content.summary").value("Second"));
            view(null);
            as(owner, get("/ai/" + kind.key())).andExpect(status().isNotFound());
            as(other, get("/ai/" + kind.key())).andExpect(status().isNotFound());
        }
    }

    // Switching seasons while the AI works must not file the answer under the season switched to.
    @Test
    void aRunIsSavedForTheSeasonItWasMadeFrom() throws Exception {
        Long other = users.save(new User("ai-season-other", "hash")).getId();
        for (AiKind kind : AiKind.values()) {
            if (!kind.perSeason()) {
                continue;
            }
            accountAiResults.deleteAll();
            Long started = newSeason("Started in " + kind.key());
            Long switched = newSeason("Switched to " + kind.key());

            save("/ai/" + kind.key() + "?season=" + started, CONTENT).andExpect(status().isOk());

            as(owner, get("/ai/" + kind.key())).andExpect(status().isNotFound());
            view(started);
            as(owner, get("/ai/" + kind.key())).andExpect(status().isOk());
            view(switched);
            save("/ai/" + kind.key() + "?season=all", CONTENT).andExpect(status().isOk());
            view(null);
            as(owner, get("/ai/" + kind.key())).andExpect(status().isOk());

            as(other, put("/ai/" + kind.key() + "?season=" + started).contentType("application/json").content(CONTENT))
                .andExpect(status().isNotFound());
            save("/ai/" + kind.key() + "?season=soon", CONTENT).andExpect(status().isBadRequest());
        }
    }

    // Created seasons become the one shown.
    private Long newSeason(String name) throws Exception {
        String body = as(owner, post("/seasons").contentType("application/json").content("{\"name\":\"" + name + "\"}"))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(body, "$.id")).longValue();
    }

    private void view(Long seasonId) throws Exception {
        as(owner, put("/seasons/active").contentType("application/json").content("{\"seasonId\":" + seasonId + "}"))
            .andExpect(status().isNoContent());
    }

    @Test
    void aKindOutsideItsScopeAnEmptyAnswerAndSomeoneElsesJobAreRefused() throws Exception {
        Long job = createJob();
        String round = addRound(job);

        save("/jobs/" + job + "/ai/debrief", CONTENT).andExpect(status().isNotFound());
        save("/interviews/" + round + "/ai/prep", CONTENT).andExpect(status().isNotFound());
        save("/interviews/" + round + "/ai/tailoring", CONTENT).andExpect(status().isNotFound());
        save("/ai/debrief", CONTENT).andExpect(status().isNotFound());
        save("/jobs/" + job + "/ai/tailoring", "{\"content\":{}}").andExpect(status().isBadRequest());

        Long other = users.save(new User("ai-intruder", "hash")).getId();
        as(other, put("/jobs/" + job + "/ai/tailoring").contentType("application/json").content(CONTENT))
            .andExpect(status().isNotFound());
        as(other, put("/interviews/" + round + "/ai/debrief").contentType("application/json").content(CONTENT))
            .andExpect(status().isNotFound());
    }
}
