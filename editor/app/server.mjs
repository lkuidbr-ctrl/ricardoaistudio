// Servidor local do Ricardo AI Studio: serve a interface visual e roda as ferramentas
// (scripts Python e renderização do Remotion) no seu computador.
// Inicie com:  npm run app   (ou pelo atalho "Editor de Vídeo" da Área de Trabalho)

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";

const APP = path.dirname(fileURLToPath(import.meta.url));
const EDITOR = path.dirname(APP);
const RAIZ = path.dirname(EDITOR); // pasta do projeto inteiro (onde fica o .git)
const REPO_URL = process.env.STUDIO_REPO || "https://github.com/lkuidbr-ctrl/ricardoaistudio.git";
// Código de saída que avisa o iniciar.ps1: "atualizei, instale o que mudou e me abra de novo".
const SAIR_PARA_ATUALIZAR = 42;
const PUBLIC = path.join(EDITOR, "public");
const OUT = path.join(EDITOR, "out");
const DIST = path.join(APP, "dist");
const CONFIG = path.join(APP, "config.json");
const PORT = Number(process.env.PORT || 3210);
const WIN = process.platform === "win32";

fs.mkdirSync(PUBLIC, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ utilidades

const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".mkv", ".m4v"]);
const PASTAS_IGNORADAS = new Set(["broll", "fonts", "sfx", "uploads"]);

const lerJson = (arquivo, padrao) => {
  try {
    return JSON.parse(fs.readFileSync(arquivo, "utf-8"));
  } catch {
    return padrao;
  }
};
const salvarJson = (arquivo, dados) => fs.writeFileSync(arquivo, JSON.stringify(dados, null, 1), "utf-8");

// "clips/live-1.mp4" -> caminho absoluto dentro de public/ (sem deixar sair da pasta).
const noPublic = (rel) => {
  const abs = path.resolve(PUBLIC, rel);
  if (abs !== PUBLIC && !abs.startsWith(PUBLIC + path.sep)) throw new Error("caminho inválido");
  return abs;
};
const relPublic = (abs) => path.relative(PUBLIC, abs).split(path.sep).join("/");
// "clips/live-1.mp4" + ".captions.json" -> "clips/live-1.captions.json"
const irmao = (rel, sufixo) => rel.replace(/\.[^./]+$/, "") + sufixo;

const nomeSeguro = (nome) =>
  nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "arquivo";

const semColisao = (pasta, nome) => {
  const ext = path.extname(nome);
  const base = nome.slice(0, nome.length - ext.length);
  let candidato = nome;
  for (let i = 2; fs.existsSync(path.join(pasta, candidato)); i++) candidato = `${base}-${i}${ext}`;
  return candidato;
};

const config = () => lerJson(CONFIG, {});

// Chaves salvas nas Configurações, passadas só para os scripts que o Studio roda.
// A chave do Claude tem prioridade sobre o login (ant auth login).
const envDasChaves = () => {
  const c = config();
  return {
    ...(c.pexelsKey ? { PEXELS_API_KEY: c.pexelsKey } : {}),
    ...(c.claudeKey ? { ANTHROPIC_API_KEY: c.claudeKey } : {}),
  };
};

const MODELOS_CLAUDE = new Set(["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"]);

// Argumentos de IA para os scripts: --ia e, com o Claude, o modelo escolhido nas Configurações.
const argsIa = (o) => {
  const ia = o.ia || "claude";
  const modelo = config().claudeModelo;
  return ["--ia", ia, ...(ia === "claude" && MODELOS_CLAUDE.has(modelo) ? ["--modelo", modelo] : [])];
};

const pythonExe = () => {
  if (process.env.EDITOR_PYTHON) return process.env.EDITOR_PYTHON;
  const venv = WIN ? path.join(EDITOR, ".venv", "Scripts", "python.exe") : path.join(EDITOR, ".venv", "bin", "python");
  if (fs.existsSync(venv)) return venv;
  return WIN ? "python" : "python3";
};

// ------------------------------------------------------------------ projetos

// Arquivos que as ferramentas geram ao lado do vídeo e o campo do editor que cada um alimenta.
const GERADOS = {
  captions: ".captions.json",
  cuts: ".cuts.json",
  person: ".person.webm",
  brollFile: ".broll.json",
};

