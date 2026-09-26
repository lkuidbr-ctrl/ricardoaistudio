"""Escolhe palavras-chave para destacar e emojis para as legendas.

Uso:
    python scripts/enrich.py public/video.mp4                      # Claude (padrão; centavos por vídeo)
    python scripts/enrich.py public/video.mp4 --ia ollama          # IA local (grátis, precisa do Ollama)
    python scripts/enrich.py public/video.mp4 --ia dicionario      # dicionário embutido (grátis, instantâneo)

Grava os campos "highlight" e "emoji" dentro do public/video.captions.json.
Você pode abrir o arquivo e mudar/apagar qualquer emoji à mão.
"""

import argparse
import json
import re
import unicodedata
from pathlib import Path

from _common import output_path
from _ia import add_ia_args, pedir_json

INSTRUCOES = """Você é editor de vídeos curtos virais (Reels/TikTok) em português.
Abaixo está a transcrição, uma palavra por linha, no formato "índice: palavra".

Escolha:
1. "destaques": as palavras de maior impacto (números, dinheiro, resultados, emoções,
   palavras fortes, nomes). Cerca de 1 a cada 6 palavras. Nunca artigos, preposições ou pronomes.
2. "emojis": emojis para algumas palavras-chave (cerca de 1 a cada 10 palavras), sempre
   um único emoji que combine com o sentido da palavra no contexto da frase.
   Não repita o mesmo emoji em palavras vizinhas.

Use apenas os índices da lista."""

SCHEMA = {
    "type": "object",
    "properties": {
        "destaques": {"type": "array", "items": {"type": "integer"}},
        "emojis": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"indice": {"type": "integer"}, "emoji": {"type": "string"}},
                "required": ["indice", "emoji"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["destaques", "emojis"],
    "additionalProperties": False,
}

# Dicionário para o modo sem IA: raiz da palavra (sem acento) -> emoji.
DICIONARIO = {
    "dinheir": "💰", "grana": "💰", "reais": "💵", "lucr": "📈", "venda": "🛒", "vend": "🛒",
    "ganh": "🤑", "rico": "🤑", "milh": "💸", "mil": "💸", "caro": "💸", "barat": "🏷️", "gratis": "🆓",
    "viral": "🚀", "virais": "🚀", "cresc": "📈", "result": "📊", "sucesso": "🏆", "venc": "🏆", "meta": "🎯",
    "objetivo": "🎯", "foco": "🎯", "ideia": "💡", "dica": "💡", "segredo": "🤫", "aprend": "🧠", "estud": "📚",
    "facil": "✅", "rapid": "⚡", "tempo": "⏰", "hoje": "📅", "agora": "⏰", "fogo": "🔥", "incrivel": "🤯",
    "insano": "🤯", "loucura": "🤯", "amor": "❤️", "ama": "❤️", "feliz": "😄", "triste": "😢", "medo": "😱",
    "erro": "❌", "errad": "❌", "nunca": "🚫", "problema": "⚠️", "cuidado": "⚠️", "atencao": "👀", "olha": "👀",
    "video": "🎬", "videos": "🎬", "celular": "📱", "instagram": "📸", "tiktok": "🎵", "youtube": "▶️",
    "trabalh": "💼", "empresa": "🏢", "negocio": "💼", "cliente": "🤝", "comida": "🍔", "academia": "💪",
    "treino": "💪", "forte": "💪", "saude": "🩺", "casa": "🏠", "carro": "🚗", "viagem": "✈️", "mundo": "🌎",
    "ola": "👋", "oi": "👋", "obrigad": "🙏", "bora": "🚀", "segue": "➕", "curte": "👍", "comenta": "💬",
}
PALAVRAS_FRACAS = set(
    "a o as os um uma uns umas de da do das dos em na no nas nos por para pra pro com sem e ou mas que "
    "se eu tu ele ela nos vos eles elas me te lhe isso isto esse essa este esta aquele aquela ja "
    "muito mais menos bem so tambem ai la aqui como quando onde qual quem ne tipo entao vou vai sou".split()
)


def normalize(word: str) -> str:
    word = unicodedata.normalize("NFD", word)
    word = "".join(c for c in word if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w]", "", word.lower())


def por_dicionario(words: list[str]) -> dict:
    destaques, emojis, ultimo = [], [], -99
    for i, w in enumerate(words):
        n = normalize(w)
        if not n or n in PALAVRAS_FRACAS:
            continue
        emoji = next((e for raiz, e in DICIONARIO.items() if n == raiz or (len(raiz) >= 4 and n.startswith(raiz))), None)
        if emoji or n.isdigit():
            destaques.append(i)
        if emoji and i - ultimo >= 5:  # no máximo um emoji a cada 5 palavras
            emojis.append({"indice": i, "emoji": emoji})
            ultimo = i
    return {"destaques": destaques, "emojis": emojis}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("video", type=Path)
    add_ia_args(parser)
    args = parser.parse_args()

    captions_file = output_path(args.video, ".captions.json")
    if not captions_file.exists():
        raise SystemExit(f"Não achei {captions_file}. Rode antes: python scripts/transcribe.py {args.video}")
    captions = json.loads(captions_file.read_text(encoding="utf-8"))
    words = [c["text"].strip() for c in captions]
    texto = "\n".join(f"{i}: {w}" for i, w in enumerate(words))

    result = por_dicionario(words) if args.ia == "dicionario" else pedir_json(args, INSTRUCOES, texto, SCHEMA)

    destaques = {i for i in result["destaques"] if 0 <= i < len(captions)}
    emojis = {e["indice"]: e["emoji"].strip() for e in result["emojis"] if 0 <= e["indice"] < len(captions) and e["emoji"].strip()}
    for i, c in enumerate(captions):
        c.pop("highlight", None)
        c.pop("emoji", None)
        if i in destaques or i in emojis:
            c["highlight"] = True
        if i in emojis:
            c["emoji"] = emojis[i]

    captions_file.write_text(json.dumps(captions, ensure_ascii=False, indent=1), encoding="utf-8")
    print(" ".join(f"[{w}]" if i in destaques else w for i, w in enumerate(words)))
    print("emojis: " + ", ".join(f"{words[i]} {e}" for i, e in sorted(emojis.items())))
    print(f"-> {captions_file}")


if __name__ == "__main__":
    main()
