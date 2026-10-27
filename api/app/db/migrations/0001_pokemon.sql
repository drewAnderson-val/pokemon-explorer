-- The shared catalog: 1,000 records loaded from src/data/pokemon.json by 0002.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE pokemon (
    id integer PRIMARY KEY,
    -- Not unique: names repeat in the data (835 unique of 1,000).
    name text NOT NULL,
    types text[] NOT NULL,
    height double precision NOT NULL,
    weight double precision NOT NULL,
    hp integer NOT NULL,
    attack integer NOT NULL,
    defense integer NOT NULL,
    special_attack integer NOT NULL,
    special_defense integer NOT NULL,
    speed integer NOT NULL,
    description text NOT NULL,
    image_url text NOT NULL,
    generation integer NOT NULL,
    -- Only some records have it in the source data; NULL keeps "absent" distinct.
    is_legendary boolean,
    -- Stored so sort=total can use an index instead of computing it per row.
    total_stats integer GENERATED ALWAYS AS (
        hp + attack + defense + special_attack + special_defense + speed
    ) STORED
);

-- Search is a substring match ('%fire%'). A leading wildcard can't use a normal
-- (B-tree) index; a trigram index can.
CREATE INDEX pokemon_name_trgm ON pokemon USING gin (lower(name) gin_trgm_ops);
CREATE INDEX pokemon_description_trgm ON pokemon USING gin (lower(description) gin_trgm_ops);
-- type filter: 'Fire' = ANY(types)
CREATE INDEX pokemon_types ON pokemon USING gin (types);
-- Sorts, with id as the tie-breaker so pages never overlap.
CREATE INDEX pokemon_total_stats ON pokemon (total_stats DESC, id);
CREATE INDEX pokemon_speed ON pokemon (speed DESC, id);
