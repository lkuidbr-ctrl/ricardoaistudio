import { Player, type PlayerRef } from "@remotion/player";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculateMetadata, defaultProps } from "../../src/Root";
import type { ShortVideoProps } from "../../src/schema";
import { ShortVideo } from "../../src/ShortVideo";
import { Ajustes } from "./Ajustes";
import { enviar, get, subir, type Arquivos, type Projeto, type Tarefa } from "./api";
import { Ferramentas, type Ia } from "./Ferramentas";
import { ModalClipes, ModalConfig, ModalExportar, ModalNarrar } from "./Modais";

const FPS = 30;
const SEM_ARQUIVOS: Arquivos = { captions: false, cuts: false, person: false, brollFile: false, emojis: false };

// Configurações de um vídeo novo: parte do padrão do editor, mas sem os exemplos.
const montarProps = (id: string, salvo: Partial<ShortVideoProps>): ShortVideoProps => ({
  ...defaultProps,
  video: id,
  captions: "",
  person: "",
  cuts: "",
  brollFile: "",
  hookText: "",
  brand: "",
  music: "",
  behindTexts: [],
  zooms: [],
  broll: [],
  ...salvo,
});

const lerLocal = (chave: string, padrao: string) => {
  try {
    return localStorage.getItem(chave) ?? padrao;
  } catch {
    return padrao;
  }
};
const gravarLocal = (chave: string, valor: string) => {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* navegador sem armazenamento: só não lembra a escolha */
  }
};

type Aviso = { id: number; texto: string; tipo: "ok" | "erro" };

