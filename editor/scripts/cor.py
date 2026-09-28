"""Correção automática de cor: analisa o vídeo e sugere brilho, contraste, saturação,
temperatura (frio/quente) e quanto clarear as sombras.

Uso:
    python scripts/cor.py public/video.mp4

Gera public/video.cor.json. O vídeo original não é alterado: o Studio aplica a correção na
hora de mostrar e de exportar (e dá para ajustar tudo na aba Efeitos > Cor).
"""

import argparse
import json
from pathlib import Path

from _common import output_path


def limitar(v: float, menor: float, maior: float) -> float:
    return round(min(maior, max(menor, v)), 2)


def analisar(video: Path, amostras: int = 24) -> dict:
    import cv2
    import numpy as np

    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise SystemExit(f"Não consegui abrir {video}")
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    quadros = []
    for i in range(amostras):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int((i + 0.5) * total / amostras))
        ok, bgr = cap.read()
        if ok:
            h, w = bgr.shape[:2]
            quadros.append(cv2.resize(bgr, (256, max(1, round(256 * h / w))), interpolation=cv2.INTER_AREA))
    cap.release()
    if not quadros:
        raise SystemExit("Não consegui ler os quadros do vídeo.")

    img = np.concatenate([q.reshape(-1, 3) for q in quadros]).astype(np.float32) / 255
    b, g, r = img[:, 0], img[:, 1], img[:, 2]
    luz = 0.2126 * r + 0.7152 * g + 0.0722 * b
    mediana = float(np.median(luz))
    p05, p95 = (float(x) for x in np.percentile(luz, [5, 95]))
    hsv = cv2.cvtColor((img.reshape(-1, 1, 3) * 255).astype(np.uint8), cv2.COLOR_BGR2HSV).reshape(-1, 3)
    saturacao_media = float(hsv[:, 1].mean() / 255)

    # Temperatura: só corrige dominantes fortes (pele e luz de casa já são naturalmente quentes).
    meio = (luz > 0.2) & (luz < 0.85)
    mr, mb = float(r[meio].mean() if meio.any() else r.mean()), float(b[meio].mean() if meio.any() else b.mean())
    puxado = (mr - mb) / max(1e-3, mr + mb)  # >0 alaranjado, <0 azulado
    if puxado > 0.3:
        temperatura = -(puxado - 0.3) * 2
    elif puxado < 0.0:
        temperatura = -puxado * 2
    else:
        temperatura = 0.0

    # Sombras com cor puxada (ex.: avermelhadas): clarear só realçaria a mancha de cor.
    escuro = (luz > 0.02) & (luz < 0.2)
    sr, sb = float(r[escuro].mean() if escuro.any() else 0), float(b[escuro].mean() if escuro.any() else 0)
    puxado_sombras = abs(sr - sb) / max(1e-3, sr + sb)
    freio_sombras = max(0.0, 1 - max(0.0, puxado_sombras - 0.15) * 3)

    diagnostico = {"mediana": round(mediana, 3), "p05": round(p05, 3), "p95": round(p95, 3),
                   "saturacao": round(saturacao_media, 3), "puxado": round(puxado, 3),
                   "puxado_sombras": round(puxado_sombras, 3)}
    print("medidas: " + ", ".join(f"{k} {v}" for k, v in diagnostico.items()))
    return {
        # Vídeo escuro clareia; estourado escurece um pouco. Na faixa boa, não mexe.
        "brilho": 1.0 if 0.38 <= mediana <= 0.6 else limitar((0.47 / max(0.05, mediana)) ** 0.6, 0.85, 1.3),
        # Vídeo escuro no geral: abre as sombras (roupa escura sozinha não conta).
        "sombras": limitar((0.36 - mediana) / 0.36 * 1.2 * freio_sombras, 0.0, 0.5),
        # Imagem "lavada" ganha contraste; imagem já dura fica como está.
        "contraste": limitar((0.72 / max(0.1, p95 - p05)) ** 0.5, 1.0, 1.2),
        # Cores apagadas ganham vida; cores já fortes ficam.
        "saturacao": limitar((0.32 / max(0.02, saturacao_media)) ** 0.5, 1.0, 1.25),
        "temperatura": limitar(temperatura, -0.5, 0.5),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("video", type=Path)
    args = parser.parse_args()
    cor = analisar(args.video)
    out = output_path(args.video, ".cor.json")
    out.write_text(json.dumps(cor, indent=1), encoding="utf-8")
    print("correção: " + ", ".join(f"{k} {v}" for k, v in cor.items()))
    print(f"-> {out}")


if __name__ == "__main__":
    main()
