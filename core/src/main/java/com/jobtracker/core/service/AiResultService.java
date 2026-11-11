package com.jobtracker.core.service;

import com.jobtracker.core.exception.AiResultNotFoundException;
import com.jobtracker.core.exception.InvalidAiResultException;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.exception.NoOfferException;
import com.jobtracker.core.model.AccountAiResult;
import com.jobtracker.core.model.AiKind;
import com.jobtracker.core.model.AiResult;
import com.jobtracker.core.model.InterviewRound;
import com.jobtracker.core.model.InterviewType;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.repository.AccountAiResultRepository;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.Locale;
import java.util.Map;

// Each AI answer is saved where the thing it's about lives, so deleting a job or a round takes its answers
// with it and a backup carries them without a list of its own.
@Service
public class AiResultService {

    private final JobRepository jobs;
    private final JobDetailRepository details;
    private final JobDetailService jobDetailService;
    private final AccountAiResultRepository accountResults;
    private final SeasonService seasons;
    private final Clock clock;

    public AiResultService(JobRepository jobs, JobDetailRepository details, JobDetailService jobDetailService,
            AccountAiResultRepository accountResults, SeasonService seasons, Clock clock) {
        this.jobs = jobs;
        this.details = details;
        this.jobDetailService = jobDetailService;
        this.accountResults = accountResults;
        this.seasons = seasons;
        this.clock = clock;
    }

    public AiResult saveForJob(Long ownerId, Long jobId, String kindKey, String interviewType,
            Map<String, Object> content) {
        AiKind kind = kindIn(kindKey, AiKind.Scope.JOB);
        String key = jobKey(kind, interviewType);
        Job job = jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
        JobDetail detail = details.findByJobIdAndOwnerId(jobId, ownerId)
                .orElseGet(() -> jobDetailService.createDetail(jobId, ownerId, null));
        // Here rather than in the page, so a direct call can't keep a draft for a job it doesn't fit.
        if (kind == AiKind.NEGOTIATION && !job.hasOffer()) {
            throw new NoOfferException();
        }
        if (kind == AiKind.FOLLOW_UP && detail.getInterviews().isEmpty()) {
            throw new InvalidAiResultException("log an interview round before drafting a follow-up");
        }
        AiResult result = new AiResult(content, clock.instant());
        detail.getAiResults().put(key, result);
        details.save(detail);
        return result;
    }

    public void clearForJob(Long ownerId, Long jobId, String kindKey, String interviewType) {
        String key = jobKey(kindIn(kindKey, AiKind.Scope.JOB), interviewType);
        jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
        details.findByJobIdAndOwnerId(jobId, ownerId).ifPresent(detail -> {
            if (detail.getAiResults().remove(key) != null) {
                details.save(detail);
            }
        });
    }

    public AiResult saveForRound(Long ownerId, String roundId, String kindKey, Map<String, Object> content) {
        AiKind kind = kindIn(kindKey, AiKind.Scope.ROUND);
        JobDetail detail = details.findByOwnerIdAndInterviewsRoundId(ownerId, roundId)
                .orElseThrow(JobNotFoundException::new);
        AiResult result = new AiResult(content, clock.instant());
        detail.findInterview(roundId).getAiResults().put(kind.key(), result);
        details.save(detail);
        return result;
    }

    public void clearForRound(Long ownerId, String roundId, String kindKey) {
        AiKind kind = kindIn(kindKey, AiKind.Scope.ROUND);
        JobDetail detail = details.findByOwnerIdAndInterviewsRoundId(ownerId, roundId)
                .orElseThrow(JobNotFoundException::new);
        InterviewRound round = detail.findInterview(roundId);
        if (round.getAiResults().remove(kind.key()) != null) {
            details.save(detail);
        }
    }

    public AiResult getForAccount(Long ownerId, String kindKey, String company) {
        String key = accountKey(ownerId, kindIn(kindKey, AiKind.Scope.ACCOUNT), company, null);
        return accountResults.findByOwnerIdAndKey(ownerId, key)
                .map(AccountAiResult::result)
                .orElseThrow(() -> new AiResultNotFoundException("nothing saved yet"));
    }

    public AiResult saveForAccount(Long ownerId, String kindKey, String company, String season, Map<String, Object> content) {
        String key = accountKey(ownerId, kindIn(kindKey, AiKind.Scope.ACCOUNT), company, season);
        AiResult result = new AiResult(content, clock.instant());
        AccountAiResult saved = accountResults.findByOwnerIdAndKey(ownerId, key)
                .orElseGet(() -> new AccountAiResult(ownerId, key, result));
        saved.replace(result);
        accountResults.save(saved);
        return result;
    }

    public void clearForAccount(Long ownerId, String kindKey, String company) {
        accountResults.deleteByOwnerIdAndKey(ownerId, accountKey(ownerId, kindIn(kindKey, AiKind.Scope.ACCOUNT), company, null));
    }

    private static AiKind kindIn(String key, AiKind.Scope scope) {
        return AiKind.find(key, scope).orElseThrow(() -> new AiResultNotFoundException("no such AI result: " + key));
    }

    // One prep per kind of round, so prepping for system design doesn't replace the behavioral prep.
    private static String jobKey(AiKind kind, String interviewType) {
        if (kind != AiKind.INTERVIEW_PREP) {
            return kind.key();
        }
        try {
            return kind.key() + ":" + InterviewType.valueOf(interviewType == null ? "" : interviewType);
        } catch (IllegalArgumentException e) {
            throw new InvalidAiResultException("say which kind of interview to prepare for");
        }
    }

    // One brief per company, however its name was typed on each job. Insights and the offer comparison are
    // made from the season on screen, so each season keeps its own, and showing every season has one too.
    // A run names the season it read its input from, since the one shown can change while the AI works.
    private String accountKey(Long ownerId, AiKind kind, String company, String season) {
        if (kind.perSeason()) {
            return kind.key() + ":season:" + (season == null ? seasonShown(ownerId) : seasonNamed(ownerId, season));
        }
        if (kind != AiKind.COMPANY_BRIEF) {
            return kind.key();
        }
        if (company == null || company.isBlank()) {
            throw new InvalidAiResultException("say which company");
        }
        return kind.key() + ":" + company.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    private String seasonShown(Long ownerId) {
        Long active = seasons.activeSeasonId(ownerId);
        return active == null ? "all" : active.toString();
    }

    private String seasonNamed(Long ownerId, String season) {
        if (season.equals("all")) {
            return season;
        }
        try {
            return seasons.owned(ownerId, Long.parseLong(season)).toString();
        } catch (NumberFormatException e) {
            throw new InvalidAiResultException("no such season");
        }
    }
}
