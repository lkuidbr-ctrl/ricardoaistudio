"""Clipes automáticos: acha os melhores trechos de um vídeo longo (live, podcast, aula)
e gera vários shorts prontos para editar.

Uso:
    python scripts/transcribe.py public/live.mp4          # antes: legendas do vídeo longo
    python scripts/clips.py public/live.mp4                # Claude escolhe os trechos (padrão)
    python scripts/clips.py public/live.mp4 --ia dicionario  # heurística embutida, grátis e mais fraca
    python scripts/clips.py public/live.mp4 --quantos 5 --vertical --marca marca.json

Para cada clipe gera, em public/clips/:
    live-1.mp4               o trecho recortado (com --vertical, já em 9:16 seguindo o rosto)
    live-1.captions.json     as legendas do trecho, já no tempo do clipe
    live-1.props.json        configurações do editor (vídeo, legendas e título-gancho)
Depois renderize todos de uma vez com:  python scripts/render_all.py public/clips
"""

import argparse
import json
import re
import subprocess
import unicodedata
from pathlib import Path

from _common import ffmpeg_exe, output_path
from _ia import IaIndisponivel, add_ia_args, avisar_sem_ia, pedir_json

INSTRUCOES = """Você é editor de cortes virais (Reels/TikTok/Shorts) de lives e podcasts em português.
Abaixo está a transcrição dividida em frases, no formato "índice [início-fim em segundos]: frase".

Escolha os MELHORES trechos para virar vídeos curtos independentes:
- Cada trecho vai da frase "inicio" até a frase "fim" (inclusive), com {minimo} a {maximo} segundos.
- A primeira frase precisa prender a atenção sozinha (pergunta, número, promessa, polêmica).
  Nada de "bom dia", "deixa eu arrumar", "vamos ver o chat".
- O trecho precisa fazer sentido sem o resto da live e terminar numa ideia completa.
- Trechos não podem se sobrepor.
- "titulo": gancho curto para aparecer escrito no começo do vídeo (máx. 7 palavras, sem emoji).
- "nota": de 0 a 100, o potencial de viralizar.
Devolva até {quantos} trechos, do melhor para o pior."""

