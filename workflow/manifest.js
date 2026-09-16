import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const MANIFEST_PATH = path.join("output", "manifest.json");

export async function readManifest() {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

export async function writeManifestEntry(key, value) {
  await mkdir("output", { recursive: true });
  const manifest = await readManifest();
  manifest[key] = value;
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  return manifest;
}
