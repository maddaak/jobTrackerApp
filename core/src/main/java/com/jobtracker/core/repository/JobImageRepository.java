package com.jobtracker.core.repository;

import com.jobtracker.core.model.JobImage;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import java.util.List;
import java.util.Optional;

public interface JobImageRepository extends MongoRepository<JobImage, String> {

    // Projects away the bytes: the modal lists attachments and only fetches one when it is clicked.
    @Query(value = "{ 'jobId': ?0 }", fields = "{ 'data': 0 }")
    List<JobImage> findMetadataByJobId(Long jobId);

    // Owner-scoped against a guessed id, job-scoped so the job in the URL has to be the image's own.
    Optional<JobImage> findByIdAndJobIdAndOwnerId(String id, Long jobId, Long ownerId);

    long countByJobId(Long jobId);

    void deleteByJobId(Long jobId);
}
