"""
Pipeline steps for the character + fal.ai/Muse master workflow.

Generation order matches docs/workflow-fal-ai-muse.md exactly:

    CHARACTER -> LOCATION -> CHARACTER SHEET -> LOCATION SHEET
    -> SHOT 1 -> SHOT 2 -> ... -> SHOT 7

Every step is idempotent: it checks workflow/state.py's locked
ProjectState first and refuses to regenerate an existing asset unless
force=True is passed, mirroring the doc's "trava" (lock) rule for the
character and location references.
"""

import os
import time
import urllib.request
from typing import Optional

import fal_client

from . import adapters, config, prompts, state


def _download(url: str, local_path: str) -> None:
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    urllib.request.urlretrieve(url, local_path)


def _run(model: str, arguments: dict) -> dict:
    config.require_fal_key()
    return fal_client.subscribe(model, arguments=arguments, with_logs=True)


def upload_reference_photo(path: str) -> str:
    """Upload a local real-life photo so it can be passed as an
    image_url reference to Muse (STEP 1's optional identity lock)."""
    config.require_fal_key()
    return fal_client.upload_file(path)


def generate_character_reference(
    reference_photo_path: Optional[str] = None, force: bool = False
) -> state.Asset:
    st = state.load_state()
    if st.character_reference and not force:
        print(f"[skip] MASTER_CHARACTER_REFERENCE already locked: {st.character_reference.local_path}")
        return st.character_reference

    reference_image_url = None
    if reference_photo_path:
        print(f"Uploading identity reference photo: {reference_photo_path}")
        reference_image_url = upload_reference_photo(reference_photo_path)

    print("Generating MASTER_CHARACTER_REFERENCE (Muse)...")
    args = adapters.build_text_to_image_arguments(
        prompts.CHARACTER_PROMPT, prompts.CHARACTER_ASPECT_RATIO, reference_image_url
    )
    result = _run(config.MUSE_TEXT_TO_IMAGE_MODEL, args)
    url = adapters.extract_image_url(result)

    local_path = os.path.join(config.OUTPUT_DIR, "character_reference.png")
    _download(url, local_path)

    asset = state.Asset(url=url, local_path=local_path)
    st.character_reference = asset
    state.save_state(st)
    print(f"Saved MASTER_CHARACTER_REFERENCE -> {local_path} (~${config.MUSE_COST_PER_IMAGE_USD:.2f})")
    return asset


def generate_location_reference(force: bool = False) -> state.Asset:
    st = state.load_state()
    if st.location_reference and not force:
        print(f"[skip] MASTER_LOCATION_REFERENCE already locked: {st.location_reference.local_path}")
        return st.location_reference

    print("Generating MASTER_LOCATION_REFERENCE (Muse)...")
    args = adapters.build_text_to_image_arguments(
        prompts.LOCATION_PROMPT, prompts.LOCATION_ASPECT_RATIO
    )
    result = _run(config.MUSE_TEXT_TO_IMAGE_MODEL, args)
    url = adapters.extract_image_url(result)

    local_path = os.path.join(config.OUTPUT_DIR, "location_reference.png")
    _download(url, local_path)

    asset = state.Asset(url=url, local_path=local_path)
    st.location_reference = asset
    state.save_state(st)
    print(f"Saved MASTER_LOCATION_REFERENCE -> {local_path} (~${config.MUSE_COST_PER_IMAGE_USD:.2f})")
    return asset


def generate_character_sheet(force: bool = False) -> state.Asset:
    st = state.load_state()
    if not st.character_reference:
        raise RuntimeError(
            "MASTER_CHARACTER_REFERENCE is not locked yet. Run the 'character' step first."
        )
    if st.character_sheet and not force:
        print(f"[skip] MASTER_CHARACTER_SHEET already exists: {st.character_sheet.local_path}")
        return st.character_sheet

    print("Generating MASTER_CHARACTER_SHEET (Muse edit, using locked character reference)...")
    args = adapters.build_edit_arguments(
        prompts.CHARACTER_SHEET_PROMPT, [st.character_reference.url]
    )
    result = _run(config.MUSE_EDIT_MODEL, args)
    url = adapters.extract_image_url(result)

    local_path = os.path.join(config.OUTPUT_DIR, "character_sheet.png")
    _download(url, local_path)

    asset = state.Asset(url=url, local_path=local_path)
    st.character_sheet = asset
    state.save_state(st)
    print(f"Saved MASTER_CHARACTER_SHEET -> {local_path} (~${config.MUSE_COST_PER_IMAGE_USD:.2f})")
    return asset


