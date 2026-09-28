"""Corta silêncios e vícios de linguagem ("éé", "hã", "hum"...) usando as legendas.

Uso:
    python scripts/cut.py public/video.mp4
    python scripts/cut.py public/video.mp4 --max-silence 300 --pad 60

Precisa do public/video.captions.json (rode o transcribe.py antes).
Gera public/video.cuts.json com os trechos que FICAM. O vídeo original não é
alterado: no Studio, coloque "video.cuts.json" no campo `cuts`.
"""

import argparse
import json
import re
import unicodedata
from pathlib import Path

from _common import output_path

# Só sons que nunca são palavras de verdade. "tipo", "né" e "então" ficam de fora
# de propósito; adicione com --filler se quiser cortar também.
FILLERS = {"ah", "ahn", "aham", "eh", "ee", "ehh", "hm", "hmm", "hum", "humm", "ha", "han", "hn", "uh", "um", "uhm", "mm", "aa"}


def normalize(word: str) -> str:
    word = unicodedata.normalize("NFD", word)
    word = "".join(c for c in word if unicodedata.category(c) != "Mn")
    word = re.sub(r"[^\w]", "", word.lower())
    # "ééé", "hummm", "ããã" -> "ee", "humm", "aa"
    return re.sub(r"(.)\1{2,}", r"\1\1", word)


def video_duration_ms(video: Path) -> float | None:
    try:
        import cv2
    except ImportError:
        return None
    cap = cv2.VideoCapture(str(video))
    frames, fps = cap.get(cv2.CAP_PROP_FRAME_COUNT), cap.get(cv2.CAP_PROP_FPS)
    cap.release()
    return frames / fps * 1000 if frames and fps else None


def fala_real(video: Path) -> list[tuple[float, float]]:
    """Onde há voz de verdade no áudio (Silero VAD, que já vem com o faster-whisper).
    O Whisper costuma marcar o fim das palavras um pouco cedo; com isso o corte não come
    o finalzinho da fala."""
    try:
        from faster_whisper.audio import decode_audio
        from faster_whisper.vad import VadOptions, get_speech_timestamps
    except ImportError:
        return []
    try:
        audio = decode_audio(str(video))
    except Exception:  # vídeo sem áudio ou formato estranho: fica só com as legendas
        return []
    opcoes = VadOptions(threshold=0.4, min_silence_duration_ms=150, speech_pad_ms=30)
    return [(t["start"] / 16, t["end"] / 16) for t in get_speech_timestamps(audio, opcoes)]


def ajustar_pela_voz(inicio: float, fim: float, voz: list[tuple[float, float]]) -> tuple[float, float]:
    """Estica o trecho até onde a voz realmente começa e termina (no máximo 0,4 s antes e 0,8 s depois)."""
    for a, b in voz:
        if a <= inicio <= b:
            inicio = max(a, inicio - 400)
        if a <= fim <= b or (fim < a <= fim + 150):
            fim = min(b, fim + 800) if b > fim else fim
    return inicio, fim


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("video", type=Path)
    parser.add_argument("--max-silence", type=int, default=350, help="pausas maiores que isso (ms) são cortadas")
    parser.add_argument("--pad", type=int, default=80, help="folga (ms) antes da fala, para não comer sílabas")
    parser.add_argument("--pad-depois", type=int, default=150, help="folga (ms) depois da fala (o fim das frases cai mais)")
    parser.add_argument("--sem-vad", action="store_true", help="usa só as legendas, sem conferir a voz no áudio")
    parser.add_argument("--filler", action="append", default=[], help="palavra extra para cortar (pode repetir)")
    parser.add_argument("--keep-fillers", action="store_true", help="corta só os silêncios")
    args = parser.parse_args()

    captions_file = output_path(args.video, ".captions.json")
    if not captions_file.exists():
        raise SystemExit(f"Não achei {captions_file}. Rode antes: python scripts/transcribe.py {args.video}")
    words = json.loads(captions_file.read_text(encoding="utf-8"))
    fillers = set() if args.keep_fillers else FILLERS | {normalize(f) for f in args.filler}
    duration = video_duration_ms(args.video)

    # Agrupa palavras seguidas; um silêncio longo ou um "éé" quebra o grupo.
    groups: list[list[dict]] = []
    removed_fillers = []
    current: list[dict] = []
    for w in words:
        if normalize(w["text"]) in fillers:
            removed_fillers.append(w["text"].strip())
            if current:
                groups.append(current)
            current = []
            continue
        if current and w["startMs"] - current[-1]["endMs"] > args.max_silence:
            groups.append(current)
            current = []
        current.append(w)
    if current:
        groups.append(current)

    voz = [] if args.sem_vad else fala_real(args.video)
    if voz:
        print(f"(conferindo a voz no áudio: {len(voz)} trechos de fala)")

    keep = []
    for g in groups:
        start, end = ajustar_pela_voz(g[0]["startMs"], g[-1]["endMs"], voz)
        start = max(0, start - args.pad)
        end = end + args.pad_depois
        if duration:
            end = min(end, duration)
        if keep and start <= keep[-1]["endMs"]:
            keep[-1]["endMs"] = end  # folgas que se encostam viram um trecho só
        else:
            keep.append({"startMs": round(start), "endMs": round(end)})

    out = output_path(args.video, ".cuts.json")
    out.write_text(json.dumps({"keep": keep}, indent=1), encoding="utf-8")

    kept = sum(k["endMs"] - k["startMs"] for k in keep)
    total = duration or (words[-1]["endMs"] if words else 0)
    print(f"{len(keep)} trechos mantidos, {len(keep) - 1} cortes")
    if removed_fillers:
        print(f"vícios removidos: {', '.join(removed_fillers)}")
    if total:
        print(f"duração: {total / 1000:.1f}s -> {kept / 1000:.1f}s ({(1 - kept / total) * 100:.0f}% mais curto)")
    print(f'-> {out}   (no Studio, coloque "{out.name}" no campo cuts)')


if __name__ == "__main__":
    main()
