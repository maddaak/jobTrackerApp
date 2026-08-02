package com.jobtracker.core.repository;

import com.jobtracker.core.model.StageEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface StageEventRepository extends JpaRepository<StageEvent, Long> {
    List<StageEvent> findByJobIdOrderByEnteredAtAsc(Long jobId);

    void deleteByJobId(Long jobId);

    Optional<StageEvent> findByIdAndJob_Owner_Id(Long id, Long ownerId);

    @Query("SELECT se FROM StageEvent se JOIN FETCH se.job WHERE se.job.owner.id = :ownerId")
    List<StageEvent> findAllByJobOwnerId(@Param("ownerId") Long ownerId);

    Optional<StageEvent> findTopByJobIdAndInterviewDateTimeIsNotNullOrderByInterviewDateTimeDesc(Long jobId);

    long countByJobIdAndInterviewDateTimeIsNotNull(Long jobId);

    // Used by JobService.listJobs to build every job's latest-interview summary from one query
    // instead of 2-3 queries per job. DISTINCT + LEFT JOIN FETCH avoids duplicate rows from the
    // interviewers join while still eager-loading them (interviewers is otherwise lazy, so
    // touching it per-row here would just reintroduce the N+1).
    @Query("SELECT DISTINCT se FROM StageEvent se LEFT JOIN FETCH se.interviewers "
            + "WHERE se.job.owner.id = :ownerId AND se.interviewDateTime IS NOT NULL")
    List<StageEvent> findAllWithInterviewersByJobOwnerId(@Param("ownerId") Long ownerId);

    // Used by the upcoming-interviews banner: same eager-interviewers shape as above, but
    // scoped to a time window instead of "all", ordered so the soonest interview is first.
    @Query("SELECT DISTINCT se FROM StageEvent se LEFT JOIN FETCH se.interviewers "
            + "WHERE se.job.owner.id = :ownerId AND se.interviewDateTime BETWEEN :from AND :to "
            + "ORDER BY se.interviewDateTime ASC")
    List<StageEvent> findUpcomingWithInterviewersByJobOwnerId(
            @Param("ownerId") Long ownerId, @Param("from") Instant from, @Param("to") Instant to);

    // Used by InterviewService.listInterviews: eager-loads BOTH the job (ManyToOne, touched
    // for company/role in the response) and the interviewers (lazy OneToMany) in one query.
    // Without this, toResponse would fire ~2 extra queries per row (the job select plus the
    // lazy interviewers select), a classic N+1 over the caller's interview list.
    @Query("SELECT DISTINCT se FROM StageEvent se JOIN FETCH se.job LEFT JOIN FETCH se.interviewers "
            + "WHERE se.job.owner.id = :ownerId AND se.interviewDateTime IS NOT NULL")
    List<StageEvent> findAllWithJobAndInterviewersByJobOwnerId(@Param("ownerId") Long ownerId);
}
