package com.jobtracker.core.repository;

import com.jobtracker.core.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);
    boolean existsByUsername(String username);

    // Checked on every signed-in request, so only the one column is read.
    @Query("select u.sessionVersion from User u where u.id = :id")
    Optional<Integer> findSessionVersionById(@Param("id") Long id);
}
