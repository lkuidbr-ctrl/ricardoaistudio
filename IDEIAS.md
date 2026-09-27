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
