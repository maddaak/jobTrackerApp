package com.jobtracker.core.repository;

import com.jobtracker.core.model.Job;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface JobRepository extends JpaRepository<Job, Long> {
    List<Job> findByOwnerIdOrderByCreatedAtDesc(Long ownerId);
    List<Job> findByOwnerIdAndSeasonIdOrderByCreatedAtDesc(Long ownerId, Long seasonId);
    boolean existsBySeasonId(Long seasonId);
    Optional<Job> findByIdAndOwnerId(Long id, Long ownerId);
}
