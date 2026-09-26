import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Broll as BrollItem } from "../schema";
import { Glitch } from "./Glitch";

const isImage = (src: string) => /\.(jpe?g|png|webp|gif|avif)$/i.test(src);

// Uma cena de B-roll. Deve ficar dentro de uma <Sequence> que começa em startMs.
export const Broll: React.FC<{ item: BrollItem }> = ({ item }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = Math.max(1, Math.round((item.durationMs / 1000) * fps));

  const enter = spring({ frame, fps, config: { damping: 16 }, durationInFrames: 12 });
  const exit = interpolate(frame, [total - 8, total], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const shown = Math.min(enter, exit);

  let transform = "";
  let opacity = 1;
  switch (item.transition) {
    case "fade":
      opacity = shown;
      break;
    case "slide":
      transform = `translateY(${interpolate(shown, [0, 1], [110, 0])}%)`;
      break;
    case "zoom":
      transform = `scale(${interpolate(shown, [0, 1], [1.4, 1])})`;
      opacity = shown;
      break;
    case "glitch":
      opacity = frame < 3 || frame > total - 3 ? (frame % 2 ? 1 : 0.3) : 1;
      break;
  }
  const glitch = item.transition === "glitch" ? interpolate(Math.min(frame, total - frame), [0, 6], [1, 0], { extrapolateRight: "clamp" }) : 0;

  // Ken Burns: imagens paradas ganham uma aproximação lenta.
  const kenBurns = interpolate(frame, [0, total], [1, 1.15]);
  const media = isImage(item.src) ? (
    <Img
      src={staticFile(item.src)}
      style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${kenBurns})` }}
    />
  ) : (
    <OffthreadVideo src={staticFile(item.src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  );

  const content = (
    <Glitch intensity={glitch} seed={frame}>
      {media}
    </Glitch>
  );

  if (item.mode === "pip") {
    return (
      <AbsoluteFill>
        <div
          style={{
            position: "absolute",
            top: "9%",
            left: "10%",
            width: "80%",
            height: "34%",
            borderRadius: 40,
            overflow: "hidden",
            border: "6px solid white",
            boxShadow: "0 30px 60px rgba(0,0,0,0.5)",
            opacity,
            transform: `${transform} rotate(${interpolate(shown, [0, 1], [-4, 0])}deg)`,
          }}
        >
          {content}
        </div>
      </AbsoluteFill>
    );
  }

  return <AbsoluteFill style={{ opacity, transform, overflow: "hidden" }}>{content}</AbsoluteFill>;
};
