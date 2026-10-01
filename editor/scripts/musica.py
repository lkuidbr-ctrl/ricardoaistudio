"""Biblioteca de músicas: descobre o ritmo de cada música e escolhe a que combina com o vídeo.

Uso:
    python scripts/musica.py analisar public/musicas/minha-musica.mp3     # uma ou várias
    python scripts/musica.py escolher public/video.mp4                    # Claude escolhe (padrão)
    python scripts/musica.py escolher public/video.mp4 --ia dicionario    # sem IA: a menos usada

"analisar" grava ao lado da música um <música>.ritmo.json com:
    bpm, batidas (ms), energia (0 a 1), clima, inicioMs (onde a parte boa começa) e duracaoMs.
"escolher" lê a legenda do vídeo e as músicas de public/musicas/ e grava <vídeo>.musica.json
com as músicas em ordem (a melhor primeiro); o Studio coloca a primeira e o botão Trocar passa
para as próximas. Músicas usadas nos últimos vídeos ficam para o fim da fila.

Só usa numpy e o ffmpeg que já vêm com o Studio (sem bibliotecas novas).
"""

import argparse
import json
import random
import subprocess
from pathlib import Path

import numpy as np

from _common import ffmpeg_exe, output_path
from _ia import IaIndisponivel, add_ia_args, avisar_sem_ia, pedir_json

PUBLIC = Path(__file__).resolve().parent.parent / "public"
MUSICAS = PUBLIC / "musicas"
EXTENSOES = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".opus"}
HISTORICO = MUSICAS / ".historico.json"

SR = 22050
HOP = 512
FPS_ENV = SR / HOP  # quadros do envelope por segundo (~43)
ATRASO_MS = 70


# ---------------------------------------------------------------------------- análise

