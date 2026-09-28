import { Player, type PlayerRef } from "@remotion/player";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculateMetadata, defaultProps } from "../../src/Root";
import type { ShortVideoProps } from "../../src/schema";
import { ShortVideo } from "../../src/ShortVideo";
import { Ajustes } from "./Ajustes";
import { enviar, get, subir, type Arquivos, type Projeto, type Tarefa } from "./api";
import { Ferramentas, type Ia } from "./Ferramentas";
import { PecaIa } from "./PecaIa";
import { ModalChave, ModalClipes, ModalConfig, ModalExportar, ModalNarrar } from "./Modais";

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

type Aviso = { id: number; texto: string; tipo: "ok" | "erro" | "alerta" };

export const App: React.FC = () => {
  const [projetos, setProjetos] = useState<Projeto[] | null>(null);
  const [atual, setAtual] = useState<string | null>(null);
  const [props, setProps] = useState<ShortVideoProps | null>(null);
  const [arquivos, setArquivos] = useState<Arquivos>(SEM_ARQUIVOS);
  const [duracao, setDuracao] = useState<number | null>(null);
  const [erroPreview, setErroPreview] = useState("");
  const [tarefas, setTarefas] = useState<Record<string, Tarefa>>({});
  const [ia, setIaEstado] = useState<Ia>(() => lerLocal("ia-escolhida", "claude") as Ia);
  const [modal, setModal] = useState<null | "narrar" | "config" | "exportar" | "chave">(null);
  // Tem chave do Claude salva? (null = ainda não sei)
  const [temChave, setTemChave] = useState<boolean | null>(null);
  // Vídeo esperando a chave para a IA editar.
  const esperandoChave = useRef<string | null>(null);
  const [exportacao, setExportacao] = useState<string | null>(null);
  const [clipes, setClipes] = useState<NonNullable<Tarefa["resultado"]>["clipes"] | null>(null);
  const [envio, setEnvio] = useState<number | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [menuAberto, setMenuAberto] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);
  const player = useRef<PlayerRef>(null);
  // Tarefas já tratadas: a verificação periódica pode ver o fim da mesma tarefa mais de uma vez.
  const finalizadas = useRef(new Set<string>());
  const carregado = useRef<string | null>(null);

  const avisar = useCallback((texto: string, tipo: Aviso["tipo"] = "ok") => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === "ok" ? 4500 : 12000);
  }, []);

  const setIa = (v: Ia) => {
    setIaEstado(v);
    gravarLocal("ia-escolhida", v);
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

  // Recarregou a janela no meio de uma tarefa (ex.: exportação): volta a acompanhar.
  useEffect(() => {
    get<Tarefa[]>("/api/tarefas")
      .then((lista) => {
        for (const t of lista.filter((x) => x.status === "rodando")) {
          setTarefas((ts) => ({ ...ts, [t.id]: { ...t, linhas: [] } }));
          if (t.tipo === "exportar") setExportacao(t.id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    get<{ temClaude: boolean; claudeOk: boolean }>("/api/config")
      .then((c) => setTemChave(c.temClaude && c.claudeOk))
      .catch(() => {});
  }, []);

  // Avisa o motor que a janela está aberta; fechada por ~1 min, ele se desliga sozinho.
  useEffect(() => {
    const avisarPresenca = () => fetch("/api/presenca", { method: "POST" }).catch(() => {});
    avisarPresenca();
    const intervalo = setInterval(avisarPresenca, 15_000);
    return () => clearInterval(intervalo);
  }, []);

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
  const editarAutomaticoRef = useRef<(projeto: string) => void>(() => {});
  // aoTerminar é criado antes de "iniciar"; a referência deixa ele começar uma ferramenta.
  const iniciarRef = useRef<(ferramenta: string, opcoes?: Record<string, unknown>, projeto?: string | null) => void>(() => {});
  const aoTerminar = useCallback(
    async (t: Tarefa) => {
      if (finalizadas.current.has(t.id)) return;
      finalizadas.current.add(t.id);
      if (t.status === "cancelado") return;
      if (t.tipo === "exportar") {
        // Mostra o resultado mesmo se a janela de exportação tinha sido fechada.
        setExportacao(t.id);
        setModal("exportar");
        if (t.status === "ok" && t.resultado?.arquivo) {
          avisar("Vídeo pronto! Ele foi baixado para a pasta Downloads (e também fica em editor\\out).");
          // Baixa sozinho para a pasta Downloads do Windows.
          const link = document.createElement("a");
          link.href = t.resultado.arquivo;
          link.download = t.resultado.nome ?? "video.mp4";
          document.body.appendChild(link);
          link.click();
          link.remove();
        } else if (t.status === "erro") {
          avisar(`Exportar vídeo: ${t.dica ?? "deu erro. Veja os detalhes."}`, "erro");
        }
        return;
      }
      if (t.status === "erro") {
        avisar(`${t.rotulo}: ${t.dica ?? "deu erro. Veja os detalhes no cartão da ferramenta."}`, "erro");
        return;
      }
      if (t.tipo === "atualizar") {
        if (t.resultado?.atualizado) setReiniciando(true);
        return; // "já está na versão mais nova" aparece nas Configurações
      }
      if (t.tipo === "login") {
        avisar("Login no Claude concluído.");
        return;
      }
      avisar(t.aviso ? `${t.rotulo}: pronto, mas ${t.aviso[0].toLowerCase()}${t.aviso.slice(1)}` : `${t.rotulo}: pronto!`, t.aviso ? "alerta" : "ok");
      if (t.resultado?.novoProjeto) {
        await carregarProjetos();
        await abrirProjeto(t.resultado.novoProjeto);
        // Vídeo novo que acabou de chegar: a IA já edita sozinha.
        if (t.tipo === "converter") editarAutomaticoRef.current(t.resultado.novoProjeto);
        return;
      }
      if (t.resultado?.recarregar) {
        // O "Editar automático" salvou tudo no projeto: abre de novo com o resultado.
        if (t.projeto && t.projeto === carregado.current) await abrirProjeto(t.projeto);
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
          ...(t.tipo === "emojis"
            ? { emojis: true, captions: `${c.captions}`, zooms: c.zooms ?? [], hookText: c.hookText ?? "", hookDurationMs: c.hookDurationMs ?? 2500 }
            : {}),
        });
        // Força o preview a reler as legendas (mesmo nome de arquivo, conteúdo novo).
        if (t.tipo === "emojis" || t.tipo === "transcrever") {
          window.dispatchEvent(new Event("legenda-mudou"));
          const legenda = c.captions ?? "";
          mudar({ captions: "" });
          setTimeout(() => mudar({ captions: legenda }), 50);
        }
        // Refez o corte: mesmo nome de arquivo, conteúdo novo. Força o preview a reler.
        if (t.tipo === "cortar") {
          const cortes = c.cuts ?? "";
          mudar({ cuts: "" });
          setTimeout(() => mudar({ cuts: cortes }), 50);
        }
      }
    },
    [avisar, carregarProjetos, abrirProjeto, mudar],
  );

  // Depois de atualizar, o Studio fecha, instala o que mudou e abre de novo:
  // espera ele voltar com a versão nova e recarrega a página.
  useEffect(() => {
    if (!reiniciando) return;
    let caiu = false;
    const intervalo = setInterval(async () => {
      try {
        await get("/api/versao");
        if (caiu) window.location.reload();
      } catch {
        caiu = true;
      }
    }, 2000);
    return () => clearInterval(intervalo);
  }, [reiniciando]);

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

  const iniciar = async (ferramenta: string, opcoes: Record<string, unknown> = {}, projeto = atual) => {
    if (!projeto) return;
    try {
      const { id } = await enviar<{ id: string }>("POST", "/api/tarefas", { ferramenta, projeto, opcoes: { ia, ...opcoes } });
      acompanhar(id, ferramenta, ferramenta, projeto);
    } catch (e) {
      avisar((e as Error).message, "erro");
    }
  };
  iniciarRef.current = iniciar;

  // Edição automática de um vídeo novo. Sem chave do Claude, pede a chave antes
  // (ou deixa seguir no modo simples, sem IA).
  const editarAutomatico = (projeto: string) => {
    if (!temChave) {
      esperandoChave.current = projeto;
      setModal("chave");
      return;
    }
    iniciar("automatico", {}, projeto);
  };
  editarAutomaticoRef.current = editarAutomatico;

  const cancelar = (id: string) => enviar("POST", `/api/tarefas/${id}/cancelar`).catch(() => {});

  // Exportação em andamento: o botão mostra o andamento e só reabre a janela (não começa outra).
  const exportando = exportacao && tarefas[exportacao]?.status === "rodando" ? tarefas[exportacao] : null;
  const pctExportacao = Math.round((exportando?.progresso ?? 0) * 100);

  const exportar = async () => {
    if (!props || !atual) return;
    if (exportando) {
      setModal("exportar");
      return;
    }
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
      avisar("Vídeo adicionado! A IA está editando: legenda, cortes, destaques, zooms e título. Depois é só ajustar o que quiser.");
      editarAutomatico(caminho);
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
        <button
          className={`botao primario ${exportando ? "exportando" : ""}`}
          onClick={exportar}
          disabled={!exportando && (!props || !duracao)}
          title={exportando ? "Ver o andamento da exportação" : ""}
          style={exportando ? ({ "--pct": `${pctExportacao}%` } as React.CSSProperties) : undefined}
        >
          {exportando ? (pctExportacao > 0 ? `Exportando... ${pctExportacao}%` : "Exportando... preparando") : "Exportar vídeo"}
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
            {temChave === false ? (
              <button className="faixa-chave" onClick={() => setModal("chave")}>
                ⚠ A IA do Claude ainda não está funcionando. <b>Clique aqui para resolver.</b>
              </button>
            ) : null}
            {props && atual ? (
              <PecaIa
                projeto={atual}
                props={props}
                ia={ia}
                mudar={mudar}
                avisar={avisar}
                aoTrocarLegenda={() => {
                  window.dispatchEvent(new Event("legenda-mudou"));
                  const legenda = props.captions;
                  mudar({ captions: "" });
                  setTimeout(() => mudar({ captions: legenda }), 50);
                }}
              />
            ) : null}
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

      {reiniciando ? (
        <div className="modal-fundo">
          <div className="modal">
            <h2>Atualizando o Studio...</h2>
            <p className="dica">Baixei a versão nova. Agora o Studio instala o que mudou e reabre sozinho; esta página recarrega quando ele voltar (normalmente menos de 1 minuto).</p>
            <div className="barra grande"><i className="indeterminada" /></div>
          </div>
        </div>
      ) : null}

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
          aoAtualizar={(id) => acompanhar(id, "Atualizar o Studio", "atualizar", null)}
          aoMudarChave={setTemChave}
          tarefaAtualizar={Object.values(tarefas).filter((t) => t.tipo === "atualizar").pop()}
        />
      ) : null}
      {modal === "chave" ? (
        <ModalChave
          fechar={() => {
            esperandoChave.current = null;
            setModal(null);
          }}
          aoSalvar={() => {
            setTemChave(true);
            setIa("claude");
            setModal(null);
            avisar("Chave salva! A IA do Claude está ligada.");
            const projeto = esperandoChave.current;
            esperandoChave.current = null;
            if (projeto) iniciar("automatico", { ia: "claude" }, projeto);
          }}
          semIa={() => {
            setIa("dicionario");
            setModal(null);
            const projeto = esperandoChave.current;
            esperandoChave.current = null;
            if (projeto) iniciar("automatico", { ia: "dicionario" }, projeto);
          }}
        />
      ) : null}
      {modal === "exportar" && exportacao && tarefas[exportacao] ? (
        <ModalExportar tarefa={tarefas[exportacao]} fechar={() => setModal(null)} cancelar={() => cancelar(exportacao)} />
      ) : null}
      {clipes ? <ModalClipes clipes={clipes} fechar={() => setClipes(null)} abrir={(id) => { setClipes(null); abrirProjeto(id); }} /> : null}
    </div>
  );
};
