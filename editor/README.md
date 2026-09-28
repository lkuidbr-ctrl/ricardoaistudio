# Ricardo AI Studio: editor de vídeos curtos (Reels / TikTok / Shorts)

Um programa com **interface visual**, que abre no navegador e roda no seu computador:
você arrasta o vídeo, clica nos botões das ferramentas de IA, ajusta tudo com
preview ao vivo e exporta o MP4.

## Usando o app (recomendado)

1. **Instale** (Windows): dois cliques em `instalar-windows.bat`, na pasta principal do projeto.
2. **Abra** o atalho **Ricardo AI Studio** na Área de Trabalho (ou no Menu Iniciar). O app
   abre na própria janela, com ícone, sem janela preta. Ao fechar a janela, o Studio se
   desliga sozinho (se estiver exportando, ele termina antes e o vídeo fica em `editor\out`).
   Se algo der errado ao abrir, aparece um aviso e o registro fica em `editor\studio.log`.
3. **Arraste seu vídeo** para a janela. Vídeos de iPhone (HEVC) são convertidos sozinhos.
   Assim que ele chega, o **Editar automático** começa sozinho: a IA gera a legenda, corta
   os silêncios, escolhe destaques e emojis, decide onde dar zoom, escreve o título-gancho e
   (com a chave do Pexels) coloca o B-roll. Você só mexe no que não gostar.
4. Se quiser refazer só uma parte, na **coluna da esquerda** rode as ferramentas uma a uma:
   - **Gerar legendas**: sempre o primeiro passo;
   - **Cortar silêncios**: tira pausas e "éé";
   - **Melhorar áudio**: tira o ruído de fundo e deixa a voz no volume certo das redes;
   - **Corrigir cor**: acerta brilho, contraste, cores e sombras sozinho (ajuste fino em Efeitos > Cor);
   - **Emojis e destaques**: a IA escolhe palavras-chave e emojis;
   - **B-roll automático**: vídeos grátis do Pexels nos momentos certos. Com o Claude, a IA
     olha as opções e escolhe a que combina com a frase (ou pula a cena se nenhuma combinar).
     Na aba **Efeitos** aparece a lista das cenas, e dá para tirar a que não gostar;
   - **Recortar a pessoa**: para o texto ficar atrás de você.
5. Quer mudar algo? Escreva na caixa **"Peça para a IA"** (topo da coluna esquerda), por
   exemplo "deixa a legenda amarela", "tira o zoom do começo" ou "troca 'Ricado' por 'Ricardo'".
   A IA ajusta o vídeo; se não gostar, clique em **Desfazer**.
6. Ou ajuste à mão na **coluna da direita**. O preview atualiza na hora.
   - **Legenda**: estilo, cores, posição, palavras em destaque e **Corrigir o texto**
     (para consertar palavras que a transcrição errou; as duvidosas ficam em amarelo).
   - **Textos**: título-gancho e texto atrás da pessoa. O botão "+ no momento atual"
     usa o ponto onde o vídeo está parado.
   - **Efeitos**: cor, animações prontas (setas, check, coração, confete...), zoom, transição
     entre frases (funciona mesmo sem cortar silêncios) e B-roll.
   - **Áudio**: música com volume automático e efeitos sonoros.
   - **Marca**: cores, logo, @, barra de progresso e tela final. Vale para todos os vídeos
     e liga sozinha quando você preenche.
7. Clique em **Exportar vídeo**. O arquivo pode ser baixado na hora e também fica salvo
   em `editor\out`. Se faltar memória, o Studio tenta de novo sozinho, mais devagar; se
   mesmo assim falhar, o erro fica em `editor\out\<nome>.log`.

Outras opções:
- **Narrar roteiro**, no topo: cria um vídeo a partir de um texto, com voz por IA.
- **Gerar clipes**: corta uma live ou um podcast em vários shorts.
- **Converter para vertical**: transforma um vídeo deitado em 9:16.
- **Dublar**: dubla o vídeo em inglês, espanhol, francês ou italiano.

Em **Configurações** você cola a **chave da API do Claude** (com o botão "Testar", que
confere se ela funciona e se tem créditos), escolhe o modelo (Opus, Sonnet ou Haiku, do melhor
ao mais barato), cola a chave do Pexels e escolhe a IA (Claude, Ollama local ou sem IA).
As chaves ficam só no seu computador (`editor/app/config.json`). A API do Claude tem créditos
próprios, comprados em platform.claude.com; a assinatura Pro/Max não vale para ela. Sem
créditos, o Studio usa o modo sem IA sozinho e avisa. Tudo o que você ajusta é salvo sozinho.

