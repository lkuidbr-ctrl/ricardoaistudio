# SPDX-License-Identifier: GPL-3.0-or-later
"""Converte frases em fonemas (IPA) com o espeak-ng, para a voz Kokoro.

Este programa é separado do resto do Studio de propósito: ele usa o phonemizer e o
espeak-ng, que têm licença GPL-3.0, e por isso ele também é GPL-3.0 (este arquivo pode
ser copiado, modificado e redistribuído nos termos da GPL-3.0). O Studio só conversa
com ele por entrada e saída de texto, como um programa à parte.

Uso (o voz.py chama sozinho):
    echo '["Olá, tudo bem?"]' | python scripts/fonemas.py --idioma pt-br
Lê uma lista JSON de frases e devolve uma lista JSON de fonemas, na mesma ordem.
"""

import argparse
import json
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--idioma", required=True, help="código do espeak-ng: pt-br, en-us, es, fr-fr, it")
    args = parser.parse_args()

    import espeakng_loader
    import phonemizer
    from phonemizer.backend.espeak.wrapper import EspeakWrapper

    EspeakWrapper.set_library(espeakng_loader.get_library_path())
    EspeakWrapper.set_data_path(espeakng_loader.get_data_path())

    frases = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    fonemas = phonemizer.phonemize(
        [" ".join(f.split()) for f in frases], args.idioma, preserve_punctuation=True, with_stress=True, njobs=1
    )
    sys.stdout.buffer.write(json.dumps(fonemas, ensure_ascii=False).encode("utf-8"))


if __name__ == "__main__":
    main()
