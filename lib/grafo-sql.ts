import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { NOMBRES_TABLAS } from "@/lib/grafo-tablas";
import { sinCedula } from "@/lib/padron";

/**
 * SQL de solo lectura sobre las tablas del grafo (`lib/grafo-tablas.ts`), con
 * DuckDB embebido: ningún servidor que mantener. Las tablas se cargan en
 * memoria una vez por instancia desde sus archivos Parquet (~0,15 s, ~175 MB)
 * y después el motor se cierra al mundo:
 *
 *  - `enable_external_access = false`: ni archivos, ni red, ni extensiones;
 *    `lock_configuration = true`: nadie lo vuelve a abrir con un `SET`.
 *  - Una sola sentencia y solo `SELECT` (también `WITH … SELECT`): lo mira el
 *    motor al preparar la consulta, no una expresión regular.
 *  - Un hilo, 512 MB de memoria, 10 s por consulta (se interrumpe) y a lo sumo
 *    200 filas devueltas: la consulta se lee en flujo y se deja de leer ahí.
 *
 * Probado el 30-09-2026 contra `getenv`, `read_csv('/etc/passwd')`, `COPY … TO`,
 * `ATTACH`, `INSTALL`/`LOAD`, una URL remota, `glob('/*')` y `SET`: los
 * rechaza todos. Solo la usa `/api/sql`; el servidor MCP la llama por HTTP
 * para no cargar el motor (~70 MB) en su propia función.
 */

const DIR = path.join(process.cwd(), "public", "tablas");
export const TOPE_FILAS = 200;
const TOPE_MS = 10_000;
const TOPE_SQL = 8_000;
/** Lo que una respuesta puede pesar en texto: ~15 mil fichas de un asistente. */
const TOPE_CARACTERES = 60_000;
const NUMERICO = /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|FLOAT|DOUBLE|DECIMAL)/;

/** Un error de quien escribe la consulta (400), con lo que tiene que cambiar. */
export class ErrorDeConsulta extends Error {}

export interface ResultadoSql {
  columnas: string[];
  filas: unknown[][];
  /** Hay más filas que las devueltas: agrega, filtra o pon un LIMIT. */
  truncada: boolean;
  ms: number;
}

let memo: Promise<DuckDBInstance> | null = null;

function motor(): Promise<DuckDBInstance> {
  memo ??= (async () => {
    const inst = await DuckDBInstance.create(":memory:", {
      threads: "1",
      memory_limit: "512MB",
      autoinstall_known_extensions: "false",
      autoload_known_extensions: "false",
      allow_community_extensions: "false",
      // El directorio de trabajo de una función es de solo lectura.
      home_directory: "/tmp",
    });
    const c = await inst.connect();
    try {
      for (const t of NOMBRES_TABLAS) {
        await c.run(`CREATE TABLE ${t} AS SELECT * FROM read_parquet('${path.join(DIR, `${t}.parquet`).replace(/'/g, "''")}')`);
      }
      await c.run("SET enable_external_access = false");
      await c.run("SET lock_configuration = true");
    } finally {
      c.closeSync();
    }
    return inst;
  })().catch((err) => {
    memo = null;
    throw err;
  });
  return memo;
}

/** Corre una consulta de solo lectura y devuelve a lo sumo `TOPE_FILAS` filas. */
export async function consultarSql(texto: string): Promise<ResultadoSql> {
  const sql = texto.trim().replace(/;\s*$/, "");
  if (!sql) throw new ErrorDeConsulta("La consulta está vacía.");
  if (sql.length > TOPE_SQL) throw new ErrorDeConsulta(`La consulta pasa de ${TOPE_SQL} caracteres.`);
  const inst = await motor();
  const c = await inst.connect();
  const t0 = performance.now();
  const reloj = setTimeout(() => c.interrupt(), TOPE_MS);
  try {
    let preparada;
    try {
      const sentencias = await c.extractStatements(sql);
      if (sentencias.count !== 1) throw new ErrorDeConsulta("Una sola consulta por llamada.");
      preparada = await sentencias.prepare(0);
    } catch (err) {
      if (err instanceof ErrorDeConsulta) throw err;
      throw new ErrorDeConsulta(mensaje(err));
    }
    // 1 es SELECT en el enum de DuckDB (también `WITH … SELECT`); EXPLAIN,
    // PRAGMA, SET, COPY, CREATE, INSERT… son otros.
    if (preparada.statementType !== 1) throw new ErrorDeConsulta("Solo consultas SELECT (o WITH … SELECT).");
    let lector;
    try {
      lector = await preparada.streamAndReadUntil(TOPE_FILAS + 1);
    } catch (err) {
      const m = mensaje(err);
      if (/interrupt/i.test(m)) throw new ErrorDeConsulta(`La consulta pasó de ${TOPE_MS / 1000} s y se detuvo: filtra antes de unir o agrega.`);
      throw new ErrorDeConsulta(m);
    }
    const columnas = lector.columnNames();
    const numericas = lector.columnTypes().map((t) => NUMERICO.test(t.toString()));
    const crudas = lector.getRowsJson();
    let filas = crudas.slice(0, TOPE_FILAS).map((f) =>
      f.map((v, i) => {
        if (typeof v === "string") {
          if (numericas[i] && /^-?\d+(\.\d+)?$/.test(v) && Math.abs(Number(v)) <= Number.MAX_SAFE_INTEGER) return Number(v);
          return sinCedula(v);
        }
        return v;
      }),
    );
    let truncada = crudas.length > TOPE_FILAS;
    while (filas.length > 1 && JSON.stringify(filas).length > TOPE_CARACTERES) {
      filas = filas.slice(0, Math.floor(filas.length / 2));
      truncada = true;
    }
    return { columnas, filas, truncada, ms: Math.round(performance.now() - t0) };
  } finally {
    clearTimeout(reloj);
    c.closeSync();
  }
}

/** El mensaje de DuckDB sin la sugerencia larga que a veces añade. */
function mensaje(err: unknown): string {
  return String(err instanceof Error ? err.message : err)
    .split("\n")[0]
    .slice(0, 300);
}
