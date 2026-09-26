import React, { useMemo } from "react";
import { Audio, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";

export type SfxName = "whoosh" | "pop" | "glitch" | "swoosh";
export type SfxEvent = { frame: number; name: SfxName };

// Quantos quadros antes do evento o som começa (o whoosh "chega" no pico).
const LEAD: Record<SfxName, number> = { whoosh: 8, glitch: 2, pop: 0, swoosh: 2 };

export const SoundEffects: React.FC<{ events: SfxEvent[]; volume: number }> = ({ events, volume }) => {
  // Dois sons iguais quase juntos viram um só.
  const unique = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.frame - b.frame);
    return sorted.filter((e, i) => !sorted.slice(0, i).some((p) => p.name === e.name && e.frame - p.frame < 4));
  }, [events]);

  return (
    <>
      {unique.map((e, i) => (
        <Sequence key={i} from={Math.max(0, e.frame - LEAD[e.name])} durationInFrames={30} layout="none">
          <Audio src={staticFile(`sfx/${e.name}.wav`)} volume={volume} />
        </Sequence>
      ))}
    </>
  );
};

// Música de fundo em loop que abaixa sozinha enquanto você fala (ducking).
export const Music: React.FC<{
  src: string;
  volume: number;
  duckTo: number; // fração do volume durante a fala (0.3 = 30%)
  speech: { startMs: number; endMs: number }[];
}> = ({ src, volume, duckTo, speech }) => {
  const { fps, durationInFrames } = useVideoConfig();

  const curve = useMemo(() => {
    // Distância (em quadros) de cada quadro até a fala mais próxima.
    const dist = new Array<number>(durationInFrames).fill(Infinity);
    for (const s of speech) {
      const a = Math.max(0, Math.floor((s.startMs / 1000) * fps));
      const b = Math.min(durationInFrames - 1, Math.ceil((s.endMs / 1000) * fps));
      for (let f = a; f <= b; f++) dist[f] = 0;
    }
    for (let f = 1; f < durationInFrames; f++) dist[f] = Math.min(dist[f], dist[f - 1] + 1);
    for (let f = durationInFrames - 2; f >= 0; f--) dist[f] = Math.min(dist[f], dist[f + 1] + 1);

    const fadeOut = Math.min(45, Math.floor(durationInFrames / 3));
    return dist.map((d, f) => {
      // Abaixa rápido quando a fala chega e volta devagar nas pausas.
      const duck = interpolate(d, [0, 3, 12], [duckTo, duckTo, 1], { extrapolateRight: "clamp" });
      const fade = Math.min(
        interpolate(f, [0, 15], [0, 1], { extrapolateRight: "clamp" }),
        interpolate(f, [durationInFrames - fadeOut, durationInFrames - 1], [1, 0], { extrapolateLeft: "clamp" }),
      );
      return volume * duck * fade;
    });
  }, [speech, fps, durationInFrames, volume, duckTo]);

  return (
    <Audio
      src={staticFile(src)}
      loop
      loopVolumeCurveBehavior="extend"
      volume={(f) => curve[Math.min(curve.length - 1, Math.max(0, f))]}
    />
  );
};
