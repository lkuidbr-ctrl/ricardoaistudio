import React from "react";
import { OffthreadVideo, Sequence, staticFile } from "remotion";
import type { Timeline } from "../timeline";

const cover: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

// Toca só os trechos mantidos do vídeo, um depois do outro (jump cut).
export const CutVideo: React.FC<{
  src: string;
  timeline: Timeline;
  transparent?: boolean;
  muted?: boolean;
}> = ({ src, timeline, transparent = false, muted = false }) => (
  <>
    {timeline.segments.map((s) => (
      // premountFor: no preview, cada trecho já fica carregado e na posição certa 1 s antes de
      // aparecer. Sem isso o vídeo pisca preto em cada corte enquanto carrega.
      <Sequence key={s.outFrom} from={s.outFrom} durationInFrames={s.srcTo - s.srcFrom} premountFor={30}>
        <OffthreadVideo
          src={staticFile(src)}
          trimBefore={s.srcFrom}
          trimAfter={s.srcTo}
          transparent={transparent}
          muted={muted}
          style={cover}
        />
      </Sequence>
    ))}
  </>
);
