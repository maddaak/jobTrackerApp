package com.jobtracker.core.repository;

import com.jobtracker.core.model.Resume;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;
import java.util.Optional;

public interface ResumeRepository extends MongoRepository<Resume, String> {
    List<Resume> findByOwnerId(Long ownerId);

    Optional<Resume> findByIdAndOwnerId(String id, Long ownerId);
}
