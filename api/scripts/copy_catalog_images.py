"""Copies the 1,000 catalog images into the creature bucket, resized.

The catalog's original images are placeholders on loremflickr.com and picsum.photos:
slow, up to ~4000 px, and sometimes down. This copies each one once, as
`catalog/<id>.webp` no larger than 640 px, and migration 0007 points the catalog at
the copies. The original URLs come from the seed migration, which never changes.

Owner-run, from api/, with application-default credentials:

    uv run python -m scripts.copy_catalog_images --dry-run /tmp/catalog --limit 5
    uv run python -m scripts.copy_catalog_images             # uploads what's missing
    uv run python -m scripts.copy_catalog_images --verify    # counts what's there

Re-running is safe: images already in the bucket are skipped.
"""

import argparse
import io
import re
import sys
import time
import urllib.request
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from PIL import Image

from app.db.migrate import MIGRATIONS_DIR

BUCKET = "finny-take-home-creature-images"
PREFIX = "catalog/"
MAX_SIDE = 640
QUALITY = 80
ATTEMPTS = 3
# Seconds to wait before the second and third attempts.
DELAYS = (1.0, 3.0)
CACHE_CONTROL = "public, max-age=31536000, immutable"

# loremflickr URLs are /<width>/<height>?lock=<n>. loremflickr answers images with
# HTTP 500, so since the Express app the cards have shown a picsum image seeded by
# the lock instead (docs/decisions.md). That's the stand-in, so each card keeps the
# photo players already see. Once copied, the bucket keeps it.
LOREMFLICKR = re.compile(r"^https://loremflickr\.com/(\d+)/(\d+)(?:\?lock=(\d+))?")
# The cards also drop picsum's baked-in blur; so does the copy.
BLUR = re.compile(r"([?&])blur=\d+&?")

# One seed row per line: "(id, 'name', ..., 'https://...', generation, legendary),".
# The image URL is the last https literal on the line.
SEED_ROW = re.compile(r"^\((\d+),.*'(https://[^']+)'")


def catalog_url(pokemon_id: int) -> str:
    return f"https://storage.googleapis.com/{BUCKET}/{PREFIX}{pokemon_id}.webp"


def catalog_sources(seed_sql: str) -> dict[int, str]:
    sources: dict[int, str] = {}
    for line in seed_sql.splitlines():
        match = SEED_ROW.match(line)
        if match:
            sources[int(match[1])] = match[2]
    return sources


def stand_in_url(pokemon_id: int, url: str) -> str | None:
    match = LOREMFLICKR.match(url)
    if not match:
        return None
    seed = f"lock-{match[3]}" if match[3] else f"pokemon-{pokemon_id}"
    return f"https://picsum.photos/seed/{seed}/{match[1]}/{match[2]}"


def source_url(url: str) -> str:
    if not url.startswith("https://picsum.photos/"):
        return url
    return BLUR.sub(r"\1", url).rstrip("?&")


def resize_to_webp(data: bytes) -> bytes:
    """Fits the image inside MAX_SIDE x MAX_SIDE, keeping its shape and never
    enlarging it."""
    source = Image.open(io.BytesIO(data))
    image = source.convert("RGBA" if "A" in source.getbands() else "RGB")
    image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    image.save(out, "WEBP", quality=QUALITY)
    return out.getvalue()


class Store(Protocol):
    def existing(self) -> set[int]: ...

    def upload(self, pokemon_id: int, data: bytes) -> None: ...


@dataclass
class CopyReport:
    uploaded: list[int] = field(default_factory=list)
    skipped: list[int] = field(default_factory=list)
    failed: dict[int, str] = field(default_factory=dict)
    # Uploaded from a picsum stand-in because the original wouldn't download.
    stand_ins: list[int] = field(default_factory=list)


