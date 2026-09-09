package com.jobtracker.core.service;

import com.jobtracker.core.dto.JobImageResponse;
import com.jobtracker.core.exception.ImageNotFoundException;
import com.jobtracker.core.exception.ImageTooLargeException;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.exception.UnsupportedImageTypeException;
import com.jobtracker.core.model.ImageType;
import com.jobtracker.core.model.JobImage;
import com.jobtracker.core.repository.JobImageRepository;
import com.jobtracker.core.repository.JobRepository;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;

@Service
public class JobImageService {

    // Mongo caps a document at 16MB, so this has to stay clear of it with room for the metadata.
    static final int MAX_IMAGE_BYTES = 10 * 1024 * 1024;

    // A guard against one job quietly becoming the whole database, not a product limit.
    static final int MAX_IMAGES_PER_JOB = 20;

    private final JobRepository jobs;
    private final JobImageRepository images;

    public JobImageService(JobRepository jobs, JobImageRepository images) {
        this.jobs = jobs;
        this.images = images;
    }

    public List<JobImageResponse> list(Long ownerId, Long jobId) {
        requireOwnedJob(ownerId, jobId);
        return images.findMetadataByJobId(jobId).stream()
                .sorted(Comparator.comparing(JobImage::getUploadedAt))
                .map(this::toResponse)
                .toList();
    }

    public JobImageResponse upload(Long ownerId, Long jobId, String fileName, byte[] data) {
        requireOwnedJob(ownerId, jobId);
        if (data == null || data.length == 0) {
            throw new UnsupportedImageTypeException("the uploaded file is empty");
        }
        if (data.length > MAX_IMAGE_BYTES) {
            throw new ImageTooLargeException("images must be 10MB or smaller");
        }
        if (images.countByJobId(jobId) >= MAX_IMAGES_PER_JOB) {
            throw new UnsupportedImageTypeException("a job can hold at most " + MAX_IMAGES_PER_JOB + " images");
        }
        // Trusting the declared type here is what would let an SVG through as image/png.
        ImageType type = ImageType.detect(data);
        if (type == null) {
            throw new UnsupportedImageTypeException("only PNG, JPEG, and WebP images are supported");
        }
        return toResponse(images.save(new JobImage(jobId, ownerId, safeName(fileName), type, data)));
    }

    // The document, not a DTO: the controller needs the bytes and the stored type together.
    public JobImage download(Long ownerId, Long jobId, String imageId) {
        return requireOwnedImage(ownerId, jobId, imageId);
    }

    public void delete(Long ownerId, Long jobId, String imageId) {
        images.delete(requireOwnedImage(ownerId, jobId, imageId));
    }

    // Called from the job-delete cascade, where ownership is already verified.
    public void deleteAllForJob(Long jobId) {
        images.deleteByJobId(jobId);
    }

    // The name is only ever shown as text, but it reaches a Content-Disposition header.
    private String safeName(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            return "image";
        }
        String cleaned = fileName.replaceAll("[\\r\\n\"\\\\]", "").trim();
        return cleaned.length() > 120 ? cleaned.substring(0, 120) : cleaned;
    }

    private JobImage requireOwnedImage(Long ownerId, Long jobId, String imageId) {
        return images.findByIdAndJobIdAndOwnerId(imageId, jobId, ownerId)
                .orElseThrow(ImageNotFoundException::new);
    }

    private void requireOwnedJob(Long ownerId, Long jobId) {
        jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
    }

    private JobImageResponse toResponse(JobImage image) {
        return new JobImageResponse(image.getId(), image.getFileName(), image.getContentType(),
                image.getSizeBytes(), image.getUploadedAt());
    }
}
