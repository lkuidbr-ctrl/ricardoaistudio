"""Chamadas de IA compartilhadas pelos scripts (Ollama local ou Claude)."""

import argparse
import json
import urllib.error
import urllib.request

PADRAO_OLLAMA = "qwen2.5:7b"
PADRAO_CLAUDE = "claude-opus-5"


def add_ia_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--ia",
        choices=["claude", "ollama", "dicionario"],
        default="claude",
        help="claude (padrão; login com `ant auth login`), ollama (local, grátis) ou dicionario (sem IA, grátis)",
    )
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

    # Sem chave no código: o SDK usa o login OAuth do `ant auth login` (e renova o token
    # sozinho). Se ANTHROPIC_API_KEY estiver definida, ela tem prioridade sobre o login.
    try:
        client = anthropic.Anthropic()
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
    except (TypeError, anthropic.CredentialsError) as e:
        if isinstance(e, TypeError) and "authentication" not in str(e):
            raise
        raise SystemExit(
            "Você não está logado no Claude. Rode `ant auth login` (veja o README) "
            "ou use --ia dicionario / --ia ollama."
        )
    except anthropic.AuthenticationError:
        raise SystemExit(
            "O Claude recusou o login. Rode `ant auth login` de novo (o login expira de tempos em tempos). "
            "Se você tiver ANTHROPIC_API_KEY definida, ela passa na frente do login: apague-a."
        )
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
