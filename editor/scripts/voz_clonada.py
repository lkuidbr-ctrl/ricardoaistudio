"""Voz clonada: fala qualquer texto com a voz de quem aparece no vídeo.

Usa o Chatterbox Multilingual (Resemble AI, licença MIT) no ONNX Runtime, sem PyTorch. Basta
uns 10 segundos da voz da pessoa, que o Studio tira do próprio vídeo. Fala português, inglês,
espanhol, francês, italiano e outros 18 idiomas.

Na primeira vez o modelo (~1,5 GB) é baixado para scripts/modelos/chatterbox/.
É usado pelo voz.py (dublar --voz-clonada); para testar sozinho:
    python scripts/voz_clonada.py public/video.mp4 "Hello, this is my voice." --idioma en
"""

import argparse
import subprocess
from pathlib import Path

import numpy as np

from _common import baixar_modelo, ffmpeg_exe, output_path

REPO = "https://huggingface.co/onnx-community/chatterbox-multilingual-ONNX/resolve/main/"
TAXA = 24000
INICIO_FALA = 6561
FIM_FALA = 6562
CAMADAS, CABECAS_KV, DIM_CABECA = 30, 16, 64


def ler_audio(arquivo: Path, inicio: float = 0, duracao: float | None = None) -> np.ndarray:
    cmd = [ffmpeg_exe(), "-v", "error", "-ss", f"{inicio:.3f}"]
    if duracao:
        cmd += ["-t", f"{duracao:.3f}"]
    cmd += ["-i", str(arquivo), "-vn", "-ac", "1", "-ar", str(TAXA), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32)


def amostra_da_voz(video: Path, segundos: float = 10.0) -> np.ndarray:
    """Junta os trechos com fala do vídeo (sem as pausas) até dar ~10 s: é o "molde" da voz.
    Usa o áudio melhorado (sem ruído), se existir."""
    melhorado = output_path(video, ".voz.m4a")
    fonte = melhorado if melhorado.exists() else video
    audio = ler_audio(fonte)
    if not len(audio):
        raise SystemExit("O vídeo não tem som para copiar a voz.")
    try:
        from faster_whisper.vad import VadOptions, get_speech_timestamps

        # O detector de voz trabalha a 16 kHz.
        a16 = np.interp(np.arange(0, len(audio), TAXA / 16000), np.arange(len(audio)), audio).astype(np.float32)
        trechos = get_speech_timestamps(a16, VadOptions(min_silence_duration_ms=300))
        partes, total = [], 0
        for t in trechos:
            # Trechos de menos de meio segundo (respiração, clique) não servem de molde.
            a, b = int(t["start"] * TAXA / 16000), int(t["end"] * TAXA / 16000)
            if b - a < TAXA // 2:
                continue
            partes.append(audio[a:b])
            total += b - a
            if total >= segundos * TAXA:
                break
        if partes:
            audio = np.concatenate(partes)
    except Exception:
        pass  # sem o detector de voz, usa o começo do áudio
    audio = audio[: int(segundos * TAXA)]
    pico = np.abs(audio).max() or 1
    return (audio / pico * 0.9).astype(np.float32)


