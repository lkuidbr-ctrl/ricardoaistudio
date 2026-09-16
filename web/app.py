"""
Local web UI for the fal.ai / Muse character workflow.

Run with:
    python web/app.py

Then open http://127.0.0.1:5000, paste your FAL_KEY, and trigger each
pipeline step from the browser.

The key is kept only in this process's memory (set as the FAL_KEY
environment variable for the running process) -- it is never written to
disk by this app and never included in any API response.
"""

import os
import sys
import threading
import uuid
from contextlib import redirect_stdout
from dataclasses import asdict

from flask import Flask, jsonify, render_template, request, send_from_directory

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from workflow import config, pipeline, prompts, state  # noqa: E402

app = Flask(__name__)

_jobs: dict = {}
_pipeline_lock = threading.Lock()

UPLOAD_DIR = os.path.join(config.OUTPUT_DIR, "uploads")


class _JobLogWriter:
    """Redirect target for stdout so the pipeline's print() calls become
    log lines the frontend can poll for while a job is running."""

    def __init__(self, job: dict):
        self._job = job

    def write(self, text: str) -> None:
        text = text.rstrip("\n")
        if text:
            self._job["logs"].append(text)

    def flush(self) -> None:
        pass


def _run_job(job_id: str, fn, *args, **kwargs) -> None:
    job = _jobs[job_id]
    job["status"] = "running"
    try:
        # Serialized on purpose: one generation at a time, matching the
        # source doc's shot-by-shot production discipline, and avoiding
        # concurrent read-modify-write races on output/project_state.json.
        with _pipeline_lock, redirect_stdout(_JobLogWriter(job)):
            result = fn(*args, **kwargs)
        job["status"] = "done"
        job["result"] = asdict(result) if result is not None else None
    except Exception as exc:  # noqa: BLE001 -- surface any failure to the UI
        job["status"] = "error"
        job["error"] = str(exc)


def _start_job(fn, *args, **kwargs) -> str:
    job_id = uuid.uuid4().hex
    _jobs[job_id] = {"status": "queued", "logs": [], "result": None, "error": None}
    thread = threading.Thread(target=_run_job, args=(job_id, fn, *args), kwargs=kwargs, daemon=True)
    thread.start()
    return job_id


def _require_key_or_400():
    if not os.environ.get(config.FAL_KEY_ENV):
        return jsonify({"error": "FAL_KEY não configurada. Cole sua API key primeiro."}), 400
    return None


def _asset_to_public(asset):
    if asset is None:
        return None
    rel = os.path.relpath(asset.local_path, config.OUTPUT_DIR)
    return {"url": f"/output/{rel}", "source_url": asset.url}


def _state_to_public(st: state.ProjectState) -> dict:
    return {
        "character_reference": _asset_to_public(st.character_reference),
        "location_reference": _asset_to_public(st.location_reference),
        "character_sheet": _asset_to_public(st.character_sheet),
        "location_sheet": _asset_to_public(st.location_sheet),
        "shots": {k: _asset_to_public(v) for k, v in st.shots.items()},
    }


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/key")
def set_key():
    data = request.get_json(force=True, silent=True) or {}
    key = (data.get("fal_key") or "").strip()
    if not key:
        return jsonify({"error": "fal_key é obrigatório"}), 400
    os.environ[config.FAL_KEY_ENV] = key
    return jsonify({"ok": True})


@app.get("/api/key")
def has_key():
    return jsonify({"has_key": bool(os.environ.get(config.FAL_KEY_ENV))})


@app.get("/api/status")
def get_status():
    return jsonify(_state_to_public(state.load_state()))


@app.get("/output/<path:filename>")
def output_file(filename):
    return send_from_directory(os.path.abspath(config.OUTPUT_DIR), filename)


@app.get("/api/jobs/<job_id>")
def job_status(job_id):
    job = _jobs.get(job_id)
    if job is None:
        return jsonify({"error": "job desconhecido"}), 404
    return jsonify(job)


@app.post("/api/generate/character")
def generate_character():
    err = _require_key_or_400()
    if err:
        return err
    force = request.form.get("force", "false").lower() == "true"
    reference_photo_path = None
    uploaded = request.files.get("reference_photo")
    if uploaded and uploaded.filename:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        reference_photo_path = os.path.join(UPLOAD_DIR, uploaded.filename)
        uploaded.save(reference_photo_path)
    job_id = _start_job(pipeline.generate_character_reference, reference_photo_path, force=force)
    return jsonify({"job_id": job_id})


@app.post("/api/generate/location")
def generate_location():
    err = _require_key_or_400()
    if err:
        return err
    force = bool((request.get_json(silent=True) or {}).get("force", False))
    job_id = _start_job(pipeline.generate_location_reference, force=force)
    return jsonify({"job_id": job_id})


@app.post("/api/generate/character-sheet")
def generate_character_sheet():
    err = _require_key_or_400()
    if err:
        return err
    force = bool((request.get_json(silent=True) or {}).get("force", False))
    job_id = _start_job(pipeline.generate_character_sheet, force=force)
    return jsonify({"job_id": job_id})


@app.post("/api/generate/location-sheet")
def generate_location_sheet():
    err = _require_key_or_400()
    if err:
        return err
    force = bool((request.get_json(silent=True) or {}).get("force", False))
    job_id = _start_job(pipeline.generate_location_sheet, force=force)
    return jsonify({"job_id": job_id})


@app.post("/api/generate/shot/<int:number>")
def generate_shot(number: int):
    err = _require_key_or_400()
    if err:
        return err
    if number not in prompts.SHOT_ORDER:
        return jsonify({"error": f"shot inválido: {number}"}), 400
    force = bool((request.get_json(silent=True) or {}).get("force", False))
    job_id = _start_job(pipeline.generate_shot, number, force=force)
    return jsonify({"job_id": job_id})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
