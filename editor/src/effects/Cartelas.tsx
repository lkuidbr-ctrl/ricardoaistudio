// Textos animados por cima do vídeo: nome e cargo, número contando, texto digitando e
// notificação do celular. Ideias do pacote remotion-templates (MIT, reactvideoeditor.com),
// refeitas para o vídeo vertical e para a IA conseguir preencher.
import React from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { montserrat, poppins } from "../fonts";
import type { Cartela } from "../schema";

export const TIPOS_CARTELA: { valor: Cartela["tipo"]; nome: string }[] = [
  { valor: "nome", nome: "Nome e cargo" },
  { valor: "numero", nome: "Número contando" },
  { valor: "digitando", nome: "Texto digitando" },
  { valor: "notificacao", nome: "Notificação do celular" },
];

export const PADRAO_CARTELA: Record<Cartela["tipo"], Pick<Cartela, "texto" | "subtexto" | "y" | "cor" | "durationMs">> = {
  nome: { texto: "Seu Nome", subtexto: "Sua profissão", y: 62, cor: "#FFE600", durationMs: 3500 },
  numero: { texto: "R$ 10.000", subtexto: "por mês", y: 30, cor: "#22C55E", durationMs: 2500 },
  digitando: { texto: "Anota essa dica", subtexto: "", y: 25, cor: "#FFFFFF", durationMs: 3000 },
  notificacao: { texto: "Você recebeu um Pix de R$ 500,00", subtexto: "Banco", y: 14, cor: "#22C55E", durationMs: 3000 },
};

const SAIDA = 8; // quadros da animação de saída

