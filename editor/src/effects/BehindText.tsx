import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { anton } from "../fonts";
import type { BehindText as BehindTextProps } from "../schema";

// Texto gigante que fica ENTRE o fundo e a pessoa recortada.
// Deve ser renderizado dentro de uma <Sequence> que começa em startMs.
export const BehindText: React.FC<{ item: BehindTextProps }> = ({ item }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = Math.round((item.durationMs / 1000) * fps);

  const enter = spring({ frame, fps, config: { damping: 14, mass: 0.8 } });
  const exit = interpolate(frame, [total - 10, total], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  let transform = "";
  let opacity = exit;
  switch (item.animation) {
    case "rise":
      transform = `translateY(${interpolate(enter, [0, 1], [item.fontSize * 1.4, 0])}px)`;
      break;
    case "scale":
      transform = `scale(${interpolate(enter, [0, 1], [0.2, 1])})`;
      opacity *= Math.min(1, enter * 2);
      break;
    case "slide":
      transform = `translateX(${interpolate(enter, [0, 1], [-1400, 0])}px)`;
      break;
    case "letters":
      break;
  }
  transform += ` scale(${interpolate(exit, [0, 1], [0.9, 1])})`;

  const letters =
    item.animation === "letters"
      ? [...item.text].map((ch, i) => {
          const p = spring({ frame: frame - i * 2, fps, config: { damping: 12 } });
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                whiteSpace: "pre",
                opacity: p,
                transform: `translateY(${interpolate(p, [0, 1], [item.fontSize * 0.6, 0])}px)`,
              }}
            >
              {ch}
            </span>
          );
        })
      : item.text;

  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: `${item.y}%`,
          width: "100%",
          textAlign: "center",
          translate: "0 -50%",
          fontFamily: anton,
          fontSize: item.fontSize,
          lineHeight: 0.9,
          color: item.color,
          textTransform: "uppercase",
          letterSpacing: item.fontSize * 0.02,
          opacity,
          transform,
        }}
      >
        {letters}
      </div>
    </AbsoluteFill>
  );
};
