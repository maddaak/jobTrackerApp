package com.jobtracker.core.controller;

import com.jayway.jsonpath.JsonPath;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
import com.jobtracker.core.repository.UserRepository;
import com.jobtracker.core.service.SeasonService;
import com.jobtracker.core.support.InMemoryMongo;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class SeasonClosingTests {

    private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4 };
    private static final String AI_CONTENT = "{\"content\":{\"summary\":\"Looks good\"}}";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository users;

    @Autowired
    private JobRepository jobs;

    @Autowired
    private JobDetailRepository details;

    @Autowired
    private SeasonService seasons;

    @DynamicPropertySource
    static void mongoProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.mongodb.uri", InMemoryMongo::connectionString);
    }

    private Long owner;
    private Long seasonId;
    private Long offerJob;
    private Long otherJob;
    private String round;
    private String image;

    @BeforeEach
    void setUp() throws Exception {
        details.deleteAll();
        User user = users.save(new User("closer", "hash"));
        seasonId = seasons.startFirstSeason(user);
        owner = user.getId();
        offerJob = addJob("Initech");
        otherJob = addJob("Globex");
        as(patch("/jobs/" + offerJob).contentType("application/json").content(jobPatch("Initech", "OFFER_STAGE")))
                .andExpect(status().isOk());
        round = JsonPath.read(body(as(post("/interviews").contentType("application/json").content(
                "{\"jobId\":" + offerJob + ",\"interviewDateTime\":\"2026-09-01T15:00:00Z\",\"interviewType\":\"SYSTEM_DESIGN\"}"))),
                "$.roundId");
        image = JsonPath.read(body(as(multipart("/jobs/" + offerJob + "/images")
                .file(new MockMultipartFile("file", "diagram.png", "image/png", PNG)))), "$.id");
    }

    private ResultActions as(AbstractMockHttpServletRequestBuilder<?> request) throws Exception {
        return mockMvc.perform(request.header("X-Internal-Token", "test-internal-token").header("X-User-Id", owner));
    }

    private static String body(ResultActions result) throws Exception {
        return result.andExpect(status().is2xxSuccessful()).andReturn().getResponse().getContentAsString();
    }

    private Long addJob(String company) throws Exception {
        String created = body(as(post("/jobs").contentType("application/json")
                .content("{\"company\":\"" + company + "\",\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\"}")));
        return ((Number) JsonPath.read(created, "$.id")).longValue();
    }

    private static String jobPatch(String company, String stage) {
        return "{\"company\":\"" + company + "\",\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\","
                + "\"currentStage\":\"" + stage + "\",\"outcome\":\"ACTIVE\"}";
    }

    private ResultActions close(String body) throws Exception {
        return as(post("/seasons/" + seasonId + "/close").contentType("application/json").content(body));
    }

    // Every request that changes a job, a round, or what hangs off them. A new one belongs here, or a closed
    // season could be changed through it.
    private Map<String, AbstractMockHttpServletRequestBuilder<?>> everyWrite() {
        Map<String, AbstractMockHttpServletRequestBuilder<?>> writes = new LinkedHashMap<>();
        writes.put("add a job", post("/jobs").contentType("application/json")
                .content("{\"company\":\"Hooli\",\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\"}"));
        writes.put("import jobs", post("/jobs/import").contentType("application/json")
                .content("{\"jobs\":[{\"company\":\"Hooli\",\"role\":\"Engineer\"}]}"));
        writes.put("edit a job", patch("/jobs/" + offerJob).contentType("application/json")
                .content(jobPatch("Renamed", "OFFER_STAGE")));
        writes.put("edit its details", put("/jobs/" + offerJob + "/detail").contentType("application/json")
                .content("{\"notes\":\"changed\"}"));
        writes.put("delete a stage entry", delete("/jobs/" + offerJob + "/stages")
                .param("enteredAt", "2026-01-01T00:00:00Z"));
        writes.put("delete a job", delete("/jobs/" + otherJob));
        writes.put("add a round", post("/interviews").contentType("application/json").content(
                "{\"jobId\":" + offerJob + ",\"interviewDateTime\":\"2026-09-02T15:00:00Z\",\"interviewType\":\"BEHAVIOR\"}"));
        writes.put("edit a round", patch("/interviews/" + round).contentType("application/json")
                .content("{\"interviewDateTime\":\"2026-09-03T15:00:00Z\",\"interviewType\":\"BEHAVIOR\"}"));
        writes.put("delete a round", delete("/interviews/" + round));
        writes.put("link two jobs", post("/jobs/" + offerJob + "/links").contentType("application/json")
                .content("{\"targetJobId\":" + otherJob + ",\"relation\":\"RELATED\"}"));
        writes.put("unlink them", delete("/jobs/" + offerJob + "/links/" + otherJob));
        writes.put("save the offer", put("/jobs/" + offerJob + "/offer").contentType("application/json")
                .content("{\"baseSalary\":150000}"));
        writes.put("accept the offer", put("/jobs/" + offerJob + "/offer/acceptance").contentType("application/json")
                .content("{\"acceptedOn\":\"2026-10-20\"}"));
        writes.put("save a market check", put("/jobs/" + offerJob + "/offer/market-check").contentType("application/json")
                .content("{\"verdict\":\"at\",\"typicalLow\":180000,\"typicalHigh\":220000,\"summary\":\"Typical.\","
                        + "\"negotiationPoints\":[],\"searched\":false,\"sources\":[]}"));
        writes.put("clear the market check", delete("/jobs/" + offerJob + "/offer/market-check"));
        writes.put("add an image", multipart("/jobs/" + offerJob + "/images")
                .file(new MockMultipartFile("file", "more.png", "image/png", PNG)));
        writes.put("delete an image", delete("/jobs/" + offerJob + "/images/" + image));
        writes.put("save a job's AI answer", put("/jobs/" + offerJob + "/ai/tailoring").contentType("application/json")
                .content(AI_CONTENT));
        writes.put("clear it", delete("/jobs/" + offerJob + "/ai/tailoring"));
        writes.put("save a round's AI answer", put("/interviews/" + round + "/ai/debrief").contentType("application/json")
                .content(AI_CONTENT));
        writes.put("clear that", delete("/interviews/" + round + "/ai/debrief"));
        return writes;
    }

    @Test
    void aClosedSeasonRefusesEveryChange() throws Exception {
        close("{}").andExpect(status().isOk()).andExpect(jsonPath("$.closedAt").isNotEmpty());

        for (Map.Entry<String, AbstractMockHttpServletRequestBuilder<?>> write : everyWrite().entrySet()) {
            int status = as(write.getValue()).andReturn().getResponse().getStatus();
            assertThat(status).as(write.getKey()).isEqualTo(409);
        }
        assertThat(jobs.findById(offerJob).orElseThrow().getCompany()).isEqualTo("Initech");
        assertThat(jobs.findById(otherJob)).isPresent();
    }

    @Test
    void editReopensItAndChangesGoThroughAgain() throws Exception {
        close("{}").andExpect(status().isOk());

        as(post("/seasons/" + seasonId + "/reopen")).andExpect(status().isOk()).andExpect(jsonPath("$.closedAt").isEmpty());

        as(patch("/jobs/" + offerJob).contentType("application/json").content(jobPatch("Renamed", "OFFER_STAGE")))
                .andExpect(status().isOk());
    }

    @Test
    void aJobCantMoveIntoOrOutOfAClosedSeason() throws Exception {
        Long next = ((Number) JsonPath.read(body(as(post("/seasons").contentType("application/json")
                .content("{\"name\":\"Next hunt\"}"))), "$.id")).longValue();
        as(put("/seasons/active").contentType("application/json").content("{\"seasonId\":" + next + "}"));
        Long later = addJob("Hooli");
        close("{}").andExpect(status().isOk());

        as(put("/seasons/" + next + "/jobs/" + offerJob)).andExpect(status().isConflict());
        as(put("/seasons/" + seasonId + "/jobs/" + later)).andExpect(status().isConflict());
    }

    // The days live on the offer, set as the Offers page sets them, so the summary reads one place.
    @Test
    void theOfferTakenCarriesItsDaysIntoTheSummary() throws Exception {
        as(put("/jobs/" + offerJob + "/offer/acceptance").contentType("application/json")
                .content("{\"acceptedOn\":\"2026-10-20\",\"startDate\":\"2026-11-16\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.outcome").value("OFFER_ACCEPTED"))
                .andExpect(jsonPath("$.acceptedOn").value("2026-10-20"))
                .andExpect(jsonPath("$.startDate").value("2026-11-16"));

        close("{\"acceptedJobId\":" + offerJob + "}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.acceptedJobId").value(offerJob));

        assertThat(jobs.findById(offerJob).orElseThrow().getOutcome()).isEqualTo(Outcome.OFFER_ACCEPTED);
        as(get("/metrics/seasons/" + seasonId + "/summary"))
                .andExpect(jsonPath("$.acceptedOffer.company").value("Initech"))
                .andExpect(jsonPath("$.acceptedOffer.acceptedOn").value("2026-10-20"))
                .andExpect(jsonPath("$.acceptedOffer.startsOn").value("2026-11-16"))
                .andExpect(jsonPath("$.offers[0].acceptedOn").value("2026-10-20"));
    }

    // The offer form holds no accepted day, so saving the offer's figures afterwards must not wipe it.
    @Test
    void editingTheOfferKeepsTheDayItWasAccepted() throws Exception {
        as(put("/jobs/" + offerJob + "/offer/acceptance").contentType("application/json")
                .content("{\"acceptedOn\":\"2026-10-20\",\"startDate\":\"2026-11-16\"}"))
                .andExpect(status().isOk());

        as(put("/jobs/" + offerJob + "/offer").contentType("application/json")
                .content("{\"baseSalary\":150000,\"startDate\":\"2026-11-23\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.acceptedOn").value("2026-10-20"))
                .andExpect(jsonPath("$.startDate").value("2026-11-23"));
    }

    @Test
    void onlyAnOfferCanBeAccepted() throws Exception {
        as(put("/jobs/" + otherJob + "/offer/acceptance").contentType("application/json")
                .content("{\"acceptedOn\":\"2026-10-20\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void theOfferTakenMustBeAnOfferInThisSeason() throws Exception {
        close("{\"acceptedJobId\":" + otherJob + "}").andExpect(status().isConflict());

        Long next = ((Number) JsonPath.read(body(as(post("/seasons").contentType("application/json")
                .content("{\"name\":\"Next hunt\"}"))), "$.id")).longValue();
        as(put("/seasons/" + next + "/jobs/" + offerJob)).andExpect(status().isNoContent());
        close("{\"acceptedJobId\":" + offerJob + "}").andExpect(status().isNotFound());
    }
}
