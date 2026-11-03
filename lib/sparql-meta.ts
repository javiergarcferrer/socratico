import { ONTOLOGIA, W3ID } from "@/lib/rdf";
import { SITIO } from "@/lib/sitio";
import meta from "@/datos/sparql/meta.json";

/**
 * Lo que se sabe del punto SPARQL sin cargar su motor (docs/INFRAESTRUCTURA.md
 * §7.12): su dirección, los grafos con nombre de la ontología y de sus formas,
 * y de qué volcado sale (`datos/sparql/meta.json`, de `scripts/build-sparql.mjs`).
 * Lo leen el servidor MCP, VoID y el editor del banco: ninguno arrastra
 * Oxigraph ni la ontología.
 */

export const DIRECCION_SPARQL = `${SITIO}/sparql`;
/** El grafo con nombre de la ontología (los dos módulos, `soc:` y `do:`). */
export const GRAFO_ONTOLOGIA = ONTOLOGIA;
/** El grafo con nombre de las formas SHACL (`FORMAS` de `lib/ontologia.ts` sin la almohadilla; `lib/sparql.ts` lo comprueba). */
export const GRAFO_FORMAS = `${W3ID}/def/formas`;

export const VOLCADO_SPARQL = {
  generado: meta.generado,
  cuadruplos: meta.cuadruplos,
  porOmision: meta.porOmision,
  grafos: meta.grafos,
  sha256Origen: meta.sha256Origen,
};