const listarProjetos = () => {
  const projetos = [];
  const varrer = (pasta, profundidade) => {
    for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
      const abs = path.join(pasta, item.name);
      if (item.isDirectory()) {
        if (profundidade < 2 && !PASTAS_IGNORADAS.has(item.name) && !item.name.startsWith(".")) varrer(abs, profundidade + 1);
        continue;
      }
      if (!VIDEO_EXT.has(path.extname(item.name).toLowerCase()) || item.name.endsWith(".person.webm")) continue;
      const rel = relPublic(abs);
      const st = fs.statSync(abs);
      projetos.push({ id: rel, nome: item.name, pasta: path.dirname(rel) === "." ? "" : path.dirname(rel), tamanho: st.size, modificado: st.mtimeMs });
    }
  };
  varrer(PUBLIC, 0);
  return projetos.sort((a, b) => b.modificado - a.modificado);
};

const arquivosDoProjeto = (id) => {
  const a = Object.fromEntries(Object.entries(GERADOS).map(([campo, suf]) => [campo, fs.existsSync(noPublic(irmao(id, suf)))]));
  // "Emojis e destaques" não cria arquivo: marca as palavras dentro da legenda.
  const legenda = a.captions ? lerJson(noPublic(irmao(id, ".captions.json")), []) : [];
  a.emojis = legenda.some((w) => w.emoji || w.highlight);
  return a;
};

const configuracoesDoProjeto = (id) => {
  const salvo = lerJson(noPublic(irmao(id, ".settings.json")), null);
  // Clipes gerados pelo clips.py trazem um .props.json com título-gancho etc.
  const base = salvo ?? lerJson(noPublic(irmao(id, ".props.json")), {});
  const cfg = { ...base, video: id };
  for (const [campo, suf] of Object.entries(GERADOS)) {
    if (cfg[campo] === undefined && fs.existsSync(noPublic(irmao(id, suf)))) cfg[campo] = irmao(id, suf);
  }
  // A marca vale para todos os vídeos: se existe marca.json e ela não foi desligada
  // ("ativa": false), entra em todo vídeo automaticamente.
  const marca = lerJson(path.join(PUBLIC, "marca.json"), null);
  cfg.brand = marca && marca.ativa !== false ? "marca.json" : "";
  return cfg;
};

const salvarConfiguracoes = (id, cfg) => salvarJson(noPublic(irmao(id, ".settings.json")), { ...cfg, video: id });

// ------------------------------------------------------------------ tarefas (scripts e render)

const tarefas = new Map();

const novaTarefa = (tipo, projeto, rotulo) => {
  const t = { id: randomUUID(), tipo, projeto, rotulo, status: "rodando", linhas: [], progresso: null, resultado: null, inicio: Date.now() };
  tarefas.set(t.id, t);
  return t;
};

