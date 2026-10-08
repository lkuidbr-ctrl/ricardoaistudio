# Como editar os vídeos deste projeto

Este projeto já é o editor (Remotion + Whisper + scripts em Python). **Não crie outro projeto
Remotion e não use o template TikTok:** use o que está aqui. O app visual fica em `app/` e a
composição em `src/` (`ShortVideo.tsx` é a principal; os ajustes dela estão em `src/schema.ts`).

## Onde ficam as coisas
- O vídeo bruto vai em `public/` (nome sem espaço e sem acento). O MP4 final sai em `out/`.
- Cada vídeo tem arquivos irmãos em `public/`: `*.captions.json`, `*.cuts.json`, `*.cor.json`,
  `*.person.webm`, `*.config.json` (ajustes salvos). O vídeo original nunca é alterado.
- LUTs de cor (`.cube`) ficam em `public/luts/`; fontes em `public/fonts/`; efeitos sonoros em `public/sfx/`.
- Marca (cores, fonte, logo, @, tela final): `public/marca.json`. Modelo em `exemplos/marca.json`.

## Formato
- Vertical, 1080 x 1920, 30 quadros por segundo.
- iPhone grava em HEVC: converter para H.264 antes (o app já faz isso ao receber o arquivo; por
  script, `ffmpeg -i entrada.mov -c:v libx264 -pix_fmt yuv420p -c:a aac saida.mp4`).

## Como fazer cada pedido (use os scripts, não reescreva a lógica)
Rodar de dentro de `editor/`, na ordem:
1. Legenda: `python scripts/transcribe.py public/X.mp4 --model medium` (português é o padrão).
   Depois liste as palavras em que a transcrição parece ter errado, com o segundo de cada uma.
2. Cortar silêncios: `python scripts/cut.py public/X.mp4 --max-silence 600 --pad 150`
   (pausas acima de 0,6 s saem, com 0,15 s de respiro). Antes de cortar, mostre a lista de pausas.
3. Cor: `python scripts/cor.py public/X.mp4` (correção automática) e/ou um look de LUT.
   Sem LUT próprio, `python scripts/lut.py gerar` cria os looks prontos (cinema, quente, frio,
   vibrante, suave) em `public/luts/`; escolha com `"lut": "luts/cinema.cube"` nos ajustes
   (ou no app: Efeitos > Cor > Look). Mostre um quadro antes e depois.
4. Áudio: `python scripts/audio.py public/X.mp4` (tira ruído e acerta o volume).
5. Título, textos, animações, zoom, B-roll, música e efeitos sonoros: são ajustes do `ShortVideo`
   (ver `src/schema.ts`); mude o `*.config.json` do vídeo ou use o app.
6. Marca: edite `public/marca.json`; vale para todos os vídeos.

## Regras
- **Render com LUT precisa de WebGL:** `remotion.config.ts` já usa `angle`. Em servidor sem placa
  de vídeo, rode com `--gl=swangle`.
- Para renderizar: `npx remotion render ShortVideo out/NOME.mp4 --props=ARQUIVO.json`.
  Para conferir antes: `npm run studio` (Remotion Studio) ou `npm run app` (app visual, porta 3210).
- Antes de cada mudança grande, salve uma versão no Git (commit) com uma frase do que mudou.
- Rode `npm run typecheck` antes de dar uma mudança de código por pronta.
- **Nunca publique nada.** Mostre o resultado e espere o ok antes de renderizar a versão final.
- A legenda em português erra nome próprio, número e gíria: sempre peça revisão.
- Siga as skills em `.claude/skills/` (Remotion) para qualquer código novo de composição.

## Marca (preencher uma vez)
- Fonte: [nome da fonte] (arquivo em `public/fonts/`).
- Cor do texto: [#FFFFFF]. Cor de destaque: [#FFE600].
- Logo: `public/[logo.png]`, canto de cima à direita, 80% de opacidade.
- Look (LUT) padrão: [luts/cinema.cube, ou "nenhum"].
