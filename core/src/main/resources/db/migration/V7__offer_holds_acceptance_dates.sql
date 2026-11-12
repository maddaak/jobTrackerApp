-- The accepted and start days moved onto the offer, where the Offers page sets them, so a season keeps only
-- which offer was taken. Never released with these columns filled, so nothing is carried over.
ALTER TABLE seasons DROP COLUMN accepted_on;
ALTER TABLE seasons DROP COLUMN starts_on;
