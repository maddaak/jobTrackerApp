package com.jobtracker.core.controller;

import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.ReminderSettingsRepository;
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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ReminderControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository users;

    @Autowired
    private ReminderSettingsRepository settings;

    @DynamicPropertySource
    static void mongoProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.mongodb.uri", InMemoryMongo::connectionString);
    }

    @BeforeEach
    void clearSettings() {
        settings.deleteAll();
    }

    private ResultActions call(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request,
            Long ownerId) throws Exception {
        return mockMvc.perform(request
                .header("X-Internal-Token", "test-internal-token")
                .header("X-User-Id", ownerId)
                .contentType("application/json"));
    }

    private static String body(String email, String zone) {
        return "{\"emailEnabled\":true,\"email\":\"" + email + "\",\"timeZone\":\"" + zone + "\",\"digest\":true,"
                + "\"digestHour\":7,\"interviewSoon\":true,\"offerDeadline\":false,\"followUp\":true}";
    }

    @Test
    void startsWithEmailOffAndNoAddressAndSaysEmailIsNotSetUp() throws Exception {
        Long ownerId = users.save(new User("reminder-defaults", "hash")).getId();

        call(get("/reminders/settings"), ownerId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.emailConfigured").value(false))
                .andExpect(jsonPath("$.emailEnabled").value(false))
                .andExpect(jsonPath("$.email").doesNotExist())
                .andExpect(jsonPath("$.digest").value(true))
                .andExpect(jsonPath("$.digestHour").value(8));
    }

    @Test
    void savesEachPersonsChoicesSeparately() throws Exception {
        Long ownerId = users.save(new User("reminder-saver", "hash")).getId();
        Long someoneElse = users.save(new User("reminder-other", "hash")).getId();

        call(put("/reminders/settings").content(body("me@example.com", "America/Chicago")), ownerId)
                .andExpect(status().isOk());

        call(get("/reminders/settings"), ownerId)
                .andExpect(jsonPath("$.emailEnabled").value(true))
                .andExpect(jsonPath("$.email").value("me@example.com"))
                .andExpect(jsonPath("$.timeZone").value("America/Chicago"))
                .andExpect(jsonPath("$.digestHour").value(7))
                .andExpect(jsonPath("$.offerDeadline").value(false));
        call(get("/reminders/settings"), someoneElse).andExpect(jsonPath("$.email").doesNotExist());
    }

    @Test
    void refusesAnAddressThatIsNotOneAndAnHourThatDoesNotExist() throws Exception {
        Long ownerId = users.save(new User("reminder-invalid", "hash")).getId();

        call(put("/reminders/settings").content(body("not-an-email", "America/Chicago")), ownerId)
                .andExpect(status().isBadRequest());
        call(put("/reminders/settings").content(body("me@example.com", "America/Chicago").replace("\"digestHour\":7", "\"digestHour\":24")), ownerId)
                .andExpect(status().isBadRequest());
    }

    @Test
    void theTestEmailSaysTheServerHasNoMailSettings() throws Exception {
        Long ownerId = users.save(new User("reminder-test", "hash")).getId();

        call(post("/reminders/test"), ownerId)
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("SMTP")));
    }

    // The board's list needs no email set up: a contact whose day has come shows, one still ahead doesn't.
    @Test
    void listsContactsDueForAFollowUpWithoutEmailSetUp() throws Exception {
        Long ownerId = users.save(new User("follow-up-list", "hash")).getId();
        String created = call(post("/jobs").content(
                "{\"company\":\"Initech\",\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\"}"), ownerId)
                .andReturn().getResponse().getContentAsString();
        Number jobId = com.jayway.jsonpath.JsonPath.read(created, "$.id");
        java.time.LocalDate today = java.time.LocalDate.now(java.time.ZoneOffset.UTC);
        call(put("/jobs/" + jobId + "/detail").content("{\"contacts\":["
                + "{\"name\":\"Dana\",\"role\":\"RECRUITER\",\"followUpOn\":\"" + today.minusDays(1) + "\"},"
                + "{\"name\":\"Later\",\"role\":\"REFERRER\",\"followUpOn\":\"" + today.plusDays(5) + "\"}]}"), ownerId)
                .andExpect(status().isOk());

        call(get("/reminders/follow-ups"), ownerId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].contactName").value("Dana"))
                .andExpect(jsonPath("$[0].company").value("Initech"))
                .andExpect(jsonPath("$[0].contactRole").value("RECRUITER"));
    }
}
