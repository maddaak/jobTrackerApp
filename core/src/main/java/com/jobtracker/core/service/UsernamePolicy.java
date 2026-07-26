package com.jobtracker.core.service;

import java.util.Optional;
import java.util.regex.Pattern;

class UsernamePolicy {

    // 3-30 chars; letters/digits/. _ -; must start and end with a letter or digit.
    private static final Pattern VALID = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._-]{1,28}[A-Za-z0-9]$");

    private UsernamePolicy() {
    }

    static Optional<String> violation(String username) {
        if (!VALID.matcher(username).matches()) {
            return Optional.of(
                    "username must be 3-30 characters, start and end with a letter or digit, "
                            + "and contain only letters, digits, '.', '_', or '-'");
        }
        return Optional.empty();
    }
}
