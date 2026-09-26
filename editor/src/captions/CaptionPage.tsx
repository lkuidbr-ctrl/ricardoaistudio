import type { TikTokPage, TikTokToken } from "@remotion/captions";
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { anton, bebas, montserrat, poppins } from "../fonts";
import type { CaptionStyle } from "../schema";

export type CaptionLook = {
  style: CaptionStyle;
  color: string;
  highlightColor: string;
  y: number;
  keywords: Set<string>;
};

export const normalizeWord = (w: string) =>
  w
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();

type WordState = { token: TikTokToken; active: boolean; spoken: boolean; keyword: boolean; pop: number };

const stroke = (px: number): React.CSSProperties => ({
  WebkitTextStroke: `${px}px black`,
  paintOrder: "stroke",
});

const renderWord = (w: WordState, look: CaptionLook, i: number) => {
  const text = w.token.text.trim();
  const key = `${i}-${w.token.fromMs}`;
  const accent = w.keyword ? look.highlightColor : look.color;

  switch (look.style) {
    case "hormozi":
      return (
        <span
          key={key}
          style={{
            display: "inline-block",
            margin: "0 0.22em",
            color: w.active || w.keyword ? look.highlightColor : look.color,
            transform: `scale(${w.active ? 1 + 0.1 * w.pop : 1})`,
            ...stroke(16),
          }}
        >
          {text}
        </span>
      );
    case "karaoke":
      return (
        <span
          key={key}
          style={{
            display: "inline-block",
            margin: "0 4px",
            padding: "2px 14px",
            borderRadius: 18,
            color: accent,
            background: w.active ? look.highlightColor : "transparent",
            ...(w.active ? { color: "black" } : stroke(10)),
            opacity: w.spoken || w.active ? 1 : 0.55,
          }}
        >
          {text}
        </span>
      );
    case "neon":
      return (
        <span
          key={key}
          style={{
            display: "inline-block",
            margin: "0 0.18em",
            color: w.active ? "white" : accent,
            opacity: w.active ? 1 : 0.7,
            textShadow: w.active
              ? `0 0 12px ${look.highlightColor}, 0 0 32px ${look.highlightColor}, 0 0 64px ${look.highlightColor}`
              : `0 0 8px ${look.color}`,
          }}
        >
          {text}
        </span>
      );
    case "minimal":
      return (
        <span key={key} style={{ color: accent, opacity: w.spoken || w.active ? 1 : 0.25 }}>
          {w.token.text}
        </span>
      );
    case "pop":
      return null;
  }
};

const fontFor: Record<CaptionStyle, React.CSSProperties> = {
  hormozi: { fontFamily: montserrat, fontWeight: 900, fontSize: 92, textTransform: "uppercase" },
  karaoke: { fontFamily: poppins, fontWeight: 800, fontSize: 78 },
  neon: { fontFamily: bebas, fontSize: 130, letterSpacing: 4 },
  minimal: { fontFamily: poppins, fontWeight: 600, fontSize: 62 },
  pop: { fontFamily: anton, fontSize: 170, textTransform: "uppercase" },
};

// Uma "página" de legenda (2-4 palavras). Renderizada dentro de uma <Sequence>
// que começa em page.startMs, então o frame 0 é o início da página.
export const CaptionPage: React.FC<{ page: TikTokPage; look: CaptionLook }> = ({ page, look }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = page.startMs + (frame / fps) * 1000;

  const words: WordState[] = page.tokens.map((token) => {
    const startFrame = ((token.fromMs - page.startMs) / 1000) * fps;
    return {
      token,
      active: nowMs >= token.fromMs && nowMs < token.toMs,
      spoken: nowMs >= token.toMs,
      keyword: look.keywords.has(normalizeWord(token.text)),
      pop: spring({ frame: frame - startFrame, fps, config: { damping: 10, stiffness: 200 } }),
    };
  });

  const entrance = spring({ frame, fps, config: { damping: 12, stiffness: 180 }, durationInFrames: 10 });

  const container: React.CSSProperties = {
    position: "absolute",
    top: `${look.y}%`,
    left: 60,
    right: 60,
    translate: "0 -50%",
    textAlign: "center",
    lineHeight: 1.15,
    ...fontFor[look.style],
  };

  if (look.style === "pop") {
    // Uma palavra por vez, grande, com "pulo" e leve rotação alternada.
    const idx = words.findIndex((w) => w.active);
    const current = words[idx === -1 ? words.findLastIndex((w) => w.spoken) : idx] ?? words[0];
    const i = words.indexOf(current);
    return (
      <AbsoluteFill>
        <div style={container}>
          <span
            style={{
              display: "inline-block",
              color: current.keyword ? look.highlightColor : look.color,
              transform: `scale(${interpolate(current.pop, [0, 1], [0.4, 1])}) rotate(${i % 2 ? 4 : -4}deg)`,
              ...stroke(18),
            }}
          >
            {current.token.text.trim()}
          </span>
        </div>
      </AbsoluteFill>
    );
  }

  const boxed = look.style === "minimal";
  return (
    <AbsoluteFill>
      <div
        style={{
          ...container,
          transform: `scale(${interpolate(entrance, [0, 1], [0.85, 1])})`,
          opacity: entrance,
        }}
      >
        <span
          style={
            boxed
              ? { background: "rgba(0,0,0,0.6)", padding: "10px 24px", borderRadius: 16, boxDecorationBreak: "clone" }
              : undefined
          }
        >
          {words.map((w, i) => renderWord(w, look, i))}
        </span>
      </div>
    </AbsoluteFill>
  );
};
