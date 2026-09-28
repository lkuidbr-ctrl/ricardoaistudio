import React, { useEffect, useState } from "react";
import { enviar, formatarTempo, get, type Tarefa } from "./api";
import { EnviarArquivo } from "./campos";
import type { Ia } from "./Ferramentas";

const Modal: React.FC<{ titulo: string; fechar: () => void; children: React.ReactNode; largo?: boolean }> = ({
  titulo,
  fechar,
  children,
  largo,
}) => {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fechar]);
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className={`modal ${largo ? "largo" : ""}`} role="dialog" aria-label={titulo}>
        <header>
          <h2>{titulo}</h2>
          <button className="fechar" onClick={fechar} aria-label="Fechar">
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
};

export const ModalNarrar: React.FC<{ fechar: () => void; aoIniciar: (id: string) => void; tarefas: Tarefa[] }> = ({
  fechar,
  aoIniciar,
  tarefas,
}) => {
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [velocidade, setVelocidade] = useState(1.05);
  const [fundo, setFundo] = useState("");
  const [erro, setErro] = useState("");
  const rodando = tarefas.some((t) => t.status === "rodando");
  const palavras = texto.trim() ? texto.trim().split(/\s+/).length : 0;

  return (
    <Modal titulo="Criar vídeo a partir de um roteiro" fechar={fechar} largo>
      <p className="dica">Uma voz de IA (grátis, no seu computador) lê o texto e o vídeo já sai com legendas. Deixe uma linha em branco entre parágrafos para ter pausas maiores.</p>
      <label className="linha">
        <span className="rotulo">Nome do vídeo</span>
        <input type="text" value={titulo} placeholder="Ex.: dica-assinaturas" onChange={(e) => setTitulo(e.target.value)} />
      </label>
      <label className="linha">
        <span className="rotulo">
          Roteiro <b>{palavras} palavras · ~{Math.round(palavras / 2.6)}s</b>
        </span>
        <textarea
          rows={10}
          value={texto}
          placeholder={"Você está perdendo dinheiro todo mês e nem percebe.\n\nA maioria das pessoas gasta com assinaturas que nem usa..."}
          onChange={(e) => setTexto(e.target.value)}
        />
      </label>
      <label className="linha">
        <span className="rotulo">
          Velocidade da voz <b>{velocidade.toFixed(2)}x</b>
        </span>
        <input type="range" min={0.8} max={1.4} step={0.05} value={velocidade} onChange={(e) => setVelocidade(Number(e.target.value))} />
      </label>
      <div className="linha-form">
        <span className="rotulo">Fundo:</span>
        <span className="dica">{fundo ? fundo.split("/").pop() : "gradiente animado"}</span>
        <EnviarArquivo rotulo="Usar imagem ou vídeo" aceitar="image/*,video/*" aoEnviar={setFundo} />
        {fundo ? <button className="botao pequeno fantasma" onClick={() => setFundo("")}>Tirar</button> : null}
      </div>
      {erro ? <p className="erro">{erro}</p> : null}
      <footer>
        <button className="botao fantasma" onClick={fechar}>Cancelar</button>
        <button
          className="botao primario"
          disabled={!texto.trim() || rodando}
          onClick={async () => {
            setErro("");
            try {
              const { id } = await enviar<{ id: string }>("POST", "/api/narrar", {
                titulo: titulo || "roteiro",
                texto,
                velocidade,
                fundo,
              });
              aoIniciar(id);
            } catch (e) {
              setErro((e as Error).message);
            }
          }}
        >
          {rodando ? "Narrando outro roteiro..." : "Criar vídeo"}
        </button>
      </footer>
    </Modal>
  );
};

