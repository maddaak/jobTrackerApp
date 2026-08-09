package com.jobtracker.core.service;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;

@Service
public class JwtService {

    // Keys.hmacShaKeyFor only enforces 32, so a 32-63 byte secret boots clean then 500s every login.
    private static final int MIN_SECRET_BYTES = 64;

    private final SecretKey key;
    private final Duration expiry;

    public JwtService(
            @Value("${app.jwt-secret}") String secret,
            @Value("${app.jwt-expiry-days}") long expiryDays) {
        byte[] secretBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (secretBytes.length < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                    "app.jwt-secret must be at least " + MIN_SECRET_BYTES + " bytes for HS512, got "
                            + secretBytes.length);
        }
        this.key = Keys.hmacShaKeyFor(secretBytes);
        this.expiry = Duration.ofDays(expiryDays);
    }

    public String issue(Long userId, String username) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(userId.toString())
                .claim("username", username)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(expiry)))
                .signWith(key, Jwts.SIG.HS512)
                .compact();
    }
}
