"""Testa se a IA escolhida responde (usado pelos botões "Testar" das Configurações).

    python scripts/testar_ia.py --ia deepseek
    python scripts/testar_ia.py --ia ollama

Última linha: OK (e o modelo) ou o motivo de não funcionar.
"""

import argparse
import sys

from _ia import PADRAO_DEEPSEEK, PADRAO_OLLAMA, IaIndisponivel, add_ia_args, pedir_json

SCHEMA = {
    "type": "object",
    "properties": {"resposta": {"type": "string"}},
    "required": ["resposta"],
    "additionalProperties": False,
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    add_ia_args(parser)
    args = parser.parse_args()
    try:
        r = pedir_json(args, 'Responda em JSON: {"resposta": "ok"}.', "Teste de conexão.", SCHEMA)
    except IaIndisponivel as e:
        print(f"ERRO: {e}")
        sys.exit(1)
    modelo = args.modelo or (PADRAO_DEEPSEEK if args.ia == "deepseek" else PADRAO_OLLAMA)
    print(f"OK {modelo} {r.get('resposta', '')[:20]}")


if __name__ == "__main__":
    main()
