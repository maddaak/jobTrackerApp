package com.jobtracker.core.service;

import com.jobtracker.core.exception.SampleDataRefusedException;
import com.jobtracker.core.model.Contact;
import com.jobtracker.core.model.EquityGrant;
import com.jobtracker.core.model.InterviewRound;
import com.jobtracker.core.model.InterviewType;
import com.jobtracker.core.model.Interviewer;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.Location;
import com.jobtracker.core.model.Offer;
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
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static com.jobtracker.core.model.InterviewType.*;

// A made-up search to try the app with before entering a real one. Dated from today, so it always has
// rounds coming up and offers still to decide.
@Service
public class SampleDataService {

    private static final Logger log = LoggerFactory.getLogger(SampleDataService.class);

    // How each sample job ends up; the stage, outcome, and trail follow from it.
    enum Ending { WAITING_REPLY, CONTACTED, INTERVIEWING, WAITING_RESULTS, OFFER, REJECTED, GHOSTED, WITHDRAWN, PAUSED }

    record Sample(String company, String role, Location location, String city, Integer compMin, Integer compMax,
            SourceCategory source, int appliedDaysAgo, List<InterviewType> rounds, Ending ending, String note) {
    }

    private static final SourceCategory SELF = SourceCategory.SELF_APPLIED;

