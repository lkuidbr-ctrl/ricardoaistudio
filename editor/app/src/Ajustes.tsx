// Coluna direita: todos os ajustes visuais do vídeo, em abas.
import React, { useEffect, useRef, useState } from "react";
import type { Broll, BehindText, CaptionStyle, ShortVideoProps, Zoom } from "../../src/schema";
import { enviar, formatarTempo, get, type Arquivos } from "./api";
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

const AbaEfeitos: React.FC<Props> = ({ props, mudar, arquivos, agoraMs, irPara }) => (
  <>
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

const AbaAudio: React.FC<Props> = ({ props, mudar }) => {
  const [musicas, setMusicas] = useState<string[]>([]);
  useEffect(() => {
    get<string[]>("/api/uploads").then((l) => setMusicas(l.filter((x) => /\.(mp3|wav|m4a|aac|ogg)$/i.test(x)))).catch(() => {});
  }, [props.music]);
  return (
    <>
      <Secao titulo="Música de fundo" dica="Toca em loop e abaixa sozinha quando você fala.">
        <div className="linha-form">
          <select value={props.music} onChange={(e) => mudar({ music: e.target.value })}>
            <option value="">Sem música</option>
            {musicas.map((m) => (
              <option key={m} value={m}>
                {m.replace("uploads/", "")}
              </option>
            ))}
          </select>
          <EnviarArquivo rotulo="Enviar música" aceitar="audio/*" aoEnviar={(music) => mudar({ music })} />
        </div>
        {props.music ? (
          <>
            <Deslizante rotulo="Volume" valor={props.musicVolume} min={0} max={1} passo={0.05} formato={(v) => `${Math.round(v * 100)}%`} aoMudar={(musicVolume) => mudar({ musicVolume })} />
            <Deslizante rotulo="Volume enquanto você fala" valor={props.duckTo} min={0} max={1} passo={0.05} formato={(v) => `${Math.round(v * 100)}%`} aoMudar={(duckTo) => mudar({ duckTo })} />
          </>
        ) : null}
        <p className="dica">Músicas liberadas: Biblioteca de Áudio do YouTube ou Pixabay Music.</p>
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
