package com.jobtracker.core.service;

import com.jobtracker.core.dto.ApplyResumeAnalysisRequest;
import com.jobtracker.core.dto.CreateResumeResponse;
import com.jobtracker.core.dto.ResumeAnalysis;
import com.jobtracker.core.dto.ResumeSummaryResponse;
import com.jobtracker.core.dto.ResumeTextResponse;
import com.jobtracker.core.exception.ResumeNotFoundException;
import com.jobtracker.core.model.Resume;
import com.jobtracker.core.repository.ResumeRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;

@Service
public class ResumeService {

    private final ResumeRepository resumes;
    private final ResumeTextExtractor extractor;
    private final ResumeAnalysisParser analysisParser;

    public ResumeService(ResumeRepository resumes, ResumeTextExtractor extractor, ResumeAnalysisParser analysisParser) {
        this.resumes = resumes;
        this.extractor = extractor;
        this.analysisParser = analysisParser;
    }

    // Stores the resume immediately, before any analysis is attempted, so the file is never
    // lost even if the (separate, BFF-orchestrated) analysis call fails. extractedText is
    // returned in plaintext here only, so the caller can hand it to the analyzer without a
    // second round trip; it's persisted compressed, never persisted in plaintext.
    public CreateResumeResponse createResume(Long ownerId, MultipartFile file) {
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        String text = extractor.extract(file.getContentType(), bytes);
        Resume resume = resumes.save(
                new Resume(ownerId, file.getOriginalFilename(), file.getContentType(), Gzip.compress(text)));
        return new CreateResumeResponse(resume.getId(), resume.getFileName(), text, resume.getUploadedAt());
    }

    public ResumeSummaryResponse applyAnalysis(Long ownerId, String id, ApplyResumeAnalysisRequest request) {
        Resume resume = resumes.findByIdAndOwnerId(id, ownerId).orElseThrow(ResumeNotFoundException::new);
        resume.applyAnalysis(request.analysisJson(), request.status(), request.source());
        return toSummary(resumes.save(resume));
    }

    // BFF-internal: fetches the stored text back out so it can hand it to the scraper's
    // Claude call when the user picks "summarize with AI", including for a resume that's
    // still pending from an earlier session, not just the one just uploaded.
    public ResumeTextResponse getExtractedText(Long ownerId, String id) {
        Resume resume = resumes.findByIdAndOwnerId(id, ownerId).orElseThrow(ResumeNotFoundException::new);
        return new ResumeTextResponse(resume.getId(), Gzip.decompress(resume.getExtractedTextCompressed()));
    }

    public List<ResumeSummaryResponse> listResumes(Long ownerId) {
        return resumes.findByOwnerId(ownerId).stream().map(this::toSummary).toList();
    }

    public void deleteResume(Long ownerId, String id) {
        Resume resume = resumes.findByIdAndOwnerId(id, ownerId).orElseThrow(ResumeNotFoundException::new);
        resumes.delete(resume);
    }

    private ResumeSummaryResponse toSummary(Resume resume) {
        ResumeAnalysis analysis = analysisParser.parse(resume.getAnalysisJson());
        return new ResumeSummaryResponse(
                resume.getId(), resume.getFileName(), resume.getUploadedAt(), resume.getAnalysisStatus(),
                resume.getAnalysisSource(),
                analysis == null ? null : analysis.summary(),
                analysis == null ? null : analysis.skills(),
                analysis == null ? null : analysis.seniority(),
                analysis == null ? null : analysis.roles());
    }
}
