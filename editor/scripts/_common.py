import shutil
import urllib.request
from pathlib import Path

MODELOS = Path(__file__).resolve().parent / "modelos"


def ffmpeg_exe() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def output_path(video: Path, suffix: str) -> Path:
    # public/meu-video.mp4 -> public/meu-video<suffix>
    return video.with_name(video.stem + suffix)


def baixar_modelo(url: str, nome: str) -> Path:
    """Baixa um modelo de IA para scripts/modelos na primeira vez (depois usa o que já baixou)."""
    destino = MODELOS / nome
    if destino.exists():
        return destino
    destino.parent.mkdir(parents=True, exist_ok=True)
    parcial = destino.with_suffix(destino.suffix + ".baixando")
    req = urllib.request.Request(url, headers={"User-Agent": "ricardoaistudio-editor"})
    with urllib.request.urlopen(req, timeout=60) as r, open(parcial, "wb") as f:
        total = int(r.headers.get("content-length") or 0)
        feito = 0
        while chunk := r.read(1 << 20):
            f.write(chunk)
            feito += len(chunk)
            if total:
                print(f"\rbaixando {nome}: {feito >> 20}/{total >> 20} MB", end="", flush=True)
    print()
    parcial.replace(destino)
    return destino
