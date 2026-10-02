import { Fragment } from "react";
import { lematizar, PALABRAS_VACIAS } from "@/lib/raiz";

/**
 * Un título con las palabras de la búsqueda marcadas: el ojo ve **por qué**
 * salió esa fila sin leerla entera (docs/INFRAESTRUCTURA.md §11, reconocer y no
 * recordar).
 *
 * Marca por raíz, con el mismo lematizador del español que usa el índice
 * (`lib/raiz.ts`): quien busca «escuelas» ve marcada «ESCUELA», y quien
 * busca «educacion», «Educación». Una palabra vacía —«de», «la»— no se
 * marca. Una fila que salió solo por tema puede llevar alguna de las
 * palabras, y esa se marca; el aviso «Por tema» dice al lado que no las lleva
 * todas.
 *
 * Solo en el servidor: el lematizador no viaja al navegador.
 */

const VACIAS = new Set(PALABRAS_VACIAS);
const PALABRA = /[\p{L}\p{N}]+/gu;

function raiz(palabra: string): string {
  const baja = palabra.toLowerCase();
  if (VACIAS.has(baja)) return "";
  return lematizar(baja);
}

export function Resaltado({ texto, consulta }: { texto: string; consulta: string }) {
  const buscadas = new Set(
    (consulta.match(PALABRA) ?? []).map(raiz).filter((r) => r.length >= 2),
  );
  if (buscadas.size === 0) return <>{texto}</>;

  const trozos: React.ReactNode[] = [];
  let desde = 0;
  for (const m of texto.matchAll(PALABRA)) {
    if (!buscadas.has(raiz(m[0]))) continue;
    const i = m.index ?? 0;
    if (i > desde) trozos.push(<Fragment key={`t${desde}`}>{texto.slice(desde, i)}</Fragment>);
    trozos.push(
      // Negrita y no un fondo de color: el ocre dice «plazo» y el
      // azul «se pulsa»; lo encontrado no es ninguna de las dos cosas.
      <mark key={`m${i}`} className="bg-transparent font-semibold text-inherit">
        {m[0]}
      </mark>,
    );
    desde = i + m[0].length;
  }
  if (desde === 0) return <>{texto}</>;
  if (desde < texto.length) trozos.push(<Fragment key={`t${desde}`}>{texto.slice(desde)}</Fragment>);
  return <>{trozos}</>;
}
