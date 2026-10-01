"""Peça para a IA: um pedido em texto ("deixa a legenda amarela", "tira o zoom do começo")
vira mudanças nos ajustes do vídeo.

O Studio chama sozinho, mandando pela entrada padrão um JSON com:
    {"pedido": "...", "ajustes": {...ajustes atuais...}, "legenda": "texto com tempos"}
e recebe pela saída padrão (última linha) um JSON com:
    {"resposta": "...", "mudancas": {...}, "trocas": [{"de": "...", "para": "..."}]}

Uso manual:
    echo '{"pedido": "legenda amarela", "ajustes": {}, "legenda": ""}' | python scripts/pedido.py --ia claude
"""

import argparse
import json
import sys

from _ia import IaIndisponivel, add_ia_args, pedir_json

INSTRUCOES = """Você é o assistente de edição do Ricardo AI Studio, um editor de vídeos curtos (Reels/TikTok).
O usuário faz um pedido em português e você devolve as mudanças nos ajustes do vídeo.

Ajustes que você pode mudar (use exatamente estes nomes e formatos):
- captionStyle: estilo da legenda, um de "hormozi", "karaoke", "pop", "neon", "minimal".
- captionColor / highlightColor: cor do texto e do destaque da legenda, em "#RRGGBB".
- captionY: altura da legenda na tela, em % (0 = topo, 100 = base). Padrão perto de 72.
- wordsWindowMs: quantas palavras por tela (0 = uma por vez, 1200 = frases, até 2500).
- emojis: true/false (mostrar os emojis da legenda).
- keywords: lista de palavras que ganham destaque na legenda.
- zooms: lista de {"atMs", "durationMs", "scale"}; atMs em milissegundos do vídeo JÁ EDITADO
  (o tempo que aparece no player), scale de 1.05 a 1.6.
- cutTransition: efeito nas trocas de frase, um de "none", "zoom", "flash", "whip", "glitch", "luz" (clarão de
  luz de filme), "tremor" (a câmera dá um tranco).
- hookText: título-gancho no começo do vídeo ("" tira o título). hookDurationMs: quanto tempo ele fica (500 a 10000).
- behindTexts: lista de textos atrás da pessoa: {"text", "startMs", "durationMs", "animation"
  ("rise", "scale", "slide" ou "letters"), "color" "#RRGGBB", "y" (0 a 100), "fontSize" (40 a 600)}.
- musicVolume (0 a 1), duckTo (0 a 1: volume da música enquanto a pessoa fala), sfx (true/false),
  sfxVolume (0 a 1).
- animacoes: lista de animações por cima do vídeo: {"tipo" (um de "seta", "circulo", "sublinhado", "check",
  "xis", "explosao", "coracao", "like", "fogo", "dinheiro", "confete", "brilhos"), "startMs" (tempo do vídeo
  editado), "durationMs" (300 a 5000), "x" e "y" (centro, em % da tela; y 20 = acima da cabeça), "tamanho"
  (0.3 a 3, 1 = normal), "cor" "#RRGGBB"}.
- cartelas: textos animados: {"tipo" ("nome" = nome e cargo embaixo; "numero" = número que conta até o valor;
  "digitando" = texto aparecendo letra por letra; "notificacao" = balão de notificação do celular), "texto"
  (o nome, o número como "R$ 10.000" ou "95%", o texto ou a mensagem), "subtexto" (cargo, legenda do número,
  nome do app; pode ser ""), "startMs", "durationMs" (1000 a 8000), "y" (altura em %; nome 62, numero 30,
  digitando 25, notificacao 14), "cor" "#RRGGBB"}.
- efeitosTela: efeitos de cinema num trecho: {"tipo" ("tremor", "luz", "vinheta", "pretoBranco"), "startMs",
  "durationMs" (tremor 700, luz 1500, os outros o tempo do trecho), "forca" (0.2 a 2, 1 = normal)}.
- cor: correção de cor do vídeo, objeto COMPLETO {"brilho" (0.5 a 1.6, 1 = normal), "contraste"
  (0.6 a 1.5), "saturacao" (0 a 2; 0 = preto e branco), "temperatura" (-1 frio a 1 quente, 0 = normal),
  "sombras" (0 a 1: quanto clarear as partes escuras)}.

Regras:
- "mudancas" é um TEXTO com um objeto JSON só com os ajustes que mudam (ex.: "{\\"captionColor\\": \\"#FFE600\\"}").
  Para listas (zooms, behindTexts, keywords, animacoes, cartelas, efeitosTela), mande a lista COMPLETA como deve ficar.
- Se o pedido for trocar palavras erradas da legenda, use "trocas": [{"de": "palavra errada", "para": "certa"}].
- Se o pedido não tiver como ser feito com esses ajustes, não invente: "mudancas" = "{}" e explique em "resposta".
- "resposta": uma frase curta em português dizendo o que você fez."""

SCHEMA = {
    "type": "object",
    "properties": {
        "resposta": {"type": "string"},
        "mudancas": {"type": "string"},
        "trocas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"de": {"type": "string"}, "para": {"type": "string"}},
                "required": ["de", "para"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["resposta", "mudancas", "trocas"],
    "additionalProperties": False,
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_ia_args(parser)
    args = parser.parse_args()
    if args.ia == "dicionario":
        raise SystemExit('"Peça para a IA" precisa de uma IA: escolha Claude ou Ollama em Inteligência.')

    entrada = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    texto = (
        f"Pedido do usuário: {entrada['pedido']}\n\n"
        f"Ajustes atuais:\n{json.dumps(entrada.get('ajustes', {}), ensure_ascii=False)}\n\n"
        f"Legenda (tempo no vídeo editado, em segundos):\n{entrada.get('legenda', '')}"
    )
    try:
        r = pedir_json(args, INSTRUCOES, texto, SCHEMA)
    except IaIndisponivel as e:
        raise SystemExit(str(e))
    try:
        mudancas = json.loads(r.get("mudancas") or "{}")
    except json.JSONDecodeError:
        mudancas = {}
    if not isinstance(mudancas, dict):
        mudancas = {}
    saida = {"resposta": r.get("resposta", ""), "mudancas": mudancas, "trocas": r.get("trocas", [])}
    print(json.dumps(saida, ensure_ascii=False))


if __name__ == "__main__":
    main()
