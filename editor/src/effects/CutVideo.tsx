import React from "react";
import { lut } from "@remotion/effects/lut";
import { Video } from "@remotion/media";
import { Audio, OffthreadVideo, Sequence, staticFile } from "remotion";
import type { Timeline } from "../timeline";

const cover: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

// Toca só os trechos mantidos do vídeo, um depois do outro (jump cut).
export const CutVideo: React.FC<{
  src: string;
  timeline: Timeline;
  transparent?: boolean;
  muted?: boolean;
  // Conteúdo de um LUT .cube. Com ele, o vídeo toca pelo <Video> do @remotion/media, que aplica
  // o look na imagem; sem ele, segue pelo <OffthreadVideo> de sempre.
  lut?: string | null;
}> = ({ src, timeline, transparent = false, muted = false, lut: lutCube }) => (
  <>
    {timeline.segments.map((s) => (
      // premountFor: no preview, cada trecho já fica carregado e na posição certa 1 s antes de
      // aparecer. Sem isso o vídeo pisca preto em cada corte enquanto carrega.
      <Sequence key={s.outFrom} from={s.outFrom} durationInFrames={s.srcTo - s.srcFrom} premountFor={30}>
        {lutCube ? (
          <Video
            src={staticFile(src)}
            trimBefore={s.srcFrom}
            trimAfter={s.srcTo}
            muted={muted}
            objectFit="cover"
            style={cover}
            effects={[lut({ content: lutCube })]}
            fallbackOffthreadVideoProps={{ transparent }}
          />
        ) : (
          <OffthreadVideo
            src={staticFile(src)}
            trimBefore={s.srcFrom}
            trimAfter={s.srcTo}
            transparent={transparent}
            muted={muted}
            style={cover}
          />
        )}
      </Sequence>
    ))}
  </>
);

// Mesmo corte, só com o som (áudio melhorado da voz, no lugar do som do vídeo).
export const CutAudio: React.FC<{ src: string; timeline: Timeline }> = ({ src, timeline }) => (
  <>
    {timeline.segments.map((s) => (
      <Sequence key={s.outFrom} from={s.outFrom} durationInFrames={s.srcTo - s.srcFrom} premountFor={30}>
        <Audio src={staticFile(src)} trimBefore={s.srcFrom} trimAfter={s.srcTo} />
      </Sequence>
    ))}
  </>
);
