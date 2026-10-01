// Coluna direita: todos os ajustes visuais do vídeo, em abas.
import React, { useEffect, useRef, useState } from "react";
import type { Animacao, Broll, BehindText, CaptionStyle, Cartela, EfeitoTela, ShortVideoProps, Zoom } from "../../src/schema";
import { COR_ANIMACAO, TIPOS_ANIMACAO } from "../../src/effects/Animacoes";
import { PADRAO_CARTELA, TIPOS_CARTELA } from "../../src/effects/Cartelas";
import { DURACAO_EFEITO_TELA, TIPOS_EFEITO_TELA } from "../../src/effects/EfeitosTela";
import { enviar, formatarTempo, get, subirArquivo, type Arquivos } from "./api";
import { Alternar, Cor, Deslizante, EnviarArquivo, Escolha, Linha, Secao, Texto } from "./campos";

type Props = {
  props: ShortVideoProps;
  mudar: (p: Partial<ShortVideoProps>) => void;
  arquivos: Arquivos;
  agoraMs: () => number;
  irPara: (ms: number) => void;
};

const ABAS = [
  { id: "legenda", nome: "Legenda" },
  { id: "textos", nome: "Textos" },
  { id: "efeitos", nome: "Efeitos" },
  { id: "audio", nome: "Áudio" },
  { id: "marca", nome: "Marca" },
] as const;

const ESTILOS: { id: CaptionStyle; nome: string; exemplo: React.CSSProperties; texto: string }[] = [
  { id: "hormozi", nome: "Hormozi", texto: "SÓ ISSO", exemplo: { fontWeight: 900, color: "#FFE600", textShadow: "0 0 0 #000, 2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000" } },
  { id: "karaoke", nome: "Karaokê", texto: "só isso", exemplo: { fontWeight: 800, color: "#111", background: "#FFE600", borderRadius: 6, padding: "0 6px" } },
  { id: "pop", nome: "Pop", texto: "ISSO!", exemplo: { fontWeight: 900, fontSize: 20, transform: "rotate(-4deg)", textShadow: "2px 2px 0 #000, -2px -2px 0 #000" } },
  { id: "neon", nome: "Neon", texto: "SÓ ISSO", exemplo: { color: "#fff", textShadow: "0 0 6px #0ff, 0 0 14px #0ff", letterSpacing: 1 } },
  { id: "minimal", nome: "Minimal", texto: "só isso", exemplo: { fontWeight: 600, background: "rgba(0,0,0,.6)", borderRadius: 6, padding: "0 6px" } },
];

const segundos = (ms: number) => Math.round(ms / 100) / 10;

// Campo de tempo em segundos com botão "usar o momento atual do vídeo".
const Tempo: React.FC<{ rotulo: string; ms: number; aoMudar: (ms: number) => void; agoraMs?: () => number }> = ({
  rotulo,
  ms,
  aoMudar,
  agoraMs,
}) => (
  <Linha rotulo={rotulo} bloco>
    <div className="tempo">
      <input type="number" min={0} step={0.1} value={segundos(ms)} onChange={(e) => aoMudar(Math.max(0, Number(e.target.value) * 1000))} />
      <span>s</span>
      {agoraMs ? (
        <button type="button" className="botao pequeno fantasma" title="Usar o momento atual do vídeo" onClick={() => aoMudar(Math.round(agoraMs()))}>
          ⏱ agora
        </button>
      ) : null}
    </div>
  </Linha>
);

