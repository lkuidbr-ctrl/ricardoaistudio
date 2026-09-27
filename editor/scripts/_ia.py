"""Chamadas de IA compartilhadas pelos scripts (Ollama local ou Claude)."""

import argparse
import json
import urllib.error
import urllib.request

class IaIndisponivel(Exception):
    """A IA escolhida não pode ser usada agora (sem créditos, sem login, Ollama fechado...).

    Quem tem um modo sem IA (dicionário/heurística) usa ele e avisa; quem não tem
    (dublagem) mostra a mensagem."""


SEM_CREDITOS = (
    "a conta da API do Claude está sem créditos. A assinatura do Claude (Pro/Max) não inclui a API: "
    "adicione créditos em platform.claude.com > Billing (US$ 5 rendem centenas de vídeos) ou troque a "
    "Inteligência para \"Sem IA\" ou \"Ollama\"."
)


def avisar_sem_ia(erro: IaIndisponivel) -> None:
    # O Studio mostra linhas "AVISO:" como alerta amarelo no fim da tarefa.
    print(f"AVISO: {erro} Desta vez usei o modo sem IA.")


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
        raise IaIndisponivel(
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
        raise IaIndisponivel("Falta a chave do Claude: cole a sua chave da API em Configurações.")
    except anthropic.AuthenticationError:
        raise IaIndisponivel(
            "O Claude recusou a chave: confira a chave da API em Configurações (cole de novo e clique em Salvar e testar)."
        )
    except anthropic.RateLimitError:
        raise IaIndisponivel("O Claude atingiu o limite de uso por agora; espere um pouco e tente de novo.")
    except anthropic.APIStatusError as e:
        if "credit balance" in str(e.message).lower():
            raise IaIndisponivel(SEM_CREDITOS[0].upper() + SEM_CREDITOS[1:])
        raise IaIndisponivel(f"O Claude deu erro ({e.status_code}): {e.message}")
    except anthropic.APIConnectionError:
        raise IaIndisponivel("Sem conexão com o Claude (verifique a internet).")

    if response.stop_reason == "refusal":
        raise IaIndisponivel("O Claude recusou o pedido.")
    if response.stop_reason == "max_tokens":
        raise IaIndisponivel("A resposta do Claude veio cortada (vídeo muito longo).")
    text = next(b.text for b in response.content if b.type == "text")
    u = response.usage
    print(f"(Claude: {u.input_tokens} tokens de entrada, {u.output_tokens} de saída)")
    return json.loads(text)