const registrar = (t, texto) => {
  // Os scripts usam "\r" para atualizar a mesma linha (ex.: "30/300 quadros").
  for (const pedaco of texto.split(/\n/)) {
    const partes = pedaco.split("\r").filter((p) => p.trim() !== "");
    if (!partes.length) continue;
    const ultima = partes[partes.length - 1].replace(/\x1b\[[0-9;]*m/g, "").trimEnd();
    t.linhas.push(ultima);
    if (ultima.startsWith("AVISO:")) t.aviso = ultima.slice(6).trim();
    if (t.tipo === "exportar") {
      // Remotion: "Bundling 40%" -> "Rendered 120/380" (85% da barra) -> "Encoded 300/380" (15%).
      const r = ultima.match(/Rendered (\d+)\/(\d+)/);
      const e = ultima.match(/Encoded (\d+)\/(\d+)/);
      if (r) t.progresso = (Number(r[1]) / Number(r[2])) * 0.85;
      else if (e) t.progresso = 0.85 + (Number(e[1]) / Number(e[2])) * 0.15;
      continue;
    }
    if (t.tipo === "converter") {
      const tempo = ultima.match(/time=(\d+):(\d+):([\d.]+)/);
      if (tempo && t.duracaoS) t.progresso = Math.min(1, (Number(tempo[1]) * 3600 + Number(tempo[2]) * 60 + Number(tempo[3])) / t.duracaoS);
      continue;
    }
    const m = ultima.match(/(\d+)\s*\/\s*(\d+)/);
    if (m && Number(m[2]) > 0) t.progresso = Math.min(1, Number(m[1]) / Number(m[2]));
  }
  if (t.linhas.length > 400) t.linhas.splice(0, t.linhas.length - 400);
};

// Traduz os erros mais comuns em uma instrução do que fazer.
const DIAGNOSTICOS = [
  [/MemoryError|memory allocation of \d+ bytes failed|Unable to allocate|out of memory|CUDA out of memory/i,
    "Faltou memória RAM no computador. Feche outros programas (e abas do navegador) e tente de novo. Nas legendas, use \"Precisão normal\"."],
  [/Could not extract frame|compositor|Request closed|Target closed|ENOMEM|JavaScript heap out of memory/i,
    "O motor de vídeo ficou sem memória ao exportar. Feche outros programas (e abas do navegador) e exporte de novo."],
  [/credit balance is too low|sem créditos/i,
    "Sua conta da API do Claude está sem créditos (a assinatura Pro/Max não inclui a API). Adicione créditos em platform.claude.com > Billing ou troque a Inteligência para \"Sem IA\"."],
  [/não está logado no Claude|recusou o login/i, "Entre na sua conta do Claude em Configurações (canto de cima) e tente de novo."],
  [/PEXELS_API_KEY|Chave do Pexels inválida/i, "Cole a sua chave grátis do Pexels em Configurações e tente de novo."],
  [/Não consegui falar com o Ollama/i, "O Ollama não está aberto. Abra o Ollama ou troque a Inteligência para Claude."],
  [/WinError 126|DLL load failed|Error loading .*\.dll|vcruntime|msvcp140/i,
    "Falta um componente do Windows (Microsoft Visual C++). Rode o instalar-windows.bat de novo: ele instala e conserta."],
  [/No module named|ModuleNotFoundError|não é reconhecido como um comando|ENOENT/i, "A instalação está incompleta. Rode o instalar-windows.bat de novo."],
  [/No space left on device|espaço insuficiente|There is not enough space/i, "O disco está cheio. Libere espaço e tente de novo."],
  [/Invalid data found|moov atom not found|Não consegui abrir/i, "O arquivo de vídeo parece estar corrompido. Tente exportar/baixar o vídeo de novo."],
  [/Não achei .*captions\.json|Gere as legendas/i, "Gere as legendas primeiro."],
  [/Authentication failed|could not read Username|Repository not found|terminal prompts disabled/i,
    "Entre na sua conta do GitHub na janela que abrir (o projeto é privado) e clique em atualizar de novo."],
  [/spawn git ENOENT|'git' não é reconhecido/i, "Falta o Git para atualizar. Rode o instalar-windows.bat uma vez (ele instala o Git)."],
];
const diagnosticar = (linhas) => {
  const texto = linhas.slice(-60).join("\n");
  return DIAGNOSTICOS.find(([re]) => re.test(texto))?.[1] ?? null;
};

// aoFalhar: chamado se o programa falhar; se devolver true, a tarefa continua (ex.: nova tentativa).
const rodar = (t, exe, args, { env = {}, aoTerminar, aoFalhar, cwd = EDITOR } = {}) => {
  registrar(t, `▶ ${path.basename(exe)} ${args.map((a) => path.basename(String(a))).join(" ")}`);
  const proc = spawn(exe, args, {
    cwd,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      PYTHONUNBUFFERED: "1",
      FORCE_COLOR: "0",
      // Aviso inofensivo do Windows sobre atalhos de arquivo no cache de modelos.
      HF_HUB_DISABLE_SYMLINKS_WARNING: "1",
      ...env,
    },
    windowsHide: true,
  });
  t.proc = proc;
  proc.stdout.on("data", (d) => registrar(t, d.toString("utf-8")));
  proc.stderr.on("data", (d) => registrar(t, d.toString("utf-8")));
  proc.on("error", (err) => {
    registrar(t, `Não consegui iniciar: ${err.message}`);
    t.status = "erro";
    t.dica = diagnosticar(t.linhas);
  });
  proc.on("close", (codigo) => {
    t.proc = null;
    if (t.status === "cancelado") return;
    if (codigo === 0) {
      try {
        t.status = "ok";
        t.progresso = 1;
        t.resultado = aoTerminar ? aoTerminar() ?? null : null;
      } catch (err) {
        registrar(t, `Erro depois de terminar: ${err.message}`);
        t.status = "erro";
      }
    } else {
      if (aoFalhar && aoFalhar()) return;
      t.status = "erro";
      t.dica = diagnosticar(t.linhas);
    }
    t.fim = Date.now();
  });
};

// Roda vários comandos em sequência na mesma tarefa; para no primeiro que falhar.
const rodarSequencia = (t, passos, { aoTerminar, cwd } = {}) => {
  const [primeiro, ...resto] = passos;
  const proximo = resto.length ? () => rodarSequencia(t, resto, { aoTerminar, cwd }) : aoTerminar;
  rodar(t, primeiro.exe, primeiro.args, {
    cwd,
    env: primeiro.env,
    aoTerminar: resto.length
      ? () => {
          t.status = "rodando"; // ainda há passos
          proximo();
          return null;
        }
      : aoTerminar,
  });
};

