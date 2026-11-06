package com.jobtracker.core.repository;

import com.jobtracker.core.model.ReminderSettings;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;
import java.util.Optional;

public interface ReminderSettingsRepository extends MongoRepository<ReminderSettings, String> {
    Optional<ReminderSettings> findByOwnerId(Long ownerId);

    List<ReminderSettings> findByEmailEnabledTrueAndEmailIsNotNull();
}