// Pede a chave do Claude antes da IA editar (aparece quando a chave falta ou não funcionou).
// Chave já salva não precisa ser colada de novo: só testar (e, se pedir, o ID do workspace).
export const ModalChave: React.FC<{ fechar: () => void; aoSalvar: () => void; semIa: () => void }> = ({ fechar, aoSalvar, semIa }) => {
  const [salva, setSalva] = useState<{ temClaude: boolean; claudeFinal: string } | null>(null);
  const [chave, setChave] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [pedeWorkspace, setPedeWorkspace] = useState(false);
  const [estado, setEstado] = useState<"" | "testando" | string>("");
  useEffect(() => {
    get<{ temClaude: boolean; claudeFinal: string }>("/api/config").then(setSalva).catch(() => {});
  }, []);

  const testar = async () => {
    setEstado("testando");
    try {
      if (chave.trim()) await enviar("PUT", "/api/config", { claudeKey: chave });
      if (workspace.trim()) await enviar("PUT", "/api/config", { claudeWorkspace: workspace });
      const r = await enviar<{ ok: boolean; motivo?: string; pedeWorkspace?: boolean }>("POST", "/api/claude/testar");
      if (r.ok) return aoSalvar();
      setPedeWorkspace(Boolean(r.pedeWorkspace));
      setEstado(r.motivo || "A chave não funcionou.");
      get<{ temClaude: boolean; claudeFinal: string }>("/api/config").then(setSalva).catch(() => {});
    } catch (e) {
      setEstado((e as Error).message);
    }
  };
  const podeTestar = Boolean(chave.trim() || salva?.temClaude) && estado !== "testando";

  return (
    <Modal titulo="Chave do Claude" fechar={fechar}>
      <p className="dica">
        Para a IA editar seus vídeos sozinha (legenda, destaques, zooms, título e B-roll), o Studio precisa da sua chave da API do
        Claude. Ela fica guardada no seu computador: não precisa colar de novo.
      </p>
      {salva?.temClaude ? (
        <p className="ok-texto">✓ Sua chave já está salva (termina em ...{salva.claudeFinal}). Só cole outra se quiser trocar.</p>
      ) : (
        <p className="dica">
          Crie em{" "}
          <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">
            platform.claude.com → API Keys
          </a>{" "}
          (começa com <b>sk-ant-api</b>). Ela usa os créditos da API, não a assinatura.
        </p>
      )}
      <div className="linha-form">
        <input
          type="password"
          placeholder={salva?.temClaude ? "(opcional) colar outra chave" : "sk-ant-api03-..."}
          value={chave}
          autoFocus={!salva?.temClaude}
          onChange={(e) => {
            setChave(e.target.value);
            setEstado("");
          }}
        />
        <button className="botao primario" disabled={!podeTestar} onClick={testar}>
          {estado === "testando" ? "Testando..." : salva?.temClaude && !chave.trim() ? "Testar e continuar" : "Salvar e continuar"}
        </button>
      </div>
      {pedeWorkspace ? (
        <div className="linha-form">
          <input
            type="text"
            placeholder="ID do workspace: wrkspc_..."
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
          />
        </div>
      ) : null}
      {estado && estado !== "testando" ? <p className="alerta">{estado}</p> : null}
      <footer>
        <button className="link" onClick={semIa}>
          Agora não: editar no modo simples, sem IA
        </button>
      </footer>
    </Modal>
  );
};

