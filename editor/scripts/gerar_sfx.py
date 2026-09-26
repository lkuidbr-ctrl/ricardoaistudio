"""Gera os efeitos sonoros do editor (public/sfx/*.wav) por síntese.

Os arquivos já vêm prontos no projeto; rode só se quiser mudar os sons:
    python scripts/gerar_sfx.py

Como são sintetizados aqui, não têm direito autoral de terceiros.
"""

import wave
from pathlib import Path

import numpy as np

RATE = 44100
rng = np.random.default_rng(7)


def envelope(n: int, attack: float, release: float) -> np.ndarray:
    t = np.linspace(0, 1, n)
    return np.minimum(1, t / attack) * np.clip((1 - t) / release, 0, 1) ** 2


def lowpass(signal: np.ndarray, cutoff_hz: np.ndarray) -> np.ndarray:
    # Filtro de um polo com frequência de corte variando no tempo.
    alpha = 1 - np.exp(-2 * np.pi * cutoff_hz / RATE)
    out = np.zeros_like(signal)
    y = 0.0
    for i, (x, a) in enumerate(zip(signal, alpha)):
        y += a * (x - y)
        out[i] = y
    return out


def whoosh(seconds=0.45, low=300, high=5000) -> np.ndarray:
    n = int(RATE * seconds)
    t = np.linspace(0, 1, n)
    sweep = low + (high - low) * np.sin(np.pi * t) ** 2  # abre e fecha o filtro
    noise = rng.normal(0, 1, n)
    body = lowpass(noise, sweep) - lowpass(noise, sweep * 0.25)  # passa-faixa
    return body * envelope(n, 0.55, 0.45)


def pop(seconds=0.13) -> np.ndarray:
    n = int(RATE * seconds)
    t = np.arange(n) / RATE
    freq = 380 + 700 * np.exp(-t * 45)
    phase = 2 * np.pi * np.cumsum(freq) / RATE
    return np.sin(phase) * np.exp(-t * 32) + 0.15 * rng.normal(0, 1, n) * np.exp(-t * 200)


def glitch(seconds=0.28) -> np.ndarray:
    n = int(RATE * seconds)
    out = np.zeros(n)
    pos = 0
    while pos < n:
        size = int(RATE * rng.uniform(0.012, 0.04))
        t = np.arange(min(size, n - pos)) / RATE
        kind = rng.integers(3)
        if kind == 0:
            chunk = np.sign(np.sin(2 * np.pi * rng.uniform(80, 900) * t))  # onda quadrada
        elif kind == 1:
            chunk = np.round(rng.normal(0, 1, len(t)) * 3) / 3  # ruído "bitcrush"
        else:
            chunk = np.zeros(len(t))  # corte seco
        out[pos : pos + len(t)] = chunk * rng.uniform(0.4, 1)
        pos += len(t)
    return out * envelope(n, 0.05, 0.3)


def swoosh_grave() -> np.ndarray:
    # Mais longo e mais grave: entrada do texto atrás da pessoa.
    base = whoosh(0.7, 120, 1800)
    t = np.arange(len(base)) / RATE
    sub = np.sin(2 * np.pi * (60 + 40 * t) * t) * envelope(len(t), 0.6, 0.4)
    return base + 0.5 * sub


def salvar(nome: str, audio: np.ndarray, pasta: Path) -> None:
    audio = audio / (np.abs(audio).max() + 1e-9) * 0.9
    with wave.open(str(pasta / nome), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((audio * 32767).astype("<i2").tobytes())
    print(f"{nome}: {len(audio) / RATE:.2f}s")


if __name__ == "__main__":
    pasta = Path(__file__).resolve().parent.parent / "public" / "sfx"
    pasta.mkdir(parents=True, exist_ok=True)
    salvar("whoosh.wav", whoosh(), pasta)
    salvar("pop.wav", pop(), pasta)
    salvar("glitch.wav", glitch(), pasta)
    salvar("swoosh.wav", swoosh_grave(), pasta)
