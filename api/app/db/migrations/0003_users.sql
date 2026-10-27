CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username text NOT NULL,
    -- argon2id output (algorithm, parameters, salt and hash in one string). Never the password.
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique ignoring case, so "Drew" and "drew" can't be two different accounts.
-- Login looks users up through the same lower(username).
CREATE UNIQUE INDEX users_username_lower ON users (lower(username));
