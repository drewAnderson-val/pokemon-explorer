-- Friend matches. The row is the whole match: seats are users, the battle is the
-- engine's state as-is, and every write locks the row first (SELECT … FOR UPDATE).
CREATE TABLE matches (
    -- 8 characters from an alphabet without look-alikes (no i, l, o, 0, 1): it's
    -- read aloud and typed from an invite link.
    id text PRIMARY KEY CHECK (id ~ '^[a-hjkmnp-z2-9]{8}$'),
    host_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
    guest_id uuid REFERENCES users ON DELETE CASCADE CHECK (guest_id <> host_id),
    host_team integer[],
    guest_team integer[],
    -- This turn's chosen action, until both are in.
    host_pending jsonb,
    guest_pending jsonb,
    state jsonb,
    -- The last turn's events, written from the host's side.
    events jsonb NOT NULL DEFAULT '[]',
    turn integer NOT NULL DEFAULT 0,
    outcome jsonb,
    -- Presence: a seat is away once its last stream has been gone 5 s, and leaves
    -- (forfeits) after 60 s. NULL left_at with a stream open; NULL seen_at, never.
    host_away boolean NOT NULL DEFAULT true,
    guest_away boolean NOT NULL DEFAULT true,
    host_left_at timestamptz,
    guest_left_at timestamptz,
    host_seen_at timestamptz,
    guest_seen_at timestamptz,
    -- The seat's current stream. A newer stream (a reload, another tab, on any
    -- instance) replaces it; the older one sees it's no longer current and closes.
    host_stream text,
    guest_stream text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz
);

-- The per-user limit counts this user's matches from the last hour.
CREATE INDEX matches_host_created ON matches (host_id, created_at);

-- Idempotency: a retried action (same key) gets the first answer instead of being
-- applied twice. request_hash tells a true retry from a different action reusing a key.
CREATE TABLE match_actions (
    match_id text NOT NULL REFERENCES matches ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
    idempotency_key text NOT NULL,
    request_hash text NOT NULL,
    status integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (match_id, user_id, idempotency_key)
);
