package com.jobtracker.core.controller;

import com.jayway.jsonpath.JsonPath;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.Stage;
import com.jobtracker.core.model.StageHistoryEntry;
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
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class JobImportControllerTests {

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

    private ResultActions importAs(Long ownerId, String rows) throws Exception {
        return mockMvc.perform(post("/jobs/import")
                .header("X-Internal-Token", "test-internal-token")
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("{\"jobs\":[" + rows + "]}"));
    }

    private List<Stage> trailOf(Long jobId) {
        JobDetail detail = details.findByJobId(jobId).orElseThrow();
        return detail.getStageHistory().stream()
                .sorted(java.util.Comparator.comparing(StageHistoryEntry::getEnteredAt))
                .map(StageHistoryEntry::getStage)
                .toList();
    }

    // Each status a spreadsheet can carry lands where the app would have put it, with the trail behind it.
    @Test
    void eachRowKeepsItsDateStatusAndTrail() throws Exception {
        Long owner = users.save(new User("import-trail", "hash")).getId();
        Map<String, List<Stage>> expectedTrail = Map.of(
                "Waiting", List.of(Stage.RESUME_CHECK),
                "Interviewing", List.of(Stage.RESUME_CHECK, Stage.INTERVIEW_STAGE),
                "Rejected", List.of(Stage.RESUME_CHECK, Stage.INTERVIEW_STAGE, Stage.FINALIZED),
                "Accepted", List.of(Stage.RESUME_CHECK, Stage.OFFER_STAGE));

        importAs(owner, """
                {"company":"Waiting","role":"Engineer","appliedOn":"2026-03-02","location":"HYBRID","city":"Austin"},
                {"company":"Interviewing","role":"Engineer","stage":"INTERVIEW_STAGE","notes":"two rounds"},
                {"company":"Rejected","role":"Engineer","stage":"INTERVIEW_STAGE","outcome":"REJECTED","rejectedReason":"Went with someone senior"},
                {"company":"Accepted","role":"Engineer","outcome":"OFFER_ACCEPTED","sourceCategory":"REFERRAL_APPLIED"}
                """)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.imported").value(4))
            .andExpect(jsonPath("$.skipped").value(0));

        String list = mockMvc.perform(get("/jobs").header("X-Internal-Token", "test-internal-token").header("X-User-Id", owner))
            .andExpect(jsonPath("$", hasSize(4)))
            .andExpect(jsonPath("$[?(@.company=='Waiting')].createdAt").value(org.hamcrest.Matchers.contains("2026-03-02T00:00:00Z")))
            .andExpect(jsonPath("$[?(@.company=='Waiting')].city").value(org.hamcrest.Matchers.contains("Austin")))
            .andExpect(jsonPath("$[?(@.company=='Rejected')].currentStage").value(org.hamcrest.Matchers.contains("FINALIZED")))
            .andExpect(jsonPath("$[?(@.company=='Accepted')].currentStage").value(org.hamcrest.Matchers.contains("OFFER_STAGE")))
            .andExpect(jsonPath("$[?(@.company=='Accepted')].sourceCategory").value(org.hamcrest.Matchers.contains("REFERRAL_APPLIED")))
            .andReturn().getResponse().getContentAsString();

        for (Map.Entry<String, List<Stage>> expected : expectedTrail.entrySet()) {
            List<Integer> ids = JsonPath.read(list, "$[?(@.company=='" + expected.getKey() + "')].id");
            assertThat(trailOf(ids.get(0).longValue())).as(expected.getKey()).isEqualTo(expected.getValue());
        }
        List<Integer> rejected = JsonPath.read(list, "$[?(@.company=='Rejected')].id");
        assertThat(details.findByJobId(rejected.get(0).longValue()).orElseThrow().getRejectedReason())
                .isEqualTo("Went with someone senior");
    }

    // Importing the same file twice, or a job already added by hand, adds nothing the second time.
    @Test
    void aCompanyAndRoleAlreadyTrackedIsSkipped() throws Exception {
        Long owner = users.save(new User("import-twice", "hash")).getId();
        String rows = """
                {"company":"Acme","role":"Engineer"},
                {"company":" acme ","role":"ENGINEER"},
                {"company":"Acme","role":"Manager"}
                """;

        importAs(owner, rows).andExpect(jsonPath("$.imported").value(2)).andExpect(jsonPath("$.skipped").value(1));
        importAs(owner, rows).andExpect(jsonPath("$.imported").value(0)).andExpect(jsonPath("$.skipped").value(3));
    }

    @Test
    void aRowWithoutACompanyOrAFinalizedStageRefusesTheWholeFile() throws Exception {
        Long owner = users.save(new User("import-bad", "hash")).getId();

        importAs(owner, "{\"company\":\"Acme\",\"role\":\"Engineer\"},{\"company\":\"\",\"role\":\"Engineer\"}")
            .andExpect(status().isBadRequest());
        importAs(owner, "{\"company\":\"Acme\",\"role\":\"Engineer\",\"stage\":\"FINALIZED\"}")
            .andExpect(status().isBadRequest());
        importAs(owner, "").andExpect(status().isBadRequest());

        mockMvc.perform(get("/jobs").header("X-Internal-Token", "test-internal-token").header("X-User-Id", owner))
            .andExpect(jsonPath("$", hasSize(0)));
    }
}
