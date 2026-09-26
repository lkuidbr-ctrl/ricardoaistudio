import type { Caption } from "@remotion/captions";
import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  continueRender,
  delayRender,
  staticFile,
  useVideoConfig,
} from "remotion";
import { Captions } from "./captions/Captions";
import { AutoZoom } from "./effects/AutoZoom";
import { BehindText } from "./effects/BehindText";
import type { ShortVideoProps } from "./schema";

const useCaptions = (file: string) => {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const [handle] = useState(() => delayRender(`Carregando legendas ${file}`));

  useEffect(() => {
    if (!file) {
      setCaptions([]);
      continueRender(handle);
      return;
    }
    fetch(staticFile(file))
      .then((r) => {
        if (!r.ok) throw new Error(`Legenda não encontrada: public/${file}`);
        return r.json();
      })
      .then((data: Caption[]) => {
        setCaptions(data);
        continueRender(handle);
      })
      .catch((err) => {
        console.error(err);
        setCaptions([]);
        continueRender(handle);
      });
  }, [file, handle]);

  return captions;
};

const cover: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

// Camadas, de baixo para cima:
//   1. vídeo original
//   2. textos "atrás da pessoa"
//   3. pessoa recortada (WebM transparente gerado por scripts/segment.py)
//   4. legendas (sempre na frente)
// As camadas 1-3 ficam dentro do AutoZoom para o zoom não desalinhar o recorte.
export const ShortVideo: React.FC<ShortVideoProps> = (props) => {
  const { fps } = useVideoConfig();
  const captions = useCaptions(props.captions);

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <AutoZoom zooms={props.zooms}>
        {props.video ? <OffthreadVideo src={staticFile(props.video)} style={cover} /> : null}

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
            <OffthreadVideo src={staticFile(props.person)} transparent muted style={cover} />
          </AbsoluteFill>
        ) : null}
      </AutoZoom>

      {captions ? <Captions captions={captions} props={props} /> : null}
    </AbsoluteFill>
  );
};
