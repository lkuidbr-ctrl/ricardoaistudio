// Batidas da música de fundo (scripts/musica.py grava <música>.ritmo.json) no tempo do vídeo.
export type Ritmo = { bpm: number; batidas: number[]; inicioMs: number; duracaoMs: number };

// A música começa em "inicioMs" e repete do mesmo ponto quando acaba (como o <Audio loop>).
export const batidasNoVideo = (ritmo: Ritmo, inicioMs: number, duracaoVideoMs: number): number[] => {
  const trecho = ritmo.batidas.filter((b) => b >= inicioMs).map((b) => b - inicioMs);
  const volta = ritmo.duracaoMs - inicioMs;
  if (!trecho.length || volta <= 0) return [];
  const saida: number[] = [];
  for (let base = 0; base < duracaoVideoMs; base += volta) {
    for (const b of trecho) {
      if (base + b >= duracaoVideoMs) break;
      saida.push(base + b);
    }
  }
  return saida;
};

// Puxa um tempo para a batida mais perto (se tiver uma a até "folgaMs").
export const naBatida = (ms: number, batidas: number[], folgaMs = 220): number => {
  let melhor = ms;
  let dist = folgaMs + 1;
  for (const b of batidas) {
    const d = Math.abs(b - ms);
    if (d < dist) {
      dist = d;
      melhor = b;
    }
    if (b > ms + folgaMs) break;
  }
  return melhor;
};
