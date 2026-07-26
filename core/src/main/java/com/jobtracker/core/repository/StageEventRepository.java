package com.jobtracker.core.repository;

import com.jobtracker.core.model.StageEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface StageEventRepository extends JpaRepository<StageEvent, Long> {
    List<StageEvent> findByJobIdOrderByEnteredAtAsc(Long jobId);

    void deleteByJobId(Long jobId);

    Optional<StageEvent> findByIdAndJob_Owner_Id(Long id, Long ownerId);

    List<StageEvent> findByJob_Owner_IdAndInterviewDateTimeIsNotNull(Long ownerId);

    Optional<StageEvent> findTopByJobIdAndInterviewDateTimeIsNotNullOrderByInterviewDateTimeDesc(Long jobId);

    long countByJobIdAndInterviewDateTimeIsNotNull(Long jobId);

    // Used by JobService.listJobs to build every job's latest-interview summary from one
    // query instead of 2-3 queries per job — DISTINCT + LEFT JOIN FETCH avoids duplicate
    // rows from the interviewers join while still eager-loading them (interviewers is
    // otherwise lazy, so touching it per-row here would just reintroduce the N+1).
    @Query("SELECT DISTINCT se FROM StageEvent se LEFT JOIN FETCH se.interviewers "
            + "WHERE se.job.owner.id = :ownerId AND se.interviewDateTime IS NOT NULL")
    List<StageEvent> findAllWithInterviewersByJobOwnerId(@Param("ownerId") Long ownerId);
}
