package com.jobtracker.core.service;

import com.jobtracker.core.dto.JobImageResponse;
import com.jobtracker.core.exception.ImageNotFoundException;
import com.jobtracker.core.exception.ImageTooLargeException;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.exception.UnsupportedImageTypeException;
import com.jobtracker.core.model.*;
import com.jobtracker.core.repository.JobImageRepository;
import com.jobtracker.core.repository.JobRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class JobImageServiceTests {

    private static final Long OWNER = 1L;
    private static final Long JOB_ID = 7L;

    @Mock
    private JobRepository jobs;

    @Mock
    private JobImageRepository images;

    private JobImageService jobImageService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        jobImageService = new JobImageService(jobs, images);

        User owner = new User("alice", "hash");
        ReflectionTestUtils.setField(owner, "id", OWNER);
        Job job = new Job("Globex", "Detection Engineer", owner, SourceCategory.SELF_APPLIED,
                null, null, null, null);
        ReflectionTestUtils.setField(job, "id", JOB_ID);
        when(jobs.findByIdAndOwnerId(JOB_ID, OWNER)).thenReturn(Optional.of(job));
        when(images.save(any(JobImage.class))).thenAnswer(i -> i.getArgument(0));
    }

    private static byte[] png() {
        return new byte[] { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4 };
    }

    private static byte[] jpeg() {
        return new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0, 1, 2, 3, 4, 5, 6, 7, 8 };
    }

    private static byte[] webp() {
        byte[] data = new byte[16];
        System.arraycopy("RIFF".getBytes(StandardCharsets.US_ASCII), 0, data, 0, 4);
        System.arraycopy("WEBP".getBytes(StandardCharsets.US_ASCII), 0, data, 8, 4);
        return data;
    }

    @Test
    void detectsTheSupportedTypesFromTheirMagicBytes() {
        assertThat(ImageType.detect(png())).isEqualTo(ImageType.PNG);
        assertThat(ImageType.detect(jpeg())).isEqualTo(ImageType.JPEG);
        assertThat(ImageType.detect(webp())).isEqualTo(ImageType.WEBP);
    }

    @Test
    void anSvgIsRejectedEvenWhenItClaimsToBeAPng() {
        byte[] svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>"
                .getBytes(StandardCharsets.UTF_8);

        // The filename and declared type are the caller's; only the bytes decide.
        assertThatThrownBy(() -> jobImageService.upload(OWNER, JOB_ID, "diagram.png", svg))
                .isInstanceOf(UnsupportedImageTypeException.class);
        verify(images, never()).save(any());
    }

    @Test
    void aRiffContainerThatIsNotWebpIsRejected() {
        byte[] riffAudio = new byte[16];
        System.arraycopy("RIFF".getBytes(StandardCharsets.US_ASCII), 0, riffAudio, 0, 4);
        System.arraycopy("WAVE".getBytes(StandardCharsets.US_ASCII), 0, riffAudio, 8, 4);

        assertThat(ImageType.detect(riffAudio)).isNull();
    }

    @Test
    void storesTheDetectedTypeRatherThanTheUploadersClaim() {
        JobImageResponse response = jobImageService.upload(OWNER, JOB_ID, "screenshot.jpg", png());

        assertThat(response.contentType()).isEqualTo("image/png");
        assertThat(response.sizeBytes()).isEqualTo(png().length);
    }

    @Test
    void rejectsAnEmptyUpload() {
        assertThatThrownBy(() -> jobImageService.upload(OWNER, JOB_ID, "empty.png", new byte[0]))
                .isInstanceOf(UnsupportedImageTypeException.class);
    }

    @Test
    void rejectsAnImageOverTheSizeLimit() {
        byte[] huge = new byte[JobImageService.MAX_IMAGE_BYTES + 1];
        System.arraycopy(png(), 0, huge, 0, png().length);

        assertThatThrownBy(() -> jobImageService.upload(OWNER, JOB_ID, "huge.png", huge))
                .isInstanceOf(ImageTooLargeException.class);
        verify(images, never()).save(any());
    }

    @Test
    void refusesToExceedThePerJobImageCap() {
        when(images.countByJobId(JOB_ID)).thenReturn((long) JobImageService.MAX_IMAGES_PER_JOB);

        assertThatThrownBy(() -> jobImageService.upload(OWNER, JOB_ID, "one-too-many.png", png()))
                .isInstanceOf(UnsupportedImageTypeException.class);
    }

    @Test
    void uploadingToAJobTheCallerDoesNotOwnIsRejected() {
        when(jobs.findByIdAndOwnerId(99L, OWNER)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> jobImageService.upload(OWNER, 99L, "diagram.png", png()))
                .isInstanceOf(JobNotFoundException.class);
        verify(images, never()).save(any());
    }

    @Test
    void downloadingAnImageTheCallerDoesNotOwnIsRejected() {
        when(images.findByIdAndJobIdAndOwnerId("abc", JOB_ID, OWNER)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> jobImageService.download(OWNER, JOB_ID, "abc"))
                .isInstanceOf(ImageNotFoundException.class);
    }

    @Test
    void reachingAnImageThroughAJobItDoesNotBelongToIsRejected() {
        when(images.findByIdAndJobIdAndOwnerId("abc", 99L, OWNER)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> jobImageService.download(OWNER, 99L, "abc"))
                .isInstanceOf(ImageNotFoundException.class);
        assertThatThrownBy(() -> jobImageService.delete(OWNER, 99L, "abc"))
                .isInstanceOf(ImageNotFoundException.class);
        verify(images, never()).delete(any());
    }

    @Test
    void stripsHeaderBreakingCharactersFromTheFileName() {
        // The name reaches a Content-Disposition header, so a quote or newline could forge one.
        JobImageResponse response = jobImageService.upload(
                OWNER, JOB_ID, "eg\"il\r\nX-Injected: yes.png", png());

        assertThat(response.fileName()).doesNotContain("\"").doesNotContain("\r").doesNotContain("\n");
    }

    @Test
    void namesAPastedScreenshotThatArrivesWithoutAFileName() {
        assertThat(jobImageService.upload(OWNER, JOB_ID, null, png()).fileName()).isNotBlank();
    }
}
