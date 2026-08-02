package com.jobtracker.core.controller;

import tools.jackson.databind.ObjectMapper;
import com.jobtracker.core.dto.InterviewResponse;
import com.jobtracker.core.dto.JobDetailResponse;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.transaction.TestTransaction;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class InterviewControllerTests {

    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String INTERNAL_TOKEN_VALUE = "test-internal-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository users;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private Long createUser(String username) {
        return users.save(new User(username, "hash")).getId();
    }

    private Long createJobFor(Long ownerId, String company) throws Exception {
        String body = mockMvc.perform(post("/jobs")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("{\"company\":\"" + company + "\",\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\"}"))
            .andReturn().getResponse().getContentAsString();
        return objectMapper.readValue(body, JobDetailResponse.class).id();
    }

    @Test
    void createInterviewPersistsAndAdvancesJobStage() throws Exception {
        Long ownerId = createUser("interview_alice");
        Long jobId = createJobFor(ownerId, "Acme");

        mockMvc.perform(post("/interviews")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"jobId":%d,"stage":"INTERVIEW_STAGE","interviewDateTime":"2026-08-01T18:00:00Z",
                         "interviewType":"SYSTEM_DESIGN","meetingLink":"https://meet.example/abc",
                         "interviewers":[{"name":"Jordan Lee","linkedInUrl":"https://linkedin.com/in/jordanlee"}]}
                        """.formatted(jobId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.company").value("Acme"))
            .andExpect(jsonPath("$.stage").value("INTERVIEW_STAGE"))
            .andExpect(jsonPath("$.interviewType").value("SYSTEM_DESIGN"))
            .andExpect(jsonPath("$.interviewers[0].name").value("Jordan Lee"));

        mockMvc.perform(get("/jobs/" + jobId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.currentStage").value("INTERVIEW_STAGE"));
    }

    @Test
    void createInterviewReturns404ForAnotherUsersJob() throws Exception {
        Long ownerId = createUser("interview_bob");
        Long otherId = createUser("interview_carol");
        Long jobId = createJobFor(ownerId, "Acme");

        mockMvc.perform(post("/interviews")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", otherId)
                .contentType("application/json")
                .content("""
                        {"jobId":%d,"stage":"INTERVIEW_STAGE","interviewDateTime":"2026-08-01T18:00:00Z"}
                        """.formatted(jobId)))
            .andExpect(status().isNotFound());
    }

    @Test
    void createInterviewRejectsMissingRequiredFields() throws Exception {
        Long ownerId = createUser("interview_dave");

        mockMvc.perform(post("/interviews")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("{}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void updateInterviewPersistsChangesAndReturns200() throws Exception {
        Long ownerId = createUser("interview_erin");
        Long jobId = createJobFor(ownerId, "Acme");

        String createBody = mockMvc.perform(post("/interviews")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"jobId":%d,"stage":"INTERVIEW_STAGE","interviewDateTime":"2026-08-01T18:00:00Z"}
                        """.formatted(jobId)))
            .andReturn().getResponse().getContentAsString();
        Long stageEventId = objectMapper.readValue(createBody, InterviewResponse.class).stageEventId();

        mockMvc.perform(patch("/interviews/" + stageEventId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"interviewDateTime":"2026-08-05T15:30:00Z","interviewType":"BEHAVIOR",
                         "interviewers":[{"name":"Priya Shah"}]}
                        """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.interviewType").value("BEHAVIOR"))
            .andExpect(jsonPath("$.interviewers[0].name").value("Priya Shah"));

        mockMvc.perform(get("/jobs/" + jobId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.currentStage").value("INTERVIEW_STAGE"));
    }

    // MockMvc's @Transactional test wraps the whole method in one uncommitted outer transaction,
    // so Hibernate never physically flushes a save() to the DB until that transaction commits.
    // TestTransaction.end()/start() forces a real intermediate commit (like production, where
    // repository.save() commits its own short-lived transaction) so a raw JDBC read afterward
    // reflects what's truly durable. This is what would catch a missing repository.save() call
    // after mutating an already-managed entity.
    @Test
    void updateInterviewPersistsToTheDatabaseRow() throws Exception {
        Long ownerId = createUser("interview_nora");
        Long jobId = createJobFor(ownerId, "Acme");

        String createBody = mockMvc.perform(post("/interviews")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"jobId":%d,"stage":"INTERVIEW_STAGE","interviewDateTime":"2026-08-01T18:00:00Z"}
                        """.formatted(jobId)))
            .andReturn().getResponse().getContentAsString();
        Long stageEventId = objectMapper.readValue(createBody, InterviewResponse.class).stageEventId();

        mockMvc.perform(patch("/interviews/" + stageEventId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"interviewDateTime":"2026-08-05T15:30:00Z","interviewType":"BEHAVIOR",
                         "interviewers":[{"name":"Priya Shah"}]}
                        """))
            .andExpect(status().isOk());

        TestTransaction.flagForCommit();
        TestTransaction.end();
        TestTransaction.start();

        String persistedType = jdbcTemplate.queryForObject(
                "SELECT interview_type FROM stage_events WHERE id = ?", String.class, stageEventId);
        assertThat(persistedType).isEqualTo("BEHAVIOR");

        String persistedInterviewerName = jdbcTemplate.queryForObject(
                "SELECT name FROM interviewers WHERE stage_event_id = ?", String.class, stageEventId);
        assertThat(persistedInterviewerName).isEqualTo("Priya Shah");
    }

    // createInterview currently only survives without its own re-save because the trailing
    // jobs.save(job) call happens to flush the whole persistence context. This test pins that
    // down at the DB-row level (see updateInterviewPersistsToTheDatabaseRow for why a raw JDBC
    // read + TestTransaction commit, not just the response body, is needed to catch this class
    // of bug).
    @Test
    void createInterviewPersistsToTheDatabaseRow() throws Exception {
        Long ownerId = createUser("interview_owen");
        Long jobId = createJobFor(ownerId, "Acme");

        String createBody = mockMvc.perform(post("/interviews")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"jobId":%d,"stage":"INTERVIEW_STAGE","interviewDateTime":"2026-08-01T18:00:00Z",
                         "interviewType":"BEHAVIOR","interviewers":[{"name":"Priya Shah"}]}
                        """.formatted(jobId)))
            .andReturn().getResponse().getContentAsString();
        Long stageEventId = objectMapper.readValue(createBody, InterviewResponse.class).stageEventId();

        TestTransaction.flagForCommit();
        TestTransaction.end();
        TestTransaction.start();

        String persistedType = jdbcTemplate.queryForObject(
                "SELECT interview_type FROM stage_events WHERE id = ?", String.class, stageEventId);
        assertThat(persistedType).isEqualTo("BEHAVIOR");

        String persistedInterviewerName = jdbcTemplate.queryForObject(
                "SELECT name FROM interviewers WHERE stage_event_id = ?", String.class, stageEventId);
        assertThat(persistedInterviewerName).isEqualTo("Priya Shah");
    }

    @Test
    void updateInterviewReturns404ForAnotherUsersInterview() throws Exception {
        Long ownerId = createUser("interview_frank");
        Long otherId = createUser("interview_grace");
        Long jobId = createJobFor(ownerId, "Acme");

        String createBody = mockMvc.perform(post("/interviews")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"jobId":%d,"stage":"INTERVIEW_STAGE","interviewDateTime":"2026-08-01T18:00:00Z"}
                        """.formatted(jobId)))
            .andReturn().getResponse().getContentAsString();
        Long stageEventId = objectMapper.readValue(createBody, InterviewResponse.class).stageEventId();

        mockMvc.perform(patch("/interviews/" + stageEventId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", otherId)
                .contentType("application/json")
                .content("""
                        {"interviewDateTime":"2026-08-05T15:30:00Z"}
                        """))
            .andExpect(status().isNotFound());
    }

    @Test
    void listInterviewsReturnsOnlyCallersInterviews() throws Exception {
        Long ownerId = createUser("interview_henry");
        Long otherId = createUser("interview_iris");
        Long jobId = createJobFor(ownerId, "Acme");
        Long otherJobId = createJobFor(otherId, "Globex");

        mockMvc.perform(post("/interviews")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"jobId":%d,"stage":"INTERVIEW_STAGE","interviewDateTime":"2026-08-01T18:00:00Z"}
                        """.formatted(jobId)))
            .andExpect(status().isOk());

        mockMvc.perform(post("/interviews")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", otherId)
                .contentType("application/json")
                .content("""
                        {"jobId":%d,"stage":"INTERVIEW_STAGE","interviewDateTime":"2026-08-02T18:00:00Z"}
                        """.formatted(otherJobId)))
            .andExpect(status().isOk());

        mockMvc.perform(get("/interviews")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].company").value("Acme"));
    }

    @Test
    void createInterviewPersistsMultipleInterviewers() throws Exception {
        Long ownerId = createUser("interview_maya");
        Long jobId = createJobFor(ownerId, "Acme");

        mockMvc.perform(post("/interviews")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"jobId":%d,"stage":"INTERVIEW_STAGE","interviewDateTime":"2026-08-01T18:00:00Z",
                         "interviewType":"PANEL_SYSTEM_DESIGN",
                         "interviewers":[{"name":"Jordan Lee","linkedInUrl":"https://linkedin.com/in/jordanlee"},
                                          {"name":"Sam Rivera"}]}
                        """.formatted(jobId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.interviewers", hasSize(2)))
            .andExpect(jsonPath("$.interviewers[0].name").value("Jordan Lee"))
            .andExpect(jsonPath("$.interviewers[0].linkedInUrl").value("https://linkedin.com/in/jordanlee"))
            .andExpect(jsonPath("$.interviewers[1].name").value("Sam Rivera"));
    }

    @Test
    void deleteInterviewRemovesItFromTheList() throws Exception {
        Long ownerId = createUser("interview_julia");
        Long jobId = createJobFor(ownerId, "Acme");

        String createBody = mockMvc.perform(post("/interviews")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"jobId":%d,"stage":"INTERVIEW_STAGE","interviewDateTime":"2026-08-01T18:00:00Z"}
                        """.formatted(jobId)))
            .andReturn().getResponse().getContentAsString();
        Long stageEventId = objectMapper.readValue(createBody, InterviewResponse.class).stageEventId();

        mockMvc.perform(delete("/interviews/" + stageEventId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deleted").value(true));

        mockMvc.perform(get("/interviews")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void deleteInterviewReturns404ForAnotherUsersInterview() throws Exception {
        Long ownerId = createUser("interview_kevin");
        Long otherId = createUser("interview_liam");
        Long jobId = createJobFor(ownerId, "Acme");

        String createBody = mockMvc.perform(post("/interviews")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"jobId":%d,"stage":"INTERVIEW_STAGE","interviewDateTime":"2026-08-01T18:00:00Z"}
                        """.formatted(jobId)))
            .andReturn().getResponse().getContentAsString();
        Long stageEventId = objectMapper.readValue(createBody, InterviewResponse.class).stageEventId();

        mockMvc.perform(delete("/interviews/" + stageEventId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", otherId))
            .andExpect(status().isNotFound());
    }

    // GET /interviews/upcoming is covered at the service level instead of here, see
    // InterviewServiceTests.listUpcomingInterviews*.

    @Test
    void createInterviewWithBlankInterviewerNameReturns400NotError() throws Exception {
        Long ownerId = createUser("interview_paula");
        Long jobId = createJobFor(ownerId, "Acme");

        mockMvc.perform(post("/interviews")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"jobId":%d,"stage":"INTERVIEW_STAGE","interviewDateTime":"2026-08-01T18:00:00Z",
                         "interviewers":[{"name":"  ","linkedInUrl":"https://linkedin.com/in/x"}]}
                        """.formatted(jobId)))
            .andExpect(status().isBadRequest());
    }

    @Test
    void listInterviewsWithoutUserIdHeaderReturns400NotError() throws Exception {
        mockMvc.perform(get("/interviews").header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    void requestWithoutInternalTokenIsRejected() throws Exception {
        mockMvc.perform(get("/interviews").header("X-User-Id", 1L))
            .andExpect(status().isUnauthorized());
    }
}
