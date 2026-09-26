import type { Caption } from "@remotion/captions";

// Trecho do vídeo original que fica na edição (gerado por scripts/cut.py).
export type KeepRange = { startMs: number; endMs: number };
export type CutsFile = { keep: KeepRange[] };

export type Segment = {
  srcFrom: number; // primeiro quadro no vídeo original
  srcTo: number; // quadro final (exclusivo) no vídeo original
  outFrom: number; // onde o trecho começa no vídeo editado
};

export type Timeline = {
  segments: Segment[];
  totalFrames: number;
  // Início de cada trecho no vídeo editado, sem o primeiro (onde ficam as "emendas").
  joins: number[];
  // Converte um tempo do vídeo original para o vídeo editado (null = trecho cortado).
  // segEndMs = fim (no vídeo editado) do trecho onde esse tempo caiu.
  locate: (srcMs: number) => { ms: number; segEndMs: number } | null;
};

export const buildTimeline = (keep: KeepRange[] | null, fps: number, srcFrames: number): Timeline => {
  const ranges = keep && keep.length > 0 ? keep : [{ startMs: 0, endMs: (srcFrames / fps) * 1000 }];
  const segments: Segment[] = [];
  let out = 0;
  for (const r of ranges) {
    const srcFrom = Math.max(0, Math.round((r.startMs / 1000) * fps));
    const srcTo = Math.min(srcFrames, Math.round((r.endMs / 1000) * fps));
    if (srcTo <= srcFrom) continue;
    segments.push({ srcFrom, srcTo, outFrom: out });
    out += srcTo - srcFrom;
  }

  const toMs = (frame: number) => (frame / fps) * 1000;
  const locate = (srcMs: number) => {
    const f = (srcMs / 1000) * fps;
    const seg = segments.find((s) => f >= s.srcFrom && f < s.srcTo);
    if (!seg) return null;
    return { ms: toMs(seg.outFrom + f - seg.srcFrom), segEndMs: toMs(seg.outFrom + seg.srcTo - seg.srcFrom) };
  };

  return { segments, totalFrames: Math.max(1, out), joins: segments.slice(1).map((s) => s.outFrom), locate };
};

// Move as legendas para o tempo do vídeo editado; palavras cortadas somem.
export const remapCaptions = (captions: Caption[], timeline: Timeline): Caption[] => {
  const result: Caption[] = [];
  for (const c of captions) {
    const hit = timeline.locate(c.startMs);
    if (!hit) continue;
    const end = Math.min(hit.ms + (c.endMs - c.startMs), hit.segEndMs);
    result.push({ ...c, startMs: hit.ms, endMs: end, timestampMs: (hit.ms + end) / 2 });
  }
  return result;
};