SCHEMA = {
    "type": "object",
    "properties": {
        "clipes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "inicio": {"type": "integer"},
                    "fim": {"type": "integer"},
                    "titulo": {"type": "string"},
                    "nota": {"type": "integer"},
                },
                "required": ["inicio", "fim", "titulo", "nota"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["clipes"],
    "additionalProperties": False,
}

# Heurística sem IA: o que costuma prender atenção em cortes.
FORTES = (
    "dinheir reais mil milh lucr perd ganh vend client negocio empresa segredo truque ninguem nunca "
    "sempre erro verdade maioria resultado dica investi quebr cresc vide viral anunci"
).split()
# Conversa de bastidor que estraga um corte (chat, técnica, recados).
BASTIDOR = "chat microfone camera audio perguntou comentou arrumar link bio live pessoal inscreve".split()
FRACAS_INICIO = ("bom dia", "boa tarde", "boa noite", "pronto", "entao", "bom,", "deixa eu", "vamos ver", "obrigad")


def normalize(texto: str) -> str:
    texto = unicodedata.normalize("NFD", texto)
    return "".join(c for c in texto if unicodedata.category(c) != "Mn").lower()


def frases(captions: list[dict], pausa_ms: int = 700) -> list[dict]:
    """Agrupa palavras em frases (pontuação final ou pausa longa)."""
    out, atual = [], []
    for i, w in enumerate(captions):
        atual.append(w)
        prox = captions[i + 1] if i + 1 < len(captions) else None
        fim = re.search(r"[.!?…]$", w["text"].strip()) or not prox or prox["startMs"] - w["endMs"] > pausa_ms
        if fim:
            out.append({"startMs": atual[0]["startMs"], "endMs": atual[-1]["endMs"], "texto": "".join(x["text"] for x in atual).strip()})
            atual = []
    return out


def por_heuristica(fr: list[dict], minimo: float, maximo: float, quantos: int) -> dict:
    def pontos(f):
        n = normalize(f["texto"])
        p = sum(n.count(k) for k in FORTES) * 2 + len(re.findall(r"\d|dez|cem|mil", n)) + 3 * n.count("?")
        return p - 4 * sum(k in n for k in BASTIDOR)

    candidatos = []
    for a in range(len(fr)):
        if normalize(fr[a]["texto"]).startswith(FRACAS_INICIO):
            continue
        for b in range(a, len(fr)):
            if any(k in normalize(fr[b]["texto"]) for k in BASTIDOR):
                break  # um corte nunca atravessa conversa de bastidor
            dur = (fr[b]["endMs"] - fr[a]["startMs"]) / 1000
            if dur > maximo:
                break
            if dur >= minimo:
                total = sum(pontos(f) for f in fr[a : b + 1])
                gancho = pontos(fr[a]) * 2
                candidatos.append((total / dur * 10 + gancho, a, b))
    escolhidos = []
    for nota, a, b in sorted(candidatos, reverse=True):
        if all(b < x or a > y for _, x, y in escolhidos):
            escolhidos.append((nota, a, b))
        if len(escolhidos) == quantos:
            break
    return {
        "clipes": [
            {"inicio": a, "fim": b, "titulo": titulo(fr[a]["texto"]), "nota": round(max(0, min(100, nota * 3)))}
            for nota, a, b in escolhidos
            if nota > 0
        ]
    }


def titulo(frase: str, maximo: int = 7) -> str:
    palavras = frase.rstrip(".!…").split()
    if len(palavras) <= maximo:
        return " ".join(palavras)
    return " ".join(palavras[: maximo - 1]).rstrip(",.:;") + "..."


def recortar(video: Path, inicio_s: float, fim_s: float, destino: Path) -> None:
    subprocess.run(
        [
            ffmpeg_exe(), "-y", "-loglevel", "error",
            "-ss", f"{inicio_s:.3f}", "-i", str(video), "-t", f"{fim_s - inicio_s:.3f}",
            "-c:v", "libx264", "-crf", "18", "-preset", "fast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-af", "afade=t=in:d=0.05",
            str(destino),
        ],
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("video", type=Path)
    add_ia_args(parser)
    parser.add_argument("--quantos", type=int, default=3)
    parser.add_argument("--minimo", type=float, default=15, help="duração mínima de cada clipe (s)")
    parser.add_argument("--maximo", type=float, default=60, help="duração máxima de cada clipe (s)")
    parser.add_argument("--vertical", action="store_true", help="converte cada clipe para 9:16 seguindo o rosto")
    parser.add_argument("--marca", default="", help='arquivo da marca em public/ (ex.: "marca.json")')
    args = parser.parse_args()

    captions_file = output_path(args.video, ".captions.json")
    if not captions_file.exists():
        raise SystemExit(f"Não achei {captions_file}. Rode antes: python scripts/transcribe.py {args.video}")
    captions = json.loads(captions_file.read_text(encoding="utf-8"))
    fr = frases(captions)

    if args.ia == "dicionario":
        plano = por_heuristica(fr, args.minimo, args.maximo, args.quantos)
    else:
        texto = "\n".join(f"{i} [{f['startMs'] / 1000:.1f}-{f['endMs'] / 1000:.1f}]: {f['texto']}" for i, f in enumerate(fr))
        instr = INSTRUCOES.format(minimo=int(args.minimo), maximo=int(args.maximo), quantos=args.quantos)
        try:
            plano = pedir_json(args, instr, texto, SCHEMA)
        except IaIndisponivel as e:
            avisar_sem_ia(e)
            plano = por_heuristica(fr, args.minimo, args.maximo, args.quantos)

    clipes = []
    for c in plano["clipes"]:
        a, b = c["inicio"], c["fim"]
        if not (0 <= a <= b < len(fr)):
            continue
        dur = (fr[b]["endMs"] - fr[a]["startMs"]) / 1000
        if dur < args.minimo * 0.7 or dur > args.maximo * 1.3:
            print(f"(ignorando trecho {a}-{b}: {dur:.0f}s fora do limite)")
            continue
        if any(not (b < x["fim"] or a > x["inicio"]) for x in clipes):
            continue
        clipes.append(c)
    clipes = clipes[: args.quantos]
    if not clipes:
        raise SystemExit("Nenhum trecho bom encontrado. Mude --minimo/--maximo ou tente outra --ia.")

    pasta = args.video.parent / "clips"
    pasta.mkdir(exist_ok=True)
    for antigo in pasta.glob(f"{args.video.stem}-[0-9]*.*"):  # clipes de uma rodada anterior
        antigo.unlink()
    resumo = []
    for n, c in enumerate(clipes, 1):
        inicio_ms = max(0, fr[c["inicio"]]["startMs"] - 150)
        fim_ms = fr[c["fim"]]["endMs"] + 350
        nome = f"{args.video.stem}-{n}"
        mp4 = pasta / f"{nome}.mp4"
        print(f"\n#{n} nota {c['nota']}  [{inicio_ms / 1000:.1f}s - {fim_ms / 1000:.1f}s]  \"{c['titulo']}\"")
        print("   " + " ".join(f["texto"] for f in fr[c["inicio"] : c["fim"] + 1])[:160] + "...")
        recortar(args.video, inicio_ms / 1000, fim_ms / 1000, mp4)
        if args.vertical:
            from reframe import reframe

            vertical = reframe(mp4)
            vertical.replace(mp4)

        # Legendas do trecho, no relógio do clipe.
        legendas = [
            {**w, "startMs": w["startMs"] - inicio_ms, "endMs": w["endMs"] - inicio_ms,
             "timestampMs": (w["timestampMs"] - inicio_ms) if w.get("timestampMs") is not None else None}
            for w in captions
            if w["startMs"] >= inicio_ms and w["endMs"] <= fim_ms
        ]
        (pasta / f"{nome}.captions.json").write_text(json.dumps(legendas, ensure_ascii=False, indent=1), encoding="utf-8")
        props = {
            "video": f"clips/{nome}.mp4",
            "captions": f"clips/{nome}.captions.json",
            "person": "",
            "cuts": "",
            "behindTexts": [],
            "zooms": [],
            "hookText": c["titulo"],
        }
        if args.marca:
            props["brand"] = args.marca
        (pasta / f"{nome}.props.json").write_text(json.dumps(props, ensure_ascii=False, indent=1), encoding="utf-8")
        resumo.append({"clipe": nome, "nota": c["nota"], "titulo": c["titulo"], "inicioMs": inicio_ms, "fimMs": fim_ms})

    (pasta / f"{args.video.stem}-clipes.json").write_text(json.dumps(resumo, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(clipes)} clipes em {pasta}/")
    print(f"Renderize todos:  python scripts/render_all.py {pasta}")
    print("Ou abra no Studio e cole o conteúdo de um .props.json nos campos.")


if __name__ == "__main__":
    main()