> Mac/Linux, ou para desenvolver: `npm install`, `npm run app:build` e `npm run app`
> (endereço: http://localhost:3210). O modo avançado, com todos os campos do editor e
> sem as ferramentas de IA, abre com `npm run studio`.

---

## Por dentro (para quem quiser usar pelo terminal)

Tudo o que o app faz também pode ser feito pelos scripts, descritos abaixo.

## Como funciona o texto atrás da pessoa

```
camada 5  legendas e emojis        (sempre na frente)
camada 4  B-roll                   (tela cheia ou cartão)
camada 3  pessoa recortada         <- video.person.webm (fundo transparente, gerado por IA)
camada 2  TEXTO GIGANTE            <- fica escondido atrás da pessoa
camada 1  vídeo original
```

O `scripts/segment.py` usa o **MODNet** (licença Apache-2.0, roda no processador) para
recortar a pessoa em todos os quadros. O recorte é colocado por cima do texto, então o texto parece estar atrás dela.

## Instalação (uma vez só)

### Windows: instalador de um clique

1. Baixe o projeto: no GitHub, clique em **Code → Download ZIP** e descompacte.
2. Dê dois cliques em **`instalar-windows.bat`**, na pasta principal do projeto.
   - Se aparecer "O Windows protegeu o computador", clique em **Mais informações →
     Executar assim mesmo**. O aviso aparece porque o arquivo veio da internet.
3. Espere de 5 a 15 minutos. Ele instala sozinho o Node.js, o Python, o editor e as IAs
   locais. No fim, pede a chave do Pexels (opcional). A chave do Claude você cola no app.
4. Pronto: aparece o atalho **Ricardo AI Studio** na Área de Trabalho e no Menu Iniciar.
   Ele abre o app na própria janela.

**Para atualizar**, não precisa baixar o ZIP de novo: no app, abra **Configurações → Buscar
atualização**. Ele baixa só o que mudou, instala só o que precisa e reabre sozinho
(normalmente em menos de 1 minuto). Na primeira vez, o GitHub pode pedir para você entrar na
sua conta, porque o projeto é privado. O instalador também pode ser rodado de novo: ele
anota o que já instalou e pula o que não mudou.

**Placa de vídeo:** não é necessária. Todas as IAs locais (legenda, recorte da pessoa, voz)
rodam no processador, com modelos leves.

### Mac / Linux (ou Windows manual)

Você precisa de **Node.js 20+** e **Python 3.10+**.

```bash
cd editor
npm install
python -m venv .venv
# Windows: .venv\Scripts\activate    Mac/Linux: source .venv/bin/activate
pip install -r scripts/requirements.txt
```

### Login no Claude (OAuth, sem chave de API)

Os scripts usam o Claude por padrão. O login é feito uma vez só, pelo navegador, com a
ferramenta oficial `ant` da Anthropic:

1. **Instale o `ant`.**
   - Mac: `brew install anthropics/tap/ant` e depois `xattr -d com.apple.quarantine "$(brew --prefix)/bin/ant"`
   - Windows e Linux: baixe o arquivo do seu sistema em
     [github.com/anthropics/anthropic-cli/releases](https://github.com/anthropics/anthropic-cli/releases)
     e coloque o `ant` em uma pasta do PATH.
2. **Faça login:** `ant auth login` abre o navegador; escolha a organização e o workspace.
3. **Confira:** `ant auth status` mostra qual conta está ativa.

Pronto: os scripts pegam o login sozinhos e renovam o acesso automaticamente. De tempos
em tempos o login expira; se aparecer "O Claude recusou o login", rode `ant auth login` de novo.

> **Atenção:** se existir a variável `ANTHROPIC_API_KEY` no seu computador (mesmo vazia),
> ela passa na frente do login OAuth. Apague-a se quiser usar o login.

O uso é cobrado na conta/workspace que você escolheu no login: um vídeo de 1 minuto custa
poucos centavos de dólar. Para gastar ainda menos, use `--modelo claude-haiku-4-5` em
qualquer script. Sem internet ou sem login? Use `--ia ollama` ou `--ia dicionario`.


## Fluxo para cada vídeo

1. **Coloque o vídeo** em `editor/public/video.mp4`. Grave em 9:16, ou o editor corta as sobras.
   Se o vídeo for **horizontal** (podcast, live, gravação de tela com rosto), converta antes:
   ```bash
   python scripts/reframe.py public/gravacao.mp4      # gera public/gravacao.vertical.mp4
   ```
   A "câmera" fica parada enquanto você está perto do centro e só se move, suave, quando
   você sai da zona de folga. Ajuste com `--folga 0.12` (menos movimento) ou
   `--suavidade 2` (movimentos mais lentos). Depois use o `gravacao.vertical.mp4` em todos
   os próximos passos. Na primeira vez, o script baixa o detector de rostos (~230 KB).
2. **Gere as legendas** (cerca de 10 s para 1 minuto de vídeo):
   ```bash
   python scripts/transcribe.py public/video.mp4
   ```
   Isso cria `public/video.captions.json`. Para mais precisão, use `--model medium`.
   Dá para abrir o JSON e corrigir alguma palavra à mão.
3. **Corte silêncios e "éé"** (opcional, instantâneo):
   ```bash
   python scripts/cut.py public/video.mp4
   ```
   Isso cria `public/video.cuts.json` com os trechos que ficam. No Studio, preencha o campo
   `cuts` com `video.cuts.json`. O original não é alterado: para desfazer, deixe o campo vazio.
   Para cortes mais agressivos use `--max-silence 250`; para cortar também "tipo" e "né", use
   `--filler tipo --filler né`.
4. **Emojis e destaques** (opcional):
   ```bash
   python scripts/enrich.py public/video.mp4                   # Claude (padrão)
   python scripts/enrich.py public/video.mp4 --ia ollama       # IA local grátis (instale o Ollama e rode `ollama pull qwen2.5:7b`)
   python scripts/enrich.py public/video.mp4 --ia dicionario   # dicionário: grátis e instantâneo
   ```
   Isso marca as palavras de destaque e os emojis dentro do `video.captions.json`. Dá para
   trocar ou apagar um emoji editando o arquivo (campo `"emoji"`). No Studio, o campo `emojis`
   liga e desliga os emojis.
5. **B-roll automático** (opcional). Precisa de uma chave grátis do Pexels
   ([pexels.com/api](https://www.pexels.com/api/)):
   ```bash
   # Windows (PowerShell): $env:PEXELS_API_KEY="sua-chave"    Mac/Linux: export PEXELS_API_KEY=sua-chave
   python scripts/broll.py public/video.mp4 --so-planejar   # só mostra as cenas que escolheria
   python scripts/broll.py public/video.mp4                 # Claude escolhe as cenas (padrão)
   python scripts/broll.py public/video.mp4 --ia dicionario # sem IA
   ```
   Os clipes vão para `public/broll/`, e o plano vai para `public/video.broll.json`. No Studio,
   preencha `brollFile` com `video.broll.json`. Ele funciona junto com o corte de silêncios.
   Para trocar uma cena, edite o JSON. Os créditos dos autores ficam em
   `public/broll/video-creditos.txt`; os vídeos do Pexels são grátis e não exigem crédito,
   mas é gentil dar.
6. **Recorte a pessoa** (só se for usar o texto atrás da pessoa):
   ```bash
   python scripts/segment.py public/video.mp4
   ```
   Isso cria `public/video.person.webm`. Na CPU leva uns 2 minutos para 12 s de vídeo;
   com GPU NVIDIA ou Mac M1+ é bem mais rápido.
7. **Edite no Studio**:
   ```bash
   npm run studio
   ```
   No painel da direita você troca o estilo da legenda, as cores, as palavras-chave, os zooms
   e os textos atrás da pessoa (texto, momento, animação, cor, altura e tamanho). O preview
   atualiza na hora.
8. **Exporte** pelo botão *Render* do Studio ou com `npm run render` (o arquivo sai em `out/video.mp4`).

Para editar outro vídeo, use outros nomes (`public/aula1.mp4` etc.) e troque os campos
`video`, `captions` e `person` no painel. Se não quiser legenda ou recorte, deixe o campo vazio.

## Sua marca em todos os vídeos

Copie `exemplos/marca.json` para `public/marca.json`, ajuste e preencha o campo `brand` no
Studio com `marca.json`. A marca aplica:

- **cor principal** nos destaques da legenda, no título-gancho, na barra de progresso e no botão;
- **logo** (ou o seu @) como marca d'água no canto, a partir do fim do gancho;
- **fonte própria** (`"fonte": "fonts/MinhaFonte.woff2"`, com o arquivo em `public/fonts/`)
  no gancho, na marca d'água e na tela final;
- **barra de progresso** no topo, que ajuda a pessoa a ver até o fim;
- **tela final** "segue pra mais", com o seu @ e um botão de seguir que é "clicado", com som.

Dá para ter várias marcas (`marca-podcast.json`, `marca-cliente.json`) e trocar pelo campo.
Nos clipes em lote: `python scripts/clips.py public/live.mp4 --marca marca.json`.

## Vídeo longo → vários shorts

```bash
python scripts/transcribe.py public/live.mp4                     # legendas do vídeo inteiro
python scripts/clips.py public/live.mp4 --quantos 5               # Claude escolhe (padrão)
python scripts/clips.py public/live.mp4 --vertical                # se a live for horizontal
python scripts/render_all.py public/clips                         # renderiza todos em out/
```

O `clips.py` escolhe trechos de 15 a 60 s (ajuste com `--minimo` e `--maximo`) que começam
com um gancho e não atravessam conversa de bastidor (chat, microfone, "bom dia"). Para cada
trecho ele gera, em `public/clips/`, o vídeo recortado, as legendas já no tempo do clipe e um
`.props.json` com o título-gancho. O `render_all.py` renderiza cada `.props.json` da pasta;
o que não estiver no arquivo usa o padrão do editor.

Quer caprichar em um clipe? Rode `cut.py`, `enrich.py` e os outros scripts nele, como em
qualquer vídeo, e acrescente os campos no `.props.json` (por exemplo `"cuts": "clips/live-1.cuts.json"`).
Com `--ia dicionario` ele usa uma heurística embutida, que é grátis, mas escolhe trechos e títulos bem piores.

## Voz por IA: narração e dublagem

Usa o **Kokoro** (licença Apache-2.0), uma voz neural gratuita que roda no seu computador.
Na primeira vez, o modelo é baixado (~90 MB).

**Narrar um roteiro** (vídeo sem gravar a voz):
```bash
python scripts/voz.py narrar public/roteiro.txt                          # fundo em gradiente animado
python scripts/voz.py narrar public/roteiro.txt --fundo public/fundo.jpg --velocidade 1.1
python scripts/broll.py public/roteiro.mp4                               # cobre com imagens do Pexels
```
Gera `public/roteiro.mp4` e as legendas. As legendas usam o texto exato do roteiro, com os
tempos medidos pelo Whisper, então nomes e palavras estrangeiras saem certos. Separe
parágrafos com uma linha em branco para ter pausas maiores.

**Dublar um vídeo seu** em inglês, espanhol, francês ou italiano:
```bash
python scripts/voz.py dublar public/video.mp4 --idioma en                # traduz com o Claude (padrão)
python scripts/voz.py dublar public/video.mp4 --idioma es --ia ollama --manter-fundo 0.15
```
Cada frase é traduzida e falada no mesmo momento da original. Se a tradução ficar mais longa,
a voz acelera até 1,4x para caber. `--manter-fundo` deixa o áudio original baixinho por
baixo. Gera `video.en.mp4` com as legendas no novo idioma.
Troque a voz com `--voz`: `pm_alex`, `pm_santa` ou `pf_dora` (feminina) em português;
`am_michael` ou `af_heart` em inglês; `em_alex` ou `ef_dora` em espanhol; `ff_siwis` em
francês; `im_nicola` ou `if_sara` em italiano.
A voz é uma voz pronta, não a sua. Clonar a sua voz exige um serviço pago, como o ElevenLabs.

## Ajustes rápidos

| Campo | O que faz |
|---|---|
| `cuts` | Arquivo do `cut.py`. **Com cortes, os tempos de `zooms` e `behindTexts` são os do vídeo já cortado** (os mesmos do preview) |
| `brand` | Arquivo da marca em `public/` (veja `exemplos/marca.json`) |
| `hookText` / `hookDurationMs` | Título-gancho no topo, nos primeiros segundos (o `clips.py` preenche sozinho) |
| `captionStyle` | `hormozi` (caixa alta, amarelo), `karaoke` (fundo na palavra falada), `pop` (uma palavra por vez, gigante), `neon` (brilho), `minimal` (discreto, com caixa) |
| `captionY` | Altura da legenda em %. O padrão é 72, acima da interface do TikTok e do Reels |
| `wordsWindowMs` | Quantas palavras aparecem juntas (maior = mais palavras por tela) |
| `keywords` | Palavras extras que sempre ficam com a cor de destaque (somam às do `enrich.py`) |
| `emojis` | Liga e desliga os emojis do `enrich.py` |
| `cutTransition` | Efeito em cada emenda do corte: `none`, `zoom` (alterna perto/longe, o clássico do YouTube), `flash`, `whip`, `glitch`. Precisa do `cuts` |
| `brollFile` | Arquivo do `broll.py`; soma com a lista `broll` |
| `broll` | Coloque a imagem ou o vídeo em `public/` e informe `src`, `startMs`, `durationMs`, `mode` (`full` ou `pip`) e `transition`. Imagens ganham zoom lento (Ken Burns); o áudio do B-roll fica mudo |
| `music` | Música em `public/` (mp3 ou wav). Ela toca em loop, com fade no começo e no fim. Pegue músicas liberadas na Biblioteca de Áudio do YouTube ou no Pixabay Music |
| `musicVolume` / `duckTo` | Volume da música (0.25 = 25%) e quanto ela abaixa durante a fala (0.3 = cai para 30% do volume) |
| `sfx` / `sfxVolume` | Liga e desliga os efeitos sonoros e define o volume deles. Os sons ficam em `public/sfx/`; troque os arquivos se quiser outros sons |
| `zooms` | `atMs` (quando), `durationMs` (por quanto tempo), `scale` (1.2 = 20% de zoom) |
| `behindTexts` | `y` em % da altura (20-30 fica atrás da cabeça), `fontSize` de 250 a 400 para o efeito ficar bom |

**Dica:** o efeito fica melhor com a pessoa no centro e um pouco de espaço acima da cabeça.
Com o `y` perto do topo da cabeça, o texto "sai" de trás dela.

## Estrutura

```
app/
  server.mjs            servidor local: projetos, ferramentas de IA, exportação
  src/                  a interface visual (React + preview do Remotion)
src/
  Root.tsx              composição, props padrão, duração automática pelo vídeo
  ShortVideo.tsx        empilhamento das camadas
  schema.ts             todos os campos editáveis (painel do Studio)
  captions/             os estilos de legenda
  effects/BehindText    texto atrás da pessoa
  effects/AutoZoom      zoom punch-in
  effects/CutVideo      toca só os trechos mantidos (jump cut)
  effects/CutTransition efeitos nas emendas (zoom, flash, whip, glitch)
  effects/Broll         imagens/vídeos de apoio
  effects/Glitch        separação RGB reaproveitada pelos outros efeitos
  effects/Sound         música com ducking e efeitos sonoros
  effects/HookTitle     título-gancho do começo
  effects/BrandOverlay  marca d'água, barra de progresso e tela final
  brand.ts              leitura e validação do marca.json
exemplos/
  marca.json            modelo de marca para copiar em public/
  roteiro.txt           modelo de roteiro para o voz.py narrar
  timeline.ts           converte tempos do original para o vídeo cortado
scripts/
  reframe.py            horizontal -> vertical seguindo o rosto (YuNet, OpenCV)
  transcribe.py         Whisper local -> legendas com tempo por palavra
  clips.py              vídeo longo -> vários clipes com título-gancho
  render_all.py         renderiza todos os .props.json de uma pasta
  voz.py                narração de roteiro e dublagem (Kokoro)
  fonemas.py            pronúncia para a voz (espeak-ng; GPL-3.0, roda como programa à parte)
  cut.py                silêncios e "éé" -> trechos que ficam (video.cuts.json)
  enrich.py             destaques e emojis (Claude, Ollama ou dicionário)
  broll.py              B-roll automático com clipes grátis do Pexels
  _ia.py                chamadas de IA compartilhadas (Claude via login OAuth / Ollama)
  gerar_sfx.py          sintetiza os efeitos sonoros de public/sfx/ (sem direito autoral)
  segment.py            MODNet -> pessoa com fundo transparente
```

## Licenças

- O Remotion é gratuito para uso individual (veja remotion.dev/license).
- Whisper (MIT), MODNet (Apache-2.0), o detector de rostos YuNet (MIT), o Kokoro (Apache-2.0) e as
  fontes (OFL) são gratuitos e permitem uso comercial. O espeak-ng e o phonemizer (GPL-3.0) são
  usados só pelo `scripts/fonemas.py`, um programa à parte.
