/**
 * Leer y escribir los dos archivos comprimidos del buscador
 * (`ARCHIVO_INDICE` y `ARCHIVO_CORPUS` de `lib/busqueda-esquema.ts`;
 * docs/INFRAESTRUCTURA.md §8.1), en un solo sitio para los scripts que los
 * tocan: `build-indice-busqueda.mjs`, `busqueda-grafo.mjs`, `eval-mcp.mjs`,
 * `probar-pantallas.mjs`. El servidor lee el índice en `lib/busqueda.ts`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { brotliCompressSync, brotliDecompressSync, constants, gunzipSync } from "node:zlib";
import { ARCHIVO_CORPUS, ARCHIVO_INDICE } from "../lib/busqueda-esquema.ts";

export const DIR_BUSQUEDA = (raiz) => path.join(raiz, "public", "data", "busqueda");
export const rutaCorpus = (raiz) => path.join(DIR_BUSQUEDA(raiz), ARCHIVO_CORPUS);
export const rutaIndice = (raiz) => path.join(DIR_BUSQUEDA(raiz), ARCHIVO_INDICE);

/** El corpus entero, ya parseado. */
export function leerCorpus(raiz) {
  return JSON.parse(gunzipSync(readFileSync(rutaCorpus(raiz))).toString("utf8"));
}

/** Los bytes del índice, descomprimidos (lo que lee `leerIndice`). */
export function leerIndiceCrudo(raiz) {
  return brotliDecompressSync(readFileSync(rutaIndice(raiz)));
}

/**
 * El índice comprimido. Calidad 9 con ventana de 16 MB: 74 → 13 MB en ~13 s;
 * la 11 gana poco y tarda minutos. La misma entrada da los mismos bytes.
 */
export function comprimirIndice(bin) {
  return brotliCompressSync(bin, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 9,
      [constants.BROTLI_PARAM_LGWIN]: 24,
      [constants.BROTLI_PARAM_SIZE_HINT]: bin.length,
    },
  });
}
