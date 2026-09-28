# Ideias para depois

Anotações de projetos e recursos analisados, para decidir mais tarde o que entra no Studio.

## LosslessCut (github.com/mifi/lossless-cut)

Analisado em 27/09/2026.

**O que é:** um cortador de vídeo que não refaz o arquivo. Ele corta e junta pedaços sem perder
qualidade e em segundos. Usa FFmpeg com cópia direta dos dados do vídeo (stream copy). É feito
com Electron, React e TypeScript, tem 44 mil estrelas e roda em Windows, Mac e Linux. Não tem
legenda, efeitos nem IA: é só tesoura.

**Licença GPL-2.0:** não dá para usar o código dele dentro do Studio se ele for vendido (seria
obrigatório liberar o código do Studio inteiro). A técnica pode ser refeita do zero, com o FFmpeg
que o Studio já tem.

**O que aproveitar (por prioridade):**
1. **"Recortar trecho" rápido** ao soltar o vídeo. Marca o início e o fim, e o corte é feito com
   `ffmpeg -c copy`, em segundos e sem perder qualidade. A IA (transcrição, corte e edição
   automática) trabalha só no pedaço escolhido, o que ajuda muito com lives longas num PC modesto.
   Detalhe técnico: o corte sem refazer o vídeo cai no keyframe mais próximo. Para precisão ao
   quadro, é preciso refazer só o começo do trecho ("smart cut").
2. **Gerar clipes mais rápido:** separar os trechos da live com stream copy antes de montar cada
   short.
3. **Detecção de troca de cena** (filtro `scdet`/`select` do FFmpeg). Ajudaria o "Converter para
   vertical" quando a câmera muda.
4. **Modelo de venda:** grátis no GitHub e pago nas lojas (Microsoft Store e Mac App Store). Muita
   gente paga pela comodidade.

## Shotcut, OpenShot e Olive

Analisados em 27/09/2026. Os três são editores **tradicionais, de linha do tempo**: você monta
tudo à mão, trilha por trilha. É o contrário do Studio, em que a IA edita e você só ajusta.
Nenhum tem IA, legenda automática ou foco em vídeo curto.

| | Shotcut | OpenShot | Olive |
|---|---|---|---|
| Situação | Maduro, muito usado | Maduro, bom para iniciantes | Ainda "alpha" (instável) depois de anos |
| Feito com | C++, Qt, motor MLT, FFmpeg | Python, Qt, libopenshot, FFmpeg | C++, Qt, OpenGL |
| Estrelas | 15 mil | 6,6 mil | 9 mil |
| Licença | GPL-3.0 | GPL-3.0 | GPL-3.0 |

**Licença GPL-3.0:** vale o mesmo que no LosslessCut. O código não pode entrar num Studio vendido;
as ideias, sim.

**O que aproveitar (por prioridade):**
1. **Arquivos de prévia leves (proxy, do Shotcut):** o preview usa uma cópia pequena do vídeo e a
   exportação usa o original. Deixaria o preview liso num PC modesto e com vídeos 4K de celular.
2. **Faixa do tempo simples embaixo do vídeo:** uma tira mostrando onde estão os zooms, o B-roll,
   os textos e os cortes, com arrastar para mudar de lugar. Não é uma linha do tempo completa: é só
   para ver e ajustar o que a IA fez.
3. **Volume da voz por igual (normalização, do Shotcut):** o filtro `loudnorm` do FFmpeg deixa a
   voz no volume certo para Reels e TikTok, sem trechos baixos.
4. **Modelos de título e de animação (OpenShot):** pacotes prontos de títulos, animações e
   transições. Também é algo para vender depois (pacotes extras).
5. **Fundo verde (chroma key, OpenShot):** simples de fazer. Para quem não tem fundo verde, o
   Studio já recorta a pessoa com IA.

**Lição do Olive:** tentar fazer um editor completo de linha do tempo leva anos e pode nunca ficar
estável. O ponto forte do Studio é a edição automática para vídeo curto; melhor não virar um
Premiere.

