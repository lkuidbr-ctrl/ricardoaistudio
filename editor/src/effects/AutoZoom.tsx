import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Zoom } from "../schema";

// "Punch-in": aproxima rápido no início do trecho e volta suave no final.
export const AutoZoom: React.FC<{ zooms: Zoom[]; children: React.ReactNode }> = ({ zooms, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let scale = 1;
  for (const z of zooms) {
    const start = Math.round((z.atMs / 1000) * fps);
    const end = Math.round(((z.atMs + z.durationMs) / 1000) * fps);
    const zoomIn = spring({ frame: frame - start, fps, config: { damping: 200 }, durationInFrames: 8 });
    const zoomOut = spring({ frame: frame - end, fps, config: { damping: 200 }, durationInFrames: 12 });
    scale = Math.max(scale, 1 + (z.scale - 1) * (zoomIn - zoomOut));
  }

  return (
    <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: "50% 35%" }}>
      {children}
    </AbsoluteFill>
  );
};
