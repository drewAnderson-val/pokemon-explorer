"""Reading Vertex's answer: an image, or why there isn't one."""

from types import SimpleNamespace as NS

import pytest

from app.lab.images import GeneratedImage, ImageBlocked, read_response


def answer(*, block: str | None = None, finish: str | None = "STOP", parts: object = ()) -> NS:
    candidate = NS(finish_reason=finish, content=NS(parts=list(parts)))  # type: ignore[call-overload]
    return NS(prompt_feedback=NS(block_reason=block) if block else None, candidates=[candidate])


def image_part(data: bytes = b"\x89PNG", mime: str | None = "image/png") -> NS:
    return NS(inline_data=NS(data=data, mime_type=mime))


def test_an_image_part_is_the_image() -> None:
    response = answer(parts=[NS(inline_data=None), image_part()])
    assert read_response(response) == GeneratedImage(data=b"\x89PNG", mime_type="image/png")


def test_no_mime_type_means_png() -> None:
    assert read_response(answer(parts=[image_part(mime=None)])).mime_type == "image/png"


def test_a_blocked_prompt_is_blocked() -> None:
    with pytest.raises(ImageBlocked):
        read_response(answer(block="SAFETY", parts=[image_part()]))


@pytest.mark.parametrize(
    "finish",
    [
        "SAFETY",
        "BLOCKLIST",
        "PROHIBITED_CONTENT",
        "SPII",
        "IMAGE_SAFETY",
        "IMAGE_PROHIBITED_CONTENT",
    ],
)
def test_a_blocked_finish_is_blocked(finish: str) -> None:
    with pytest.raises(ImageBlocked):
        read_response(answer(finish=finish))


def test_no_image_is_an_error_naming_the_finish_reason() -> None:
    with pytest.raises(ValueError, match="MAX_TOKENS"):
        read_response(answer(finish="MAX_TOKENS"))


def test_no_candidates_is_an_error() -> None:
    with pytest.raises(ValueError):
        read_response(NS(prompt_feedback=None, candidates=None))
