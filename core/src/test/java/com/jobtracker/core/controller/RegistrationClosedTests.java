package com.jobtracker.core.controller;

import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// The shipped default, which the shared test settings open up so other tests can register freely.
@SpringBootTest(properties = "app.registration-open=false")
@AutoConfigureMockMvc
@Transactional
class RegistrationClosedTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository users;

    @Test
    void onceAnAccountExistsRegistrationIsClosedAndSaysHowToOpenIt() throws Exception {
        users.save(new User("owner", "hash"));

        mockMvc.perform(get("/auth/registration").header("X-Internal-Token", "test-internal-token"))
            .andExpect(jsonPath("$.open").value(false));
        mockMvc.perform(post("/auth/register")
                .header("X-Internal-Token", "test-internal-token")
                .contentType("application/json")
                .content("{\"name\":\"Pat\",\"email\":\"pat@example.com\",\"username\":\"second\",\"password\":\"Str0ng!Pass\"}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error", containsString("REGISTRATION_OPEN")));
    }
}
