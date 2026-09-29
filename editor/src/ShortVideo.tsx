import React, { useMemo } from "react";
import { AbsoluteFill, Freeze, getRemotionEnvironment, Sequence, useVideoConfig } from "remotion";
import { useBrand } from "./brand";
import { Captions } from "./captions/Captions";
import { BrandOverlay, EndCard } from "./effects/BrandOverlay";
import { AutoZoom } from "./effects/AutoZoom";
import { BehindText } from "./effects/BehindText";
import { Broll } from "./effects/Broll";
import { CutTransition } from "./effects/CutTransition";
import { Animacoes } from "./effects/Animacoes";
import { ComCor } from "./effects/Cor";
import { CutAudio, CutVideo } from "./effects/CutVideo";
import { HookTitle } from "./effects/HookTitle";
import { Music, SoundEffects, type SfxEvent } from "./effects/Sound";
import type { ShortVideoProps } from "./schema";
import {
  buildTimeline,
  joinsPorFrase,
  remapBroll,
  remapCaptions,
  type AutoBroll,
  type CutsFile,
  type EnrichedCaption,
} from "./timeline";
import { useJson } from "./useJson";

// Camadas, de baixo para cima:
//   1. vídeo original (só os trechos mantidos pelo corte de silêncios)
//   2. textos "atrás da pessoa"
//   3. pessoa recortada (WebM transparente gerado por scripts/segment.py)
//   4. B-roll (tela cheia ou cartão)
//   5. legendas e emojis (sempre na frente)
// As camadas 1-3 ficam dentro do AutoZoom e da transição de corte, para os efeitos
// não desalinharem o recorte da pessoa.
export const ShortVideo: React.FC<ShortVideoProps> = (props) => {
  const { fps, durationInFrames } = useVideoConfig();
  const rawCaptions = useJson<EnrichedCaption[]>(props.captions);
  const cuts = useJson<CutsFile>(props.cuts);
  const autoBroll = useJson<AutoBroll[]>(props.brollFile);
  const brand = useBrand(props.brand);
  const hookFrames = props.hookText ? Math.round((props.hookDurationMs / 1000) * fps) : 0;
  // A tela final vem depois do vídeo (a composição já tem esse tempo a mais).
  const ctaFrames = brand ? Math.min(durationInFrames - 1, Math.round((brand.cta.duracaoMs / 1000) * fps)) : 0;
  const fimDaFala = durationInFrames - ctaFrames;
  // A cor principal da marca vira a cor de destaque das legendas.
  const captionProps = useMemo(
    () => (brand ? { ...props, highlightColor: brand.corPrincipal } : props),
    [brand, props],
  );

  const timeline = useMemo(
    // Com cortes, a composição já tem a duração editada; sem cortes, é o vídeo inteiro.
    () => buildTimeline(cuts?.keep ?? null, fps, cuts ? Infinity : fimDaFala),
    [cuts, fps, fimDaFala],
  );
  const captions = useMemo(
    () => (rawCaptions ? remapCaptions(rawCaptions, timeline) : null),
    [rawCaptions, timeline],
  );
  // Emendas para as transições: as do corte de silêncios ou, sem corte, o começo das frases.
  const joins = useMemo(
    () => (timeline.joins.length ? timeline.joins : joinsPorFrase(captions ?? [], fps)),
    [timeline, captions, fps],
  );

  const broll = useMemo(
    () => [...props.broll, ...(autoBroll ? remapBroll(autoBroll, timeline) : [])],
    [props.broll, autoBroll, timeline],
  );

  const sfxEvents = useMemo(() => {
    const at = (ms: number) => Math.round((ms / 1000) * fps);
    const events: SfxEvent[] = [];
    const joinSound = { none: null, zoom: null, flash: "whoosh", whip: "whoosh", glitch: "glitch" } as const;
    const js = joinSound[props.cutTransition];
    if (js) for (const j of joins) events.push({ frame: j, name: js });
    if (props.emojis) for (const c of captions ?? []) if (c.emoji) events.push({ frame: at(c.startMs), name: "pop" });
    for (const b of broll) events.push({ frame: at(b.startMs), name: b.transition === "glitch" ? "glitch" : "whoosh" });
    for (const t of props.behindTexts) events.push({ frame: at(t.startMs), name: "swoosh" });
    for (const a of props.animacoes ?? []) events.push({ frame: at(a.startMs), name: a.tipo === "explosao" ? "whoosh" : "pop" });
    if (props.hookText) events.push({ frame: 1, name: "pop" });
    if (ctaFrames > 0) {
      events.push({ frame: durationInFrames - ctaFrames, name: "whoosh" });
      events.push({ frame: durationInFrames - ctaFrames + 38, name: "pop" }); // "clique" no seguir
    }
    return events;
  }, [fps, durationInFrames, ctaFrames, props.cutTransition, props.emojis, props.behindTexts, props.animacoes, props.hookText, joins, captions, broll]);

  // No preview usa a cópia leve (se houver); na exportação, sempre o vídeo original.
  const renderizando = getRemotionEnvironment().isRendering;
  const fonte = !renderizando && props.preview ? props.preview : props.video;
  // Som da fala. No preview ele sai sempre por <Audio> (que o player libera no primeiro clique
  // e reaproveita): um <video> com som que começa sozinho no meio (cada trecho do corte) pode
  // ser barrado pelo navegador, e aí o player silencia aquele vídeo de vez.
  const somDaFala = props.audio || (renderizando ? "" : fonte);

  if (cuts === undefined || brand === undefined) return null;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <AutoZoom zooms={props.zooms}>
        <CutTransition kind={props.cutTransition} joins={joins}>
          {props.video ? (
            <ComCor cor={props.cor} id="cor-video">
              <CutVideo src={fonte} timeline={timeline} muted={Boolean(somDaFala)} />
            </ComCor>
          ) : null}

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
              <ComCor cor={props.cor} id="cor-pessoa">
                <CutVideo src={props.person} timeline={timeline} transparent muted />
              </ComCor>
            </AbsoluteFill>
          ) : null}
        </CutTransition>
      </AutoZoom>

      {/* Depois da fala: o último quadro fica parado por baixo da tela final. */}
      {ctaFrames > 0 && props.video ? (
        <Sequence from={fimDaFala} durationInFrames={ctaFrames}>
          <Freeze frame={Math.max(0, timeline.totalFrames - 1)}>
            <ComCor cor={props.cor} id="cor-final">
              <CutVideo src={fonte} timeline={timeline} muted />
            </ComCor>
          </Freeze>
        </Sequence>
      ) : null}

      {broll.map((b, i) => (
        <Sequence
          key={i}
          from={Math.round((b.startMs / 1000) * fps)}
          durationInFrames={Math.max(1, Math.round((b.durationMs / 1000) * fps))}
        >
          <Broll item={b} />
        </Sequence>
      ))}

      {props.animacoes?.length ? <Animacoes itens={props.animacoes} /> : null}

      {captions ? <Captions captions={captions} props={captionProps} /> : null}

      {brand ? <BrandOverlay brand={brand} hideUntilFrame={hookFrames} /> : null}

      {props.hookText ? (
        <Sequence durationInFrames={hookFrames}>
          {brand ? (
            <HookTitle text={props.hookText} background={brand.corPrincipal} color={brand.corFundo} fontFamily={brand.fontFamily} />
          ) : (
            <HookTitle text={props.hookText} background="white" color="black" />
          )}
        </Sequence>
      ) : null}

      {brand && ctaFrames > 0 ? (
        <Sequence from={durationInFrames - ctaFrames} durationInFrames={ctaFrames}>
          <EndCard brand={brand} />
        </Sequence>
      ) : null}

      {/* Som da voz melhorado fica fora dos efeitos visuais (zoom, transição): nunca é remontado. */}
      {somDaFala ? <CutAudio src={somDaFala} timeline={timeline} /> : null}

      {props.music ? (
        <Music src={props.music} volume={props.musicVolume} duckTo={props.duckTo} speech={captions ?? []} />
      ) : null}
      {props.sfx ? <SoundEffects events={sfxEvents} volume={props.sfxVolume} /> : null}
    </AbsoluteFill>
  );
};
