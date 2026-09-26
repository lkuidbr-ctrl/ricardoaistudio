"""Voz por IA (Piper: grátis, roda no seu computador).

Narrar um roteiro (vira um vídeo 9:16 com a narração e as legendas prontas):
    python scripts/voz.py narrar public/roteiro.txt
    python scripts/voz.py narrar public/roteiro.txt --fundo public/fundo.jpg --velocidade 1.1

Dublar um vídeo seu em outro idioma (tradução pelo Claude ou Ollama):
    python scripts/voz.py dublar public/video.mp4 --idioma en
    python scripts/voz.py dublar public/video.mp4 --idioma es --ia ollama --manter-fundo 0.15

Na primeira vez, cada voz é baixada (~60 MB) para scripts/modelos/vozes/.
Vozes disponíveis: https://rhasspy.github.io/piper-samples/ (use --voz pt_BR-cadu-medium, etc.)
"""

import argparse
import json
import re
import subprocess
import wave
from pathlib import Path

import numpy as np

from _common import ffmpeg_exe, output_path
from _ia import add_ia_args, pedir_json

PASTA_VOZES = Path(__file__).resolve().parent / "modelos" / "vozes"
VOZES_PADRAO = {
    "pt": "pt_BR-faber-medium",
    "en": "en_US-ryan-medium",
    "es": "es_MX-ald-medium",
    "fr": "fr_FR-tom-medium",
    "it": "it_IT-paola-medium",
    "de": "de_DE-thorsten-medium",
}
NOMES = {"pt": "português do Brasil", "en": "inglês", "es": "espanhol", "fr": "francês", "it": "italiano", "de": "alemão"}


# ---------- voz ----------

def carregar_voz(nome: str):
    from piper import PiperVoice

    modelo = PASTA_VOZES / f"{nome}.onnx"
    if not modelo.exists():
        from piper.download_voices import download_voice

        print(f"Baixando a voz {nome} (uma vez só)...")
        PASTA_VOZES.mkdir(parents=True, exist_ok=True)
        download_voice(nome, PASTA_VOZES)
    return PiperVoice.load(str(modelo))


def falar(voz, texto: str, velocidade: float = 1.0) -> np.ndarray:
    from piper import SynthesisConfig

    cfg = SynthesisConfig(length_scale=1 / velocidade)
    partes = [c.audio_float_array for c in voz.synthesize(texto, cfg)]
    return np.concatenate(partes) if partes else np.zeros(0, np.float32)


