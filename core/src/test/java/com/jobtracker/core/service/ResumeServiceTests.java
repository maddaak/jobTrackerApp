package com.jobtracker.core.service;

import com.jobtracker.core.dto.ApplyResumeAnalysisRequest;
import com.jobtracker.core.dto.CreateResumeResponse;
import com.jobtracker.core.dto.ResumeSummaryResponse;
import com.jobtracker.core.exception.ResumeNotFoundException;
import com.jobtracker.core.model.Resume;
import com.jobtracker.core.repository.ResumeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class ResumeServiceTests {

    @Mock
    private ResumeRepository resumeRepository;

    @Mock
    private ResumeTextExtractor extractor;

    private ResumeService resumeService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        resumeService = new ResumeService(resumeRepository, extractor, new ObjectMapper());
    }

    @Test
    void createResumeExtractsCompressesAndStoresWithPendingStatus() {
        when(extractor.extract("text/plain", "hello world".getBytes())).thenReturn("hello world");
        when(resumeRepository.save(any(Resume.class))).thenAnswer(invocation -> invocation.getArgument(0));

        CreateResumeResponse response =
                resumeService.createResume(1L, "resume.txt", "text/plain", "hello world".getBytes());

        assertThat(response.fileName()).isEqualTo("resume.txt");
        assertThat(response.extractedText()).isEqualTo("hello world");

        ArgumentCaptor<Resume> captor = ArgumentCaptor.forClass(Resume.class);
        verify(resumeRepository).save(captor.capture());
        Resume stored = captor.getValue();
        assertThat(stored.getAnalysisStatus()).isEqualTo(Resume.AnalysisStatus.PENDING);
        assertThat(stored.getAnalysisJson()).isNull();
        assertThat(stored.getExtractedTextCompressed().length).isGreaterThan(0);
    }

    @Test
    void applyAnalysisCachesAnalysisAndListResumesParsesItIntoFields() {
        Resume resume = new Resume(1L, "resume.pdf", "application/pdf", new byte[0]);
        when(resumeRepository.findByIdAndOwnerId("abc", 1L)).thenReturn(Optional.of(resume));
        when(resumeRepository.save(any(Resume.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(resumeRepository.findByOwnerId(1L)).thenReturn(List.of(resume));

        String analysisJson = """
                {"summary":"Backend engineer","skills":["Go","Java"],"seniority":"senior","roles":["Backend Engineer"]}
                """;
        resumeService.applyAnalysis(1L, "abc", new ApplyResumeAnalysisRequest(analysisJson, Resume.AnalysisStatus.OK));

        List<ResumeSummaryResponse> list = resumeService.listResumes(1L);

        assertThat(list).hasSize(1);
        ResumeSummaryResponse summary = list.get(0);
        assertThat(summary.analysisStatus()).isEqualTo(Resume.AnalysisStatus.OK);
        assertThat(summary.summary()).isEqualTo("Backend engineer");
        assertThat(summary.skills()).containsExactly("Go", "Java");
        assertThat(summary.seniority()).isEqualTo("senior");
    }

    @Test
    void applyAnalysisWithFailureStatusLeavesAnalysisFieldsNull() {
        Resume resume = new Resume(1L, "resume.pdf", "application/pdf", new byte[0]);
        when(resumeRepository.findByIdAndOwnerId("abc", 1L)).thenReturn(Optional.of(resume));
        when(resumeRepository.save(any(Resume.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ResumeSummaryResponse response = resumeService.applyAnalysis(
                1L, "abc", new ApplyResumeAnalysisRequest(null, Resume.AnalysisStatus.NOT_CONFIGURED));

        assertThat(response.analysisStatus()).isEqualTo(Resume.AnalysisStatus.NOT_CONFIGURED);
        assertThat(response.summary()).isNull();
    }

    @Test
    void listResumesToleratesMalformedCachedAnalysisJson() {
        Resume resume = new Resume(1L, "resume.pdf", "application/pdf", new byte[0]);
        resume.applyAnalysis("not valid json", Resume.AnalysisStatus.OK);
        when(resumeRepository.findByOwnerId(1L)).thenReturn(List.of(resume));

        List<ResumeSummaryResponse> list = resumeService.listResumes(1L);

        assertThat(list).hasSize(1);
        assertThat(list.get(0).summary()).isNull();
    }

    @Test
    void applyAnalysisThrowsResumeNotFoundExceptionForAnotherUsersResume() {
        when(resumeRepository.findByIdAndOwnerId("abc", 999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> resumeService.applyAnalysis(
                999L, "abc", new ApplyResumeAnalysisRequest("{}", Resume.AnalysisStatus.OK)))
                .isInstanceOf(ResumeNotFoundException.class);
    }

    @Test
    void deleteResumeThrowsResumeNotFoundExceptionForAnotherUsersResume() {
        when(resumeRepository.findByIdAndOwnerId("abc", 999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> resumeService.deleteResume(999L, "abc"))
                .isInstanceOf(ResumeNotFoundException.class);

        verify(resumeRepository, never()).delete(any(Resume.class));
    }

    @Test
    void deleteResumeRemovesIt() {
        Resume resume = new Resume(1L, "resume.pdf", "application/pdf", new byte[0]);
        when(resumeRepository.findByIdAndOwnerId("abc", 1L)).thenReturn(Optional.of(resume));

        resumeService.deleteResume(1L, "abc");

        verify(resumeRepository).delete(resume);
    }
}
