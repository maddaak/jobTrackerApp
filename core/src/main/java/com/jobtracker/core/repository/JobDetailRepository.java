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

    // Projects away the JD blobs, ~93% of the collection's bytes and growing with every scrape.
    // Returns JobJourney rather than JobDetail so the nulls the projection leaves behind can't be
    // saved back over the real fields; see JobJourney for why a shared interface would not do that.
    @Query(value = "{ 'ownerId': ?0 }",
            fields = "{ 'jobId': 1, 'stageHistory': 1, 'interviews': 1 }")
    List<JobJourney> findJourneysByOwnerId(Long ownerId);
}
