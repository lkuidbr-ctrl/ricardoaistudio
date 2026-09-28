"""Melhora o áudio da voz: tira o ruído de fundo (ventilador, rua, chiado), deixa a voz mais
firme e no volume certo para Reels/TikTok (-14 LUFS).

Uso:
    python scripts/audio.py public/video.mp4

Gera public/video.voz.m4a. O vídeo original não é alterado: o Studio toca o vídeo sem som e
usa este áudio no lugar (e dá para desligar na aba Áudio).
"""

import argparse
import subprocess
from pathlib import Path

from _common import ffmpeg_exe, output_path

# highpass: tira o grave de fundo (ronco, vento);  afftdn: redução de ruído constante;
# acompressor: iguala partes fortes e fracas da fala;  loudnorm: volume padrão das redes.
FILTROS = {
    "leve": "highpass=f=70,afftdn=nr=8:nf=-35:tn=1,loudnorm=I=-14:TP=-1.5:LRA=11",
    "normal": "highpass=f=80,afftdn=nr=12:nf=-30:tn=1,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,"
    "loudnorm=I=-14:TP=-1.5:LRA=9",
    "forte": "highpass=f=90,afftdn=nr=20:nf=-25:tn=1,acompressor=threshold=-22dB:ratio=4:attack=5:release=120,"
    "loudnorm=I=-14:TP=-1.5:LRA=7",
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("video", type=Path)
    parser.add_argument("--nivel", choices=sorted(FILTROS), default="normal", help="quanto de ruído tirar")
    args = parser.parse_args()

    out = output_path(args.video, ".voz.m4a")
    print(f"Limpando o áudio ({args.nivel})...")
    r = subprocess.run(
        [ffmpeg_exe(), "-y", "-hide_banner", "-loglevel", "error", "-i", str(args.video), "-vn",
         "-af", FILTROS[args.nivel], "-ar", "48000", "-c:a", "aac", "-b:a", "192k", str(out)],
    )
    if r.returncode != 0:
        raise SystemExit("Não consegui limpar o áudio (o vídeo tem som?).")
    print(f"-> {out}")


if __name__ == "__main__":
    main()
