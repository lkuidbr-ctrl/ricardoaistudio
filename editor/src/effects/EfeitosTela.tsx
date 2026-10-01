// Efeitos de cinema num trecho do vídeo: câmera tremendo, luz de filme (light leak), vinheta e
// preto e branco. Ideias do pacote remotion-templates (MIT, reactvideoeditor.com).
// Como no CutTransition, a estrutura é sempre a mesma e só os estilos mudam: assim o vídeo de
// dentro nunca é remontado (senão o som e a imagem param no preview).
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { EfeitoTela } from "../schema";

export const TIPOS_EFEITO_TELA: { valor: EfeitoTela["tipo"]; nome: string }[] = [
  { valor: "tremor", nome: "Câmera tremendo (impacto)" },
  { valor: "luz", nome: "Luz de filme" },
  { valor: "vinheta", nome: "Vinheta (bordas escuras)" },
  { valor: "pretoBranco", nome: "Preto e branco" },
];

export const DURACAO_EFEITO_TELA: Record<EfeitoTela["tipo"], number> = {
  tremor: 700,
  luz: 1500,
  vinheta: 2500,
  pretoBranco: 2500,
};

// Tremor que começa forte e vai acalmando (0 = parado).
export const tremor = (frame: number, intensidade: number) => ({
  x: (Math.sin(frame * 2.1) + 0.5 * Math.sin(frame * 5.3)) * 22 * intensidade,
  y: (Math.cos(frame * 1.7) + 0.5 * Math.cos(frame * 4.1)) * 16 * intensidade,
});

// Manchas de luz laranja e amarela que passeiam pela tela (como filme queimado).
export const luzDeFilme = (frame: number, intensidade: number) => {
  if (intensidade <= 0.01) return "none";
  const p = (a: number, b: number, c: number) => 50 + Math.sin(frame * a + b) * c;
  return [
    `radial-gradient(circle at ${p(0.05, 0, 35)}% ${p(0.04, 1, 25)}%, rgba(249,115,22,${0.75 * intensidade}), transparent 60%)`,
    `radial-gradient(circle at ${p(0.07, 2, 30)}% ${p(0.06, 3, 35)}%, rgba(251,191,36,${0.55 * intensidade}), transparent 50%)`,
    `radial-gradient(circle at ${p(0.03, 4, 25)}% ${p(0.08, 5, 20)}%, rgba(255,255,255,${0.35 * intensidade}), transparent 40%)`,
  ].join(", ");
};

// Força de cada tipo de efeito no quadro atual (entra e sai suave).
const useForcas = (itens: EfeitoTela[]) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f: Record<EfeitoTela["tipo"], number> = { tremor: 0, luz: 0, vinheta: 0, pretoBranco: 0 };
  let tremorDesde = 0;
  for (const e of itens) {
    const ini = (e.startMs / 1000) * fps;
    const fim = ini + Math.max(1, (e.durationMs / 1000) * fps);
    if (frame < ini || frame >= fim) continue;
    let v: number;
    if (e.tipo === "tremor") {
      v = interpolate(frame, [ini, fim], [1, 0]); // forte no começo, acalma até parar
      tremorDesde = ini;
    } else if (e.tipo === "luz") {
      v = interpolate(frame, [ini, (ini + fim) / 2, fim], [0, 1, 0]);
    } else {
      const borda = Math.min(8, (fim - ini) / 3);
      v = interpolate(frame, [ini, ini + borda, fim - borda, fim], [0, 1, 1, 0]);
    }
    f[e.tipo] = Math.max(f[e.tipo], v * e.forca);
  }
  return { frame, f, tremorDesde };
};

// Em volta do vídeo: tremor, preto e branco e o pulso na batida da música.
export const TelaComEfeitos: React.FC<{ itens: EfeitoTela[]; pulsos?: number[]; children: React.ReactNode }> = ({
  itens,
  pulsos = [],
  children,
}) => {
  const { frame, f, tremorDesde } = useForcas(itens);
  const t = tremor(frame - tremorDesde, f.tremor);
  // Zoom só o bastante para o tremor não mostrar borda preta.
  const cobre = f.tremor > 0 ? 1 + (2 * Math.max(Math.abs(t.x), Math.abs(t.y))) / 1080 : 1;
  // Pulso: aproxima 2,5% na batida e volta em ~0,2 s.
  const ultimo = pulsos.findLast((p) => p <= frame);
  const pulso = ultimo === undefined ? 1 : 1 + 0.025 * Math.exp(-(frame - ultimo) / 2.5);
  const escala = cobre * pulso;
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        transform: f.tremor > 0 || escala !== 1 ? `translate(${t.x}px, ${t.y}px) scale(${escala})` : undefined,
        filter: f.pretoBranco > 0 ? `grayscale(${Math.min(1, f.pretoBranco)}) contrast(${1 + 0.15 * Math.min(1, f.pretoBranco)})` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

// Por cima do vídeo: luz de filme e vinheta.
export const LuzesDaTela: React.FC<{ itens: EfeitoTela[] }> = ({ itens }) => {
  const { frame, f } = useForcas(itens);
  return (
    <>
      <AbsoluteFill style={{ background: luzDeFilme(frame, Math.min(1.5, f.luz)), mixBlendMode: "screen", pointerEvents: "none" }} />
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,.85) 100%)",
          opacity: Math.min(1, f.vinheta),
          pointerEvents: "none",
        }}
      />
    </>
  );
};
