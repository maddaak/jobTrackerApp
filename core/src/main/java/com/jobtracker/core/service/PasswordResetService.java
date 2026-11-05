package com.jobtracker.core.service;

import com.jobtracker.core.exception.InvalidResetTokenException;
import com.jobtracker.core.model.PasswordResetToken;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.PasswordResetTokenRepository;
import com.jobtracker.core.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;

// Two ways back in with no hosted account service: a temporary password from the terminal (always works,
// needs access to the machine), or an emailed link (needs SMTP and an address on the account).
@Service
public class PasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);
    static final Duration LINK_LIFETIME = Duration.ofHours(1);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository users;
    private final PasswordResetTokenRepository tokens;
    private final AccountService accounts;
    private final ReminderMailer mailer;
    private final LoginThrottle throttle;
    private final Clock clock;
    private final String appUrl;

    public PasswordResetService(UserRepository users, PasswordResetTokenRepository tokens, AccountService accounts,
            ReminderMailer mailer, LoginThrottle throttle, Clock clock,
            @Value("${app.url:http://localhost:5173}") String appUrl) {
        this.users = users;
        this.tokens = tokens;
        this.accounts = accounts;
        this.mailer = mailer;
        this.throttle = throttle;
        this.clock = clock;
        this.appUrl = appUrl;
    }

    // Empty when there's no such account, so the terminal can say so; only reachable inside Docker.
    @Transactional
    public Optional<String> temporaryPassword(String username) {
        return users.findByUsername(AuthService.normalize(username)).map(user -> {
            String temporary = generateTemporaryPassword();
            reset(user, temporary);
            return temporary;
        });
    }

    // Off the request, so the answer takes as long for a real account, which saves a link and talks to the mail
    // server, as for a made-up one, and its timing can't say which usernames exist.
    public void requestResetLink(String username) {
        Thread.startVirtualThread(() -> emailResetLink(username));
    }

    // Says nothing about whether the account exists or has an address, so the form can't be used to find out.
    void emailResetLink(String username) {
        Optional<User> found = users.findByUsername(AuthService.normalize(username));
        if (found.isEmpty() || found.get().getEmail() == null || !mailer.configured()) {
            return;
        }
        User user = found.get();
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes(32));
        tokens.save(new PasswordResetToken(user.getId(), hash(token), clock.instant().plus(LINK_LIFETIME)));
        try {
            mailer.send(user.getEmail(), "Reset your Job Tracker password",
                    "Someone asked to reset the password for " + user.getUsername() + ". If it was you, open this link"
                            + " within an hour to choose a new one:\n\n" + appUrl + "/reset-password?token=" + token
                            + "\n\nIf it wasn't you, ignore this email: your password hasn't changed.");
        } catch (MailException e) {
            log.warn("password reset email for account {} not sent: {}", user.getId(), e.getMostSpecificCause().getMessage());
        }
    }

    @Transactional
    public void resetWithToken(String token, String newPassword) {
        PasswordResetToken stored = tokens.findByTokenHash(hash(token))
                .filter(candidate -> candidate.usableAt(clock.instant()))
                .orElseThrow(InvalidResetTokenException::new);
        User user = users.findById(stored.getUserId()).orElseThrow(InvalidResetTokenException::new);
        reset(user, newPassword);
    }

    // Whichever way the owner got back in, the links still out stop working, and a guesser's backoff no
    // longer keeps them waiting.
    private void reset(User user, String newPassword) {
        accounts.setPassword(user, newPassword);
        tokens.deleteByUserId(user.getId());
        throttle.clear(user.getUsername());
    }

    // Meets the password policy by construction: a letter of each case, a digit, and a symbol, then randomness.
    static String generateTemporaryPassword() {
        String random = Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes(12));
        return "Tmp-" + random + "a7";
    }

    private static byte[] randomBytes(int count) {
        byte[] bytes = new byte[count];
        RANDOM.nextBytes(bytes);
        return bytes;
    }

    static String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is always available", e);
        }
    }
}
