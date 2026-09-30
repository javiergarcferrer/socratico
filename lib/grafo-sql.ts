import path from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { NOMBRES_TABLAS } from "@/lib/grafo-tablas";
import { sinCedula } from "@/lib/padron";

/**
 * SQL de solo lectura sobre las tablas del grafo (`lib/grafo-tablas.ts`), con
 * DuckDB embebido: ningún servidor que mantener. Las tablas se cargan en
 * memoria una vez por instancia desde sus archivos Parquet (~0,15 s, ~175 MB)
 * y después el motor se cierra al mundo (`enable_external_access = false`:
 * ni archivos, ni red, ni extensiones; `lock_configuration = true`: nadie lo
 * vuelve a abrir con un `SET`).
 *
 * Eso no basta, y una revisión lo mostró: una consulta SELECT puede llamar
 * funciones de tabla que cambian la instancia entera, que todos comparten
 * (`enable_logging` dejaba leer la consulta de los demás con `duckdb_logs()` y,
 * con la bitácora en un archivo, tumbaba el proceso en la consulta siguiente),
 * o correr SQL escondido en una cadena (`query('…')`); y una función que arma
 * una cadena (`repeat('x', 2000000000)`) no respeta el techo de memoria. Así
 * que, antes de preparar, la consulta se lee en su árbol (`json_serialize_sql`,
 * el analizador del propio motor, no una expresión regular):
 *
 *  - una sola sentencia, y SELECT (también `WITH … SELECT`);
 *  - de las funciones de tabla, solo las de `TABLAS_PERMITIDAS`;
 *  - ninguna de `VETADAS`: las que arman una cadena o una lista del tamaño que
 *    se les pida.
 *
 * Y al correr: a lo sumo `EN_CURSO` consultas a la vez por instancia (las
 * demás esperan su turno, y si esperan demasiado se les dice), 10 s cada una
 * contados desde que empieza (se interrumpe y se insiste hasta que para), 512
 * MB para sus operadores, un hilo, 200 filas leídas en flujo y ninguna celda
 * de más de 2 000 caracteres. Solo la usa `/api/sql`; el servidor MCP la llama
 * por HTTP para no cargar el motor (~70 MB) en su propia función.
 */

const DIR = path.join(process.cwd(), "public", "tablas");
export const TOPE_FILAS = 200;
const TOPE_MS = 10_000;
const TOPE_SQL = 8_000;
/** Lo que una respuesta puede pesar en texto: ~15 mil fichas de un asistente. */
const TOPE_CARACTERES = 60_000;
const TOPE_CELDA = 2_000;
/** Consultas a la vez por instancia: la piscina de libuv tiene cuatro hilos y leer archivos también los usa. */
const EN_CURSO = 2;
const TOPE_ESPERA_MS = 10_000;
const NUMERICO = /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|FLOAT|DOUBLE|DECIMAL)/;

/** Las funciones de tabla que se admiten en FROM: generan filas y nada más. */
const TABLAS_PERMITIDAS = new Set(["range", "generate_series", "unnest", "duckdb_tables", "duckdb_columns"]);
/**
 * Funciones que arman una cadena o una lista tan grande como se les pida, sin
 * que el techo de memoria del motor las pare. `range` y `generate_series`
 * están vetadas como funciones de lista, no como tablas (que se leen en flujo).
 */
const VETADAS = new Set(["repeat", "lpad", "rpad", "format", "printf", "bar", "list_resize", "array_resize", "range", "generate_series"]);

/** Un error de quien escribe la consulta (400) o un motor ocupado (503), con lo que hay que hacer. */
export class ErrorDeConsulta extends Error {
  constructor(
    message: string,
    readonly estado = 400,
  ) {
    super(message);
  }
}

