// Linha do tempo embaixo do vídeo: uma faixa para a fala e uma para cada tipo de efeito.
// Clique para ir ao ponto; arraste um bloco para mudar o momento; puxe a ponta direita para
// mudar a duração; clique num bloco e aperte Delete para apagar.
import type { PlayerRef } from "@remotion/player";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ShortVideoProps } from "../../src/schema";
import { buildTimeline, remapCaptions, type CutsFile, type EnrichedCaption } from "../../src/timeline";
import { TIPOS_ANIMACAO } from "../../src/effects/Animacoes";
import { TIPOS_CARTELA } from "../../src/effects/Cartelas";
import { TIPOS_EFEITO_TELA } from "../../src/effects/EfeitosTela";
import { formatarTempo } from "./api";

const FPS = 30;

// Listas do projeto que a linha do tempo pode mexer, e o nome do campo de início de cada uma.
type Lista = "zooms" | "cartelas" | "behindTexts" | "animacoes" | "efeitosTela" | "broll";
const CAMPO_INICIO: Record<Lista, "atMs" | "startMs"> = {
  zooms: "atMs",
  cartelas: "startMs",
  behindTexts: "startMs",
  animacoes: "startMs",
  efeitosTela: "startMs",
  broll: "startMs",
};

type Bloco = {
  faixa: string;
  inicioMs: number;
  duracaoMs: number;
  rotulo: string;
  tipo: string; // classe de cor
  lista?: Lista; // sem lista = só para ver (fala, B-roll automático, título)
  indice?: number;
};

const FAIXAS = [
  { id: "fala", nome: "Fala" },
  { id: "zoom", nome: "Zoom" },
  { id: "textos", nome: "Textos" },
  { id: "efeitos", nome: "Efeitos" },
  { id: "broll", nome: "B-roll" },
];

const nome = (lista: { valor: string; nome: string }[], valor: string) => lista.find((t) => t.valor === valor)?.nome ?? valor;

// Legenda já no tempo do vídeo editado, juntada em frases.
const useFrases = (props: ShortVideoProps) => {
  const [frases, setFrases] = useState<{ inicioMs: number; fimMs: number; texto: string }[]>([]);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    const mudou = () => setVersao((v) => v + 1);
    window.addEventListener("legenda-mudou", mudou);
    return () => window.removeEventListener("legenda-mudou", mudou);
  }, []);
  useEffect(() => {
    if (!props.captions) {
      setFrases([]);
      return;
    }
    let vivo = true;
    Promise.all([
      fetch(`/${props.captions}?v=${versao}`).then((r) => r.json() as Promise<EnrichedCaption[]>),
      props.cuts ? fetch(`/${props.cuts}?v=${Date.now()}`).then((r) => r.json() as Promise<CutsFile>) : Promise.resolve(null),
    ])
      .then(([legenda, cortes]) => {
        if (!vivo) return;
        const palavras = remapCaptions(legenda, buildTimeline(cortes?.keep ?? null, FPS, cortes ? Infinity : 1e9));
        const lista: { inicioMs: number; fimMs: number; texto: string }[] = [];
        for (const p of palavras) {
          const ultima = lista[lista.length - 1];
          if (ultima && p.startMs - ultima.fimMs < 400 && !/[.!?…]$/.test(ultima.texto)) {
            ultima.fimMs = p.endMs;
            ultima.texto += " " + p.text.trim();
          } else {
            lista.push({ inicioMs: p.startMs, fimMs: p.endMs, texto: p.text.trim() });
          }
        }
        setFrases(lista);
      })
      .catch(() => vivo && setFrases([]));
    return () => {
      vivo = false;
    };
  }, [props.captions, props.cuts, versao]);
  return frases;
};

// B-roll automático (scripts/broll.py): só para ver, no tempo do vídeo editado.
const useBrollAuto = (props: ShortVideoProps) => {
  const [itens, setItens] = useState<{ inicioMs: number; duracaoMs: number; rotulo: string }[]>([]);
  useEffect(() => {
    if (!props.brollFile) {
      setItens([]);
      return;
    }
    let vivo = true;
    Promise.all([
      fetch(`/${props.brollFile}?v=${Date.now()}`).then((r) => r.json() as Promise<{ sourceMs: number; durationMs: number; frase?: string; src: string }[]>),
      props.cuts ? fetch(`/${props.cuts}?v=${Date.now()}`).then((r) => r.json() as Promise<CutsFile>) : Promise.resolve(null),
    ])
      .then(([lista, cortes]) => {
        if (!vivo) return;
        const tl = buildTimeline(cortes?.keep ?? null, FPS, cortes ? Infinity : 1e9);
        setItens(
          lista.flatMap((b) => {
            const hit = tl.locate(b.sourceMs);
            return hit ? [{ inicioMs: hit.ms, duracaoMs: b.durationMs, rotulo: b.frase || b.src.split("/").pop() || "B-roll" }] : [];
          }),
        );
      })
      .catch(() => vivo && setItens([]));
    return () => {
      vivo = false;
    };
  }, [props.brollFile, props.cuts]);
  return itens;
};

