"""Recorta a pessoa do vídeo (fundo transparente) para o efeito "texto atrás da pessoa".

Uso:
    python scripts/segment.py public/video.mp4

Gera public/video.person.webm (VP9 com canal alfa), com o mesmo tamanho e
número de quadros do original. Usa o Robust Video Matting (RVM), que roda
local e grátis; com placa NVIDIA (CUDA) ou Mac M1+ (MPS) fica bem mais rápido.
"""

import argparse
import subprocess
from pathlib import Path

from _common import ffmpeg_exe, output_path


def pick_device(name: str):
    import torch

    if name != "auto":
        return torch.device(name)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("video", type=Path)
    parser.add_argument("--model", default="mobilenetv3", choices=["mobilenetv3", "resnet50"])
    parser.add_argument("--device", default="auto", help="auto, cpu, cuda ou mps")
    parser.add_argument("--rvm-dir", type=Path, help="clone local do RobustVideoMatting (uso offline)")
    parser.add_argument(
        "--downsample",
        type=float,
        default=None,
        help="resolução interna do modelo (padrão: automático, ~512px no maior lado)",
    )
    args = parser.parse_args()

    import cv2
    import torch

    device = pick_device(args.device)
    if args.rvm_dir:
        model = torch.hub.load(str(args.rvm_dir), args.model, source="local")
    else:
        model = torch.hub.load(
            "PeterL1n/RobustVideoMatting:master", args.model, trust_repo=True, skip_validation=True
        )
    model = model.eval().to(device)

    cap = cv2.VideoCapture(str(args.video))
    if not cap.isOpened():
        raise SystemExit(f"Não consegui abrir {args.video}")
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    downsample = args.downsample or min(1.0, 512 / max(width, height))

    out = output_path(args.video, ".person.webm")
    encoder = subprocess.Popen(
        [
            ffmpeg_exe(), "-y", "-loglevel", "error",
            "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{width}x{height}", "-r", f"{fps}",
            "-i", "-",
            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0",
            "-crf", "32", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4",
            str(out),
        ],
        stdin=subprocess.PIPE,
    )

    rec = [None] * 4  # estado recorrente do RVM (deixa o recorte estável entre quadros)
    done = 0
    with torch.no_grad():
        while True:
            ok, bgr = cap.read()
            if not ok:
                break
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            src = torch.from_numpy(rgb).to(device).permute(2, 0, 1).float().div(255).unsqueeze(0)
            _fgr, pha, *rec = model(src, *rec, downsample_ratio=downsample)
            alpha = pha[0, 0].mul(255).round().byte().cpu().numpy()
            encoder.stdin.write(cv2.merge([*cv2.split(rgb), alpha]).tobytes())
            done += 1
            if done % 30 == 0 or done == total:
                print(f"\r{done}/{total or '?'} quadros", end="", flush=True)

    cap.release()
    encoder.stdin.close()
    if encoder.wait() != 0:
        raise SystemExit("ffmpeg falhou ao gerar o WebM")
    print(f"\n-> {out}")


if __name__ == "__main__":
    main()