const py = (script) => path.join(EDITOR, "scripts", script);
const REMOTION_CLI = path.join(EDITOR, "node_modules", "@remotion", "cli", "remotion-cli.js");

// ffprobe/ffmpeg que já vêm com o Remotion (não precisa instalar nada).
const ffprobe = (abs, entrada) => {
  const r = spawnSync(
    process.execPath,
    [REMOTION_CLI, "ffprobe", "-v", "error", ...entrada, "-of", "csv=p=0", abs],
    { encoding: "utf-8", windowsHide: true },
  );
  return (r.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop() ?? "";
};

// O Chrome/Edge no Windows não tocam HEVC (padrão do iPhone) nem alguns formatos antigos.
const COMPATIVEIS = new Set((process.env.STUDIO_COMPATIVEIS || "h264,vp8,vp9,av1").split(","));
const precisaConverter = (abs) => {
  const codec = ffprobe(abs, ["-select_streams", "v:0", "-show_entries", "stream=codec_name"]);
  return !COMPATIVEIS.has(codec) || [".mkv", ".avi"].includes(path.extname(abs).toLowerCase());
};

// Cada ferramenta: rótulo, argumentos do script e o que muda no projeto quando termina.
const FERRAMENTAS = {
  transcrever: {
    rotulo: "Gerar legendas",
    args: (v, o) => [py("transcribe.py"), v, "--model", o.modelo || "small"],
    campo: "captions",
  },
  cortar: {
    rotulo: "Cortar silêncios",
    args: (v, o) => [py("cut.py"), v, "--max-silence", String(o.maxSilencio ?? 350)],
    campo: "cuts",
  },
  emojis: {
    rotulo: "Emojis e destaques",
    args: (v, o) => [py("enrich.py"), v, ...argsIa(o)],
    extra: () => ({ emojis: true }),
  },
  broll: {
    rotulo: "B-roll automático",
    args: (v, o) => [py("broll.py"), v, ...argsIa(o)],
    campo: "brollFile",
  },
  recortar: {
    rotulo: "Recortar a pessoa",
    args: (v) => [py("segment.py"), v],
    campo: "person",
  },
  reframe: {
    rotulo: "Converter para vertical",
    args: (v) => [py("reframe.py"), v],
    novo: (id) => irmao(id, ".vertical.mp4"),
  },
  dublar: {
    rotulo: "Dublar",
    args: (v, o) => [py("voz.py"), "dublar", v, "--idioma", o.idioma || "en", ...argsIa(o)],
    novo: (id, o) => irmao(id, `.${o.idioma || "en"}.mp4`),
  },
  clipes: {
    rotulo: "Gerar clipes",
    args: (v, o) => {
      const a = [py("clips.py"), v, "--quantos", String(o.quantos || 3), ...argsIa(o)];
      if (o.vertical) a.push("--vertical");
      if (fs.existsSync(path.join(PUBLIC, "marca.json"))) a.push("--marca", "marca.json");
      return a;
    },
    clipes: true,
  },
};

const precisaLegenda = new Set(["cortar", "emojis", "broll", "clipes", "dublar"]);

// ------------------------------------------------------------------ servidor

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/api/projetos", (_req, res) => res.json(listarProjetos()));

app.get("/api/projeto", (req, res) => {
  const id = String(req.query.id || "");
  if (!fs.existsSync(noPublic(id))) return res.status(404).json({ erro: "vídeo não encontrado" });
  res.json({ id, arquivos: arquivosDoProjeto(id), configuracoes: configuracoesDoProjeto(id) });
});

app.put("/api/projeto", (req, res) => {
  const id = String(req.query.id || "");
  if (!fs.existsSync(noPublic(id))) return res.status(404).json({ erro: "vídeo não encontrado" });
  salvarConfiguracoes(id, req.body || {});
  res.json({ ok: true });
});

// Lista do B-roll automático: o app mostra as cenas e deixa remover as que não combinaram.
app.put("/api/broll", (req, res) => {
  const arquivo = String(req.query.arquivo || "");
  if (!arquivo.endsWith(".broll.json") || !Array.isArray(req.body)) return res.status(400).json({ erro: "pedido inválido" });
  const abs = noPublic(arquivo);
  if (!fs.existsSync(abs)) return res.status(404).json({ erro: "B-roll não encontrado" });
  salvarJson(abs, req.body);
  res.json({ ok: true });
});

app.delete("/api/projeto", (req, res) => {
  const id = String(req.query.id || "");
  const base = noPublic(id).replace(/\.[^./\\]+$/, "");
  for (const suf of ["", ".captions.json", ".cuts.json", ".person.webm", ".broll.json", ".settings.json", ".props.json"]) {
    const alvo = suf ? base + suf : noPublic(id);
    fs.rmSync(alvo, { force: true });
  }
  res.json({ ok: true });
});

// Upload de vídeos (viram projetos) e de arquivos de apoio (música, imagens, logo...).
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const pasta = req.query.tipo === "video" ? PUBLIC : path.join(PUBLIC, "uploads");
      fs.mkdirSync(pasta, { recursive: true });
      cb(null, pasta);
    },
    filename: (req, file, cb) => {
      const original = Buffer.from(file.originalname, "latin1").toString("utf-8");
      const pasta = req.query.tipo === "video" ? PUBLIC : path.join(PUBLIC, "uploads");
      cb(null, semColisao(pasta, nomeSeguro(original)));
    },
  }),
});
app.post("/api/upload", upload.single("arquivo"), (req, res) => {
  if (!req.file) return res.status(400).json({ erro: "nenhum arquivo" });
  const caminho = relPublic(req.file.path);
  if (req.query.tipo !== "video" || !precisaConverter(req.file.path)) return res.json({ caminho });

  // Converte para um formato que qualquer navegador toca, com barra de progresso.
  const vp9 = process.env.STUDIO_CODEC_ALVO === "vp9"; // só para testes automatizados
  const ext = vp9 ? ".webm" : ".mp4";
  const base = path.basename(req.file.path).replace(/\.[^.]+$/, "");
  const destino = path.join(PUBLIC, semColisao(PUBLIC, `${base}${ext}`));
  const t = novaTarefa("converter", null, "Preparando o vídeo");
  t.duracaoS = Number(ffprobe(req.file.path, ["-show_entries", "format=duration"])) || 0;
  const codec = vp9
    ? ["-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-row-mt", "1", "-deadline", "realtime", "-cpu-used", "8", "-c:a", "libopus"]
    : ["-c:v", "libx264", "-crf", "18", "-preset", "fast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"];
  rodar(t, process.execPath, [REMOTION_CLI, "ffmpeg", "-y", "-hide_banner", "-i", req.file.path, ...codec, destino], {
    aoTerminar: () => {
      fs.rmSync(req.file.path, { force: true });
      return { novoProjeto: relPublic(destino) };
    },
  });
  res.json({ caminho, tarefa: t.id });
});

