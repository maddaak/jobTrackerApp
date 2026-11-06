package com.jobtracker.core.controller;

import com.jayway.jsonpath.JsonPath;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.AccountAiResultRepository;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobImageRepository;
import com.jobtracker.core.repository.ReminderSettingsRepository;
import com.jobtracker.core.repository.ResumeRepository;
import com.jobtracker.core.repository.UserRepository;
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

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class BackupControllerTests {

    private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4 };

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository users;

    @Autowired
    private JobDetailRepository details;

    @Autowired
    private JobImageRepository images;

    @Autowired
    private ResumeRepository resumes;

    @Autowired
    private ReminderSettingsRepository reminderSettings;

    @Autowired
    private AccountAiResultRepository accountAiResults;

    @DynamicPropertySource
    static void mongoProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.mongodb.uri", InMemoryMongo::connectionString);
    }

    // The in-memory Mongo outlives the Postgres rollback, so leftovers would follow the next test.
    @BeforeEach
    void clearMongo() {
        details.deleteAll();
        images.deleteAll();
        resumes.deleteAll();
        reminderSettings.deleteAll();
        accountAiResults.deleteAll();
    }

    private ResultActions as(Long userId, AbstractMockHttpServletRequestBuilder<?> request) throws Exception {
        return mockMvc.perform(request.header("X-Internal-Token", "test-internal-token").header("X-User-Id", userId));
    }

    private Long createJob(Long ownerId, String company) throws Exception {
        String body = as(ownerId, post("/jobs").contentType("application/json")
                .content("{\"company\":\"" + company + "\",\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(body, "$.id")).longValue();
    }

    private byte[] exportOf(Long ownerId) throws Exception {
        return as(ownerId, get("/account/export"))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Disposition", containsString("attachment; filename=\"job-tracker-backup-")))
            .andReturn().getResponse().getContentAsByteArray();
    }

    private ResultActions restore(Long ownerId, byte[] file) throws Exception {
        return as(ownerId, post("/account/restore").contentType("application/json").content(file));
    }

    @Test
    void aBackupRestoresEverythingIntoANewAccountWithLinksFollowingTheNewIds() throws Exception {
        Long from = users.save(new User("backup-from", "hash")).getId();
        Long acme = createJob(from, "Acme");
        Long globex = createJob(from, "Globex");
        as(from, post("/jobs/" + acme + "/links").contentType("application/json")
                .content("{\"targetJobId\":" + globex + ",\"relation\":\"REPLACED_BY\"}")).andExpect(status().isOk());
        as(from, post("/interviews").contentType("application/json")
                .content("{\"jobId\":" + acme + ",\"interviewDateTime\":\"2026-09-01T15:00:00Z\",\"interviewType\":\"SYSTEM_DESIGN\"}"))
            .andExpect(status().isOk());
        as(from, patch("/jobs/" + globex).contentType("application/json")
                .content("{\"company\":\"Globex\",\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\",\"currentStage\":\"OFFER_STAGE\",\"outcome\":\"ACTIVE\"}"))
            .andExpect(status().isOk());
        as(from, put("/jobs/" + globex + "/offer").contentType("application/json")
                .content("{\"baseSalary\":150000,\"bonusPercent\":10,\"equityGrant\":100000,\"vestingYears\":4,\"vestingSchedule\":[5,15,40,40]}"))
            .andExpect(status().isOk());
        as(from, multipart("/jobs/" + acme + "/images").file(new MockMultipartFile("file", "diagram.png", "image/png", PNG)))
            .andExpect(status().isOk());
        as(from, multipart("/resumes").file(new MockMultipartFile("file", "resume.txt", "text/plain",
                "Ten years of backend work".getBytes(StandardCharsets.UTF_8)))).andExpect(status().is2xxSuccessful());
        as(from, put("/reminders/settings").contentType("application/json")
                .content("{\"emailEnabled\":true,\"email\":\"me@example.com\",\"timeZone\":\"America/Chicago\",\"digest\":true,"
                        + "\"digestHour\":7,\"interviewSoon\":true,\"offerDeadline\":true,\"followUp\":false}"))
            .andExpect(status().isOk());
        String roundId = JsonPath.read(as(from, get("/interviews")).andReturn().getResponse().getContentAsString(), "$[0].roundId");
        as(from, put("/interviews/" + roundId + "/ai/debrief").contentType("application/json")
                .content("{\"content\":{\"summary\":\"Went well\"}}")).andExpect(status().isOk());
        as(from, put("/jobs/" + acme + "/ai/prep?interviewType=SYSTEM_DESIGN").contentType("application/json")
                .content("{\"content\":{\"focus\":\"Caching\"}}")).andExpect(status().isOk());
        as(from, put("/jobs/" + acme + "/ai/tailoring").contentType("application/json")
                .content("{\"content\":{\"summary\":\"Close fit\"}}")).andExpect(status().isOk());
        as(from, put("/ai/insights").contentType("application/json")
                .content("{\"content\":{\"summary\":\"Referrals work\"}}")).andExpect(status().isOk());
        as(from, put("/ai/company-brief?company=Acme").contentType("application/json")
                .content("{\"content\":{\"overview\":\"Makes anvils\"}}")).andExpect(status().isOk());

        byte[] backup = exportOf(from);
        Long to = users.save(new User("backup-to", "hash")).getId();

        restore(to, backup)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.jobs").value(2))
            .andExpect(jsonPath("$.images").value(1))
            .andExpect(jsonPath("$.resumes").value(1));

        String jobs = as(to, get("/jobs")).andExpect(jsonPath("$", hasSize(2))).andReturn().getResponse().getContentAsString();
        List<Integer> newIds = JsonPath.read(jobs, "$[*].id");
        List<Number> acmeIds = JsonPath.read(jobs, "$[?(@.company=='Acme')].id");
        List<Number> globexIds = JsonPath.read(jobs, "$[?(@.company=='Globex')].id");
        Long newAcme = acmeIds.get(0).longValue();
        Long newGlobex = globexIds.get(0).longValue();
        assertThat(newIds).doesNotContain(acme.intValue(), globex.intValue());

        as(to, get("/interviews"))
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].jobId").value(newAcme))
            .andExpect(jsonPath("$[0].interviewType").value("SYSTEM_DESIGN"))
            .andExpect(jsonPath("$[0].aiResults.debrief.content.summary").value("Went well"));
        as(to, get("/jobs/" + newAcme + "/detail"))
            .andExpect(jsonPath("$.aiResults.tailoring.content.summary").value("Close fit"))
            .andExpect(jsonPath("$.aiResults['prep:SYSTEM_DESIGN'].content.focus").value("Caching"));
        as(to, get("/ai/company-brief?company=Acme")).andExpect(jsonPath("$.content.overview").value("Makes anvils"));
        // Kept under the old season's id, which the restored season doesn't have, so it isn't carried over.
        as(to, get("/ai/insights")).andExpect(status().isNotFound());
        List<Number> linkedTo = JsonPath.read(jobs, "$[?(@.company=='Acme')].links[0].jobId");
        assertThat(linkedTo.get(0).longValue()).isEqualTo(newGlobex);
        String imageList = as(to, get("/jobs/" + newAcme + "/images")).andReturn().getResponse().getContentAsString();
        as(to, get("/jobs/" + newAcme + "/images/" + JsonPath.read(imageList, "$[0].id"))).andExpect(content().bytes(PNG));
        as(to, get("/offers"))
            .andExpect(jsonPath("$[0].equityByYear[3]").value(40000))
            .andExpect(jsonPath("$[0].annualBonus").value(15000));
        as(to, get("/resumes")).andExpect(jsonPath("$[0].fileName").value("resume.txt"));
        as(to, get("/reminders/settings"))
            .andExpect(jsonPath("$.emailEnabled").value(true))
            .andExpect(jsonPath("$.digestHour").value(7));
        // The original account is untouched.
        as(from, get("/jobs")).andExpect(jsonPath("$", hasSize(2)));
    }

    // Only an empty account, so a second restore can't double every job.
    @Test
    void restoreRefusesAnAccountThatAlreadyHasJobsAndAFileThatIsNotABackup() throws Exception {
        Long owner = users.save(new User("backup-busy", "hash")).getId();
        createJob(owner, "Acme");
        byte[] backup = exportOf(owner);

        restore(owner, backup).andExpect(status().isConflict()).andExpect(jsonPath("$.error", containsString("no jobs")));
        as(owner, get("/jobs")).andExpect(jsonPath("$", hasSize(1)));

        Long empty = users.save(new User("backup-empty", "hash")).getId();
        restore(empty, "{\"hello\":1}".getBytes(StandardCharsets.UTF_8))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error", containsString("isn't a Job Tracker backup")));
        restore(empty, "not json".getBytes(StandardCharsets.UTF_8)).andExpect(status().isBadRequest());
        restore(empty, ("{\"format\":\"job-tracker-backup\",\"version\":99,\"jobs\":[]}").getBytes(StandardCharsets.UTF_8))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error", containsString("newer version")));
    }

    // A backup is a file anyone could write, and its images are served inline, so they pass an upload's checks.
    @Test
    void aRestoredImageIsCheckedLikeAnUploadAndWhatFailsIsLeftOut() throws Exception {
        Long owner = users.save(new User("backup-crafted", "hash")).getId();
        String encode = "\"" + Base64.getEncoder().encodeToString(PNG) + "\"";
        String page = "\"" + Base64.getEncoder().encodeToString("<script>alert(1)</script>".getBytes(StandardCharsets.UTF_8)) + "\"";
        String backup = "{\"format\":\"job-tracker-backup\",\"version\":1,\"jobs\":[{\"id\":1,\"company\":\"Acme\","
                + "\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\",\"currentStage\":\"RESUME_CHECK\","
                + "\"outcome\":\"ACTIVE\",\"createdAt\":\"2026-01-01T00:00:00Z\",\"images\":["
                + "{\"fileName\":\"page.html\",\"contentType\":\"text/html\",\"data\":" + page + "},"
                + "{\"fileName\":\"a\\\"b.png\",\"contentType\":\"text/html\",\"data\":" + encode + "}]}]}";

        restore(owner, backup.getBytes(StandardCharsets.UTF_8)).andExpect(status().isOk()).andExpect(jsonPath("$.images").value(1));

        Long job = ((Number) JsonPath.read(as(owner, get("/jobs")).andReturn().getResponse().getContentAsString(), "$[0].id")).longValue();
        String imageList = as(owner, get("/jobs/" + job + "/images")).andReturn().getResponse().getContentAsString();
        as(owner, get("/jobs/" + job + "/images/" + JsonPath.read(imageList, "$[0].id")))
            .andExpect(header().string("Content-Type", "image/png"))
            .andExpect(header().string("Content-Disposition", "inline; filename=\"ab.png\""));
    }

    // A backup from before V4 names its office locations after New York; each keeps its meaning.
    @Test
    void aPreV4BackupRestoresItsNewYorkLocationsAsAWorkModelAndCity() throws Exception {
        Long owner = users.save(new User("backup-pre-v4", "hash")).getId();
        String job = "{\"id\":%d,\"company\":\"%s\",\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\","
                + "\"location\":%s,\"currentStage\":\"RESUME_CHECK\",\"outcome\":\"ACTIVE\","
                + "\"createdAt\":\"2026-01-0%dT00:00:00Z\"}";
        String backup = "{\"format\":\"job-tracker-backup\",\"version\":1,\"jobs\":["
                + String.format(job, 1, "Acme", "\"NYC_HYBRID\"", 1) + ","
                + String.format(job, 2, "Globex", "\"NYC_IN_PERSON\"", 2) + ","
                + String.format(job, 3, "Initech", "\"REMOTE\"", 3) + ","
                + String.format(job, 4, "Hooli", "null", 4) + "]}";

        restore(owner, backup.getBytes(StandardCharsets.UTF_8)).andExpect(status().isOk());

        as(owner, get("/jobs"))
            .andExpect(jsonPath("$[?(@.company=='Acme')].location").value("HYBRID"))
            .andExpect(jsonPath("$[?(@.company=='Acme')].city").value("New York"))
            .andExpect(jsonPath("$[?(@.company=='Globex')].location").value("ON_SITE"))
            .andExpect(jsonPath("$[?(@.company=='Globex')].city").value("New York"))
            .andExpect(jsonPath("$[?(@.company=='Initech')].city").value(org.hamcrest.Matchers.contains((Object) null)))
            .andExpect(jsonPath("$[?(@.company=='Hooli')].location").value(org.hamcrest.Matchers.contains((Object) null)));

        Long other = users.save(new User("backup-bad-location", "hash")).getId();
        restore(other, backup.replace("REMOTE", "MOON_BASE").getBytes(StandardCharsets.UTF_8))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error", containsString("unknown location")));
    }
}