export const LinhaDoTempo: React.FC<{
  props: ShortVideoProps;
  mudar: (p: Partial<ShortVideoProps>) => void;
  duracaoFrames: number;
  player: React.RefObject<PlayerRef | null>;
}> = ({ props, mudar, duracaoFrames, player }) => {
  const totalMs = (duracaoFrames / FPS) * 1000;
  const frases = useFrases(props);
  const brollAuto = useBrollAuto(props);
  const area = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(600);
  const [agora, setAgora] = useState(0);
  const [selecionado, setSelecionado] = useState<{ lista: Lista; indice: number } | null>(null);
  // Bloco sendo arrastado: posição provisória (só vai para o projeto quando solta o mouse).
  const [arrasto, setArrasto] = useState<{ lista: Lista; indice: number; inicioMs: number; duracaoMs: number } | null>(null);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLargura(el.clientWidth));
    ro.observe(el);
    setLargura(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Linha vermelha acompanha o vídeo tocando.
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const atualizar = (e: { detail: { frame: number } }) => setAgora((e.detail.frame / FPS) * 1000);
    p.addEventListener("frameupdate", atualizar);
    p.addEventListener("seeked", atualizar);
    return () => {
      p.removeEventListener("frameupdate", atualizar);
      p.removeEventListener("seeked", atualizar);
    };
  }, [player, duracaoFrames]);

  const pxPorMs = largura / Math.max(1, totalMs);
  const irPara = (ms: number) => {
    const frame = Math.max(0, Math.min(duracaoFrames - 1, Math.round((ms / 1000) * FPS)));
    player.current?.seekTo(frame);
    setAgora((frame / FPS) * 1000);
  };

  const blocos = useMemo<Bloco[]>(() => {
    const b: Bloco[] = [];
    for (const f of frases) b.push({ faixa: "fala", inicioMs: f.inicioMs, duracaoMs: f.fimMs - f.inicioMs, rotulo: f.texto, tipo: "fala" });
    props.zooms.forEach((z, i) =>
      b.push({ faixa: "zoom", inicioMs: z.atMs, duracaoMs: z.durationMs, rotulo: `${Math.round((z.scale - 1) * 100)}%`, tipo: "zoom", lista: "zooms", indice: i }),
    );
    if (props.hookText) b.push({ faixa: "textos", inicioMs: 0, duracaoMs: props.hookDurationMs, rotulo: props.hookText, tipo: "gancho" });
    (props.cartelas ?? []).forEach((c, i) =>
      b.push({ faixa: "textos", inicioMs: c.startMs, duracaoMs: c.durationMs, rotulo: `${nome(TIPOS_CARTELA, c.tipo)}: ${c.texto}`, tipo: "texto", lista: "cartelas", indice: i }),
    );
    props.behindTexts.forEach((t, i) =>
      b.push({ faixa: "textos", inicioMs: t.startMs, duracaoMs: t.durationMs, rotulo: `Atrás: ${t.text}`, tipo: "texto", lista: "behindTexts", indice: i }),
    );
    (props.animacoes ?? []).forEach((a, i) =>
      b.push({ faixa: "efeitos", inicioMs: a.startMs, duracaoMs: a.durationMs, rotulo: nome(TIPOS_ANIMACAO, a.tipo), tipo: "animacao", lista: "animacoes", indice: i }),
    );
    (props.efeitosTela ?? []).forEach((e, i) =>
      b.push({ faixa: "efeitos", inicioMs: e.startMs, duracaoMs: e.durationMs, rotulo: nome(TIPOS_EFEITO_TELA, e.tipo), tipo: "cinema", lista: "efeitosTela", indice: i }),
    );
    props.broll.forEach((r, i) =>
      b.push({ faixa: "broll", inicioMs: r.startMs, duracaoMs: r.durationMs, rotulo: r.src.split("/").pop() ?? "B-roll", tipo: "broll", lista: "broll", indice: i }),
    );
    for (const r of brollAuto) b.push({ faixa: "broll", inicioMs: r.inicioMs, duracaoMs: r.duracaoMs, rotulo: r.rotulo, tipo: "broll-auto" });
    return b;
  }, [frases, brollAuto, props.zooms, props.hookText, props.hookDurationMs, props.cartelas, props.behindTexts, props.animacoes, props.efeitosTela, props.broll]);

  // Grava a nova posição/duração de um item da lista.
  const gravar = (lista: Lista, indice: number, inicioMs: number, duracaoMs: number) => {
    const itens = [...((props[lista] ?? []) as Record<string, unknown>[])];
    itens[indice] = { ...itens[indice], [CAMPO_INICIO[lista]]: Math.round(inicioMs), durationMs: Math.round(duracaoMs) };
    mudar({ [lista]: itens } as Partial<ShortVideoProps>);
  };

  const comecarArrasto = (e: React.PointerEvent, bloco: Bloco, modo: "mover" | "esticar") => {
    if (!bloco.lista || bloco.indice === undefined) return;
    e.stopPropagation();
    e.preventDefault();
    const { lista, indice } = bloco;
    const x0 = e.clientX;
    let movido = false;
    let atual = { inicioMs: bloco.inicioMs, duracaoMs: bloco.duracaoMs };
    setSelecionado({ lista, indice });
    const mover = (ev: PointerEvent) => {
      const dMs = (ev.clientX - x0) / pxPorMs;
      if (Math.abs(ev.clientX - x0) > 3) movido = true;
      if (!movido) return;
      atual =
        modo === "mover"
          ? { inicioMs: Math.max(0, Math.min(totalMs - 100, bloco.inicioMs + dMs)), duracaoMs: bloco.duracaoMs }
          : { inicioMs: bloco.inicioMs, duracaoMs: Math.max(300, Math.min(totalMs - bloco.inicioMs, bloco.duracaoMs + dMs)) };
      setArrasto({ lista, indice, ...atual });
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      setArrasto(null);
      if (movido) gravar(lista, indice, atual.inicioMs, atual.duracaoMs);
      else irPara(bloco.inicioMs); // só um clique: vai para o começo do bloco
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };

  // Delete/Backspace apaga o bloco selecionado (fora de campos de texto).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!selecionado || !["Delete", "Backspace"].includes(e.key)) return;
      const alvo = e.target as HTMLElement;
      if (alvo.closest("input, textarea, select, [contenteditable]")) return;
      const itens = ((props[selecionado.lista] ?? []) as unknown[]).filter((_, i) => i !== selecionado.indice);
      mudar({ [selecionado.lista]: itens } as Partial<ShortVideoProps>);
      setSelecionado(null);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [selecionado, props, mudar]);

  // Marcas de tempo a cada 1, 2, 5 ou 10 s, conforme a largura.
  const passoS = [1, 2, 5, 10, 15, 30].find((s) => s * 1000 * pxPorMs >= 50) ?? 60;
  const marcas = Array.from({ length: Math.floor(totalMs / 1000 / passoS) + 1 }, (_, i) => i * passoS);

  const clicarNaFaixa = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setSelecionado(null);
    irPara((e.clientX - r.left) / pxPorMs);
  };

  return (
    <div className="linha-do-tempo">
      <div className="ldt-nomes">
        <div className="ldt-regua-espaco" />
        {FAIXAS.map((f) => (
          <div key={f.id} className="ldt-nome">
            {f.nome}
          </div>
        ))}
      </div>
      <div className="ldt-area" ref={area} onPointerDown={clicarNaFaixa}>
        <div className="ldt-regua">
          {marcas.map((s) => (
            <span key={s} style={{ left: s * 1000 * pxPorMs }}>
              {formatarTempo(s * 1000).replace(/\.\d$/, "")}
            </span>
          ))}
        </div>
        {FAIXAS.map((f) => (
          <div key={f.id} className="ldt-faixa">
            {blocos
              .filter((b) => b.faixa === f.id)
              .map((b, i) => {
                const emArrasto = arrasto && b.lista === arrasto.lista && b.indice === arrasto.indice ? arrasto : null;
                const inicio = emArrasto?.inicioMs ?? b.inicioMs;
                const dur = emArrasto?.duracaoMs ?? b.duracaoMs;
                const sel = selecionado && b.lista === selecionado.lista && b.indice === selecionado.indice;
                return (
                  <div
                    key={`${b.tipo}-${b.indice ?? i}`}
                    className={`ldt-bloco ${b.tipo}${b.lista ? " editavel" : ""}${sel ? " selecionado" : ""}`}
                    style={{ left: inicio * pxPorMs, width: Math.max(4, dur * pxPorMs) }}
                    title={`${b.rotulo} · ${formatarTempo(inicio)} · ${(dur / 1000).toFixed(1)}s${b.lista ? "\nArraste para mover; puxe a ponta para mudar a duração; Delete apaga." : ""}`}
                    onPointerDown={(e) => {
                      if (b.lista) comecarArrasto(e, b, "mover");
                      else {
                        e.stopPropagation();
                        setSelecionado(null);
                        irPara(b.inicioMs);
                      }
                    }}
                  >
                    <span>{b.rotulo}</span>
                    {b.lista ? <i className="ldt-ponta" onPointerDown={(e) => comecarArrasto(e, b, "esticar")} /> : null}
                  </div>
                );
              })}
          </div>
        ))}
        <div className="ldt-agora" style={{ left: agora * pxPorMs }} />
      </div>
    </div>
  );
};
