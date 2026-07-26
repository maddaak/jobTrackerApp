package com.jobtracker.core.service;

import com.jobtracker.core.dto.ApplyResumeAnalysisRequest;
import com.jobtracker.core.dto.CreateResumeResponse;
import com.jobtracker.core.dto.ResumeAnalysis;
import com.jobtracker.core.dto.ResumeSummaryResponse;
import com.jobtracker.core.exception.ResumeNotFoundException;
import com.jobtracker.core.model.Resume;
import com.jobtracker.core.repository.ResumeRepository;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.zip.GZIPOutputStream;

@Service
public class ResumeService {

    private final ResumeRepository resumes;
    private final ResumeTextExtractor extractor;
    private final ObjectMapper objectMapper;

    public ResumeService(ResumeRepository resumes, ResumeTextExtractor extractor, ObjectMapper objectMapper) {
        this.resumes = resumes;
        this.extractor = extractor;
        this.objectMapper = objectMapper;
    }

    // Stores the resume immediately, before any analysis is attempted — the file is never
    // lost even if the (separate, BFF-orchestrated) analysis call fails. extractedText is
    // returned in plaintext here only, so the caller can hand it to the analyzer without a
    // second round trip; it's persisted compressed, never persisted in plaintext.
    public CreateResumeResponse createResume(Long ownerId, String fileName, String contentType, byte[] bytes) {
        String text = extractor.extract(contentType, bytes);
        Resume resume = resumes.save(new Resume(ownerId, fileName, contentType, compress(text)));
        return new CreateResumeResponse(resume.getId(), resume.getFileName(), text, resume.getUploadedAt());
    }

    public ResumeSummaryResponse applyAnalysis(Long ownerId, String id, ApplyResumeAnalysisRequest request) {
        Resume resume = resumes.findByIdAndOwnerId(id, ownerId).orElseThrow(ResumeNotFoundException::new);
        resume.applyAnalysis(request.analysisJson(), request.status());
        return toSummary(resumes.save(resume));
    }

    public List<ResumeSummaryResponse> listResumes(Long ownerId) {
        return resumes.findByOwnerId(ownerId).stream().map(this::toSummary).toList();
    }

    public void deleteResume(Long ownerId, String id) {
        Resume resume = resumes.findByIdAndOwnerId(id, ownerId).orElseThrow(ResumeNotFoundException::new);
        resumes.delete(resume);
    }

    private ResumeSummaryResponse toSummary(Resume resume) {
        ResumeAnalysis analysis = parseAnalysis(resume.getAnalysisJson());
        return new ResumeSummaryResponse(
                resume.getId(), resume.getFileName(), resume.getUploadedAt(), resume.getAnalysisStatus(),
                analysis == null ? null : analysis.summary(),
                analysis == null ? null : analysis.skills(),
                analysis == null ? null : analysis.seniority(),
                analysis == null ? null : analysis.roles());
    }

    private ResumeAnalysis parseAnalysis(String analysisJson) {
        if (analysisJson == null) {
            return null;
        }
        try {
            return objectMapper.readValue(analysisJson, ResumeAnalysis.class);
        } catch (RuntimeException e) {
            return null;
        }
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
}
