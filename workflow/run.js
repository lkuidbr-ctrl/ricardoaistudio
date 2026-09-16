#!/usr/bin/env node
import "dotenv/config";
import { runModel, uploadLocalFile, ensureConfigured } from "../lib/fal-client.js";
import { readManifest, writeManifestEntry } from "./manifest.js";
import * as P from "./prompts.js";

const MUSE_TEXT_TO_IMAGE = "meta/muse-image/text-to-image";
const MUSE_EDIT = "meta/muse-image/edit";
const VIDU_REFERENCE_TO_VIDEO = "fal-ai/vidu/q1/reference-to-video";

const OUTPUT_DIR = "output";

function parseArgs(argv) {
  const args = { step: argv[0], refs: [] };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--ref") {
      args.refs.push(argv[++i]);
    }
  }
  return args;
}

async function stepCharacter(refs) {
  let model = MUSE_TEXT_TO_IMAGE;
  let input = { prompt: P.CHARACTER_PROMPT, aspect_ratio: P.CHARACTER_ASPECT_RATIO, num_images: 1 };

  if (refs.length > 0) {
    console.log(`Using ${refs.length} local reference photo(s) for identity fidelity (image-to-image).`);
    const urls = [];
    for (const r of refs) urls.push(await uploadLocalFile(r));
    model = MUSE_EDIT;
    input = { prompt: P.CHARACTER_PROMPT, image_urls: urls, aspect_ratio: P.CHARACTER_ASPECT_RATIO, num_images: 1 };
  }

  const { savedPaths } = await runModel({ model, input, destDir: OUTPUT_DIR, namePrefix: "character" });
  const localPath = savedPaths[0];
  const publicUrl = await uploadLocalFile(localPath);
  await writeManifestEntry("MASTER_CHARACTER_REFERENCE", { path: localPath, url: publicUrl });
  console.log(`MASTER_CHARACTER_REFERENCE saved: ${localPath}`);
}

async function stepLocation() {
  const input = { prompt: P.LOCATION_PROMPT, aspect_ratio: P.LOCATION_ASPECT_RATIO, num_images: 1 };
  const { savedPaths } = await runModel({ model: MUSE_TEXT_TO_IMAGE, input, destDir: OUTPUT_DIR, namePrefix: "location" });
  const localPath = savedPaths[0];
  const publicUrl = await uploadLocalFile(localPath);
  await writeManifestEntry("MASTER_LOCATION_REFERENCE", { path: localPath, url: publicUrl });
  console.log(`MASTER_LOCATION_REFERENCE saved: ${localPath}`);
}

async function stepCharacterSheet(manifest) {
  const ref = manifest.MASTER_CHARACTER_REFERENCE;
  if (!ref) throw new Error('Run "character" step first (MASTER_CHARACTER_REFERENCE missing).');

  const input = { prompt: P.CHARACTER_SHEET_PROMPT, image_urls: [ref.url], num_images: 1 };
  const { savedPaths } = await runModel({ model: MUSE_EDIT, input, destDir: OUTPUT_DIR, namePrefix: "character-sheet" });
  const localPath = savedPaths[0];
  const publicUrl = await uploadLocalFile(localPath);
  await writeManifestEntry("MASTER_CHARACTER_SHEET", { path: localPath, url: publicUrl });
  console.log(`MASTER_CHARACTER_SHEET saved: ${localPath}`);
}

async function stepLocationSheet(manifest) {
  const ref = manifest.MASTER_LOCATION_REFERENCE;
  if (!ref) throw new Error('Run "location" step first (MASTER_LOCATION_REFERENCE missing).');

  const input = { prompt: P.LOCATION_SHEET_PROMPT, image_urls: [ref.url], num_images: 1 };
  const { savedPaths } = await runModel({ model: MUSE_EDIT, input, destDir: OUTPUT_DIR, namePrefix: "location-sheet" });
  const localPath = savedPaths[0];
  const publicUrl = await uploadLocalFile(localPath);
  await writeManifestEntry("MASTER_LOCATION_SHEET", { path: localPath, url: publicUrl });
  console.log(`MASTER_LOCATION_SHEET saved: ${localPath}`);
}

async function stepShot(shotNumber, manifest) {
  const charSheet = manifest.MASTER_CHARACTER_SHEET;
  const locSheet = manifest.MASTER_LOCATION_SHEET;
  if (!charSheet || !locSheet) {
    throw new Error('Run "character-sheet" and "location-sheet" steps first.');
  }

  const shotText = P.SHOTS[shotNumber];
  if (!shotText) throw new Error(`Unknown shot number: ${shotNumber} (expected 1-7).`);

  // The Vidu reference-to-video prompt field is capped at 1500 characters.
  // SUBJECTS + ENVIRONMENT + STYLE + one shot alone already exceeds that cap,
  // and character/location identity is already carried by reference_image_urls,
  // so per-shot prompts use STYLE + the shot text verbatim (unmodified wording).
  const prompt = `${P.VIDEO_STYLE}\n\n${shotText}`;
  if (prompt.length > 1500) {
    throw new Error(
      `Composed prompt for shot ${shotNumber} is ${prompt.length} chars, over the 1500 limit for ${VIDU_REFERENCE_TO_VIDEO}. Shorten manually before generating.`
    );
  }

  console.log(`--- Prompt sent for SHOT ${shotNumber} ---\n${prompt}\n---`);

  const input = {
    prompt,
    reference_image_urls: [charSheet.url, locSheet.url],
    aspect_ratio: P.VIDEO_ASPECT_RATIO,
  };
  const { savedPaths } = await runModel({
    model: VIDU_REFERENCE_TO_VIDEO,
    input,
    destDir: `${OUTPUT_DIR}/video`,
    namePrefix: `shot${shotNumber}`,
  });
  console.log(`SHOT ${shotNumber} saved: ${savedPaths[0]}`);
}

async function main() {
  ensureConfigured();
  const { step, refs } = parseArgs(process.argv.slice(2));

  if (!step) {
    console.error(
      "Usage: node workflow/run.js <step> [--ref photo.jpg ...]\n" +
        "Steps: character | location | character-sheet | location-sheet | shot1..shot7 | assets"
    );
    process.exit(1);
  }

  const manifest = await readManifest();

  if (step === "character") {
    await stepCharacter(refs);
  } else if (step === "location") {
    await stepLocation();
  } else if (step === "character-sheet") {
    await stepCharacterSheet(manifest);
  } else if (step === "location-sheet") {
    await stepLocationSheet(manifest);
  } else if (step === "assets") {
    // Runs STEP 1-4 (character + location + both sheets) in order, per the workflow doc.
    await stepCharacter(refs);
    await stepLocation();
    const updated = await readManifest();
    await stepCharacterSheet(updated);
    const updated2 = await readManifest();
    await stepLocationSheet(updated2);
    console.log('Assets locked. Review them, then run shots individually: "node workflow/run.js shot1"');
  } else if (/^shot[1-7]$/.test(step)) {
    const n = Number(step.replace("shot", ""));
    await stepShot(n, manifest);
  } else {
    console.error(`Unknown step: ${step}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Workflow step failed:", err.message ?? err);
  process.exit(1);
});
