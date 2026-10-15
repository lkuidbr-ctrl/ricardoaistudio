"""Chamadas de IA compartilhadas pelos scripts (Ollama local ou Claude)."""

import argparse
import json
import logging
import os
import urllib.error
import urllib.request

# O SDK avisa que a ANTHROPIC_API_KEY tem prioridade sobre o login automático: no Studio a
# chave é sempre a das Configurações, então o aviso só confunde quem lê os detalhes.
logging.getLogger("anthropic.lib.credentials._auth").setLevel(logging.ERROR)

class IaIndisponivel(Exception):
    """A IA escolhida não pode ser usada agora (sem créditos, sem login, Ollama fechado...).

    Quem tem um modo sem IA (dicionário/heurística) usa ele e avisa; quem não tem
    (dublagem) mostra a mensagem."""


SEM_CREDITOS = (
    "a conta da API do Claude está sem créditos. A assinatura do Claude (Pro/Max) não inclui a API: "
    "adicione créditos em platform.claude.com > Billing (US$ 5 rendem centenas de vídeos) ou troque a "
    "Inteligência para \"Sem IA\" ou \"Ollama\"."
)
SEM_WORKSPACE = (
    "Esta chave do Claude pede o ID do workspace. Em Configurações, clique em Salvar e testar "
    "(o Studio tenta achar sozinho) ou cole o ID do workspace (começa com wrkspc_, fica em "
    "platform.claude.com > Settings > Workspaces)."
)


def avisar_sem_ia(erro: IaIndisponivel) -> None:
    # O Studio mostra linhas "AVISO:" como alerta amarelo no fim da tarefa.
    print(f"AVISO: {erro} Desta vez usei o modo sem IA.")


# Qwen3 (Alibaba): grátis, roda no computador; o 8B cabe em 16 GB de memória.
PADRAO_OLLAMA = "qwen3:8b"
RESERVA_OLLAMA = "qwen2.5:7b"  # o modelo antigo do Studio, se o novo ainda não foi baixado
# DeepSeek (China): pela internet, quase de graça (centavos por vídeo).
PADRAO_DEEPSEEK = "deepseek-flash"
PADRAO_CLAUDE = "claude-opus-5"


def add_ia_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--ia",
        choices=["claude", "deepseek", "ollama", "dicionario"],
        default="claude",
        help="claude (padrão), deepseek (pela internet, quase grátis; chave em DEEPSEEK_API_KEY), "
             "ollama (local, grátis) ou dicionario (sem IA, grátis)",
    )
    parser.add_argument(
        "--modelo", help=f"modelo do Ollama (padrão {PADRAO_OLLAMA}), do DeepSeek (padrão {PADRAO_DEEPSEEK}) "
                         f"ou do Claude (padrão {PADRAO_CLAUDE})"
    )


def pedir_json(args: argparse.Namespace, instrucoes: str, texto: str, schema: dict) -> dict:
    """Pede à IA escolhida (--ia ollama/claude) uma resposta JSON no formato do schema."""
    if args.ia == "ollama":
        return por_ollama(instrucoes, texto, schema, args.modelo or PADRAO_OLLAMA)
    if args.ia == "deepseek":
        return por_deepseek(instrucoes, texto, schema, args.modelo or PADRAO_DEEPSEEK)
    if args.ia == "claude":
        return por_claude(instrucoes, texto, schema, args.modelo or PADRAO_CLAUDE)
    raise ValueError("o modo dicionario não usa IA")


def so_texto(texto) -> str:
    """As IAs sem visão recebem só a parte de texto (o B-roll manda imagens só para o Claude)."""
    if isinstance(texto, str):
        return texto
    return "\n".join(p.get("text", "") for p in texto if isinstance(p, dict) and p.get("type") == "text")


def completar(schema: dict, dados):
    """IA local às vezes esquece um campo: completa com vazio para o script não quebrar."""
    if schema.get("type") != "object" or not isinstance(dados, dict):
        return dados
    vazio = {"array": [], "string": "", "integer": 0, "number": 0, "boolean": False, "object": {}}
    for chave, sub in schema.get("properties", {}).items():
        if chave not in dados:
            dados[chave] = vazio.get(sub.get("type"), None)
        elif sub.get("type") == "array" and isinstance(dados[chave], list) and "items" in sub:
            dados[chave] = [completar(sub["items"], x) for x in dados[chave] if not (sub["items"].get("type") == "object" and not isinstance(x, dict))]
    return dados


def _ollama_chat(modelo: str, instrucoes: str, texto: str, schema: dict) -> dict:
    body = {
        "model": modelo,
        "stream": False,
        "format": schema,
        # O Qwen3 "pensa" antes de responder: aqui não precisa e só deixaria mais lento.
        "think": False,
        "options": {"temperature": 0.3, "num_ctx": 8192},
        "messages": [{"role": "system", "content": instrucoes}, {"role": "user", "content": so_texto(texto)}],
    }
    req = urllib.request.Request(
        "http://localhost:11434/api/chat",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=1200) as r:
        return completar(schema, json.loads(json.loads(r.read())["message"]["content"]))


