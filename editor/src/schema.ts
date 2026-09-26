import { zColor } from "@remotion/zod-types";
import { z } from "zod";

export const captionStyles = ["hormozi", "karaoke", "pop", "neon", "minimal"] as const;
export const behindAnimations = ["rise", "scale", "slide", "letters"] as const;

export const zoomSchema = z.object({
  atMs: z.number().min(0),
  durationMs: z.number().min(100),
  scale: z.number().min(1).max(3),
});

export const behindTextSchema = z.object({
  text: z.string(),
  startMs: z.number().min(0),
  durationMs: z.number().min(200),
  animation: z.enum(behindAnimations),
  color: zColor(),
  // Posição vertical do centro do texto, em % da altura (0 = topo).
  y: z.number().min(0).max(100),
  fontSize: z.number().min(40).max(600),
});

export const shortVideoSchema = z.object({
  // Arquivos dentro de public/ (ex.: "meu-video.mp4").
  video: z.string(),
  // Gerado por scripts/transcribe.py. Deixe vazio para não ter legenda.
  captions: z.string(),
  // Gerado por scripts/segment.py. Necessário para o texto atrás da pessoa.
  person: z.string(),
  // Gerado por scripts/cut.py (silêncios e "éé" removidos). Vazio = vídeo inteiro.
  // Zooms e textos usam o tempo do vídeo JÁ cortado (o que você vê no preview).
  cuts: z.string(),
  captionStyle: z.enum(captionStyles),
  captionColor: zColor(),
  highlightColor: zColor(),
  // Posição vertical das legendas, em % da altura.
  captionY: z.number().min(0).max(100),
  // Juntar palavras que caem dentro dessa janela na mesma "página".
  wordsWindowMs: z.number().min(0).max(3000),
  // Palavras que ganham cor/destaque especial (sem acento e caixa não importam).
  keywords: z.array(z.string()),
  zooms: z.array(zoomSchema),
  behindTexts: z.array(behindTextSchema),
});

export type ShortVideoProps = z.infer<typeof shortVideoSchema>;
export type BehindText = z.infer<typeof behindTextSchema>;
export type Zoom = z.infer<typeof zoomSchema>;
export type CaptionStyle = (typeof captionStyles)[number];
