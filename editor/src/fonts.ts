import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Fontes ficam em public/fonts (licença OFL) para funcionar offline e renderizar
// sem depender do Google Fonts.
const load = (family: string, file: string, weight = "400") => {
  loadFont({ family, url: staticFile(`fonts/${file}`), weight, format: "woff2" }).catch((err) =>
    console.error(`Falha ao carregar ${file}`, err),
  );
  return family;
};

export const anton = load("Anton", "Anton-400.woff2");
export const bebas = load("Bebas Neue", "BebasNeue-400.woff2");
export const montserrat = load("Montserrat", "Montserrat-900.woff2", "900");
export const poppins = load("Poppins", "Poppins-600.woff2", "600");
load("Poppins", "Poppins-800.woff2", "800");
