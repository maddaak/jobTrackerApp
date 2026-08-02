package com.jobtracker.core.repository;

import com.jobtracker.core.model.JobDetail;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.Optional;

public interface JobDetailRepository extends MongoRepository<JobDetail, String> {
    Optional<JobDetail> findByJobId(Long jobId);

    void deleteByJobId(Long jobId);
}
