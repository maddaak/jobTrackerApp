package com.jobtracker.core.service;

import com.jobtracker.core.exception.TooManyLoginAttemptsException;
import com.jobtracker.core.model.KnownSignInAddress;
import com.jobtracker.core.model.LoginFailure;
import com.jobtracker.core.model.SignInSource;
import com.jobtracker.core.repository.KnownSignInAddressRepository;
import com.jobtracker.core.repository.LoginFailureRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

// Backoff per account on failed sign-ins, beside the bff's limit per address: guesses spread over many
// addresses, or arriving through the same proxy as the owner's, still slow down on the account itself.
// An address the account has signed in from keeps its own count, so a guesser elsewhere can't keep the
// owner waiting there; every other address shares one. Kept in the database, so a restart starts nobody over.
@Component
public class LoginThrottle {

    static final int FREE_FAILURES = 5;
    static final Duration FIRST_WAIT = Duration.ofSeconds(30);
    static final Duration MAX_WAIT = Duration.ofMinutes(15);
    // A run of failures this old is forgotten, so a typo next week isn't punished for this week's.
    static final Duration FORGET_AFTER = Duration.ofHours(1);
    static final String ANY_OTHER_ADDRESS = "";
    // The column's width; an IPv6 address is at most 45 characters.
    private static final int MAX_ADDRESS_CHARS = 64;

    private final LoginFailureRepository failures;
    private final KnownSignInAddressRepository knownAddresses;
    private final TransactionTemplate transactions;
    private final Clock clock;

    public LoginThrottle(LoginFailureRepository failures, KnownSignInAddressRepository knownAddresses,
            TransactionTemplate transactions, Clock clock) {
        this.failures = failures;
        this.knownAddresses = knownAddresses;
        this.transactions = transactions;
        this.clock = clock;
    }

    // Before the password is checked, and the same for an unknown username, so the wait reveals nothing. The
    // attempt is counted here, under a lock, so guesses sent at once can't all pass before any is counted;
    // the right password then clears the count.
    public void attempt(String username, String address) {
        SignInSource source = countedAs(username, address);
        try {
            transactions.executeWithoutResult(status -> count(source));
        } catch (DataIntegrityViolationException firstAtOnce) {
            // Two first attempts at once both add the row; the loser finds it now and takes its turn on the lock.
            transactions.executeWithoutResult(status -> count(source));
        }
    }

    // On the right password: this address's count starts over, and from now on is its own.
    public void succeeded(String username, String address) {
        SignInSource here = new SignInSource(username, trimmed(address));
        failures.deleteById(countedAs(username, address));
        if (!knownAddresses.existsById(here)) knownAddresses.save(new KnownSignInAddress(here));
    }

    // A password reset: the owner is back in, so no address keeps them waiting.
    public void clear(String username) {
        failures.deleteByUsername(username);
    }

    private SignInSource countedAs(String username, String address) {
        SignInSource here = new SignInSource(username, trimmed(address));
        return knownAddresses.existsById(here) ? here : new SignInSource(username, ANY_OTHER_ADDRESS);
    }

    private static String trimmed(String address) {
        return address == null ? ANY_OTHER_ADDRESS : address.substring(0, Math.min(address.length(), MAX_ADDRESS_CHARS));
    }

    private void count(SignInSource source) {
        Instant now = clock.instant();
        // Usernames are kept whether or not they exist, so stale ones go, or a spray of made-up names piles up.
        failures.deleteOlderThan(now.minus(FORGET_AFTER));
        LoginFailure run = failures.findForUpdate(source).orElseGet(() -> new LoginFailure(source));
        if (run.getFailures() >= FREE_FAILURES) {
            Duration left = Duration.between(now, run.getLastFailedAt().plus(waitAfter(run.getFailures())));
            if (left.isPositive()) throw new TooManyLoginAttemptsException(left);
        }
        run.attempted(now);
        failures.saveAndFlush(run);
    }

    // 30 seconds after the fifth failure in a row, doubling with each one after, up to 15 minutes.
    static Duration waitAfter(int count) {
        long seconds = FIRST_WAIT.toSeconds() << Math.min(count - FREE_FAILURES, 20);
        return Duration.ofSeconds(Math.min(seconds, MAX_WAIT.toSeconds()));
    }
}
