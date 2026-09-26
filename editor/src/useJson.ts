import { useEffect, useRef, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";

// Carrega um JSON de public/. Enquanto carrega devolve undefined;
// se o campo estiver vazio ou o arquivo falhar, devolve null.
export const useJson = <T,>(file: string): T | null | undefined => {
  const [data, setData] = useState<T | null | undefined>(undefined);
  // O primeiro carregamento segura a renderização desde o início; os seguintes
  // (quando o arquivo muda no preview do app) pedem uma espera nova.
  const [primeiraEspera] = useState(() => delayRender(`Carregando ${file || "(vazio)"}`));
  const primeira = useRef(true);

  useEffect(() => {
    const espera = primeira.current ? primeiraEspera : delayRender(`Carregando ${file || "(vazio)"}`);
    primeira.current = false;
    let vivo = true;
    if (!file) {
      setData(null);
      continueRender(espera);
      return;
    }
    fetch(staticFile(file))
      .then((r) => {
        if (!r.ok) throw new Error(`Arquivo não encontrado: public/${file}`);
        return r.json();
      })
      .then((json: T) => vivo && setData(json))
      .catch((err) => {
        console.error(err);
        if (vivo) setData(null);
      })
      .finally(() => continueRender(espera));
    return () => {
      vivo = false;
    };
  }, [file, primeiraEspera]);

  return data;
};
