package com.jobtracker.core.service;

import com.fasterxml.jackson.annotation.JsonAutoDetect.Visibility;
import com.jobtracker.core.dto.Backup;
import com.jobtracker.core.exception.ImageTooLargeException;
import com.jobtracker.core.exception.InvalidBackupException;
import com.jobtracker.core.exception.InvalidCredentialsException;
import com.jobtracker.core.exception.InvalidImageException;
import com.jobtracker.core.exception.RestoreRefusedException;
import com.jobtracker.core.model.AccountAiResult;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.JobImage;
import com.jobtracker.core.model.Location;
import com.jobtracker.core.model.ReminderSettings;
import com.jobtracker.core.model.Resume;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.AccountAiResultRepository;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobImageRepository;
import com.jobtracker.core.repository.JobRepository;
import com.jobtracker.core.repository.ReminderSettingsRepository;
import com.jobtracker.core.repository.ResumeRepository;
import com.jobtracker.core.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

// Nothing is hosted, so the Docker volumes are the only copy of someone's job search: this is how they keep
// another. A restore goes only into an empty account, which is what a fresh install has after registering.
@Service
public class BackupService {

    private static final Logger log = LoggerFactory.getLogger(BackupService.class);

    // Reads and writes the documents' own fields, as Mongo stores them, so a new field is backed up without
    // anyone remembering to add it here.
    private static final ObjectMapper MAPPER = JsonMapper.builder()
            .changeDefaultVisibility(visibility -> visibility
                    .withFieldVisibility(Visibility.ANY)
                    .withGetterVisibility(Visibility.NONE)
                    .withIsGetterVisibility(Visibility.NONE)
                    // The models' public constructors validate new input (an image's type, a grant's years); a
                    // stored copy is filled in field by field, like Mongo does. Records still use theirs.
                    .withCreatorVisibility(Visibility.NONE))
            .build();

    private final UserRepository users;
    private final JobRepository jobs;
    private final JobDetailRepository details;
    private final JobImageRepository images;
    private final ResumeRepository resumes;
    private final ReminderSettingsRepository reminderSettings;
    private final AccountAiResultRepository accountAiResults;
    private final Clock clock;
    private final SeasonService seasons;
    private final JobImageService jobImages;

    public BackupService(UserRepository users, JobRepository jobs, JobDetailRepository details, JobImageRepository images,
            ResumeRepository resumes, ReminderSettingsRepository reminderSettings,
            AccountAiResultRepository accountAiResults, Clock clock, SeasonService seasons, JobImageService jobImages) {
        this.users = users;
        this.jobs = jobs;
        this.details = details;
        this.images = images;
        this.resumes = resumes;
        this.reminderSettings = reminderSettings;
        this.accountAiResults = accountAiResults;
        this.clock = clock;
        this.seasons = seasons;
        this.jobImages = jobImages;
    }

    public record RestoreResult(int jobs, int images, int resumes) {
    }

    public byte[] export(Long ownerId) {
        List<Job> owned = jobs.findByOwnerIdOrderByCreatedAtDesc(ownerId);
        Map<Long, JobDetail> detailByJob = details.findByOwnerIdAndJobIdIn(ownerId, owned.stream().map(Job::getId).toList())
                .stream().collect(Collectors.toMap(JobDetail::getJobId, Function.identity(), (a, b) -> a));
        Map<Long, List<JobImage>> imagesByJob = images.findByOwnerId(ownerId).stream()
                .collect(Collectors.groupingBy(JobImage::getJobId));
        Map<Long, String> seasonNames = seasons.namesById(ownerId);
        List<Backup.Job> rows = owned.stream()
                .map(job -> new Backup.Job(job.getId(), job.getCompany(), job.getRole(), job.getSourceCategory(),
                        job.getUrl(), job.getLocation() == null ? null : job.getLocation().name(), job.getCity(),
                        job.getCompMin(), job.getCompMax(), job.getCurrentStage(),
                        job.getInterviewPhase(), job.getOutcome(), job.getCreatedAt(), detailByJob.get(job.getId()),
                        imagesByJob.getOrDefault(job.getId(), List.of()), seasonNames.get(job.getSeasonId())))
                .toList();
        Backup backup = new Backup(Backup.FORMAT, Backup.VERSION, clock.instant(), rows, resumes.findByOwnerId(ownerId),
                reminderSettings.findByOwnerId(ownerId).orElse(null), accountAiResults.findByOwnerId(ownerId));
        return MAPPER.writeValueAsBytes(backup);
    }

