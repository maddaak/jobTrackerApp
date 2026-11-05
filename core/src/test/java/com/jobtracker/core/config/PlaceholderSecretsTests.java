package com.jobtracker.core.config;

import com.jobtracker.core.security.InternalTokenFilter;
import com.jobtracker.core.service.JwtService;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PlaceholderSecretsTests {

    // Read from the real template, so a new placeholder that dodges the prefix fails here, not in production.
    private String placeholder(String key) throws Exception {
        List<String> lines = Files.readAllLines(Path.of("..", ".env.example"));
        return lines.stream()
                .filter(line -> line.startsWith(key + "="))
                .map(line -> line.substring(key.length() + 1))
                .findFirst()
                .orElseThrow();
    }

    @Test
    void theShippedJwtPlaceholderIsRefusedEvenThoughItIsLongEnough() throws Exception {
        String shipped = placeholder("JWT_SECRET");
        assertThat(shipped.getBytes().length).isGreaterThanOrEqualTo(64);

        assertThatThrownBy(() -> new JwtService(shipped, 7, Clock.systemUTC())).hasMessageContaining("JWT_SECRET is still the .env.example placeholder");
    }

    @Test
    void theShippedInternalTokenPlaceholderIsRefused() throws Exception {
        String shipped = placeholder("INTERNAL_TOKEN");

        assertThatThrownBy(() -> new InternalTokenFilter(shipped)).hasMessageContaining("INTERNAL_TOKEN is still the .env.example placeholder");
    }

    @Test
    void aRealSecretIsAccepted() {
        assertThatCode(() -> new JwtService("a".repeat(64), 7, Clock.systemUTC())).doesNotThrowAnyException();
    }
}
