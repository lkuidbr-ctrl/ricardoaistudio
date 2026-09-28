import React from "react";
import { AbsoluteFill } from "remotion";
import type { Cor } from "../schema";

export const COR_NEUTRA: Cor = { brilho: 1, contraste: 1, saturacao: 1, temperatura: 0, sombras: 0 };

const neutra = (c: Cor) =>
  c.brilho === 1 && c.contraste === 1 && c.saturacao === 1 && c.temperatura === 0 && c.sombras === 0;

// Correção de cor do vídeo (brilho, contraste, saturação, temperatura e sombras) com um
// filtro SVG: o mesmo filtro vale no preview e na exportação, sem mexer no arquivo original.
// Cada canal: saída = contraste·(brilho·ganho·entrada^gama − 0,5) + 0,5.
export const ComCor: React.FC<{ cor?: Cor; id: string; children: React.ReactNode }> = ({ cor, id, children }) => {
  // Mesma estrutura sempre (só o filtro liga/desliga): assim o vídeo dentro não é remontado.
  const c = cor ?? COR_NEUTRA;
  const ligado = !neutra(c);
  const gama = 1 - 0.4 * c.sombras; // < 1 abre as sombras sem estourar o claro
  const ganho = { r: 1 + 0.08 * c.temperatura, g: 1, b: 1 - 0.08 * c.temperatura };
  const offset = 0.5 * (1 - c.contraste);
  const canal = (g: number) => ({ type: "gamma", amplitude: c.contraste * c.brilho * g, exponent: gama, offset });
  return (
    <AbsoluteFill style={{ filter: ligado ? `url(#${id})` : undefined }}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <filter id={id} colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR {...canal(ganho.r)} />
            <feFuncG {...canal(ganho.g)} />
            <feFuncB {...canal(ganho.b)} />
          </feComponentTransfer>
          <feColorMatrix type="saturate" values={String(c.saturacao)} />
        </filter>
      </svg>
      {children}
    </AbsoluteFill>
  );
};