// 0 -> 1 na entrada e 1 -> 0 nos últimos quadros.
const useEntradaSaida = (atraso = 0) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const entrada = spring({ frame: frame - atraso, fps, config: { damping: 14, mass: 0.6 } });
  const saida = interpolate(frame, [durationInFrames - SAIDA, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { frame, fps, entrada, saida };
};

const Nome: React.FC<{ c: Cartela }> = ({ c }) => {
  const { entrada, saida } = useEntradaSaida();
  const barra = useEntradaSaida(5).entrada;
  const texto = useEntradaSaida(12).entrada;
  return (
    <div style={{ position: "absolute", left: 60, top: `${c.y}%`, transform: `translateY(-50%) translateX(${(saida - 1) * 700}px)` }}>
      <div style={{ width: 260, height: 8, borderRadius: 4, background: c.cor, marginBottom: 10, transform: `translateX(${(entrada - 1) * 400}px)` }} />
      <div style={{ display: "flex", transform: `translateX(${(barra - 1) * 900}px)` }}>
        <div style={{ width: 12, background: c.cor, borderRadius: "6px 0 0 6px" }} />
        <div style={{ background: "rgba(0,0,0,.72)", padding: "22px 40px", borderRadius: "0 12px 12px 0", opacity: texto }}>
          <div style={{ fontFamily: montserrat, fontWeight: 900, fontSize: 66, color: "white", lineHeight: 1.05 }}>{c.texto}</div>
          {c.subtexto ? (
            <div style={{ fontFamily: poppins, fontWeight: 600, fontSize: 40, color: "rgba(255,255,255,.8)", marginTop: 6 }}>{c.subtexto}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

// "R$ 10.000,50" -> prefixo "R$ ", valor 10000.5, sufixo "", com 2 casas decimais.
const separarNumero = (texto: string) => {
  const m = texto.match(/\d[\d.,]*/);
  if (!m || m.index === undefined) return null;
  const bruto = m[0].replace(/[.,]$/, "");
  const decimal = bruto.match(/,(\d{1,2})$/);
  const casas = decimal ? decimal[1].length : 0;
  const valor = Number(bruto.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(valor)) return null;
  return { antes: texto.slice(0, m.index), valor, casas, depois: texto.slice(m.index + bruto.length) };
};

const Numero: React.FC<{ c: Cartela }> = ({ c }) => {
  const { frame, fps, entrada, saida } = useEntradaSaida();
  const n = separarNumero(c.texto);
  const progresso = interpolate(frame, [4, 4 + fps * 1.2], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const mostrado = n
    ? n.antes +
      (n.valor * progresso).toLocaleString("pt-BR", { minimumFractionDigits: n.casas, maximumFractionDigits: n.casas }) +
      n.depois
    : c.texto;
  // Um "pulo" quando chega no valor final.
  const pulo = interpolate(frame, [4 + fps * 1.2, 4 + fps * 1.35, 4 + fps * 1.55], [1, 1.12, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Número comprido fica menor para caber na largura da tela.
  const tamanho = Math.min(170, Math.floor(1350 / Math.max(1, Array.from(c.texto).length)));
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ position: "absolute", top: `${c.y}%`, transform: `translateY(-50%) scale(${entrada * saida * pulo})`, textAlign: "center" }}>
        <div
          style={{
            fontFamily: montserrat,
            fontWeight: 900,
            fontSize: tamanho,
            color: c.cor,
            lineHeight: 1,
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
            textShadow: "0 8px 30px rgba(0,0,0,.55), 4px 4px 0 #000, -4px -4px 0 #000, 4px -4px 0 #000, -4px 4px 0 #000",
          }}
        >
          {mostrado}
        </div>
        {c.subtexto ? (
          <div style={{ fontFamily: poppins, fontWeight: 800, fontSize: 56, color: "white", marginTop: 8, textShadow: "3px 3px 0 #000, -3px -3px 0 #000" }}>
            {c.subtexto}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const Digitando: React.FC<{ c: Cartela }> = ({ c }) => {
  const { frame, fps, entrada, saida } = useEntradaSaida();
  const letras = Math.floor(Math.max(0, frame - 4) * (18 / fps)); // 18 letras por segundo
  const visivel = Array.from(c.texto).slice(0, letras).join("");
  const cursor = Math.floor(frame / (fps / 2)) % 2 === 0;
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: `${c.y}%`,
          transform: `translateY(-50%) scale(${0.8 + 0.2 * entrada})`,
          opacity: entrada * saida,
          maxWidth: 940,
          background: "rgba(0,0,0,.78)",
          borderRadius: 18,
          padding: "26px 40px",
          fontFamily: "'Courier New', monospace",
          fontWeight: 700,
          fontSize: 64,
          color: c.cor,
          lineHeight: 1.2,
          textAlign: "center",
        }}
      >
        {/* O texto inteiro fica invisível por baixo para a caixa já nascer do tamanho final. */}
        <span style={{ visibility: "hidden" }}>{c.texto}</span>
        <span style={{ position: "absolute", inset: "26px 40px" }}>
          {visivel}
          <span style={{ opacity: cursor ? 1 : 0, color: "white" }}>▌</span>
        </span>
      </div>
    </AbsoluteFill>
  );
};

const Notificacao: React.FC<{ c: Cartela }> = ({ c }) => {
  const { entrada, saida } = useEntradaSaida();
  const app = c.subtexto || "Mensagem";
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: `${c.y}%`,
          transform: `translateY(calc(-50% + ${(1 - entrada) * -500 + (1 - saida) * -500}px))`,
          width: 940,
          display: "flex",
          gap: 26,
          alignItems: "center",
          background: "rgba(245,245,247,.94)",
          borderRadius: 44,
          padding: "30px 36px",
          boxShadow: "0 20px 60px rgba(0,0,0,.4)",
          fontFamily: poppins,
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            flex: "none",
            borderRadius: 24,
            background: c.cor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: 800,
            fontSize: 54,
          }}
        >
          {Array.from(app)[0]?.toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 32, color: "#6b6b70", fontWeight: 600 }}>
            <span>{app.toUpperCase()}</span>
            <span>agora</span>
          </div>
          <div style={{ fontSize: 42, color: "#111", fontWeight: 600, lineHeight: 1.2, marginTop: 4 }}>{c.texto}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const COMPONENTE: Record<Cartela["tipo"], React.FC<{ c: Cartela }>> = {
  nome: Nome,
  numero: Numero,
  digitando: Digitando,
  notificacao: Notificacao,
};

export const Cartelas: React.FC<{ itens: Cartela[] }> = ({ itens }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {itens.map((c, i) => {
        const Comp = COMPONENTE[c.tipo];
        return (
          <Sequence
            key={i}
            from={Math.round((c.startMs / 1000) * fps)}
            durationInFrames={Math.max(1, Math.round((c.durationMs / 1000) * fps))}
          >
            <Comp c={c} />
          </Sequence>
        );
      })}
    </>
  );
};
