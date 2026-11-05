package com.jobtracker.core.service;

import com.jobtracker.core.dto.ImportJobsRequest;
import com.jobtracker.core.dto.ImportJobsResponse;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.SourceCategory;
import com.jobtracker.core.model.Stage;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
import com.jobtracker.core.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

// Brings in the spreadsheet a search started in, so switching costs no retyping.
@Service
public class JobImportService {

    private static final Logger log = LoggerFactory.getLogger(JobImportService.class);

    private final JobRepository jobs;
    private final JobDetailRepository details;
    private final UserRepository users;
    private final Clock clock;
    private final SeasonService seasons;

    public JobImportService(JobRepository jobs, JobDetailRepository details, UserRepository users, Clock clock,
            SeasonService seasons) {
        this.jobs = jobs;
        this.details = details;
        this.users = users;
        this.clock = clock;
        this.seasons = seasons;
    }

    public ImportJobsResponse importJobs(Long ownerId, ImportJobsRequest request) {
        User owner = users.getReferenceById(ownerId);
        Long seasonId = seasons.seasonForNewJob(ownerId);
        // Within the season only: applying again in a later search is a new application, not a duplicate.
        Set<String> tracked = jobs.findByOwnerIdAndSeasonIdOrderByCreatedAtDesc(ownerId, seasonId).stream()
                .map(job -> key(job.getCompany(), job.getRole()))
                .collect(Collectors.toSet());

        // Mongo isn't in the Postgres transaction, so a failure part way removes what was made, as a restore does.
        List<Long> created = new ArrayList<>();
        int skipped = 0;
        try {
            for (ImportJobsRequest.Row row : request.jobs()) {
                if (!tracked.add(key(row.company(), row.role()))) {
                    skipped++;
                    continue;
                }
                created.add(create(owner, ownerId, seasonId, row));
            }
        } catch (RuntimeException e) {
            created.forEach(details::deleteByJobId);
            jobs.deleteAllById(created);
            throw e;
        }
        log.info("imported {} job(s) into account {}, skipped {} already tracked", created.size(), ownerId, skipped);
        return new ImportJobsResponse(created.size(), skipped);
    }

    private Long create(User owner, Long ownerId, Long seasonId, ImportJobsRequest.Row row) {
        Instant applied = row.appliedOn() == null
                ? clock.instant() : row.appliedOn().atStartOfDay(ZoneOffset.UTC).toInstant();
        Outcome outcome = row.outcome() == null ? Outcome.ACTIVE : row.outcome();
        Stage stage = row.stage() == null ? Stage.RESUME_CHECK : row.stage();
        // A decided offer sits at the offer stage, which is what the Offers page and the Sankey read.
        if (outcome == Outcome.OFFER_ACCEPTED || outcome == Outcome.OFFER_DECLINED) {
            stage = Stage.OFFER_STAGE;
        }

        Job job = new Job(row.company().strip(), row.role().strip(), owner,
                row.sourceCategory() == null ? SourceCategory.SELF_APPLIED : row.sourceCategory(),
                row.url(), row.location(), row.compMin(), row.compMax());
        job.setCity(row.city());
        job.moveToSeason(seasonId);
        job.restoreState(outcome.closesPipeline() ? Stage.FINALIZED : stage, null, outcome, applied);
        Long jobId = jobs.save(job).getId();

        // The trail a job would have left if tracked here from the start: applied, then where it got to.
        JobDetail detail = new JobDetail(jobId, ownerId);
        detail.setNotes(row.notes());
        detail.setRejectedReason(outcome == Outcome.REJECTED ? row.rejectedReason() : null);
        detail.recordStage(Stage.RESUME_CHECK, applied, null);
        if (stage != Stage.RESUME_CHECK) {
            detail.recordStage(stage, applied.plusMillis(1), null);
        }
        if (outcome.closesPipeline()) {
            detail.recordStage(Stage.FINALIZED, applied.plusMillis(2), null);
        }
        details.save(detail);
        return jobId;
    }

    private static String key(String company, String role) {
        return company.strip().toLowerCase(Locale.ROOT) + "\n" + role.strip().toLowerCase(Locale.ROOT);
    }
}
