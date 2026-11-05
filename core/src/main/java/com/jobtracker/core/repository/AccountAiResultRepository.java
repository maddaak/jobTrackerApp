package com.jobtracker.core.repository;

import com.jobtracker.core.model.AccountAiResult;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;
import java.util.Optional;

public interface AccountAiResultRepository extends MongoRepository<AccountAiResult, String> {
    Optional<AccountAiResult> findByOwnerIdAndKey(Long ownerId, String key);

    List<AccountAiResult> findByOwnerId(Long ownerId);

    void deleteByOwnerIdAndKey(Long ownerId, String key);

    void deleteByOwnerId(Long ownerId);
}
