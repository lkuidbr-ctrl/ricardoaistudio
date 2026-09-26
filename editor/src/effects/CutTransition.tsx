import React, { useId } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { CutTransition as Kind } from "../schema";
import { Glitch } from "./Glitch";

const around = (frame: number, joins: number[]) => {
  // Distância (em quadros) até a emenda mais próxima; negativo = antes dela.
  let best = Infinity;
  for (const j of joins) if (Math.abs(frame - j) < Math.abs(best)) best = frame - j;
  return best;
};

// Esconde os "pulos" dos cortes de silêncio com um efeito em cada emenda.
export const CutTransition: React.FC<{ kind: Kind; joins: number[]; children: React.ReactNode }> = ({
  kind,
  joins,
  children,
}) => {
  const frame = useCurrentFrame();
  const blurId = useId().replace(/:/g, "");
  if (kind === "none" || joins.length === 0) return <>{children}</>;

  const d = around(frame, joins);

  if (kind === "zoom") {
    // Jump cut clássico: trechos alternam entre normal e "câmera mais perto".
    const segment = joins.filter((j) => frame >= j).length;
    const scale = segment % 2 === 1 ? 1.12 : 1;
    return <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: "50% 35%" }}>{children}</AbsoluteFill>;
  }

  if (kind === "flash") {
    const opacity = interpolate(d, [-2, 0, 6], [0, 0.9, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return (
      <AbsoluteFill>
        {children}
        <AbsoluteFill style={{ backgroundColor: "white", opacity }} />
      </AbsoluteFill>
    );
  }

  if (kind === "whip") {
    // Sai rápido para a esquerda e o próximo trecho entra pela direita, com borrão de movimento.
    const x = interpolate(d, [-4, 0, 0.001, 5], [0, -420, 420, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const blur = Math.abs(x) / 8;
    // Zoom só o suficiente para o deslocamento não mostrar borda preta.
    const cover = 1 + (2 * Math.abs(x)) / 1080;
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <filter id={blurId} x="-20%" y="0" width="140%" height="100%">
            <feGaussianBlur stdDeviation={`${blur} 0`} />
          </filter>
        </svg>
        <AbsoluteFill style={{ transform: `translateX(${x}px) scale(${cover})`, filter: blur > 0.5 ? `url(#${blurId})` : undefined }}>
          {children}
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // glitch
  const intensity = interpolate(Math.abs(d), [0, 4], [1, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Glitch intensity={intensity} seed={frame}>
        {children}
      </Glitch>
    </AbsoluteFill>
  );
};
