"""Transcreve um vídeo com tempo por palavra (Whisper local, grátis).

Uso:
    python scripts/transcribe.py public/video.mp4
    python scripts/transcribe.py public/video.mp4 --model medium

Gera public/video.captions.json no formato Caption[] do @remotion/captions.
"""

import argparse
import json
from pathlib import Path

from _common import output_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("video", type=Path)
    parser.add_argument(
        "--model",
        default="small",
        help="tiny, base, small, medium, large-v3, turbo (maior = mais preciso e mais lento)",
    )
    parser.add_argument("--language", default="pt")
    parser.add_argument("--device", default="auto", help="auto, cpu ou cuda")
    args = parser.parse_args()

    from faster_whisper import WhisperModel

    compute_type = "int8" if args.device == "cpu" else "default"
    model = WhisperModel(args.model, device=args.device, compute_type=compute_type)
    segments, info = model.transcribe(
        str(args.video),
        language=args.language,
        word_timestamps=True,
        vad_filter=True,
        # Sem isso o Whisper "limpa" a fala e esconde os "éé"/"hum", que o cut.py precisa ver.
        initial_prompt="Hum, éé... então, tipo, hã, né? Ahn, é isso.",
    )

    captions = []
    for segment in segments:
        for word in segment.words or []:
            start_ms = round(word.start * 1000)
            end_ms = round(word.end * 1000)
            captions.append(
                {
                    # O Whisper devolve a palavra com espaço na frente (" palavra"),
                    # que é o que o createTikTokStyleCaptions espera.
                    "text": word.word,
                    "startMs": start_ms,
                    "endMs": end_ms,
                    "timestampMs": (start_ms + end_ms) // 2,
                    "confidence": round(word.probability, 3),
                }
            )
            print(f"{word.start:7.2f}s  {word.word.strip()}")

    out = output_path(args.video, ".captions.json")
    out.write_text(json.dumps(captions, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(captions)} palavras ({info.language}) -> {out}")


if __name__ == "__main__":
    main()
