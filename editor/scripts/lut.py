"""LUTs de cor (arquivos .cube) para dar um "look" ao vídeo.

Uso:
    python scripts/lut.py gerar                 # recria os looks prontos em public/luts/
    python scripts/lut.py gerar --forca 0.6     # mesmos looks, mais leves

Os looks prontos são feitos aqui (não precisa comprar nem baixar nada). Se você tiver um LUT
seu (.cube de 3D), basta copiar para public/luts/ e escolher em Efeitos > Cor > Look (LUT).
O vídeo original não é alterado: o Studio aplica o LUT na hora de mostrar e de exportar.
"""

import argparse
import math
from pathlib import Path

TAMANHO = 17  # 17x17x17 pontos: leve e suave o bastante para vídeo
PASTA = Path(__file__).resolve().parent.parent / "public" / "luts"


def limitar(v: float) -> float:
    return min(1.0, max(0.0, v))


def luz(r: float, g: float, b: float) -> float:
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def saturar(r: float, g: float, b: float, k: float) -> tuple:
    y = luz(r, g, b)
    return y + (r - y) * k, y + (g - y) * k, y + (b - y) * k


def curva_s(v: float, k: float) -> float:
    # k > 0 aumenta o contraste (sombras mais fundas, claros mais vivos), k < 0 suaviza
    s = 0.5 + 0.5 * math.sin(math.pi * (v - 0.5)) if v not in (0.0, 1.0) else v
    return v + (s - v) * k


def cinema(r, g, b):
    # "Teal and orange": sombras esverdeadas-azuladas, claros e pele quentes, contraste de cinema
    y = luz(r, g, b)
    r, g, b = (curva_s(c, 0.7) for c in (r, g, b))
    r, g, b = saturar(r, g, b, 1.08)
    sombra, claro = (1 - y) ** 2, y**2
    return r - 0.05 * sombra + 0.06 * claro, g + 0.01 * sombra, b + 0.06 * sombra - 0.05 * claro


def quente(r, g, b):
    # Luz de fim de tarde: mais quente, claros dourados, contraste leve
    r, g, b = (curva_s(c, 0.3) for c in (r, g, b))
    return r * 1.06 + 0.015, g * 1.01, b * 0.9


def frio(r, g, b):
    # Clima azulado e limpo, bom para tecnologia e finanças
    r, g, b = (curva_s(c, 0.35) for c in (r, g, b))
    return r * 0.92, g * 0.99 + 0.005, b * 1.07 + 0.015


def vibrante(r, g, b):
    # Cores vivas e contraste forte, para Reels e TikTok
    r, g, b = (curva_s(c, 0.55) for c in (r, g, b))
    return saturar(r, g, b, 1.3)


def suave(r, g, b):
    # Pele suave, cores um pouco apagadas e pretos levantados (visual "filme")
    r, g, b = (curva_s(c, -0.25) for c in (r, g, b))
    r, g, b = saturar(r, g, b, 0.88)
    return 0.04 + r * 0.93, 0.04 + g * 0.93, 0.045 + b * 0.94


LOOKS = {
    "cinema": (cinema, "Cinema (sombras azuladas, pele quente)"),
    "quente": (quente, "Quente (luz de fim de tarde)"),
    "frio": (frio, "Frio (azulado e limpo)"),
    "vibrante": (vibrante, "Vibrante (cores vivas, contraste forte)"),
    "suave": (suave, "Suave (visual de filme)"),
}


def escrever(nome: str, look, titulo: str, forca: float, destino: Path) -> Path:
    linhas = [f'TITLE "{titulo}"', f"LUT_3D_SIZE {TAMANHO}", "DOMAIN_MIN 0.0 0.0 0.0", "DOMAIN_MAX 1.0 1.0 1.0"]
    passo = TAMANHO - 1
    # Formato .cube: o vermelho varia mais rápido, depois o verde, depois o azul.
    for bi in range(TAMANHO):
        for gi in range(TAMANHO):
            for ri in range(TAMANHO):
                r0, g0, b0 = ri / passo, gi / passo, bi / passo
                r1, g1, b1 = (limitar(c) for c in look(r0, g0, b0))
                r, g, b = (a + (n - a) * forca for a, n in ((r0, r1), (g0, g1), (b0, b1)))
                linhas.append(f"{r:.5f} {g:.5f} {b:.5f}")
    arq = destino / f"{nome}.cube"
    arq.write_text("\n".join(linhas) + "\n", encoding="utf-8")
    return arq


def main() -> None:
    parser = argparse.ArgumentParser(description="Gera LUTs .cube prontos")
    parser.add_argument("acao", choices=["gerar"])
    parser.add_argument("--forca", type=float, default=1.0, help="0 = sem efeito, 1 = look inteiro")
    parser.add_argument("--pasta", type=Path, default=PASTA)
    args = parser.parse_args()
    args.pasta.mkdir(parents=True, exist_ok=True)
    for nome, (look, titulo) in LOOKS.items():
        print("gerado", escrever(nome, look, titulo, limitar(args.forca), args.pasta))


if __name__ == "__main__":
    main()
