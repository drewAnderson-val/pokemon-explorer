-- Creature Lab creatures live beside the catalog: owner_id NULL is one of the
-- 1,000 catalog records, anything else belongs to the user who made it.
ALTER TABLE pokemon
    ADD COLUMN owner_id uuid REFERENCES users ON DELETE CASCADE,
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX pokemon_owner ON pokemon (owner_id, id DESC) WHERE owner_id IS NOT NULL;

-- Custom ids carry on from the catalog's 1…1000, as the browser numbered them.
-- A sequence never hands out an id twice, even after a delete.
CREATE SEQUENCE pokemon_custom_id_seq START 1001;

-- Deleting a creature takes it off its owner's team.
ALTER TABLE team_members
    DROP CONSTRAINT team_members_pokemon_id_fkey,
    ADD CONSTRAINT team_members_pokemon_id_fkey
        FOREIGN KEY (pokemon_id) REFERENCES pokemon ON DELETE CASCADE;

-- One row per lab request (successful or not: every image costs money), for
-- the hourly per-user and daily overall limits.
CREATE TABLE lab_requests (
    user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lab_requests_user ON lab_requests (user_id, created_at);
CREATE INDEX lab_requests_created ON lab_requests (created_at);
