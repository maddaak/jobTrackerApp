package com.jobtracker.core.repository;

import com.jobtracker.core.model.SentReminder;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface SentReminderRepository extends MongoRepository<SentReminder, String> {
    List<SentReminder> findByOwnerId(Long ownerId);
}
