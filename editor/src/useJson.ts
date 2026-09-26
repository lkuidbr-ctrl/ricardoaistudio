import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";

// Carrega um JSON de public/. Enquanto carrega devolve undefined;
// se o campo estiver vazio ou o arquivo falhar, devolve null.
export const useJson = <T,>(file: string): T | null | undefined => {
  const [data, setData] = useState<T | null | undefined>(undefined);
  const [handle] = useState(() => delayRender(`Carregando ${file || "(vazio)"}`));

  useEffect(() => {
    if (!file) {
      setData(null);
      continueRender(handle);
      return;
    }
    fetch(staticFile(file))
      .then((r) => {
        if (!r.ok) throw new Error(`Arquivo não encontrado: public/${file}`);
        return r.json();
      })
      .then((json: T) => setData(json))
      .catch((err) => {
        console.error(err);
        setData(null);
      })
      .finally(() => continueRender(handle));
  }, [file, handle]);

  return data;
};
