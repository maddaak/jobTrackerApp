package com.jobtracker.core.service;

import com.jobtracker.core.dto.JobDetailDocumentResponse;
import com.jobtracker.core.dto.UpdateJobDetailRequest;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

@Service
public class JobDetailService {

    private final JobRepository jobs;
    private final JobDetailRepository jobDetails;

    public JobDetailService(JobRepository jobs, JobDetailRepository jobDetails) {
        this.jobs = jobs;
        this.jobDetails = jobDetails;
    }

    public JobDetailDocumentResponse getDetail(Long ownerId, Long jobId) {
        requireOwnedJob(ownerId, jobId);
        return jobDetails.findByJobId(jobId)
                .map(this::toResponse)
                .orElse(new JobDetailDocumentResponse(jobId, "", ""));
    }

    public JobDetailDocumentResponse updateDetail(Long ownerId, Long jobId, UpdateJobDetailRequest request) {
        requireOwnedJob(ownerId, jobId);
        JobDetail detail = jobDetails.findByJobId(jobId)
                .orElseGet(() -> new JobDetail(jobId, compress(""), ""));
        detail.update(compress(request.jdText()), request.interviewNotes());
        return toResponse(jobDetails.save(detail));
    }

    private void requireOwnedJob(Long ownerId, Long jobId) {
        jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
    }

    private JobDetailDocumentResponse toResponse(JobDetail detail) {
        return new JobDetailDocumentResponse(
                detail.getJobId(), decompress(detail.getJdTextCompressed()), detail.getInterviewNotes());
    }

    private byte[] compress(String text) {
        String safe = text == null ? "" : text;
        ByteArrayOutputStream byteStream = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(byteStream)) {
            gzip.write(safe.getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return byteStream.toByteArray();
    }

    private String decompress(byte[] compressed) {
        if (compressed == null || compressed.length == 0) {
            return "";
        }
        try (GZIPInputStream gzip = new GZIPInputStream(new ByteArrayInputStream(compressed))) {
            return new String(gzip.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