export interface ResultadoSql {
  columnas: string[];
  filas: unknown[][];
  /** Hay más filas que las devueltas, o una celda se recortó: agrega, filtra o pon un LIMIT. */
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

/* ------------------------------------------------------------ los turnos */

let corriendo = 0;
const cola: (() => void)[] = [];

/** Espera un turno; si no llega en `TOPE_ESPERA_MS`, avisa que el motor está ocupado. */
function turno(): Promise<() => void> {
  const soltar = () => {
    corriendo--;
    cola.shift()?.();
  };
  if (corriendo < EN_CURSO) {
    corriendo++;
    return Promise.resolve(soltar);
  }
  return new Promise((resolver, rechazar) => {
    const entrar = () => {
      clearTimeout(reloj);
      corriendo++;
      resolver(soltar);
    };
    const reloj = setTimeout(() => {
      const i = cola.indexOf(entrar);
      if (i >= 0) cola.splice(i, 1);
      rechazar(new ErrorDeConsulta("El motor está ocupado con otras consultas: vuelve a intentar en unos segundos.", 503));
    }, TOPE_ESPERA_MS);
    cola.push(entrar);
  });
}

/* ------------------------------------------------------------- el árbol */

type Nodo = Record<string, unknown>;

/** Lee la consulta en su árbol y la rechaza si pide algo que no se admite. */
async function revisar(c: DuckDBConnection, sql: string): Promise<void> {
  const crudo = (await c.runAndReadAll("SELECT json_serialize_sql($1::VARCHAR)", [sql])).getRowsJson()[0]?.[0];
  const arbol = JSON.parse(String(crudo)) as { error?: boolean; error_type?: string; error_message?: string; statements?: Nodo[] };
  if (arbol.error) {
    if (arbol.error_type === "not implemented") throw new ErrorDeConsulta("Solo consultas SELECT (o WITH … SELECT).");
    throw new ErrorDeConsulta(recortar(arbol.error_message ?? "La consulta no se pudo leer."));
  }
  if ((arbol.statements?.length ?? 0) !== 1) throw new ErrorDeConsulta("Una sola consulta por llamada.");
  const recorrer = (x: unknown, deTabla: boolean): void => {
    if (Array.isArray(x)) {
      for (const y of x) recorrer(y, false);
      return;
    }
    if (!x || typeof x !== "object") return;
    const o = x as Nodo;
    if (o.type === "TABLE_FUNCTION") {
      const f = o.function as Nodo | undefined;
      const nombre = String(f?.function_name ?? "").toLowerCase();
      if (!TABLAS_PERMITIDAS.has(nombre)) {
        throw new ErrorDeConsulta(`La función de tabla «${nombre}» no se admite: en FROM van las tablas, o ${[...TABLAS_PERMITIDAS].join(", ")}.`);
      }
      for (const [k, v] of Object.entries(o)) recorrer(v, k === "function");
      return;
    }
    if (o.class === "FUNCTION" && !deTabla) {
      const nombre = String(o.function_name ?? "").toLowerCase();
      if (VETADAS.has(nombre)) throw new ErrorDeConsulta(`La función «${nombre}» no se admite aquí: arma cadenas o listas sin tope.`);
    }
    for (const v of Object.values(o)) recorrer(v, false);
  };
  recorrer(arbol.statements, false);
}

/* ---------------------------------------------------------------- correr */

/** Corre una consulta de solo lectura y devuelve a lo sumo `TOPE_FILAS` filas. */
export async function consultarSql(texto: string): Promise<ResultadoSql> {
  const sql = texto.trim().replace(/;\s*$/, "");
  if (!sql) throw new ErrorDeConsulta("La consulta está vacía.");
  if (sql.length > TOPE_SQL) throw new ErrorDeConsulta(`La consulta pasa de ${TOPE_SQL} caracteres.`);
  const inst = await motor();
  const soltar = await turno();
  const c = await inst.connect();
  let reloj: ReturnType<typeof setTimeout> | undefined;
  let insistir: ReturnType<typeof setInterval> | undefined;
  try {
    await revisar(c, sql);
    let preparada;
    try {
      preparada = await c.prepare(sql);
    } catch (err) {
      throw new ErrorDeConsulta(recortar(mensaje(err)));
    }
    // 1 es SELECT en el enum de DuckDB: la segunda llave, por si el árbol no la dijo.
    if (preparada.statementType !== 1) throw new ErrorDeConsulta("Solo consultas SELECT (o WITH … SELECT).");
    const t0 = performance.now();
    // El plazo cuenta desde que la consulta tiene turno. Una interrupción que
    // llega antes de que el motor empiece se pierde: se insiste hasta que pare.
    reloj = setTimeout(() => {
      c.interrupt();
      insistir = setInterval(() => c.interrupt(), 250);
    }, TOPE_MS);
    let lector;
    try {
      lector = await preparada.streamAndReadUntil(TOPE_FILAS + 1);
    } catch (err) {
      const m = mensaje(err);
      if (/interrupt/i.test(m)) throw new ErrorDeConsulta(`La consulta pasó de ${TOPE_MS / 1000} s y se detuvo: filtra antes de unir o agrega.`);
      throw new ErrorDeConsulta(recortar(m));
    }
    const columnas = lector.columnNames();
    const numericas = lector.columnTypes().map((t) => NUMERICO.test(t.toString()));
    const crudas = lector.getRowsJson();
    let truncada = crudas.length > TOPE_FILAS;
    let filas = crudas.slice(0, TOPE_FILAS).map((f) =>
      f.map((v, i) => {
        if (typeof v !== "string") return v;
        if (numericas[i] && /^-?\d+(\.\d+)?$/.test(v) && Math.abs(Number(v)) <= Number.MAX_SAFE_INTEGER) return Number(v);
        if (v.length > TOPE_CELDA) {
          truncada = true;
          return `${sinCedula(v.slice(0, TOPE_CELDA))}…`;
        }
        return sinCedula(v);
      }),
    );
    while (filas.length > 1 && JSON.stringify(filas).length > TOPE_CARACTERES) {
      filas = filas.slice(0, Math.floor(filas.length / 2));
      truncada = true;
    }
    return { columnas, filas, truncada, ms: Math.round(performance.now() - t0) };
  } finally {
    clearTimeout(reloj);
    clearInterval(insistir);
    c.closeSync();
    soltar();
  }
}

/** El mensaje de DuckDB sin la sugerencia larga que a veces añade. */
function mensaje(err: unknown): string {
  return String(err instanceof Error ? err.message : err).split("\n")[0];
}

const recortar = (s: string) => (s.length > 300 ? `${s.slice(0, 300)}…` : s);
