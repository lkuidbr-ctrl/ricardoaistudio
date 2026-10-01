"""Edição automática pela IA: destaques e emojis na legenda, zooms, título-gancho, animações,
textos animados (nome e cargo, número contando...) e efeitos de cinema.

Uso:
    python scripts/enrich.py public/video.mp4                      # Claude (padrão; centavos por vídeo)
    python scripts/enrich.py public/video.mp4 --ia ollama          # IA local (grátis, precisa do Ollama)
    python scripts/enrich.py public/video.mp4 --ia dicionario      # dicionário embutido (grátis, instantâneo)

Grava os campos "highlight" e "emoji" dentro do public/video.captions.json e os zooms e o
título-gancho em public/video.edicao.json (o Studio aplica sozinho; dá para mudar tudo no app).
"""

import argparse
import json
import re
import unicodedata
from pathlib import Path

from _common import output_path
from _ia import IaIndisponivel, add_ia_args, avisar_sem_ia, pedir_json

INSTRUCOES = """Você é editor de vídeos curtos virais (Reels/TikTok) em português.
Abaixo está a transcrição, uma palavra por linha, no formato "índice [segundos]: palavra".

Escolha:
1. "destaques": as palavras de maior impacto (números, dinheiro, resultados, emoções,
   palavras fortes, nomes). Cerca de 1 a cada 6 palavras. Nunca artigos, preposições ou pronomes.
2. "emojis": emojis para algumas palavras-chave (cerca de 1 a cada 10 palavras), sempre
   um único emoji que combine com o sentido da palavra no contexto da frase.
   Não repita o mesmo emoji em palavras vizinhas. Prefira estes, que se mexem no vídeo:
   💸🤑📈📉📊🛒🏆🎯💡🧠📚✅❌⚠️👀🔥🚀⚡⏰❤️💔😄😂🤯😱😢😡🙏👍👎👏💪🤝🏠🚗✈️🌎🎉🎊🥳✨⭐🌟💎👑
   🤔🤫😎😍🥰😭😅🙌👋👉👆💯🎬📸💬➕🆓🩺🍔💥💣⏳⌛🔔📣😴😬🤩😤🫶❗❓‼️🎁🔒📦🌈⚽🍀
   (para dinheiro, use 💸 ou 🤑).
3. "zooms": momentos para aproximar a câmera, na palavra de maior impacto de uma frase
   (revelação, número, promessa, virada). Cerca de 1 a cada 5 a 8 segundos, nunca dois com
   menos de 3 segundos entre eles e nunca nos 2 primeiros segundos. "forte": true só nos 1 ou 2
   momentos mais fortes do vídeo.
4. "gancho": título curto (até 6 palavras) que aparece no começo do vídeo e faz a pessoa
   querer assistir até o fim. Fiel ao que é falado, sem inventar promessa. Sem emoji e sem aspas.
5. "animacoes": animações prontas por cima do vídeo, só onde reforçam a fala. Cerca de 1 a cada
   10 a 15 segundos (um vídeo de 1 minuto tem de 3 a 5), nunca nos 2 primeiros segundos.
   Tipos: "check" (certo, sim, funciona), "xis" (erro, não faça, proibido), "seta" (olha isso,
   aponta algo), "dinheiro" (dinheiro, ganhar, lucro), "coracao" (amor, saúde, cuidado),
   "fogo" (incrível, bombando), "like" (curte, segue, aprovado), "explosao" (revelação, choque),
   "confete" (conquista, comemoração), "brilhos" (novidade, dica de ouro).
6. "cartelas": textos animados na tela. Poucos: de 0 a 3 num vídeo de 1 minuto, só quando ajudam.
   - "nome": só se a pessoa se apresenta (diz o nome ou a profissão). "texto" = o nome,
     "subtexto" = a profissão ou cargo (ou ""). No índice da apresentação.
   - "numero": quando a pessoa fala um número marcante (dinheiro, porcentagem, quantidade, prazo).
     "texto" = o número como deve aparecer na tela ("R$ 10.000", "95%", "3x", "30 dias");
     "subtexto" = até 4 palavras explicando ("de faturamento").
   - "digitando": uma regra ou dica curta que vale anotar (até 6 palavras, em "texto"; "subtexto" = "").
   - "notificacao": só quando a fala é sobre venda, Pix, mensagem de cliente ou celular.
     "texto" = a mensagem da notificação, "subtexto" = o nome do app ("Banco", "WhatsApp").
   Escreva os textos em português correto, fiéis ao que é falado.
7. "efeitos": efeitos de cinema, raros (de 0 a 2 num vídeo de 1 minuto), entre "indice" e "indice_fim":
   "tremor" (choque, impacto, revelação forte; dura pouco), "luz" (momento emocional ou inspirador),
   "pretoBranco" (lembrança, passado, "antes eu..."), "vinheta" (suspense, segredo).

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
        "zooms": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"indice": {"type": "integer"}, "forte": {"type": "boolean"}},
                "required": ["indice", "forte"],
                "additionalProperties": False,
            },
        },
        "gancho": {"type": "string"},
        "animacoes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "indice": {"type": "integer"},
                    "tipo": {"type": "string", "enum": ["check", "xis", "seta", "dinheiro", "coracao", "fogo", "like",
                                                        "explosao", "confete", "brilhos"]},
                },
                "required": ["indice", "tipo"],
                "additionalProperties": False,
            },
        },
        "cartelas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "indice": {"type": "integer"},
                    "tipo": {"type": "string", "enum": ["nome", "numero", "digitando", "notificacao"]},
                    "texto": {"type": "string"},
                    "subtexto": {"type": "string"},
                },
                "required": ["indice", "tipo", "texto", "subtexto"],
                "additionalProperties": False,
            },
        },
        "efeitos": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "indice": {"type": "integer"},
                    "indice_fim": {"type": "integer"},
                    "tipo": {"type": "string", "enum": ["tremor", "luz", "pretoBranco", "vinheta"]},
                },
                "required": ["indice", "indice_fim", "tipo"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["destaques", "emojis", "zooms", "gancho", "animacoes", "cartelas", "efeitos"],
    "additionalProperties": False,
}

# Dicionário para o modo sem IA: raiz da palavra (sem acento) -> emoji.
DICIONARIO = {
    "dinheir": "💸", "grana": "💸", "reais": "💸", "lucr": "📈", "venda": "🛒", "vend": "🛒",
    "ganh": "🤑", "rico": "🤑", "milh": "💸", "mil": "💸", "caro": "💸", "barat": "🛒", "gratis": "🆓",
    "viral": "🚀", "virais": "🚀", "cresc": "📈", "result": "📊", "sucesso": "🏆", "venc": "🏆", "meta": "🎯",
    "objetivo": "🎯", "foco": "🎯", "ideia": "💡", "dica": "💡", "segredo": "🤫", "aprend": "🧠", "estud": "📚",
    "facil": "✅", "rapid": "⚡", "tempo": "⏰", "hoje": "⏰", "agora": "⏰", "fogo": "🔥", "incrivel": "🤯",
    "insano": "🤯", "loucura": "🤯", "amor": "❤️", "ama": "❤️", "feliz": "😄", "triste": "😢", "medo": "😱",
    "erro": "❌", "errad": "❌", "nunca": "❌", "problema": "⚠️", "cuidado": "⚠️", "atencao": "👀", "olha": "👀",
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
    # Sem IA: zoom nas palavras com emoji (o filtro de distância mínima fica em zooms_em_ms).
    zooms = [{"indice": e["indice"], "forte": False} for e in emojis]
    animacoes = [{"indice": e["indice"], "tipo": ANIMACAO_DO_EMOJI[e["emoji"]]} for e in emojis if e["emoji"] in ANIMACAO_DO_EMOJI]
    return {"destaques": destaques, "emojis": emojis, "zooms": zooms, "gancho": "", "animacoes": animacoes,
            "cartelas": [], "efeitos": []}


# Sem IA: algumas palavras com emoji também ganham uma animação.
ANIMACAO_DO_EMOJI = {"💰": "dinheiro", "🤑": "dinheiro", "💸": "dinheiro", "💵": "dinheiro", "❌": "xis", "🚫": "xis",
                     "✅": "check", "❤️": "coracao", "🔥": "fogo", "👍": "like", "🏆": "confete", "💡": "brilhos"}


def animacoes_em_ms(animacoes: list[dict], captions: list[dict], intervalo_ms: int = 6000) -> list[dict]:
    """Índices da IA -> animações no tempo do vídeo original, sem começo e sem duas coladas."""
    saida, ultimo = [], -intervalo_ms
    for a in sorted(animacoes, key=lambda a: a["indice"]):
        if not 0 <= a["indice"] < len(captions):
            continue
        inicio = captions[a["indice"]]["startMs"]
        if inicio < 2000 or inicio - ultimo < intervalo_ms:
            continue
        saida.append({"sourceMs": inicio, "tipo": a["tipo"]})
        ultimo = inicio
    return saida


DURACAO_CARTELA = {"nome": 3500, "numero": 2500, "digitando": 3000, "notificacao": 3000}


def cartelas_em_ms(cartelas: list[dict], captions: list[dict], intervalo_ms: int = 4000) -> list[dict]:
    """Índices da IA -> textos animados no tempo do vídeo original, sem dois colados."""
    saida, ultimo = [], -intervalo_ms
    for c in sorted(cartelas, key=lambda c: c["indice"]):
        texto = c.get("texto", "").strip()
        if not texto or not 0 <= c["indice"] < len(captions):
            continue
        inicio = captions[c["indice"]]["startMs"]
        if inicio - ultimo < intervalo_ms:
            continue
        saida.append({"sourceMs": inicio, "tipo": c["tipo"], "texto": texto, "subtexto": c.get("subtexto", "").strip(),
                      "durationMs": DURACAO_CARTELA.get(c["tipo"], 3000)})
        ultimo = inicio
    return saida


def efeitos_em_ms(efeitos: list[dict], captions: list[dict]) -> list[dict]:
    """Índices da IA -> efeitos de cinema no tempo do vídeo original (no máximo 3)."""
    saida = []
    for e in sorted(efeitos, key=lambda e: e["indice"]):
        if not 0 <= e["indice"] < len(captions):
            continue
        inicio = captions[e["indice"]]["startMs"]
        fim = captions[min(max(e["indice_fim"], e["indice"]), len(captions) - 1)]["endMs"]
        if e["tipo"] == "tremor":
            fim = inicio + 700
        elif e["tipo"] == "luz":
            fim = inicio + 1500
        saida.append({"sourceMs": inicio, "sourceFimMs": max(fim, inicio + 500), "tipo": e["tipo"]})
    return saida[:3]


def zooms_em_ms(zooms: list[dict], captions: list[dict], intervalo_ms: int = 3000) -> list[dict]:
    """Índices da IA -> zooms no tempo do vídeo original, sem começo e sem dois colados."""
    saida, ultimo = [], -intervalo_ms
    for z in sorted(zooms, key=lambda z: z["indice"]):
        if not 0 <= z["indice"] < len(captions):
            continue
        inicio = captions[z["indice"]]["startMs"]
        if inicio < 2000 or inicio - ultimo < intervalo_ms:
            continue
        saida.append({"sourceMs": inicio, "durationMs": 1800 if z["forte"] else 1500, "scale": 1.35 if z["forte"] else 1.2})
        ultimo = inicio
    return saida


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
    texto = "\n".join(f"{i} [{c['startMs'] / 1000:.1f}]: {w}" for i, (c, w) in enumerate(zip(captions, words)))

    if args.ia == "dicionario":
        result = por_dicionario(words)
    else:
        try:
            result = pedir_json(args, INSTRUCOES, texto, SCHEMA)
        except IaIndisponivel as e:
            avisar_sem_ia(e)
            result = por_dicionario(words)

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

    # Zooms e gancho: o Studio aplica ao projeto (e guarda em "aplicado" o que colocou, para
    # não apagar o que você mudou à mão quando refizer).
    edicao_file = output_path(args.video, ".edicao.json")
    anterior = json.loads(edicao_file.read_text(encoding="utf-8")) if edicao_file.exists() else {}
    zooms = zooms_em_ms(result.get("zooms", []), captions)
    gancho = result.get("gancho", "").strip().strip('"').strip()
    animacoes = animacoes_em_ms(result.get("animacoes", []), captions)
    cartelas = cartelas_em_ms(result.get("cartelas", []), captions)
    efeitos = efeitos_em_ms(result.get("efeitos", []), captions)
    edicao = {"zooms": zooms, "gancho": gancho, "animacoes": animacoes, "cartelas": cartelas, "efeitos": efeitos,
              "aplicado": anterior.get("aplicado")}
    edicao_file.write_text(json.dumps(edicao, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"zooms: {len(zooms)} | animações: {len(animacoes)} | textos animados: {len(cartelas)} | efeitos: {len(efeitos)}"
          + (f" | gancho: {gancho}" if gancho else ""))
    print(f"-> {edicao_file}")


if __name__ == "__main__":
    main()
