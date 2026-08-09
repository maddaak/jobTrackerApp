package com.jobtracker.core.service;

import com.jobtracker.core.dto.ApplyResumeAnalysisRequest;
import com.jobtracker.core.dto.CreateResumeResponse;
import com.jobtracker.core.dto.ResumeAnalysis;
import com.jobtracker.core.dto.ResumeSummaryResponse;
import com.jobtracker.core.dto.ResumeTextResponse;
import com.jobtracker.core.exception.ResumeNotFoundException;
import com.jobtracker.core.model.Resume;
import com.jobtracker.core.repository.ResumeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;

@Service
public class ResumeService {

    private static final Logger log = LoggerFactory.getLogger(ResumeService.class);

    private final ResumeRepository resumes;
    private final ResumeTextExtractor extractor;
    private final ResumeAnalysisParser analysisParser;

    public ResumeService(ResumeRepository resumes, ResumeTextExtractor extractor, ResumeAnalysisParser analysisParser) {
        this.resumes = resumes;
        this.extractor = extractor;
        this.analysisParser = analysisParser;
    }

    // Persist before analysis so the file survives a failed analysis call; stored compressed.
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

    // BFF-internal: re-fetches stored text to feed the AI summarize call.
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
        ResumeAnalysis analysis;
        String status = resume.getAnalysisStatus();
        try {
            analysis = analysisParser.parse(resume.getAnalysisJson());
        } catch (IllegalStateException corruptBlob) {
            // One bad blob must not fail the list, but "ok" with null fields is a lie to the UI.
            log.warn("resume {} has unreadable stored analysis; reporting it as unavailable", resume.getId());
            analysis = null;
            status = Resume.AnalysisStatus.UNAVAILABLE;
        }
        return new ResumeSummaryResponse(
                resume.getId(), resume.getFileName(), resume.getUploadedAt(), status,
                resume.getAnalysisSource(),
                analysis == null ? null : analysis.summary(),
                analysis == null ? null : analysis.skills(),
                analysis == null ? null : analysis.seniority(),
                analysis == null ? null : analysis.roles());
    }
}
