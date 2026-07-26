package com.jobtracker.core.service;

import com.jobtracker.core.dto.LoginRequest;
import com.jobtracker.core.dto.RegisterRequest;
import com.jobtracker.core.exception.InvalidCredentialsException;
import com.jobtracker.core.exception.InvalidPasswordException;
import com.jobtracker.core.exception.InvalidUsernameException;
import com.jobtracker.core.exception.UsernameTakenException;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class AuthServiceTests {

    @Mock
    private UserRepository users;

    @Mock
    private JwtService jwtService;

    private AuthService authService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        authService = new AuthService(users, jwtService);
    }

    @Test
    void registerThrowsWhenUsernameAlreadyTaken() {
        when(users.existsByUsername("alice")).thenReturn(true);

        assertThatThrownBy(() -> authService.register(new RegisterRequest("alice", "Str0ng!Pass")))
            .isInstanceOf(UsernameTakenException.class);

        verify(users, never()).save(any());
    }

    @Test
    void registerThrowsWhenPasswordFailsPolicy() {
        when(users.existsByUsername("bob")).thenReturn(false);

        assertThatThrownBy(() -> authService.register(new RegisterRequest("bob", "weak")))
            .isInstanceOf(InvalidPasswordException.class);

        verify(users, never()).save(any());
    }

    @Test
    void registerSavesHashedPasswordAndReturnsToken() {
        when(users.existsByUsername("carol")).thenReturn(false);
        when(users.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jwtService.issue(any(), eq("carol"))).thenReturn("signed.jwt.token");

        var response = authService.register(new RegisterRequest("carol", "Str0ng!Pass"));

        assertThat(response.username()).isEqualTo("carol");
        assertThat(response.token()).isEqualTo("signed.jwt.token");

        var captor = org.mockito.ArgumentCaptor.forClass(User.class);
        verify(users).save(captor.capture());
        assertThat(captor.getValue().getPasswordHash()).isNotEqualTo("Str0ng!Pass");
        assertThat(new BCryptPasswordEncoder().matches("Str0ng!Pass", captor.getValue().getPasswordHash())).isTrue();
    }

    @Test
    void loginThrowsWhenUsernameNotFound() {
        when(users.findByUsername("nobody")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login(new LoginRequest("nobody", "whatever")))
            .isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void loginThrowsWhenPasswordDoesNotMatch() {
        String hash = new BCryptPasswordEncoder().encode("Str0ng!Pass");
        when(users.findByUsername("dave")).thenReturn(Optional.of(new User("dave", hash)));

        assertThatThrownBy(() -> authService.login(new LoginRequest("dave", "WrongPass1!")))
            .isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void loginReturnsTokenOnCorrectPassword() {
        String hash = new BCryptPasswordEncoder().encode("Str0ng!Pass");
        when(users.findByUsername("erin")).thenReturn(Optional.of(new User("erin", hash)));
        when(jwtService.issue(any(), eq("erin"))).thenReturn("signed.jwt.token");

        var response = authService.login(new LoginRequest("erin", "Str0ng!Pass"));

        assertThat(response.username()).isEqualTo("erin");
        assertThat(response.token()).isEqualTo("signed.jwt.token");
    }

    @Test
    void registerNormalizesUsernameToLowercase() {
        when(users.existsByUsername("frank")).thenReturn(false);
        when(users.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jwtService.issue(any(), eq("frank"))).thenReturn("signed.jwt.token");

        var response = authService.register(new RegisterRequest("FRANK", "Str0ng!Pass"));

        assertThat(response.username()).isEqualTo("frank");
        verify(users).existsByUsername("frank");
    }

    @Test
    void loginIsCaseInsensitiveOnUsername() {
        String hash = new BCryptPasswordEncoder().encode("Str0ng!Pass");
        when(users.findByUsername("grace")).thenReturn(Optional.of(new User("grace", hash)));
        when(jwtService.issue(any(), eq("grace"))).thenReturn("signed.jwt.token");

        var response = authService.login(new LoginRequest("Grace", "Str0ng!Pass"));

        assertThat(response.username()).isEqualTo("grace");
        verify(users).findByUsername("grace");
    }

    @Test
    void registerRejectsUsernameThatIsTooShort() {
        assertThatThrownBy(() -> authService.register(new RegisterRequest("ab", "Str0ng!Pass")))
            .isInstanceOf(InvalidUsernameException.class);

        verify(users, never()).save(any());
    }

    @Test
    void registerRejectsUsernameWithDisallowedCharacters() {
        assertThatThrownBy(() -> authService.register(new RegisterRequest("henry!", "Str0ng!Pass")))
            .isInstanceOf(InvalidUsernameException.class);

        verify(users, never()).save(any());
    }

    @Test
    void registerRejectsUsernameStartingWithPunctuation() {
        assertThatThrownBy(() -> authService.register(new RegisterRequest("-henry", "Str0ng!Pass")))
            .isInstanceOf(InvalidUsernameException.class);

        verify(users, never()).save(any());
    }

    @Test
    void registerAllowsDotsUnderscoresAndHyphensInTheMiddle() {
        when(users.existsByUsername("henry.k_smith-jr")).thenReturn(false);
        when(users.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jwtService.issue(any(), eq("henry.k_smith-jr"))).thenReturn("signed.jwt.token");

        var response = authService.register(new RegisterRequest("henry.k_smith-jr", "Str0ng!Pass"));

        assertThat(response.username()).isEqualTo("henry.k_smith-jr");
    }
}
