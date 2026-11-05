package com.jobtracker.core.service;

import com.jobtracker.core.exception.AiDailyLimitException;
import com.jobtracker.core.model.AiUsage;
import com.jobtracker.core.repository.AiUsageRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Clock;
import java.time.LocalDate;

// A cap on the owner's AI bill: the bff asks here before every AI call. One count for the whole app, since
// every account spends the same key, kept in the database so a restart doesn't start the day over.
@Service
public class AiUsageService {

    private final AiUsageRepository usage;
    private final TransactionTemplate transactions;
    private final Clock clock;

    public AiUsageService(AiUsageRepository usage, TransactionTemplate transactions, Clock clock) {
        this.usage = usage;
        this.transactions = transactions;
        this.clock = clock;
    }

    // Counts the call if the day has room under the limit, and refuses it if not.
    public void use(int dailyLimit) {
        try {
            transactions.executeWithoutResult(status -> count(dailyLimit));
        } catch (DataIntegrityViolationException firstAtOnce) {
            // The day's first two calls at once both add its row; the loser finds it now and takes its turn on the lock.
            transactions.executeWithoutResult(status -> count(dailyLimit));
        }
    }

    private void count(int dailyLimit) {
        LocalDate today = LocalDate.now(clock);
        AiUsage day = usage.findForUpdate(today).orElseGet(() -> new AiUsage(today));
        if (day.getCalls() >= dailyLimit) throw new AiDailyLimitException(dailyLimit);
        day.counted();
        usage.saveAndFlush(day);
    }
}
