-- Failed sign-ins count per address an account has signed in from before, so a guesser elsewhere can't keep
-- the owner waiting there; every other address shares one count per account (address ''). The old rows are
-- only waits in progress, so they go.
DROP TABLE login_failures;
CREATE TABLE login_failures (
    username VARCHAR(255) NOT NULL,
    address VARCHAR(64) NOT NULL,
    failures INT NOT NULL,
    last_failed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (username, address)
);

CREATE TABLE known_sign_in_addresses (
    username VARCHAR(255) NOT NULL,
    address VARCHAR(64) NOT NULL,
    PRIMARY KEY (username, address)
);
