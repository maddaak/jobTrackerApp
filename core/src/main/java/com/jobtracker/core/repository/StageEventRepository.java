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

    // DISTINCT + JOIN FETCH eager-loads interviewers in one query, avoiding the N+1 in listJobs.
    @Query("SELECT DISTINCT se FROM StageEvent se LEFT JOIN FETCH se.interviewers "
            + "WHERE se.job.owner.id = :ownerId AND se.interviewDateTime IS NOT NULL")
    List<StageEvent> findAllWithInterviewersByJobOwnerId(@Param("ownerId") Long ownerId);

    // Upcoming-interviews banner: same eager shape, scoped to a window, soonest first.
    @Query("SELECT DISTINCT se FROM StageEvent se LEFT JOIN FETCH se.interviewers "
            + "WHERE se.job.owner.id = :ownerId AND se.interviewDateTime BETWEEN :from AND :to "
            + "ORDER BY se.interviewDateTime ASC")
    List<StageEvent> findUpcomingWithInterviewersByJobOwnerId(
            @Param("ownerId") Long ownerId, @Param("from") Instant from, @Param("to") Instant to);

    // Eager-loads both job and interviewers so listInterviews' toResponse fires no per-row N+1.
    @Query("SELECT DISTINCT se FROM StageEvent se JOIN FETCH se.job LEFT JOIN FETCH se.interviewers "
            + "WHERE se.job.owner.id = :ownerId AND se.interviewDateTime IS NOT NULL")
    List<StageEvent> findAllWithJobAndInterviewersByJobOwnerId(@Param("ownerId") Long ownerId);
}
