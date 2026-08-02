package com.jobtracker.core.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AuthControllerTests {

    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String INTERNAL_TOKEN_VALUE = "test-internal-token";

    @Autowired
    private MockMvc mockMvc;

    @Test
    void registerCreatesUserAndReturnsToken() throws Exception {
        mockMvc.perform(post("/auth/register")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .contentType("application/json")
                .content("{\"username\":\"alice\",\"password\":\"Str0ng!Pass\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.username").value("alice"))
            .andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test
    void registerRejectsDuplicateUsername() throws Exception {
        String body = "{\"username\":\"bob\",\"password\":\"Str0ng!Pass\"}";
        mockMvc.perform(post("/auth/register")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .contentType("application/json")
                .content(body))
            .andExpect(status().isCreated());

        mockMvc.perform(post("/auth/register")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .contentType("application/json")
                .content(body))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value("username taken"));
    }

    @Test
    void registerRejectsWeakPassword() throws Exception {
        mockMvc.perform(post("/auth/register")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .contentType("application/json")
                .content("{\"username\":\"carol\",\"password\":\"weak\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    void loginSucceedsWithCorrectPassword() throws Exception {
        mockMvc.perform(post("/auth/register")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .contentType("application/json")
                .content("{\"username\":\"dave\",\"password\":\"Str0ng!Pass\"}"))
            .andExpect(status().isCreated());

        mockMvc.perform(post("/auth/login")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .contentType("application/json")
                .content("{\"username\":\"dave\",\"password\":\"Str0ng!Pass\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test
    void loginRejectsWrongPassword() throws Exception {
        mockMvc.perform(post("/auth/register")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .contentType("application/json")
                .content("{\"username\":\"erin\",\"password\":\"Str0ng!Pass\"}"))
            .andExpect(status().isCreated());

        mockMvc.perform(post("/auth/login")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .contentType("application/json")
                .content("{\"username\":\"erin\",\"password\":\"WrongPass1!\"}"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("invalid username or password"));
    }

    @Test
    void loginRejectsUnknownUsernameWithSameGenericError() throws Exception {
        mockMvc.perform(post("/auth/login")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .contentType("application/json")
                .content("{\"username\":\"nobody\",\"password\":\"Str0ng!Pass\"}"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("invalid username or password"));
    }

    @Test
    void requestWithoutInternalTokenIsRejected() throws Exception {
        mockMvc.perform(post("/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"nobody\",\"password\":\"whatever\"}"))
            .andExpect(status().isUnauthorized());
    }
}
