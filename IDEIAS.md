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