app.get("/api/uploads", (_req, res) => {
  const pasta = path.join(PUBLIC, "uploads");
  const itens = fs.existsSync(pasta) ? fs.readdirSync(pasta).map((n) => `uploads/${n}`) : [];
  res.json(itens);
});

// Ferramentas de IA
app.post("/api/tarefas", (req, res) => {
  const { ferramenta, projeto, opcoes = {} } = req.body || {};
  const f = FERRAMENTAS[ferramenta];
  if (!f) return res.status(400).json({ erro: "ferramenta desconhecida" });
  if (!fs.existsSync(noPublic(projeto))) return res.status(404).json({ erro: "vídeo não encontrado" });
  if (precisaLegenda.has(ferramenta) && !fs.existsSync(noPublic(irmao(projeto, ".captions.json")))) {
    return res.status(400).json({ erro: "Gere as legendas primeiro (botão \"Gerar legendas\")." });
  }
  const t = novaTarefa(ferramenta, projeto, f.rotulo);
  rodar(t, pythonExe(), f.args(noPublic(projeto), opcoes), {
    env: envDasChaves(),
    aoTerminar: () => {
      if (f.campo || f.extra) {
        const cfg = configuracoesDoProjeto(projeto);
        if (f.campo) cfg[f.campo] = irmao(projeto, GERADOS[f.campo]);
        Object.assign(cfg, f.extra?.() ?? {});
        salvarConfiguracoes(projeto, cfg);
      }
      if (f.novo) return { novoProjeto: f.novo(projeto, opcoes) };
      if (f.clipes) {
        const stem = path.basename(projeto).replace(/\.[^.]+$/, "");
        const resumo = lerJson(path.join(PUBLIC, "clips", `${stem}-clipes.json`), []);
        return { clipes: resumo.map((c) => ({ ...c, id: `clips/${c.clipe}.mp4` })) };
      }
      return null;
    },
  });
  res.json({ id: t.id });
});