export const ModalConfig: React.FC<{
  fechar: () => void;
  ia: Ia;
  setIa: (v: Ia) => void;
  aoLogin: (id: string) => void;
  tarefaLogin?: Tarefa;
  aoAtualizar: (id: string) => void;
  tarefaAtualizar?: Tarefa;
  aoMudarChave: (tem: boolean) => void;
}> = ({ fechar, ia, setIa, aoLogin, tarefaLogin, aoAtualizar, tarefaAtualizar, aoMudarChave }) => {
  const [versao, setVersao] = useState<{ versao: string | null; git: boolean } | null>(null);
  const [erroAtualizar, setErroAtualizar] = useState("");
  useEffect(() => {
    get<{ versao: string | null; git: boolean }>("/api/versao").then(setVersao).catch(() => {});
  }, [tarefaAtualizar?.status]);
  const [claude, setClaude] = useState<{ instalado: boolean; texto: string } | null>(null);
  const [cfg, setCfg] = useState<{
    temPexels: boolean;
    temClaude: boolean;
    claudeFinal: string;
    claudeModelo: string;
    claudeWorkspace: string;
  } | null>(null);
  const [chave, setChave] = useState("");
  const [salvo, setSalvo] = useState(false);
  const [chaveClaude, setChaveClaude] = useState("");
  const [teste, setTeste] = useState<{ ok: boolean; motivo?: string; aviso?: string; pedeWorkspace?: boolean } | "testando" | null>(null);
  const [workspace, setWorkspace] = useState("");
  const temPexels = Boolean(cfg?.temPexels);

  const atualizar = () => {
    get<{ instalado: boolean; texto: string }>("/api/claude").then(setClaude).catch(() => {});
    get<typeof cfg>("/api/config").then(setCfg).catch(() => {});
  };
  const testar = async () => {
    setTeste("testando");
    try {
      const r = await enviar<{ ok: boolean; motivo?: string; aviso?: string; pedeWorkspace?: boolean }>("POST", "/api/claude/testar");
      setTeste(r);
      aoMudarChave(r.ok);
      atualizar();
    } catch (e) {
      setTeste({ ok: false, motivo: (e as Error).message });
    }
  };
  useEffect(atualizar, []);
  useEffect(() => {
    if (tarefaLogin && tarefaLogin.status !== "rodando") atualizar();
  }, [tarefaLogin?.status]);

  return (
    <Modal titulo="Configurações" fechar={fechar} largo>
      <section className="secao">
        <header>
          <h3>Atualizações</h3>
          <button
            className="botao primario pequeno"
            disabled={tarefaAtualizar?.status === "rodando" || versao?.git === false}
            onClick={async () => {
              setErroAtualizar("");
              try {
                const { id } = await enviar<{ id: string }>("POST", "/api/atualizar");
                aoAtualizar(id);
              } catch (e) {
                setErroAtualizar((e as Error).message);
              }
            }}
          >
            {tarefaAtualizar?.status === "rodando" ? "Buscando..." : "Buscar atualização"}
          </button>
        </header>
        <p className="dica">
          Baixa só o que mudou e reinicia o Studio sozinho. Na primeira vez, o GitHub pode pedir para você entrar na sua conta
          (o projeto é privado).
          {versao?.versao ? <> Versão atual: <b>{versao.versao}</b>.</> : null}
        </p>
        {versao?.git === false ? <p className="alerta">Falta o Git. Rode o instalar-windows.bat uma vez para ativar as atualizações.</p> : null}
        {erroAtualizar ? <p className="erro">{erroAtualizar}</p> : null}
        {tarefaAtualizar?.status === "ok" && !tarefaAtualizar.resultado?.atualizado ? <p className="ok-texto">Você já tem a versão mais nova.</p> : null}
        {tarefaAtualizar?.status === "erro" ? (
          <>
            {tarefaAtualizar.dica ? <p className="alerta">{tarefaAtualizar.dica}</p> : null}
            <pre className="log">{tarefaAtualizar.linhas.slice(-8).join("\n")}</pre>
          </>
        ) : null}
      </section>

      <section className="secao">
        <header><h3>Inteligência artificial</h3></header>
        <p className="dica">Usada em legendas com emojis, B-roll automático, clipes e dublagem.</p>
        <select value={ia} onChange={(e) => setIa(e.target.value as Ia)}>
          <option value="claude">Claude (melhor resultado; usa créditos da API, pagos à parte)</option>
          <option value="ollama">Ollama (IA local e grátis; precisa instalar o Ollama)</option>
          <option value="dicionario">Sem IA (grátis, resultados simples)</option>
        </select>
      </section>

      <section className="secao">
        <header>
          <h3>Claude (chave da API)</h3>
          {cfg?.temClaude ? <span className="selo ok">✓ chave ...{cfg.claudeFinal}</span> : null}
        </header>
        <p className="dica">
          Crie uma chave em{" "}
          <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">platform.claude.com → API Keys</a> e cole
          aqui. A API tem créditos próprios (a assinatura Pro/Max não vale aqui): adicione em{" "}
          <a href="https://platform.claude.com/settings/billing" target="_blank" rel="noreferrer">Billing</a>. US$ 5 rendem centenas de
          vídeos. A chave fica salva só no seu computador.
        </p>
        <div className="linha-form">
          <input
            type="password"
            placeholder={cfg?.temClaude ? `•••••••• (já salva, termina em ${cfg.claudeFinal})` : "sk-ant-..."}
            value={chaveClaude}
            onChange={(e) => {
              setChaveClaude(e.target.value);
              setTeste(null);
            }}
          />
          <button
            className="botao primario"
            disabled={!chaveClaude.trim()}
            onClick={async () => {
              await enviar("PUT", "/api/config", { claudeKey: chaveClaude });
              setChaveClaude("");
              atualizar();
              testar();
              // Colou a chave: a IA passa a ser o Claude.
              setIa("claude");
            }}
          >
            Salvar e testar
          </button>
        </div>
        <div className="linha-form">
          <button className="botao secundario pequeno" disabled={teste === "testando"} onClick={testar}>
            {teste === "testando" ? "Testando..." : "Testar conexão"}
          </button>
          {cfg?.temClaude ? (
            <button
              className="botao fantasma pequeno"
              onClick={async () => {
                await enviar("PUT", "/api/config", { claudeKey: "" });
                setTeste(null);
                atualizar();
                aoMudarChave(false);
              }}
            >
              Remover chave
            </button>
          ) : null}
        </div>
        {teste && teste !== "testando" ? (
          teste.ok ? (
            <p className="ok-texto">✓ Claude funcionando{teste.aviso ? ` (${teste.aviso})` : ""}.</p>
          ) : (
            <p className="alerta">{teste.motivo}</p>
          )
        ) : null}
        {(teste && teste !== "testando" && teste.pedeWorkspace) || cfg?.claudeWorkspace ? (
          <div className="linha-form">
            <input
              type="text"
              placeholder={cfg?.claudeWorkspace ? `Workspace: ${cfg.claudeWorkspace}` : "ID do workspace: wrkspc_..."}
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
            />
            <button
              className="botao secundario"
              disabled={!workspace.trim()}
              onClick={async () => {
                await enviar("PUT", "/api/config", { claudeWorkspace: workspace });
                setWorkspace("");
                testar();
              }}
            >
              Salvar e testar
            </button>
          </div>
        ) : null}
        <label className="linha" style={{ marginTop: 12 }}>
          <span className="rotulo">Modelo</span>
          <select
            value={cfg?.claudeModelo ?? "claude-opus-5"}
            onChange={async (e) => {
              await enviar("PUT", "/api/config", { claudeModelo: e.target.value });
              atualizar();
            }}
          >
            <option value="claude-opus-5">Opus 5 (melhor resultado; alguns centavos de dólar por vídeo)</option>
            <option value="claude-sonnet-5">Sonnet 5 (equilibrado; menos da metade do custo)</option>
            <option value="claude-haiku-4-5">Haiku 4.5 (mais barato; cerca de 1/5 do custo)</option>
          </select>
        </label>
      </section>


      <section className="secao">
        <header><h3>Pexels (B-roll automático)</h3>{temPexels ? <span className="selo ok">✓ configurado</span> : null}</header>
        <p className="dica">
          Crie uma chave grátis em <a href="https://www.pexels.com/api/" target="_blank" rel="noreferrer">pexels.com/api</a> e cole aqui.
        </p>
        <div className="linha-form">
          <input type="password" placeholder={temPexels ? "•••••••• (já salva)" : "Cole a chave aqui"} value={chave} onChange={(e) => { setChave(e.target.value); setSalvo(false); }} />
          <button
            className="botao secundario"
            disabled={!chave.trim()}
            onClick={async () => {
              await enviar("PUT", "/api/config", { pexelsKey: chave });
              setChave("");
              setSalvo(true);
              atualizar();
            }}
          >
            Salvar
          </button>
        </div>
        {salvo ? <p className="ok-texto">Chave salva.</p> : null}
      </section>
    </Modal>
  );
};

