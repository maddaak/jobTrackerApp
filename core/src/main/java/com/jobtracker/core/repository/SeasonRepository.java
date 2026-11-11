package com.jobtracker.core.repository;

import com.jobtracker.core.model.Season;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface SeasonRepository extends JpaRepository<Season, Long> {
    List<Season> findByOwnerIdOrderByCreatedAtAsc(Long ownerId);
    Optional<Season> findByIdAndOwnerId(Long id, Long ownerId);
}