// Narração: texto digitado vira um vídeo novo.
app.post("/api/narrar", (req, res) => {
  const { titulo = "roteiro", texto = "", velocidade = 1, fundo = "" } = req.body || {};
  if (!texto.trim()) return res.status(400).json({ erro: "Escreva o roteiro primeiro." });
  const pasta = path.join(PUBLIC, "roteiros");
  fs.mkdirSync(pasta, { recursive: true });
  const nome = semColisao(pasta, nomeSeguro(titulo) + ".txt");
  const txt = path.join(pasta, nome);
  fs.writeFileSync(txt, texto, "utf-8");
  const t = novaTarefa("narrar", null, "Narrar roteiro");
  const args = [py("voz.py"), "narrar", txt, "--velocidade", String(velocidade)];
  if (fundo) args.push("--fundo", noPublic(fundo));
  rodar(t, pythonExe(), args, {
    aoTerminar: () => {
      const id = `roteiros/${nome.replace(/\.txt$/, ".mp4")}`;
      salvarConfiguracoes(id, { ...configuracoesDoProjeto(id), captionStyle: "pop", captionY: 50 });
      return { novoProjeto: id };
    },
  });
  res.json({ id: t.id });
});

// Exportar o vídeo final (Remotion)
app.post("/api/exportar", (req, res) => {
  const { projeto, props } = req.body || {};
  if (!fs.existsSync(noPublic(projeto))) return res.status(404).json({ erro: "vídeo não encontrado" });
  salvarConfiguracoes(projeto, props);
  const nome = semColisao(OUT, path.basename(projeto).replace(/\.[^.]+$/, "") + "-final.mp4");
  const propsArq = path.join(OUT, `.${nome}.props.json`);
  salvarJson(propsArq, { ...props, video: projeto });
  const t = novaTarefa("exportar", projeto, "Exportar vídeo");
  const logArq = path.join(OUT, nome.replace(/\.mp4$/, ".log"));

  // Por padrão o Remotion renderiza metade dos núcleos ao mesmo tempo (8 num Ryzen 7), o que
  // estoura a memória de PCs com pouca RAM livre e derruba o extrator de quadros ("compositor").
  // Começa leve; se ainda assim cair por falta de memória, tenta de novo no modo mais leve.
  const leve = [
    ["--concurrency=3", "--offthreadvideo-cache-size-in-bytes=536870912", "--offthreadvideo-video-threads=2"],
    ["--concurrency=1", "--offthreadvideo-cache-size-in-bytes=268435456", "--offthreadvideo-video-threads=1"],
  ];
  let tentativa = 0;
  const renderizar = () => {
    const args = [REMOTION_CLI, "render", "ShortVideo", path.join(OUT, nome), `--props=${propsArq}`, ...leve[tentativa]];
    if (process.env.REMOTION_BROWSER) args.push(`--browser-executable=${process.env.REMOTION_BROWSER}`);
    rodar(t, process.execPath, args, {
      aoTerminar: () => {
        fs.rmSync(propsArq, { force: true });
        return { arquivo: `/out/${encodeURIComponent(nome)}`, nome };
      },
      aoFalhar: () => {
        fs.writeFileSync(logArq, t.linhas.join("\n"), "utf-8"); // log completo para enviar ao suporte
        const memoria = /Could not extract frame|compositor|Request closed|Target closed|ENOMEM|heap out of memory/i.test(
          t.linhas.slice(-200).join("\n"),
        );
        if (memoria && tentativa < leve.length - 1) {
          tentativa++;
          t.progresso = 0;
          registrar(t, "Faltou memória; tentando de novo no modo mais leve (mais lento, porém mais seguro)...");
          renderizar();
          return true;
        }
        return false;
      },
    });
  };
  renderizar();
  res.json({ id: t.id });
});

app.get("/api/tarefas/:id", (req, res) => {
  const t = tarefas.get(req.params.id);
  if (!t) return res.status(404).json({ erro: "tarefa não encontrada" });
  const desde = Number(req.query.desde || 0);
  res.json({
    id: t.id,
    tipo: t.tipo,
    rotulo: t.rotulo,
    projeto: t.projeto,
    status: t.status,
    progresso: t.progresso,
    resultado: t.resultado,
    dica: t.dica ?? null,
    aviso: t.aviso ?? null,
    total: t.linhas.length,
    linhas: t.linhas.slice(desde),
  });
});

app.get("/api/tarefas", (_req, res) =>
  res.json([...tarefas.values()].map(({ proc, linhas, ...t }) => ({ ...t, ultima: linhas[linhas.length - 1] ?? "" }))),
);