def copy_all(
    sources: dict[int, str],
    fetch: Callable[[str], bytes],
    store: Store,
    *,
    workers: int = 8,
    delays: Sequence[float] = DELAYS,
) -> CopyReport:
    """Copies every source not already in the store. A source that still fails
    after ATTEMPTS tries is replaced by its stand-in if it has one; otherwise it
    is reported, and the batch carries on."""
    report = CopyReport()
    done = store.existing()

    def copy_from(pokemon_id: int, url: str) -> str | None:
        """None when uploaded, else the last error."""
        error = ""
        for attempt in range(ATTEMPTS):
            if attempt:
                time.sleep(delays[attempt - 1])
            try:
                store.upload(pokemon_id, resize_to_webp(fetch(url)))
                return None
            except Exception as exc:  # any failure is worth a retry, then a report
                error = f"{type(exc).__name__}: {exc}"
        return error

    def copy_one(pokemon_id: int) -> tuple[int, str | None, bool]:
        error = copy_from(pokemon_id, source_url(sources[pokemon_id]))
        stand_in = stand_in_url(pokemon_id, sources[pokemon_id])
        if error is None or stand_in is None:
            return pokemon_id, error, False
        fallback_error = copy_from(pokemon_id, stand_in)
        if fallback_error is None:
            return pokemon_id, None, True
        return pokemon_id, f"{error}; stand-in: {fallback_error}", False

    todo = sorted(set(sources) - done)
    report.skipped = sorted(set(sources) & done)
    with ThreadPoolExecutor(workers) as pool:
        for pokemon_id, error, used_stand_in in pool.map(copy_one, todo):
            if error is None:
                report.uploaded.append(pokemon_id)
                if used_stand_in:
                    report.stand_ins.append(pokemon_id)
            else:
                report.failed[pokemon_id] = error
    return report


def fetch_url(url: str) -> bytes:
    # urllib follows redirects (loremflickr answers with one).
    request = urllib.request.Request(url, headers={"User-Agent": "pokemon-explorer-copy"})
    with urllib.request.urlopen(request, timeout=20) as response:
        data: bytes = response.read()
        return data


class BucketStore:
    def __init__(self) -> None:
        from google.cloud import storage

        self.client = storage.Client()
        self.bucket = self.client.bucket(BUCKET)

    def existing(self) -> set[int]:
        names = (blob.name for blob in self.client.list_blobs(BUCKET, prefix=PREFIX))
        return {int(name[len(PREFIX) : -len(".webp")]) for name in names if name.endswith(".webp")}

    def upload(self, pokemon_id: int, data: bytes) -> None:
        blob = self.bucket.blob(f"{PREFIX}{pokemon_id}.webp")
        blob.cache_control = CACHE_CONTROL
        blob.upload_from_string(data, content_type="image/webp")


class FolderStore:
    """--dry-run: writes the files locally instead."""

    def __init__(self, folder: Path) -> None:
        self.folder = folder
        folder.mkdir(parents=True, exist_ok=True)

    def existing(self) -> set[int]:
        return {int(path.stem) for path in self.folder.glob("*.webp")}

    def upload(self, pokemon_id: int, data: bytes) -> None:
        (self.folder / f"{pokemon_id}.webp").write_bytes(data)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--dry-run", type=Path, metavar="DIR", help="write files here instead")
    parser.add_argument("--limit", type=int, help="only the first N ids")
    parser.add_argument("--verify", action="store_true", help="count what's in the bucket")
    args = parser.parse_args(argv)

    sources = catalog_sources((MIGRATIONS_DIR / "0002_seed_pokemon.sql").read_text())
    if args.limit:
        sources = dict(sorted(sources.items())[: args.limit])

    store: Store = FolderStore(args.dry_run) if args.dry_run else BucketStore()
    if args.verify:
        missing = sorted(set(sources) - store.existing())
        print(f"{len(sources) - len(missing)}/{len(sources)} in place")
        if missing:
            print("missing:", " ".join(map(str, missing)))
        return 1 if missing else 0

    report = copy_all(sources, fetch_url, store)
    print(
        f"uploaded {len(report.uploaded)}, skipped {len(report.skipped)},"
        f" failed {len(report.failed)} (stand-ins used: {len(report.stand_ins)})"
    )
    for pokemon_id, error in sorted(report.failed.items()):
        print(f"  #{pokemon_id}: {error}")
    return 1 if report.failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
