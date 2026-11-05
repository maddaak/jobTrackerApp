package com.jobtracker.core.service;

import com.jobtracker.core.dto.UpdateAccountRequest;
import com.jobtracker.core.exception.InvalidPasswordException;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class AccountServiceTests {

    private final UserRepository users = mock(UserRepository.class);
    private final JavaMailSender sender = mock(JavaMailSender.class);
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final AccountService accounts = new AccountService(users, encoder, mock(JwtService.class),
            new ReminderMailer(sender, "tracker@example.com"));
    private User pat;

    @BeforeEach
    void anAccount() {
        pat = new User("pat", encoder.encode("Old!Passw0rd"), "Pat", "pat@example.com");
        when(users.findById(7L)).thenReturn(Optional.of(pat));
        when(users.save(any(User.class))).thenAnswer(call -> call.getArgument(0));
    }

    // Reset links go to the email, so a stolen session that could move it could take the account.
    @Test
    void movingTheEmailTakesThePasswordAndTellsTheOldAddress() {
        for (String password : new String[] {null, "Wrong!Passw0rd"}) {
            assertThatThrownBy(() -> accounts.update(7L, new UpdateAccountRequest("Pat", "thief@example.com", password)))
                .isInstanceOf(InvalidPasswordException.class);
        }
        assertThat(pat.getEmail()).isEqualTo("pat@example.com");
        verifyNoInteractions(sender);

        accounts.update(7L, new UpdateAccountRequest("Pat", "new@example.com", "Old!Passw0rd"));

        assertThat(pat.getEmail()).isEqualTo("new@example.com");
        ArgumentCaptor<SimpleMailMessage> notice = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(notice.capture());
        assertThat(notice.getValue().getTo()).containsExactly("pat@example.com");
        assertThat(notice.getValue().getText()).contains("new@example.com");
    }

    @Test
    void aNameChangeAloneNeedsNoPassword() {
        accounts.update(7L, new UpdateAccountRequest("Pat Lee", "PAT@example.com", null));

        assertThat(pat.getName()).isEqualTo("Pat Lee");
        verifyNoInteractions(sender);
    }

    // An account from before emails were asked for adds one the same way, since resets would then go there.
    @Test
    void addingAFirstEmailTakesThePasswordToo() {
        pat.updateProfile("Pat", null);

        assertThatThrownBy(() -> accounts.update(7L, new UpdateAccountRequest("Pat", "pat@example.com", null)))
            .isInstanceOf(InvalidPasswordException.class);
        accounts.update(7L, new UpdateAccountRequest("Pat", "pat@example.com", "Old!Passw0rd"));
        verifyNoInteractions(sender);
    }
}
