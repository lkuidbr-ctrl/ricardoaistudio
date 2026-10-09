// Animações prontas por cima do vídeo (setas, círculo, check, coração...). Todas desenhadas aqui,
// em SVG e CSS: nada de arquivo de terceiros, então dá para vender sem problema de licença.
import React from "react";
import { AbsoluteFill, interpolate, random, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Animacao } from "../schema";

type P = { cor: string; duracao: number };

// Traço que se desenha sozinho (strokeDashoffset de 1 a 0 com pathLength=1).
const desenho = (frame: number, inicio = 0, dur = 12) =>
  interpolate(frame, [inicio, inicio + dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

const Seta: React.FC<P> = ({ cor }) => {
  const frame = useCurrentFrame();
  const vai = Math.sin(frame / 4) * 14 * (frame > 12 ? 1 : 0);
  return (
    <svg width="260" height="300" viewBox="0 0 260 300" style={{ overflow: "visible", transform: `translateY(${vai}px)` }}>
      <path d="M40 20 C 140 30, 190 110, 150 250" pathLength={1} strokeDasharray={1} strokeDashoffset={desenho(frame)}
        fill="none" stroke={cor} strokeWidth={22} strokeLinecap="round" />
      <path d="M85 205 L150 262 L205 190" pathLength={1} strokeDasharray={1} strokeDashoffset={desenho(frame, 9, 7)}
        fill="none" stroke={cor} strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const Circulo: React.FC<P> = ({ cor }) => {
  const frame = useCurrentFrame();
  return (
    <svg width="520" height="300" viewBox="0 0 520 300" style={{ overflow: "visible" }}>
      <path d="M270 25 C 120 15, 20 70, 30 150 C 42 245, 250 290, 420 250 C 520 225, 520 90, 400 45 C 330 20, 230 25, 190 40"
        pathLength={1} strokeDasharray={1} strokeDashoffset={desenho(frame, 0, 16)}
        fill="none" stroke={cor} strokeWidth={14} strokeLinecap="round" />
    </svg>
  );
};

const Sublinhado: React.FC<P> = ({ cor }) => {
  const frame = useCurrentFrame();
  return (
    <svg width="560" height="90" viewBox="0 0 560 90" style={{ overflow: "visible" }}>
      <path d="M15 50 C 90 20, 150 75, 230 45 S 380 20, 450 48 S 530 60, 545 40" pathLength={1} strokeDasharray={1}
        strokeDashoffset={desenho(frame, 0, 12)} fill="none" stroke={cor} strokeWidth={18} strokeLinecap="round" />
    </svg>
  );
};

const Check: React.FC<P> = ({ cor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 9, stiffness: 160 } });
  return (
    <svg width="260" height="260" viewBox="0 0 260 260" style={{ transform: `scale(${s})` }}>
      <circle cx="130" cy="130" r="118" fill={cor} />
      <path d="M72 135 L115 178 L192 92" pathLength={1} strokeDasharray={1} strokeDashoffset={desenho(frame, 6, 9)}
        fill="none" stroke="white" strokeWidth={26} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const Xis: React.FC<P> = ({ cor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 9, stiffness: 160 } });
  const treme = frame < 20 ? Math.sin(frame * 2.2) * 6 : 0;
  return (
    <svg width="260" height="260" viewBox="0 0 260 260" style={{ transform: `scale(${s}) rotate(${treme}deg)` }}>
      <circle cx="130" cy="130" r="118" fill={cor} />
      <path d="M85 85 L175 175" pathLength={1} strokeDasharray={1} strokeDashoffset={desenho(frame, 5, 6)}
        stroke="white" strokeWidth={28} strokeLinecap="round" />
      <path d="M175 85 L85 175" pathLength={1} strokeDasharray={1} strokeDashoffset={desenho(frame, 10, 6)}
        stroke="white" strokeWidth={28} strokeLinecap="round" />
    </svg>
  );
};

const Explosao: React.FC<P> = ({ cor }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  const some = interpolate(frame, [10, 22], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <svg width="440" height="440" viewBox="-220 -220 440 440" style={{ overflow: "visible", opacity: some }}>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const r1 = 60 + 90 * t;
        const r2 = r1 + 70 * (1 - t) + 20;
        return (
          <line key={i} x1={Math.cos(a) * r1} y1={Math.sin(a) * r1} x2={Math.cos(a) * r2} y2={Math.sin(a) * r2}
            stroke={cor} strokeWidth={i % 2 ? 12 : 20} strokeLinecap="round" />
        );
      })}
    </svg>
  );
};

const CORACAO = "M130 230 C 40 170, 0 110, 30 60 C 60 10, 120 20, 130 70 C 140 20, 200 10, 230 60 C 260 110, 220 170, 130 230 Z";

const Coracao: React.FC<P> = ({ cor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 7, stiffness: 180 } });
  const bate = 1 + Math.max(0, Math.sin(frame / 3.2)) * 0.08;
  return (
    <div style={{ position: "relative" }}>
      <svg width="260" height="250" viewBox="0 0 260 250" style={{ transform: `scale(${s * bate})` }}>
        <path d={CORACAO} fill={cor} />
      </svg>
      {[0, 1, 2].map((i) => {
        const f = frame - 8 - i * 6;
        const sobe = interpolate(f, [0, 30], [0, -260], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const op = interpolate(f, [0, 5, 25, 30], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <svg key={i} width="80" height="76" viewBox="0 0 260 250"
            style={{ position: "absolute", left: 20 + i * 80, top: 60, opacity: op, transform: `translateY(${sobe}px)` }}>
            <path d={CORACAO} fill={cor} />
          </svg>
        );
      })}
    </div>
  );
};

