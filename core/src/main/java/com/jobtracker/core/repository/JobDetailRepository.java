package com.jobtracker.core.repository;

import com.jobtracker.core.model.JobContacts;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.JobJourney;
import com.jobtracker.core.model.JobResume;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import java.util.Collection;
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

    @Query(value = "{ 'ownerId': ?0, 'contacts.followUpOn': { $ne: null } }", fields = "{ 'jobId': 1, 'contacts': 1 }")
    List<JobContacts> findContactsWithFollowUpsByOwnerId(Long ownerId);

    @Query(value = "{ 'ownerId': ?0, 'sentResume': { $ne: null } }", fields = "{ 'jobId': 1, 'sentResume': 1 }")
    List<JobResume> findSentResumesByOwnerId(Long ownerId);

    List<JobDetail> findByOwnerIdAndJobIdIn(Long ownerId, Collection<Long> jobIds);

    List<JobDetail> findByOwnerIdAndSampleTrue(Long ownerId);

    // Finds the inbound edges a deleted job leaves behind.
    List<JobDetail> findByOwnerIdAndRelatedJobsJobId(Long ownerId, Long jobId);
}
