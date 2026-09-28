"""Voz por IA (Kokoro: grátis, roda no seu computador, licença Apache-2.0).

Narrar um roteiro (vira um vídeo 9:16 com a narração e as legendas prontas):
    python scripts/voz.py narrar public/roteiro.txt
    python scripts/voz.py narrar public/roteiro.txt --fundo public/fundo.jpg --velocidade 1.1

Dublar um vídeo seu em outro idioma (tradução pelo Claude, ou --ia ollama):
    python scripts/voz.py dublar public/video.mp4 --idioma en
    python scripts/voz.py dublar public/video.mp4 --idioma es --ia ollama --manter-fundo 0.15

Na primeira vez, o modelo de voz (~90 MB) é baixado para scripts/modelos/.
Vozes: pm_alex, pm_santa, pf_dora (português); am_michael, af_heart (inglês); em_alex,
ef_dora (espanhol); ff_siwis (francês); im_nicola, if_sara (italiano). Use --voz.
"""

import argparse
import json
import re
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

from _common import baixar_modelo, ffmpeg_exe, output_path
from _ia import IaIndisponivel, add_ia_args, pedir_json

KOKORO = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/"
# Voz de cada idioma: feminina e masculina (o francês do Kokoro só tem voz feminina).
VOZES = {
    "pt": {"feminino": "pf_dora", "masculino": "pm_alex"},
    "en": {"feminino": "af_heart", "masculino": "am_michael"},
    "es": {"feminino": "ef_dora", "masculino": "em_alex"},
    "fr": {"feminino": "ff_siwis", "masculino": "ff_siwis"},
    "it": {"feminino": "if_sara", "masculino": "im_nicola"},
}
VOZES_PADRAO = {idioma: v["masculino"] for idioma, v in VOZES.items()}
IDIOMA_ESPEAK = {"pt": "pt-br", "en": "en-us", "es": "es", "fr": "fr-fr", "it": "it"}
NOMES = {"pt": "português do Brasil", "en": "inglês", "es": "espanhol", "fr": "francês", "it": "italiano"}
MAX_FONEMAS = 500  # o modelo aceita até 510 por vez; frases maiores são divididas


# ---------- voz ----------

class Voz:
    """Kokoro rodando no ONNX Runtime (processador)."""

    sample_rate = 24000

    def __init__(self, idioma: str, nome: str):
        import onnxruntime as ort

        modelo = baixar_modelo(KOKORO + "onnx/model_quantized.onnx", "kokoro.onnx")
        vocab = baixar_modelo(KOKORO + "tokenizer.json", "kokoro-tokenizer.json")
        estilo = baixar_modelo(KOKORO + f"voices/{nome}.bin", f"kokoro-{nome}.bin")
        self.sessao = ort.InferenceSession(str(modelo), providers=["CPUExecutionProvider"])
        self.vocab = json.loads(vocab.read_text(encoding="utf-8"))["model"]["vocab"]
        self.estilo = np.fromfile(estilo, dtype=np.float32).reshape(-1, 1, 256)
        self.idioma = idioma
        self.fonemas: dict[str, str] = {}

    def preparar(self, frases: list[str]) -> None:
        """Converte as frases em fonemas de uma vez (o espeak-ng roda num programa à parte,
        o scripts/fonemas.py, por causa da licença GPL dele)."""
        novas = [f for f in dict.fromkeys(frases) if f not in self.fonemas]
        if not novas:
            return
        r = subprocess.run(
            [sys.executable, str(Path(__file__).with_name("fonemas.py")), "--idioma", IDIOMA_ESPEAK[self.idioma]],
            input=json.dumps(novas, ensure_ascii=False).encode("utf-8"),
            capture_output=True,
        )
        if r.returncode != 0:
            raise SystemExit("Não consegui preparar a pronúncia: " + r.stderr.decode("utf-8", "replace")[-400:])
        self.fonemas.update(zip(novas, json.loads(r.stdout.decode("utf-8"))))

    def _pedaco(self, fonemas: str, velocidade: float) -> np.ndarray:
        tokens = [self.vocab[c] for c in fonemas if c in self.vocab]
        if not tokens:
            return np.zeros(0, np.float32)
        entrada = {
            "input_ids": np.array([[0, *tokens, 0]], dtype=np.int64),
            "style": self.estilo[min(len(tokens), len(self.estilo)) - 1],
            "speed": np.array([velocidade], dtype=np.float32),
        }
        return np.asarray(self.sessao.run(None, entrada)[0], dtype=np.float32).ravel()

    def falar(self, texto: str, velocidade: float = 1.0) -> np.ndarray:
        self.preparar([texto])
        fon = " ".join(self.fonemas[texto].split())
        # Frase longa: divide nos espaços em pedaços que o modelo aceita.
        pedacos, atual = [], ""
        for palavra in fon.split(" "):
            if atual and len(atual) + 1 + len(palavra) > MAX_FONEMAS:
                pedacos.append(atual)
                atual = palavra
            else:
                atual = f"{atual} {palavra}".strip()
        if atual:
            pedacos.append(atual)
        partes = [self._pedaco(p, min(2.0, max(0.5, velocidade))) for p in pedacos]
        return np.concatenate(partes) if partes else np.zeros(0, np.float32)


