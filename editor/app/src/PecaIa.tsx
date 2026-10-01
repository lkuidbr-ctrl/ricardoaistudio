// "Peça para a IA": o usuário escreve o que quer mudar e a IA ajusta o vídeo.
import React, { useRef, useState } from "react";
import { shortVideoSchema, type ShortVideoProps } from "../../src/schema";
import { enviar } from "./api";
import type { Ia } from "./Ferramentas";

// Só estes ajustes podem vir da IA; cada um é conferido com o mesmo formato do editor.
const PERMITIDOS = {
  captionStyle: true, captionColor: true, highlightColor: true, captionY: true, wordsWindowMs: true, emojis: true, emojiAnimado: true,
  keywords: true, zooms: true, cutTransition: true, hookText: true, hookDurationMs: true, behindTexts: true,
  musicVolume: true, duckTo: true, sfx: true, sfxVolume: true, cor: true, animacoes: true, cartelas: true, efeitosTela: true,
} as const;
const esquema = shortVideoSchema.pick(PERMITIDOS).partial();

// Fica só com o que é válido (um ajuste errado da IA não estraga os outros).
export const validarMudancas = (mudancas: Record<string, unknown>): Partial<ShortVideoProps> => {
  const validas: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(mudancas)) {
    if (!(chave in PERMITIDOS)) continue;
    const r = esquema.safeParse({ [chave]: valor });
    if (r.success) validas[chave] = (r.data as Record<string, unknown>)[chave];
  }
  return validas as Partial<ShortVideoProps>;
};

const EXEMPLOS = ["deixa a legenda amarela", "tira o zoom do começo", "título: 3 erros que te deixam pobre", "troca 'Ricado' por 'Ricardo'"];

export const PecaIa: React.FC<{
  projeto: string;
  props: ShortVideoProps;
  ia: Ia;
  mudar: (p: Partial<ShortVideoProps>) => void;
  aoTrocarLegenda: () => void;
  avisar: (texto: string, tipo?: "ok" | "erro" | "alerta") => void;
}> = ({ projeto, props, ia, mudar, aoTrocarLegenda, avisar }) => {
  const [pedido, setPedido] = useState("");
  const [pensando, setPensando] = useState(false);
  const [resposta, setResposta] = useState("");
  const anterior = useRef<Partial<ShortVideoProps> | null>(null);

  const pedir = async () => {
    if (!pedido.trim() || pensando) return;
    setPensando(true);
    setResposta("");
    try {
      const r = await enviar<{ resposta: string; mudancas: Record<string, unknown>; trocas: number }>("POST", "/api/pedido", {
        projeto,
        pedido,
        props,
        ia,
      });
      const mudancas = validarMudancas(r.mudancas);
      const chaves = Object.keys(mudancas) as (keyof ShortVideoProps)[];
      if (chaves.length) {
        // Guarda como estava, para o botão Desfazer.
        anterior.current = Object.fromEntries(chaves.map((k) => [k, props[k]])) as Partial<ShortVideoProps>;
        mudar(mudancas);
      }
      if (r.trocas) aoTrocarLegenda();
      const partes = [r.resposta];
      if (r.trocas) partes.push(`(${r.trocas} ${r.trocas === 1 ? "troca" : "trocas"} na legenda)`);
      if (!chaves.length && !r.trocas) partes.push("Nada foi mudado.");
      setResposta(partes.join(" "));
      setPedido("");
    } catch (e) {
      avisar(`Peça para a IA: ${(e as Error).message}`, "erro");
    } finally {
      setPensando(false);
    }
  };

  return (
    <div className="cartao peca-ia">
      <div className="cartao-topo">
        <span className="icone">💬</span>
        <div className="cartao-titulo">
          <b>Peça para a IA</b>
          <small>Escreva o que quer mudar no vídeo.</small>
        </div>
      </div>
      <textarea
        rows={2}
        placeholder={`Ex.: ${EXEMPLOS[Math.floor(Date.now() / 60000) % EXEMPLOS.length]}`}
        value={pedido}
        disabled={pensando}
        onChange={(e) => setPedido(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            pedir();
          }
        }}
      />
      <div className="linha-form">
        <button className="botao primario largo" disabled={!pedido.trim() || pensando} onClick={pedir}>
          {pensando ? "A IA está mexendo..." : "Fazer"}
        </button>
        {anterior.current && !pensando ? (
          <button
            className="botao secundario"
            title="Volta os ajustes como estavam antes do último pedido"
            onClick={() => {
              if (anterior.current) mudar(anterior.current);
              anterior.current = null;
              setResposta("Desfeito.");
            }}
          >
            Desfazer
          </button>
        ) : null}
      </div>
      {resposta ? <p className="dica">{resposta}</p> : null}
    </div>
  );
};
