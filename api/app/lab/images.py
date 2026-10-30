"""Drawing a creature with Vertex AI (server/image-generator.ts, ported). No API
key: it authenticates as the Cloud Run service account (locally,
`gcloud auth application-default login`)."""

from dataclasses import dataclass
from typing import Any, Protocol

from google import genai
from google.genai import errors, types


@dataclass(frozen=True)
class GeneratedImage:
    data: bytes
    mime_type: str


class ImageBlocked(Exception):
    """The model's safety filters refused the prompt or the result."""


class ImageBusy(Exception):
    """Vertex is out of per-minute quota for the model (HTTP 429)."""


class ImageGenerator(Protocol):
    async def __call__(self, prompt: str) -> GeneratedImage: ...


BLOCKED = {
    "BLOCKLIST",
    "IMAGE_PROHIBITED_CONTENT",
    "IMAGE_SAFETY",
    "PROHIBITED_CONTENT",
    "SAFETY",
    "SPII",
}

# Stricter than the default (medium) threshold: the cards are a friendly cartoon
# style, so a false "try a different idea" beats letting something through.
SAFETY_SETTINGS = [
    types.SafetySetting(category=category, threshold=types.HarmBlockThreshold.BLOCK_LOW_AND_ABOVE)
    for category in (
        types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        types.HarmCategory.HARM_CATEGORY_HARASSMENT,
        types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        types.HarmCategory.HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT,
        types.HarmCategory.HARM_CATEGORY_IMAGE_HARASSMENT,
        types.HarmCategory.HARM_CATEGORY_IMAGE_HATE,
        types.HarmCategory.HARM_CATEGORY_IMAGE_SEXUALLY_EXPLICIT,
    )
]


def _name(reason: Any) -> str | None:
    """An enum member or its plain string, as a string."""
    if reason is None:
        return None
    return str(getattr(reason, "value", reason))


def read_response(response: Any) -> GeneratedImage:
    """The image in Vertex's answer, or ImageBlocked, or ValueError when there's
    neither (the finish reason says why)."""
    candidate = (response.candidates or [None])[0]
    finish = _name(candidate.finish_reason) if candidate else None
    feedback = response.prompt_feedback
    if (feedback and feedback.block_reason) or finish in BLOCKED:
        raise ImageBlocked("The image was blocked by safety filters")
    parts = (candidate.content.parts if candidate and candidate.content else None) or []
    image = next((p.inline_data for p in parts if p.inline_data and p.inline_data.data), None)
    if image is None:
        raise ValueError(f"No image in the response (finishReason {finish or 'none'})")
    return GeneratedImage(data=image.data, mime_type=image.mime_type or "image/png")


def vertex_generator(project: str, model: str) -> ImageGenerator:
    # The newer image models are served from the global endpoint only.
    client = genai.Client(vertexai=True, project=project, location="global")
    config = types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(
            aspect_ratio="1:1",
            # It's a creature lab: never draw people, let alone real ones.
            person_generation="ALLOW_NONE",
            prominent_people=types.ProminentPeople.BLOCK_PROMINENT_PEOPLE,
        ),
        safety_settings=SAFETY_SETTINGS,
    )

    async def generate(prompt: str) -> GeneratedImage:
        try:
            response = await client.aio.models.generate_content(
                model=model, contents=prompt, config=config
            )
        except errors.APIError as error:
            if error.code == 429:
                raise ImageBusy(str(error)) from error
            raise
        return read_response(response)

    return generate