app.post("/api/tarefas/:id/cancelar", (req, res) => {
  const t = tarefas.get(req.params.id);
  if (t?.proc) {
    t.status = "cancelado";
    if (WIN) spawnSync("taskkill", ["/pid", String(t.proc.pid), "/T", "/F"]);
    else t.proc.kill("SIGTERM");
  }
  res.json({ ok: true });
});

// A janela do Studio avisa a cada 15 s que continua aberta (ver vigiarJanela).
let ultimaPresenca = Date.now();
const SEM_JANELA_MS = 75_000;
app.post("/api/presenca", (_req, res) => {
  ultimaPresenca = Date.now();
  res.json({ ok: true });
});

// Atualização: baixa só o que mudou no GitHub (projeto privado: o Git pede o login uma vez).
const git = (...args) => spawnSync("git", args, { cwd: RAIZ, encoding: "utf-8", windowsHide: true });
const versaoAtual = () => {
  const r = git("rev-parse", "--short", "HEAD");
  return r.status === 0 ? r.stdout.trim() : null;
};

app.get("/api/versao", (_req, res) => {
  const temGit = !git("--version").error;
  res.json({ versao: temGit ? versaoAtual() : null, git: temGit });
});

app.post("/api/atualizar", (_req, res) => {
  if (git("--version").error) {
    return res.status(400).json({ erro: "Falta o Git para atualizar. Rode o instalar-windows.bat uma vez (ele instala o Git)." });
  }
  const antes = versaoAtual();
  const t = novaTarefa("atualizar", null, "Atualizar o Studio");
  const g = (...args) => ({ exe: "git", args, env: { GIT_TERMINAL_PROMPT: "0" } });
  const passos = [];
  if (!fs.existsSync(path.join(RAIZ, ".git"))) {
    // Primeira atualização de uma pasta baixada em ZIP: vira uma cópia do repositório.
    passos.push(g("init", "-q"), g("remote", "add", "origin", REPO_URL));
  }
  passos.push(
    g("fetch", "--depth", "1", "origin", "main"),
    // Troca só os arquivos do projeto; vídeos, ajustes, .venv e node_modules ficam (estão no .gitignore).
    g("reset", "--hard", "FETCH_HEAD"),
  );
  rodarSequencia(t, passos, {
    cwd: RAIZ,
    aoTerminar: () => {
      const depois = versaoAtual();
      const atualizado = depois !== antes;
      registrar(t, atualizado ? `Atualizado: ${antes ?? "zip"} -> ${depois}` : "Já está na versão mais nova.");
      if (atualizado) {
        // Dá tempo da interface ler o resultado; o iniciar.ps1 instala o que mudou e reabre.
        setTimeout(() => process.exit(SAIR_PARA_ATUALIZAR), 2500);
      }
      return { atualizado, versao: depois };
    },
  });
  res.json({ id: t.id });
});

// Marca, configurações e login do Claude
app.get("/api/marca", (_req, res) => {
  const arq = path.join(PUBLIC, "marca.json");
  const exemplo = lerJson(path.join(EDITOR, "exemplos", "marca.json"), {});
  res.json({ existe: fs.existsSync(arq), marca: lerJson(arq, { ...exemplo, logo: "" }) });
});
app.put("/api/marca", (req, res) => {
  salvarJson(path.join(PUBLIC, "marca.json"), req.body || {});
  res.json({ ok: true });
});

// As chaves nunca voltam para a tela: só se existem e os 4 últimos caracteres.
app.get("/api/config", (_req, res) => {
  const c = config();
  res.json({
    temPexels: Boolean(c.pexelsKey),
    temClaude: Boolean(c.claudeKey),
    claudeFinal: c.claudeKey ? c.claudeKey.slice(-4) : "",
    claudeModelo: MODELOS_CLAUDE.has(c.claudeModelo) ? c.claudeModelo : "claude-opus-5",
  });
});
app.put("/api/config", (req, res) => {
  const c = config();
  const b = req.body || {};
  if (typeof b.pexelsKey === "string") c.pexelsKey = b.pexelsKey.trim();
  if (typeof b.claudeKey === "string") c.claudeKey = b.claudeKey.trim();
  if (typeof b.claudeModelo === "string" && MODELOS_CLAUDE.has(b.claudeModelo)) c.claudeModelo = b.claudeModelo;
  salvarJson(CONFIG, c);
  res.json({ ok: true });
});

