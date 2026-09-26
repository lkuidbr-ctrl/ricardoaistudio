// Conversa com o server.mjs.

export type Projeto = { id: string; nome: string; pasta: string; tamanho: number; modificado: number };
export type Arquivos = { captions: boolean; cuts: boolean; person: boolean; brollFile: boolean; emojis: boolean };
export type Tarefa = {
  id: string;
  tipo: string;
  rotulo: string;
  projeto: string | null;
  status: "rodando" | "ok" | "erro" | "cancelado";
  progresso: number | null;
  resultado: null | {
    novoProjeto?: string;
    arquivo?: string;
    nome?: string;
    clipes?: { id: string; titulo: string; nota: number; inicioMs: number; fimMs: number }[];
  };
  linhas: string[];
};

const tratar = async (r: Response) => {
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || `Erro ${r.status}`);
  return dados;
};

export const get = <T,>(url: string): Promise<T> => fetch(url).then(tratar);
export const enviar = <T,>(metodo: "POST" | "PUT" | "DELETE", url: string, corpo?: unknown): Promise<T> =>
  fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }).then(tratar);

// Upload com progresso (0 a 1). tipo "video" vira projeto; "arquivo" vai para public/uploads.
export const subirArquivo = (arquivo: File, tipo: "video" | "arquivo", aoProgredir?: (p: number) => void) =>
  subir(arquivo, tipo, aoProgredir).then((r) => r.caminho);

// Para vídeos, o servidor pode devolver uma tarefa de conversão (ex.: vídeo de iPhone em HEVC).
export const subir = (arquivo: File, tipo: "video" | "arquivo", aoProgredir?: (p: number) => void) =>
  new Promise<{ caminho: string; tarefa?: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("arquivo", arquivo);
    xhr.open("POST", `/api/upload?tipo=${tipo}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && aoProgredir?.(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const dados = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) reject(new Error(dados.erro || "Falha no envio"));
        else resolve(dados);
      } catch {
        reject(new Error("Falha no envio"));
      }
    };
    xhr.onerror = () => reject(new Error("Falha no envio"));
    xhr.send(form);
  });

export const formatarTempo = (ms: number) => {
  const s = Math.max(0, ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};
