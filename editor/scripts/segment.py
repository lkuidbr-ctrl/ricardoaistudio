"""Recorta a pessoa do vídeo (fundo transparente) para o efeito "texto atrás da pessoa".

Uso:
    python scripts/segment.py public/video.mp4

Gera public/video.person.webm (VP9 com canal alfa), com o mesmo tamanho e
número de quadros do original. Usa o MODNet (licença Apache-2.0), que roda
local e grátis no processador. O modelo (~25 MB) é baixado na primeira vez.
"""

import argparse
import subprocess
from pathlib import Path

from _common import baixar_modelo, ffmpeg_exe, output_path

MODELO_URL = "https://huggingface.co/Xenova/modnet/resolve/main/onnx/model.onnx"
TAMANHO = 512  # lado menor que o modelo enxerga (o recorte volta ao tamanho original)


def tamanho_do_modelo(largura: int, altura: int) -> tuple[int, int]:
    """Lado menor em 512 e os dois múltiplos de 32, como o MODNet espera."""
    escala = TAMANHO / min(largura, altura)
    return max(32, round(largura * escala / 32) * 32), max(32, round(altura * escala / 32) * 32)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("video", type=Path)
    parser.add_argument(
        "--suavizar", type=float, default=0.25,
        help="quanto do recorte anterior entra no atual (0 a 0.9; tira o tremido da borda)",
    )
    args = parser.parse_args()
    print(f"\n-> {recortar(args)}")


def recortar(args: argparse.Namespace) -> Path:
    import cv2
    import numpy as np
    import onnxruntime as ort

    modelo = baixar_modelo(MODELO_URL, "modnet.onnx")
    sessao = ort.InferenceSession(str(modelo), providers=["CPUExecutionProvider"])
    entrada = sessao.get_inputs()[0].name

    cap = cv2.VideoCapture(str(args.video))
    if not cap.isOpened():
        raise SystemExit(f"Não consegui abrir {args.video}")
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    lm, am = tamanho_do_modelo(width, height)
    print("(recortando no processador)")

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

    suavizar = min(0.9, max(0.0, args.suavizar))
    try:
        anterior = None
        done = 0
        while True:
            ok, bgr = cap.read()
            if not ok:
                break
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            pequeno = cv2.resize(rgb, (lm, am), interpolation=cv2.INTER_AREA)
            x = (pequeno.astype(np.float32) / 127.5 - 1.0).transpose(2, 0, 1)[None]
            matte = sessao.run(None, {entrada: x})[0][0, 0]
            matte = cv2.resize(matte, (width, height), interpolation=cv2.INTER_LINEAR)
            if anterior is not None and suavizar:
                matte = matte * (1 - suavizar) + anterior * suavizar
            anterior = matte
            alpha = np.clip(matte * 255 + 0.5, 0, 255).astype(np.uint8)
            encoder.stdin.write(cv2.merge([*cv2.split(rgb), alpha]).tobytes())
            done += 1
            if done % 30 == 0 or done == total:
                print(f"\r{done}/{total or '?'} quadros", end="", flush=True)
    except BaseException:
        # Falhou no meio: fecha o ffmpeg para liberar o arquivo,
        # senão o Windows não deixa a próxima tentativa sobrescrever o .webm.
        cap.release()
        encoder.kill()
        encoder.wait()
        raise

    cap.release()
    encoder.stdin.close()
    if encoder.wait() != 0:
        raise SystemExit("ffmpeg falhou ao gerar o WebM")
    return out


if __name__ == "__main__":
    main()
