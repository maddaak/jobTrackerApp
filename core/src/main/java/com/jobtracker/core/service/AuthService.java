package com.jobtracker.core.service;

import com.jobtracker.core.dto.AuthResponse;
import com.jobtracker.core.dto.LoginRequest;
import com.jobtracker.core.dto.RegisterRequest;
import com.jobtracker.core.exception.InvalidCredentialsException;
import com.jobtracker.core.exception.InvalidPasswordException;
import com.jobtracker.core.exception.InvalidUsernameException;
import com.jobtracker.core.exception.UsernameTakenException;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.UserRepository;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import java.util.Optional;

@Service
public class AuthService {

    // A valid BCrypt hash used only to spend the same hashing time when the username is unknown,
    // so a caller cannot tell "no such user" from "wrong password" by response timing.
    private static final String DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

    private final UserRepository users;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public AuthService(UserRepository users, JwtService jwtService) {
        this.users = users;
        this.jwtService = jwtService;
    }

    public AuthResponse register(RegisterRequest request) {
        String username = normalize(request.username());
        UsernamePolicy.violation(username)
                .ifPresent(reason -> { throw new InvalidUsernameException(reason); });
        if (users.existsByUsername(username)) {
            throw new UsernameTakenException();
        }
        PasswordPolicy.violation(request.password())
                .ifPresent(reason -> { throw new InvalidPasswordException(reason); });

        User user = users.save(new User(username, passwordEncoder.encode(request.password())));
        return new AuthResponse(jwtService.issue(user.getId(), user.getUsername()), user.getUsername());
    }

    public AuthResponse login(LoginRequest request) {
        Optional<User> user = users.findByUsername(normalize(request.username()));
        if (user.isEmpty()) {
            // Run a dummy compare so an unknown username takes the same time as a wrong password.
            passwordEncoder.matches(request.password(), DUMMY_HASH);
            throw new InvalidCredentialsException();
        }
        if (!passwordEncoder.matches(request.password(), user.get().getPasswordHash())) {
            throw new InvalidCredentialsException();
        }
        return new AuthResponse(jwtService.issue(user.get().getId(), user.get().getUsername()), user.get().getUsername());
    }

    private String normalize(String username) {
        return username.trim().toLowerCase();
    }
}
