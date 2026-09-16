# ricardoaistudio

CLI para gerar imagens a partir de texto usando a [fal.ai](https://fal.ai) (modelo FLUX).

## Uso

1. Instale as dependências:
   ```
   npm install
   ```
2. Defina sua chave da fal.ai em um arquivo `.env` (veja `.env.example`):
   ```
   FAL_KEY=sua-chave-aqui
   ```
3. Gere imagens:
   ```
   node bin/generate.js "um gato astronauta, estilo aquarela" --out output --count 2
   ```

As imagens geradas são salvas na pasta `output/` (ignorada pelo git).

