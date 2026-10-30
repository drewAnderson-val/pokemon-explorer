-- The catalog's images move from loremflickr.com and picsum.photos (slow, up to
-- ~4000 px, sometimes down) to resized copies in the creature bucket, made by
-- scripts/copy_catalog_images.py before this runs. Custom creatures keep theirs.
UPDATE pokemon
SET image_url = 'https://storage.googleapis.com/finny-take-home-creature-images/catalog/' || id || '.webp'
WHERE owner_id IS NULL;
