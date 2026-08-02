package com.jobtracker.core.service;

import com.jobtracker.core.dto.ResumeAnalysis;
import com.jobtracker.core.dto.ResumeRecommendationResponse;
import com.jobtracker.core.dto.ResumeVariantSummary;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.Resume;
import com.jobtracker.core.model.ResumeVariant;
import com.jobtracker.core.repository.JobRepository;
import com.jobtracker.core.repository.ResumeRepository;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

// Phase 1 (rules) of FEATURE_resume_recommender.md: matches a job's title + description
// against each of the caller's own analyzed resumes and picks the best fit. Deterministic and
// free, no LLM call. Resume "variants" are never hardcoded here: every user brings their
// own resumes (uploaded and summarized via ResumeService/ResumesPage), so this reads them
// straight from Mongo rather than from a fixed list baked into the app.
@Service
public class ResumeRecommenderService {

    // Title hits are a stronger signal than body hits: a short, deliberate job title
    // mentioning "backend" or "platform" says more than one incidental body mention.
    private static final int TITLE_WEIGHT = 3;
    private static final int BODY_WEIGHT = 1;
    private static final int MAX_REASON_KEYWORDS = 3;
    private static final int MIN_TOKEN_LENGTH = 3;

    // Only used to derive emphasis keywords from a *custom* (non-AI) summary, which has no
    // structured skills/roles list to fall back on, trimmed to the words that would otherwise
    // dominate every summary and carry no matching signal.
    private static final Set<String> STOPWORDS = Set.of(
            "the", "and", "for", "with", "from", "that", "this", "will", "have", "into",
            "using", "years", "year", "experience", "experienced", "background", "worked",
            "work", "working", "led", "built", "building", "team", "teams", "role", "roles");

    private final JobRepository jobs;
    private final JobDetailService jobDetailService;
    private final ResumeRepository resumes;
    private final ResumeAnalysisParser analysisParser;

    public ResumeRecommenderService(
            JobRepository jobs, JobDetailService jobDetailService, ResumeRepository resumes,
            ResumeAnalysisParser analysisParser) {
        this.jobs = jobs;
        this.jobDetailService = jobDetailService;
        this.resumes = resumes;
        this.analysisParser = analysisParser;
    }

    public ResumeRecommendationResponse recommend(Long ownerId, Long jobId) {
        Job job = jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
        String titleText = job.getRole() == null ? "" : job.getRole().toLowerCase();
        String bodyText = jobDetailService.getDetail(ownerId, jobId).jdText().toLowerCase();

        List<ResumeVariant> variants = resumes.findByOwnerId(ownerId).stream()
                .filter(r -> Resume.AnalysisStatus.OK.equals(r.getAnalysisStatus()))
                .map(this::toVariant)
                .filter(v -> v != null)
                .toList();

        List<ResumeVariantSummary> variantSummaries = variants.stream()
                .map(v -> new ResumeVariantSummary(v.id(), v.displayName(), v.blurb()))
                .toList();

        if (variants.isEmpty()) {
            return new ResumeRecommendationResponse(null, null, Map.of(), "no analyzed resumes uploaded yet", variantSummaries);
        }

        Map<String, Integer> scores = new LinkedHashMap<>();
        Map<String, Map<String, Integer>> tagHitsByVariant = new LinkedHashMap<>();

        for (ResumeVariant variant : variants) {
            Map<String, Integer> tagHits = new LinkedHashMap<>();
            int score = 0;
            for (String tag : variant.emphasisTags()) {
                int hits = countOccurrences(titleText, tag) * TITLE_WEIGHT + countOccurrences(bodyText, tag) * BODY_WEIGHT;
                if (hits > 0) {
                    tagHits.put(tag, hits);
                }
                score += hits;
            }
            scores.put(variant.id(), score);
            tagHitsByVariant.put(variant.id(), tagHits);
        }

        int maxScore = scores.values().stream().mapToInt(Integer::intValue).max().orElse(0);
        long winnerCount = scores.values().stream().filter(s -> s == maxScore).count();

        if (maxScore == 0 || winnerCount > 1) {
            return new ResumeRecommendationResponse(null, null, scores, "no clear match", variantSummaries);
        }

        ResumeVariant winner = variants.stream().filter(v -> scores.get(v.id()) == maxScore).findFirst().orElseThrow();
        String reason = "matched: " + topKeywords(tagHitsByVariant.get(winner.id()));

        return new ResumeRecommendationResponse(winner.id(), winner.displayName(), scores, reason, variantSummaries);
    }

    private ResumeVariant toVariant(Resume resume) {
        ResumeAnalysis analysis = analysisParser.parse(resume.getAnalysisJson());
        if (analysis == null || analysis.summary() == null || analysis.summary().isBlank()) {
            return null;
        }
        return new ResumeVariant(resume.getId(), resume.getFileName(), analysis.summary(), emphasisTagsFor(analysis));
    }

    private List<String> emphasisTagsFor(ResumeAnalysis analysis) {
        Set<String> tags = new LinkedHashSet<>();
        if (analysis.skills() != null) {
            analysis.skills().forEach(s -> tags.add(s.toLowerCase()));
        }
        if (analysis.roles() != null) {
            analysis.roles().forEach(r -> tags.add(r.toLowerCase()));
        }
        // Structured skills/roles come from an AI analysis; a custom summary has neither, so
        // fall back to tokenizing the summary text itself.
        if (tags.isEmpty()) {
            tags.addAll(tokenize(analysis.summary()));
        }
        return List.copyOf(tags);
    }

    private Set<String> tokenize(String text) {
        Set<String> tokens = new LinkedHashSet<>();
        for (String word : text.toLowerCase().split("[^a-z0-9+/#]+")) {
            if (word.length() >= MIN_TOKEN_LENGTH && !STOPWORDS.contains(word)) {
                tokens.add(word);
            }
        }
        return tokens;
    }

    private String topKeywords(Map<String, Integer> tagHits) {
        return tagHits.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .limit(MAX_REASON_KEYWORDS)
                .map(Map.Entry::getKey)
                .collect(Collectors.joining(", "));
    }

    private int countOccurrences(String text, String tag) {
        if (text.isBlank()) {
            return 0;
        }
        // \b word boundaries can't match tags with non-word characters (c++, c#, node.js), which
        // tokenize() deliberately preserves. Use lookarounds over the same character class the
        // tokenizer treats as part of a token, so a tag matches only as a standalone token.
        Matcher matcher = Pattern.compile("(?<![a-z0-9+/#])" + Pattern.quote(tag) + "(?![a-z0-9+/#])").matcher(text);
        int count = 0;
        while (matcher.find()) {
            count++;
        }
        return count;
    }
}
