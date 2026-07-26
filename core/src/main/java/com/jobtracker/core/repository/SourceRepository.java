package com.jobtracker.core.repository;

import com.jobtracker.core.model.Source;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SourceRepository extends JpaRepository<Source, Long> {
}
