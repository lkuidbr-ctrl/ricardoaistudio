"""Reframe automático: transforma vídeo horizontal (16:9) em vertical (9:16) seguindo o rosto.

Uso:
    python scripts/reframe.py public/gravacao.mp4
    python scripts/reframe.py public/gravacao.mp4 --suavidade 1.5 --folga 0.1

Gera public/gravacao.vertical.mp4 (1080x1920, com o áudio original). Depois use esse
arquivo nos outros scripts (transcribe, cut, segment...) como se fosse o vídeo gravado.

O "câmera" funciona como um operador humano: fica parado enquanto o rosto está perto
do centro e só se move, suave, quando a pessoa sai da zona de folga.
"""

import argparse
import subprocess
import urllib.request
from pathlib import Path

import numpy as np

from _common import ffmpeg_exe, output_path

MODELO_URL = (
    "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/"
    "models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
)
MODELO = Path(__file__).resolve().parent / "modelos" / "face_detection_yunet_2023mar.onnx"


def detector(largura: int, altura: int):
    import cv2

    if not MODELO.exists():
        # YuNet (OpenCV Zoo, licença MIT), ~230 KB, baixado uma vez só.
        print("Baixando o detector de rostos (uma vez só)...")
        MODELO.parent.mkdir(exist_ok=True)
        urllib.request.urlretrieve(MODELO_URL, MODELO)
    return cv2.FaceDetectorYN.create(str(MODELO), "", (largura, altura), score_threshold=0.7)


def detectar_centros(video: Path, passo: int) -> tuple[list[float | None], int, int, float, int]:
    """Centro x (0-1) do rosto principal a cada `passo` quadros; None quando não acha rosto."""
    import cv2

    cap = cv2.VideoCapture(str(video))
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    escala = 640 / w
    dw, dh = 640, round(h * escala)
    face = detector(dw, dh)

    centros: list[float | None] = []
    anterior = 0.5
    i = 0
    while True:
        ok = cap.grab()
        if not ok:
            break
        if i % passo == 0:
            _, frame = cap.retrieve()
            _, faces = face.detect(cv2.resize(frame, (dw, dh)))
            if faces is None or len(faces) == 0:
                centros.append(None)
            else:
                # Rosto maior e mais nítido (confiança alta; rostos desfocados no fundo têm
                # nota baixa), com preferência pelo que está perto do anterior (evita pular
                # de uma pessoa para outra a cada detecção).
                def nota(f):
                    cx = (f[0] + f[2] / 2) / dw
                    return f[2] * f[3] * f[-1] ** 4 * (1.5 - abs(cx - anterior))

                melhor = max(faces, key=nota)
                anterior = float((melhor[0] + melhor[2] / 2) / dw)
                centros.append(anterior)
            if len(centros) % 20 == 0:
                print(f"\rprocurando rostos: {i}/{total or '?'}", end="", flush=True)
        i += 1
    cap.release()
    print(f"\rprocurando rostos: {i}/{i}")
    return centros, w, h, fps, i


def caminho_da_camera(
    centros: list[float | None], passo: int, n_quadros: int, fps: float, folga: float, suavidade: float
) -> np.ndarray:
    idx = np.arange(len(centros)) * passo
    validos = [(k, c) for k, c in zip(idx, centros) if c is not None]
    if not validos:
        print("Nenhum rosto encontrado: usando o centro do vídeo.")
        return np.full(n_quadros, 0.5)
    xs, ys = zip(*validos)
    alvo = np.interp(np.arange(n_quadros), xs, ys)  # preenche onde não achou rosto

    # Zona de folga: a câmera só anda quando o rosto sai dela.
    cam = np.empty(n_quadros)
    pos = alvo[0]
    for f, x in enumerate(alvo):
        if x > pos + folga:
            pos = x - folga
        elif x < pos - folga:
            pos = x + folga
        cam[f] = pos

    # Suavização gaussiana sem atraso (janela de `suavidade` segundos).
    sigma = max(1.0, suavidade * fps / 3)
    raio = int(sigma * 3)
    kernel = np.exp(-0.5 * (np.arange(-raio, raio + 1) / sigma) ** 2)
    kernel /= kernel.sum()
    return np.convolve(np.pad(cam, raio, mode="edge"), kernel, mode="valid")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("video", type=Path)
    parser.add_argument("--folga", type=float, default=0.08, help="quanto o rosto pode andar sem a câmera mexer (0-0.3)")
    parser.add_argument("--suavidade", type=float, default=1.0, help="segundos de suavização do movimento")
    parser.add_argument("--passo", type=int, default=3, help="procura rosto a cada N quadros")
    parser.add_argument("--largura", type=int, default=1080, help="largura final (altura = largura x 16/9)")
    args = parser.parse_args()

    import cv2

    centros, w, h, fps, n = detectar_centros(args.video, args.passo)
    achados = sum(c is not None for c in centros)
    print(f"rosto encontrado em {achados}/{len(centros)} checagens")

    crop_w = min(w, round(h * 9 / 16 / 2) * 2)
    out_w, out_h = args.largura, round(args.largura * 16 / 9 / 2) * 2
    cam = caminho_da_camera(centros, args.passo, n, fps, args.folga, args.suavidade)
    esquerdas = np.clip(np.round(cam * w - crop_w / 2), 0, w - crop_w).astype(int)

    out = output_path(args.video, ".vertical.mp4")
    encoder = subprocess.Popen(
        [
            ffmpeg_exe(), "-y", "-loglevel", "error",
            "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{out_w}x{out_h}", "-r", f"{fps}", "-i", "-",
            "-i", str(args.video),
            "-map", "0:v", "-map", "1:a?",
            "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-shortest",
            str(out),
        ],
        stdin=subprocess.PIPE,
    )
    cap = cv2.VideoCapture(str(args.video))
    f = 0
    while True:
        ok, frame = cap.read()
        if not ok or f >= n:
            break
        x = esquerdas[f]
        recorte = frame[:, x : x + crop_w]
        encoder.stdin.write(cv2.resize(recorte, (out_w, out_h), interpolation=cv2.INTER_LANCZOS4).tobytes())
        f += 1
        if f % 60 == 0:
            print(f"\rrecortando: {f}/{n}", end="", flush=True)
    cap.release()
    encoder.stdin.close()
    if encoder.wait() != 0:
        raise SystemExit("ffmpeg falhou ao gerar o vídeo vertical")
    print(f"\rrecortando: {f}/{n}")
    print(f"-> {out}   (use esse arquivo nos próximos passos)")


if __name__ == "__main__":
    main()
