"""Creature images in a Cloud Storage bucket. The bucket is publicly readable, so
the browser loads an image straight from its URL, never through the API."""

import uuid
from typing import Protocol

import anyio
from google.cloud import storage

EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
PUBLIC_HOST = "https://storage.googleapis.com"


class ImageStore(Protocol):
    async def save(self, data: bytes, mime_type: str) -> str:
        """Stores the image and returns its public URL."""
        ...

    async def delete(self, url: str) -> None: ...


class BucketStore:
    def __init__(self, bucket: str) -> None:
        self.bucket_name = bucket
        # Uses the Cloud Run service account (locally, application-default login).
        self.bucket = storage.Client().bucket(bucket)

    async def save(self, data: bytes, mime_type: str) -> str:
        name = f"creatures/{uuid.uuid4()}.{EXTENSIONS.get(mime_type, 'png')}"
        blob = self.bucket.blob(name)
        # A name is never reused, so browsers may cache it for good.
        blob.cache_control = "public, max-age=31536000, immutable"
        # The storage client is synchronous: run it on a worker thread so the
        # upload doesn't stop every other request on this event loop.
        await anyio.to_thread.run_sync(
            lambda: blob.upload_from_string(data, content_type=mime_type)
        )
        return f"{PUBLIC_HOST}/{self.bucket_name}/{name}"

    async def delete(self, url: str) -> None:
        prefix = f"{PUBLIC_HOST}/{self.bucket_name}/"
        if not url.startswith(prefix):
            return
        blob = self.bucket.blob(url.removeprefix(prefix))
        await anyio.to_thread.run_sync(blob.delete)


def bucket_store(bucket: str) -> ImageStore:
    return BucketStore(bucket)
