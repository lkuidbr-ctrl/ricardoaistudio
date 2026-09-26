import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { montserrat } from "../fonts";

// Título-gancho nos primeiros segundos ("O erro que me custou 10 mil").
// Deve ficar dentro de uma <Sequence> com a duração do gancho.
export const HookTitle: React.FC<{ text: string; background: string; color: string; fontFamily?: string }> = ({
  text,
  background,
  color,
  fontFamily = montserrat,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 11, stiffness: 170 } });
  const exit = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: "11%",
          maxWidth: "84%",
          padding: "22px 36px",
          borderRadius: 24,
          background,
          color,
          fontFamily,
          fontWeight: 900,
          fontSize: 68,
          lineHeight: 1.1,
          textAlign: "center",
          textTransform: "uppercase",
          boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
          opacity: exit,
          transform: `scale(${interpolate(enter, [0, 1], [0.6, 1]) * interpolate(exit, [0, 1], [0.9, 1])}) rotate(${interpolate(enter, [0, 1], [-6, -2])}deg)`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
