// Coluna esquerda: as ferramentas de IA, com botão, progresso e detalhes.
import React, { useState } from "react";
import type { Arquivos, Tarefa } from "./api";

export type Ia = "claude" | "ollama" | "dicionario";

type Ferramenta = {
  id: string;
  icone: string;
  titulo: string;
  descricao: string;
  feito?: boolean;
  precisaLegenda?: boolean;
  opcoes?: React.ReactNode;
  valores?: () => Record<string, unknown>;
  aviso?: string;
};

const Cartao: React.FC<{
  f: Ferramenta;
  tarefa?: Tarefa;
  bloqueado: boolean;
  iniciar: () => void;
  cancelar: (id: string) => void;
}> = ({ f, tarefa, bloqueado, iniciar, cancelar }) => {
  const [detalhes, setDetalhes] = useState(false);
  const rodando = tarefa?.status === "rodando";
  const erro = tarefa?.status === "erro";
  const estado = rodando ? "rodando" : erro ? "erro" : f.feito || tarefa?.status === "ok" ? "feito" : "";

  return (
    <div className={`cartao ${estado}`}>
      <div className="cartao-topo">
        <span className="icone">{f.icone}</span>
        <div className="cartao-titulo">
          <b>{f.titulo}</b>
          <small>{f.descricao}</small>
        </div>
        {estado === "feito" ? <span className="selo ok">✓ feito</span> : null}
        {estado === "erro" ? <span className="selo erro">erro</span> : null}
      </div>

      {f.opcoes && !rodando ? <div className="cartao-opcoes">{f.opcoes}</div> : null}
      {f.aviso ? <p className="cartao-aviso">{f.aviso}</p> : null}
      {erro && tarefa?.dica ? <p className="alerta">{tarefa.dica}</p> : null}
      {tarefa?.status === "ok" && tarefa.aviso ? <p className="alerta">{tarefa.aviso}</p> : null}

      {rodando ? (
        <div className="cartao-rodando">
          <div className="barra">
            <i className={tarefa?.progresso == null ? "indeterminada" : ""} style={{ width: `${(tarefa?.progresso ?? 0.3) * 100}%` }} />
          </div>
          <div className="ultima-linha">{tarefa?.linhas[tarefa.linhas.length - 1] ?? "Começando..."}</div>
          <button className="botao pequeno fantasma" onClick={() => tarefa && cancelar(tarefa.id)}>
            Cancelar
          </button>
        </div>
      ) : (
        <button
          className={`botao ${estado === "feito" ? "secundario" : "primario"} largo`}
          disabled={bloqueado}
          title={bloqueado ? "Gere as legendas primeiro" : ""}
          onClick={iniciar}
        >
          {bloqueado ? "Gere as legendas primeiro" : estado === "feito" ? "Refazer" : "Rodar"}
        </button>
      )}

      {tarefa && tarefa.linhas.length > 0 ? (
        <>
          <button className="link pequeno" onClick={() => setDetalhes((v) => !v)}>
            {detalhes ? "Esconder detalhes" : "Ver detalhes"}
          </button>
          {detalhes || erro ? (
            <pre className="log">{(detalhes ? tarefa.linhas : tarefa.linhas.slice(-6)).join("\n")}</pre>
          ) : null}
        </>
      ) : null}
    </div>
  );
};

