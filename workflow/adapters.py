"""
Thin translation layer between our pipeline and fal.ai's request/response
schemas.

fal.ai model endpoints do not all share one parameter naming convention.
The field names below follow the most common fal.ai conventions (as seen
across flux/muse-style image models and reference-to-video models), but
this sandbox's network egress to fal.ai/docs.fal.ai was blocked while this
was written, so the exact schema could not be confirmed against the live
API reference. Before your first real run, open the model's "API" tab on
fal.ai (e.g. https://fal.ai/models/meta/muse-image/api) and adjust the
dict keys here if they differ -- this is the only place that needs to
change; workflow/pipeline.py never builds request dicts by hand.
"""

from typing import Optional, Sequence

_ASPECT_RATIO_TO_IMAGE_SIZE = {
    "9:16": "portrait_16_9",
    "16:9": "landscape_16_9",
    "1:1": "square_hd",
}


def aspect_ratio_to_image_size(aspect_ratio: str) -> str:
    return _ASPECT_RATIO_TO_IMAGE_SIZE.get(aspect_ratio, "square_hd")


def build_text_to_image_arguments(
    prompt: str,
    aspect_ratio: str,
    reference_image_url: Optional[str] = None,
) -> dict:
    args = {
        "prompt": prompt,
        "image_size": aspect_ratio_to_image_size(aspect_ratio),
    }
    if reference_image_url:
        # image-to-image identity lock, per STEP 1's note in the workflow doc
        args["image_urls"] = [reference_image_url]
    return args


def build_edit_arguments(prompt: str, reference_image_urls: Sequence[str]) -> dict:
    return {
        "prompt": prompt,
        "image_urls": list(reference_image_urls),
    }


def build_video_arguments(
    prompt: str,
    reference_image_urls: Sequence[str],
    aspect_ratio: str = "9:16",
) -> dict:
    return {
        "prompt": prompt,
        "reference_image_urls": list(reference_image_urls),
        "aspect_ratio": aspect_ratio,
    }


def extract_image_url(result: dict) -> str:
    """fal.ai image endpoints commonly return {"images": [{"url": ...}]}."""
    images = result.get("images")
    if images:
        return images[0]["url"]
    image = result.get("image")
    if image:
        return image["url"]
    raise KeyError(f"Could not find an image URL in fal.ai response: {result!r}")


def extract_video_url(result: dict) -> str:
    video = result.get("video")
    if video:
        return video["url"]
    raise KeyError(f"Could not find a video URL in fal.ai response: {result!r}")