def ler_audio(arquivo: Path) -> np.ndarray:
    cmd = [ffmpeg_exe(), "-v", "error", "-i", str(arquivo), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    bruto = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(bruto, dtype=np.float32)


def envelope_de_ataques(y: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Força dos "ataques" (bumbo, caixa, notas novas) ao longo do tempo, volume e brilho."""
    n_fft = 2048
    if len(y) < n_fft * 4:
        raise SystemExit("Música curta demais para analisar.")
    quadros = 1 + (len(y) - n_fft) // HOP
    janela = np.hanning(n_fft).astype(np.float32)
    idx = np.arange(n_fft)[None, :] + HOP * np.arange(quadros)[:, None]
    espectro = np.abs(np.fft.rfft(y[idx] * janela, axis=1))
    log = np.log1p(100 * espectro)
    subida = np.maximum(0, np.diff(log, axis=0))
    # Cada faixa de frequência (graves, médios, agudos) pesa igual, como o ouvido: sem isso o
    # chimbal (que ocupa muitas frequências agudas) "ganha" do bumbo e a batida sai no contratempo.
    freqs = np.fft.rfftfreq(n_fft, 1 / SR)
    bordas = np.geomspace(40, 11000, 41)
    faixa = np.digitize(freqs, bordas)
    fluxo = np.zeros(len(subida))
    for b in range(1, len(bordas)):
        sel = faixa == b
        if sel.any():
            fluxo += subida[:, sel].mean(axis=1)
    fluxo = np.concatenate([[0], fluxo])
    # Tira a "média local" para sobrar só os picos.
    media = np.convolve(fluxo, np.ones(16) / 16, mode="same")
    ataques = np.maximum(0, fluxo - media)
    ataques /= ataques.std() + 1e-9
    rms = np.sqrt((y[idx] ** 2).mean(axis=1))
    brilho = (espectro * freqs).sum(axis=1) / (espectro.sum(axis=1) + 1e-9)
    return ataques, rms, brilho


def achar_bpm(ataques: np.ndarray) -> float:
    """Andamento: testa cada BPM de 65 a 190 e soma a autocorrelação dos ataques em 1, 2, 3 e 4
    batidas de distância (pulso que se repete), preferindo valores perto de 120 BPM."""
    suave = np.convolve(ataques, np.hanning(5) / np.hanning(5).sum(), mode="same")
    ac = np.correlate(suave, suave, mode="full")[len(suave) - 1:]
    ac = ac / (ac[0] + 1e-9)
    lags = np.arange(len(ac))
    candidatos = np.arange(65, 190.01, 0.25)
    pontos = []
    for bpm in candidatos:
        periodo = 60 * FPS_ENV / bpm
        soma = sum(np.interp(k * periodo, lags, ac) for k in (1, 2, 3, 4)) / 4
        # Meio pulso também conta (contratempo), com peso menor.
        soma += 0.25 * np.interp(periodo / 2, lags, ac)
        preferencia = np.exp(-0.5 * (np.log2(bpm / 120) / 1.0) ** 2)
        pontos.append(soma * preferencia)
    return float(candidatos[int(np.argmax(pontos))])


def achar_batidas(ataques: np.ndarray, bpm: float) -> np.ndarray:
    """Batidas por programação dinâmica (Ellis, 2007): segue os ataques mantendo o andamento."""
    periodo = 60 * FPS_ENV / bpm
    n = len(ataques)
    pontos = ataques.astype(np.float64).copy()
    anterior = np.full(n, -1)
    busca = np.arange(-int(round(2 * periodo)), -int(round(periodo / 2)) + 1)
    custo = -100 * np.log(-busca / periodo) ** 2
    for t in range(n):
        cand = t + busca
        ok = cand >= 0
        if not ok.any():
            continue
        valores = pontos[cand[ok]] + custo[ok]
        melhor = int(np.argmax(valores))
        pontos[t] = ataques[t] + valores[melhor]
        anterior[t] = cand[ok][melhor]
    # Começa da melhor batida perto do fim e volta.
    fim = n - 1 - int(np.argmax(pontos[::-1][: int(periodo) + 1]))
    batidas = [fim]
    while anterior[batidas[-1]] >= 0:
        batidas.append(anterior[batidas[-1]])
    return np.array(batidas[::-1])


def analisar(arquivo: Path) -> dict:
    y = ler_audio(arquivo)
    ataques, rms, brilho = envelope_de_ataques(y)
    bpm = achar_bpm(ataques)
    batidas = achar_batidas(ataques, bpm)
    # A janela de análise "enxerga" o ataque uns 70 ms antes; compensa.
    batidas_ms = [int(round(b * 1000 / FPS_ENV)) + ATRASO_MS for b in batidas]
    duracao_ms = int(len(y) * 1000 / SR)

    # Energia: andamento, brilho do som e quantidade de ataques fortes.
    vel = np.clip((bpm - 70) / 100, 0, 1)
    claro = np.clip((np.median(brilho[rms > rms.max() * 0.05]) - 1200) / 2300, 0, 1)
    densidade = np.clip(((ataques > 2).mean() * FPS_ENV - 1) / 5, 0, 1)
    energia = float(round(0.4 * vel + 0.3 * claro + 0.3 * densidade, 2))
    clima = "calma" if energia < 0.35 else "animada" if energia < 0.65 else "intensa"

    # Onde a "parte boa" começa: o compasso em que o volume chega perto do mais alto da música
    # (pula introduções calmas, comuns nas músicas do Suno). Fica nos primeiros 40%.
    seg = int(FPS_ENV)
    volume = np.convolve(rms, np.ones(seg) / seg, mode="same")
    alvo = np.percentile(volume, 90) * 0.85
    acima = np.nonzero(volume >= alvo)[0]
    inicio_ms = 0
    if len(acima):
        candidato = acima[0] * 1000 / FPS_ENV
        compassos = batidas_ms[::4] or [0]
        inicio_ms = min(compassos, key=lambda c: abs(c - candidato))
        # Se a música já começa forte (ou a parte boa demora demais), toca do começo.
        if inicio_ms < 1500 or inicio_ms > duracao_ms * 0.4:
            inicio_ms = 0
    return {
        "bpm": round(float(bpm), 1),
        "batidas": batidas_ms,
        "energia": energia,
        "clima": clima,
        "inicioMs": int(inicio_ms),
        "duracaoMs": duracao_ms,
    }


def arquivo_ritmo(musica: Path) -> Path:
    return musica.with_name(musica.name + ".ritmo.json")


def garantir_analise(musica: Path) -> dict:
    destino = arquivo_ritmo(musica)
    if destino.exists() and destino.stat().st_mtime >= musica.stat().st_mtime:
        return json.loads(destino.read_text(encoding="utf-8"))
    info = analisar(musica)
    destino.write_text(json.dumps(info), encoding="utf-8")
    print(f"{musica.name}: {info['bpm']} BPM, {info['clima']} (energia {info['energia']}), "
          f"começa em {info['inicioMs'] / 1000:.1f}s")
    return info


# ---------------------------------------------------------------------------- escolha

INSTRUCOES = """Você escolhe a música de fundo de um vídeo curto (Reels/TikTok) em português.
Recebe o que é falado no vídeo e a lista de músicas disponíveis (nome do arquivo, andamento em BPM,
clima e energia de 0 a 1). O nome do arquivo costuma dizer o estilo ou o título da música.

Ordene TODAS as músicas da que mais combina para a que menos combina com o assunto e o tom do
vídeo. Vídeo de dica rápida, venda ou motivação pede música animada; história, emoção ou assunto
sério pede música calma. As marcadas "usada há pouco" devem ir mais para o fim, a não ser que só
elas combinem muito. Responda com os nomes exatamente como na lista e um motivo curto em português."""

SCHEMA = {
    "type": "object",
    "properties": {
        "ordem": {"type": "array", "items": {"type": "string"}},
        "motivo": {"type": "string"},
    },
    "required": ["ordem", "motivo"],
    "additionalProperties": False,
}


def biblioteca() -> list[Path]:
    if not MUSICAS.exists():
        return []
    return sorted(p for p in MUSICAS.iterdir() if p.suffix.lower() in EXTENSOES and not p.name.startswith("."))


def ler_historico() -> list[str]:
    try:
        return json.loads(HISTORICO.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []


def escolher(video: Path, args: argparse.Namespace) -> dict:
    musicas = biblioteca()
    if not musicas:
        raise SystemExit("A pasta de músicas está vazia. Coloque músicas em Áudio > Minhas músicas.")
    infos = {}
    for m in musicas:
        try:
            infos[m.name] = garantir_analise(m)
        except Exception as e:  # música corrompida não pode travar a escolha
            print(f"AVISO: não consegui analisar {m.name} ({e}).")
    nomes = [n for n in infos]
    if not nomes:
        raise SystemExit("Não consegui ler nenhuma música da pasta.")
    recentes = ler_historico()[-max(1, len(nomes) // 2):]

    # Sem IA (ou se ela falhar): as menos usadas primeiro, em ordem sorteada.
    def sem_ia() -> list[str]:
        novas = [n for n in nomes if n not in recentes]
        random.shuffle(novas)
        return novas + [n for n in recentes if n in nomes]

    ordem, motivo = None, ""
    legenda = output_path(video, ".captions.json")
    if args.ia != "dicionario" and legenda.exists():
        palavras = json.loads(legenda.read_text(encoding="utf-8"))
        fala = " ".join(w["text"].strip() for w in palavras)[:3000]
        lista = "\n".join(
            f"- {n}: {infos[n]['bpm']:.0f} BPM, {infos[n]['clima']}, energia {infos[n]['energia']}"
            + (" (usada há pouco)" if n in recentes else "")
            for n in nomes
        )
        try:
            r = pedir_json(args, INSTRUCOES, f"O que é falado no vídeo:\n{fala}\n\nMúsicas:\n{lista}", SCHEMA)
            vistos = [n for n in r.get("ordem", []) if n in infos]
            ordem = list(dict.fromkeys(vistos)) + [n for n in sem_ia() if n not in vistos]
            motivo = r.get("motivo", "").strip()
        except IaIndisponivel as e:
            avisar_sem_ia(e)
    if not ordem:
        ordem = sem_ia()

    escolha = {
        "opcoes": [f"musicas/{n}" for n in ordem],
        "inicios": {f"musicas/{n}": infos[n]["inicioMs"] for n in ordem},
        "motivo": motivo,
    }
    destino = output_path(video, ".musica.json")
    destino.write_text(json.dumps(escolha, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"música: {ordem[0]}" + (f" ({motivo})" if motivo else ""))
    print(f"-> {destino}")
    return escolha


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="acao", required=True)
    a = sub.add_parser("analisar", help="descobre o ritmo das músicas")
    a.add_argument("musicas", type=Path, nargs="*", help="arquivos (vazio = todas de public/musicas)")
    e = sub.add_parser("escolher", help="escolhe a música do vídeo")
    e.add_argument("video", type=Path)
    add_ia_args(e)
    args = parser.parse_args()

    if args.acao == "analisar":
        for m in args.musicas or biblioteca():
            garantir_analise(m)
    else:
        escolher(args.video, args)


if __name__ == "__main__":
    main()
