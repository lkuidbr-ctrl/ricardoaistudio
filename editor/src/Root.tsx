import { parseMedia } from "@remotion/media-parser";
import React from "react";
import { CalculateMetadataFunction, Composition, staticFile } from "remotion";
import { ShortVideo } from "./ShortVideo";
import { shortVideoSchema, type ShortVideoProps } from "./schema";
import { buildTimeline, type CutsFile } from "./timeline";

const FPS = 30;

const exists = async (file: string) => {
  const res = await fetch(staticFile(file), { method: "HEAD" }).catch(() => null);
  return Boolean(res?.ok);
};

const calculateMetadata: CalculateMetadataFunction<ShortVideoProps> = async ({ props }) => {
  for (const [label, file] of [
    ["video", props.video],
    ["captions", props.captions],
    ["person", props.person],
    ["cuts", props.cuts],
  ] as const) {
    if (file && !(await exists(file))) {
      throw new Error(
        `Arquivo "${label}" não encontrado em public/${file}. ` +
          `Coloque o arquivo lá ou deixe o campo vazio. Veja o README.`,
      );
    }
  }
  if (!props.video) return { durationInFrames: FPS * 5 };

  const { durationInSeconds } = await parseMedia({
    src: staticFile(props.video),
    fields: { durationInSeconds: true },
    acknowledgeRemotionLicense: true,
  });
  const sourceFrames = Math.max(1, Math.floor((durationInSeconds ?? 5) * FPS));
  if (!props.cuts) return { durationInFrames: sourceFrames };

  const cuts: CutsFile = await fetch(staticFile(props.cuts)).then((r) => r.json());
  return { durationInFrames: buildTimeline(cuts.keep, FPS, sourceFrames).totalFrames };
};

export const defaultProps: ShortVideoProps = {
  video: "video.mp4",
  captions: "video.captions.json",
  person: "video.person.webm",
  cuts: "",
  captionStyle: "hormozi",
  captionColor: "#FFFFFF",
  highlightColor: "#FFE600",
  captionY: 72,
  wordsWindowMs: 900,
  keywords: [],
  emojis: true,
  zooms: [{ atMs: 2000, durationMs: 1500, scale: 1.25 }],
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
