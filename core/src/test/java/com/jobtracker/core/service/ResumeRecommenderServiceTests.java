package com.jobtracker.core.service;

import com.jobtracker.core.dto.JobDetailDocumentResponse;
import com.jobtracker.core.dto.ResumeRecommendationResponse;
import com.jobtracker.core.model.*;
import com.jobtracker.core.repository.JobRepository;
import com.jobtracker.core.repository.ResumeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

class ResumeRecommenderServiceTests {

    @Mock
    private JobRepository jobs;

    @Mock
    private JobDetailService jobDetailService;

    @Mock
    private ResumeRepository resumes;

    private ResumeRecommenderService recommender;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        recommender = new ResumeRecommenderService(jobs, jobDetailService, resumes, new ResumeAnalysisParser(new ObjectMapper()));
    }

    private Job newJob(String role) {
        User owner = new User("alice", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        return new Job("Acme", role, owner, source, null, null, null, null);
    }

    private void stubJob(Long jobId, Long ownerId, String role, String jdText) {
        when(jobs.findByIdAndOwnerId(jobId, ownerId)).thenReturn(Optional.of(newJob(role)));
        // recommend passes the loaded job to getDetail, so stub the Job overload.
        when(jobDetailService.getDetail(any(Job.class))).thenReturn(new JobDetailDocumentResponse(jobId, jdText, "", null, null, null));
    }

    // Fixtures skip the repository, so assign ids here or they'd all be null and collide in the score map.
    private final AtomicInteger nextResumeId = new AtomicInteger();

    private Resume aiAnalyzedResume(String fileName, String summary, List<String> skills, List<String> roles) {
        Resume resume = new Resume(1L, fileName, "application/pdf", new byte[0]);
        ReflectionTestUtils.setField(resume, "id", "resume-" + nextResumeId.incrementAndGet());
        String analysisJson = """
                {"summary":"%s","skills":%s,"seniority":"senior","roles":%s}
                """.formatted(summary, toJsonArray(skills), toJsonArray(roles));
        resume.applyAnalysis(analysisJson, Resume.AnalysisStatus.OK, Resume.AnalysisSource.AI);
        return resume;
    }

    private Resume customSummaryResume(String fileName, String summary) {
        Resume resume = new Resume(1L, fileName, "application/pdf", new byte[0]);
        ReflectionTestUtils.setField(resume, "id", "resume-" + nextResumeId.incrementAndGet());
        String analysisJson = """
                {"summary":"%s","skills":[],"seniority":null,"roles":[]}
                """.formatted(summary);
        resume.applyAnalysis(analysisJson, Resume.AnalysisStatus.OK, Resume.AnalysisSource.CUSTOM);
        return resume;
    }

    private String toJsonArray(List<String> values) {
        return values.stream().map(v -> "\"" + v + "\"").toList().toString();
    }

    @Test
    void recommendsTheCiCdFocusedResumeForACiCdHeavyPosting() {
        Resume backendResume = aiAnalyzedResume("general.pdf", "General backend engineer.",
                List.of("Java", "Backend", "Team Lead"), List.of("Backend Engineer"));
        Resume devProdResume = aiAnalyzedResume("dev-productivity.pdf", "Developer productivity engineer.",
                List.of("CI/CD", "Build Systems", "Platform", "Developer Productivity"), List.of("Platform Engineer"));
        when(resumes.findByOwnerId(1L)).thenReturn(List.of(backendResume, devProdResume));
        stubJob(1L, 1L, "Developer Productivity Engineer",
                "You'll own our CI/CD pipelines, build systems, and platform tooling to improve devex.");

        ResumeRecommendationResponse response = recommender.recommend(1L, 1L);

        assertThat(response.recommendedVariantId()).isEqualTo(devProdResume.getId());
        assertThat(response.recommendedDisplayName()).isEqualTo("dev-productivity.pdf");
        assertThat(response.reason()).startsWith("matched:");
        assertThat(response.variants()).hasSize(2);
    }

    @Test
    void recommendsTheGeneralResumeForAProductBackendTeamLeadPosting() {
        Resume backendResume = aiAnalyzedResume("general.pdf", "General backend engineer.",
                List.of("Java", "Backend", "Team Lead", "Mentoring", "Product"), List.of("Backend Engineer"));
        Resume devProdResume = aiAnalyzedResume("dev-productivity.pdf", "Developer productivity engineer.",
                List.of("CI/CD", "Build Systems", "Platform"), List.of("Platform Engineer"));
        when(resumes.findByOwnerId(1L)).thenReturn(List.of(backendResume, devProdResume));
        stubJob(2L, 1L, "Backend Team Lead",
                "Lead a small backend team, mentoring engineers while partnering with product on scalability.");

        ResumeRecommendationResponse response = recommender.recommend(1L, 2L);

        assertThat(response.recommendedVariantId()).isEqualTo(backendResume.getId());
    }

    @Test
    void returnsNoAnalyzedResumesReasonWhenNoneAreAnalyzed() {
        when(resumes.findByOwnerId(1L)).thenReturn(List.of());
        stubJob(3L, 1L, "Backend Engineer", "We need a backend engineer.");

        ResumeRecommendationResponse response = recommender.recommend(1L, 3L);

        assertThat(response.recommendedVariantId()).isNull();
        assertThat(response.reason()).isEqualTo("no analyzed resumes uploaded yet");
        assertThat(response.variants()).isEmpty();
    }

    @Test
    void returnsNoClearMatchWhenTwoResumesTie() {
        Resume resumeA = aiAnalyzedResume("a.pdf", "Backend engineer.", List.of("backend"), List.of());
        Resume resumeB = customSummaryResume("b.pdf", "Focused on platform work.");
        when(resumes.findByOwnerId(1L)).thenReturn(List.of(resumeA, resumeB));
        // Both resumes score 1, so a tie must report "no clear match" rather than guess.
        stubJob(4L, 1L, "", "this role touches backend and platform work");

        ResumeRecommendationResponse response = recommender.recommend(1L, 4L);

        assertThat(response.scores().get(resumeA.getId())).isEqualTo(response.scores().get(resumeB.getId()));
        assertThat(response.recommendedVariantId()).isNull();
        assertThat(response.reason()).isEqualTo("no clear match");
    }

    @Test
    void returnsNoClearMatchWhenNoResumeHasAnyKeywordSignal() {
        Resume resume = aiAnalyzedResume("a.pdf", "Backend engineer.", List.of("backend"), List.of());
        when(resumes.findByOwnerId(1L)).thenReturn(List.of(resume));
        stubJob(5L, 1L, "", "asdf qwer zxcv 12345 !!!");

        ResumeRecommendationResponse response = recommender.recommend(1L, 5L);

        assertThat(response.recommendedVariantId()).isNull();
        assertThat(response.reason()).isEqualTo("no clear match");
    }

    @Test
    void derivesEmphasisTagsFromCustomSummaryTextWhenNoSkillsOrRolesArePresent() {
        Resume customResume = customSummaryResume("custom.pdf",
                "Deep expertise in Kubernetes infrastructure and platform reliability engineering.");
        when(resumes.findByOwnerId(1L)).thenReturn(List.of(customResume));
        stubJob(6L, 1L, "Platform Reliability Engineer",
                "Own our Kubernetes infrastructure and platform reliability engineering.");

        ResumeRecommendationResponse response = recommender.recommend(1L, 6L);

        assertThat(response.recommendedVariantId()).isEqualTo(customResume.getId());
    }

    @Test
    void recommendsTheGeneralResumeForTheActualDuolingoJdThatUsedToMisPickTheCiCdResume() {
        Resume backendResume = aiAnalyzedResume("general.pdf", "General backend engineer.",
                List.of("Java", "Backend", "Team Lead", "Mentoring", "Product", "Distributed Systems"),
                List.of("Backend Engineer"));
        Resume devProdResume = aiAnalyzedResume("dev-productivity.pdf", "Developer productivity engineer.",
                List.of("CI/CD", "Build Systems", "Platform", "Developer Productivity"), List.of("Platform Engineer"));
        when(resumes.findByOwnerId(1L)).thenReturn(List.of(backendResume, devProdResume));
        stubJob(7L, 1L, "Senior Software Engineer, Backend (Score)", DUOLINGO_JD_TEXT);

        ResumeRecommendationResponse response = recommender.recommend(1L, 7L);

        assertThat(response.recommendedVariantId()).isEqualTo(backendResume.getId());
    }

    // Real posting the old naive matcher mis-picked the CI/CD resume for; regression fixture.
    private static final String DUOLINGO_JD_TEXT = """
            Our mission at Duolingo is to develop the best education in the world and make it
            universally available.

            About the role...

            As the team lead / backend engineer on this small, high-impact team, you'll help
            make learners care about their score as much as they care about their streak.
            You'll partner closely with the Score Pillar's product and design team.

            You will...
            Lead a small team (3 engineers including yourself), owning both technical direction
            and day-to-day execution.
            Touch critical backend services like user-tree-backend and session-generator, which
            define score calculation, proficiency modeling, and multiple score entry points.
            Collaborate on software projects with product and design.
            Develop, release, and maintain backend services and/or infrastructure.

            You have...
            Experience programming in Java, Python, or Kotlin.
            Interest in growing into (or continuing to develop as) a technical team lead.

            Exceptional candidates will have...
            Experience working with product and design teams to improve engagement.
            Prior experience leading or mentoring engineers on a small team.
            """;
}