// As mensagens de erro de verdade (ex.: "Error: ...") costumam vir antes da pilha de chamadas;
// mostra essas primeiro, e depois o fim do log.
const linhasDeErro = (linhas: string[]) => {
  const erros = linhas.filter((l) => /error|erro|failed|falhou|could not/i.test(l) && !/^\s*at /.test(l));
  const unicos = [...new Set(erros)].slice(-8);
  return unicos.length ? [...unicos, "...", ...linhas.slice(-5)] : linhas.slice(-15);
};

export const ModalExportar: React.FC<{ tarefa: Tarefa; fechar: () => void; cancelar: () => void }> = ({ tarefa, fechar, cancelar }) => {
  const pct = Math.round((tarefa.progresso ?? 0) * 100);
  return (
    <Modal titulo="Exportar vídeo" fechar={fechar}>
      {tarefa.status === "rodando" ? (
        <>
          <p>{pct === 0 ? "Preparando..." : pct < 85 ? "Montando os quadros do vídeo..." : "Finalizando o arquivo..."}</p>
          <div className="barra grande">
            <i className={pct === 0 ? "indeterminada" : ""} style={{ width: `${Math.max(pct, 3)}%` }} />
          </div>
          <p className="dica">
            {pct}% · pode continuar editando. O botão <b>Exportando...</b>, lá em cima, mostra o andamento; quando terminar, esta janela
            abre sozinha e o vídeo vai para a pasta <b>Downloads</b>.
          </p>
          <footer>
            <button className="botao fantasma" onClick={cancelar}>Cancelar exportação</button>
            <button className="botao secundario" onClick={fechar}>Continuar editando</button>
          </footer>
        </>
      ) : tarefa.status === "ok" && tarefa.resultado?.arquivo ? (
        <>
          <p className="ok-texto grande">✓ Vídeo pronto!</p>
          <video className="video-pronto" src={tarefa.resultado.arquivo} controls />
          <p className="dica">Já foi baixado para a pasta <b>Downloads</b> e também fica salvo em <b>editor\out</b> como <b>{tarefa.resultado.nome}</b>.</p>
          <footer>
            <button className="botao fantasma" onClick={fechar}>Fechar</button>
            <a className="botao primario" href={tarefa.resultado.arquivo} download={tarefa.resultado.nome}>
              Baixar vídeo
            </a>
          </footer>
        </>
      ) : (
        <>
          <p className="erro">{tarefa.status === "cancelado" ? "Exportação cancelada." : "Não deu para exportar."}</p>
          {tarefa.status !== "cancelado" ? (
            <>
              {tarefa.dica ? <p className="alerta">{tarefa.dica}</p> : null}
              <p className="dica">Detalhes (o log completo fica na pasta editor\out, arquivo .log):</p>
              <pre className="log">{linhasDeErro(tarefa.linhas).join("\n")}</pre>
            </>
          ) : null}
          <footer>
            <button className="botao secundario" onClick={fechar}>Fechar</button>
          </footer>
        </>
      )}
    </Modal>
  );
};

