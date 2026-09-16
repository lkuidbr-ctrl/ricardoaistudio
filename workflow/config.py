"""
Configuration and model endpoint IDs for the fal.ai character workflow.

FAL_KEY -----------------------------------------------------------------
Create an API key at https://fal.ai and export it before running anything:

    export FAL_KEY=your-key-here

Model endpoint IDs -------------------------------------------------------
This sandbox's network egress to fal.ai and docs.fal.ai was blocked while
this script was written, so the exact endpoint slugs below could not be
confirmed against the live API reference. They follow fal.ai's current
public model catalog (Meta's "Muse Image" model, and fal's reference-to-
video family), but double check them on your fal.ai dashboard before your
first real run:

  - https://fal.ai/models/meta/muse-image/api   (text-to-image + edit)
  - https://fal.ai/explore/image-to-video-apis  (reference-to-video options)

All of them are overridable via environment variables, so a wrong default
never requires touching code.
"""

import os

FAL_KEY_ENV = "FAL_KEY"


def require_fal_key() -> str:
    key = os.environ.get(FAL_KEY_ENV)
    if not key:
        raise RuntimeError(
            f"{FAL_KEY_ENV} is not set. Create an API key at https://fal.ai "
            f"and export it: export {FAL_KEY_ENV}=your-key-here"
        )
    return key


# Muse (Meta) image model -- text-to-image and edit (image-to-image) endpoints.
MUSE_TEXT_TO_IMAGE_MODEL = os.environ.get(
    "FAL_MUSE_T2I_MODEL", "meta/muse-image/text-to-image"
)
MUSE_EDIT_MODEL = os.environ.get("FAL_MUSE_EDIT_MODEL", "meta/muse-image/edit")
MUSE_COST_PER_IMAGE_USD = float(os.environ.get("FAL_MUSE_COST_PER_IMAGE_USD", "0.01"))

# Video model with locked reference-image support (image/reference-to-video).
# Swap for whichever fal.ai reference-to-video model you have access to, e.g.:
#   fal-ai/pixverse/c1/reference-to-video
#   bytedance/seedance-2.5/reference-to-video
#   minimax/h3/reference-to-video
#   fal-ai/vidu/q1/reference-to-video
VIDEO_MODEL = os.environ.get("FAL_VIDEO_MODEL", "fal-ai/pixverse/c1/reference-to-video")

OUTPUT_DIR = os.environ.get("FAL_WORKFLOW_OUTPUT_DIR", "output")
STATE_FILE = os.path.join(OUTPUT_DIR, "project_state.json")
