#!/usr/bin/env node
/**
 * Nunca la cédula, también en lo binario, que `cedulas.py` no puede leer: las
 * tablas Parquet de `public/tablas/` (`scripts/build-grafo-tablas.mjs`), cada
 * texto leído con DuckDB, y el grafo compilado de `datos/grafo/`
 * (`scripts/build-grafo.mjs`), en brotli, que no se sirve como archivo pero
 * viaja en las funciones. Prueba cada texto con las formas de
 * `lib/padron.ts` y `scripts/privacidad.py` (con guiones, con rayas, tras la
 * palabra «cédula»). Imprime un hallazgo por archivo; nada si está limpio. Lo
 * corre `verificar.sh --completo`.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { DuckDBInstance } from "@duckdb/node-api";

const raiz = path.resolve(process.argv[2] ?? ".");
const dir = path.join(raiz, "public", "tablas");
const FORMAS = [
  /(?<!\d)(?<!\d-)\d{3}-\d{7}-\d(?![\d-])/,
  /(?<!\d)\d{3}[‐–]\d{7}[‐–]\d(?!\d)/,
  /(\bc[eé]d(?:ula)?\b\.?[^\d\t\n]{0,40}?)(\d{3}[ .‐–-]?\d{7}[ .‐–-]?\d)(?!\d)/i,
];

// El grafo compilado: cada fragmento, descomprimido, como un texto.
const grafo = path.join(raiz, "datos", "grafo");
let delGrafo = [];
try {
  delGrafo = readdirSync(grafo, { recursive: true }).filter((f) => /\.(br|json)$/.test(f));
} catch {}
for (const f of delGrafo.sort()) {
  const bytes = readFileSync(path.join(grafo, f));
  const texto = (f.endsWith(".br") ? brotliDecompressSync(bytes) : bytes).toString("utf8");
  const hallados = FORMAS.flatMap((r) => texto.match(new RegExp(r.source, `${r.flags}g`)) ?? []);
  if (hallados.length) console.log(`datos/grafo/${f}: ${hallados.length} · …${hallados[0].slice(0, 80)}…`);
}

let archivos = [];
try {
  archivos = readdirSync(dir).filter((f) => f.endsWith(".parquet"));
} catch {
  process.exit(0);
}
const c = await (await DuckDBInstance.create(":memory:")).connect();
for (const f of archivos) {
  const ruta = path.join(dir, f).replace(/'/g, "''");
  const lector = await c.runAndReadAll(`SELECT * FROM read_parquet('${ruta}')`);
  const hallados = [];
  for (const fila of lector.getRowsJson()) {
    for (const v of fila) {
      if (typeof v === "string" && /\d{7}/.test(v) && FORMAS.some((r) => r.test(v))) hallados.push(v);
    }
  }
  if (hallados.length) console.log(`public/tablas/${f}: ${hallados.length} · …${hallados[0].slice(0, 80)}…`);
}
