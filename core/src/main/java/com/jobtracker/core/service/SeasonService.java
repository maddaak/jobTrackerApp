package com.jobtracker.core.service;

import com.jobtracker.core.dto.SeasonResponse;
import com.jobtracker.core.exception.InvalidCredentialsException;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.exception.SeasonInUseException;
import com.jobtracker.core.exception.SeasonNotFoundException;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.Season;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.JobRepository;
import com.jobtracker.core.repository.SeasonRepository;
import com.jobtracker.core.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Predicate;
import java.util.stream.Collectors;

@Service
public class SeasonService {

    private final SeasonRepository seasons;
    private final JobRepository jobs;
    private final UserRepository users;

    public SeasonService(SeasonRepository seasons, JobRepository jobs, UserRepository users) {
        this.seasons = seasons;
        this.jobs = jobs;
        this.users = users;
    }

    public List<SeasonResponse> list(Long ownerId) {
        User owner = owner(ownerId);
        Map<Long, Long> jobCounts = jobs.findByOwnerIdOrderByCreatedAtDesc(ownerId).stream()
                .collect(Collectors.groupingBy(Job::getSeasonId, Collectors.counting()));
        return seasons.findByOwnerIdOrderByCreatedAtAsc(ownerId).stream()
                .map(season -> toResponse(season, jobCounts.getOrDefault(season.getId(), 0L), owner))
                .toList();
    }

    // Starting a new hunt is when someone wants to see it, so the new season is the one shown.
    @Transactional
    public SeasonResponse create(Long ownerId, String name) {
        User owner = owner(ownerId);
        Season season = seasons.save(new Season(ownerId, name));
        owner.viewSeason(season.getId());
        users.save(owner);
        return toResponse(season, 0, owner);
    }

    @Transactional
    public SeasonResponse rename(Long ownerId, Long seasonId, String name) {
        Season season = find(ownerId, seasonId);
        season.rename(name);
        seasons.save(season);
        return toResponse(season, jobs.findByOwnerIdAndSeasonIdOrderByCreatedAtDesc(ownerId, seasonId).size(),
                owner(ownerId));
    }

    // Only an empty season goes, so deleting one can never take a job with it.
    @Transactional
    public void delete(Long ownerId, Long seasonId) {
        Season season = find(ownerId, seasonId);
        if (jobs.existsBySeasonId(seasonId)) {
            throw new SeasonInUseException("move or delete this season's jobs first");
        }
        List<Season> all = seasons.findByOwnerIdOrderByCreatedAtAsc(ownerId);
        if (all.size() == 1) {
            throw new SeasonInUseException("an account keeps at least one season");
        }
        User owner = owner(ownerId);
        if (seasonId.equals(owner.getActiveSeasonId())) {
            owner.viewSeason(all.stream().filter(s -> !s.getId().equals(seasonId)).toList().getLast().getId());
            users.save(owner);
        }
        seasons.delete(season);
    }

    @Transactional
    public void view(Long ownerId, Long seasonId) {
        if (seasonId != null) {
            find(ownerId, seasonId);
        }
        User owner = owner(ownerId);
        owner.viewSeason(seasonId);
        users.save(owner);
    }

    @Transactional
    public void moveJob(Long ownerId, Long jobId, Long seasonId) {
        Job job = jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
        job.moveToSeason(find(ownerId, seasonId).getId());
        jobs.save(job);
    }

    // Null when every season is showing.
    public Long activeSeasonId(Long ownerId) {
        return owner(ownerId).getActiveSeasonId();
    }

    // Which jobs the board, calendar, offers, and Insights show. A filter, not a query, so links to a job
    // in another season still resolve against the whole account.
    public Predicate<Job> inView(Long ownerId) {
        Long active = activeSeasonId(ownerId);
        return job -> active == null || active.equals(job.getSeasonId());
    }

    // The season on screen, or the newest when every season is showing.
    @Transactional
    public Long seasonForNewJob(Long ownerId) {
        User owner = owner(ownerId);
        if (owner.getActiveSeasonId() != null) {
            return owner.getActiveSeasonId();
        }
        List<Season> all = seasons.findByOwnerIdOrderByCreatedAtAsc(ownerId);
        return all.isEmpty() ? startFirstSeason(owner) : all.getLast().getId();
    }

    // Matched by name, so a restore that fails part way and is retried reuses what it made.
    @Transactional
    public Long seasonNamed(Long ownerId, String name) {
        return seasons.findByOwnerIdOrderByCreatedAtAsc(ownerId).stream()
                .filter(season -> season.getName().equalsIgnoreCase(name.strip()))
                .findFirst()
                .orElseGet(() -> seasons.save(new Season(ownerId, name)))
                .getId();
    }

    public Map<Long, String> namesById(Long ownerId) {
        return seasons.findByOwnerIdOrderByCreatedAtAsc(ownerId).stream()
                .collect(Collectors.toMap(Season::getId, Season::getName));
    }

    @Transactional
    public Long startFirstSeason(User owner) {
        Season season = seasons.save(new Season(owner.getId(), Season.FIRST_NAME));
        owner.viewSeason(season.getId());
        users.save(owner);
        return season.getId();
    }

    // A season a caller named, confirmed to be this account's.
    public Long owned(Long ownerId, Long seasonId) {
        return find(ownerId, seasonId).getId();
    }

    private Season find(Long ownerId, Long seasonId) {
        return seasons.findByIdAndOwnerId(seasonId, ownerId).orElseThrow(SeasonNotFoundException::new);
    }

    private User owner(Long ownerId) {
        return users.findById(ownerId).orElseThrow(InvalidCredentialsException::new);
    }

    private SeasonResponse toResponse(Season season, long jobCount, User owner) {
        return new SeasonResponse(season.getId(), season.getName(), season.getCreatedAt(), jobCount,
                Objects.equals(season.getId(), owner.getActiveSeasonId()));
    }
}
