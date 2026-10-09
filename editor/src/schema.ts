import { zColor } from "@remotion/zod-types";
import { z } from "zod";

export const captionStyles = ["hormozi", "karaoke", "pop", "neon", "minimal"] as const;
export const behindAnimations = ["rise", "scale", "slide", "letters"] as const;
// Formato do vídeo final. O Studio usa o do vídeo gravado (deitado, em pé ou quadrado).
export const formatos = ["vertical", "horizontal", "quadrado"] as const;
export const DIMENSOES: Record<(typeof formatos)[number], { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  horizontal: { width: 1920, height: 1080 },
  quadrado: { width: 1080, height: 1080 },
};

export const cutTransitions = ["none", "zoom", "flash", "whip", "glitch", "luz", "tremor"] as const;
export const brollModes = ["full", "pip"] as const;
export const brollTransitions = ["fade", "slide", "zoom", "glitch"] as const;

export const zoomSchema = z.object({
  atMs: z.number().min(0),
  durationMs: z.number().min(100),
  scale: z.number().min(1).max(3),
});

// Correção de cor (1 = sem mudança; temperatura -1 frio .. 1 quente; sombras 0 .. 1 = abre mais).
export const corSchema = z.object({
  brilho: z.number().min(0.5).max(1.6),
  contraste: z.number().min(0.6).max(1.5),
  saturacao: z.number().min(0).max(2),
  temperatura: z.number().min(-1).max(1),
  sombras: z.number().min(0).max(1),
});

export const tiposAnimacao = [
  "seta", "circulo", "sublinhado", "check", "xis", "explosao", "coracao", "like", "fogo", "dinheiro", "confete", "brilhos",
] as const;

// Animação pronta por cima do vídeo (src/effects/Animacoes.tsx). x/y = centro, em % da tela.
export const animacaoSchema = z.object({
  tipo: z.enum(tiposAnimacao),
  startMs: z.number().min(0),
  durationMs: z.number().min(300),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  tamanho: z.number().min(0.3).max(3),
  cor: zColor(),
});

// Textos animados por cima do vídeo (src/effects/Cartelas.tsx).
//   nome: nome e cargo na parte de baixo; numero: número que conta até o valor ("R$ 10.000");
//   digitando: texto aparecendo letra por letra; notificacao: balão de notificação do celular.
export const tiposCartela = ["nome", "numero", "digitando", "notificacao"] as const;
export const cartelaSchema = z.object({
  tipo: z.enum(tiposCartela),
  texto: z.string(),
  // Linha de baixo (cargo, legenda do número, nome do app da notificação). Pode ficar vazio.
  subtexto: z.string(),
  startMs: z.number().min(0),
  durationMs: z.number().min(500),
  // Altura do centro, em % da tela.
  y: z.number().min(0).max(100),
  cor: zColor(),
});

