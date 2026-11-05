package com.jobtracker.core.service;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class ReminderMailerTests {

    // Subjects carry company and contact names someone typed; a line break would start a header of their choosing.
    @Test
    void aLineBreakInASubjectCantStartANewHeader() {
        JavaMailSender sender = mock(JavaMailSender.class);

        new ReminderMailer(sender, "tracker@example.com").send("pat@example.com", "Acme\r\nBcc: someone@example.com", "Body");

        ArgumentCaptor<SimpleMailMessage> sent = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(sent.capture());
        assertThat(sent.getValue().getSubject()).isEqualTo("Acme Bcc: someone@example.com");
    }
}
