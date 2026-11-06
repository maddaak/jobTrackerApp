package com.jobtracker.core.service;

import com.jobtracker.core.dto.LoginRequest;
import com.jobtracker.core.exception.AiDailyLimitException;
import com.jobtracker.core.exception.InvalidCredentialsException;
import com.jobtracker.core.exception.TooManyLoginAttemptsException;
import com.jobtracker.core.exception.InvalidResetTokenException;
import com.jobtracker.core.model.AiUsage;
import com.jobtracker.core.model.LoginFailure;
import com.jobtracker.core.model.PasswordResetToken;
import com.jobtracker.core.model.Season;
import com.jobtracker.core.model.SignInSource;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.AiUsageRepository;
import com.jobtracker.core.repository.LoginFailureRepository;
import com.jobtracker.core.repository.PasswordResetTokenRepository;
import com.jobtracker.core.repository.SeasonRepository;
import com.jobtracker.core.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// Not in a test transaction: each call commits on its own, as it does when requests arrive together.
@SpringBootTest
class ConcurrentRequestsTests {

    private static final int AT_ONCE = 10;

    @Autowired
    private AuthService auth;

    @Autowired
    private AiUsageService aiUsage;

    @Autowired
    private LoginFailureRepository loginFailures;

    @Autowired
    private AiUsageRepository usage;

    @Autowired
    private UserRepository users;

    @Autowired
    private SeasonRepository seasons;

    @Autowired
    private PasswordResetService resets;

    @Autowired
    private PasswordResetTokenRepository resetTokens;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @AfterEach
    void forget() {
        loginFailures.deleteAll();
        usage.deleteAll();
    }

    // Two first attempts at once each build a new row. The later save must fail and retry on the lock: a save that
    // merged over the earlier one put the count back to 1, so a burst's guesses all went through (seen in CI).
    @Test
    void aNewCountNeverOverwritesOneAlreadySaved() {
        SignInSource source = new SignInSource("nobody", "");
        LoginFailure counted = new LoginFailure(source);
        for (int i = 0; i < 3; i++) counted.attempted(Instant.now());
        loginFailures.saveAndFlush(counted);
        AiUsage today = new AiUsage(LocalDate.now());
        today.counted();
        usage.saveAndFlush(today);

        assertThatThrownBy(() -> loginFailures.saveAndFlush(new LoginFailure(source)))
            .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> usage.saveAndFlush(new AiUsage(LocalDate.now())))
            .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(loginFailures.findById(source)).get().extracting(LoginFailure::getFailures).isEqualTo(3);
        assertThat(usage.findById(LocalDate.now())).get().extracting(AiUsage::getCalls).isEqualTo(1);
    }

    // A guesser spread over many addresses can send a burst; each guess must count before the next is let in.
    @Test
    void guessesSentAtOnceStillWaitAfterTheFreeOnes() throws Exception {
        List<String> outcomes = allAtOnce(AT_ONCE, () -> auth.login(new LoginRequest("nobody", "WrongPass1!"), ""));

        assertThat(Collections.frequency(outcomes, InvalidCredentialsException.class.getSimpleName()))
            .isEqualTo(LoginThrottle.FREE_FAILURES);
        assertThat(Collections.frequency(outcomes, TooManyLoginAttemptsException.class.getSimpleName()))
            .isEqualTo(AT_ONCE - LoginThrottle.FREE_FAILURES);
    }

    // The day's row doesn't exist until its first call, so there's nothing to lock until one call adds it.
    @Test
    void theDaysFirstCallsAtOnceAreEachCountedAndNoneFails() throws Exception {
        int limit = 4;

        List<String> outcomes = allAtOnce(AT_ONCE, () -> aiUsage.use(limit));

        assertThat(Collections.frequency(outcomes, "done")).isEqualTo(limit);
        assertThat(Collections.frequency(outcomes, AiDailyLimitException.class.getSimpleName())).isEqualTo(AT_ONCE - limit);
    }

    // A link opened twice at once, from a double click or a mail scanner, sets one password, not two.
    @Test
    void aResetLinkUsedTwiceAtOnceWorksOnce() throws Exception {
        User owner = users.save(new User("link-racer", "hash"));
        resetTokens.save(new PasswordResetToken(owner.getId(), PasswordResetService.hash("the-link"),
                Instant.now().plus(PasswordResetService.LINK_LIFETIME)));

        try {
            List<String> outcomes = allAtOnce(2, () -> resets.resetWithToken("the-link", "N3w!Password"));

            assertThat(outcomes).containsExactlyInAnyOrder("done",InvalidResetTokenException.class.getSimpleName());
            assertThat(users.findSessionVersionById(owner.getId())).contains(1);
        } finally {
            users.deleteById(owner.getId());
        }
    }

    // A switch that read the account before "sign out other devices" committed must not write the old version back.
    @Test
    void aSeasonSwitchBesideASignOutOfOtherDevicesKeepsTheSignOut() {
        User owner = users.save(new User("season-racer", "hash"));
        Season season = seasons.save(new Season(owner.getId(), "Next hunt"));
        TransactionTemplate apart = new TransactionTemplate(transactionManager);
        apart.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        try {
            new TransactionTemplate(transactionManager).executeWithoutResult(switching -> {
                User read = users.findById(owner.getId()).orElseThrow();
                apart.executeWithoutResult(signingOut -> users.findById(owner.getId()).orElseThrow().endSessions());
                read.viewSeason(season.getId());
            });

            assertThat(users.findSessionVersionById(owner.getId())).contains(1);
            assertThat(users.findById(owner.getId()).orElseThrow().getActiveSeasonId()).isEqualTo(season.getId());
        } finally {
            User left = users.findById(owner.getId()).orElseThrow();
            left.viewSeason(null);
            users.save(left);
            seasons.delete(season);
            users.deleteById(owner.getId());
        }
    }

    // What each call ended in: "done", or the name of the exception that refused it.
    private static List<String> allAtOnce(int times, Runnable call) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        List<Future<String>> running = new ArrayList<>();
        try (ExecutorService threads = Executors.newFixedThreadPool(times)) {
            for (int i = 0; i < times; i++) {
                running.add(threads.submit(() -> {
                    start.await();
                    try {
                        call.run();
                        return "done";
                    } catch (RuntimeException refused) {
                        return refused.getClass().getSimpleName();
                    }
                }));
            }
            start.countDown();
            List<String> outcomes = new ArrayList<>();
            for (Future<String> outcome : running) outcomes.add(outcome.get());
            return outcomes;
        }
    }
}
