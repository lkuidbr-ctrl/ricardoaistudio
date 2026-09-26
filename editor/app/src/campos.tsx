// Controles de formulário do painel de ajustes.
import React, { useRef, useState } from "react";
import { subirArquivo } from "./api";

export const Secao: React.FC<{ titulo: string; dica?: string; acao?: React.ReactNode; children: React.ReactNode }> = ({
  titulo,
  dica,
  acao,
  children,
}) => (
  <section className="secao">
    <header>
      <h3>{titulo}</h3>
      {acao}
    </header>
    {dica ? <p className="dica">{dica}</p> : null}
    {children}
  </section>
);

// bloco: usa <div> em vez de <label> (necessário quando a linha tem botões, senão o
// label repete o clique e o seletor de arquivos não abre).
export const Linha: React.FC<{ rotulo: string; children: React.ReactNode; valor?: React.ReactNode; bloco?: boolean }> = ({
  rotulo,
  children,
  valor,
  bloco,
}) => {
  const Tag = bloco ? "div" : "label";
  return (
    <Tag className="linha">
      <span className="rotulo">
        {rotulo}
        {valor !== undefined ? <b>{valor}</b> : null}
      </span>
      {children}
    </Tag>
  );
};

export const Deslizante: React.FC<{
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  passo?: number;
  formato?: (v: number) => string;
  aoMudar: (v: number) => void;
}> = ({ rotulo, valor, min, max, passo = 1, formato, aoMudar }) => (
  <Linha rotulo={rotulo} valor={formato ? formato(valor) : valor}>
    <input type="range" min={min} max={max} step={passo} value={valor} onChange={(e) => aoMudar(Number(e.target.value))} />
  </Linha>
);

export const Cor: React.FC<{ rotulo: string; valor: string; aoMudar: (v: string) => void }> = ({ rotulo, valor, aoMudar }) => (
  <label className="cor">
    <input type="color" value={valor} onChange={(e) => aoMudar(e.target.value.toUpperCase())} />
    <span>{rotulo}</span>
  </label>
);

export const Alternar: React.FC<{ rotulo: string; ligado: boolean; aoMudar: (v: boolean) => void; dica?: string }> = ({
  rotulo,
  ligado,
  aoMudar,
  dica,
}) => (
  <label className="alternar">
    <span>
      {rotulo}
      {dica ? <small>{dica}</small> : null}
    </span>
    <input type="checkbox" checked={ligado} onChange={(e) => aoMudar(e.target.checked)} />
    <i aria-hidden />
  </label>
);

export function Escolha<T extends string>({
  rotulo,
  valor,
  opcoes,
  aoMudar,
}: {
  rotulo?: string;
  valor: T;
  opcoes: { valor: T; nome: string }[];
  aoMudar: (v: T) => void;
}) {
  const campo = (
    <select value={valor} onChange={(e) => aoMudar(e.target.value as T)}>
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.nome}
        </option>
      ))}
    </select>
  );
  return rotulo ? <Linha rotulo={rotulo}>{campo}</Linha> : campo;
}

export const Texto: React.FC<{ rotulo?: string; valor: string; aoMudar: (v: string) => void; placeholder?: string }> = ({
  rotulo,
  valor,
  aoMudar,
  placeholder,
}) => {
  const campo = <input type="text" value={valor} placeholder={placeholder} onChange={(e) => aoMudar(e.target.value)} />;
  return rotulo ? <Linha rotulo={rotulo}>{campo}</Linha> : campo;
};

// Botão que envia um arquivo e devolve o caminho dentro de public/.
export const EnviarArquivo: React.FC<{
  rotulo: string;
  aceitar: string;
  aoEnviar: (caminho: string) => void;
  classe?: string;
}> = ({ rotulo, aceitar, aoEnviar, classe = "botao secundario" }) => {
  const ref = useRef<HTMLInputElement>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [erro, setErro] = useState("");
  return (
    <>
      <button type="button" className={classe} disabled={progresso !== null} onClick={() => ref.current?.click()}>
        {progresso !== null ? `Enviando ${Math.round(progresso * 100)}%` : rotulo}
      </button>
      {erro ? <span className="erro-pequeno">{erro}</span> : null}
      <input
        ref={ref}
        type="file"
        accept={aceitar}
        hidden
        onChange={async (e) => {
          const arquivo = e.target.files?.[0];
          e.target.value = "";
          if (!arquivo) return;
          setErro("");
          setProgresso(0);
          try {
            aoEnviar(await subirArquivo(arquivo, "arquivo", setProgresso));
          } catch (err) {
            setErro((err as Error).message);
          } finally {
            setProgresso(null);
          }
        }}
      />
    </>
  );
};
