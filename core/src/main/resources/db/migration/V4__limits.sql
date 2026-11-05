-- The sign-in backoff and the AI day count, kept here so a restart doesn't reset them.

-- One row per username with recent failed sign-ins, existing or not; cleared on success, dropped after an hour.
CREATE TABLE login_failures (
    username VARCHAR(255) PRIMARY KEY,
    failures INT NOT NULL,
    last_failed_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- AI calls per UTC day, across the app: every account spends the same key. Not "day", which H2 reserves.
CREATE TABLE ai_usage (
    usage_day DATE PRIMARY KEY,
    calls INT NOT NULL
);
