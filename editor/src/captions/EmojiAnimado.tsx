// Emoji animado do Google (Noto Animated Emoji, licença CC BY 4.0: "Animated emoji by Google").
// O Studio baixa a animação de cada emoji usado para public/emoji-animado/<código>.json.
// Emoji sem versão animada (ou ainda não baixado) aparece parado, como antes.
import { Lottie, type LottieAnimationData } from "@remotion/lottie";
import React from "react";
import { useJson } from "../useJson";

// "🔥" -> "1f525"; "❤️" -> "2764_fe0f" (mesmo nome que o servidor usa ao baixar).
export const codigoEmoji = (emoji: string) =>
  Array.from(emoji)
    .map((c) => c.codePointAt(0)!.toString(16))
    .join("_");

type Arquivo = LottieAnimationData & { semAnimacao?: boolean };

export const EmojiAnimado: React.FC<{ emoji: string; tamanho: number; animado: boolean }> = ({ emoji, tamanho, animado }) => {
  const dados = useJson<Arquivo>(animado ? `emoji-animado/${codigoEmoji(emoji)}.json` : "");
  if (dados === undefined) return null; // carregando
  if (!dados || dados.semAnimacao) return <>{emoji}</>;
  return (
    <div style={{ width: tamanho, height: tamanho, display: "inline-block" }}>
      <Lottie animationData={dados} loop style={{ width: "100%", height: "100%" }} />
    </div>
  );
};