export const App: React.FC = () => {
  const [projetos, setProjetos] = useState<Projeto[] | null>(null);
  const [atual, setAtual] = useState<string | null>(null);
  const [props, setProps] = useState<ShortVideoProps | null>(null);
  const [arquivos, setArquivos] = useState<Arquivos>(SEM_ARQUIVOS);
  const [duracao, setDuracao] = useState<number | null>(null);
  const [erroPreview, setErroPreview] = useState("");
  const [tarefas, setTarefas] = useState<Record<string, Tarefa>>({});
  const [ia, setIaEstado] = useState<Ia>(() => lerLocal("ia", "claude") as Ia);
  const [modal, setModal] = useState<null | "narrar" | "config" | "exportar">(null);
  const [exportacao, setExportacao] = useState<string | null>(null);
  const [clipes, setClipes] = useState<NonNullable<Tarefa["resultado"]>["clipes"] | null>(null);
  const [envio, setEnvio] = useState<number | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [menuAberto, setMenuAberto] = useState(false);
  const player = useRef<PlayerRef>(null);
  // Tarefas já tratadas: a verificação periódica pode ver o fim da mesma tarefa mais de uma vez.
  const finalizadas = useRef(new Set<string>());
  const carregado = useRef<string | null>(null);

  const avisar = useCallback((texto: string, tipo: Aviso["tipo"] = "ok") => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === "erro" ? 9000 : 4500);
  }, []);

  const setIa = (v: Ia) => {
    setIaEstado(v);
    gravarLocal("ia", v);
  };

  // ---------------------------------------------------------------- projetos
  const carregarProjetos = useCallback(async () => {
    const lista = await get<Projeto[]>("/api/projetos");
    setProjetos(lista);
    return lista;
  }, []);

  const abrirProjeto = useCallback(async (id: string) => {
    const dados = await get<{ arquivos: Arquivos; configuracoes: Partial<ShortVideoProps> }>(
      `/api/projeto?id=${encodeURIComponent(id)}`,
    );
    carregado.current = id;
    setAtual(id);
    setArquivos(dados.arquivos);
    setProps(montarProps(id, dados.configuracoes));
    setMenuAberto(false);
    gravarLocal("projeto", id);
  }, []);

  useEffect(() => {
    carregarProjetos()
      .then((lista) => {
        const lembrado = lerLocal("projeto", "");
        const escolha = lista.find((p) => p.id === lembrado) ?? lista[0];
        if (escolha) return abrirProjeto(escolha.id);
      })
      .catch((e) => avisar(`Não consegui falar com o Studio: ${e.message}`, "erro"));
  }, [carregarProjetos, abrirProjeto, avisar]);

  // Salva os ajustes automaticamente (meio segundo depois da última mudança).
  useEffect(() => {
    if (!props || !atual || carregado.current !== atual) return;
    const t = setTimeout(() => {
      enviar("PUT", `/api/projeto?id=${encodeURIComponent(atual)}`, props).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [props, atual]);

  // Duração do preview (muda quando troca o vídeo ou o corte de silêncios).
  useEffect(() => {
    if (!props) return;
    let vivo = true;
    setErroPreview("");
    Promise.resolve(
      calculateMetadata({
      props,
      defaultProps: props,
      abortSignal: new AbortController().signal,
      compositionId: "ShortVideo",
      isRendering: false,
    } as Parameters<typeof calculateMetadata>[0]),
    )
      .then((m) => vivo && setDuracao(m.durationInFrames ?? FPS * 5))
      .catch((e: Error) => vivo && setErroPreview(e.message));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props?.video, props?.cuts, props?.captions, props?.person, props?.brollFile, props?.music, props?.brand]);

  const mudar = useCallback((parcial: Partial<ShortVideoProps>) => setProps((p) => (p ? { ...p, ...parcial } : p)), []);

  // ---------------------------------------------------------------- tarefas
  const aoTerminar = useCallback(
    async (t: Tarefa) => {
      if (finalizadas.current.has(t.id)) return;
      finalizadas.current.add(t.id);
      if (t.status === "cancelado") return;
      if (t.status === "erro") {
        avisar(`${t.rotulo}: ${t.dica ?? "deu erro. Veja os detalhes no cartão da ferramenta."}`, "erro");
        return;
      }
      if (t.tipo === "exportar") return; // o modal de exportação mostra o resultado
      if (t.tipo === "login") {
        avisar("Login no Claude concluído.");
        return;
      }
      avisar(`${t.rotulo}: pronto!`);
      if (t.resultado?.novoProjeto) {
        await carregarProjetos();
        await abrirProjeto(t.resultado.novoProjeto);
        return;
      }
      if (t.resultado?.clipes) {
        await carregarProjetos();
        setClipes(t.resultado.clipes);
        return;
      }
      if (t.projeto && t.projeto === carregado.current) {
        const dados = await get<{ arquivos: Arquivos; configuracoes: Partial<ShortVideoProps> }>(
          `/api/projeto?id=${encodeURIComponent(t.projeto)}`,
        );
        setArquivos(dados.arquivos);
        const c = dados.configuracoes;
        // Só traz o que a ferramenta criou, para não perder ajustes ainda não salvos.
        mudar({
          captions: c.captions ?? "",
          cuts: c.cuts ?? "",
          person: c.person ?? "",
          brollFile: c.brollFile ?? "",
          ...(t.tipo === "emojis" ? { emojis: true, captions: `${c.captions}` } : {}),
        });
        // Força o preview a reler as legendas (mesmo nome de arquivo, conteúdo novo).
        if (t.tipo === "emojis" || t.tipo === "transcrever") {
          const legenda = c.captions ?? "";
          mudar({ captions: "" });
          setTimeout(() => mudar({ captions: legenda }), 50);
        }
      }
    },
    [avisar, carregarProjetos, abrirProjeto, mudar],
  );

  const rodando = useMemo(() => Object.values(tarefas).filter((t) => t.status === "rodando"), [tarefas]);

  const consultando = useRef(false);
  useEffect(() => {
    if (!rodando.length) return;
    const intervalo = setInterval(async () => {
      if (consultando.current) return; // a consulta anterior ainda não voltou
      consultando.current = true;
      for (const t of rodando) {
        try {
          const novo = await get<Tarefa & { total: number }>(`/api/tarefas/${t.id}?desde=${t.linhas.length}`);
          const atualizado = { ...novo, linhas: [...t.linhas, ...novo.linhas] };
          setTarefas((ts) => ({ ...ts, [t.id]: atualizado }));
          if (novo.status !== "rodando") aoTerminar(atualizado);
        } catch {
          /* servidor ocupado: tenta de novo no próximo ciclo */
        }
      }
      consultando.current = false;
    }, 800);
    return () => clearInterval(intervalo);
  }, [rodando, aoTerminar]);

  const acompanhar = (id: string, rotulo: string, tipo: string, projeto: string | null) =>
    setTarefas((ts) => ({
      ...ts,
      [id]: { id, rotulo, tipo, projeto, status: "rodando", progresso: null, resultado: null, linhas: [] },
    }));

  const iniciar = async (ferramenta: string, opcoes: Record<string, unknown> = {}) => {
    if (!atual) return;
    try {
      const { id } = await enviar<{ id: string }>("POST", "/api/tarefas", { ferramenta, projeto: atual, opcoes: { ia, ...opcoes } });
      acompanhar(id, ferramenta, ferramenta, atual);
    } catch (e) {
      avisar((e as Error).message, "erro");
    }
  };

  const cancelar = (id: string) => enviar("POST", `/api/tarefas/${id}/cancelar`).catch(() => {});

  const exportar = async () => {
    if (!props || !atual) return;
    try {
      const { id } = await enviar<{ id: string }>("POST", "/api/exportar", { projeto: atual, props });
      acompanhar(id, "Exportar vídeo", "exportar", atual);
      setExportacao(id);
      setModal("exportar");
    } catch (e) {
      avisar((e as Error).message, "erro");
    }
  };

  // ---------------------------------------------------------------- envio de vídeos
  const enviarVideo = async (arquivo: File) => {
    setEnvio(0);
    try {
      const { caminho, tarefa } = await subir(arquivo, "video", setEnvio);
      if (tarefa) {
        acompanhar(tarefa, "Preparando o vídeo", "converter", null);
        avisar("Convertendo o vídeo para um formato compatível. Ele abre sozinho quando terminar.");
        return;
      }
      await carregarProjetos();
      await abrirProjeto(caminho);
      avisar('Vídeo adicionado! Comece por "Gerar legendas".');
    } catch (e) {
      avisar((e as Error).message, "erro");
    } finally {
      setEnvio(null);
    }
  };

  const escolherVideo = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*";
    input.onchange = () => input.files?.[0] && enviarVideo(input.files[0]);
    input.click();
  };

  const excluir = async (id: string) => {
    if (!confirm(`Apagar "${id}" e os arquivos gerados para ele? (o vídeo exportado em out/ fica)`)) return;
    await enviar("DELETE", `/api/projeto?id=${encodeURIComponent(id)}`);
    const lista = await carregarProjetos();
    if (id === atual) {
      setAtual(null);
      setProps(null);
      if (lista[0]) abrirProjeto(lista[0].id);
    }
  };

  const agoraMs = () => ((player.current?.getCurrentFrame() ?? 0) / FPS) * 1000;
  const irPara = (ms: number) => player.current?.seekTo(Math.round((ms / 1000) * FPS));

  const tarefasDoProjeto = Object.values(tarefas).filter((t) => t.projeto === atual && t.tipo !== "exportar");
  const nomeAtual = projetos?.find((p) => p.id === atual)?.nome ?? atual ?? "";

  const grupos = useMemo(() => {
    const g: Record<string, Projeto[]> = {};
    for (const p of projetos ?? []) (g[p.pasta === "clips" ? "Clipes" : p.pasta === "roteiros" ? "Narrações" : "Seus vídeos"] ??= []).push(p);
    return g;
  }, [projetos]);

  return (
    <div
      className="app"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setArrastando(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        const f = e.dataTransfer.files[0];
        if (f?.type.startsWith("video/")) enviarVideo(f);
        else if (f) avisar("Arraste um arquivo de vídeo (mp4, mov...).", "erro");
      }}
    >
      <header className="topo">
        <div className="marca-app">
          <span className="logo-app">▶</span>
          <b>Ricardo AI Studio</b>
        </div>

        {projetos?.length ? (
          <div className="seletor">
            <button className="botao fantasma" onClick={() => setMenuAberto((v) => !v)}>
              <span className="nome-projeto">{nomeAtual}</span> ▾
            </button>
            {menuAberto ? (
              <div className="menu" onMouseLeave={() => setMenuAberto(false)}>
                {Object.entries(grupos).map(([grupo, itens]) => (
                  <div key={grupo}>
                    <div className="menu-grupo">{grupo}</div>
                    {itens.map((p) => (
                      <div key={p.id} className={`menu-item ${p.id === atual ? "ativo" : ""}`}>
                        <button onClick={() => abrirProjeto(p.id)}>{p.nome}</button>
                        <button className="lixeira" title="Apagar" onClick={() => excluir(p.id)}>
                          🗑
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <button className="botao secundario" onClick={escolherVideo} disabled={envio !== null}>
          {envio !== null ? `Enviando ${Math.round(envio * 100)}%` : "+ Novo vídeo"}
        </button>
        <button className="botao secundario" onClick={() => setModal("narrar")}>
          🎙 Narrar roteiro
        </button>

        <div className="espaco" />
        <button className="botao fantasma" onClick={() => setModal("config")} title="Configurações">
          ⚙ Configurações
        </button>
        <button className="botao primario" onClick={exportar} disabled={!props || !duracao}>
          Exportar vídeo
        </button>
      </header>

      {projetos && projetos.length === 0 ? (
        <main className="vazio">
          <div className="soltar" onClick={escolherVideo}>
            <div className="soltar-icone">⬆</div>
            <h1>Arraste seu vídeo para cá</h1>
            <p>ou clique para escolher um arquivo (mp4, mov...)</p>
            {envio !== null ? <div className="barra"><i style={{ width: `${envio * 100}%` }} /></div> : null}
          </div>
          <p className="ou">
            Não tem vídeo gravado?{" "}
            <button className="link" onClick={() => setModal("narrar")}>
              Crie um a partir de um roteiro, com voz por IA
            </button>
          </p>
        </main>
      ) : (
        <main className="area">
          <aside className="coluna esquerda">
            {props ? (
              <Ferramentas
                arquivos={arquivos}
                tarefas={tarefasDoProjeto}
                iniciar={iniciar}
                cancelar={cancelar}
                ia={ia}
                setIa={setIa}
              />
            ) : null}
          </aside>

          <section className="palco">
            {props && duracao ? (
              <div className="moldura">
                <Player
                  ref={player}
                  component={ShortVideo}
                  inputProps={props}
                  durationInFrames={duracao}
                  fps={FPS}
                  compositionWidth={1080}
                  compositionHeight={1920}
                  controls
                  clickToPlay
                  doubleClickToFullscreen
                  acknowledgeRemotionLicense
                  errorFallback={({ error }) => (
                    <div className="erro-player">
                      <b>Não deu para tocar este vídeo.</b>
                      <span>{error.message.includes("DEMUXER") || error.message.includes("MediaError") ? "O formato não é suportado pelo navegador. Envie o vídeo de novo: o Studio converte sozinho." : error.message}</span>
                    </div>
                  )}
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            ) : (
              <div className="carregando">{erroPreview ? `Não deu para mostrar o vídeo: ${erroPreview}` : "Carregando..."}</div>
            )}
          </section>

          <aside className="coluna direita">
            {props ? <Ajustes props={props} mudar={mudar} arquivos={arquivos} agoraMs={agoraMs} irPara={irPara} /> : null}
          </aside>
        </main>
      )}

      {Object.values(tarefas)
        .filter((t) => t.tipo === "converter" && t.status === "rodando")
        .map((t) => (
          <div key={t.id} className="modal-fundo">
            <div className="modal">
              <h2>Preparando seu vídeo...</h2>
              <p className="dica">Ele está num formato que o navegador não toca (comum em vídeos de iPhone). Estou convertendo; pode levar alguns minutos.</p>
              <div className="barra grande">
                <i className={t.progresso == null ? "indeterminada" : ""} style={{ width: `${Math.max(3, (t.progresso ?? 0) * 100)}%` }} />
              </div>
            </div>
          </div>
        ))}

      {arrastando ? (
        <div className="cortina">
          <div>Solte o vídeo para adicionar</div>
        </div>
      ) : null}

      <div className="avisos">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso ${a.tipo}`}>
            {a.texto}
          </div>
        ))}
      </div>

      {modal === "narrar" ? (
        <ModalNarrar
          fechar={() => setModal(null)}
          aoIniciar={(id) => {
            acompanhar(id, "Narrar roteiro", "narrar", null);
            setModal(null);
            avisar("Gerando a narração... o vídeo novo abre sozinho quando terminar.");
          }}
          tarefas={Object.values(tarefas).filter((t) => t.tipo === "narrar")}
        />
      ) : null}
      {modal === "config" ? (
        <ModalConfig
          fechar={() => setModal(null)}
          ia={ia}
          setIa={setIa}
          aoLogin={(id) => acompanhar(id, "Entrar no Claude", "login", null)}
          tarefaLogin={Object.values(tarefas).filter((t) => t.tipo === "login").pop()}
        />
      ) : null}
      {modal === "exportar" && exportacao && tarefas[exportacao] ? (
        <ModalExportar tarefa={tarefas[exportacao]} fechar={() => setModal(null)} cancelar={() => cancelar(exportacao)} />
      ) : null}
      {clipes ? <ModalClipes clipes={clipes} fechar={() => setClipes(null)} abrir={(id) => { setClipes(null); abrirProjeto(id); }} /> : null}
    </div>
  );
};