def generate_location_sheet(force: bool = False) -> state.Asset:
    st = state.load_state()
    if not st.location_reference:
        raise RuntimeError(
            "MASTER_LOCATION_REFERENCE is not locked yet. Run the 'location' step first."
        )
    if st.location_sheet and not force:
        print(f"[skip] MASTER_LOCATION_SHEET already exists: {st.location_sheet.local_path}")
        return st.location_sheet

    print("Generating MASTER_LOCATION_SHEET (Muse edit, using locked location reference)...")
    args = adapters.build_edit_arguments(
        prompts.LOCATION_SHEET_PROMPT, [st.location_reference.url]
    )
    result = _run(config.MUSE_EDIT_MODEL, args)
    url = adapters.extract_image_url(result)

    local_path = os.path.join(config.OUTPUT_DIR, "location_sheet.png")
    _download(url, local_path)

    asset = state.Asset(url=url, local_path=local_path)
    st.location_sheet = asset
    state.save_state(st)
    print(f"Saved MASTER_LOCATION_SHEET -> {local_path} (~${config.MUSE_COST_PER_IMAGE_USD:.2f})")
    return asset


def generate_shot(shot_number: int, force: bool = False) -> state.Asset:
    if shot_number not in prompts.SHOT_ORDER:
        raise ValueError(f"Unknown shot number: {shot_number}")

    st = state.load_state()
    if not st.character_reference or not st.location_reference:
        raise RuntimeError(
            "Character and location references must both be locked before generating video shots."
        )

    key = str(shot_number)
    if key in st.shots and not force:
        print(f"[skip] SHOT {shot_number} already exists: {st.shots[key].local_path}")
        return st.shots[key]

    print(f"Generating SHOT {shot_number} (fal.ai video model, locked references)...")
    prompt = prompts.shot_prompt(shot_number)
    reference_urls = [st.character_reference.url, st.location_reference.url]
    args = adapters.build_video_arguments(prompt, reference_urls, prompts.VIDEO_ASPECT_RATIO)
    result = _run(config.VIDEO_MODEL, args)
    url = adapters.extract_video_url(result)

    local_path = os.path.join(config.OUTPUT_DIR, "shots", f"shot_{shot_number}.mp4")
    _download(url, local_path)

    asset = state.Asset(url=url, local_path=local_path)
    st.shots[key] = asset
    state.save_state(st)
    print(f"Saved SHOT {shot_number} -> {local_path}")
    return asset


def run_all(reference_photo_path: Optional[str] = None, force: bool = False) -> None:
    generate_character_reference(reference_photo_path, force=force)
    generate_location_reference(force=force)
    generate_character_sheet(force=force)
    generate_location_sheet(force=force)
    for shot_number in prompts.SHOT_ORDER:
        generate_shot(shot_number, force=force)
        time.sleep(1)


def print_status() -> None:
    st = state.load_state()

    def line(label: str, asset: Optional[state.Asset]) -> str:
        return f"  {label:<26} {'locked -> ' + asset.local_path if asset else '(not generated)'}"

    print("Project state:")
    print(line("MASTER_CHARACTER_REFERENCE", st.character_reference))
    print(line("MASTER_LOCATION_REFERENCE", st.location_reference))
    print(line("MASTER_CHARACTER_SHEET", st.character_sheet))
    print(line("MASTER_LOCATION_SHEET", st.location_sheet))
    for shot_number in prompts.SHOT_ORDER:
        asset = st.shots.get(str(shot_number))
        print(line(f"SHOT {shot_number}", asset))
