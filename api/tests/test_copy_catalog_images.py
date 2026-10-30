"""The catalog image copy: sources from the seed, resizing, and a batch that keeps
going past failures and skips what's already uploaded."""

import io

from PIL import Image

from app.db.migrate import MIGRATIONS_DIR
from scripts.copy_catalog_images import (
    catalog_sources,
    catalog_url,
    copy_all,
    resize_to_webp,
    source_url,
)

SEED = (MIGRATIONS_DIR / "0002_seed_pokemon.sql").read_text()


def png(width: int, height: int) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (width, height), "orange").save(out, "PNG")
    return out.getvalue()


def size_of(data: bytes) -> tuple[int, int]:
    return Image.open(io.BytesIO(data)).size


def test_reads_all_1000_sources_from_the_seed() -> None:
    sources = catalog_sources(SEED)
    assert len(sources) == 1000
    assert sources[1] == "https://loremflickr.com/3266/1298?lock=2718838203017904"
    assert all(url.startswith("https://") for url in sources.values())


def test_resize_keeps_shape_and_never_upscales() -> None:
    assert size_of(resize_to_webp(png(3266, 1298))) == (640, 254)
    assert size_of(resize_to_webp(png(77, 2039))) == (24, 640)
    assert size_of(resize_to_webp(png(300, 200))) == (300, 200)
    data = resize_to_webp(png(10, 10))
    assert data[:4] == b"RIFF" and data[8:12] == b"WEBP"


def test_catalog_url() -> None:
    assert catalog_url(7) == (
        "https://storage.googleapis.com/finny-take-home-creature-images/catalog/7.webp"
    )


class FakeStore:
    def __init__(self, existing: set[int]) -> None:
        self.ids = set(existing)

    def existing(self) -> set[int]:
        return set(self.ids)

    def upload(self, pokemon_id: int, data: bytes) -> None:
        self.ids.add(pokemon_id)


def test_copy_skips_existing_retries_then_reports_failures() -> None:
    calls: dict[str, int] = {}

    def fetch(url: str) -> bytes:
        calls[url] = calls.get(url, 0) + 1
        if url == "u2" and calls[url] < 3:
            raise OSError("flaky")
        if url == "u3":
            raise OSError("gone")
        return png(20, 10)

    store = FakeStore({1})
    report = copy_all({1: "u1", 2: "u2", 3: "u3"}, fetch, store, workers=2, delays=(0, 0))
    assert report.skipped == [1]
    assert report.uploaded == [2]
    assert set(report.failed) == {3}
    assert calls == {"u2": 3, "u3": 3}
    assert store.ids == {1, 2}


def test_every_source_is_a_square_crop_of_the_photo_the_cards_showed() -> None:
    # The frontend asked picsum for the shape it showed (loremflickr swapped for
    # the lock-seeded picsum image, blur dropped). The copy asks for one sharp
    # square, which the 2:1 card and the square battle sprite both crop well.
    assert (
        source_url(1, "https://loremflickr.com/3266/1298?lock=2718838203017904")
        == "https://picsum.photos/seed/lock-2718838203017904/640/640"
    )
    assert (
        source_url(9, "https://loremflickr.com/9/9")
        == "https://picsum.photos/seed/pokemon-9/640/640"
    )
    assert (
        source_url(4, "https://picsum.photos/seed/ps3GTyrI/1827/3861?grayscale&blur=8")
        == "https://picsum.photos/seed/ps3GTyrI/640/640?grayscale"
    )
    assert (
        source_url(5, "https://picsum.photos/seed/x/3744/46?blur=3")
        == "https://picsum.photos/seed/x/640/640"
    )


def test_loremflickr_is_never_fetched() -> None:
    fetched: list[str] = []

    def fetch(url: str) -> bytes:
        fetched.append(url)
        return png(640, 640)

    store = FakeStore(set())
    sources = {1: "https://loremflickr.com/320/240?lock=1"}
    report = copy_all(sources, fetch, store, workers=1, delays=(0, 0))
    assert report.uploaded == [1]
    assert fetched == ["https://picsum.photos/seed/lock-1/640/640"]
