package com.jobtracker.core.repository;

import com.jobtracker.core.model.Job;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface JobRepository extends JpaRepository<Job, Long> {
    List<Job> findByOwnerIdOrderByCreatedAtDesc(Long ownerId);
    Optional<Job> findByIdAndOwnerId(Long id, Long ownerId);

    // Used by JobService.listJobs: fetch-joins the source so buildSummaryResponse's
    // job.getSource().getCategory() does not fire one extra select per job. Source is an
    // eager ManyToOne with no join fetch, so without this it is an N+1 over the job list.
    @Query("SELECT j FROM Job j JOIN FETCH j.source WHERE j.owner.id = :ownerId ORDER BY j.createdAt DESC")
    List<Job> findByOwnerIdWithSourceOrderByCreatedAtDesc(@Param("ownerId") Long ownerId);
}