    // Company names from fiction and from the sample databases software vendors ship, so none is a real employer.
    static final List<Sample> SAMPLES = List.of(
            new Sample("Initech", "Senior Backend Engineer", Location.HYBRID, "Austin, TX", 160000, 190000, SELF, 45,
                    List.of(RECRUITER_PHONE_SCREEN, TECHNICAL_PHONE_SCREEN, PANEL_CODING, PANEL_SYSTEM_DESIGN, PANEL_BEHAVIOR),
                    Ending.OFFER, null),
            new Sample("Globex", "Staff Engineer, Platform", Location.REMOTE, null, 190000, 230000,
                    SourceCategory.REFERRAL_APPLIED, 40,
                    List.of(RECRUITER_PHONE_SCREEN, HIRING_MANAGER_SCREEN, SYSTEM_DESIGN, PANEL_CODING, PANEL_HIRING_MANAGER_CHAT),
                    Ending.OFFER, "Referred by a former teammate."),
            new Sample("Hooli", "Software Engineer II", Location.ON_SITE, "Mountain View, CA", 150000, 175000, SELF, 32,
                    List.of(RECRUITER_PHONE_SCREEN, TECHNICAL_PHONE_SCREEN, PANEL_CODING, PANEL_SYSTEM_DESIGN, PANEL_CULTURE_FIT),
                    Ending.WAITING_RESULTS, null),
            new Sample("Pied Piper", "Backend Engineer", Location.REMOTE, null, 140000, 170000,
                    SourceCategory.LINKEDIN_OUTREACH, 16, List.of(RECRUITER_PHONE_SCREEN, TECHNICAL_PHONE_SCREEN),
                    Ending.INTERVIEWING, "Recruiter reached out on LinkedIn."),
            new Sample("Umbrella Labs", "Platform Engineer", Location.HYBRID, "Boston, MA", 150000, 180000, SELF, 18,
                    List.of(RECRUITER_PHONE_SCREEN, SYSTEM_DESIGN), Ending.INTERVIEWING, null),
            new Sample("Soylent Systems", "Data Engineer", Location.REMOTE, null, 130000, 160000,
                    SourceCategory.EMAIL_OUTREACH, 6, List.of(), Ending.CONTACTED, null),
            new Sample("Massive Dynamic", "Senior Software Engineer", Location.HYBRID, "New York, NY", 170000, 200000, SELF, 50,
                    List.of(RECRUITER_PHONE_SCREEN, TECHNICAL_PHONE_SCREEN), Ending.REJECTED,
                    "Went with someone with more payments experience."),
            new Sample("Cyberdyne", "Site Reliability Engineer", Location.ON_SITE, "Seattle, WA", 155000, 185000, SELF, 55,
                    List.of(RECRUITER_PHONE_SCREEN), Ending.REJECTED, "Looking for more Kubernetes depth."),
            new Sample("Blue Yonder Airlines", "Software Engineer", Location.REMOTE, null, 120000, 150000, SELF, 28,
                    List.of(), Ending.REJECTED, null),
            new Sample("Contoso", "Senior Engineer", Location.REMOTE, null, 165000, 195000, SELF, 35,
                    List.of(RECRUITER_PHONE_SCREEN, TECHNICAL_CODE_REVIEW), Ending.PAUSED, "Hiring freeze until next quarter."),
            new Sample("Fabrikam", "Backend Engineer", Location.HYBRID, "Denver, CO", 135000, 160000, SELF, 25,
                    List.of(RECRUITER_PHONE_SCREEN, TECHNICAL_PHONE_SCREEN), Ending.WITHDRAWN,
                    "Withdrew: the role turned out to be mostly on-call."),
            new Sample("Wonka Industries", "Backend Engineer", Location.REMOTE, null, null, null, SELF, 62,
                    List.of(), Ending.GHOSTED, null),
            new Sample("Vandelay Industries", "Software Engineer", Location.HYBRID, "Chicago, IL", 125000, 150000, SELF, 58,
                    List.of(), Ending.GHOSTED, null),
            new Sample("Coho Winery", "Full Stack Engineer", Location.ON_SITE, "Portland, OR", 115000, 140000, SELF, 70,
                    List.of(), Ending.GHOSTED, null),
            new Sample("Northwind Traders", "Senior Backend Engineer", Location.REMOTE, null, 160000, 185000, SELF, 1,
                    List.of(), Ending.WAITING_REPLY, null),
            new Sample("Tailspin Toys", "Software Engineer, Payments", Location.HYBRID, "San Francisco, CA", 165000, 195000,
                    SELF, 8, List.of(), Ending.WAITING_REPLY, null),
            new Sample("Wide World Importers", "Backend Engineer", Location.REMOTE, null, 140000, 165000, SELF, 12,
                    List.of(), Ending.WAITING_REPLY, null),
            new Sample("Adventure Works", "Platform Engineer", Location.ON_SITE, "Atlanta, GA", 145000, 170000,
                    SourceCategory.REFERRAL_APPLIED, 15, List.of(), Ending.WAITING_REPLY, null),
            new Sample("Lamna Healthcare", "Software Engineer", Location.REMOTE, null, 130000, 155000, SELF, 9,
                    List.of(RECRUITER_PHONE_SCREEN), Ending.INTERVIEWING, null),
            new Sample("Margie's Travel", "Senior Software Engineer", Location.HYBRID, "Miami, FL", 150000, 175000, SELF, 21,
                    List.of(), Ending.WAITING_REPLY, null),
            new Sample("Litware", "Backend Engineer", Location.REMOTE, null, 135000, 160000, SELF, 34,
                    List.of(), Ending.WAITING_REPLY, null),
            new Sample("Proseware", "Software Engineer", Location.REMOTE, null, null, null, SELF, 41,
                    List.of(), Ending.WAITING_REPLY, null));

    private static final List<String> INTERVIEWERS = List.of("Alex Rivera", "Sam Chen", "Jordan Patel", "Taylor Brooks",
            "Morgan Lee", "Casey Nguyen", "Riley Okafor", "Jamie Silva");

    private final JobRepository jobs;
    private final JobDetailRepository details;
    private final UserRepository users;
    private final JobService jobService;
    private final Clock clock;
    private final SeasonService seasons;

    public SampleDataService(JobRepository jobs, JobDetailRepository details, UserRepository users, JobService jobService,
            Clock clock, SeasonService seasons) {
        this.jobs = jobs;
        this.details = details;
        this.users = users;
        this.jobService = jobService;
        this.clock = clock;
        this.seasons = seasons;
    }

    // Only into an account with no jobs in any season, so the sample never mixes with real ones.
    public boolean canLoad(Long ownerId) {
        return jobs.findByOwnerIdOrderByCreatedAtDesc(ownerId).isEmpty();
    }

