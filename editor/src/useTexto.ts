import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";

// Carrega um arquivo de texto de public/ (ex.: um LUT .cube). Enquanto carrega devolve undefined;
// se o campo estiver vazio ou o arquivo falhar, devolve null (o vídeo segue sem o efeito).
export const useTexto = (file: string): string | null | undefined => {
  const [texto, setTexto] = useState<string | null | undefined>(file ? undefined : null);

  useEffect(() => {
    if (!file) {
      setTexto(null);
      return;
    }
    const espera = delayRender(`Carregando ${file}`);
    let vivo = true;
    fetch(staticFile(file))
      .then((r) => {
        if (!r.ok) throw new Error(`Arquivo não encontrado: public/${file}`);
        return r.text();
      })
      .then((t) => vivo && setTexto(t))
      .catch((err) => {
        console.error(err);
        if (vivo) setTexto(null);
      })
      .finally(() => continueRender(espera));
    return () => {
      vivo = false;
    };
  }, [file]);

  return texto;
};
