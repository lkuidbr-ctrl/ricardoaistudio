import { fal } from "@fal-ai/client";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

let configured = false;

export function ensureConfigured() {
  if (configured) return;
  if (!process.env.FAL_KEY) {
    throw new Error("Missing FAL_KEY. Set it in your environment or in a .env file.");
  }
  fal.config({ credentials: process.env.FAL_KEY });
  configured = true;
}

export async function uploadLocalFile(filePath) {
  ensureConfigured();
  const buffer = await readFile(filePath);
  const file = new File([buffer], path.basename(filePath));
  return fal.storage.upload(file);
}

async function downloadTo(url, destPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(path.dirname(destPath), { recursive: true });
  await writeFile(destPath, buffer);
  return destPath;
}

/**
 * Runs a fal.ai model and saves every file found in the result (images[] or video)
 * to destDir, prefixed with namePrefix.
 */
export async function runModel({ model, input, destDir, namePrefix }) {
  ensureConfigured();
  const result = await fal.subscribe(model, { input, logs: false });
  const data = result.data;

  const assets = data.images ?? (data.video ? [data.video] : data.image ? [data.image] : []);
  if (assets.length === 0) {
    throw new Error(`Model ${model} returned no files. Raw response: ${JSON.stringify(data)}`);
  }

  const timestamp = Date.now();
  const savedPaths = [];
  for (let i = 0; i < assets.length; i++) {
    const url = assets[i].url;
    const ext = path.extname(new URL(url).pathname) || ".bin";
    const destPath = path.join(destDir, `${namePrefix}-${timestamp}-${i + 1}${ext}`);
    await downloadTo(url, destPath);
    savedPaths.push(destPath);
  }

  return { savedPaths, raw: data };
}
