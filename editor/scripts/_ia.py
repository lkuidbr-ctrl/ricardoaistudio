"""Chamadas de IA compartilhadas pelos scripts (Ollama local ou Claude)."""

import argparse
import json
import urllib.error
import urllib.request

PADRAO_OLLAMA = "qwen2.5:7b"
PADRAO_CLAUDE = "claude-opus-5"


def add_ia_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--ia", choices=["dicionario", "ollama", "claude"], default="dicionario")
    parser.add_argument(
        "--modelo", help=f"modelo do Ollama (padrão {PADRAO_OLLAMA}) ou do Claude (padrão {PADRAO_CLAUDE})"
    )


def pedir_json(args: argparse.Namespace, instrucoes: str, texto: str, schema: dict) -> dict:
    """Pede à IA escolhida (--ia ollama/claude) uma resposta JSON no formato do schema."""
    if args.ia == "ollama":
        return por_ollama(instrucoes, texto, schema, args.modelo or PADRAO_OLLAMA)
    if args.ia == "claude":
        return por_claude(instrucoes, texto, schema, args.modelo or PADRAO_CLAUDE)
    raise ValueError("o modo dicionario não usa IA")


def por_ollama(instrucoes: str, texto: str, schema: dict, modelo: str) -> dict:
    body = {
        "model": modelo,
        "stream": False,
        "format": schema,
        "options": {"temperature": 0.3},
        "messages": [{"role": "system", "content": instrucoes}, {"role": "user", "content": texto}],
    }
    req = urllib.request.Request(
        "http://localhost:11434/api/chat",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return json.loads(json.loads(r.read())["message"]["content"])
    except urllib.error.URLError as e:
        raise SystemExit(
            f"Não consegui falar com o Ollama ({e}). Instale em https://ollama.com, "
            f"rode `ollama pull {modelo}` e deixe o Ollama aberto."
        )


def por_claude(instrucoes: str, texto: str, schema: dict, modelo: str) -> dict:
    import anthropic

    # Lê a chave de ANTHROPIC_API_KEY (ou do login feito com `ant auth login`).
    client = anthropic.Anthropic()
    try:
        response = client.beta.messages.create(
            model=modelo,
            max_tokens=16000,
            system=instrucoes,
            messages=[{"role": "user", "content": texto}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
            # Se o modelo recusar o pedido, a própria API tenta de novo com o modelo reserva recomendado.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except TypeError as e:
        if "authentication" not in str(e):
            raise
        raise SystemExit("Falta a chave do Claude: defina ANTHROPIC_API_KEY (https://platform.claude.com).")
    except anthropic.AuthenticationError:
        raise SystemExit("Chave inválida. Defina ANTHROPIC_API_KEY (https://platform.claude.com).")
    except anthropic.RateLimitError:
        raise SystemExit("Limite de uso da API atingido; espere um pouco e tente de novo.")
    except anthropic.APIStatusError as e:
        raise SystemExit(f"Erro da API ({e.status_code}): {e.message}")
    except anthropic.APIConnectionError:
        raise SystemExit("Sem conexão com a API da Anthropic.")

    if response.stop_reason == "refusal":
        raise SystemExit("O Claude recusou o pedido; tente --ia dicionario.")
    if response.stop_reason == "max_tokens":
        raise SystemExit("Resposta cortada (max_tokens); tente um vídeo menor.")
    text = next(b.text for b in response.content if b.type == "text")
    u = response.usage
    print(f"(Claude: {u.input_tokens} tokens de entrada, {u.output_tokens} de saída)")
    return json.loads(text)
