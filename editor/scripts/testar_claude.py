"""Confere se o Claude está pronto para uso: chave/login válidos e créditos na conta.

Faz um pedido mínimo (1 token no modelo mais barato; custa uma fração de centavo) e
imprime um JSON: {"ok": true} ou {"ok": false, "motivo": "..."}.
"""

import json

from _ia import SEM_CREDITOS


def main() -> None:
    import anthropic

    try:
        client = anthropic.Anthropic()
        client.messages.create(model="claude-haiku-4-5", max_tokens=1, messages=[{"role": "user", "content": "oi"}])
        resultado = {"ok": True}
    except (TypeError, anthropic.CredentialsError):
        resultado = {"ok": False, "motivo": "Nenhuma chave configurada. Cole a sua chave da API e salve."}
    except anthropic.AuthenticationError:
        resultado = {"ok": False, "motivo": "Chave inválida. Confira se copiou a chave inteira (começa com sk-ant-)."}
    except anthropic.PermissionDeniedError as e:
        resultado = {"ok": False, "motivo": f"A chave não tem permissão: {e.message}"}
    except anthropic.RateLimitError:
        resultado = {"ok": True, "aviso": "A chave funciona, mas atingiu o limite de uso por agora."}
    except anthropic.APIStatusError as e:
        if "credit balance" in str(e.message).lower():
            resultado = {"ok": False, "motivo": SEM_CREDITOS[0].upper() + SEM_CREDITOS[1:]}
        else:
            resultado = {"ok": False, "motivo": f"O Claude respondeu com erro ({e.status_code}): {e.message}"}
    except anthropic.APIConnectionError:
        resultado = {"ok": False, "motivo": "Sem conexão com o Claude. Verifique a internet."}
    print(json.dumps(resultado, ensure_ascii=False))


if __name__ == "__main__":
    main()
