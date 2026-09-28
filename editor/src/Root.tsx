import { parseMedia } from "@remotion/media-parser";
import React from "react";
import { CalculateMetadataFunction, Composition, staticFile } from "remotion";
import { brandSchema } from "./brand";
import { ShortVideo } from "./ShortVideo";
import { shortVideoSchema, type ShortVideoProps } from "./schema";
import { buildTimeline, type CutsFile } from "./timeline";

const FPS = 30;

const exists = async (file: string) => {
  const res = await fetch(staticFile(file), { method: "HEAD" }).catch(() => null);
  return Boolean(res?.ok);
};

export const calculateMetadata: CalculateMetadataFunction<ShortVideoProps> = async ({ props }) => {
  for (const [label, file] of [
    ["video", props.video],
    ["captions", props.captions],
    ["person", props.person],
    ["cuts", props.cuts],
    ["brollFile", props.brollFile],
    ["music", props.music],
    ["audio", props.audio],
    ["brand", props.brand],
  ] as const) {
    if (file && !(await exists(file))) {
      throw new Error(
        `Arquivo "${label}" não encontrado em public/${file}. ` +
          `Coloque o arquivo lá ou deixe o campo vazio. Veja o README.`,
      );
    }
  }
  if (!props.video) return { durationInFrames: FPS * 5 };

  // A tela final da marca entra DEPOIS da fala (com o último quadro parado), sem cobrir nada.
  let finalFrames = 0;
  if (props.brand) {
    const marca = brandSchema.safeParse(await fetch(staticFile(props.brand)).then((r) => r.json()).catch(() => null));
    if (marca.success) finalFrames = Math.round((marca.data.cta.duracaoMs / 1000) * FPS);
  }

  const { durationInSeconds } = await parseMedia({
    src: staticFile(props.video),
    fields: { durationInSeconds: true },
    acknowledgeRemotionLicense: true,
  });
  const sourceFrames = Math.max(1, Math.floor((durationInSeconds ?? 5) * FPS));
  if (!props.cuts) return { durationInFrames: sourceFrames + finalFrames };

  const cuts: CutsFile = await fetch(staticFile(props.cuts)).then((r) => r.json());
  return { durationInFrames: buildTimeline(cuts.keep, FPS, sourceFrames).totalFrames + finalFrames };
};

export const defaultProps: ShortVideoProps = {
  video: "video.mp4",
  captions: "video.captions.json",
  person: "video.person.webm",
  cuts: "",
  brand: "",
  hookText: "",
  hookDurationMs: 3000,
  captionStyle: "hormozi",
  captionColor: "#FFFFFF",
  highlightColor: "#FFE600",
  captionY: 72,
  wordsWindowMs: 900,
  keywords: [],
  emojis: true,
  zooms: [{ atMs: 2000, durationMs: 1500, scale: 1.25 }],
  cutTransition: "zoom",
  broll: [],
  brollFile: "",
  music: "",
  audio: "",
  cor: { brilho: 1, contraste: 1, saturacao: 1, temperatura: 0, sombras: 0 },
  musicVolume: 0.25,
  duckTo: 0.3,
  sfx: true,
  sfxVolume: 0.5,
  behindTexts: [
    {
      text: "RICARDO",
      startMs: 0,
      durationMs: 2500,
      animation: "rise",
      color: "#FFFFFF",
      y: 28,
      fontSize: 320,
    },
  ],
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="ShortVideo"
    component={ShortVideo}
    schema={shortVideoSchema}
    defaultProps={defaultProps}
    calculateMetadata={calculateMetadata}
    fps={FPS}
    width={1080}
    height={1920}
    durationInFrames={FPS * 5}
  />
);
