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

export const ModalConfig: React.FC<{
  fechar: () => void;
  ia: Ia;
  setIa: (v: Ia) => void;
  aoLogin: (id: string) => void;
  tarefaLogin?: Tarefa;
}> = ({ fechar, ia, setIa, aoLogin, tarefaLogin }) => {
  const [claude, setClaude] = useState<{ instalado: boolean; texto: string } | null>(null);
  const [temPexels, setTemPexels] = useState(false);
  const [chave, setChave] = useState("");
  const [salvo, setSalvo] = useState(false);

  const atualizar = () => {
    get<{ instalado: boolean; texto: string }>("/api/claude").then(setClaude).catch(() => {});
    get<{ temPexels: boolean }>("/api/config").then((c) => setTemPexels(c.temPexels)).catch(() => {});
  };
  useEffect(atualizar, []);
  useEffect(() => {
    if (tarefaLogin && tarefaLogin.status !== "rodando") atualizar();
  }, [tarefaLogin?.status]);

  return (
    <Modal titulo="Configurações" fechar={fechar} largo>
      <section className="secao">
        <header><h3>Inteligência artificial</h3></header>
        <p className="dica">Usada em legendas com emojis, B-roll automático, clipes e dublagem.</p>
        <select value={ia} onChange={(e) => setIa(e.target.value as Ia)}>
          <option value="claude">Claude (melhor resultado; usa sua conta)</option>
          <option value="ollama">Ollama (IA local e grátis; precisa instalar o Ollama)</option>
          <option value="dicionario">Sem IA (grátis, resultados simples)</option>
        </select>
      </section>

      <section className="secao">
        <header>
          <h3>Conta do Claude</h3>
          <button
            className="botao primario pequeno"
            disabled={tarefaLogin?.status === "rodando"}
            onClick={async () => {
              const { id } = await enviar<{ id: string }>("POST", "/api/claude/login");
              aoLogin(id);
            }}
          >
            {tarefaLogin?.status === "rodando" ? "Aguardando o navegador..." : "Entrar no Claude"}
          </button>
        </header>
        <p className="dica">O login abre no navegador. Depois de entrar, volte para cá.</p>
        <pre className="log">{claude ? claude.texto || "(sem resposta)" : "Verificando..."}</pre>
        {tarefaLogin && tarefaLogin.linhas.length ? <pre className="log">{tarefaLogin.linhas.slice(-8).join("\n")}</pre> : null}
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
          <p className="dica">{pct}% · pode continuar usando o computador; não feche a janela preta do Studio.</p>
          <footer>
            <button className="botao fantasma" onClick={cancelar}>Cancelar exportação</button>
            <button className="botao secundario" onClick={fechar}>Continuar editando</button>
          </footer>
        </>
      ) : tarefa.status === "ok" && tarefa.resultado?.arquivo ? (
        <>
          <p className="ok-texto grande">✓ Vídeo pronto!</p>
          <video className="video-pronto" src={tarefa.resultado.arquivo} controls />
          <p className="dica">Também fica salvo na pasta <b>editor\out</b> como <b>{tarefa.resultado.nome}</b>.</p>
          <footer>
            <button className="botao fantasma" onClick={fechar}>Fechar</button>
            <a className="botao primario" href={tarefa.resultado.arquivo} download={tarefa.resultado.nome}>
              Baixar vídeo
            </a>
          </footer>
        </>
      ) : (
        <>
          <p className="erro">{tarefa.status === "cancelado" ? "Exportação cancelada." : "Não deu para exportar. Detalhes:"}</p>
          {tarefa.status !== "cancelado" ? <pre className="log">{tarefa.linhas.slice(-15).join("\n")}</pre> : null}
          <footer>
            <button className="botao secundario" onClick={fechar}>Fechar</button>
          </footer>
        </>
      )}
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
