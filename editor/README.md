# Editor de vídeos curtos (Reels / TikTok / Shorts)

Roda **100% no seu computador, de graça**: nenhuma API paga e nenhum servidor.

- **Legendas animadas** com destaque palavra a palavra: `hormozi`, `karaoke`, `pop`, `neon`, `minimal`
- **Palavras-chave** coloridas automaticamente
- **Texto atrás da pessoa**, com as animações `rise`, `scale`, `slide` e `letters`
- **Zoom automático** (punch-in) nos momentos que você escolher
- Edição visual no **Remotion Studio** (o painel lateral edita tudo) e exportação em MP4 1080x1920

## Como funciona o texto atrás da pessoa

```
camada 4  legendas                 (sempre na frente)
camada 3  pessoa recortada         <- video.person.webm (fundo transparente, gerado por IA)
camada 2  TEXTO GIGANTE            <- fica escondido atrás da pessoa
camada 1  vídeo original
```

O `scripts/segment.py` usa o **Robust Video Matting** para recortar a pessoa em todos
os quadros. O recorte é colocado por cima do texto, então o texto parece estar atrás dela.

## Instalação (uma vez só)

Você precisa de **Node.js 20+** e **Python 3.10+**.

```bash
cd editor
npm install
python -m venv .venv
# Windows: .venv\Scripts\activate    Mac/Linux: source .venv/bin/activate
pip install -r scripts/requirements.txt
```

> Sem placa NVIDIA, dá para instalar o PyTorch mais leve (só CPU):
> `pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu`

## Fluxo para cada vídeo

1. **Coloque o vídeo** em `editor/public/video.mp4`. Grave em 9:16, ou o editor corta as sobras.
2. **Gere as legendas** (cerca de 10 s para 1 minuto de vídeo):
   ```bash
   python scripts/transcribe.py public/video.mp4
   ```
   Isso cria `public/video.captions.json`. Para mais precisão, use `--model medium`.
   Dá para abrir o JSON e corrigir alguma palavra à mão.
3. **Recorte a pessoa** (só se for usar o texto atrás da pessoa):
   ```bash
   python scripts/segment.py public/video.mp4
   ```
   Isso cria `public/video.person.webm`. Na CPU leva uns 2 minutos para 12 s de vídeo;
   com GPU NVIDIA ou Mac M1+ é bem mais rápido.
4. **Edite no Studio**:
   ```bash
   npm run studio
   ```
   No painel da direita você troca o estilo da legenda, as cores, as palavras-chave, os zooms
   e os textos atrás da pessoa (texto, momento, animação, cor, altura e tamanho). O preview
   atualiza na hora.
5. **Exporte** pelo botão *Render* do Studio ou com `npm run render` (o arquivo sai em `out/video.mp4`).

Para editar outro vídeo, use outros nomes (`public/aula1.mp4` etc.) e troque os campos
`video`, `captions` e `person` no painel. Se não quiser legenda ou recorte, deixe o campo vazio.

## Ajustes rápidos

| Campo | O que faz |
|---|---|
| `captionStyle` | `hormozi` (caixa alta, amarelo), `karaoke` (fundo na palavra falada), `pop` (uma palavra por vez, gigante), `neon` (brilho), `minimal` (discreto, com caixa) |
| `captionY` | Altura da legenda em %. O padrão é 72, acima da interface do TikTok e do Reels |
| `wordsWindowMs` | Quantas palavras aparecem juntas (maior = mais palavras por tela) |
| `keywords` | Palavras que sempre ficam com a cor de destaque |
| `zooms` | `atMs` (quando), `durationMs` (por quanto tempo), `scale` (1.2 = 20% de zoom) |
| `behindTexts` | `y` em % da altura (20-30 fica atrás da cabeça), `fontSize` de 250 a 400 para o efeito ficar bom |

**Dica:** o efeito fica melhor com a pessoa no centro e um pouco de espaço acima da cabeça.
Com o `y` perto do topo da cabeça, o texto "sai" de trás dela.

## Estrutura

```
src/
  Root.tsx              composição, props padrão, duração automática pelo vídeo
  ShortVideo.tsx        empilhamento das camadas
  schema.ts             todos os campos editáveis (painel do Studio)
  captions/             os estilos de legenda
  effects/BehindText    texto atrás da pessoa
  effects/AutoZoom      zoom punch-in
scripts/
  transcribe.py         Whisper local -> legendas com tempo por palavra
  segment.py            Robust Video Matting -> pessoa com fundo transparente
```

## Licenças

- O Remotion é gratuito para uso individual (veja remotion.dev/license).
- Whisper, Robust Video Matting e as fontes (OFL) são gratuitos.