// Efeitos de cinema num trecho do vídeo (src/effects/EfeitosTela.tsx).
export const tiposEfeitoTela = ["tremor", "luz", "vinheta", "pretoBranco"] as const;
export const efeitoTelaSchema = z.object({
  tipo: z.enum(tiposEfeitoTela),
  startMs: z.number().min(0),
  durationMs: z.number().min(200),
  // 0.2 a 2, 1 = normal.
  forca: z.number().min(0.2).max(2),
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

export const brollSchema = z.object({
  // Imagem (.jpg/.png/.webp) ou vídeo (.mp4/.webm/.mov) dentro de public/.
  src: z.string(),
  startMs: z.number().min(0),
  durationMs: z.number().min(200),
  // full = tela cheia; pip = cartão flutuante na parte de cima (a pessoa continua aparecendo).
  mode: z.enum(brollModes),
  transition: z.enum(brollTransitions),
});

export const shortVideoSchema = z.object({
  // vertical 9:16 (Reels/TikTok), horizontal 16:9 (YouTube) ou quadrado 1:1.
  formato: z.enum(formatos),
  // Arquivos dentro de public/ (ex.: "meu-video.mp4").
  video: z.string(),
  // Cópia leve do vídeo, usada só no preview (a exportação usa sempre o "video"). Vazio = sem cópia.
  preview: z.string(),
  // Gerado por scripts/transcribe.py. Deixe vazio para não ter legenda.
  captions: z.string(),
  // Gerado por scripts/segment.py. Necessário para o texto atrás da pessoa.
  person: z.string(),
  // Gerado por scripts/cut.py (silêncios e "éé" removidos). Vazio = vídeo inteiro.
  // Zooms e textos usam o tempo do vídeo JÁ cortado (o que você vê no preview).
  cuts: z.string(),
  // Arquivo da sua marca em public/ (cores, fonte, logo, @, tela final). Vazio = sem marca.
  brand: z.string(),
  // Título-gancho no começo do vídeo (o clips.py preenche sozinho). Vazio = sem título.
  hookText: z.string(),
  hookDurationMs: z.number().min(500).max(10000),
  captionStyle: z.enum(captionStyles),
  captionColor: zColor(),
  highlightColor: zColor(),
  // Posição vertical das legendas, em % da altura.
  captionY: z.number().min(0).max(100),
  // Juntar palavras que caem dentro dessa janela na mesma "página".
  wordsWindowMs: z.number().min(0).max(3000),
  // Palavras que ganham cor/destaque especial (sem acento e caixa não importam).
  // As escolhidas pelo scripts/enrich.py já vêm marcadas na legenda.
  keywords: z.array(z.string()),
  // Mostrar os emojis escolhidos pelo scripts/enrich.py.
  emojis: z.boolean(),
  // Emojis que se mexem (Noto Animated Emoji, do Google). Desligado = emojis parados.
  emojiAnimado: z.boolean(),
  zooms: z.array(zoomSchema),
  // Efeito em cada emenda do corte de silêncios (precisa do campo cuts).
  cutTransition: z.enum(cutTransitions),
  broll: z.array(brollSchema),
  // Animações prontas por cima do vídeo (tempo do vídeo editado).
  animacoes: z.array(animacaoSchema),
  // Textos animados (nome e cargo, número contando...) e efeitos de cinema (tempo do vídeo editado).
  cartelas: z.array(cartelaSchema),
  efeitosTela: z.array(efeitoTelaSchema),
  // Correção de cor do vídeo (scripts/cor.py sugere; dá para ajustar na aba Efeitos).
  cor: corSchema,
  // Áudio da voz melhorado (scripts/audio.py: sem ruído e no volume certo). Vazio = som original.
  audio: z.string(),
  // Música de fundo (mp3/wav em public/). Vazio = sem música.
  music: z.string(),
  // Onde a música começa a tocar (ms dentro da música; pula a introdução).
  musicInicioMs: z.number().min(0),
  // Zooms, animações, textos e efeitos caem na batida da música (precisa da análise do ritmo).
  noRitmo: z.boolean(),
  // A imagem dá um "pulo" leve a cada duas batidas.
  pulsoBatida: z.boolean(),
  musicVolume: z.number().min(0).max(1),
  // Volume da música enquanto você fala, como fração do normal (0.3 = 30%).
  duckTo: z.number().min(0).max(1),
  // Efeitos sonoros automáticos: whoosh nas transições e no B-roll, pop nos emojis.
  sfx: z.boolean(),
  sfxVolume: z.number().min(0).max(1),
  // Gerado por scripts/broll.py (clipes do Pexels). Soma com a lista "broll" acima.
  brollFile: z.string(),
  behindTexts: z.array(behindTextSchema),
});

export type ShortVideoProps = z.infer<typeof shortVideoSchema>;
export type BehindText = z.infer<typeof behindTextSchema>;
export type Zoom = z.infer<typeof zoomSchema>;
export type Cor = z.infer<typeof corSchema>;
export type Animacao = z.infer<typeof animacaoSchema>;
export type Cartela = z.infer<typeof cartelaSchema>;
export type EfeitoTela = z.infer<typeof efeitoTelaSchema>;
export type Broll = z.infer<typeof brollSchema>;
export type CutTransition = (typeof cutTransitions)[number];
export type Formato = (typeof formatos)[number];
export type CaptionStyle = (typeof captionStyles)[number];
