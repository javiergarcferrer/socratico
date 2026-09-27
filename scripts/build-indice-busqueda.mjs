#!/usr/bin/env node
/**
 * Genera public/data/busqueda/indice.bin: el índice por palabra del buscador
 * **ya construido**, para que el servidor no lo arme en cada arranque en frío.
 *
 * Es el índice invertido propio de `lib/busqueda-esquema.ts` (términos
 * ordenados y, por término, sus apariciones con campo y frecuencia) escrito
 * como binario: el servidor lo lee con un `readFile` y vistas sobre el mismo
 * búfer, sin `JSON.parse` ni reconstruir árboles. El índice de Orama que lo
 * precedió pesaba 27 MB de JSON y costaba ~1,3 s por arranque (medido el
 * 2026-09-27); este se lee en decenas de milisegundos.
 *
 * La cabecera lleva la etiqueta del corpus (fecha, huella y número de
 * entradas): si alguien regenera el corpus y no esto, el servidor no la
 * reconoce y construye el índice en memoria, más lento pero igual.
 *
 * El corte de palabras, las vacías y el lematizador vienen de
 * `lib/busqueda-esquema.ts`, el mismo módulo que usa el servidor: si
 * discreparan, las raíces guardadas no serían las de la consulta.
 *
 * Se corre **después** de `python3 scripts/build-busqueda.py`. Sin red.
 *
 * Uso:
 *     node --no-warnings scripts/build-indice-busqueda.mjs
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { construirIndice, etiquetaCorpus, leerIndice, resolverFrases, serializarIndice } from "../lib/busqueda-esquema.ts";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "data", "busqueda");
const corpus = JSON.parse(readFileSync(path.join(DIR, "corpus.json"), "utf8"));
resolverFrases(corpus);

let t = performance.now();
const ix = construirIndice(corpus.docs, corpus.origenes, etiquetaCorpus(corpus));
const msConstruir = performance.now() - t;

const bin = serializarIndice(ix);
const destino = path.join(DIR, "indice.bin");
writeFileSync(destino, bin);
// El formato anterior (Orama en JSON), si quedara de otra versión.
rmSync(path.join(DIR, "indice.json.br"), { force: true });

// Lo que el servidor hará: leer y comprobar que es el mismo índice.
t = performance.now();
const leido = leerIndice(readFileSync(destino));
const msLeer = performance.now() - t;
const iguales =
  leido.etiqueta === ix.etiqueta &&
  leido.terminos.length === ix.terminos.length &&
  leido.terminos.every((x, k) => x === ix.terminos[k]) &&
  ["inicio", "entrada", "campoFrecuencia", "largo"].every(
    (k) => leido[k].length === ix[k].length && leido[k].every((v, j) => v === ix[k][j]),
  );
if (!iguales) {
  console.error("El índice leído no es el que se escribió");
  process.exit(1);
}

console.error(
  `${corpus.docs.length} entradas · ${ix.terminos.length} términos · ${ix.entrada.length} apariciones · ` +
    `${(bin.length / 1e6).toFixed(2)} MB · construir ${Math.round(msConstruir)} ms, leer ${Math.round(msLeer)} ms`,
);
