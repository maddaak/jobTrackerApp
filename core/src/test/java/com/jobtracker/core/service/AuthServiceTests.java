package com.jobtracker.core.service;

import com.jobtracker.core.dto.LoginRequest;
import com.jobtracker.core.dto.RegisterRequest;
import com.jobtracker.core.exception.InvalidCredentialsException;
import com.jobtracker.core.exception.InvalidPasswordException;
import com.jobtracker.core.exception.InvalidUsernameException;
import com.jobtracker.core.exception.RegistrationClosedException;
import com.jobtracker.core.exception.TooManyLoginAttemptsException;
import com.jobtracker.core.exception.UsernameTakenException;
import com.jobtracker.core.model.LoginFailure;
import com.jobtracker.core.model.SignInSource;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.KnownSignInAddressRepository;
import com.jobtracker.core.repository.LoginFailureRepository;
import com.jobtracker.core.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class AuthServiceTests {

    @Mock
    private UserRepository users;

    @Mock
    private JwtService jwtService;

    @Mock
    private SeasonService seasons;

    private AuthService authService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        authService = new AuthService(users, jwtService, new BCryptPasswordEncoder(), false, seasons, throttle());
    }

    // Documentation addresses (RFC 5737): the owner's usual one, and a guesser's.
    private static final String HOME = "203.0.113.5";
    private static final String ELSEWHERE = "198.51.100.7";

    // Both tables, held in memory, so the waits can be stepped through without a database.
    private LoginThrottle throttle() {
        Map<SignInSource, LoginFailure> rows = new HashMap<>();
        Set<SignInSource> known = new HashSet<>();
        LoginFailureRepository failures = mock(LoginFailureRepository.class);
        when(failures.findForUpdate(any())).thenAnswer(call -> Optional.ofNullable(rows.get(call.<SignInSource>getArgument(0))));
        when(failures.saveAndFlush(any(LoginFailure.class))).thenAnswer(call -> {
            LoginFailure row = call.getArgument(0);
            rows.put(row.getSource(), row);
            return row;
        });
        doAnswer(call -> rows.remove(call.<SignInSource>getArgument(0))).when(failures).deleteById(any());
        doAnswer(call -> rows.values().removeIf(row -> row.getLastFailedAt().isBefore(call.getArgument(0))))
            .when(failures).deleteOlderThan(any());
        doAnswer(call -> rows.keySet().removeIf(source -> source.username().equals(call.getArgument(0))))
            .when(failures).deleteByUsername(anyString());
        KnownSignInAddressRepository knownAddresses = mock(KnownSignInAddressRepository.class);
        when(knownAddresses.existsById(any())).thenAnswer(call -> known.contains(call.<SignInSource>getArgument(0)));
        when(knownAddresses.save(any())).thenAnswer(call -> {
            known.add((SignInSource) ReflectionTestUtils.getField((Object) call.getArgument(0), "source"));
            return call.getArgument(0);
        });
        return new LoginThrottle(failures, knownAddresses, new TransactionTemplate(mock(PlatformTransactionManager.class)), clock);
    }

    // Moved forward by hand, to step through the waits the throttle sets.
    private Instant now = Instant.parse("2026-10-15T12:00:00Z");
    private final Clock clock = new Clock() {
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    };

    private void failLogin(String username) {
        failLogin(username, ELSEWHERE);
    }

    private void failLogin(String username, String address) {
        assertThatThrownBy(() -> authService.login(new LoginRequest(username, "WrongPass1!"), address))
            .isInstanceOf(InvalidCredentialsException.class);
    }

    // Guesses from anywhere slow down on the account itself after five misses, waiting longer with each,
    // and the same for a made-up username so the wait never says whether an account exists.
    @Test
    void repeatedFailedSignInsWaitLongerEachTimeAndTheRightPasswordClearsThem() {
        String hash = new BCryptPasswordEncoder().encode("Str0ng!Pass");
        when(users.findByUsername("ivy")).thenReturn(Optional.of(new User("ivy", hash)));
        when(jwtService.issue(any(User.class))).thenReturn("signed.jwt.token");
        for (String username : new String[] {"ivy", "nobody"}) {
            for (int i = 0; i < LoginThrottle.FREE_FAILURES; i++) failLogin(username);

            assertThatThrownBy(() -> authService.login(new LoginRequest(username, "Str0ng!Pass"), ELSEWHERE))
                .as("even the right password waits, or the wait would confirm a guess")
                .isInstanceOf(TooManyLoginAttemptsException.class)
                .hasMessageContaining("30 seconds");
        }

        now = now.plusSeconds(30);
        failLogin("ivy");
        assertThatThrownBy(() -> authService.login(new LoginRequest("ivy", "Str0ng!Pass"), ELSEWHERE))
            .isInstanceOf(TooManyLoginAttemptsException.class)
            .hasMessageContaining("1 minute");

        now = now.plusSeconds(60);
        assertThat(authService.login(new LoginRequest("Ivy", "Str0ng!Pass"), ELSEWHERE).token()).isEqualTo("signed.jwt.token");
        failLogin("ivy");
        assertThat(authService.login(new LoginRequest("ivy", "Str0ng!Pass"), ELSEWHERE).token())
            .as("a success starts the count over").isEqualTo("signed.jwt.token");
    }

    // A guesser elsewhere, however many times they miss, never makes the owner wait where they sign in from;
    // a new address still shares the count everyone else uses, so spreading guesses wide doesn't help.
    @Test
    void aGuesserElsewhereNeverKeepsTheOwnerWaitingAtAnAddressTheyveSignedInFrom() {
        String hash = new BCryptPasswordEncoder().encode("Str0ng!Pass");
        when(users.findByUsername("ivy")).thenReturn(Optional.of(new User("ivy", hash)));
        when(jwtService.issue(any(User.class))).thenReturn("signed.jwt.token");
        authService.login(new LoginRequest("ivy", "Str0ng!Pass"), HOME);

        for (int i = 0; i < LoginThrottle.FREE_FAILURES * 3; i++) {
            try {
                authService.login(new LoginRequest("ivy", "WrongPass1!"), "192.0.2." + i);
            } catch (InvalidCredentialsException | TooManyLoginAttemptsException expected) {
                // Either, depending how far into the shared count this guess is.
            }
        }

        assertThat(authService.login(new LoginRequest("ivy", "Str0ng!Pass"), HOME).token()).isEqualTo("signed.jwt.token");
        assertThatThrownBy(() -> authService.login(new LoginRequest("ivy", "Str0ng!Pass"), "192.0.2.200"))
            .isInstanceOf(TooManyLoginAttemptsException.class);
    }

    @Test
    void theWaitDoublesUpToFifteenMinutesAndAnOldRunIsForgotten() {
        assertThat(LoginThrottle.waitAfter(5)).hasSeconds(30);
        assertThat(LoginThrottle.waitAfter(7)).hasSeconds(120);
        assertThat(LoginThrottle.waitAfter(50)).isEqualTo(LoginThrottle.MAX_WAIT);

        for (int i = 0; i < LoginThrottle.FREE_FAILURES; i++) failLogin("nobody");
        now = now.plus(LoginThrottle.FORGET_AFTER).plusSeconds(1);
        failLogin("nobody");
    }

    private static RegisterRequest request(String username, String password) {
        return new RegisterRequest("Pat Lee", "pat@example.com", username, password);
    }

    @Test
    void registrationClosesOnceTheFirstAccountExistsUnlessOpenedInSettings() {
        when(users.count()).thenReturn(1L);

        assertThat(authService.canRegister()).isFalse();
        assertThatThrownBy(() -> authService.register(request("second", "Str0ng!Pass")))
            .isInstanceOf(RegistrationClosedException.class);
        verify(users, never()).save(any());

        assertThat(new AuthService(users, jwtService, new BCryptPasswordEncoder(), true, seasons, throttle())
            .canRegister()).isTrue();
    }

    @Test
    void registerKeepsTheNameAndEmail() {
        when(users.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        authService.register(new RegisterRequest(" Pat Lee ", " pat@example.com ", "pat", "Str0ng!Pass"));

        var captor = org.mockito.ArgumentCaptor.forClass(User.class);
        verify(users).save(captor.capture());
        assertThat(captor.getValue().getName()).isEqualTo("Pat Lee");
        assertThat(captor.getValue().getEmail()).isEqualTo("pat@example.com");
    }

    @Test
    void registerThrowsWhenUsernameAlreadyTaken() {
        when(users.existsByUsername("alice")).thenReturn(true);

        assertThatThrownBy(() -> authService.register(request("alice", "Str0ng!Pass")))
            .isInstanceOf(UsernameTakenException.class);

        verify(users, never()).save(any());
    }

    @Test
    void registerThrowsWhenPasswordFailsPolicy() {
        when(users.existsByUsername("bob")).thenReturn(false);

        assertThatThrownBy(() -> authService.register(request("bob", "weak")))
            .isInstanceOf(InvalidPasswordException.class);

        verify(users, never()).save(any());
    }

    @Test
    void registerSavesHashedPasswordAndReturnsToken() {
        when(users.existsByUsername("carol")).thenReturn(false);
        when(users.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jwtService.issue(any(User.class))).thenReturn("signed.jwt.token");

        var response = authService.register(request("carol", "Str0ng!Pass"));

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

        assertThatThrownBy(() -> authService.login(new LoginRequest("nobody", "whatever"), HOME))
            .isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void loginThrowsWhenPasswordDoesNotMatch() {
        String hash = new BCryptPasswordEncoder().encode("Str0ng!Pass");
        when(users.findByUsername("dave")).thenReturn(Optional.of(new User("dave", hash)));

        assertThatThrownBy(() -> authService.login(new LoginRequest("dave", "WrongPass1!"), HOME))
            .isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void loginReturnsTokenOnCorrectPassword() {
        String hash = new BCryptPasswordEncoder().encode("Str0ng!Pass");
        when(users.findByUsername("erin")).thenReturn(Optional.of(new User("erin", hash)));
        when(jwtService.issue(any(User.class))).thenReturn("signed.jwt.token");

        var response = authService.login(new LoginRequest("erin", "Str0ng!Pass"), HOME);

        assertThat(response.username()).isEqualTo("erin");
        assertThat(response.token()).isEqualTo("signed.jwt.token");
    }

    @Test
    void registerNormalizesUsernameToLowercase() {
        when(users.existsByUsername("frank")).thenReturn(false);
        when(users.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jwtService.issue(any(User.class))).thenReturn("signed.jwt.token");

        var response = authService.register(request("FRANK", "Str0ng!Pass"));

        assertThat(response.username()).isEqualTo("frank");
        verify(users).existsByUsername("frank");
    }

    @Test
    void loginIsCaseInsensitiveOnUsername() {
        String hash = new BCryptPasswordEncoder().encode("Str0ng!Pass");
        when(users.findByUsername("grace")).thenReturn(Optional.of(new User("grace", hash)));
        when(jwtService.issue(any(User.class))).thenReturn("signed.jwt.token");

        var response = authService.login(new LoginRequest("Grace", "Str0ng!Pass"), HOME);

        assertThat(response.username()).isEqualTo("grace");
        verify(users).findByUsername("grace");
    }

    @Test
    void registerRejectsUsernameThatIsTooShort() {
        assertThatThrownBy(() -> authService.register(request("ab", "Str0ng!Pass")))
            .isInstanceOf(InvalidUsernameException.class);

        verify(users, never()).save(any());
    }

    @Test
    void registerRejectsUsernameWithDisallowedCharacters() {
        assertThatThrownBy(() -> authService.register(request("henry!", "Str0ng!Pass")))
            .isInstanceOf(InvalidUsernameException.class);

        verify(users, never()).save(any());
    }

    @Test
    void registerRejectsUsernameStartingWithPunctuation() {
        assertThatThrownBy(() -> authService.register(request("-henry", "Str0ng!Pass")))
            .isInstanceOf(InvalidUsernameException.class);

        verify(users, never()).save(any());
    }

    @Test
    void registerAllowsDotsUnderscoresAndHyphensInTheMiddle() {
        when(users.existsByUsername("henry.k_smith-jr")).thenReturn(false);
        when(users.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jwtService.issue(any(User.class))).thenReturn("signed.jwt.token");

        var response = authService.register(request("henry.k_smith-jr", "Str0ng!Pass"));

        assertThat(response.username()).isEqualTo("henry.k_smith-jr");
    }
}
