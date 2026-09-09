package com.jobtracker.core.repository;

import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.JobJourney;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import java.util.List;
import java.util.Optional;

public interface JobDetailRepository extends MongoRepository<JobDetail, String> {
    Optional<JobDetail> findByJobId(Long jobId);

    Optional<JobDetail> findByJobIdAndOwnerId(Long jobId, Long ownerId);

    // Scoped by owner so a guessed roundId can't reach another user's document.
    Optional<JobDetail> findByOwnerIdAndInterviewsRoundId(Long ownerId, String roundId);

    void deleteByJobId(Long jobId);

    // Projects away the JD blobs, most of the collection's bytes. JobJourney, so the nulls can't be saved back.
    @Query(value = "{ 'ownerId': ?0 }",
            fields = "{ 'jobId': 1, 'stageHistory': 1, 'interviews': 1, 'relatedJobs': 1 }")
    List<JobJourney> findJourneysByOwnerId(Long ownerId);

    // Finds the inbound edges a deleted job leaves behind.
    List<JobDetail> findByOwnerIdAndRelatedJobsJobId(Long ownerId, Long jobId);
}
