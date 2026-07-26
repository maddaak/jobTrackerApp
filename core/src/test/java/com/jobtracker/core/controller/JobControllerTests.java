package com.jobtracker.core.controller;

import tools.jackson.databind.ObjectMapper;
import com.jobtracker.core.dto.JobDetailResponse;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class JobControllerTests {

    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String INTERNAL_TOKEN_VALUE = "test-internal-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository users;

    @Autowired
    private ObjectMapper objectMapper;

    private Long createUser(String username) {
        return users.save(new User(username, "hash")).getId();
    }

    @Test
    void createJobPersistsSourceJobAndInitialStageEvent() throws Exception {
        Long ownerId = createUser("job_alice");

        mockMvc.perform(post("/jobs")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"company":"Acme","role":"Backend Engineer",
                         "sourceCategory":"REFERRAL_APPLIED",
                         "url":"https://acme.com/jobs/1","location":"REMOTE",
                         "compMin":150000,"compMax":180000,"notes":"spoke to Kim"}
                        """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.company").value("Acme"))
            .andExpect(jsonPath("$.currentStage").value("RESUME_CHECK"))
            .andExpect(jsonPath("$.outcome").value("ACTIVE"))
            .andExpect(jsonPath("$.notes").value("spoke to Kim"))
            .andExpect(jsonPath("$.stageEvents", hasSize(1)))
            .andExpect(jsonPath("$.stageEvents[0].stage").value("RESUME_CHECK"));
    }

    @Test
    void createJobRejectsMissingCompany() throws Exception {
        Long ownerId = createUser("job_bob");

        mockMvc.perform(post("/jobs")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"role":"Backend Engineer","sourceCategory":"SELF_APPLIED"}
                        """))
            .andExpect(status().isBadRequest());
    }

    @Test
    void listJobsReturnsOnlyCallersJobs() throws Exception {
        Long ownerId = createUser("job_carol");
        Long otherId = createUser("job_dave");

        createJobFor(ownerId, "Carol's Co");
        createJobFor(otherId, "Dave's Co");

        mockMvc.perform(get("/jobs")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].company").value("Carol's Co"));
    }

    // Covers the batched query path in JobService.listJobs (findAllWithInterviewersByJobOwnerId)
    // end-to-end against a real DB: a job with two interview rounds should report the later
    // round as latestInterview and roundCount=2, while a job with none gets latestInterview=null.
    @Test
    void listJobsReportsLatestInterviewAndRoundCountPerJob() throws Exception {
        Long ownerId = createUser("job_round_count");
        Long jobWithInterviews = createJobFor(ownerId, "Acme");
        createJobFor(ownerId, "NoInterviewsCo");

        mockMvc.perform(post("/interviews")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"jobId":%d,"stage":"INTERVIEW_SCHEDULING","interviewDateTime":"2026-08-01T18:00:00Z",
                         "interviewType":"RECRUITER_PHONE_SCREEN"}
                        """.formatted(jobWithInterviews)))
            .andExpect(status().isOk());

        mockMvc.perform(post("/interviews")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"jobId":%d,"stage":"INTERVIEW_STAGE","interviewDateTime":"2026-08-14T18:00:00Z",
                         "interviewType":"SYSTEM_DESIGN"}
                        """.formatted(jobWithInterviews)))
            .andExpect(status().isOk());

        mockMvc.perform(get("/jobs")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(2)))
            // listJobs orders by createdAt DESC — "NoInterviewsCo" was created second, so it's index 0.
            .andExpect(jsonPath("$[0].company").value("NoInterviewsCo"))
            .andExpect(jsonPath("$[0].latestInterview").doesNotExist())
            .andExpect(jsonPath("$[1].company").value("Acme"))
            .andExpect(jsonPath("$[1].latestInterview.roundCount").value(2))
            .andExpect(jsonPath("$[1].latestInterview.interviewType").value("SYSTEM_DESIGN"));
    }

    @Test
    void getJobReturns404ForAnotherUsersJob() throws Exception {
        Long ownerId = createUser("job_erin");
        Long otherId = createUser("job_frank");

        Long jobId = createJobFor(ownerId, "Erin's Co");

        mockMvc.perform(get("/jobs/" + jobId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", otherId))
            .andExpect(status().isNotFound());
    }

    @Test
    void getJobReturns200ForOwnJob() throws Exception {
        Long ownerId = createUser("job_grace");
        Long jobId = createJobFor(ownerId, "Grace's Co");

        mockMvc.perform(get("/jobs/" + jobId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.company").value("Grace's Co"));
    }

    @Test
    void requestWithoutInternalTokenIsRejected() throws Exception {
        mockMvc.perform(get("/jobs").header("X-User-Id", 1L))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void updateJobPersistsChangesAndReturns200() throws Exception {
        Long ownerId = createUser("job_isaac");
        Long jobId = createJobFor(ownerId, "Old Co");

        mockMvc.perform(patch("/jobs/" + jobId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"company":"New Co","role":"Engineer","sourceCategory":"SELF_APPLIED",
                         "currentStage":"RECRUITER_CHAT_INVITE","outcome":"ACTIVE"}
                        """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.company").value("New Co"))
            .andExpect(jsonPath("$.currentStage").value("RECRUITER_CHAT_INVITE"));
    }

    @Test
    void updateJobAppendsStageEventWhenStageChanges() throws Exception {
        Long ownerId = createUser("job_julia");
        Long jobId = createJobFor(ownerId, "Acme");

        mockMvc.perform(patch("/jobs/" + jobId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"company":"Acme","role":"Engineer","sourceCategory":"SELF_APPLIED",
                         "currentStage":"RECRUITER_CHAT_INVITE","outcome":"ACTIVE"}
                        """))
            .andExpect(status().isOk());

        mockMvc.perform(get("/jobs/" + jobId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.stageEvents", hasSize(2)))
            .andExpect(jsonPath("$.stageEvents[1].stage").value("RECRUITER_CHAT_INVITE"));
    }

    @Test
    void updateJobReturns404ForAnotherUsersJob() throws Exception {
        Long ownerId = createUser("job_kevin");
        Long otherId = createUser("job_liam");
        Long jobId = createJobFor(ownerId, "Acme");

        mockMvc.perform(patch("/jobs/" + jobId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", otherId)
                .contentType("application/json")
                .content("""
                        {"company":"Acme","role":"Engineer","sourceCategory":"SELF_APPLIED",
                         "currentStage":"RESUME_CHECK","outcome":"ACTIVE"}
                        """))
            .andExpect(status().isNotFound());
    }

    @Test
    void updateJobRejectsMissingCompany() throws Exception {
        Long ownerId = createUser("job_mia");
        Long jobId = createJobFor(ownerId, "Acme");

        mockMvc.perform(patch("/jobs/" + jobId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"role":"Engineer","sourceCategory":"SELF_APPLIED",
                         "currentStage":"RESUME_CHECK","outcome":"ACTIVE"}
                        """))
            .andExpect(status().isBadRequest());
    }

    @Test
    void updateJobIgnoresRejectedReasonWhenOutcomeNotRejected() throws Exception {
        Long ownerId = createUser("job_noah");
        Long jobId = createJobFor(ownerId, "Acme");

        mockMvc.perform(patch("/jobs/" + jobId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("""
                        {"company":"Acme","role":"Engineer","sourceCategory":"SELF_APPLIED",
                         "currentStage":"RESUME_CHECK","outcome":"ACTIVE","rejectedReason":"should be ignored"}
                        """))
            .andExpect(status().isOk());

        mockMvc.perform(get("/jobs/" + jobId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.rejectedReason").doesNotExist());
    }

    @Test
    void deleteJobRemovesJobAndItsStageEvents() throws Exception {
        Long ownerId = createUser("job_olivia");
        Long jobId = createJobFor(ownerId, "Acme");

        mockMvc.perform(delete("/jobs/" + jobId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deleted").value(true));

        mockMvc.perform(get("/jobs/" + jobId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isNotFound());
    }

    @Test
    void deleteJobReturns404ForAnotherUsersJob() throws Exception {
        Long ownerId = createUser("job_peter");
        Long otherId = createUser("job_quinn");
        Long jobId = createJobFor(ownerId, "Acme");

        mockMvc.perform(delete("/jobs/" + jobId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", otherId))
            .andExpect(status().isNotFound());

        mockMvc.perform(get("/jobs/" + jobId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isOk());
    }

    @Test
    void requestWithoutInternalTokenIsRejectedForPatchAndDelete() throws Exception {
        mockMvc.perform(patch("/jobs/1").header("X-User-Id", 1L).contentType("application/json").content("{}"))
            .andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/jobs/1").header("X-User-Id", 1L))
            .andExpect(status().isUnauthorized());
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
}