    public int load(Long ownerId) {
        if (!canLoad(ownerId)) {
            throw new SampleDataRefusedException();
        }
        User owner = users.getReferenceById(ownerId);
        Long seasonId = seasons.seasonForNewJob(ownerId);
        // Mid-afternoon UTC, so rounds land in working hours across the US.
        Instant today = clock.instant().truncatedTo(ChronoUnit.DAYS).plus(Duration.ofHours(15));
        List<Long> created = new ArrayList<>();
        try {
            for (int i = 0; i < SAMPLES.size(); i++) {
                created.add(create(owner, ownerId, seasonId, SAMPLES.get(i), today, i));
            }
        } catch (RuntimeException e) {
            created.forEach(details::deleteByJobId);
            jobs.deleteAllById(created);
            throw e;
        }
        log.info("loaded {} sample job(s) into account {}", created.size(), ownerId);
        return created.size();
    }

    // Only the season on screen, so another season's samples don't label this one as made up.
    public long countInView(Long ownerId) {
        Set<Long> sampleJobIds = details.findByOwnerIdAndSampleTrue(ownerId).stream()
                .map(JobDetail::getJobId)
                .collect(Collectors.toSet());
        return jobs.findByOwnerIdOrderByCreatedAtDesc(ownerId).stream()
                .filter(seasons.inView(ownerId))
                .filter(job -> sampleJobIds.contains(job.getId()))
                .count();
    }

    // Through the normal delete, so links, images, and documents go with each job.
    public int remove(Long ownerId) {
        List<JobDetail> samples = details.findByOwnerIdAndSampleTrue(ownerId);
        samples.forEach(detail -> jobService.deleteJob(ownerId, detail.getJobId()));
        log.info("removed {} sample job(s) from account {}", samples.size(), ownerId);
        return samples.size();
    }

    private Long create(User owner, Long ownerId, Long seasonId, Sample sample, Instant today, int index) {
        Instant applied = today.minus(Duration.ofDays(sample.appliedDaysAgo())).minus(Duration.ofHours(1));
        List<InterviewRound> rounds = rounds(sample, applied, today, index);
        Instant lastRound = rounds.isEmpty() ? applied : rounds.get(rounds.size() - 1).getInterviewDateTime();

        Stage stage = switch (sample.ending()) {
            case WAITING_REPLY, GHOSTED -> Stage.RESUME_CHECK;
            case CONTACTED -> Stage.INTERVIEW_REQUEST;
            case WAITING_RESULTS -> Stage.WAITING_INTERVIEW_RESULTS;
            case OFFER -> Stage.OFFER_STAGE;
            default -> rounds.isEmpty() ? Stage.RESUME_CHECK : Stage.INTERVIEW_STAGE;
        };
        Outcome outcome = switch (sample.ending()) {
            case REJECTED -> Outcome.REJECTED;
            case GHOSTED -> Outcome.GHOSTED;
            case WITHDRAWN -> Outcome.WITHDRAWN;
            case PAUSED -> Outcome.PAUSED;
            default -> Outcome.ACTIVE;
        };

        Job job = new Job(sample.company(), sample.role(), owner, sample.source(), null, sample.location(),
                sample.compMin(), sample.compMax());
        job.setCity(sample.city());
        job.moveToSeason(seasonId);
        job.restoreState(outcome.closesPipeline() ? Stage.FINALIZED : stage, null, outcome, applied);
        Long jobId = jobs.save(job).getId();

        JobDetail detail = new JobDetail(jobId, ownerId);
        detail.markSample();
        rounds.forEach(detail::addInterview);
        // The trail the app itself would have written as the search went.
        detail.recordStage(Stage.RESUME_CHECK, applied, null);
        if (!rounds.isEmpty() || stage == Stage.INTERVIEW_REQUEST) {
            Instant asked = rounds.isEmpty() ? applied.plus(Duration.ofDays(2))
                    : rounds.get(0).getInterviewDateTime().minus(Duration.ofDays(3));
            detail.recordStage(Stage.INTERVIEW_REQUEST, asked, null);
        }
        if (!rounds.isEmpty()) {
            detail.recordStage(Stage.INTERVIEW_STAGE, rounds.get(0).getInterviewDateTime(), null);
        }
        if (stage == Stage.WAITING_INTERVIEW_RESULTS) {
            detail.recordStage(stage, lastRound.plus(Duration.ofHours(2)), null);
        }
        if (stage == Stage.OFFER_STAGE) {
            detail.recordStage(stage, lastRound.plus(Duration.ofDays(4)), null);
            detail.setOffer(offerFor(sample, today));
        }
        if (outcome.closesPipeline()) {
            detail.recordStage(Stage.FINALIZED, lastRound.plus(Duration.ofDays(rounds.isEmpty() ? 21 : 6)), null);
        }
        if (!rounds.isEmpty()) {
            String recruiter = INTERVIEWERS.get((index + 3) % INTERVIEWERS.size());
            // One waiting job has a follow-up due, so the board's follow-up list has something to show.
            LocalDate followUp = sample.ending() == Ending.WAITING_RESULTS ? today.atZone(ZoneOffset.UTC).toLocalDate() : null;
            detail.setContacts(List.of(new Contact(recruiter, Contact.ContactRole.RECRUITER, null, null,
                    rounds.get(0).getInterviewDateTime().atZone(ZoneOffset.UTC).toLocalDate(), null, followUp)));
        }
        // Two resumes in turn, so Insights' replies by resume has something to compare.
        detail.setSentResume(index % 3 == 0 ? "resume-backend.pdf" : "resume-general.pdf");
        detail.setNotes(outcome == Outcome.REJECTED ? null : sample.note());
        detail.setRejectedReason(outcome == Outcome.REJECTED ? sample.note() : null);
        details.save(detail);
        return jobId;
    }

