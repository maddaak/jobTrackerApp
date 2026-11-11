package com.jobtracker.core;

import org.junit.jupiter.api.Test;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.assertThat;

// Anything that decides by the time takes the Clock bean, so a test can pin "now". Only an entity's own
// creation stamp reads the system clock, since nothing decides by it.
class InjectedClockTests {

    private static final Pattern SYSTEM_CLOCK =
            Pattern.compile("\\b(Instant|LocalDate|LocalDateTime|ZonedDateTime|OffsetDateTime)\\.now\\(\\)|System\\.currentTimeMillis\\(\\)");

    @Test
    void onlyEntitiesReadTheSystemClock() throws IOException {
        Path main = Path.of("src/main/java/com/jobtracker/core");
        try (Stream<Path> files = Files.walk(main)) {
            List<String> readers = files
                    .filter(file -> file.toString().endsWith(".java"))
                    .filter(file -> !file.startsWith(main.resolve("model")))
                    .filter(file -> SYSTEM_CLOCK.matcher(read(file)).find())
                    .map(file -> main.relativize(file).toString())
                    .toList();

            assertThat(readers).as("classes reading the system clock instead of the Clock bean").isEmpty();
        }
    }

    private static String read(Path file) {
        try {
            return Files.readString(file);
        } catch (IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
    }
}