export const Ferramentas: React.FC<{
  arquivos: Arquivos;
  tarefas: Tarefa[];
  iniciar: (ferramenta: string, opcoes?: Record<string, unknown>) => void;
  cancelar: (id: string) => void;
  ia: Ia;
  setIa: (v: Ia) => void;
}> = ({ arquivos, tarefas, iniciar, cancelar, ia, setIa }) => {
  const [maxSilencio, setMaxSilencio] = useState(350);
  const [quantos, setQuantos] = useState(3);
  const [vertical, setVertical] = useState(false);
  const [idioma, setIdioma] = useState("en");
  const [modelo, setModelo] = useState("small");

  const ultima = (tipo: string) => [...tarefas].reverse().find((t) => t.tipo === tipo);

  const principais: Ferramenta[] = [
    {
      id: "transcrever",
      icone: "💬",
      titulo: "Gerar legendas",
      descricao: "Transcreve sua fala, palavra por palavra.",
      feito: arquivos.captions,
      opcoes: (
        <select value={modelo} onChange={(e) => setModelo(e.target.value)}>
          <option value="small">Precisão normal (rápido)</option>
          <option value="medium">Precisão alta (mais lento, usa ~2 GB de RAM)</option>
        </select>
      ),
      valores: () => ({ modelo }),
    },
    {
      id: "cortar",
      icone: "✂️",
      titulo: "Cortar silêncios",
      descricao: 'Tira pausas e "éé", "hum". O original não é alterado.',
      feito: arquivos.cuts,
      precisaLegenda: true,
      opcoes: (
        <label className="mini">
          Cortar pausas maiores que <b>{(maxSilencio / 1000).toFixed(2)}s</b>
          <input type="range" min={150} max={1000} step={50} value={maxSilencio} onChange={(e) => setMaxSilencio(Number(e.target.value))} />
        </label>
      ),
      valores: () => ({ maxSilencio }),
    },
    {
      id: "emojis",
      icone: "✨",
      titulo: "Emojis e destaques",
      descricao: "A IA escolhe palavras-chave e emojis para a legenda.",
      feito: arquivos.emojis,
      precisaLegenda: true,
    },
    {
      id: "broll",
      icone: "🎞️",
      titulo: "B-roll automático",
      descricao: "Busca vídeos grátis no Pexels para os momentos certos.",
      feito: arquivos.brollFile,
      precisaLegenda: true,
      aviso: "Precisa da chave grátis do Pexels (em Configurações).",
    },
    {
      id: "recortar",
      icone: "🧍",
      titulo: "Recortar a pessoa",
      descricao: "Para o texto atrás de você. Leva alguns minutos.",
      feito: arquivos.person,
    },
  ];

  const derivados: Ferramenta[] = [
    {
      id: "clipes",
      icone: "📚",
      titulo: "Gerar clipes",
      descricao: "Para lives e podcasts: acha os melhores trechos e cria vários shorts.",
      precisaLegenda: true,
      opcoes: (
        <>
          <label className="mini">
            Quantos clipes <b>{quantos}</b>
            <input type="range" min={1} max={10} value={quantos} onChange={(e) => setQuantos(Number(e.target.value))} />
          </label>
          <label className="mini check">
            <input type="checkbox" checked={vertical} onChange={(e) => setVertical(e.target.checked)} /> O vídeo é horizontal
            (converter para 9:16)
          </label>
        </>
      ),
      valores: () => ({ quantos, vertical }),
    },
    {
      id: "reframe",
      icone: "📱",
      titulo: "Converter para vertical",
      descricao: "Vídeo deitado vira 9:16 seguindo seu rosto. Cria um vídeo novo.",
    },
    {
      id: "dublar",
      icone: "🌎",
      titulo: "Dublar",
      descricao: "Traduz e dubla sua fala em outro idioma. Cria um vídeo novo.",
      precisaLegenda: true,
      opcoes: (
        <select value={idioma} onChange={(e) => setIdioma(e.target.value)}>
          <option value="en">Inglês</option>
          <option value="es">Espanhol</option>
          <option value="fr">Francês</option>
          <option value="it">Italiano</option>
          <option value="de">Alemão</option>
        </select>
      ),
      valores: () => ({ idioma }),
    },
  ];

  const cartao = (f: Ferramenta) => (
    <Cartao
      key={f.id}
      f={f}
      tarefa={ultima(f.id)}
      bloqueado={Boolean(f.precisaLegenda && !arquivos.captions)}
      iniciar={() => iniciar(f.id, f.valores?.() ?? {})}
      cancelar={cancelar}
    />
  );

  return (
    <div className="ferramentas">
      <div className="ia-escolha">
        <span>Inteligência</span>
        <select value={ia} onChange={(e) => setIa(e.target.value as Ia)}>
          <option value="claude">Claude (créditos da API)</option>
          <option value="ollama">Ollama (local, grátis)</option>
          <option value="dicionario">Sem IA (grátis)</option>
        </select>
      </div>
      <h2>Passo a passo</h2>
      {principais.map(cartao)}
      <h2>Criar a partir deste vídeo</h2>
      {derivados.map(cartao)}
    </div>
  );
};
