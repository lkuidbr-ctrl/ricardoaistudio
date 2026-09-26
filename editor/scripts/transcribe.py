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
    transcrever(args.video, args.model, args.language, args.device)


def _escolher_dispositivo(device: str) -> str:
    if device != "auto":
        return device
    try:
        import ctranslate2

        return "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    except Exception:
        return "cpu"


def _rodar_whisper(video: Path, model_name: str, language: str, device: str) -> tuple[list[dict], str]:
    from faster_whisper import WhisperModel

    device = _escolher_dispositivo(device)
    # No processador, "int8" usa ~4x menos memória RAM que o padrão (float32) com
    # praticamente a mesma qualidade; sem isso o modelo "medium" pede ~3 GB só para ele.
    compute_type = "int8" if device == "cpu" else "default"
    print(f"(Whisper '{model_name}' no {'processador' if device == 'cpu' else 'placa de vídeo'})")
    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    segments, info = model.transcribe(
        str(video),
        language=language,
        word_timestamps=True,
        vad_filter=True,
        # Sem isso o Whisper "limpa" a fala e esconde os "éé"/"hum", que o cut.py precisa ver.
        initial_prompt="Hum, éé... então, tipo, hã, né? Ahn, é isso." if language == "pt" else None,
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
    return captions, info.language


def transcrever(video: Path, model_name: str = "small", language: str = "pt", device: str = "auto") -> Path:
    """Gera <video>.captions.json com o tempo de cada palavra e devolve o caminho."""
    try:
        captions, idioma = _rodar_whisper(video, model_name, language, device)
    except RuntimeError as e:
        # No Windows com placa NVIDIA, a GPU pode falhar por falta das bibliotecas CUDA
        # (cublas/cudnn). Nesse caso a transcrição continua na CPU, só um pouco mais lenta.
        if device != "auto" or not any(k in str(e).lower() for k in ("cuda", "cublas", "cudnn")):
            raise
        print(f"(GPU indisponível para o Whisper: {e}; usando a CPU)")
        captions, idioma = _rodar_whisper(video, model_name, language, "cpu")
    except MemoryError:
        # Pouca RAM livre: tenta de novo com um modelo menor antes de desistir.
        menor = {"large-v3": "medium", "turbo": "small", "medium": "small", "small": "base"}.get(model_name)
        if not menor:
            raise
        print(f"(Faltou memória para o modelo '{model_name}'; tentando com o '{menor}', que usa menos RAM)")
        import gc

        gc.collect()
        return transcrever(video, menor, language, device)

    out = output_path(video, ".captions.json")
    out.write_text(json.dumps(captions, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(captions)} palavras ({idioma}) -> {out}")
    return out


if __name__ == "__main__":
    main()
