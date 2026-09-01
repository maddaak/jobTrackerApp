package com.jobtracker.core.controller;

import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.JobImageRepository;
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
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Covers what only the HTTP layer decides: the headers a browser acts on, and the codes bad bytes get.
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class JobImageControllerTests {

    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String INTERNAL_TOKEN_VALUE = "test-internal-token";

    private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4 };

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository users;

    @Autowired
    private JobImageRepository images;

    @DynamicPropertySource
    static void mongoProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.mongodb.uri", InMemoryMongo::connectionString);
    }

    // The in-memory Mongo outlives the Postgres rollback, so leftovers would follow the next test.
    @BeforeEach
    void clearImages() {
        images.deleteAll();
    }

    private Long createUser(String username) {
        return users.save(new User(username, "hash")).getId();
    }

    private Long createJob(Long ownerId) throws Exception {
        String body = mockMvc.perform(post("/jobs")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("{\"company\":\"Globex\",\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\"}"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return Long.valueOf(body.replaceAll(".*\"id\":(\\d+).*", "$1"));
    }

    private String upload(Long ownerId, Long jobId, String fileName, byte[] bytes) throws Exception {
        String body = mockMvc.perform(multipart("/jobs/" + jobId + "/images")
                .file(new MockMultipartFile("file", fileName, "image/png", bytes))
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return body.replaceAll(".*\"id\":\"([^\"]+)\".*", "$1");
    }

    @Test
    void uploadThenListReturnsTheAttachmentWithoutItsBytes() throws Exception {
        Long ownerId = createUser("img_alice");
        Long jobId = createJob(ownerId);
        upload(ownerId, jobId, "diagram.png", PNG);

        mockMvc.perform(get("/jobs/" + jobId + "/images")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].fileName").value("diagram.png"))
            .andExpect(jsonPath("$[0].contentType").value("image/png"))
            .andExpect(jsonPath("$[0].sizeBytes").value(PNG.length))
            // Listing must never carry the file itself, or opening a job pulls every screenshot.
            .andExpect(jsonPath("$[0].data").doesNotExist());
    }

    @Test
    void downloadServesTheBytesInlineWithNosniff() throws Exception {
        Long ownerId = createUser("img_bob");
        Long jobId = createJob(ownerId);
        String imageId = upload(ownerId, jobId, "diagram.png", PNG);

        mockMvc.perform(get("/jobs/" + jobId + "/images/" + imageId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Type", "image/png"))
            // Inline is what makes the link open the image rather than download it.
            .andExpect(header().string("Content-Disposition", "inline; filename=\"diagram.png\""))
            .andExpect(header().string("X-Content-Type-Options", "nosniff"))
            .andExpect(content().bytes(PNG));
    }

    @Test
    void anSvgUploadIsRejectedEvenWithAPngNameAndType() throws Exception {
        Long ownerId = createUser("img_carol");
        Long jobId = createJob(ownerId);
        byte[] svg = "<svg onload=\"alert(1)\"/>".getBytes(StandardCharsets.UTF_8);

        mockMvc.perform(multipart("/jobs/" + jobId + "/images")
                .file(new MockMultipartFile("file", "diagram.png", "image/png", svg))
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isBadRequest());
    }

    @Test
    void anOversizedUploadIs413LikeTheMultipartCap() throws Exception {
        Long ownerId = createUser("img_frank");
        Long jobId = createJob(ownerId);
        byte[] huge = new byte[10 * 1024 * 1024 + 1];
        System.arraycopy(PNG, 0, huge, 0, PNG.length);

        // The bff answers its own cap with 413, so core must not answer the same refusal with 400.
        mockMvc.perform(multipart("/jobs/" + jobId + "/images")
                .file(new MockMultipartFile("file", "huge.png", "image/png", huge))
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isPayloadTooLarge());
    }

    @Test
    void anotherUsersImageIsNotReachableByItsId() throws Exception {
        Long ownerId = createUser("img_dave");
        Long jobId = createJob(ownerId);
        String imageId = upload(ownerId, jobId, "diagram.png", PNG);
        Long intruderId = createUser("img_eve");

        mockMvc.perform(get("/jobs/" + jobId + "/images/" + imageId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", intruderId))
            .andExpect(status().isNotFound());
    }

    @Test
    void anImageIsNotReachableThroughAJobItDoesNotBelongTo() throws Exception {
        Long ownerId = createUser("img_ivan");
        Long jobId = createJob(ownerId);
        Long otherJobId = createJob(ownerId);
        String imageId = upload(ownerId, jobId, "diagram.png", PNG);

        mockMvc.perform(get("/jobs/" + otherJobId + "/images/" + imageId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isNotFound());

        mockMvc.perform(delete("/jobs/" + otherJobId + "/images/" + imageId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isNotFound());
    }

    @Test
    void uploadingToAnotherUsersJobIsRejected() throws Exception {
        Long ownerId = createUser("img_frank");
        Long jobId = createJob(ownerId);
        Long intruderId = createUser("img_grace");

        mockMvc.perform(multipart("/jobs/" + jobId + "/images")
                .file(new MockMultipartFile("file", "diagram.png", "image/png", PNG))
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", intruderId))
            .andExpect(status().isNotFound());
    }

    @Test
    void deleteRemovesTheAttachment() throws Exception {
        Long ownerId = createUser("img_heidi");
        Long jobId = createJob(ownerId);
        String imageId = upload(ownerId, jobId, "diagram.png", PNG);

        mockMvc.perform(delete("/jobs/" + jobId + "/images/" + imageId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isOk());

        mockMvc.perform(get("/jobs/" + jobId + "/images")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void deletingTheJobTakesItsAttachmentsWithIt() throws Exception {
        Long ownerId = createUser("img_ivan");
        Long jobId = createJob(ownerId);
        upload(ownerId, jobId, "diagram.png", PNG);

        mockMvc.perform(delete("/jobs/" + jobId)
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId))
            .andExpect(status().isOk());

        // Orphaned image documents would be the biggest thing left behind by a deleted job.
        assertThat(images.countByJobId(jobId)).isZero();
    }

    @Test
    void requestWithoutInternalTokenIsRejected() throws Exception {
        mockMvc.perform(get("/jobs/1/images").header("X-User-Id", 1L))
            .andExpect(status().isUnauthorized());
    }
}
