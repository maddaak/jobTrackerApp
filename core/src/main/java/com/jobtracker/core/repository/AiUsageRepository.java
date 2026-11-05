package com.jobtracker.core.repository;

import com.jobtracker.core.model.AiUsage;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDate;
import java.util.Optional;

public interface AiUsageRepository extends JpaRepository<AiUsage, LocalDate> {

    // Locked, so two AI calls at once can't both take the day's last one.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from AiUsage u where u.day = :day")
    Optional<AiUsage> findForUpdate(@Param("day") LocalDate day);
}
