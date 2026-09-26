"""Renderiza vários vídeos de uma vez, um para cada arquivo .props.json de uma pasta.

Uso:
    python scripts/render_all.py public/clips
    python scripts/render_all.py public/clips --saida out/clipes

Cada .props.json guarda só o que muda naquele vídeo (vídeo, legendas, título...);
o resto vem das configurações padrão do editor (src/Root.tsx).
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

EDITOR = Path(__file__).resolve().parent.parent


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pasta", type=Path)
    parser.add_argument("--saida", type=Path, default=EDITOR / "out")
    parser.add_argument("--extra", default="", help='argumentos extras para o "remotion render"')
    args = parser.parse_args()

    arquivos = sorted(args.pasta.glob("*.props.json"))
    if not arquivos:
        raise SystemExit(f"Nenhum .props.json em {args.pasta}")
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx:
        raise SystemExit("Não achei o npx. Instale o Node.js 20+.")
    args.saida.mkdir(parents=True, exist_ok=True)

    falhas = []
    for i, props in enumerate(arquivos, 1):
        nome = props.name.removesuffix(".props.json")
        destino = args.saida / f"{nome}.mp4"
        print(f"\n[{i}/{len(arquivos)}] {nome} -> {destino}")
        cmd = [npx, "remotion", "render", "ShortVideo", str(destino.resolve()), f"--props={props.resolve()}"]
        cmd += args.extra.split()
        if subprocess.run(cmd, cwd=EDITOR).returncode != 0:
            falhas.append(nome)

    print(f"\n{len(arquivos) - len(falhas)} de {len(arquivos)} renderizados em {args.saida}")
    if falhas:
        print("falharam: " + ", ".join(falhas))
        sys.exit(1)


if __name__ == "__main__":
    main()
