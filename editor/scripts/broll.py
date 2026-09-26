"""B-roll automático: escolhe os momentos do vídeo e baixa clipes grátis do Pexels.

Uso:
    python scripts/broll.py public/video.mp4                   # Claude escolhe cenas e buscas (padrão)
    python scripts/broll.py public/video.mp4 --ia ollama
    python scripts/broll.py public/video.mp4 --ia dicionario   # dicionário embutido, sem IA
    python scripts/broll.py public/video.mp4 --so-planejar     # não baixa nada, só mostra o plano

Precisa de uma chave grátis do Pexels (https://www.pexels.com/api/) na variável
PEXELS_API_KEY. Os clipes vão para public/broll/ e o plano para public/video.broll.json;
no Studio, coloque "video.broll.json" no campo brollFile. Os tempos ficam no relógio
do vídeo original, então o corte de silêncios continua funcionando.
"""

import argparse
import json
import os
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from _common import output_path
from _ia import IaIndisponivel, add_ia_args, avisar_sem_ia, pedir_json

INSTRUCOES = """Você é editor de vídeos curtos virais (Reels/TikTok).
Abaixo está a transcrição, uma palavra por linha, no formato "índice [segundos]: palavra".

Escolha momentos para cobrir com B-roll (imagens de apoio de banco de vídeos):
- Cerca de uma cena a cada 6 a 10 segundos de fala; nunca nos 2 primeiros segundos
  (o rosto precisa aparecer no gancho).
- Prefira palavras concretas e visuais (dinheiro, celular, academia, cidade, comida...).
- "indice": a palavra onde a cena começa. "duracao": entre 1.5 e 3 segundos.
- "busca": 2 a 4 palavras EM INGLÊS para buscar no Pexels (ex.: "counting money cash").
- "modo": "full" (tela cheia) ou "pip" (cartão no topo, a pessoa continua aparecendo). Alterne."""