class VozClonada:
    """Mesma "cara" da voz Kokoro do voz.py: preparar(frases) e falar(texto, velocidade)."""

    sample_rate = TAXA

    def __init__(self, idioma: str, amostra: np.ndarray):
        import onnxruntime as ort
        from tokenizers import Tokenizer

        def baixar(nome: str) -> Path:
            return baixar_modelo(REPO + nome, "chatterbox/" + nome.split("/")[-1])

        caminhos = {}
        for parte in ("speech_encoder", "embed_tokens", "conditional_decoder", "language_model_q4"):
            caminhos[parte] = baixar(f"onnx/{parte}.onnx")
            baixar(f"onnx/{parte}.onnx_data")
        tokenizer = baixar("tokenizer.json")

        opcoes = ort.SessionOptions()
        opcoes.log_severity_level = 3
        sessao = lambda p: ort.InferenceSession(str(caminhos[p]), opcoes, providers=["CPUExecutionProvider"])
        self.codificador = sessao("speech_encoder")
        self.embed = sessao("embed_tokens")
        self.modelo = sessao("language_model_q4")
        self.decodificador = sessao("conditional_decoder")
        self.tokenizer = Tokenizer.from_file(str(tokenizer))
        self.idioma = idioma
        # O molde da voz é calculado uma vez só e reaproveitado em todas as frases.
        saida = self.codificador.run(None, {"audio_values": amostra[np.newaxis, :]})
        self.cond_emb, self.prompt_token, self.x_vector, self.prompt_feat = saida
        self._feitas: dict[str, np.ndarray] = {}

    def preparar(self, frases: list[str]) -> None:
        pass  # não precisa de pronúncia à parte

    def _gerar(self, texto: str, intensidade: float = 0.5) -> np.ndarray:
        ids = np.array([self.tokenizer.encode(f"[{self.idioma}]{texto}").ids], dtype=np.int64)
        posicoes = np.where(ids >= INICIO_FALA, 0, np.arange(ids.shape[1])[np.newaxis, :] - 1).astype(np.int64)
        entrada = {"input_ids": ids, "position_ids": posicoes, "exaggeration": np.array([intensidade], dtype=np.float32)}
        gerados = np.array([[INICIO_FALA]], dtype=np.int64)
        passado = {
            f"past_key_values.{c}.{kv}": np.zeros([1, CABECAS_KV, 0, DIM_CABECA], dtype=np.float32)
            for c in range(CAMADAS)
            for kv in ("key", "value")
        }
        # ~25 tokens por segundo de fala; limite folgado pelo tamanho do texto.
        limite = min(1000, 80 + len(texto) * 6)
        mascara = None
        for i in range(limite):
            emb = self.embed.run(None, entrada)[0]
            if i == 0:
                emb = np.concatenate((self.cond_emb, emb), axis=1)
                mascara = np.ones((1, emb.shape[1]), dtype=np.int64)
            logits, *presente = self.modelo.run(None, dict(inputs_embeds=emb, attention_mask=mascara, **passado))
            logits = logits[:, -1, :]
            # Penalidade de repetição (1.2), como no original: evita a voz "travar" num som.
            vistos = np.take_along_axis(logits, gerados, axis=1)
            vistos = np.where(vistos < 0, vistos * 1.2, vistos / 1.2)
            np.put_along_axis(logits, gerados, vistos, axis=1)
            prox = np.argmax(logits, axis=-1, keepdims=True).astype(np.int64)
            gerados = np.concatenate((gerados, prox), axis=-1)
            if int(prox[0, 0]) == FIM_FALA:
                break
            entrada["input_ids"] = prox
            entrada["position_ids"] = np.full((1, 1), i + 1, dtype=np.int64)
            mascara = np.concatenate([mascara, np.ones((1, 1), dtype=np.int64)], axis=1)
            for j, chave in enumerate(passado):
                passado[chave] = presente[j]
        tokens = gerados[:, 1:]
        if tokens.shape[1] and int(tokens[0, -1]) == FIM_FALA:
            tokens = tokens[:, :-1]
        tokens = np.concatenate([self.prompt_token, tokens], axis=1)
        wav = self.decodificador.run(None, {
            "speech_tokens": tokens,
            "speaker_embeddings": self.x_vector,
            "speaker_features": self.prompt_feat,
        })[0]
        return np.squeeze(wav, axis=0).astype(np.float32)

    def falar(self, texto: str, velocidade: float = 1.0) -> np.ndarray:
        # A dublagem pede a mesma frase de novo, mais rápida, quando não cabe no tempo: gerar de
        # novo é demorado, então reaproveita a fala e só acelera.
        if texto not in self._feitas:
            audio = self._gerar(texto)
            # Tira o silêncio do começo e do fim (o encaixe na frase original fica mais justo).
            voz = np.nonzero(np.abs(audio) > 0.02)[0]
            if len(voz):
                audio = audio[max(0, voz[0] - TAXA // 50): voz[-1] + TAXA // 20]
            self._feitas[texto] = audio
        audio = self._feitas[texto]
        if abs(velocidade - 1) > 0.02:
            audio = mudar_velocidade(audio, velocidade)
        return audio


def mudar_velocidade(audio: np.ndarray, fator: float) -> np.ndarray:
    """Fala mais rápido (ou devagar) sem mudar o tom, com o atempo do ffmpeg."""
    fator = min(2.0, max(0.5, fator))
    r = subprocess.run(
        [ffmpeg_exe(), "-v", "error", "-f", "f32le", "-ar", str(TAXA), "-ac", "1", "-i", "-",
         "-filter:a", f"atempo={fator:.3f}", "-f", "f32le", "-"],
        input=audio.astype(np.float32).tobytes(), capture_output=True, check=True,
    )
    return np.frombuffer(r.stdout, dtype=np.float32)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("video", type=Path, help="vídeo (ou áudio) com a voz a copiar")
    parser.add_argument("texto")
    parser.add_argument("--idioma", default="en")
    parser.add_argument("--saida", type=Path, default=Path("voz-clonada.wav"))
    args = parser.parse_args()
    from voz import salvar_wav

    voz = VozClonada(args.idioma, amostra_da_voz(args.video))
    salvar_wav(voz.falar(args.texto), TAXA, args.saida)
    print(f"-> {args.saida}")


if __name__ == "__main__":
    main()
