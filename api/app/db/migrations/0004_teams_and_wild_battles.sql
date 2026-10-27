-- A user's team. Levels, XP and HP are written only by battles on the server;
-- the team routes let the client choose members and their order, nothing else.
CREATE TABLE team_members (
    user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
    uid text NOT NULL,
    slot integer NOT NULL CHECK (slot BETWEEN 0 AND 5),
    pokemon_id integer NOT NULL REFERENCES pokemon,
    level integer NOT NULL CHECK (level BETWEEN 1 AND 100),
    xp integer NOT NULL CHECK (xp >= 0),
    -- NULL means full HP, as in the client's saved team.
    hp integer CHECK (hp >= 0),
    PRIMARY KEY (user_id, uid),
    -- Checked at commit, so a reorder can pass through two members on one slot.
    UNIQUE (user_id, slot) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE (user_id, pokemon_id)
);

-- At most one wild battle per user: the engine's state as-is, plus the turn number
-- the next action must name (a stale or repeated action names an old one).
CREATE TABLE wild_battles (
    user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
    state jsonb NOT NULL,
    turn integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
