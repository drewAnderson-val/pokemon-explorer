-- Play as guest: throwaway accounts, deleted (with everything they own, by the
-- existing cascades) a day after they're made.
ALTER TABLE users ADD COLUMN is_guest boolean NOT NULL DEFAULT false;
CREATE INDEX users_guest_created ON users (created_at) WHERE is_guest;
