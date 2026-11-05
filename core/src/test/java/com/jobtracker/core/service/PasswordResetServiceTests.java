package com.jobtracker.core.service;

import com.jobtracker.core.exception.InvalidResetTokenException;
import com.jobtracker.core.model.PasswordResetToken;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.PasswordResetTokenRepository;
import com.jobtracker.core.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class PasswordResetServiceTests {

    private static final Instant NOW = Instant.parse("2026-10-11T12:00:00Z");

    private final UserRepository users = mock(UserRepository.class);
    private final PasswordResetTokenRepository tokens = mock(PasswordResetTokenRepository.class);
    private final JavaMailSender sender = mock(JavaMailSender.class);
    private final LoginThrottle throttle = mock(LoginThrottle.class);
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final Map<String, PasswordResetToken> stored = new HashMap<>();
    private User pat;

    private PasswordResetService service(Instant now, boolean emailConfigured) {
        ReminderMailer mailer = emailConfigured ? new ReminderMailer(sender, "tracker@example.com")
                : new ReminderMailer("", 587, "", "", "");
        return new PasswordResetService(users, tokens, new AccountService(users, encoder, mock(JwtService.class), mailer), mailer,
                throttle, Clock.fixed(now, ZoneOffset.UTC), "https://tracker.example");
    }

    @BeforeEach
    void anAccountWithAnAddress() {
        pat = new User("pat", encoder.encode("Old!Passw0rd"), "Pat", "pat@example.com");
        ReflectionTestUtils.setField(pat, "id", 7L);
        when(users.findByUsername("pat")).thenReturn(Optional.of(pat));
        when(users.findById(7L)).thenReturn(Optional.of(pat));
        when(tokens.save(any())).thenAnswer(call -> {
            PasswordResetToken token = call.getArgument(0);
            stored.put((String) ReflectionTestUtils.getField(token, "tokenHash"), token);
            return token;
        });
        when(tokens.findByTokenHash(anyString())).thenAnswer(call -> Optional.ofNullable(stored.get(call.<String>getArgument(0))));
        doAnswer(call -> stored.values().removeIf(token -> token.getUserId().equals(call.getArgument(0))))
            .when(tokens).deleteByUserId(any());
    }

    private String emailedToken() {
        ArgumentCaptor<SimpleMailMessage> sent = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender, atLeastOnce()).send(sent.capture());
        assertThat(sent.getValue().getTo()).containsExactly("pat@example.com");
        String body = sent.getValue().getText();
        assertThat(body).contains("https://tracker.example/reset-password?token=");
        return body.substring(body.indexOf("token=") + 6).split("\\s")[0];
    }

    // The owner locked out by a guesser gets straight back in, and no other link they asked for still works.
    @Test
    void aResetClearsTheSignInWaitAndEndsEveryOtherLink() {
        service(NOW, true).emailResetLink("pat");
        String earlier = emailedToken();
        service(NOW, true).emailResetLink("pat");
        String later = emailedToken();

        service(NOW, true).resetWithToken(later, "N3w!Password");

        verify(throttle).clear("pat");
        assertThatThrownBy(() -> service(NOW, true).resetWithToken(earlier, "An0ther!Pass"))
            .isInstanceOf(InvalidResetTokenException.class);

        service(NOW, true).emailResetLink("pat");
        String unused = emailedToken();
        assertThat(service(NOW, true).temporaryPassword("pat")).isPresent();
        verify(throttle, times(2)).clear("pat");
        assertThatThrownBy(() -> service(NOW, true).resetWithToken(unused, "An0ther!Pass"))
            .isInstanceOf(InvalidResetTokenException.class);
    }

    @Test
    void anEmailedLinkSetsANewPasswordOnceAndOnlyOnce() {
        service(NOW, true).emailResetLink("Pat");
        String token = emailedToken();
        // Only the hash is kept, so the stored value can't be used as a link.
        assertThat(stored).doesNotContainKey(token);

        service(NOW.plus(Duration.ofMinutes(30)), true).resetWithToken(token, "N3w!Password");

        assertThat(encoder.matches("N3w!Password", pat.getPasswordHash())).isTrue();
        assertThat(pat.getSessionVersion()).as("a reset signs out every session, a stolen one included").isEqualTo(1);
        assertThatThrownBy(() -> service(NOW.plus(Duration.ofMinutes(31)), true).resetWithToken(token, "An0ther!Pass"))
            .isInstanceOf(InvalidResetTokenException.class);
    }

    @Test
    void aLinkExpiresAfterAnHourAndStillAppliesThePasswordPolicy() {
        service(NOW, true).emailResetLink("pat");
        String token = emailedToken();

        assertThatThrownBy(() -> service(NOW, true).resetWithToken(token, "weak"))
            .hasMessageContaining("at least 8");
        assertThatThrownBy(() -> service(NOW.plus(PasswordResetService.LINK_LIFETIME), true).resetWithToken(token, "N3w!Password"))
            .isInstanceOf(InvalidResetTokenException.class);
        assertThatThrownBy(() -> service(NOW, true).resetWithToken("made-up", "N3w!Password"))
            .isInstanceOf(InvalidResetTokenException.class);
    }

    // A real account's link waits on the mail server; answering only after it would time which usernames exist.
    @Test
    void asksForALinkWithoutWaitingForTheMailServer() throws Exception {
        CountDownLatch mailServer = new CountDownLatch(1);
        CountDownLatch sent = new CountDownLatch(1);
        doAnswer(call -> {
            mailServer.await();
            sent.countDown();
            return null;
        }).when(sender).send(any(SimpleMailMessage.class));

        service(NOW, true).requestResetLink("pat");

        assertThat(sent.getCount()).as("answered while the mail server was still busy").isEqualTo(1);
        mailServer.countDown();
        assertThat(sent.await(5, TimeUnit.SECONDS)).as("and the link still went out").isTrue();
    }

    @Test
    void sendsNothingWithoutEmailSetUpAnAddressOrAnAccount() {
        service(NOW, false).emailResetLink("pat");
        service(NOW, true).emailResetLink("nobody");
        pat.updateProfile("Pat", null);
        service(NOW, true).emailResetLink("pat");

        verifyNoInteractions(sender);
        verify(tokens, never()).save(any());
    }

    @Test
    void everyTemporaryPasswordMeetsThePolicy() {
        for (int i = 0; i < 200; i++) {
            assertThat(PasswordPolicy.violation(PasswordResetService.generateTemporaryPassword())).isEmpty();
        }
    }
}