## Pesquisa geral no GitHub (27/09/2026)

### Atenção antes de vender: licenças do que o Studio já usa

| Peça do Studio | Licença | Para vender |
|---|---|---|
| Remotion (motor de vídeo) | Própria | Grátis para pessoa física e empresas de até 3 funcionários. Proíbe vender uma versão modificada do Remotion. **Antes de vender, confirmar com a Remotion** se o Studio precisa de licença de empresa. |
| Robust Video Matting (recortar a pessoa) | **GPL-3.0** | **Resolvido (28/09):** trocado pelo MODNet (Apache-2.0). |
| Piper (voz por IA, versão 1.3+) | **GPL-3.0** (mudou para o repositório piper1-gpl) | **Resolvido (28/09):** trocado pelo **Kokoro** (Apache-2.0). A pronúncia (espeak-ng/phonemizer, GPL-3.0) fica isolada no `scripts/fonemas.py`, programa separado e GPL-3.0. Vale confirmar com um advogado antes de vender. |
| faster-whisper (legendas) | MIT | OK |
| FFmpeg (via Remotion) | LGPL | OK do jeito que é usado (programa separado) |
| SDK do Claude | MIT | OK |

### Projetos parecidos com o Studio (para ver ideias, não copiar código)

- **OpenShorts** (github.com/mutonby/openshorts; 5,7 mil estrelas; MIT no núcleo): transforma
  vídeos longos em shorts com IA. Tem detecção dos melhores momentos, rosto seguido com
  MediaPipe e YOLOv8, legenda com faster-whisper e dublagem com ElevenLabs. Também vende versão na
  nuvem a partir de US$ 12/mês. É a referência mais próxima do "Gerar clipes" do Studio, e mostra
  que existe mercado.
- **OpenChatCut** (github.com/rsmith4321/OpenChatCut; 2 mil estrelas; **AGPL**, não usar código):
  editor com **chat**. Você pede "tira essa parte" ou "coloca legenda amarela" e a IA edita. Usa
  Remotion, como o Studio. Ideia forte para o Studio: uma **caixa "peça para a IA"**.
- **autoclip** (9 mil estrelas) e **ai-video-editor** (MartinDelophy, 872 estrelas): também são
  edição por IA, em linha do tempo.

### Peças livres (MIT, Apache ou BSD) que dá para usar no Studio

1. **Silero VAD** (MIT): detecta quando há voz, com mais precisão. Cortes de silêncio melhores,
   sem comer o fim das palavras.
2. **DeepFilterNet** (MIT/Apache): tira ruído de fundo da voz (ventilador, rua, eco). Botão
   "Melhorar áudio".
3. **Lottie** (lottie-web MIT + `@remotion/lottie`): animações prontas de setas, check,
   explosões e ícones animados do LottieFiles, para motion de verdade por cima do vídeo.
4. **PySceneDetect** (BSD-3): acha trocas de cena. Ajuda o "Converter para vertical" e o
   "Gerar clipes".
5. **MediaPipe** (Apache-2.0): rosto e corpo em tempo real, rápido na CPU. Serve para seguir o
   rosto no zoom e trocar o recorte da pessoa (ver licenças acima).
6. **Kokoro** (Apache-2.0): voz por IA em português, leve (roda na CPU).
7. **auto-editor** (Unlicense, domínio público): corta silêncio e trechos parados. Dá para usar
   ideias e até código.

### Prioridade sugerida
1. **Resolver licenças** (trocar o recorte da pessoa e a voz). Obrigatório antes de vender.
2. **Caixa "peça para a IA"** (ideia do OpenChatCut): "deixa o título maior", "tira o zoom do
   começo". Combina com a edição automática.
3. **Melhorar áudio** (DeepFilterNet) e **cortes mais precisos** (Silero VAD).
4. **Animações Lottie** para mais motion.
5. Os itens anteriores: preview leve e "Recortar trecho".