    public RestoreResult restore(Long ownerId, byte[] file) {
        Backup backup = parse(file);
        User owner = users.findById(ownerId).orElseThrow(InvalidCredentialsException::new);
        if (!jobs.findByOwnerIdOrderByCreatedAtDesc(ownerId).isEmpty() || !resumes.findByOwnerId(ownerId).isEmpty()) {
            throw new RestoreRefusedException();
        }

        // Jobs first, for their new ids, then the documents that point at them. Mongo isn't in the Postgres
        // transaction, so a failure part way removes what was made and the account is empty to try again.
        Map<Long, Long> newJobIds = new HashMap<>();
        List<Long> createdJobs = new ArrayList<>();
        int imageCount = 0;
        Long unnamedSeason = seasons.seasonForNewJob(ownerId);
        try {
            Job newest = null;
            for (Backup.Job row : backup.jobs()) {
                Job job = new Job(row.company(), row.role(), owner, row.sourceCategory(), row.url(),
                        workModel(row.location()), row.compMin(), row.compMax());
                boolean preV4 = row.location() != null && Location.PRE_V4_NAMES.containsKey(row.location());
                job.setCity(row.city() == null && preV4 ? Location.PRE_V4_CITY : row.city());
                job.moveToSeason(row.season() == null || row.season().isBlank()
                        ? unnamedSeason : seasons.seasonNamed(ownerId, row.season()));
                job.restoreState(row.currentStage(), row.interviewPhase(), row.outcome(), row.createdAt());
                Long newId = jobs.save(job).getId();
                createdJobs.add(newId);
                newJobIds.put(row.id(), newId);
                if (newest == null || job.getCreatedAt().isAfter(newest.getCreatedAt())) {
                    newest = job;
                }
            }
            // The account's own empty first season would otherwise be what's on screen after the restore.
            if (newest != null) {
                seasons.view(ownerId, newest.getSeasonId());
            }
            for (Backup.Job row : backup.jobs()) {
                Long newId = newJobIds.get(row.id());
                if (row.detail() != null) {
                    row.detail().restoreAs(newId, ownerId, newJobIds);
                    details.save(row.detail());
                }
                List<JobImage> rowImages = row.images() == null ? List.of() : row.images();
                for (JobImage image : rowImages.stream().limit(JobImageService.MAX_IMAGES_PER_JOB).toList()) {
                    try {
                        images.save(jobImages.checked(ownerId, newId, image.getFileName(), image.getData()));
                        imageCount++;
                    } catch (InvalidImageException | ImageTooLargeException notAnImage) {
                        // What an upload would refuse is left out; RestoreResult's count says how many came back.
                    }
                }
            }
            List<Resume> restoredResumes = backup.resumes() == null ? List.of() : backup.resumes();
            restoredResumes.forEach(resume -> resume.restoreAs(ownerId));
            resumes.saveAll(restoredResumes);
            if (backup.reminderSettings() != null) {
                // Anything chosen during onboarding gives way to what was backed up.
                reminderSettings.findByOwnerId(ownerId).ifPresent(reminderSettings::delete);
                ReminderSettings restored = backup.reminderSettings();
                restored.restoreAs(ownerId);
                reminderSettings.save(restored);
            }
            if (backup.aiResults() != null) {
                // Like the settings, a brief run before restoring gives way to the backed-up one.
                accountAiResults.deleteByOwnerId(ownerId);
                // One season's Insights or comparison would point at an id the restored season no longer has.
                List<AccountAiResult> kept = backup.aiResults().stream().filter(result -> !result.madeForOneSeason()).toList();
                kept.forEach(result -> result.restoreAs(ownerId));
                accountAiResults.saveAll(kept);
            }
            log.info("restored a backup into account {}: {} job(s), {} image(s), {} resume(s)", ownerId,
                    createdJobs.size(), imageCount, restoredResumes.size());
            return new RestoreResult(createdJobs.size(), imageCount, restoredResumes.size());
        } catch (RuntimeException e) {
            undo(ownerId, createdJobs);
            throw e;
        }
    }

    private static Backup parse(byte[] file) {
        Backup backup;
        try {
            backup = MAPPER.readValue(file, Backup.class);
        } catch (JacksonException e) {
            throw new InvalidBackupException("that file isn't a Job Tracker backup: " + e.getOriginalMessage());
        }
        if (backup == null || !Backup.FORMAT.equals(backup.format())) {
            throw new InvalidBackupException("that file isn't a Job Tracker backup");
        }
        if (backup.version() > Backup.VERSION) {
            throw new InvalidBackupException("that backup is from a newer version of Job Tracker; update this one first");
        }
        if (backup.jobs() == null) {
            throw new InvalidBackupException("that backup has no jobs list");
        }
        return backup;
    }

    private static Location workModel(String name) {
        if (name == null) {
            return null;
        }
        try {
            return Location.fromName(name);
        } catch (IllegalArgumentException e) {
            throw new InvalidBackupException("that backup has an unknown location: " + name);
        }
    }

    private void undo(Long ownerId, List<Long> createdJobs) {
        for (Long jobId : createdJobs) {
            images.deleteByJobId(jobId);
            details.deleteByJobId(jobId);
        }
        jobs.deleteAllById(createdJobs);
        resumes.deleteAll(resumes.findByOwnerId(ownerId));
        accountAiResults.deleteByOwnerId(ownerId);
    }
}