def genero_da_fala(video: Path) -> str | None:
    """Voz feminina ou masculina, pelo tom médio da fala (acima de ~165 Hz costuma ser feminina)."""
    try:
        from faster_whisper.audio import decode_audio
        from faster_whisper.vad import VadOptions, get_speech_timestamps
        audio = decode_audio(str(video))
    except Exception:
        return None
    trechos = get_speech_timestamps(audio, VadOptions(min_silence_duration_ms=200))
    fala = np.concatenate([audio[t["start"]:t["end"]] for t in trechos]) if trechos else audio
    # YIN (o método dos afinadores): menos confusão com a oitava de cima ou de baixo.
    janela, passo = 800, 400  # 50 ms / 25 ms a 16 kHz
    menor, maior = 16000 // 400, 16000 // 70  # tons de 70 a 400 Hz
    tons = []
    energia_min = float(np.percentile(np.abs(fala), 60)) if len(fala) else 0
    for i in range(0, len(fala) - janela - maior, passo):
        q = fala[i : i + janela + maior].astype(np.float64)
        if np.abs(q[:janela]).mean() < energia_min:
            continue
        x = q[:janela]
        dif = np.array([np.sum((x - q[t : t + janela]) ** 2) for t in range(1, maior + 1)])
        cmnd = dif * np.arange(1, maior + 1) / np.maximum(np.cumsum(dif), 1e-12)
        abaixo = np.nonzero(cmnd[menor - 1 :] < 0.15)[0]
        if not len(abaixo):
            continue
        t = abaixo[0] + menor - 1
        while t + 1 < len(cmnd) and cmnd[t + 1] < cmnd[t]:  # desce até o fundo do vale
            t += 1
        tons.append(16000 / (t + 1))
    if len(tons) < 20:
        return None
    tom = float(np.median(tons))
    print(f"(tom médio da voz: {tom:.0f} Hz)")
    return "feminino" if tom >= 165 else "masculino"


def carregar_voz(idioma: str, nome: str | None = None, genero: str | None = None) -> Voz:
    nome = nome or VOZES[idioma][genero or "masculino"]
    print(f"(voz {nome}; na primeira vez o modelo é baixado)")
    return Voz(idioma, nome)


def falar(voz: Voz, texto: str, velocidade: float = 1.0) -> np.ndarray:
    return voz.falar(texto, velocidade)


