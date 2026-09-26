import { createTikTokStyleCaptions } from "@remotion/captions";
import React, { useMemo } from "react";
import { Sequence, useVideoConfig } from "remotion";
import { CaptionPage, normalizeWord, type CaptionLook } from "./CaptionPage";
import type { ShortVideoProps } from "../schema";
import type { EnrichedCaption } from "../timeline";

export const Captions: React.FC<{ captions: EnrichedCaption[]; props: ShortVideoProps }> = ({ captions, props }) => {
  const { fps } = useVideoConfig();

  const pages = useMemo(
    () =>
      createTikTokStyleCaptions({
        // Fim de frase sempre troca de "página".
        captions: captions.map((c) => ({ ...c, pageBreakAfter: /[.!?…]$/.test(c.text.trim()) })),
        // No estilo "pop" cada palavra é mostrada sozinha.
        combineTokensWithinMilliseconds: props.captionStyle === "pop" ? 0 : props.wordsWindowMs,
      }).pages,
    [captions, props.captionStyle, props.wordsWindowMs],
  );

  // Os tokens de página guardam o início da palavra (fromMs = startMs), então
  // dá para achar o destaque/emoji de cada palavra por esse tempo.
  const highlightAt = useMemo(() => new Set(captions.filter((c) => c.highlight).map((c) => c.startMs)), [captions]);
  const emojiAt = useMemo(
    () => new Map(props.emojis ? captions.filter((c) => c.emoji).map((c) => [c.startMs, c.emoji!]) : []),
    [captions, props.emojis],
  );

  const look: CaptionLook = {
    style: props.captionStyle,
    color: props.captionColor,
    highlightColor: props.highlightColor,
    y: props.captionY,
    keywords: new Set(props.keywords.map(normalizeWord)),
    highlightAt,
    emojiAt,
  };

  return (
    <>
      {pages.map((page, i) => {
        const next = pages[i + 1];
        const endMs = next ? Math.min(next.startMs, page.startMs + page.durationMs + 600) : page.startMs + page.durationMs;
        const from = Math.round((page.startMs / 1000) * fps);
        const duration = Math.max(1, Math.round((endMs / 1000) * fps) - from);
        return (
          <Sequence key={i} from={from} durationInFrames={duration} layout="none">
            <CaptionPage page={page} look={look} />
          </Sequence>
        );
      })}
    </>
  );
};
