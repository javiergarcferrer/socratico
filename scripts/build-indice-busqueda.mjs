#!/usr/bin/env node
/**
 * Genera public/data/busqueda/indice.bin: el índice del buscador **ya
 * construido** —el índice por palabra y el corpus por columnas—, para que el
 * servidor no lea `corpus.json` ni arme nada en cada arranque en frío.
 *
 * Es la forma de `lib/busqueda-esquema.ts` (términos ordenados y, por
 * término, sus apariciones con campo y frecuencia; luego cada campo de las
 * entradas en su columna) escrita como binario: el servidor lo lee con un
 * `readFile` y vistas sobre el mismo búfer, sin `JSON.parse`. El índice de
 * Orama que lo precedió pesaba 27 MB de JSON y costaba ~1,3 s por arranque
 * (medido el 2026-09-27); el `JSON.parse` del corpus, ~0,65 s más (medido el
 * 2026-10-01). Esto se lee en decenas de milisegundos.
 *
 * La cabecera lleva la etiqueta del corpus (fecha, huella y número de
 * entradas) y el sha256 de `vectores.bin`: el gate (`verificar.sh`) compara
 * las dos con `corpus.json` y `vectores.bin`, y el servidor la de los
 * vectores al cargar.
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
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COLUMNAS_NUMERO,
  COLUMNAS_TEXTO,
  construirIndice,
  etiquetaCorpus,
  leerIndice,
  resolverFrases,
  serializarIndice,
} from "../lib/busqueda-esquema.ts";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "data", "busqueda");
const corpus = JSON.parse(readFileSync(path.join(DIR, "corpus.json"), "utf8"));
resolverFrases(corpus);

// El identificador de una ficha (el RPE de un proveedor, el código de un
// proceso) se busca por igualdad al abrirla (`resultadoPorHref` en
// lib/busqueda.ts), y su dirección lo lleva recortado.
const sinRecortar = corpus.docs.filter((d) => d.r !== undefined && d.r !== d.r.trim());
if (sinRecortar.length) {
  console.error(`${sinRecortar.length} entradas con «r» sin recortar, como ${JSON.stringify(sinRecortar[0].r)}`);
  process.exit(1);
}

let t = performance.now();
const ix = construirIndice(corpus.docs, corpus.origenes, etiquetaCorpus(corpus));
const msConstruir = performance.now() - t;

// Los vectores van con este corpus (los escribió el mismo build-busqueda.py):
// el índice guarda su huella, y el servidor no carga uno que no sea el suyo.
const vectores = readFileSync(path.join(DIR, "vectores.bin"));
if (vectores.length !== (corpus.vectorizados ?? corpus.docs.length) * (corpus.dimensiones + 4)) {
  console.error("vectores.bin no es de este corpus: vuelve a correr scripts/build-busqueda.py");
  process.exit(1);
}
const huellaVectores = createHash("sha256").update(vectores).digest("hex");
const bin = serializarIndice(ix, corpus, huellaVectores);
const destino = path.join(DIR, "indice.bin");
writeFileSync(destino, bin);
// El formato anterior (Orama en JSON), si quedara de otra versión.
rmSync(path.join(DIR, "indice.json.br"), { force: true });

// Lo que el servidor hará: leer y comprobar que es el mismo índice y el
// mismo corpus, campo por campo y entrada por entrada.
t = performance.now();
const { indice: leido, corpus: columnas } = leerIndice(readFileSync(destino));
const msLeer = performance.now() - t;
const fallos = [];
const igualIndice =
  leido.etiqueta === ix.etiqueta &&
  leido.terminos.length === ix.terminos.length &&
  leido.terminos.every((x, k) => x === ix.terminos[k]) &&
  ["inicio", "entrada", "campoFrecuencia", "largo"].every(
    (k) => leido[k].length === ix[k].length && leido[k].every((v, j) => v === ix[k][j]),
  );
if (!igualIndice) fallos.push("el índice por palabra");
for (const k of ["generado", "dimensiones", "piezas"]) if (columnas[k] !== corpus[k]) fallos.push(k);
if (columnas.huellaVectores !== huellaVectores) fallos.push("la huella de los vectores");
if (columnas.vectorizados !== (corpus.vectorizados ?? corpus.docs.length)) fallos.push("vectorizados");
if (columnas.entradas !== corpus.docs.length) fallos.push("entradas");
if (JSON.stringify(columnas.instantaneas) !== JSON.stringify(corpus.instantaneas)) fallos.push("instantaneas");
corpus.docs.forEach((d, i) => {
  for (const campo of COLUMNAS_TEXTO) {
    const esperado = campo === "o" && d.o !== undefined ? corpus.origenes[d.o] : d[campo];
    if (columnas.texto(campo, i) !== esperado) fallos.push(`«${campo}» de la entrada ${i}`);
  }
  for (const [campo, aridad] of Object.entries(COLUMNAS_NUMERO)) {
    const esperado = d[campo];
    const leidoAqui = aridad === 1 ? columnas.numero(campo, i) : columnas.cifras(campo, i);
    if (JSON.stringify(leidoAqui) !== JSON.stringify(esperado)) fallos.push(`«${campo}» de la entrada ${i}`);
  }
});
if (fallos.length) {
  console.error(`Lo leído no es lo que se escribió: ${fallos.slice(0, 5).join(", ")}${fallos.length > 5 ? ` y ${fallos.length - 5} más` : ""}`);
  process.exit(1);
}

console.error(
  `${corpus.docs.length} entradas · ${ix.terminos.length} términos · ${ix.entrada.length} apariciones · ` +
    `${(bin.length / 1e6).toFixed(2)} MB · construir ${Math.round(msConstruir)} ms, leer ${Math.round(msLeer)} ms`,
);