// Recortar trecho: marca início e fim num vídeo longo e corta na hora (sem perder qualidade).
export const ModalRecortar: React.FC<{ projeto: string; fonte: string; fechar: () => void; aoIniciar: (id: string) => void }> = ({
  projeto,
  fonte,
  fechar,
  aoIniciar,
}) => {
  const video = React.useRef<HTMLVideoElement>(null);
  const [inicio, setInicio] = useState(0);
  const [fim, setFim] = useState(0);
  const [erro, setErro] = useState("");
  const agora = () => Math.round((video.current?.currentTime ?? 0) * 10) / 10;
  const campo = (rotulo: string, valor: number, set: (v: number) => void) => (
    <label className="linha">
      <span className="rotulo">{rotulo}</span>
      <div className="tempo">
        <input type="number" min={0} step={0.1} value={valor} onChange={(e) => set(Math.max(0, Number(e.target.value)))} />
        <span>s</span>
        <button type="button" className="botao pequeno secundario" onClick={() => set(agora())}>
          ⏱ marcar aqui
        </button>
      </div>
    </label>
  );
  return (
    <Modal titulo="Recortar trecho" fechar={fechar}>
      <p className="dica">
        Para vídeos longos (lives, podcasts): toque o vídeo, marque onde o trecho começa e termina e clique em Recortar. O corte é na
        exato, em alta qualidade; o trecho vira um vídeo novo e a IA já edita ele. O vídeo original continua igual.
      </p>
      <video
        ref={video}
        className="video-pronto"
        style={{ maxHeight: 300 }}
        src={`/${fonte}`}
        controls
        preload="metadata"
        onLoadedMetadata={(e) => fim === 0 && setFim(Math.round(e.currentTarget.duration * 10) / 10)}
      />
      {campo("Começa em", inicio, setInicio)}
      {campo("Termina em", fim, setFim)}
      <p className="dica">Trecho de {Math.max(0, fim - inicio).toFixed(1)} s.</p>
      {erro ? <p className="erro">{erro}</p> : null}
      <footer>
        <button className="botao fantasma" onClick={fechar}>
          Cancelar
        </button>
        <button
          className="botao primario"
          disabled={fim - inicio < 1}
          onClick={async () => {
            try {
              const { id } = await enviar<{ id: string }>("POST", "/api/recortar", { projeto, inicioMs: inicio * 1000, fimMs: fim * 1000 });
              aoIniciar(id);
            } catch (e) {
              setErro((e as Error).message);
            }
          }}
        >
          ✂ Recortar
        </button>
      </footer>
    </Modal>
  );
};

export const ModalClipes: React.FC<{
  clipes: NonNullable<NonNullable<Tarefa["resultado"]>["clipes"]>;
  fechar: () => void;
  abrir: (id: string) => void;
}> = ({ clipes, fechar, abrir }) => (
  <Modal titulo={`${clipes.length} clipes criados`} fechar={fechar} largo>
    <p className="dica">Cada clipe virou um vídeo separado (aparecem em "Clipes" no seletor de vídeos). Abra um para ajustar e exportar.</p>
    <div className="clipes">
      {clipes.map((c) => (
        <div key={c.id} className="clipe">
          <video src={`/${c.id}#t=0.5`} preload="metadata" muted />
          <div>
            <b>{c.titulo}</b>
            <small>
              nota {c.nota} · {formatarTempo(c.inicioMs)} a {formatarTempo(c.fimMs)} da live
            </small>
          </div>
          <button className="botao primario pequeno" onClick={() => abrir(c.id)}>Abrir</button>
        </div>
      ))}
    </div>
  </Modal>
);