const Emoji: React.FC<P & { emoji: string }> = ({ emoji }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 8, stiffness: 170 } });
  const gira = interpolate(s, [0, 1], [-35, 0]);
  return (
    <div style={{ fontSize: 240, lineHeight: 1, transform: `scale(${s}) rotate(${gira}deg)`, filter: "drop-shadow(0 12px 18px rgba(0,0,0,.45))" }}>
      {emoji}
    </div>
  );
};

// Várias coisas caindo/voando pela tela inteira (dinheiro, confete).
const Chuva: React.FC<P & { tipo: "dinheiro" | "confete" }> = ({ tipo, cor, duracao }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const n = tipo === "dinheiro" ? 16 : 46;
  const cores = [cor, "#FFE600", "#00E5A0", "#FF4D6D", "#4DA3FF", "#FFFFFF"];
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {Array.from({ length: n }, (_, i) => {
        const x = random(`x${i}`) * width;
        const atraso = random(`a${i}`) * 12;
        const velocidade = 22 + random(`v${i}`) * 20;
        const y = -150 + (frame - atraso) * velocidade;
        const giro = (frame - atraso) * (random(`g${i}`) * 16 - 8);
        const op = interpolate(frame, [duracao - 10, duracao], [1, 0], { extrapolateLeft: "clamp" });
        if (frame < atraso) return null;
        return tipo === "dinheiro" ? (
          <div key={i} style={{ position: "absolute", left: x, top: y, fontSize: 110, opacity: op, transform: `rotate(${giro}deg)` }}>
            {i % 3 === 0 ? "💸" : "💵"}
          </div>
        ) : (
          <div key={i} style={{ position: "absolute", left: x, top: y, width: 26, height: 44, borderRadius: 5, opacity: op,
            background: cores[i % cores.length], transform: `rotate(${giro}deg)` }} />
        );
      })}
    </AbsoluteFill>
  );
};

const Brilhos: React.FC<P> = ({ cor }) => {
  const frame = useCurrentFrame();
  return (
    <svg width="420" height="420" viewBox="-210 -210 420 420" style={{ overflow: "visible" }}>
      {Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2 + 0.4;
        const r = 110 + (i % 3) * 45;
        const pulso = Math.max(0, Math.sin((frame - i * 3) / 4));
        const t = (18 + (i % 2) * 14) * pulso;
        const cx = Math.cos(a) * r;
        const cy = Math.sin(a) * r;
        return (
          <path key={i} fill={cor}
            d={`M${cx} ${cy - t} Q${cx} ${cy} ${cx + t} ${cy} Q${cx} ${cy} ${cx} ${cy + t} Q${cx} ${cy} ${cx - t} ${cy} Q${cx} ${cy} ${cx} ${cy - t}Z`} />
        );
      })}
    </svg>
  );
};

export const TIPOS_ANIMACAO: { valor: Animacao["tipo"]; nome: string }[] = [
  { valor: "seta", nome: "Seta apontando" },
  { valor: "circulo", nome: "Círculo desenhado" },
  { valor: "sublinhado", nome: "Sublinhado" },
  { valor: "check", nome: "Check (certo)" },
  { valor: "xis", nome: "X (errado)" },
  { valor: "explosao", nome: "Explosão" },
  { valor: "coracao", nome: "Coração" },
  { valor: "like", nome: "Curtir 👍" },
  { valor: "fogo", nome: "Fogo 🔥" },
  { valor: "dinheiro", nome: "Chuva de dinheiro" },
  { valor: "confete", nome: "Confete" },
  { valor: "brilhos", nome: "Brilhos" },
];

// Cor padrão de cada animação (a marca troca a cor principal).
export const COR_ANIMACAO: Record<Animacao["tipo"], string> = {
  seta: "#FFE600", circulo: "#FF3B30", sublinhado: "#FFE600", check: "#22C55E", xis: "#EF4444", explosao: "#FFE600",
  coracao: "#FF3B5C", like: "#FFFFFF", fogo: "#FFFFFF", dinheiro: "#22C55E", confete: "#FFE600", brilhos: "#FFF6A8",
};

const UmaAnimacao: React.FC<{ a: Animacao; duracao: number }> = ({ a, duracao }) => {
  const frame = useCurrentFrame();
  const some = interpolate(frame, [duracao - 8, duracao], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (a.tipo === "dinheiro" || a.tipo === "confete") return <Chuva tipo={a.tipo} cor={a.cor} duracao={duracao} />;
  const p = { cor: a.cor, duracao };
  const corpo = {
    seta: <Seta {...p} />, circulo: <Circulo {...p} />, sublinhado: <Sublinhado {...p} />, check: <Check {...p} />,
    xis: <Xis {...p} />, explosao: <Explosao {...p} />, coracao: <Coracao {...p} />, brilhos: <Brilhos {...p} />,
    like: <Emoji {...p} emoji="👍" />, fogo: <Emoji {...p} emoji="🔥" />,
  }[a.tipo];
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: `${a.x}%`, top: `${a.y}%`, opacity: some,
        transform: `translate(-50%, -50%) scale(${a.tamanho})` }}>
        {corpo}
      </div>
    </AbsoluteFill>
  );
};

export const Animacoes: React.FC<{ itens: Animacao[] }> = ({ itens }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {itens.map((a, i) => {
        const duracao = Math.max(8, Math.round((a.durationMs / 1000) * fps));
        return (
          <Sequence key={i} from={Math.round((a.startMs / 1000) * fps)} durationInFrames={duracao}>
            <UmaAnimacao a={a} duracao={duracao} />
          </Sequence>
        );
      })}
    </>
  );
};
