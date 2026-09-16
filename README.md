# ricardoaistudio
Projects

## fal.ai / Muse character workflow automation

Automates the character + location + video pipeline described in
[`docs/workflow-fal-ai-muse.md`](docs/workflow-fal-ai-muse.md): generates a
locked master character reference and studio location via fal.ai's Muse
image model, derives character/location sheets from them, then generates
the 7-shot video sequence against those same locked references.

### Setup

```bash
pip install -r requirements.txt
export FAL_KEY=your-fal-ai-api-key   # https://fal.ai
```

### Usage — command line

```bash
# optional: anchor the character's identity to a real photo (image-to-image)
python run_workflow.py character --reference-photo photos/me.jpg
python run_workflow.py location
python run_workflow.py character-sheet
python run_workflow.py location-sheet
python run_workflow.py shot 1        # review, then continue
python run_workflow.py shot 2 3 4 5 6 7

# or run everything in order in one go
python run_workflow.py all --reference-photo photos/me.jpg

# check what's already been generated / locked
python run_workflow.py status
```

### Usage — web UI

A local web app wraps the same pipeline with buttons and live previews, so
you can paste your `FAL_KEY` in the browser instead of exporting it:

```bash
python web/app.py
# open http://127.0.0.1:5000
```

Paste your key, click "Salvar chave", then trigger each step (personagem,
locação, sheets, shots 1-7) in order — each button shows live logs while the
job runs and the generated image/video as soon as it's ready. The key is
kept only in the running server process's memory; it is never written to
disk or echoed back by the API. This is a single-user local dev server
(Flask's built-in one) — don't expose it on a public network as-is.

Generated assets are downloaded into `output/` and tracked in
`output/project_state.json`. Once `character` and `location` succeed, their
outputs are **locked**: re-running the pipeline skips them unless you pass
`--force`, matching the source doc's "never regenerate the locked
character/environment" rule. Prompts themselves live untouched in
`workflow/prompts.py`, copied verbatim from the source doc and never
rewritten by the code.

### Note on fal.ai model IDs

This project's network access to fal.ai/docs.fal.ai was unavailable while
writing this integration, so the exact model endpoint slugs and request
field names in `workflow/config.py` and `workflow/adapters.py` are
best-effort based on fal.ai's public model catalog (Meta's "Muse Image"
model, and fal's reference-to-video model family). Before your first real
run, confirm them against the live "API" tab on your chosen models'
fal.ai pages and adjust `workflow/config.py` (endpoint IDs, via env vars)
or `workflow/adapters.py` (request field names) if needed — those two
files are the only places that would need to change.