    // A week after applying, then every few days; a panel's rounds share one day an hour apart. An open
    // search's last round is still to come.
    private List<InterviewRound> rounds(Sample sample, Instant applied, Instant today, int index) {
        List<InterviewRound> rounds = new ArrayList<>();
        Instant at = applied.plus(Duration.ofDays(7)).plus(Duration.ofHours(1));
        for (int i = 0; i < sample.rounds().size(); i++) {
            InterviewType type = sample.rounds().get(i);
            boolean last = i == sample.rounds().size() - 1;
            if (last && sample.ending() == Ending.INTERVIEWING) {
                at = today.plus(Duration.ofDays(2 + index % 3));
            } else if (i > 0) {
                boolean samePanel = type.isPanel() && sample.rounds().get(i - 1).isPanel();
                at = at.plus(samePanel ? Duration.ofHours(1) : Duration.ofDays(5));
            }
            String interviewer = INTERVIEWERS.get((index + i) % INTERVIEWERS.size());
            rounds.add(new InterviewRound(at, at.plus(Duration.ofMinutes(type == RECRUITER_PHONE_SCREEN ? 30 : 60)), type,
                    "https://meet.example.com/" + sample.company().toLowerCase().replaceAll("[^a-z]", "") + "-" + (i + 1),
                    null, List.of(new Interviewer(interviewer, null))));
        }
        return rounds;
    }

    private static Offer offerFor(Sample sample, Instant today) {
        LocalDate day = today.atZone(ZoneOffset.UTC).toLocalDate();
        if (sample.source() == SourceCategory.REFERRAL_APPLIED) {
            // Shaped like a big-tech letter: shares on a back-loaded schedule, with a sign-on over two years
            // filling in the thin early years.
            return new Offer(null, 185000, null, null,
                    EquityGrant.ofShares(1200, 185.0, 4, List.of(5.0, 15.0, 40.0, 40.0), 15.0, null), null,
                    List.of(60000, 45000), day.plusDays(30), day.plusDays(9),
                    "Sign-on covers years 1 and 2 while the stock vests slowly.");
        }
        return new Offer(null, 175000, null, 10.0, new EquityGrant(160000, 4, null), 15000, null, day.plusDays(40),
                day.plusDays(6), null);
    }
}
