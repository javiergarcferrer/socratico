/**
 * Lo que la sección Ontología pregunta a `/sparql`: los términos de la
 * ontología como IRI y la ruta de la ficha de un IRI de la plataforma.
 */
import { SITIO } from "@/lib/sitio";
import { nodoDeRuta } from "@/lib/grafo";
import type { CeldaSparql } from "@/lib/consultas";

const PREFIJOS: Record<string, string> = {
  soc: "https://w3id.org/socratico/def/core#",
  do: "https://w3id.org/socratico/def/do#",
  skos: "http://www.w3.org/2004/02/skos/core#",
};
export const iriDe = (curie: string) => {
  const [p, local] = curie.split(":");
  return PREFIJOS[p] ? `<${PREFIJOS[p]}${local}>` : null;
};

/** La ruta de la ficha de un IRI de la plataforma, si es un nodo que el banco abre. */
export function rutaDe(c: CeldaSparql | undefined): string | null {
  if (c?.type !== "uri" || !c.value.startsWith(`${SITIO}/`)) return null;
  const ruta = c.value.slice(SITIO.length).split("#")[0];
  return nodoDeRuta(ruta) ? ruta : null;
}

