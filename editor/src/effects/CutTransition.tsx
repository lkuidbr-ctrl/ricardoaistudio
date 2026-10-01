import React, { useId } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { CutTransition as Kind } from "../schema";
import { luzDeFilme, tremor } from "./EfeitosTela";
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
  const ativo = kind !== "none" && joins.length > 0;
  const d = ativo ? around(frame, joins) : Infinity;

  // Cada tipo só muda estilos: a estrutura é sempre a mesma. Se ela mudasse (ao trocar o tipo
  // ou em cada emenda), o vídeo e o som dentro seriam remontados e parariam de tocar no preview.
  let transform: string | undefined;
  let transformOrigin: string | undefined;
  let blur = 0;
  let flash = 0;
  let glitch = 0;
  let luz = 0;
  if (ativo && kind === "zoom") {
    // Jump cut clássico: trechos alternam entre normal e "câmera mais perto".
    const segment = joins.filter((j) => frame >= j).length;
    if (segment % 2 === 1) {
      transform = "scale(1.12)";
      transformOrigin = "50% 35%";
    }
  } else if (ativo && kind === "flash") {
    flash = interpolate(d, [-2, 0, 6], [0, 0.9, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  } else if (ativo && kind === "whip") {
    // Sai rápido para a esquerda e o próximo trecho entra pela direita, com borrão de movimento.
    const x = interpolate(d, [-4, 0, 0.001, 5], [0, -420, 420, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    blur = Math.abs(x) / 8;
    // Zoom só o suficiente para o deslocamento não mostrar borda preta.
    const cover = 1 + (2 * Math.abs(x)) / 1080;
    if (x !== 0) transform = `translateX(${x}px) scale(${cover})`;
  } else if (ativo && kind === "glitch") {
    glitch = interpolate(Math.abs(d), [0, 4], [1, 0], { extrapolateRight: "clamp" });
  } else if (ativo && kind === "luz") {
    // Clarão de luz de filme passando pela emenda.
    luz = interpolate(d, [-6, 0, 10], [0, 1.2, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  } else if (ativo && kind === "tremor") {
    // A câmera "leva um tranco" logo depois da emenda.
    const forca = interpolate(d, [0, 9], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    if (d >= 0 && forca > 0) {
      const t = tremor(d, forca);
      transform = `translate(${t.x}px, ${t.y}px) scale(${1 + (2 * Math.max(Math.abs(t.x), Math.abs(t.y))) / 1080})`;
    }
  }

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <filter id={blurId} x="-20%" y="0" width="140%" height="100%">
          <feGaussianBlur stdDeviation={`${blur} 0`} />
        </filter>
      </svg>
      <AbsoluteFill style={{ transform, transformOrigin, filter: blur > 0.5 ? `url(#${blurId})` : undefined }}>
        <Glitch intensity={glitch} seed={frame}>
          {children}
        </Glitch>
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: "white", opacity: flash, pointerEvents: "none" }} />
      <AbsoluteFill style={{ background: luzDeFilme(frame, luz), mixBlendMode: "screen", pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
