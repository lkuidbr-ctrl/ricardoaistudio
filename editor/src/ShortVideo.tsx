import type { Caption } from "@remotion/captions";
import React, { useMemo } from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { Captions } from "./captions/Captions";
import { AutoZoom } from "./effects/AutoZoom";
import { BehindText } from "./effects/BehindText";
import { CutVideo } from "./effects/CutVideo";
import type { ShortVideoProps } from "./schema";
import { buildTimeline, remapCaptions, type CutsFile } from "./timeline";
import { useJson } from "./useJson";

// Camadas, de baixo para cima:
//   1. vídeo original (só os trechos mantidos pelo corte de silêncios)
//   2. textos "atrás da pessoa"
//   3. pessoa recortada (WebM transparente gerado por scripts/segment.py)
//   4. legendas (sempre na frente)
// As camadas 1-3 ficam dentro do AutoZoom para o zoom não desalinhar o recorte.
export const ShortVideo: React.FC<ShortVideoProps> = (props) => {
  const { fps, durationInFrames } = useVideoConfig();
  const rawCaptions = useJson<Caption[]>(props.captions);
  const cuts = useJson<CutsFile>(props.cuts);

  const timeline = useMemo(
    // Com cortes, a composição já tem a duração editada; sem cortes, é o vídeo inteiro.
    () => buildTimeline(cuts?.keep ?? null, fps, cuts ? Infinity : durationInFrames),
    [cuts, fps, durationInFrames],
  );
  const captions = useMemo(
    () => (rawCaptions ? remapCaptions(rawCaptions, timeline) : null),
    [rawCaptions, timeline],
  );

  if (cuts === undefined) return null;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <AutoZoom zooms={props.zooms}>
        {props.video ? <CutVideo src={props.video} timeline={timeline} /> : null}

        {props.behindTexts.map((t, i) => (
          <Sequence
            key={i}
            from={Math.round((t.startMs / 1000) * fps)}
            durationInFrames={Math.max(1, Math.round((t.durationMs / 1000) * fps))}
          >
            <BehindText item={t} />
          </Sequence>
        ))}

        {props.person && props.behindTexts.length > 0 ? (
          <AbsoluteFill>
            <CutVideo src={props.person} timeline={timeline} transparent muted />
          </AbsoluteFill>
        ) : null}
      </AutoZoom>

      {captions ? <Captions captions={captions} props={props} /> : null}
    </AbsoluteFill>
  );
};
