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
  if (!cor || neutra(cor)) return <>{children}</>;
  const gama = 1 - 0.4 * cor.sombras; // < 1 abre as sombras sem estourar o claro
  const ganho = { r: 1 + 0.08 * cor.temperatura, g: 1, b: 1 - 0.08 * cor.temperatura };
  const offset = 0.5 * (1 - cor.contraste);
  const canal = (g: number) => ({ type: "gamma", amplitude: cor.contraste * cor.brilho * g, exponent: gama, offset });
  return (
    <AbsoluteFill style={{ filter: `url(#${id})` }}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <filter id={id} colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR {...canal(ganho.r)} />
            <feFuncG {...canal(ganho.g)} />
            <feFuncB {...canal(ganho.b)} />
          </feComponentTransfer>
          <feColorMatrix type="saturate" values={String(cor.saturacao)} />
        </filter>
      </svg>
      {children}
    </AbsoluteFill>
  );
};