def salvar_wav(audio: np.ndarray, taxa: int, destino: Path) -> None:
    pico = np.abs(audio).max() if len(audio) else 0
    if pico > 0.99:
        audio = audio / pico * 0.99
    with wave.open(str(destino), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(taxa)
        w.writeframes((audio * 32767).astype("<i2").tobytes())


def silencio(segundos: float, taxa: int) -> np.ndarray:
    return np.zeros(int(segundos * taxa), np.float32)


# ---------- narrar ----------

def _norm(p: str) -> str:
    import unicodedata

    p = unicodedata.normalize("NFD", p.lower())
    return re.sub(r"[^\w]", "", "".join(c for c in p if unicodedata.category(c) != "Mn"))


def alinhar_ao_roteiro(captions: list[dict], roteiro: str) -> list[dict]:
    """Usa os tempos do Whisper, mas o texto exato do roteiro (o Whisper erra nomes,
    palavras estrangeiras e escreve "cem reais" como "R$ 100")."""
    from difflib import SequenceMatcher

    palavras = roteiro.split()
    ops = SequenceMatcher(a=[_norm(c["text"]) for c in captions], b=[_norm(p) for p in palavras], autojunk=False)
    out = []
    for tag, i1, i2, j1, j2 in ops.get_opcodes():
        if tag == "equal":
            for c, p in zip(captions[i1:i2], palavras[j1:j2]):
                out.append({**c, "text": " " + p})
            continue
        if j1 == j2:
            continue  # palavra que o Whisper inventou
        # Espalha as palavras do roteiro pelo tempo das palavras do Whisper que elas substituem.
        if i1 < i2:
            ini, fim = captions[i1]["startMs"], captions[i2 - 1]["endMs"]
        else:
            ini = out[-1]["endMs"] if out else 0
            fim = captions[i1]["startMs"] if i1 < len(captions) else ini + 300 * (j2 - j1)
            fim = max(fim, ini + 150 * (j2 - j1))
        pesos = [len(p) + 2 for p in palavras[j1:j2]]
        t = ini
        for p, w in zip(palavras[j1:j2], pesos):
            d = (fim - ini) * w / sum(pesos)
            out.append({"text": " " + p, "startMs": round(t), "endMs": round(t + d),
                        "timestampMs": round(t + d / 2), "confidence": None})
            t += d
    return out


def narrar(args: argparse.Namespace) -> None:
    texto = args.roteiro.read_text(encoding="utf-8").strip()
    if not texto:
        raise SystemExit("O roteiro está vazio.")
    voz = carregar_voz(args.voz or VOZES_PADRAO[args.idioma])
    taxa = voz.config.sample_rate

    blocos = [silencio(0.3, taxa)]
    paragrafos = [p for p in re.split(r"\n\s*\n", texto) if p.strip()]
    for i, paragrafo in enumerate(paragrafos):
        frases = [f for f in re.split(r"(?<=[.!?…])\s+", " ".join(paragrafo.split())) if f]
        for frase in frases:
            print(f"  🎙  {frase}")
            blocos += [falar(voz, frase, args.velocidade), silencio(0.28, taxa)]
        if i < len(paragrafos) - 1:
            blocos.append(silencio(0.45, taxa))
    blocos.append(silencio(0.6, taxa))
    audio = np.concatenate(blocos)

    wav = output_path(args.roteiro, ".voz.wav")
    salvar_wav(audio, taxa, wav)
    duracao = len(audio) / taxa

    out = output_path(args.roteiro, ".mp4")
    escala = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p"
    if args.fundo is None:
        fundo = ["-f", "lavfi", "-i", f"gradients=s=1080x1920:c0=0x14142b:c1=0x0e3b43:c2=0x2b1437:n=3:speed=0.004:r=30:d={duracao:.2f}"]
    elif args.fundo.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
        fundo = ["-loop", "1", "-i", str(args.fundo)]
    else:
        fundo = ["-stream_loop", "-1", "-i", str(args.fundo)]
    subprocess.run(
        [ffmpeg_exe(), "-y", "-loglevel", "error", *fundo, "-i", str(wav),
         "-map", "0:v", "-map", "1:a", "-vf", escala, "-t", f"{duracao:.2f}",
         "-c:v", "libx264", "-crf", "20", "-preset", "fast", "-c:a", "aac", "-b:a", "192k", str(out)],
        check=True,
    )
    wav.unlink()
    print(f"\nnarração de {duracao:.1f}s -> {out}")
    if not args.sem_legenda:
        from transcribe import transcrever

        legendas = transcrever(out, language=args.idioma)
        alinhadas = alinhar_ao_roteiro(json.loads(legendas.read_text(encoding="utf-8")), texto)
        legendas.write_text(json.dumps(alinhadas, ensure_ascii=False, indent=1), encoding="utf-8")
        print("legendas alinhadas ao texto do roteiro:", "".join(c["text"] for c in alinhadas)[:120], "...")
    print("Dica: python scripts/broll.py", out, "--ia claude   (cobre a narração com imagens)")


# ---------- dublar ----------

INSTRUCOES_TRADUCAO = """Você traduz vídeos curtos (Reels/TikTok) para dublagem.
Traduza cada frase abaixo para {idioma}, com linguagem natural e falada, do jeito que um
criador de conteúdo nativo diria. Mantenha o tamanho parecido com o original (a dublagem
precisa caber no mesmo tempo); se precisar, encurte sem perder o sentido.
Números, nomes e marcas continuam iguais. Responda uma tradução por índice."""

SCHEMA_TRADUCAO = {
    "type": "object",
    "properties": {
        "traducoes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"indice": {"type": "integer"}, "texto": {"type": "string"}},
                "required": ["indice", "texto"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["traducoes"],
    "additionalProperties": False,
}


def duracao_video(video: Path) -> float:
    import cv2

    cap = cv2.VideoCapture(str(video))
    d = cap.get(cv2.CAP_PROP_FRAME_COUNT) / (cap.get(cv2.CAP_PROP_FPS) or 30)
    cap.release()
    return d


def dublar(args: argparse.Namespace) -> None:
    if args.ia == "dicionario":
        raise SystemExit("A dublagem precisa de IA para traduzir: use --ia claude ou --ia ollama.")
    captions_file = output_path(args.video, ".captions.json")
    if not captions_file.exists():
        raise SystemExit(f"Não achei {captions_file}. Rode antes: python scripts/transcribe.py {args.video}")

    from clips import frases

    fr = frases(json.loads(captions_file.read_text(encoding="utf-8")), pausa_ms=500)
    texto = "\n".join(f"{i}: {f['texto']}" for i, f in enumerate(fr))
    resposta = pedir_json(args, INSTRUCOES_TRADUCAO.format(idioma=NOMES[args.idioma]), texto, SCHEMA_TRADUCAO)
    traducao = {t["indice"]: t["texto"].strip() for t in resposta["traducoes"]}

    voz = carregar_voz(args.voz or VOZES_PADRAO[args.idioma])
    taxa = voz.config.sample_rate
    total = duracao_video(args.video)
    faixa = np.zeros(int((total + 1) * taxa), np.float32)

    cursor = 0.0  # fim da última fala colocada (s), para nunca sobrepor duas falas
    for i, f in enumerate(fr):
        frase = traducao.get(i)
        if not frase:
            print(f"  (sem tradução para a frase {i}, pulando)")
            continue
        inicio = max(f["startMs"] / 1000, cursor)
        fim_slot = (fr[i + 1]["startMs"] / 1000 - 0.08) if i + 1 < len(fr) else total
        espaco = max(0.3, fim_slot - inicio)

        audio = falar(voz, frase, args.velocidade)
        dur = len(audio) / taxa
        if dur > espaco:
            # Fala um pouco mais rápido para caber no tempo da frase original (até 1,4x).
            fator = min(1.4, dur / espaco)
            audio = falar(voz, frase, args.velocidade * fator)
            dur = len(audio) / taxa
            frase += f"  ({fator:.2f}x)"
        a = int(inicio * taxa)
        if a + len(audio) > len(faixa):
            faixa = np.concatenate([faixa, np.zeros(a + len(audio) - len(faixa), np.float32)])
        faixa[a : a + len(audio)] += audio
        cursor = inicio + dur + 0.05
        print(f"  {f['startMs'] / 1000:6.1f}s  {f['texto'][:40]:<40} -> {frase}")

    wav = output_path(args.video, f".{args.idioma}.wav")
    salvar_wav(faixa[: int(max(total, cursor) * taxa)], taxa, wav)

    out = output_path(args.video, f".{args.idioma}.mp4")
    if args.manter_fundo > 0:
        # Mantém o som original baixinho por baixo (música/ambiente).
        audio_args = ["-filter_complex",
                      f"[0:a]volume={args.manter_fundo}[bg];[1:a]aresample=48000[dub];[bg][dub]amix=inputs=2:normalize=0[a]",
                      "-map", "[a]"]
    else:
        audio_args = ["-map", "1:a"]
    final = max(total, cursor)
    if cursor > total + 0.05:
        # A dublagem passou do fim do vídeo: congela o último quadro até ela acabar.
        print(f"(a dublagem ficou {cursor - total:.1f}s mais longa; congelando o último quadro)")
        video_args = ["-vf", f"tpad=stop_mode=clone:stop_duration={cursor - total + 0.2:.2f}",
                      "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p"]
    else:
        video_args = ["-c:v", "copy"]
    subprocess.run(
        [ffmpeg_exe(), "-y", "-loglevel", "error", "-i", str(args.video), "-i", str(wav),
         "-map", "0:v", *audio_args, *video_args, "-c:a", "aac", "-b:a", "192k", "-t", f"{final:.3f}", str(out)],
        check=True,
    )
    wav.unlink()
    print(f"\n-> {out}")
    if not args.sem_legenda:
        from transcribe import transcrever

        transcrever(out, language=args.idioma)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="modo", required=True)

    n = sub.add_parser("narrar", help="roteiro .txt -> vídeo narrado com legendas")
    n.add_argument("roteiro", type=Path)
    n.add_argument("--fundo", type=Path, help="imagem ou vídeo de fundo (padrão: gradiente animado)")
    n.add_argument("--idioma", choices=sorted(VOZES_PADRAO), default="pt")

    d = sub.add_parser("dublar", help="vídeo -> mesmo vídeo dublado em outro idioma")
    d.add_argument("video", type=Path)
    d.add_argument("--idioma", choices=sorted(VOZES_PADRAO), required=True)
    d.add_argument("--manter-fundo", type=float, default=0.0, help="volume do áudio original por baixo (0 a 1)")
    add_ia_args(d)
    d.set_defaults(ia="claude")

    for p in (n, d):
        p.add_argument("--voz", help="nome de uma voz do Piper, ex.: pt_BR-cadu-medium")
        p.add_argument("--velocidade", type=float, default=1.0, help="1.1 = 10%% mais rápido")
        p.add_argument("--sem-legenda", action="store_true", help="não gera as legendas no final")

    args = parser.parse_args()
    narrar(args) if args.modo == "narrar" else dublar(args)


if __name__ == "__main__":
    main()