def por_ollama(instrucoes: str, texto: str, schema: dict, modelo: str) -> dict:
    try:
        try:
            return _ollama_chat(modelo, instrucoes, texto, schema)
        except urllib.error.HTTPError as e:
            # Modelo novo ainda não baixado: usa o antigo, se ele existir.
            if e.code == 404 and modelo == PADRAO_OLLAMA:
                print(f"(o modelo {modelo} ainda não foi baixado; usando o {RESERVA_OLLAMA}. "
                      f"Para o melhor resultado rode: ollama pull {modelo})")
                return _ollama_chat(RESERVA_OLLAMA, instrucoes, texto, schema)
            raise
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise IaIndisponivel(f"O Ollama está aberto, mas falta baixar a IA: rode `ollama pull {modelo}` no Prompt de Comando.")
        raise IaIndisponivel(f"O Ollama deu erro ({e.code}). Feche e abra o Ollama de novo.")
    except urllib.error.URLError as e:
        raise IaIndisponivel(
            f"Não consegui falar com o Ollama ({e.reason}). Instale em https://ollama.com, "
            f"rode `ollama pull {modelo}` e deixe o Ollama aberto."
        )
    except (json.JSONDecodeError, KeyError, TypeError):
        raise IaIndisponivel("O Ollama respondeu num formato errado desta vez.")


def por_deepseek(instrucoes: str, texto: str, schema: dict, modelo: str) -> dict:
    """DeepSeek pela internet (formato da OpenAI). Ele não segue um schema à risca: o formato vai
    no pedido, com exemplo, e o que faltar é completado."""
    chave = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not chave:
        raise IaIndisponivel("Falta a chave do DeepSeek: cole em Configurações (platform.deepseek.com > API keys).")
    sistema = (
        f"{instrucoes}\n\nResponda SOMENTE com um objeto JSON válido que siga este JSON Schema "
        f"(use exatamente esses nomes de campos):\n{json.dumps(schema, ensure_ascii=False)}"
    )
    body = {
        "model": modelo,
        "messages": [{"role": "system", "content": sistema}, {"role": "user", "content": so_texto(texto)}],
        "response_format": {"type": "json_object"},
        "thinking": {"type": "disabled"},
        "temperature": 0.3,
        "max_tokens": 8000,
        "stream": False,
    }
    url = os.environ.get("DEEPSEEK_API_URL", "https://api.deepseek.com") + "/chat/completions"

    def enviar(corpo: dict) -> dict:
        req = urllib.request.Request(
            url,
            data=json.dumps(corpo).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {chave}"},
        )
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read())

    for tentativa in range(3):
        try:
            resposta = enviar(body)
        except urllib.error.HTTPError as e:
            detalhe = e.read().decode("utf-8", "replace")[:300]
            if e.code == 400 and "thinking" in detalhe and "thinking" in body:
                body.pop("thinking")  # versão da API que não conhece esse campo
                continue
            if e.code == 401:
                raise IaIndisponivel("A chave do DeepSeek não foi aceita. Confira em Configurações.")
            if e.code == 402:
                raise IaIndisponivel("A conta do DeepSeek está sem saldo: adicione em platform.deepseek.com > Top up.")
            if e.code in (429, 500, 502, 503) and tentativa < 2:
                import time
                time.sleep(3 * (tentativa + 1))
                continue
            raise IaIndisponivel(f"O DeepSeek deu erro ({e.code}): {detalhe}")
        except urllib.error.URLError as e:
            raise IaIndisponivel(f"Não consegui falar com o DeepSeek ({e.reason}). Confira a internet.")
        conteudo = (resposta.get("choices") or [{}])[0].get("message", {}).get("content") or ""
        uso = resposta.get("usage") or {}
        if uso:
            print(f"(DeepSeek: {uso.get('prompt_tokens', 0)} tokens de entrada, {uso.get('completion_tokens', 0)} de saída)")
        try:
            return completar(schema, json.loads(conteudo))
        except json.JSONDecodeError:
            if tentativa < 2:
                continue  # às vezes vem vazio: pede de novo
            raise IaIndisponivel("O DeepSeek respondeu num formato errado desta vez.")
    raise IaIndisponivel("O DeepSeek não respondeu direito desta vez.")


def precisa_workspace(erro: Exception) -> bool:
    """Chave da organização (sem workspace): a API pede o ID do workspace em cada pedido."""
    return "not scoped to a workspace" in str(getattr(erro, "message", erro))


def cliente_claude(workspace: str | None = None):
    """Cliente do Claude. Se a chave for da organização, manda o ID do workspace junto
    (ANTHROPIC_WORKSPACE_ID, que o Studio guarda depois do teste da chave)."""
    import anthropic

    ws = workspace or os.environ.get("ANTHROPIC_WORKSPACE_ID")
    return anthropic.Anthropic(default_headers={"anthropic-workspace-id": ws} if ws else None)


def chamar_claude(fazer):
    """Roda fazer(client). Se a chave pedir o workspace e o Studio tiver achado um
    (ANTHROPIC_WORKSPACE_ID_SUGERIDO), tenta de novo com ele. Devolve (resposta, workspace usado)."""
    import anthropic

    try:
        return fazer(cliente_claude()), None
    except anthropic.BadRequestError as e:
        sugerido = os.environ.get("ANTHROPIC_WORKSPACE_ID_SUGERIDO")
        if not (precisa_workspace(e) and sugerido and not os.environ.get("ANTHROPIC_WORKSPACE_ID")):
            raise
        return fazer(cliente_claude(sugerido)), sugerido


def por_claude(instrucoes: str, texto: str, schema: dict, modelo: str) -> dict:
    import anthropic

    # Sem chave no código: o SDK usa o login OAuth do `ant auth login` (e renova o token
    # sozinho). Se ANTHROPIC_API_KEY estiver definida, ela tem prioridade sobre o login.
    try:
        response, _ = chamar_claude(
            lambda client: client.beta.messages.create(
                model=modelo,
                max_tokens=16000,
                system=instrucoes,
                messages=[{"role": "user", "content": texto}],
                output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
                # Se o modelo recusar o pedido, a própria API tenta de novo com o modelo reserva recomendado.
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
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
        if precisa_workspace(e):
            raise IaIndisponivel(SEM_WORKSPACE)
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
