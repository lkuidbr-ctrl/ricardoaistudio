import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import React, { useMemo } from "react";
import { Sequence, useVideoConfig } from "remotion";
import { CaptionPage, normalizeWord, type CaptionLook } from "./CaptionPage";
import type { ShortVideoProps } from "../schema";

export const Captions: React.FC<{ captions: Caption[]; props: ShortVideoProps }> = ({ captions, props }) => {
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

  const look: CaptionLook = {
    style: props.captionStyle,
    color: props.captionColor,
    highlightColor: props.highlightColor,
    y: props.captionY,
    keywords: new Set(props.keywords.map(normalizeWord)),
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
