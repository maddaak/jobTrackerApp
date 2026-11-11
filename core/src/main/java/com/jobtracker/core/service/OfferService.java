package com.jobtracker.core.service;

import com.jobtracker.core.dto.MarketCheckRequest;
import com.jobtracker.core.dto.OfferRequest;
import com.jobtracker.core.dto.OfferResponse;
import com.jobtracker.core.exception.InvalidOfferException;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.model.AiKind;
import com.jobtracker.core.model.AiResult;
import com.jobtracker.core.model.EquityGrant;
import com.jobtracker.core.exception.NoOfferException;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.MarketCheck;
import com.jobtracker.core.model.Offer;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
import org.springframework.stereotype.Service;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class OfferService {

    private final JobRepository jobs;
    private final JobDetailRepository jobDetails;
    private final JobDetailService jobDetailService;
    private final SeasonService seasons;
    private final Clock clock;

    public OfferService(JobRepository jobs, JobDetailRepository jobDetails, JobDetailService jobDetailService,
            SeasonService seasons, Clock clock) {
        this.jobs = jobs;
        this.jobDetails = jobDetails;
        this.jobDetailService = jobDetailService;
        this.seasons = seasons;
        this.clock = clock;
    }

    // Every job holding an offer, recorded details or not, so a fresh offer shows up ready to fill in.
    public List<OfferResponse> listOffers(Long ownerId) {
        List<Job> offerJobs = offerJobsInView(ownerId);
        Map<Long, JobDetail> detailsByJobId = detailsOf(ownerId, offerJobs);
        int years = longestSpan(detailsByJobId.values());
        return offerJobs.stream()
                .map(job -> toResponse(job, detailsByJobId.get(job.getId()), years))
                .toList();
    }

    private List<Job> offerJobsInView(Long ownerId) {
        return jobs.findByOwnerIdOrderByCreatedAtDesc(ownerId).stream()
                .filter(seasons.inView(ownerId))
                .filter(Job::hasOffer)
                .toList();
    }

    private Map<Long, JobDetail> detailsOf(Long ownerId, List<Job> offerJobs) {
        return jobDetails.findByOwnerIdAndJobIdIn(ownerId, offerJobs.stream().map(Job::getId).toList()).stream()
                .collect(Collectors.toMap(JobDetail::getJobId, Function.identity(), (a, b) -> a));
    }

    // Every offer is averaged over the same years, the longest any of them pays over, so a four-year grant and
    // a one-time sign-on are compared on equal terms.
    private static int longestSpan(Collection<JobDetail> details) {
        return details.stream()
                .map(JobDetail::getOffer)
                .filter(Objects::nonNull)
                .mapToInt(Offer::yearsPaid)
                .max()
                .orElse(1);
    }

    // The same span the list uses, so the card a save returns shows what the page shows after reloading.
    private OfferResponse toResponse(Long ownerId, Job job, JobDetail detail) {
        return toResponse(job, detail, longestSpan(detailsOf(ownerId, offerJobsInView(ownerId)).values()));
    }

    // Enforced here, not in the UI, so a direct PUT can't attach an offer to a job still interviewing.
    public OfferResponse saveOffer(Long ownerId, Long jobId, OfferRequest request) {
        Job job = jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
        seasons.requireOpen(job.getSeasonId());
        if (!job.hasOffer()) {
            throw new NoOfferException();
        }
        JobDetail detail = jobDetails.findByJobIdAndOwnerId(jobId, ownerId)
                .orElseGet(() -> jobDetailService.createDetail(jobId, ownerId, null));
        Offer offer = new Offer(request.offerTitle(), request.baseSalary(), request.bonusAmount(), request.bonusPercent(),
                equityOf(request), request.signOnBonus(), request.signOnByYear(), request.startDate(),
                request.decisionDeadline(), request.notes());
        // Kept, not dropped: the response says when the edit has left it out of date.
        if (detail.getOffer() != null) {
            offer.recordMarketCheck(detail.getOffer().getMarketCheck());
            offer.recordAcceptedOn(detail.getOffer().getAcceptedOn());
        }
        detail.setOffer(offer);
        jobDetails.save(detail);
        return toResponse(ownerId, job, detail);
    }

    // Taking the offer: marks it accepted and keeps the day it was accepted and the day the job starts, which the
    // season summary reads. An offer with no figures entered yet still takes them.
    public OfferResponse accept(Long ownerId, Long jobId, LocalDate acceptedOn, LocalDate startDate) {
        Job job = jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
        seasons.requireOpen(job.getSeasonId());
        if (!job.hasOffer()) {
            throw new NoOfferException();
        }
        JobDetail detail = jobDetails.findByJobIdAndOwnerId(jobId, ownerId)
                .orElseGet(() -> jobDetailService.createDetail(jobId, ownerId, null));
        if (detail.getOffer() == null) {
            detail.setOffer(new Offer(null, null, null, null, null, null, null, null, null, null));
        }
        detail.getOffer().accept(acceptedOn, startDate);
        job.acceptOffer();
        // Postgres first, as a job update does: a failed second write loses the dates, not the decision.
        jobs.save(job);
        jobDetails.save(detail);
        return toResponse(ownerId, job, detail);
    }

    // Shares take priority: a letter that gives a count is valued from it, not from a dollar figure typed earlier.
    private static EquityGrant equityOf(OfferRequest request) {
        boolean inShares = request.equityShares() != null;
        if (!inShares && request.equityGrant() == null) {
            return null;
        }
        if (request.vestingYears() == null) {
            throw new InvalidOfferException("say how many years the equity vests over");
        }
        if (!inShares) {
            return new EquityGrant(request.equityGrant(), request.vestingYears(), request.vestingSchedule(), null, null,
                    request.priceGrowthPercent(), null);
        }
        if (request.sharePrice() == null) {
            throw new InvalidOfferException("add a share price to value " + request.equityShares() + " shares");
        }
        return EquityGrant.ofShares(request.equityShares(), request.sharePrice(), request.vestingYears(),
                request.vestingSchedule(), request.priceGrowthPercent(), request.vestedShares());
    }

    // A check before any numbers are recorded still says what the role typically pays, so it gets an
    // empty offer to sit on rather than being refused.
    public OfferResponse saveMarketCheck(Long ownerId, Long jobId, MarketCheckRequest request) {
        Job job = jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
        seasons.requireOpen(job.getSeasonId());
        if (!job.hasOffer()) {
            throw new NoOfferException();
        }
        JobDetail detail = jobDetails.findByJobIdAndOwnerId(jobId, ownerId)
                .orElseGet(() -> jobDetailService.createDetail(jobId, ownerId, null));
        Offer offer = detail.getOffer() != null
                ? detail.getOffer()
                : new Offer(null, null, null, null, null, null, null, null, null, null);
        offer.recordMarketCheck(new MarketCheck(request.verdict(), request.typicalLow(), request.typicalHigh(),
                request.summary(), request.negotiationPoints(), request.searched(), request.sources(), clock.instant(),
                MarketCheck.Basis.of(job, offer)));
        detail.setOffer(offer);
        jobDetails.save(detail);
        return toResponse(ownerId, job, detail);
    }

    public OfferResponse clearMarketCheck(Long ownerId, Long jobId) {
        Job job = jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
        seasons.requireOpen(job.getSeasonId());
        JobDetail detail = jobDetails.findByJobIdAndOwnerId(jobId, ownerId).orElse(null);
        if (detail == null || detail.getOffer() == null) {
            return toResponse(ownerId, job, detail);
        }
        detail.getOffer().recordMarketCheck(null);
        jobDetails.save(detail);
        return toResponse(ownerId, job, detail);
    }

    private static OfferResponse toResponse(Job job, JobDetail detail, int years) {
        Offer offer = detail == null ? null : detail.getOffer();
        AiResult draft = detail == null ? null : detail.getAiResults().get(AiKind.NEGOTIATION.key());
        if (offer == null) {
            return new OfferResponse(job.getId(), job.getCompany(), job.getRole(), job.getLocation(), job.getCity(),
                    job.getOutcome(), null, null, null, null, null, null, null, null, null, null, null, null, List.of(),
                    List.of(), null, List.of(), List.of(), List.of(), null, null, years, List.of(), List.of(), null,
                    null, null, null, null, false, draft);
        }
        MarketCheck check = offer.getMarketCheck();
        EquityGrant equity = offer.getEquity();
        return new OfferResponse(job.getId(), job.getCompany(), job.getRole(), job.getLocation(), job.getCity(),
                job.getOutcome(), offer.getTitle(), offer.getBaseSalary(), offer.getBonusAmount(), offer.getBonusPercent(),
                equity == null ? null : equity.value(), equity == null ? null : equity.shares(),
                equity == null ? null : equity.sharePrice(), equity == null ? null : equity.growthPercent(),
                equity == null ? null : equity.years(), equity == null ? null : equity.schedule(),
                equity == null ? null : equity.vestedShares(),
                offer.getSignOnBonus(), offer.signOnByYear(), offer.signOnPaidByYear(), offer.annualBonus(),
                offer.equityByYear(),
                equity == null ? List.of() : equity.sharesByYear(), equity == null ? List.of() : equity.projectedByYear(),
                offer.equityPerYear(), offer.averagePerYear(years), years, offer.compByYear(), offer.projectedCompByYear(),
                offer.getStartDate(), offer.getDecisionDeadline(), offer.getAcceptedOn(),
                offer.getNotes(), check, check != null && check.staleFor(job, offer), draft);
    }
}
