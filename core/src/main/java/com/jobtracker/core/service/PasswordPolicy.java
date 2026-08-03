package com.jobtracker.core.service;

import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.regex.Pattern;

class PasswordPolicy {

    private static final Pattern UPPERCASE = Pattern.compile("[A-Z]");
    private static final Pattern LOWERCASE = Pattern.compile("[a-z]");
    private static final Pattern DIGIT = Pattern.compile("[0-9]");
    private static final Pattern SYMBOL = Pattern.compile("[^A-Za-z0-9]");

    private PasswordPolicy() {
    }

    static Optional<String> violation(String password) {
        if (password.length() < 8) {
            return Optional.of("password must be at least 8 characters");
        }
        // BCrypt silently truncates past 72 bytes, making longer passwords collide at login.
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            return Optional.of("password must be at most 72 characters");
        }
        if (!UPPERCASE.matcher(password).find()) {
            return Optional.of("password must contain an uppercase letter");
        }
        if (!LOWERCASE.matcher(password).find()) {
            return Optional.of("password must contain a lowercase letter");
        }
        if (!DIGIT.matcher(password).find()) {
            return Optional.of("password must contain a digit");
        }
        if (!SYMBOL.matcher(password).find()) {
            return Optional.of("password must contain a symbol");
        }
        return Optional.empty();
    }
}
