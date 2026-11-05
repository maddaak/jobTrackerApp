package com.jobtracker.core.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Service;
import java.util.Properties;

// Built here rather than by Spring's auto-configuration, so blank SMTP settings mean "off" exactly, and a
// server with no login isn't sent an empty one.
@Service
public class ReminderMailer {

    private static final String TIMEOUT_MS = "10000";

    private final JavaMailSender sender;
    private final String from;

    @Autowired
    public ReminderMailer(
            @Value("${app.mail.host:}") String host,
            @Value("${app.mail.port:587}") int port,
            @Value("${app.mail.username:}") String username,
            @Value("${app.mail.password:}") String password,
            @Value("${app.mail.from:}") String from) {
        this.from = from;
        if (host.isBlank() || from.isBlank()) {
            this.sender = null;
            return;
        }
        JavaMailSenderImpl impl = new JavaMailSenderImpl();
        impl.setHost(host);
        impl.setPort(port);
        Properties props = impl.getJavaMailProperties();
        if (!username.isBlank()) {
            impl.setUsername(username);
            impl.setPassword(password);
            props.put("mail.smtp.auth", "true");
        }
        // 465 is TLS from the first byte; the usual 587 upgrades to TLS once connected.
        props.put(port == 465 ? "mail.smtp.ssl.enable" : "mail.smtp.starttls.enable", "true");
        // So a mail server that never answers can't hold up the next pass.
        props.put("mail.smtp.connectiontimeout", TIMEOUT_MS);
        props.put("mail.smtp.timeout", TIMEOUT_MS);
        props.put("mail.smtp.writetimeout", TIMEOUT_MS);
        this.sender = impl;
    }

    // Package-private: tests hand in a sender rather than reach a mail server.
    ReminderMailer(JavaMailSender sender, String from) {
        this.sender = sender;
        this.from = from;
    }

    public boolean configured() {
        return sender != null;
    }

    public void send(String to, String subject, String body) {
        if (sender == null) {
            throw new IllegalStateException("email is not set up on this server");
        }
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(to);
        // Subjects carry company and contact names; a line break in one would start a new mail header.
        message.setSubject(subject.replaceAll("[\\r\\n]+", " "));
        message.setText(body);
        sender.send(message);
    }
}
