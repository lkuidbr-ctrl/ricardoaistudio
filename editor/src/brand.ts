import { loadFont } from "@remotion/fonts";
import { useMemo } from "react";
import { staticFile } from "remotion";
import { z } from "zod";
import { montserrat } from "./fonts";
import { useJson } from "./useJson";

// Formato do public/marca.json (veja exemplos/marca.json). Todos os campos são opcionais.
export const brandSchema = z.object({
  arroba: z.string().default(""),
  corPrincipal: z.string().default("#FFE600"), // destaques, gancho, barra, botão
  corTexto: z.string().default("#FFFFFF"),
  corFundo: z.string().default("#111111"), // fundo do card final
  fonte: z.string().default(""), // arquivo .woff2/.ttf em public/, ex.: "fonts/MinhaFonte.woff2"
  logo: z.string().default(""), // imagem em public/, ex.: "logo.png"
  marcaDagua: z.enum(["logo", "arroba", "nenhuma"]).default("logo"),
  posicao: z.enum(["topo-esquerda", "topo-direita", "baixo-esquerda", "baixo-direita"]).default("topo-direita"),
  barraProgresso: z.boolean().default(true),
  cta: z
    .object({
      texto: z.string().default("Segue pra mais"),
      botao: z.string().default("Seguir"),
      duracaoMs: z.number().default(2500),
    })
    .default({ texto: "Segue pra mais", botao: "Seguir", duracaoMs: 2500 }),
});

export type Brand = z.infer<typeof brandSchema> & { fontFamily: string };

// Carrega e valida o arquivo da marca. null = sem marca (ou arquivo inválido).
export const useBrand = (file: string): Brand | null | undefined => {
  const raw = useJson<unknown>(file);
  return useMemo(() => {
    if (raw === undefined || raw === null) return raw;
    const parsed = brandSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(`public/${file} inválido:`, parsed.error.issues);
      return null;
    }
    const b = parsed.data;
    let fontFamily = montserrat;
    if (b.fonte) {
      fontFamily = "Marca";
      // O @remotion/fonts segura a renderização até a fonte carregar.
      loadFont({ family: "Marca", url: staticFile(b.fonte) }).catch((err) =>
        console.error(`Falha ao carregar a fonte ${b.fonte}`, err),
      );
    }
    return { ...b, fontFamily };
  }, [raw, file]);
};
