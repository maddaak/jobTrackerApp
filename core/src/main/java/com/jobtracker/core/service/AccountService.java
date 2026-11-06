package com.jobtracker.core.service;

import com.jobtracker.core.dto.AccountResponse;
import com.jobtracker.core.dto.AuthResponse;
import com.jobtracker.core.dto.ChangePasswordRequest;
import com.jobtracker.core.dto.UpdateAccountRequest;
import com.jobtracker.core.exception.InvalidCredentialsException;
import com.jobtracker.core.exception.InvalidPasswordException;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.MailException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AccountService {

    private static final Logger log = LoggerFactory.getLogger(AccountService.class);

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final ReminderMailer mailer;

    public AccountService(UserRepository users, PasswordEncoder passwordEncoder, JwtService jwtService,
            ReminderMailer mailer) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.mailer = mailer;
    }

    public AccountResponse get(Long userId) {
        return toResponse(userOf(userId));
    }

    // Reset links go to this email, so a session alone, which could be stolen, can't move it: it takes the
    // password, and the old address is told.
    public AccountResponse update(Long userId, UpdateAccountRequest request) {
        User user = userOf(userId);
        String oldEmail = user.getEmail();
        String newEmail = request.email().trim();
        boolean emailChanged = !newEmail.equalsIgnoreCase(oldEmail == null ? "" : oldEmail);
        if (emailChanged && (request.currentPassword() == null
                || !passwordEncoder.matches(request.currentPassword(), user.getPasswordHash()))) {
            throw new InvalidPasswordException("enter your current password to change your email");
        }
        user.updateProfile(request.name().trim(), newEmail);
        AccountResponse saved = toResponse(users.save(user));
        if (emailChanged && oldEmail != null && mailer.configured()) {
            try {
                mailer.send(oldEmail, "Your Job Tracker email was changed",
                        "The email for " + user.getUsername() + " is now " + newEmail + ", so password reset links"
                                + " go there. If you didn't change it, sign in and change your password.");
            } catch (MailException e) {
                log.warn("email change notice for account {} not sent: {}", userId, e.getMostSpecificCause().getMessage());
            }
        }
        return saved;
    }

    // A 400, not a 401: the session is fine, only the password typed was wrong, and a 401 would log them out.
    // The change ends every session, so the one making it gets a new token and stays signed in.
    public AuthResponse changePassword(Long userId, ChangePasswordRequest request) {
        User user = userOf(userId);
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new InvalidPasswordException("current password is incorrect");
        }
        setPassword(user, request.newPassword());
        return new AuthResponse(jwtService.issue(user), user.getUsername());
    }

    // For a session left signed in somewhere else; this one carries on with a new token.
    public AuthResponse endOtherSessions(Long userId) {
        User user = userOf(userId);
        user.endSessions();
        users.save(user);
        return new AuthResponse(jwtService.issue(user), user.getUsername());
    }

    // Shared by a change and both kinds of reset, so every route to a new password applies the same policy.
    void setPassword(User user, String newPassword) {
        PasswordPolicy.violation(newPassword).ifPresent(reason -> { throw new InvalidPasswordException(reason); });
        user.changePasswordHash(passwordEncoder.encode(newPassword));
        users.save(user);
    }

    private User userOf(Long userId) {
        return users.findById(userId).orElseThrow(InvalidCredentialsException::new);
    }

    private static AccountResponse toResponse(User user) {
        return new AccountResponse(user.getUsername(), user.getName(), user.getEmail());
    }
}