// Testa se o Claude funciona (chave válida e com créditos) com um pedido mínimo.
app.post("/api/claude/testar", (_req, res) => {
  const r = spawnSync(pythonExe(), [py("testar_claude.py")], {
    cwd: EDITOR,
    encoding: "utf-8",
    timeout: 60000,
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: "utf-8", ...envDasChaves() },
  });
  const linha = (r.stdout || "").trim().split(/\r?\n/).pop() || "";
  try {
    res.json(JSON.parse(linha));
  } catch {
    const erro = `${r.stderr || ""}${r.error?.message || ""}`.trim().split(/\r?\n/).pop();
    res.json({ ok: false, motivo: erro || "Não consegui testar (o Python dos scripts não respondeu)." });
  }
});

const antExe = () => {
  const local = WIN ? path.join(process.env.LOCALAPPDATA || "", "Programs", "ant", "ant.exe") : null;
  return local && fs.existsSync(local) ? local : "ant";
};
app.get("/api/claude", (_req, res) => {
  const chave = config().claudeKey;
  if (chave) return res.json({ instalado: true, texto: `Usando a chave da API que termina em ...${chave.slice(-4)}.` });
  const r = spawnSync(antExe(), ["auth", "status"], { encoding: "utf-8", timeout: 15000, windowsHide: true });
  if (r.error) return res.json({ instalado: false, texto: "A ferramenta de login (ant) não está instalada. Rode o instalador." });
  res.json({ instalado: true, texto: `${r.stdout || ""}${r.stderr || ""}`.trim() });
});
app.post("/api/claude/login", (_req, res) => {
  const t = novaTarefa("login", null, "Entrar no Claude");
  rodar(t, antExe(), ["auth", "login"]);
  res.json({ id: t.id });
});

// Arquivos: vídeos exportados, interface e a pasta public/ (o preview do Remotion usa "/arquivo").
app.use("/out", express.static(OUT, { setHeaders: (res) => res.setHeader("Cache-Control", "no-store") }));
app.use(express.static(DIST));
app.use(express.static(PUBLIC, { setHeaders: (res) => res.setHeader("Cache-Control", "no-cache") }));
app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ erro: "rota não encontrada" });
  res.sendFile(path.join(DIST, "index.html"));
});
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ erro: err.message });
});

// ------------------------------------------------------------------ inicialização

// Abre o Studio numa janela própria de aplicativo (Edge/Chrome em modo "app": sem abas
// nem barra de endereço). Sem Edge/Chrome, usa o navegador padrão.
const navegadorApp = () => {
  if (!WIN) return null;
  const pastas = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
  const candidatos = pastas.flatMap((p) => [
    path.join(p, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(p, "Google", "Chrome", "Application", "chrome.exe"),
  ]);
  return candidatos.find((c) => fs.existsSync(c)) ?? null;
};

const abrirNavegador = (url) => {
  if (process.env.NO_OPEN) return;
  const app = navegadorApp();
  if (app) {
    spawn(app, [`--app=${url}`, "--window-size=1440,900", "--new-window"], { detached: true, stdio: "ignore" })
      .on("error", () => {})
      .unref();
    return;
  }
  const [cmd, args] = WIN ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true }).on("error", () => {}).unref();
};

// O motor roda escondido: quando a janela do Studio fica fechada por um tempo (e nada está
// rodando, como uma exportação), ele se desliga sozinho. A janela avisa que está aberta
// a cada 15 s (/api/presenca).
const vigiarJanela = () => {
  if (process.env.STUDIO_SEM_AUTOSAIR) return;
  setInterval(() => {
    const ocupado = [...tarefas.values()].some((t) => t.status === "rodando");
    if (!ocupado && Date.now() - ultimaPresenca > SEM_JANELA_MS) {
      console.log("Janela do Studio fechada: desligando o motor.");
      process.exit(0);
    }
  }, 15_000).unref();
};

const iniciar = async () => {
  if (!fs.existsSync(path.join(DIST, "index.html")) || process.env.REBUILD) {
    console.log("Preparando a interface (só na primeira vez)...");
    const { build } = await import("vite");
    await build({ configFile: path.join(APP, "vite.config.mjs"), logLevel: "warn" });
  }
  const url = `http://localhost:${PORT}`;
  const servidor = app.listen(PORT, "127.0.0.1", () => {
    console.log(`\n  Ricardo AI Studio rodando em ${url}`);
    console.log("  Deixe esta janela aberta enquanto estiver usando. Para fechar, feche a janela.\n");
    abrirNavegador(url);
    vigiarJanela();
  });
  servidor.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`O Studio já está aberto; abrindo ${url}`);
      abrirNavegador(url);
      setTimeout(() => process.exit(0), 500);
    } else throw err;
  });
};

iniciar();