function Lista<T>({
  itens,
  titulo,
  resumo,
  inicio,
  irPara,
  aoMudar,
  editor,
}: {
  itens: T[];
  titulo: (item: T, i: number) => string;
  resumo: (item: T) => string;
  inicio: (item: T) => number;
  irPara: (ms: number) => void;
  aoMudar: (itens: T[]) => void;
  editor: (item: T, mudarItem: (p: Partial<T>) => void) => React.ReactNode;
}) {
  const [aberto, setAberto] = useState<number | null>(itens.length ? itens.length - 1 : null);
  const tamanho = useRef(itens.length);
  useEffect(() => {
    if (itens.length > tamanho.current) setAberto(itens.length - 1); // abre o item recém-adicionado
    tamanho.current = itens.length;
  }, [itens.length]);

  if (!itens.length) return <p className="vazio-lista">Nada adicionado ainda.</p>;
  return (
    <div className="lista">
      {itens.map((item, i) => (
        <div key={i} className={`item ${aberto === i ? "aberto" : ""}`}>
          <div className="item-topo">
            <button className="item-nome" onClick={() => { setAberto(aberto === i ? null : i); irPara(inicio(item)); }}>
              <b>{titulo(item, i)}</b>
              <small>{resumo(item)}</small>
            </button>
            <button className="lixeira" title="Remover" onClick={() => aoMudar(itens.filter((_, j) => j !== i))}>
              🗑
            </button>
          </div>
          {aberto === i ? (
            <div className="item-corpo">
              {editor(item, (p) => aoMudar(itens.map((x, j) => (j === i ? { ...x, ...p } : x))))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ abas

type Palavra = { text: string; startMs: number; endMs: number; timestampMs?: number; confidence?: number; highlight?: boolean; emoji?: string };

// Junta as palavras em frases curtas, para corrigir uma frase de cada vez.
const emFrases = (palavras: Palavra[]) => {
  const frases: { inicio: number; fim: number }[] = [];
  let inicio = 0;
  palavras.forEach((p, i) => {
    const prox = palavras[i + 1];
    const fecha = !prox || /[.!?…]$/.test(p.text.trim()) || prox.startMs - p.endMs > 1200 || i - inicio >= 9;
    if (fecha) {
      frases.push({ inicio, fim: i + 1 });
      inicio = i + 1;
    }
  });
  return frases;
};

// Troca o texto de uma frase. Mesmo número de palavras: mantém os tempos de cada uma.
// Número diferente: divide o tempo da frase entre as palavras novas, pelo tamanho delas
// (podendo ocupar a pausa até a próxima frase, se você acrescentou palavras).
const reescrever = (antigas: Palavra[], texto: string, limiteMs: number): Palavra[] => {
  const novas = texto.split(/\s+/).filter(Boolean);
  if (!novas.length) return [];
  if (novas.length === antigas.length) return antigas.map((p, i) => ({ ...p, text: " " + novas[i] }));
  const inicio = antigas[0].startMs;
  const fimAntigo = antigas[antigas.length - 1].endMs;
  const total = (novas.length > antigas.length ? Math.max(fimAntigo, Math.min(limiteMs, fimAntigo + 1500)) : fimAntigo) - inicio;
  const letras = novas.reduce((n, w) => n + w.length + 1, 0);
  let t = inicio;
  return novas.map((w) => {
    const dur = (total * (w.length + 1)) / letras;
    const igual = antigas.find((p) => p.text.trim().toLowerCase() === w.toLowerCase());
    const p: Palavra = { text: " " + w, startMs: Math.round(t), endMs: Math.round(t + dur), timestampMs: Math.round(t + dur / 2), confidence: 1 };
    if (igual?.highlight) p.highlight = true;
    if (igual?.emoji) p.emoji = igual.emoji;
    t += dur;
    return p;
  });
};

const CorrigirLegenda: React.FC<{ video: string; arquivo: string; mudar: Props["mudar"]; ligada: boolean }> = ({ video, arquivo, mudar, ligada }) => {
  const [palavras, setPalavras] = useState<Palavra[] | null>(null);
  const [rascunho, setRascunho] = useState<Record<number, string>>({});
  // Aberto de cara: corrigir a transcrição é o ajuste mais comum.
  const [aberto, setAberto] = useState(true);
  // Relê quando a legenda muda por fora (IA refez, "Peça para a IA" trocou palavras...).
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    const mudou = () => setVersao((v) => v + 1);
    window.addEventListener("legenda-mudou", mudou);
    return () => window.removeEventListener("legenda-mudou", mudou);
  }, []);
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    get<Palavra[]>(`/${arquivo}?v=${versao}`)
      .then((l) => vivo && setPalavras(l))
      .catch(() => vivo && setPalavras(null));
    return () => {
      vivo = false;
    };
  }, [arquivo, aberto, versao]);

  const frases = palavras ? emFrases(palavras) : [];
  const textoDe = (f: { inicio: number; fim: number }) => palavras!.slice(f.inicio, f.fim).map((p) => p.text.trim()).join(" ");

  const salvar = async (fi: number) => {
    if (!palavras) return;
    const f = frases[fi];
    const novo = rascunho[f.inicio];
    if (novo === undefined || novo.trim() === textoDe(f)) return;
    const lista = [...palavras.slice(0, f.inicio), ...reescrever(palavras.slice(f.inicio, f.fim), novo, palavras[f.fim]?.startMs ?? Infinity), ...palavras.slice(f.fim)];
    try {
      await enviar("PUT", `/api/legenda?id=${encodeURIComponent(video)}`, lista);
    } catch {
      return;
    }
    setPalavras(lista);
    setRascunho({});
    if (ligada) {
      // Recarrega o preview com o texto novo.
      mudar({ captions: "" });
      setTimeout(() => mudar({ captions: arquivo }), 50);
    }
  };

  return (
    <Secao
      titulo="Corrigir o texto"
      dica="Se a transcrição errou alguma palavra, corrija aqui. As frases em amarelo são onde a IA ficou em dúvida."
      acao={
        <button type="button" className="botao pequeno secundario" onClick={() => setAberto((v) => !v)}>
          {aberto ? "Fechar" : "Abrir texto"}
        </button>
      }
    >
      {aberto && palavras ? (
        <div className="frases">
          {frases.map((f, fi) => {
            const duvida = palavras.slice(f.inicio, f.fim).some((p) => (p.confidence ?? 1) < 0.6);
            return (
              <label key={f.inicio} className={`frase ${duvida ? "duvida" : ""}`}>
                <small>{formatarTempo(palavras[f.inicio].startMs)}</small>
                <textarea
                  rows={2}
                  value={rascunho[f.inicio] ?? textoDe(f)}
                  onChange={(e) => setRascunho((r) => ({ ...r, [f.inicio]: e.target.value }))}
                  onBlur={() => salvar(fi)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      (e.target as HTMLTextAreaElement).blur();
                    }
                  }}
                />
              </label>
            );
          })}
        </div>
      ) : null}
    </Secao>
  );
};

const AbaLegenda: React.FC<Props> = ({ props, mudar, arquivos }) => {
  const [palavra, setPalavra] = useState("");
  return (
    <>
      {!arquivos.captions ? (
        <p className="alerta">Clique em <b>Gerar legendas</b>, na coluna da esquerda, para as legendas aparecerem.</p>
      ) : (
        <Alternar
          rotulo="Mostrar legendas"
          ligado={Boolean(props.captions)}
          aoMudar={(v) => mudar({ captions: v ? props.video.replace(/\.[^./]+$/, "") + ".captions.json" : "" })}
        />
      )}
      {arquivos.captions ? (
        <CorrigirLegenda video={props.video} arquivo={props.captions || props.video.replace(/\.[^./]+$/, "") + ".captions.json"} mudar={mudar} ligada={Boolean(props.captions)} />
      ) : null}
      <Secao titulo="Estilo">
        <div className="estilos">
          {ESTILOS.map((e) => (
            <button key={e.id} className={`estilo ${props.captionStyle === e.id ? "ativo" : ""}`} onClick={() => mudar({ captionStyle: e.id })}>
              <span className="amostra" style={e.exemplo}>{e.texto}</span>
              <small>{e.nome}</small>
            </button>
          ))}
        </div>
      </Secao>
      <Secao titulo="Cores">
        <div className="cores">
          <Cor rotulo="Texto" valor={props.captionColor} aoMudar={(v) => mudar({ captionColor: v })} />
          <Cor rotulo="Destaque" valor={props.highlightColor} aoMudar={(v) => mudar({ highlightColor: v })} />
        </div>
        {props.brand ? <p className="dica">Com a marca ligada, o destaque usa a cor da sua marca.</p> : null}
      </Secao>
      <Secao titulo="Posição e ritmo">
        <Deslizante rotulo="Altura na tela" valor={props.captionY} min={10} max={90} formato={(v) => `${v}%`} aoMudar={(v) => mudar({ captionY: v })} />
        <Deslizante
          rotulo="Palavras por tela"
          valor={props.wordsWindowMs}
          min={0}
          max={2500}
          passo={100}
          formato={(v) => (v < 300 ? "poucas" : v < 1200 ? "médio" : "muitas")}
          aoMudar={(v) => mudar({ wordsWindowMs: v })}
        />
      </Secao>
      <Secao titulo="Emojis e destaques" dica='Use "Emojis e destaques" na esquerda para a IA escolher. Aqui você pode acrescentar palavras.'>
        <Alternar rotulo="Mostrar emojis" ligado={props.emojis} aoMudar={(v) => mudar({ emojis: v })} />
        {props.emojis ? (
          <Alternar
            rotulo="Emojis animados"
            dica="Os emojis se mexem (animações do Google). Os que não têm animação aparecem parados."
            ligado={props.emojiAnimado ?? true}
            aoMudar={(v) => mudar({ emojiAnimado: v })}
          />
        ) : null}
        <div className="chips">
          {props.keywords.map((k) => (
            <span key={k} className="chip">
              {k}
              <button onClick={() => mudar({ keywords: props.keywords.filter((x) => x !== k) })}>×</button>
            </span>
          ))}
        </div>
        <form
          className="linha-form"
          onSubmit={(e) => {
            e.preventDefault();
            const p = palavra.trim();
            if (p && !props.keywords.includes(p)) mudar({ keywords: [...props.keywords, p] });
            setPalavra("");
          }}
        >
          <input type="text" placeholder="Palavra para destacar" value={palavra} onChange={(e) => setPalavra(e.target.value)} />
          <button className="botao secundario" type="submit">Adicionar</button>
        </form>
      </Secao>
    </>
  );
};

const AbaTextos: React.FC<Props> = ({ props, mudar, arquivos, agoraMs, irPara }) => {
  const novo = (): BehindText => ({
    text: "TEXTO",
    startMs: Math.round(agoraMs()),
    durationMs: 2500,
    animation: "rise",
    color: "#FFFFFF",
    y: 25,
    fontSize: 320,
  });
  return (
    <>
      <Secao titulo="Título-gancho" dica="Frase de impacto no topo, nos primeiros segundos.">
        <Texto valor={props.hookText} placeholder="Ex.: O erro que me custou 10 mil" aoMudar={(v) => mudar({ hookText: v })} />
        {props.hookText ? (
          <Deslizante rotulo="Duração" valor={props.hookDurationMs} min={1000} max={8000} passo={250} formato={(v) => `${v / 1000}s`} aoMudar={(v) => mudar({ hookDurationMs: v })} />
        ) : null}
      </Secao>
      <SecaoCartelas props={props} mudar={mudar} arquivos={arquivos} agoraMs={agoraMs} irPara={irPara} />
      <Secao
        titulo="Texto atrás da pessoa"
        acao={<button className="botao pequeno primario" onClick={() => mudar({ behindTexts: [...props.behindTexts, novo()] })}>+ no momento atual</button>}
      >
        {!arquivos.person ? (
          <p className="alerta">Para o texto ficar <b>atrás</b> de você, rode <b>Recortar a pessoa</b> na esquerda. Sem isso, ele aparece na frente.</p>
        ) : null}
        <Lista<BehindText>
          itens={props.behindTexts}
          titulo={(t) => t.text || "(vazio)"}
          resumo={(t) => `${formatarTempo(t.startMs)} · ${t.durationMs / 1000}s`}
          inicio={(t) => t.startMs}
          irPara={irPara}
          aoMudar={(behindTexts) => mudar({ behindTexts })}
          editor={(t, m) => (
            <>
              <Texto rotulo="Texto" valor={t.text} aoMudar={(text) => m({ text })} />
              <Escolha
                rotulo="Animação"
                valor={t.animation}
                opcoes={[
                  { valor: "rise", nome: "Sobe de trás" },
                  { valor: "scale", nome: "Cresce" },
                  { valor: "slide", nome: "Desliza" },
                  { valor: "letters", nome: "Letra por letra" },
                ]}
                aoMudar={(animation) => m({ animation })}
              />
              <Tempo rotulo="Começa em" ms={t.startMs} aoMudar={(startMs) => m({ startMs })} agoraMs={agoraMs} />
              <Deslizante rotulo="Duração" valor={t.durationMs} min={500} max={8000} passo={100} formato={(v) => `${v / 1000}s`} aoMudar={(durationMs) => m({ durationMs })} />
              <Deslizante rotulo="Altura" valor={t.y} min={0} max={100} formato={(v) => `${v}%`} aoMudar={(y) => m({ y })} />
              <Deslizante rotulo="Tamanho" valor={t.fontSize} min={80} max={600} passo={10} aoMudar={(fontSize) => m({ fontSize })} />
              <Cor rotulo="Cor" valor={t.color} aoMudar={(color) => m({ color })} />
            </>
          )}
        />
      </Secao>
    </>
  );
};

type AutoBroll = { src: string; sourceMs: number; durationMs: number; mode: string; busca?: string; frase?: string };

// Cenas que o B-roll automático escolheu: dá para conferir cada uma e tirar a que não combinou.
const BrollAutomatico: React.FC<{ arquivo: string; mudar: Props["mudar"] }> = ({ arquivo, mudar }) => {
  const [itens, setItens] = useState<AutoBroll[] | null>(null);
  useEffect(() => {
    let vivo = true;
    get<AutoBroll[]>(`/${arquivo}`)
      .then((l) => vivo && setItens(Array.isArray(l) ? l : []))
      .catch(() => vivo && setItens(null));
    return () => {
      vivo = false;
    };
  }, [arquivo]);
  if (!itens) return null;

  const remover = async (i: number) => {
    const nova = itens.filter((_, j) => j !== i);
    await enviar("PUT", `/api/broll?arquivo=${encodeURIComponent(arquivo)}`, nova);
    setItens(nova);
    // Recarrega o preview: desliga e religa o arquivo do B-roll.
    mudar({ brollFile: "" });
    setTimeout(() => mudar({ brollFile: arquivo }), 50);
  };

  return (
    <div className="lista">
      <p className="vazio-lista">
        {itens.length ? `Cenas escolhidas pela IA (${itens.length}). Tire as que não combinaram:` : "Nenhuma cena automática sobrou."}
      </p>
      {itens.map((b, i) => (
        <div className="item" key={b.src + i}>
          <div className="item-topo">
            <video className="miniatura" src={`/${b.src}#t=0.5`} muted preload="metadata" />
            <div className="item-nome" style={{ cursor: "default" }}>
              <span>{b.frase ? `“${b.frase}”` : (b.src.split("/").pop() ?? b.src)}</span>
              <small>
                {formatarTempo(b.sourceMs)} do vídeo original · {b.durationMs / 1000}s{b.busca ? ` · busca: ${b.busca}` : ""}
              </small>
            </div>
            <button type="button" className="botao pequeno fantasma" title="Tirar esta cena" onClick={() => remover(i)}>
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

const COR_NEUTRA = { brilho: 1, contraste: 1, saturacao: 1, temperatura: 0, sombras: 0 };
const pct = (v: number) => `${v >= 1 ? "+" : ""}${Math.round((v - 1) * 100)}%`;

const SecaoCor: React.FC<Pick<Props, "props" | "mudar">> = ({ props, mudar }) => {
  const cor = props.cor ?? COR_NEUTRA;
  const m = (parcial: Partial<typeof cor>) => mudar({ cor: { ...cor, ...parcial } });
  const mexida = Object.entries(COR_NEUTRA).some(([k, v]) => cor[k as keyof typeof cor] !== v);
  return (
    <Secao
      titulo="Cor"
      dica='Use "Corrigir cor", na coluna da esquerda, para a correção automática. Aqui você ajusta à mão.'
      acao={
        mexida ? (
          <button className="botao pequeno fantasma" onClick={() => mudar({ cor: COR_NEUTRA })}>
            Voltar ao original
          </button>
        ) : undefined
      }
    >
      <Deslizante rotulo="Brilho" valor={cor.brilho} min={0.6} max={1.5} passo={0.01} formato={pct} aoMudar={(brilho) => m({ brilho })} />
      <Deslizante rotulo="Contraste" valor={cor.contraste} min={0.7} max={1.4} passo={0.01} formato={pct} aoMudar={(contraste) => m({ contraste })} />
      <Deslizante rotulo="Saturação (cores)" valor={cor.saturacao} min={0} max={1.8} passo={0.01} formato={pct} aoMudar={(saturacao) => m({ saturacao })} />
      <Deslizante
        rotulo="Temperatura"
        valor={cor.temperatura}
        min={-1}
        max={1}
        passo={0.05}
        formato={(v) => (v === 0 ? "normal" : v < 0 ? `mais frio ${Math.round(-v * 100)}%` : `mais quente ${Math.round(v * 100)}%`)}
        aoMudar={(temperatura) => m({ temperatura })}
      />
      <Deslizante
        rotulo="Clarear sombras"
        valor={cor.sombras}
        min={0}
        max={1}
        passo={0.05}
        formato={(v) => (v === 0 ? "não" : `${Math.round(v * 100)}%`)}
        aoMudar={(sombras) => m({ sombras })}
      />
    </Secao>
  );
};

const nomeAnimacao = (tipo: Animacao["tipo"]) => TIPOS_ANIMACAO.find((t) => t.valor === tipo)?.nome ?? tipo;

const SecaoAnimacoes: React.FC<Props> = ({ props, mudar, agoraMs, irPara }) => {
  const itens = props.animacoes ?? [];
  const nova = (): Animacao => ({
    tipo: "seta",
    startMs: Math.round(agoraMs()),
    durationMs: 1600,
    x: 70,
    y: 20,
    tamanho: 1,
    cor: COR_ANIMACAO.seta,
  });
  return (
    <Secao
      titulo="Animações"
      dica="Setas, check, coração, confete... por cima do vídeo. A IA escolhe algumas sozinha."
      acao={<button className="botao pequeno primario" onClick={() => mudar({ animacoes: [...itens, nova()] })}>+ no momento atual</button>}
    >
      <Lista<Animacao>
        itens={itens}
        titulo={(a) => nomeAnimacao(a.tipo)}
        resumo={(a) => `${formatarTempo(a.startMs)} · ${a.durationMs / 1000}s`}
        inicio={(a) => a.startMs}
        irPara={irPara}
        aoMudar={(animacoes) => mudar({ animacoes })}
        editor={(a, m) => (
          <>
            <Escolha
              rotulo="Animação"
              valor={a.tipo}
              opcoes={TIPOS_ANIMACAO}
              aoMudar={(tipo) => m({ tipo, cor: COR_ANIMACAO[tipo] })}
            />
            <Tempo rotulo="Começa em" ms={a.startMs} aoMudar={(startMs) => m({ startMs })} agoraMs={agoraMs} />
            <Deslizante rotulo="Duração" valor={a.durationMs} min={500} max={5000} passo={100} formato={(v) => `${v / 1000}s`} aoMudar={(durationMs) => m({ durationMs })} />
            <Deslizante rotulo="Posição (lado)" valor={a.x} min={0} max={100} formato={(v) => `${v}%`} aoMudar={(x) => m({ x })} />
            <Deslizante rotulo="Posição (altura)" valor={a.y} min={0} max={100} formato={(v) => `${v}%`} aoMudar={(y) => m({ y })} />
            <Deslizante rotulo="Tamanho" valor={a.tamanho} min={0.4} max={2.5} passo={0.05} formato={(v) => `${Math.round(v * 100)}%`} aoMudar={(tamanho) => m({ tamanho })} />
            <Cor rotulo="Cor" valor={a.cor} aoMudar={(cor) => m({ cor })} />
          </>
        )}
      />
    </Secao>
  );
};

const nomeCartela = (tipo: Cartela["tipo"]) => TIPOS_CARTELA.find((t) => t.valor === tipo)?.nome ?? tipo;

const DICA_SUBTEXTO: Record<Cartela["tipo"], [string, string]> = {
  nome: ["Nome", "Cargo ou profissão"],
  numero: ["Número (ex.: R$ 10.000, 95%)", "Embaixo do número"],
  digitando: ["Texto", ""],
  notificacao: ["Mensagem", "Nome do app"],
};

const SecaoCartelas: React.FC<Props> = ({ props, mudar, agoraMs, irPara }) => {
  const itens = props.cartelas ?? [];
  const nova = (): Cartela => ({ tipo: "nome", startMs: Math.round(agoraMs()), ...PADRAO_CARTELA.nome });
  return (
    <Secao
      titulo="Textos animados"
      dica="Nome e cargo, número contando, texto digitando, notificação do celular. A IA coloca alguns sozinha."
      acao={<button className="botao pequeno primario" onClick={() => mudar({ cartelas: [...itens, nova()] })}>+ no momento atual</button>}
    >
      <Lista<Cartela>
        itens={itens}
        titulo={(c) => `${nomeCartela(c.tipo)}: ${c.texto || "(vazio)"}`}
        resumo={(c) => `${formatarTempo(c.startMs)} · ${c.durationMs / 1000}s`}
        inicio={(c) => c.startMs}
        irPara={irPara}
        aoMudar={(cartelas) => mudar({ cartelas })}
        editor={(c, m) => (
          <>
            <Escolha
              rotulo="Tipo"
              valor={c.tipo}
              opcoes={TIPOS_CARTELA}
              aoMudar={(tipo) => {
                // Troca o tipo mantendo o texto que você já escreveu (o texto de exemplo é trocado).
                const antes = PADRAO_CARTELA[c.tipo];
                const { texto, subtexto, ...resto } = PADRAO_CARTELA[tipo];
                m({
                  tipo,
                  ...resto,
                  ...(!c.texto || c.texto === antes.texto ? { texto } : {}),
                  ...(!c.subtexto || c.subtexto === antes.subtexto ? { subtexto } : {}),
                });
              }}
            />
            <Texto rotulo={DICA_SUBTEXTO[c.tipo][0]} valor={c.texto} aoMudar={(texto) => m({ texto })} />
            {DICA_SUBTEXTO[c.tipo][1] ? (
              <Texto rotulo={DICA_SUBTEXTO[c.tipo][1]} valor={c.subtexto} aoMudar={(subtexto) => m({ subtexto })} />
            ) : null}
            <Tempo rotulo="Começa em" ms={c.startMs} aoMudar={(startMs) => m({ startMs })} agoraMs={agoraMs} />
            <Deslizante rotulo="Duração" valor={c.durationMs} min={1000} max={8000} passo={250} formato={(v) => `${v / 1000}s`} aoMudar={(durationMs) => m({ durationMs })} />
            <Deslizante rotulo="Posição (altura)" valor={c.y} min={5} max={95} formato={(v) => `${v}%`} aoMudar={(y) => m({ y })} />
            <Cor rotulo="Cor" valor={c.cor} aoMudar={(cor) => m({ cor })} />
          </>
        )}
      />
    </Secao>
  );
};

const nomeEfeitoTela = (tipo: EfeitoTela["tipo"]) => TIPOS_EFEITO_TELA.find((t) => t.valor === tipo)?.nome ?? tipo;

const SecaoEfeitosTela: React.FC<Props> = ({ props, mudar, agoraMs, irPara }) => {
  const itens = props.efeitosTela ?? [];
  const novo = (): EfeitoTela => ({ tipo: "tremor", startMs: Math.round(agoraMs()), durationMs: DURACAO_EFEITO_TELA.tremor, forca: 1 });
  return (
    <Secao
      titulo="Efeitos de cinema"
      dica="Câmera tremendo, luz de filme, vinheta e preto e branco, num trecho do vídeo."
      acao={<button className="botao pequeno primario" onClick={() => mudar({ efeitosTela: [...itens, novo()] })}>+ no momento atual</button>}
    >
      <Lista<EfeitoTela>
        itens={itens}
        titulo={(e) => nomeEfeitoTela(e.tipo)}
        resumo={(e) => `${formatarTempo(e.startMs)} · ${e.durationMs / 1000}s`}
        inicio={(e) => e.startMs}
        irPara={irPara}
        aoMudar={(efeitosTela) => mudar({ efeitosTela })}
        editor={(e, m) => (
          <>
            <Escolha rotulo="Efeito" valor={e.tipo} opcoes={TIPOS_EFEITO_TELA} aoMudar={(tipo) => m({ tipo, durationMs: DURACAO_EFEITO_TELA[tipo] })} />
            <Tempo rotulo="Começa em" ms={e.startMs} aoMudar={(startMs) => m({ startMs })} agoraMs={agoraMs} />
            <Deslizante rotulo="Duração" valor={e.durationMs} min={300} max={10000} passo={100} formato={(v) => `${v / 1000}s`} aoMudar={(durationMs) => m({ durationMs })} />
            <Deslizante rotulo="Força" valor={e.forca} min={0.2} max={2} passo={0.1} formato={(v) => `${Math.round(v * 100)}%`} aoMudar={(forca) => m({ forca })} />
          </>
        )}
      />
    </Secao>
  );
};

const AbaEfeitos: React.FC<Props> = (p) => {
  const { props, mudar, arquivos, agoraMs, irPara } = p;
  return (
  <>
    <SecaoCor props={props} mudar={mudar} />
    <SecaoAnimacoes {...p} />
    <SecaoEfeitosTela {...p} />
    <Secao
      titulo="Zoom"
      dica="Aproxima a câmera num momento de ênfase."
      acao={
        <button
          className="botao pequeno primario"
          onClick={() => mudar({ zooms: [...props.zooms, { atMs: Math.round(agoraMs()), durationMs: 1500, scale: 1.25 }] })}
        >
          + no momento atual
        </button>
      }
    >
      <Lista<Zoom>
        itens={props.zooms}
        titulo={(_z, i) => `Zoom ${i + 1}`}
        resumo={(z) => `${formatarTempo(z.atMs)} · ${z.durationMs / 1000}s · ${Math.round((z.scale - 1) * 100)}%`}
        inicio={(z) => z.atMs}
        irPara={irPara}
        aoMudar={(zooms) => mudar({ zooms })}
        editor={(z, m) => (
          <>
            <Tempo rotulo="Começa em" ms={z.atMs} aoMudar={(atMs) => m({ atMs })} agoraMs={agoraMs} />
            <Deslizante rotulo="Duração" valor={z.durationMs} min={300} max={6000} passo={100} formato={(v) => `${v / 1000}s`} aoMudar={(durationMs) => m({ durationMs })} />
            <Deslizante rotulo="Quanto aproxima" valor={z.scale} min={1.05} max={2} passo={0.05} formato={(v) => `${Math.round((v - 1) * 100)}%`} aoMudar={(scale) => m({ scale })} />
          </>
        )}
      />
    </Secao>

    <Secao
      titulo="Transição entre frases"
      dica={
        props.cuts
          ? "Efeito em cada emenda do corte de silêncios."
          : "Efeito no começo de cada frase (com o corte de silêncios, vai nas emendas do corte)."
      }
    >
      {arquivos.cuts ? (
        <Alternar
          rotulo="Usar o corte de silêncios"
          ligado={Boolean(props.cuts)}
          aoMudar={(v) => mudar({ cuts: v ? props.video.replace(/\.[^./]+$/, "") + ".cuts.json" : "" })}
        />
      ) : null}
      <Escolha
        valor={props.cutTransition}
        opcoes={[
          { valor: "zoom", nome: "Zoom (alterna perto/longe)" },
          { valor: "flash", nome: "Flash branco" },
          { valor: "whip", nome: "Chicote (whip)" },
          { valor: "glitch", nome: "Glitch" },
          { valor: "luz", nome: "Luz de filme" },
          { valor: "tremor", nome: "Tranco (câmera treme)" },
          { valor: "none", nome: "Nenhuma" },
        ]}
        aoMudar={(cutTransition) => mudar({ cutTransition })}
      />
    </Secao>

    <Secao
      titulo="B-roll (imagens e vídeos por cima)"
      acao={
        <EnviarArquivo
          rotulo="+ Adicionar arquivo"
          aceitar="image/*,video/*"
          classe="botao pequeno primario"
          aoEnviar={(src) =>
            mudar({ broll: [...props.broll, { src, startMs: Math.round(agoraMs()), durationMs: 2500, mode: "full", transition: "zoom" }] })
          }
        />
      }
    >
      {arquivos.brollFile ? (
        <Alternar rotulo="Usar o B-roll automático" ligado={Boolean(props.brollFile)} aoMudar={(v) => mudar({ brollFile: v ? props.video.replace(/\.[^./]+$/, "") + ".broll.json" : "" })} />
      ) : null}
      {props.brollFile ? <BrollAutomatico arquivo={props.brollFile} mudar={mudar} /> : null}
      <Lista<Broll>
        itens={props.broll}
        titulo={(b) => b.src.split("/").pop() ?? b.src}
        resumo={(b) => `${formatarTempo(b.startMs)} · ${b.durationMs / 1000}s · ${b.mode === "full" ? "tela cheia" : "cartão"}`}
        inicio={(b) => b.startMs}
        irPara={irPara}
        aoMudar={(broll) => mudar({ broll })}
        editor={(b, m) => (
          <>
            <Tempo rotulo="Começa em" ms={b.startMs} aoMudar={(startMs) => m({ startMs })} agoraMs={agoraMs} />
            <Deslizante rotulo="Duração" valor={b.durationMs} min={500} max={10000} passo={100} formato={(v) => `${v / 1000}s`} aoMudar={(durationMs) => m({ durationMs })} />
            <Escolha rotulo="Formato" valor={b.mode} opcoes={[{ valor: "full", nome: "Tela cheia" }, { valor: "pip", nome: "Cartão no topo" }]} aoMudar={(mode) => m({ mode })} />
            <Escolha
              rotulo="Entrada"
              valor={b.transition}
              opcoes={[
                { valor: "zoom", nome: "Zoom" },
                { valor: "fade", nome: "Aparecer" },
                { valor: "slide", nome: "Subir" },
                { valor: "glitch", nome: "Glitch" },
              ]}
              aoMudar={(transition) => m({ transition })}
            />
          </>
        )}
      />
    </Secao>
  </>
  );
};

type MusicaDaBiblioteca = { arquivo: string; nome: string; bpm: number | null; clima: string | null; inicioMs: number; duracaoMs: number | null };

const AbaAudio: React.FC<Props> = ({ props, mudar, arquivos }) => {
  const [biblioteca, setBiblioteca] = useState<MusicaDaBiblioteca[]>([]);
  const [antigas, setAntigas] = useState<string[]>([]);
  const [enviando, setEnviando] = useState("");
  const [trocando, setTrocando] = useState(false);
  const [erro, setErro] = useState("");
  const entrada = useRef<HTMLInputElement>(null);
  const atualizar = () => {
    get<MusicaDaBiblioteca[]>("/api/musicas").then(setBiblioteca).catch(() => {});
    // Músicas enviadas antes da biblioteca existir (public/uploads) continuam aparecendo.
    get<string[]>("/api/uploads").then((l) => setAntigas(l.filter((x) => /\.(mp3|wav|m4a|aac|ogg)$/i.test(x)))).catch(() => {});
  };
  useEffect(atualizar, [props.music]);
  // Enquanto alguma música está sem ritmo calculado, confere de novo daqui a pouco.
  useEffect(() => {
    if (!biblioteca.some((m) => m.bpm === null)) return;
    const t = setTimeout(atualizar, 3000);
    return () => clearTimeout(t);
  }, [biblioteca]);

  const atual = biblioteca.find((m) => m.arquivo === props.music);
  const trocar = async () => {
    setTrocando(true);
    setErro("");
    try {
      mudar(await enviar<Partial<ShortVideoProps>>("POST", "/api/musica/trocar", { projeto: props.video, atual: props.music }));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setTrocando(false);
    }
  };
  const adicionar = async (lista: FileList | null) => {
    if (!lista?.length) return;
    setErro("");
    try {
      let n = 0;
      for (const arquivo of Array.from(lista)) {
        n++;
        await subirArquivo(arquivo, "musica", (p) => setEnviando(`Enviando ${n} de ${lista.length} (${Math.round(p * 100)}%)`));
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando("");
      atualizar();
    }
  };

  return (
    <>
      {arquivos.audio ? (
        <Secao titulo="Voz" dica="Áudio melhorado: sem ruído de fundo e no volume certo das redes.">
          <Alternar
            rotulo="Usar o áudio melhorado"
            ligado={Boolean(props.audio)}
            aoMudar={(v) => mudar({ audio: v ? props.video.replace(/\.[^./]+$/, "") + ".voz.m4a" : "" })}
          />
        </Secao>
      ) : null}
      <Secao titulo="Música de fundo" dica="Toca em loop e abaixa sozinha quando você fala. O Editar automático escolhe uma de Minhas músicas.">
        <div className="linha-form">
          <select
            value={props.music}
            onChange={(e) => {
              const m = biblioteca.find((x) => x.arquivo === e.target.value);
              mudar({ music: e.target.value, musicInicioMs: m?.inicioMs ?? 0 });
            }}
          >
            <option value="">Sem música</option>
            {biblioteca.map((m) => (
              <option key={m.arquivo} value={m.arquivo}>
                {m.nome}
              </option>
            ))}
            {antigas.map((m) => (
              <option key={m} value={m}>
                {m.replace("uploads/", "")}
              </option>
            ))}
          </select>
          <button className="botao secundario" disabled={trocando || !biblioteca.length} onClick={trocar} title="Põe outra música que combina com o vídeo">
            {trocando ? "..." : "🔀 Trocar"}
          </button>
        </div>
        {atual?.bpm ? (
          <p className="dica">
            ♪ {Math.round(atual.bpm)} batidas por minuto · {atual.clima}
          </p>
        ) : null}
        {props.music ? (
          <>
            <Deslizante rotulo="Volume" valor={props.musicVolume} min={0} max={1} passo={0.05} formato={(v) => `${Math.round(v * 100)}%`} aoMudar={(musicVolume) => mudar({ musicVolume })} />
            <Deslizante rotulo="Volume enquanto você fala" valor={props.duckTo} min={0} max={1} passo={0.05} formato={(v) => `${Math.round(v * 100)}%`} aoMudar={(duckTo) => mudar({ duckTo })} />
            {atual?.duracaoMs ? (
              <Deslizante
                rotulo="Começar a música em"
                valor={Math.round((props.musicInicioMs ?? 0) / 500) / 2}
                min={0}
                max={Math.floor(atual.duracaoMs / 1000)}
                passo={0.5}
                formato={(v) => `${v}s`}
                aoMudar={(v) => mudar({ musicInicioMs: v * 1000 })}
              />
            ) : null}
            {atual?.bpm ? (
              <>
                <Alternar
                  rotulo="Efeitos no ritmo da música"
                  dica="Zooms, animações, textos e efeitos caem na batida."
                  ligado={props.noRitmo ?? true}
                  aoMudar={(noRitmo) => mudar({ noRitmo })}
                />
                <Alternar
                  rotulo="Pulsar na batida"
                  dica="A imagem dá um pulo leve no ritmo da música."
                  ligado={props.pulsoBatida ?? false}
                  aoMudar={(pulsoBatida) => mudar({ pulsoBatida })}
                />
              </>
            ) : null}
          </>
        ) : null}
        {erro ? <p className="alerta">{erro}</p> : null}
      </Secao>
      <Secao
        titulo="Minhas músicas"
        dica="Coloque aqui as suas músicas (ex.: feitas no Suno). O Studio descobre o ritmo de cada uma."
        acao={
          <button className="botao pequeno primario" disabled={Boolean(enviando)} onClick={() => entrada.current?.click()}>
            {enviando || "+ Adicionar músicas"}
          </button>
        }
      >
        <input
          ref={entrada}
          type="file"
          accept="audio/*"
          multiple
          hidden
          onChange={(e) => {
            const lista = e.target.files;
            adicionar(lista).finally(() => (e.target.value = ""));
          }}
        />
        {biblioteca.length ? (
          <div className="lista-musicas">
            {biblioteca.map((m) => (
              <div key={m.arquivo} className={`musica-item${m.arquivo === props.music ? " atual" : ""}`}>
                <div>
                  <b>{m.nome}</b>
                  <small>{m.bpm ? `${Math.round(m.bpm)} bpm · ${m.clima}` : "analisando o ritmo..."}</small>
                </div>
                <button
                  className="botao pequeno fantasma"
                  title="Tirar da biblioteca (apaga o arquivo da música)"
                  onClick={async () => {
                    if (!window.confirm(`Tirar "${m.nome}" de Minhas músicas? O arquivo da música será apagado.`)) return;
                    await enviar("DELETE", `/api/musicas?arquivo=${encodeURIComponent(m.arquivo)}`).catch(() => {});
                    if (m.arquivo === props.music) mudar({ music: "" });
                    atualizar();
                  }}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="vazio-lista">Nenhuma música ainda.</p>
        )}
        <p className="dica">Use só músicas suas ou liberadas para uso comercial (no Suno, as feitas no plano pago).</p>
      </Secao>
      <Secao titulo="Efeitos sonoros" dica="Whoosh nas transições e no B-roll, pop nos emojis e no gancho.">
        <Alternar rotulo="Ligar efeitos sonoros" ligado={props.sfx} aoMudar={(sfx) => mudar({ sfx })} />
        {props.sfx ? (
          <Deslizante rotulo="Volume" valor={props.sfxVolume} min={0} max={1} passo={0.05} formato={(v) => `${Math.round(v * 100)}%`} aoMudar={(sfxVolume) => mudar({ sfxVolume })} />
        ) : null}
      </Secao>
    </>
  );
};

type Marca = {
  ativa?: boolean;
  arroba: string;
  corPrincipal: string;
  corTexto: string;
  corFundo: string;
  fonte: string;
  logo: string;
  marcaDagua: "logo" | "arroba" | "nenhuma";
  posicao: "topo-esquerda" | "topo-direita" | "baixo-esquerda" | "baixo-direita";
  barraProgresso: boolean;
  cta: { texto: string; botao: string; duracaoMs: number };
};

const AbaMarca: React.FC<Props> = ({ props, mudar }) => {
  const [marca, setMarca] = useState<Marca | null>(null);
  const primeira = useRef(true);

  useEffect(() => {
    get<{ marca: Marca }>("/api/marca").then((r) => setMarca(r.marca)).catch(() => {});
  }, []);

  // Salva e recarrega o preview quando a marca muda.
  useEffect(() => {
    if (!marca) return;
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    const t = setTimeout(async () => {
      await enviar("PUT", "/api/marca", marca);
      if (props.brand) {
        mudar({ brand: "" });
        setTimeout(() => mudar({ brand: "marca.json" }), 60);
      }
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marca]);

  if (!marca) return <p className="dica">Carregando...</p>;
  // Mexer em qualquer campo liga a marca (é o que a pessoa espera ao configurar).
  const m = (p: Partial<Marca>) => {
    setMarca({ ...marca, ...p, ativa: true });
    if (!props.brand) mudar({ brand: "marca.json" });
  };

  return (
    <>
      <Alternar
        rotulo="Usar minha marca nos vídeos"
        dica="Vale para todos os vídeos: cores, @ ou logo, barra de progresso e tela final"
        ligado={Boolean(props.brand)}
        aoMudar={async (v) => {
          const nova = { ...marca, ativa: v };
          setMarca(nova);
          await enviar("PUT", "/api/marca", nova);
          mudar({ brand: v ? "marca.json" : "" });
        }}
      />
      <Secao titulo="Identidade">
        <Texto rotulo="Seu @" valor={marca.arroba} placeholder="@seuperfil" aoMudar={(arroba) => m({ arroba })} />
        <div className="cores">
          <Cor rotulo="Principal" valor={marca.corPrincipal} aoMudar={(corPrincipal) => m({ corPrincipal })} />
          <Cor rotulo="Texto" valor={marca.corTexto} aoMudar={(corTexto) => m({ corTexto })} />
          <Cor rotulo="Fundo" valor={marca.corFundo} aoMudar={(corFundo) => m({ corFundo })} />
        </div>
        <Linha rotulo="Logo" bloco>
          <div className="linha-form">
            {marca.logo ? <img className="miniatura" src={`/${marca.logo}`} alt="" /> : <span className="dica">sem logo</span>}
            <EnviarArquivo rotulo={marca.logo ? "Trocar" : "Enviar logo"} aceitar="image/*" aoEnviar={(logo) => m({ logo })} />
            {marca.logo ? <button className="botao pequeno fantasma" onClick={() => m({ logo: "" })}>Tirar</button> : null}
          </div>
        </Linha>
        <Linha rotulo="Fonte própria (opcional)" bloco>
          <div className="linha-form">
            <span className="dica">{marca.fonte ? marca.fonte.split("/").pop() : "padrão"}</span>
            <EnviarArquivo rotulo="Enviar fonte" aceitar=".ttf,.otf,.woff,.woff2" aoEnviar={(fonte) => m({ fonte })} />
            {marca.fonte ? <button className="botao pequeno fantasma" onClick={() => m({ fonte: "" })}>Tirar</button> : null}
          </div>
        </Linha>
      </Secao>
      <Secao titulo="No vídeo">
        <Escolha
          rotulo="Marca d'água"
          valor={marca.marcaDagua}
          opcoes={[{ valor: "logo", nome: "Logo" }, { valor: "arroba", nome: "Seu @" }, { valor: "nenhuma", nome: "Nenhuma" }]}
          aoMudar={(marcaDagua) => m({ marcaDagua })}
        />
        <Escolha
          rotulo="Posição"
          valor={marca.posicao}
          opcoes={[
            { valor: "topo-direita", nome: "Topo, direita" },
            { valor: "topo-esquerda", nome: "Topo, esquerda" },
            { valor: "baixo-direita", nome: "Embaixo, direita" },
            { valor: "baixo-esquerda", nome: "Embaixo, esquerda" },
          ]}
          aoMudar={(posicao) => m({ posicao })}
        />
        <Alternar rotulo="Barra de progresso no topo" ligado={marca.barraProgresso} aoMudar={(barraProgresso) => m({ barraProgresso })} />
      </Secao>
      <Secao titulo='Tela final "segue pra mais"'>
        <Texto rotulo="Frase" valor={marca.cta.texto} aoMudar={(texto) => m({ cta: { ...marca.cta, texto } })} />
        <Texto rotulo="Botão" valor={marca.cta.botao} aoMudar={(botao) => m({ cta: { ...marca.cta, botao } })} />
        <Deslizante
          rotulo="Duração"
          valor={marca.cta.duracaoMs}
          min={0}
          max={5000}
          passo={250}
          formato={(v) => (v ? `${v / 1000}s` : "desligada")}
          aoMudar={(duracaoMs) => m({ cta: { ...marca.cta, duracaoMs } })}
        />
      </Secao>
    </>
  );
};

export const Ajustes: React.FC<Props> = (p) => {
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("legenda");
  return (
    <div className="ajustes">
      <nav className="abas">
        {ABAS.map((a) => (
          <button key={a.id} className={aba === a.id ? "ativa" : ""} onClick={() => setAba(a.id)}>
            {a.nome}
          </button>
        ))}
      </nav>
      <div className="ajustes-corpo">
        {aba === "legenda" ? <AbaLegenda {...p} /> : null}
        {aba === "textos" ? <AbaTextos {...p} /> : null}
        {aba === "efeitos" ? <AbaEfeitos {...p} /> : null}
        {aba === "audio" ? <AbaAudio {...p} /> : null}
        {aba === "marca" ? <AbaMarca {...p} /> : null}
      </div>
    </div>
  );
};
