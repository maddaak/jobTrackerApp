package com.jobtracker.core.config;

// .env.example's placeholders all start with this. They are public on GitHub, so one left in place
// is a key anyone can read, however long it is.
public final class PlaceholderSecrets {

    private static final String PREFIX = "change_me";

    private PlaceholderSecrets() {
    }

    public static void refuse(String name, String value) {
        if (value != null && value.startsWith(PREFIX)) {
            throw new IllegalStateException(
                    name + " is still the .env.example placeholder; set a real value (openssl rand -hex 32)");
        }
    }
}
