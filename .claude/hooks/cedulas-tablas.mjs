#!/usr/bin/env node
/**
 * Nunca la cédula, también en las tablas Parquet de `public/tablas/`
 * (`scripts/build-grafo-tablas.mjs`), que `cedulas.py` no puede leer: son
 * binarias. Lee cada texto con DuckDB y lo prueba con las formas de
 * `lib/padron.ts` y `scripts/privacidad.py` (con guiones, con rayas, tras la
 * palabra «cédula»). Imprime un hallazgo por tabla; nada si está limpio. Lo
 * corre `verificar.sh --completo`.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";

const raiz = path.resolve(process.argv[2] ?? ".");
const dir = path.join(raiz, "public", "tablas");
const FORMAS = [
  /(?<!\d)(?<!\d-)\d{3}-\d{7}-\d(?![\d-])/,
  /(?<!\d)\d{3}[‐–]\d{7}[‐–]\d(?!\d)/,
  /(\bc[eé]d(?:ula)?\b\.?[^\d\t\n]{0,40}?)(\d{3}[ .‐–-]?\d{7}[ .‐–-]?\d)(?!\d)/i,
];

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
