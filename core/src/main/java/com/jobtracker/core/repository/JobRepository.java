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

    // Fetch-joins source so listJobs doesn't N+1 on the eager-but-lazily-fetched ManyToOne.
    @Query("SELECT j FROM Job j JOIN FETCH j.source WHERE j.owner.id = :ownerId ORDER BY j.createdAt DESC")
    List<Job> findByOwnerIdWithSourceOrderByCreatedAtDesc(@Param("ownerId") Long ownerId);
}
