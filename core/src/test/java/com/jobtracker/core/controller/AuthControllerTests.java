package com.jobtracker.core.controller;

import com.jobtracker.core.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AuthControllerTests {

    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String INTERNAL_TOKEN_VALUE = "test-internal-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository users;

    private ResultActions postAuth(String path, String body) throws Exception {
        return mockMvc.perform(post("/auth/" + path)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .contentType("application/json")
                .content(body));
    }

    private ResultActions register(String username, String password) throws Exception {
        return postAuth("register", "{\"name\":\"Pat Lee\",\"email\":\"pat@example.com\",\"username\":\"" + username
                + "\",\"password\":\"" + password + "\"}");
    }

    private static String credentials(String username, String password) {
        return "{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}";
    }

    @Test
    void registerCreatesUserAndReturnsToken() throws Exception {
        register("alice", "Str0ng!Pass")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.username").value("alice"))
            .andExpect(jsonPath("$.token").isNotEmpty());
        mockMvc.perform(get("/account").header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", users.findByUsername("alice").orElseThrow().getId()))
            .andExpect(jsonPath("$.name").value("Pat Lee"))
            .andExpect(jsonPath("$.email").value("pat@example.com"));
    }

    @Test
    void registerNeedsANameAndARealEmail() throws Exception {
        postAuth("register", "{\"email\":\"pat@example.com\",\"username\":\"noname\",\"password\":\"Str0ng!Pass\"}")
            .andExpect(status().isBadRequest());
        postAuth("register", "{\"name\":\"Pat\",\"email\":\"not-an-email\",\"username\":\"badmail\",\"password\":\"Str0ng!Pass\"}")
            .andExpect(status().isBadRequest());
    }

    @Test
    void registerRejectsDuplicateUsername() throws Exception {
        register("bob", "Str0ng!Pass").andExpect(status().isCreated());

        register("bob", "Str0ng!Pass")
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value("username taken"));
    }

    @Test
    void registerRejectsWeakPassword() throws Exception {
        register("carol", "weak")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    void loginSucceedsWithCorrectPassword() throws Exception {
        register("dave", "Str0ng!Pass").andExpect(status().isCreated());

        postAuth("login", credentials("dave", "Str0ng!Pass"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test
    void loginRejectsWrongPassword() throws Exception {
        register("erin", "Str0ng!Pass").andExpect(status().isCreated());

        postAuth("login", credentials("erin", "WrongPass1!"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("invalid username or password"));
    }

    @Test
    void loginRejectsUnknownUsernameWithSameGenericError() throws Exception {
        postAuth("login", credentials("nobody", "Str0ng!Pass"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("invalid username or password"));
    }

    @Test
    void requestWithoutInternalTokenIsRejected() throws Exception {
        mockMvc.perform(post("/auth/login")
                .contentType("application/json")
                .content(credentials("nobody", "whatever")))
            .andExpect(status().isUnauthorized());
    }

    // The forgot form must not say whether an account exists, or whether email could be sent.
    @Test
    void forgotPasswordAnswersTheSameForAnyUsername() throws Exception {
        register("fiona", "Str0ng!Pass").andExpect(status().isCreated());

        postAuth("forgot-password", "{\"username\":\"fiona\"}").andExpect(status().isAccepted());
        postAuth("forgot-password", "{\"username\":\"nobody\"}").andExpect(status().isAccepted());
    }

    @Test
    void aTemporaryPasswordLogsInAndCanBeChangedFromProfile() throws Exception {
        register("gabe", "Str0ng!Pass").andExpect(status().isCreated());
        Long id = users.findByUsername("gabe").orElseThrow().getId();

        String body = postAuth("temporary-password", "{\"username\":\"Gabe\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.temporaryPassword", startsWith("Tmp-")))
            .andReturn().getResponse().getContentAsString();
        String temporary = com.jayway.jsonpath.JsonPath.read(body, "$.temporaryPassword");

        postAuth("login", credentials("gabe", "Str0ng!Pass")).andExpect(status().isUnauthorized());
        postAuth("login", credentials("gabe", temporary)).andExpect(status().isOk());

        mockMvc.perform(put("/account/password").header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE).header("X-User-Id", id)
                .contentType("application/json")
                .content("{\"currentPassword\":\"" + temporary + "\",\"newPassword\":\"N3w!Password\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").isNotEmpty());
        postAuth("login", credentials("gabe", "N3w!Password")).andExpect(status().isOk());

        postAuth("temporary-password", "{\"username\":\"nobody\"}").andExpect(status().isNotFound());
    }

    // As the bff sends it: the version the session's token was signed with.
    private ResultActions asSession(MockHttpServletRequestBuilder request, Long id, int version) throws Exception {
        return mockMvc.perform(request.header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE).header("X-User-Id", id)
                .header("X-Session-Version", version).contentType("application/json"));
    }

    // A new password, or "sign out other devices", ends every session but the one asking, which gets a fresh
    // token; a session still on the old version is refused from then on, a stolen cookie included.
    @Test
    void aNewPasswordOrSigningOutOtherDevicesEndsEverySessionButThisOne() throws Exception {
        register("hana", "Str0ng!Pass").andExpect(status().isCreated());
        Long id = users.findByUsername("hana").orElseThrow().getId();
        asSession(get("/account"), id, 0).andExpect(status().isOk());

        asSession(put("/account/password").content("{\"currentPassword\":\"Str0ng!Pass\",\"newPassword\":\"N3w!Password\"}"), id, 0)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").isNotEmpty());
        asSession(get("/account"), id, 0)
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("this session was signed out; sign in again"));
        asSession(get("/account"), id, 1).andExpect(status().isOk());

        asSession(post("/account/sessions/end-others"), id, 1)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("hana"))
            .andExpect(jsonPath("$.token").isNotEmpty());
        asSession(get("/account"), id, 1).andExpect(status().isUnauthorized());
        asSession(get("/account"), id, 2).andExpect(status().isOk());
        // What the bff asks on routes that never otherwise reach core, such as fetching a posting.
        asSession(get("/account/session"), id, 1).andExpect(status().isUnauthorized());
        asSession(get("/account/session"), id, 2).andExpect(status().isNoContent());
        // An account that's gone has no session to keep.
        asSession(get("/account"), 999_999L, 0).andExpect(status().isUnauthorized());
    }

    // Counted in the database, so restarting the app doesn't hand out a fresh day's worth of AI calls.
    @Test
    void theDaysAiCallsStopAtTheLimitTheBffSends() throws Exception {
        for (int i = 0; i < 2; i++) {
            mockMvc.perform(post("/ai-usage").param("limit", "2").header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE))
                .andExpect(status().isNoContent());
        }

        mockMvc.perform(post("/ai-usage").param("limit", "2").header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE))
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.error").value(
                "the daily limit of 2 AI calls is used up; it resets at midnight UTC (AI_DAILY_LIMIT in .env)"));
        mockMvc.perform(post("/ai-usage").param("limit", "3").header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE))
            .andExpect(status().isNoContent());
    }

    @Test
    void repeatedWrongPasswordsMakeTheAccountWaitAndSayHowLong() throws Exception {
        register("ivan", "Str0ng!Pass").andExpect(status().isCreated());
        for (int i = 0; i < 5; i++) {
            postAuth("login", credentials("ivan", "WrongPass1!")).andExpect(status().isUnauthorized());
        }

        postAuth("login", credentials("ivan", "Str0ng!Pass"))
            .andExpect(status().isTooManyRequests())
            .andExpect(header().string("Retry-After", "30"))
            .andExpect(jsonPath("$.error").value("too many failed sign-ins for this account. Try again in 30 seconds"));
    }
}
