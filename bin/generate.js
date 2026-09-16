#!/usr/bin/env node
import "dotenv/config";
import { fal } from "@fal-ai/client";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MODEL = "meta/muse-image/text-to-image";

function parseArgs(argv) {
  const args = { prompt: null, out: "output", count: 1, aspect: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out" || arg === "-o") {
      args.out = argv[++i];
    } else if (arg === "--count" || arg === "-n") {
      args.count = Number(argv[++i]);
    } else if (arg === "--aspect" || arg === "-a") {
      args.aspect = argv[++i];
    } else if (!args.prompt) {
      args.prompt = arg;
    }
  }
  return args;
}

async function downloadImage(url, destPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destPath, buffer);
}

async function main() {
  const { prompt, out, count, aspect } = parseArgs(process.argv.slice(2));

  if (!prompt) {
    console.error("Usage: ricardoaistudio \"<prompt>\" [--out <dir>] [--count <n>] [--aspect <w:h>]");
    process.exit(1);
  }

  if (!process.env.FAL_KEY) {
    console.error("Missing FAL_KEY. Set it in your environment or in a .env file.");
    process.exit(1);
  }

  fal.config({ credentials: process.env.FAL_KEY });

  await mkdir(out, { recursive: true });

  console.log(`Generating ${count} image(s) for prompt: "${prompt}"`);

  const input = { prompt, num_images: count };
  if (aspect) input.aspect_ratio = aspect;

  const result = await fal.subscribe(MODEL, {
    input,
    logs: false,
  });

  const images = result.data.images ?? [];
  if (images.length === 0) {
    console.error("No images were returned.");
    process.exit(1);
  }

  const timestamp = Date.now();
  const savedPaths = [];

  for (let i = 0; i < images.length; i++) {
    const ext = path.extname(new URL(images[i].url).pathname) || ".png";
    const destPath = path.join(out, `${timestamp}-${i + 1}${ext}`);
    await downloadImage(images[i].url, destPath);
    savedPaths.push(destPath);
  }

  for (const p of savedPaths) {
    console.log(`Saved: ${p}`);
  }
}

main().catch((err) => {
  console.error("Generation failed:", err.message ?? err);
  process.exit(1);
});
