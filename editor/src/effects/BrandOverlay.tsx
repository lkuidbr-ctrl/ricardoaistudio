import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Brand } from "../brand";

const corner: Record<Brand["posicao"], React.CSSProperties> = {
  "topo-esquerda": { top: 70, left: 50 },
  "topo-direita": { top: 70, right: 50 },
  "baixo-esquerda": { bottom: 110, left: 50 },
  "baixo-direita": { bottom: 110, right: 50 },
};

// Marca d'água discreta + barra de progresso no topo (as pessoas assistem até o fim
// quando veem quanto falta).
export const BrandOverlay: React.FC<{ brand: Brand; hideUntilFrame: number }> = ({ brand, hideUntilFrame }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = frame / Math.max(1, durationInFrames - 1);
  const markOpacity = interpolate(frame, [hideUntilFrame, hideUntilFrame + 10], [0, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const usaLogo = brand.marcaDagua === "logo" && brand.logo;
  const usaArroba = brand.marcaDagua === "arroba" || (brand.marcaDagua === "logo" && !brand.logo);

  return (
    <AbsoluteFill>
      {brand.barraProgresso ? (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 12, background: "rgba(255,255,255,0.25)" }}>
          <div style={{ width: `${progress * 100}%`, height: "100%", background: brand.corPrincipal }} />
        </div>
      ) : null}

      {usaLogo ? (
        <Img
          src={staticFile(brand.logo)}
          style={{ position: "absolute", ...corner[brand.posicao], height: 110, opacity: markOpacity, objectFit: "contain" }}
        />
      ) : null}
      {usaArroba && brand.arroba ? (
        <div
          style={{
            position: "absolute",
            ...corner[brand.posicao],
            fontFamily: brand.fontFamily,
            fontWeight: 800,
            fontSize: 40,
            color: brand.corTexto,
            opacity: markOpacity * 0.9,
            textShadow: "0 2px 10px rgba(0,0,0,0.6)",
          }}
        >
          {brand.arroba}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// Card final "Segue pra mais" com botão pulsando. Fica dentro de uma <Sequence> no fim do vídeo.
export const EndCard: React.FC<{ brand: Brand }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14 } });
  const button = spring({ frame: frame - 10, fps, config: { damping: 8, stiffness: 180 } });
  const pulse = 1 + Math.max(0, Math.sin((frame - 20) / 5)) * 0.06 * (frame > 20 ? 1 : 0);
  const clicked = frame > 38; // o "clique" no botão de seguir

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <AbsoluteFill style={{ background: "linear-gradient(transparent 35%, rgba(0,0,0,0.75))", opacity: enter }} />
      <div
        style={{
          marginBottom: 330,
          width: 860,
          padding: "46px 40px",
          borderRadius: 48,
          background: brand.corFundo,
          border: `5px solid ${brand.corPrincipal}`,
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 26,
          fontFamily: brand.fontFamily,
          transform: `translateY(${interpolate(enter, [0, 1], [700, 0])}px)`,
        }}
      >
        {brand.logo ? (
          <Img
            src={staticFile(brand.logo)}
            style={{ width: 170, height: 170, borderRadius: "50%", objectFit: "cover", border: `5px solid ${brand.corPrincipal}` }}
          />
        ) : null}
        {brand.arroba ? (
          <div style={{ color: brand.corTexto, fontSize: 58, fontWeight: 900 }}>{brand.arroba}</div>
        ) : null}
        <div style={{ color: brand.corTexto, fontSize: 48, fontWeight: 700, opacity: 0.9, textAlign: "center" }}>
          {brand.cta.texto}
        </div>
        <div
          style={{
            marginTop: 8,
            padding: "22px 70px",
            borderRadius: 999,
            fontSize: 50,
            fontWeight: 900,
            textTransform: "uppercase",
            background: clicked ? "transparent" : brand.corPrincipal,
            color: clicked ? brand.corPrincipal : brand.corFundo,
            border: `5px solid ${brand.corPrincipal}`,
            transform: `scale(${button * (clicked ? 1 : pulse)})`,
          }}
        >
          {clicked ? "✓ " : "+ "}
          {brand.cta.botao}
        </div>
      </div>
    </AbsoluteFill>
  );
};
