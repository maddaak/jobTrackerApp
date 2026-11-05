package com.jobtracker.core.repository;

import com.jobtracker.core.model.LoginFailure;
import com.jobtracker.core.model.SignInSource;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.Optional;

public interface LoginFailureRepository extends JpaRepository<LoginFailure, SignInSource> {

    // Locked, so sign-ins sent at once take turns on the count rather than all reading it before any adds.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select f from LoginFailure f where f.source = :source")
    Optional<LoginFailure> findForUpdate(@Param("source") SignInSource source);

    // One statement, rather than loading each stale row to delete it.
    @Modifying
    @Transactional
    @Query("delete from LoginFailure f where f.lastFailedAt < :before")
    void deleteOlderThan(@Param("before") Instant before);

    @Modifying
    @Transactional
    @Query("delete from LoginFailure f where f.source.username = :username")
    void deleteByUsername(@Param("username") String username);
}