SCHEMA = {
    "type": "object",
    "properties": {
        "cenas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "indice": {"type": "integer"},
                    "duracao": {"type": "number"},
                    "busca": {"type": "string"},
                    "modo": {"type": "string", "enum": ["full", "pip"]},
                },
                "required": ["indice", "duracao", "busca", "modo"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["cenas"],
    "additionalProperties": False,
}

# Modo sem IA: raiz da palavra (sem acento) -> busca em inglês.
BUSCAS = {
    "dinheir": "money cash", "grana": "money cash", "reais": "money cash", "ganh": "counting money",
    "lucr": "business growth chart", "venda": "online shopping", "vend": "online shopping",
    "cliente": "customer handshake", "empresa": "modern office", "negocio": "business meeting",
    "trabalh": "working laptop", "viral": "social media phone", "virais": "social media phone",
    "video": "filming smartphone", "celular": "smartphone scrolling", "instagram": "instagram phone",
    "tiktok": "tiktok phone", "youtube": "youtube creator", "internet": "typing laptop",
    "academia": "gym workout", "treino": "gym workout", "saude": "healthy lifestyle", "comida": "cooking food",
    "viagem": "travel airplane", "carro": "driving car", "casa": "modern house", "cidade": "city aerial",
    "tempo": "clock time", "estud": "studying books", "aprend": "learning student", "ideia": "light bulb idea",
    "sucesso": "success celebration", "meta": "goal target", "cresc": "growth plant", "famil": "happy family",
    "amig": "friends laughing", "cafe": "coffee morning", "natureza": "nature forest", "praia": "beach sunset",
}


def normalize(word: str) -> str:
    word = unicodedata.normalize("NFD", word)
    word = "".join(c for c in word if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w]", "", word.lower())


def por_dicionario(captions: list[dict], intervalo_ms: int = 6000) -> dict:
    cenas, ultimo_ms, usadas = [], 2000 - intervalo_ms, set()
    for i, c in enumerate(captions):
        n = normalize(c["text"])
        busca = next((b for raiz, b in BUSCAS.items() if n == raiz or (len(raiz) >= 4 and n.startswith(raiz))), None)
        if busca and busca not in usadas and c["startMs"] - ultimo_ms >= intervalo_ms:
            cenas.append({"indice": i, "duracao": 2.2, "busca": busca, "modo": "full" if len(cenas) % 2 == 0 else "pip"})
            ultimo_ms, _ = c["startMs"], usadas.add(busca)
    return {"cenas": cenas}


def escolher_arquivo(video: dict, largura_alvo: int = 1080) -> dict | None:
    """Entre as versões de um vídeo do Pexels, pega a mp4 mais próxima de 1080 de largura."""
    arquivos = [f for f in video.get("video_files", []) if f.get("file_type") == "video/mp4" and f.get("width")]
    if not arquivos:
        return None
    return min(arquivos, key=lambda f: abs(f["width"] - largura_alvo) + (0 if f["height"] >= f["width"] else 2000))


def buscar_pexels(busca: str, chave: str, minimo_s: float, quantos: int = 4) -> list[tuple[dict, dict]]:
    """Até `quantos` vídeos verticais do Pexels que durem o suficiente, na ordem do Pexels."""
    url = "https://api.pexels.com/videos/search?" + urllib.parse.urlencode(
        {"query": busca, "orientation": "portrait", "size": "medium", "per_page": 8}
    )
    req = urllib.request.Request(url, headers={"Authorization": chave, "User-Agent": "ricardoaistudio-editor"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            dados = json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise SystemExit("Chave do Pexels inválida. Pegue uma grátis em https://www.pexels.com/api/")
        raise SystemExit(f"Erro do Pexels ({e.code}) buscando '{busca}'")
    candidatos = []
    for video in dados.get("videos", []):
        if video.get("duration", 0) >= minimo_s:
            arquivo = escolher_arquivo(video)
            if arquivo:
                candidatos.append((video, arquivo))
        if len(candidatos) == quantos:
            break
    return candidatos


ESCOLHA_INSTRUCOES = """Você escolhe B-roll (imagens de apoio) para vídeos curtos.
Vou mostrar a frase falada naquele momento do vídeo e miniaturas de vídeos de banco de imagens.
Escolha a miniatura que ILUSTRA MELHOR o sentido da frase para quem está assistindo.
Se nenhuma tiver relação clara com a frase, responda -1: é melhor não ter B-roll do que ter
uma imagem sem nada a ver."""

ESCOLHA_SCHEMA = {
    "type": "object",
    "properties": {"escolha": {"type": "integer"}, "motivo": {"type": "string"}},
    "required": ["escolha", "motivo"],
    "additionalProperties": False,
}


def miniatura(video: dict) -> str | None:
    url = video.get("image")
    if not url:
        return None
    # Miniatura pequena: a IA enxerga bem e custa poucos tokens.
    return url + ("&" if "?" in url else "?") + "auto=compress&w=360"


def escolher_com_visao(args, frase: str, busca: str, candidatos: list[tuple[dict, dict]]) -> int:
    """Índice do candidato que combina com a frase, ou -1 se nenhum combina.
    Só o Claude enxerga imagens; nas outras IAs fica o primeiro resultado do Pexels."""
    if args.ia != "claude":
        return 0
    conteudo: list[dict] = [{"type": "text", "text": f'Frase falada: "{frase}"\nBusca usada no banco de imagens: "{busca}"'}]
    validos = 0
    for i, (video, _arquivo) in enumerate(candidatos):
        url = miniatura(video)
        if url:
            conteudo += [{"type": "text", "text": f"Imagem {i}:"}, {"type": "image", "source": {"type": "url", "url": url}}]
            validos += 1
    if not validos:
        return 0
    resposta = pedir_json(args, ESCOLHA_INSTRUCOES, conteudo, ESCOLHA_SCHEMA)
    escolha = resposta.get("escolha", 0)
    print(f"         IA escolheu {'nenhuma' if escolha < 0 else f'a imagem {escolha}'}: {resposta.get('motivo', '')}")
    return escolha if -1 <= escolha < len(candidatos) else 0


def frase_em_volta(captions: list[dict], indice: int, janela_ms: int = 3000) -> str:
    centro = captions[indice]["startMs"]
    return "".join(c["text"] for c in captions if abs(c["startMs"] - centro) <= janela_ms).strip()


def baixar(url: str, destino: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "ricardoaistudio-editor"})
    with urllib.request.urlopen(req, timeout=120) as r, open(destino, "wb") as f:
        while chunk := r.read(1 << 16):
            f.write(chunk)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("video", type=Path)
    add_ia_args(parser)
    parser.add_argument("--so-planejar", action="store_true", help="só mostra as cenas escolhidas, sem baixar")
    args = parser.parse_args()

    captions_file = output_path(args.video, ".captions.json")
    if not captions_file.exists():
        raise SystemExit(f"Não achei {captions_file}. Rode antes: python scripts/transcribe.py {args.video}")
    captions = json.loads(captions_file.read_text(encoding="utf-8"))

    chave = os.environ.get("PEXELS_API_KEY", "")
    if not args.so_planejar and not chave:
        raise SystemExit(
            "Defina PEXELS_API_KEY com sua chave grátis do Pexels (https://www.pexels.com/api/), "
            "ou rode com --so-planejar para só ver o plano."
        )

    if args.ia == "dicionario":
        plano = por_dicionario(captions)
    else:
        texto = "\n".join(f"{i} [{c['startMs'] / 1000:.1f}]: {c['text'].strip()}" for i, c in enumerate(captions))
        try:
            plano = pedir_json(args, INSTRUCOES, texto, SCHEMA)
        except IaIndisponivel as e:
            avisar_sem_ia(e)
            plano = por_dicionario(captions)

    cenas = sorted(
        (c for c in plano["cenas"] if 0 <= c["indice"] < len(captions) and c["busca"].strip()),
        key=lambda c: c["indice"],
    )
    if not cenas:
        raise SystemExit("Nenhuma cena de B-roll encontrada.")

    pasta = args.video.parent / "broll"
    pasta.mkdir(exist_ok=True)
    transicoes = ["zoom", "slide", "glitch", "fade"]
    itens, creditos = [], []
    visao_avisada = False
    for n, cena in enumerate(cenas):
        palavra = captions[cena["indice"]]
        duracao_ms = round(min(3.0, max(1.5, cena["duracao"])) * 1000)
        print(f"{palavra['startMs'] / 1000:6.1f}s  {palavra['text'].strip():<14} -> '{cena['busca']}' ({cena['modo']})")
        if args.so_planejar:
            continue
        candidatos = buscar_pexels(cena["busca"], chave, duracao_ms / 1000)
        if not candidatos:
            print("         (nada encontrado no Pexels, pulando)")
            continue
        try:
            escolha = escolher_com_visao(args, frase_em_volta(captions, cena["indice"]), cena["busca"], candidatos)
        except IaIndisponivel as e:
            if not visao_avisada:
                avisar_sem_ia(e)
                visao_avisada = True
            escolha = 0
        if escolha < 0:
            print("         (nenhuma imagem combinou com a frase; esta cena fica sem B-roll)")
            continue
        video, arquivo = candidatos[escolha]
        nome = f"{args.video.stem}-{n + 1}-{video['id']}.mp4"
        if not (pasta / nome).exists():
            baixar(arquivo["link"], pasta / nome)
        itens.append(
            {
                "src": f"broll/{nome}",
                "sourceMs": palavra["startMs"],
                "durationMs": duracao_ms,
                "mode": cena["modo"],
                "transition": transicoes[n % len(transicoes)],
                # Para mostrar no app (e decidir se remove): o que foi buscado e a frase.
                "busca": cena["busca"],
                "frase": frase_em_volta(captions, cena["indice"])[:120],
            }
        )
        creditos.append(f"{video.get('user', {}).get('name', '?')} - {video.get('url', '')}")

    if args.so_planejar:
        return
    out = output_path(args.video, ".broll.json")
    out.write_text(json.dumps(itens, ensure_ascii=False, indent=1), encoding="utf-8")
    (pasta / f"{args.video.stem}-creditos.txt").write_text("\n".join(creditos) + "\n", encoding="utf-8")
    print(f"\n{len(itens)} clipes em {pasta}/ (créditos em {args.video.stem}-creditos.txt)")
    print(f'-> {out}   (no Studio, coloque "{out.name}" no campo brollFile)')


if __name__ == "__main__":
    main()
