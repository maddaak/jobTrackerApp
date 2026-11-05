package com.jobtracker.core.service;

import com.jobtracker.core.dto.AuthResponse;
import com.jobtracker.core.dto.LoginRequest;
import com.jobtracker.core.dto.RegisterRequest;
import com.jobtracker.core.exception.InvalidCredentialsException;
import com.jobtracker.core.exception.InvalidPasswordException;
import com.jobtracker.core.exception.InvalidUsernameException;
import com.jobtracker.core.exception.RegistrationClosedException;
import com.jobtracker.core.exception.UsernameTakenException;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import java.util.Optional;

@Service
public class AuthService {

    // Compared against on unknown usernames so timing can't distinguish that from a wrong password.
    private static final String DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

    private final UserRepository users;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final boolean registrationOpen;
    private final SeasonService seasons;
    private final LoginThrottle throttle;

    public AuthService(UserRepository users, JwtService jwtService, PasswordEncoder passwordEncoder,
            @Value("${app.registration-open:false}") boolean registrationOpen, SeasonService seasons,
            LoginThrottle throttle) {
        this.users = users;
        this.jwtService = jwtService;
        this.passwordEncoder = passwordEncoder;
        this.registrationOpen = registrationOpen;
        this.seasons = seasons;
        this.throttle = throttle;
    }

    // One person runs this app, so once they've registered, anyone else who can reach it on the network
    // shouldn't be able to make an account unless the owner opens it in .env.
    public boolean canRegister() {
        return registrationOpen || users.count() == 0;
    }

    public AuthResponse register(RegisterRequest request) {
        if (!canRegister()) {
            throw new RegistrationClosedException();
        }
        String username = normalize(request.username());
        UsernamePolicy.violation(username)
                .ifPresent(reason -> { throw new InvalidUsernameException(reason); });
        if (users.existsByUsername(username)) {
            throw new UsernameTakenException();
        }
        PasswordPolicy.violation(request.password())
                .ifPresent(reason -> { throw new InvalidPasswordException(reason); });

        User user = users.save(new User(username, passwordEncoder.encode(request.password()),
                request.name().trim(), request.email().trim()));
        seasons.startFirstSeason(user);
        return new AuthResponse(jwtService.issue(user), user.getUsername());
    }

    public AuthResponse login(LoginRequest request, String address) {
        String username = normalize(request.username());
        throttle.attempt(username, address);
        Optional<User> user = users.findByUsername(username);
        if (user.isEmpty()) {
            // Run a dummy compare so an unknown username takes the same time as a wrong password.
            passwordEncoder.matches(request.password(), DUMMY_HASH);
            throw new InvalidCredentialsException();
        }
        if (!passwordEncoder.matches(request.password(), user.get().getPasswordHash())) {
            throw new InvalidCredentialsException();
        }
        throttle.succeeded(username, address);
        return new AuthResponse(jwtService.issue(user.get()), user.get().getUsername());
    }

    static String normalize(String username) {
        return username.trim().toLowerCase();
    }
}