def salvar_wav(audio: np.ndarray, taxa: int, destino: Path) -> None:
    pico = np.abs(audio).max() if len(audio) else 0
    if pico > 0.99:
        audio = audio / pico * 0.99
    with wave.open(str(destino), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(taxa)
        w.writeframes((audio * 32767).astype("<i2").tobytes())


def silencio(segundos: float, taxa: int) -> np.ndarray:
    return np.zeros(int(segundos * taxa), np.float32)


# ---------- narrar ----------

def _norm(p: str) -> str:
    import unicodedata

    p = unicodedata.normalize("NFD", p.lower())
    return re.sub(r"[^\w]", "", "".join(c for c in p if unicodedata.category(c) != "Mn"))


def alinhar_ao_roteiro(captions: list[dict], roteiro: str) -> list[dict]:
    """Usa os tempos do Whisper, mas o texto exato do roteiro (o Whisper erra nomes,
    palavras estrangeiras e escreve "cem reais" como "R$ 100")."""
    from difflib import SequenceMatcher

    palavras = roteiro.split()
    ops = SequenceMatcher(a=[_norm(c["text"]) for c in captions], b=[_norm(p) for p in palavras], autojunk=False)
    out = []
    for tag, i1, i2, j1, j2 in ops.get_opcodes():
        if tag == "equal":
            for c, p in zip(captions[i1:i2], palavras[j1:j2]):
                out.append({**c, "text": " " + p})
            continue
        if j1 == j2:
            continue  # palavra que o Whisper inventou
        # Espalha as palavras do roteiro pelo tempo das palavras do Whisper que elas substituem.
        if i1 < i2:
            ini, fim = captions[i1]["startMs"], captions[i2 - 1]["endMs"]
        else:
            ini = out[-1]["endMs"] if out else 0
            fim = captions[i1]["startMs"] if i1 < len(captions) else ini + 300 * (j2 - j1)
            fim = max(fim, ini + 150 * (j2 - j1))
        pesos = [len(p) + 2 for p in palavras[j1:j2]]
        t = ini
        for p, w in zip(palavras[j1:j2], pesos):
            d = (fim - ini) * w / sum(pesos)
            out.append({"text": " " + p, "startMs": round(t), "endMs": round(t + d),
                        "timestampMs": round(t + d / 2), "confidence": None})
            t += d
    return out


def narrar(args: argparse.Namespace) -> None:
    texto = args.roteiro.read_text(encoding="utf-8").strip()
    if not texto:
        raise SystemExit("O roteiro está vazio.")
    voz = carregar_voz(args.idioma, args.voz, None if args.genero == "auto" else args.genero)
    taxa = voz.sample_rate

    blocos = [silencio(0.3, taxa)]
    paragrafos = [p for p in re.split(r"\n\s*\n", texto) if p.strip()]
    voz.preparar([f for p in paragrafos for f in re.split(r"(?<=[.!?…])\s+", " ".join(p.split())) if f])
    for i, paragrafo in enumerate(paragrafos):
        frases = [f for f in re.split(r"(?<=[.!?…])\s+", " ".join(paragrafo.split())) if f]
        for frase in frases:
            print(f"  🎙  {frase}")
            blocos += [falar(voz, frase, args.velocidade), silencio(0.28, taxa)]
        if i < len(paragrafos) - 1:
            blocos.append(silencio(0.45, taxa))
    blocos.append(silencio(0.6, taxa))
    audio = np.concatenate(blocos)

    wav = output_path(args.roteiro, ".voz.wav")
    salvar_wav(audio, taxa, wav)
    duracao = len(audio) / taxa

    out = output_path(args.roteiro, ".mp4")
    escala = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p"
    if args.fundo is None:
        fundo = ["-f", "lavfi", "-i", f"gradients=s=1080x1920:c0=0x14142b:c1=0x0e3b43:c2=0x2b1437:n=3:speed=0.004:r=30:d={duracao:.2f}"]
    elif args.fundo.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
        fundo = ["-loop", "1", "-i", str(args.fundo)]
    else:
        fundo = ["-stream_loop", "-1", "-i", str(args.fundo)]
    subprocess.run(
        [ffmpeg_exe(), "-y", "-loglevel", "error", *fundo, "-i", str(wav),
         "-map", "0:v", "-map", "1:a", "-vf", escala, "-t", f"{duracao:.2f}",
         "-c:v", "libx264", "-crf", "20", "-preset", "fast", "-c:a", "aac", "-b:a", "192k", str(out)],
        check=True,
    )
    wav.unlink()
    print(f"\nnarração de {duracao:.1f}s -> {out}")
    if not args.sem_legenda:
        from transcribe import transcrever

        legendas = transcrever(out, language=args.idioma)
        alinhadas = alinhar_ao_roteiro(json.loads(legendas.read_text(encoding="utf-8")), texto)
        legendas.write_text(json.dumps(alinhadas, ensure_ascii=False, indent=1), encoding="utf-8")
        print("legendas alinhadas ao texto do roteiro:", "".join(c["text"] for c in alinhadas)[:120], "...")
    print("Dica: python scripts/broll.py", out, "  (cobre a narração com imagens do Pexels)")


# ---------- dublar ----------

INSTRUCOES_TRADUCAO = """Você traduz vídeos curtos (Reels/TikTok) para dublagem.
Traduza cada frase abaixo para {idioma}, com linguagem natural e falada, do jeito que um
criador de conteúdo nativo diria. Mantenha o tamanho parecido com o original (a dublagem
precisa caber no mesmo tempo); se precisar, encurte sem perder o sentido.
Números, nomes e marcas continuam iguais. Responda uma tradução para CADA índice da lista, sem
pular nenhum e sem juntar frases (mesmo as curtinhas, como "É isso." ou "Olha só.")."""

SCHEMA_TRADUCAO = {
    "type": "object",
    "properties": {
        "traducoes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"indice": {"type": "integer"}, "texto": {"type": "string"}},
                "required": ["indice", "texto"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["traducoes"],
    "additionalProperties": False,
}


def duracao_video(video: Path) -> float:
    import cv2

    cap = cv2.VideoCapture(str(video))
    d = cap.get(cv2.CAP_PROP_FRAME_COUNT) / (cap.get(cv2.CAP_PROP_FPS) or 30)
    cap.release()
    return d


def dublar(args: argparse.Namespace) -> None:
    if args.ia == "dicionario":
        raise SystemExit("A dublagem precisa de IA para traduzir: use --ia claude ou --ia ollama.")
    captions_file = output_path(args.video, ".captions.json")
    if not captions_file.exists():
        raise SystemExit(f"Não achei {captions_file}. Rode antes: python scripts/transcribe.py {args.video}")

    from clips import frases

    fr = frases(json.loads(captions_file.read_text(encoding="utf-8")), pausa_ms=500)
    texto = "\n".join(f"{i}: {f['texto']}" for i, f in enumerate(fr))
    try:
        resposta = pedir_json(args, INSTRUCOES_TRADUCAO.format(idioma=NOMES[args.idioma]), texto, SCHEMA_TRADUCAO)
    except IaIndisponivel as e:
        raise SystemExit(f"A dublagem precisa de IA para traduzir, mas {str(e)[0].lower()}{str(e)[1:]}")
    traducao = {t["indice"]: t["texto"].strip() for t in resposta["traducoes"] if 0 <= t["indice"] < len(fr)}

    # Frase que a IA deixou sem tradução ficaria muda: pede de novo só as que faltaram.
    faltando = [i for i in range(len(fr)) if not traducao.get(i)]
    if faltando:
        print(f"(faltou traduzir {len(faltando)} frase(s); pedindo de novo)")
        texto2 = "\n".join(f"{i}: {fr[i]['texto']}" for i in faltando)
        try:
            r2 = pedir_json(args, INSTRUCOES_TRADUCAO.format(idioma=NOMES[args.idioma]), texto2, SCHEMA_TRADUCAO)
            traducao.update({t["indice"]: t["texto"].strip() for t in r2["traducoes"] if t["indice"] in faltando})
        except IaIndisponivel:
            pass
        ainda = [i for i in faltando if not traducao.get(i)]
        if ainda:
            print(f"AVISO: {len(ainda)} frase(s) ficaram sem tradução e sem voz: " + "; ".join(fr[i]["texto"][:40] for i in ainda))

    genero = None if args.genero == "auto" else args.genero
    if not args.voz and not genero:
        genero = genero_da_fala(args.video) or "masculino"
        print(f"(voz {'feminina' if genero == 'feminino' else 'masculina'}, igual à de quem fala no vídeo)")
    voz = carregar_voz(args.idioma, args.voz, genero)
    taxa = voz.sample_rate
    voz.preparar([t for t in traducao.values() if t])
    total = duracao_video(args.video)
    faixa = np.zeros(int((total + 1) * taxa), np.float32)

    cursor = 0.0  # fim da última fala colocada (s), para nunca sobrepor duas falas
    for i, f in enumerate(fr):
        frase = traducao.get(i)
        if not frase:
            print(f"  (sem tradução para a frase {i}, pulando)")
            continue
        inicio = max(f["startMs"] / 1000, cursor)
        fim_slot = (fr[i + 1]["startMs"] / 1000 - 0.08) if i + 1 < len(fr) else total
        espaco = max(0.3, fim_slot - inicio)

        audio = falar(voz, frase, args.velocidade)
        dur = len(audio) / taxa
        if dur > espaco:
            # Fala um pouco mais rápido para caber no tempo da frase original (até 1,4x).
            fator = min(1.4, dur / espaco)
            audio = falar(voz, frase, args.velocidade * fator)
            dur = len(audio) / taxa
            frase += f"  ({fator:.2f}x)"
        a = int(inicio * taxa)
        if a + len(audio) > len(faixa):
            faixa = np.concatenate([faixa, np.zeros(a + len(audio) - len(faixa), np.float32)])
        faixa[a : a + len(audio)] += audio
        cursor = inicio + dur + 0.05
        print(f"  {f['startMs'] / 1000:6.1f}s  {f['texto'][:40]:<40} -> {frase}")

    wav = output_path(args.video, f".{args.idioma}.wav")
    salvar_wav(faixa[: int(max(total, cursor) * taxa)], taxa, wav)

    out = output_path(args.video, f".{args.idioma}.mp4")
    if args.manter_fundo > 0:
        # Mantém o som original baixinho por baixo (música/ambiente).
        audio_args = ["-filter_complex",
                      f"[0:a]volume={args.manter_fundo}[bg];[1:a]aresample=48000[dub];[bg][dub]amix=inputs=2:normalize=0[a]",
                      "-map", "[a]"]
    else:
        audio_args = ["-map", "1:a"]
    final = max(total, cursor)
    if cursor > total + 0.05:
        # A dublagem passou do fim do vídeo: congela o último quadro até ela acabar.
        print(f"(a dublagem ficou {cursor - total:.1f}s mais longa; congelando o último quadro)")
        video_args = ["-vf", f"tpad=stop_mode=clone:stop_duration={cursor - total + 0.2:.2f}",
                      "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p"]
    else:
        video_args = ["-c:v", "copy"]
    subprocess.run(
        [ffmpeg_exe(), "-y", "-loglevel", "error", "-i", str(args.video), "-i", str(wav),
         "-map", "0:v", *audio_args, *video_args, "-c:a", "aac", "-b:a", "192k", "-t", f"{final:.3f}", str(out)],
        check=True,
    )
    wav.unlink()
    print(f"\n-> {out}")
    if not args.sem_legenda:
        from transcribe import transcrever

        transcrever(out, language=args.idioma)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="modo", required=True)

    n = sub.add_parser("narrar", help="roteiro .txt -> vídeo narrado com legendas")
    n.add_argument("roteiro", type=Path)
    n.add_argument("--fundo", type=Path, help="imagem ou vídeo de fundo (padrão: gradiente animado)")
    n.add_argument("--idioma", choices=sorted(VOZES_PADRAO), default="pt")

    d = sub.add_parser("dublar", help="vídeo -> mesmo vídeo dublado em outro idioma")
    d.add_argument("video", type=Path)
    d.add_argument("--idioma", choices=sorted(VOZES_PADRAO), required=True)
    d.add_argument("--manter-fundo", type=float, default=0.0, help="volume do áudio original por baixo (0 a 1)")
    add_ia_args(d)

    for p in (n, d):
        p.add_argument("--voz", help="nome de uma voz do Kokoro, ex.: pf_dora (feminina, português)")
        p.add_argument("--genero", choices=["auto", "feminino", "masculino"], default="auto",
                       help="voz feminina ou masculina (auto: na dublagem, igual à de quem fala; na narração, masculina)")
        p.add_argument("--velocidade", type=float, default=1.0, help="1.1 = 10%% mais rápido")
        p.add_argument("--sem-legenda", action="store_true", help="não gera as legendas no final")

    args = parser.parse_args()
    narrar(args) if args.modo == "narrar" else dublar(args)


if __name__ == "__main__":
    main()
