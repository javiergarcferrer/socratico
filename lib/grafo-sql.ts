import { fork, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NOMBRES_TABLAS } from "@/lib/grafo-tablas";
import { sinCedula } from "@/lib/padron";

/**
 * SQL de solo lectura sobre las tablas del grafo (`lib/grafo-tablas.ts`), con
 * DuckDB embebido: ningún servidor que mantener. El motor corre en un **proceso
 * hijo** (`lib/sql-hijo.cjs`) que tiene las tablas en memoria (se cargan de
 * sus Parquet al arrancar, ~0,3 s con el proceso) y se cierra al mundo
 * (`enable_external_access = false`, `lock_configuration = true`).
 *
 * Por qué un hijo: dos revisiones rompieron el motor desde un SELECT. Una
 * función de tabla cambiaba la instancia que todos comparten
 * (`enable_logging` dejaba leer la consulta de los demás y tumbaba el
 * proceso), y una cadena que se multiplica (`repeat`, o un `replace` dentro de
 * otro) llegó a 9 GB y 104 s: una función escalar de DuckDB no se deja
 * interrumpir, y una expresión constante se calcula al preparar, antes de
 * cualquier plazo. Así que:
 *
 *  - El hijo lee cada consulta en su árbol (`json_serialize_sql`) y rechaza lo
 *    que no es un SELECT, las funciones de tabla fuera de su lista y las que
 *    arman cadenas o listas del tamaño que se pida con un número.
 *  - El padre lo **mata** si una consulta pasa de 10 s (contados desde su
 *    turno, preparar incluido) o si el hijo pasa de 900 MB de memoria
 *    residente (mirado cada 100 ms en /proc), y arranca otro en la consulta
 *    siguiente. Con él caen las que corrían a la vez (a lo sumo dos), y se les
 *    dice. Un hijo que queda por encima de 600 MB tras una consulta se cambia
 *    en frío, sin nadie esperando.
 *  - A lo sumo dos consultas a la vez por instancia; las demás esperan hasta
 *    10 s y si no, un 503.
 *  - Sale a lo sumo 200 filas, ninguna celda de más de 2 000 caracteres (de
 *    cualquier tipo: una lista o una estructura también) y ninguna respuesta
 *    de más de 60 mil.
 *
 * Solo la usa `/api/sql`; el servidor MCP la llama por HTTP para no cargar el
 * motor (~70 MB) en su propia función.
 */

// El empaquetado deja `__non_webpack_require__.resolve` como `require.resolve`
// y el trazado lo sigue: así DuckDB y sus binarios viajan en la función, y el
// hijo lo requiere por esa ruta.
declare const __non_webpack_require__: NodeJS.Require;

const DIR = path.join(process.cwd(), "public", "tablas");
const HIJO = path.join(process.cwd(), "lib", "sql-hijo.cjs");
export const TOPE_FILAS = 200;
const TOPE_MS = 10_000;
const TOPE_SQL = 8_000;
const TOPE_MEMORIA_KB = 900 * 1024;
/**
 * Un hijo que terminó una consulta y quedó por encima de esto se cambia por
 * otro mientras nadie lo usa: la memoria de una consulta grande no siempre
 * vuelve al sistema, y si no, el vigía se la cobraría a la siguiente.
 */
const RECICLAR_KB = 600 * 1024;
/** Lo que una respuesta puede pesar en texto: ~15 mil fichas de un asistente. */
const TOPE_CARACTERES = 60_000;
const TOPE_CELDA = 2_000;
const EN_CURSO = 2;
const TOPE_ESPERA_MS = 10_000;
const NUMERICO = /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|FLOAT|DOUBLE|DECIMAL)/;

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
  /** Hay más filas que las devueltas, o una celda o la respuesta se recortaron: agrega, filtra o pon un LIMIT. */
  truncada: boolean;
  ms: number;
}

/* -------------------------------------------------------------- el hijo */

interface Respuesta {
  id?: number;
  ok?: boolean;
  listo?: boolean;
  error?: string;
  estado?: number;
  columnas?: string[];
  tipos?: string[];
  filas?: unknown[][];
}

interface Hijo {
  proceso: ChildProcess;
  listo: Promise<void>;
  pendientes: Map<number, { resolver: (r: Respuesta) => void; rechazar: (e: Error) => void }>;
  /** Por qué se lo mató, para decírselo a las consultas que caen con él. */
  motivo: string | null;
}

let hijo: Hijo | null = null;
let siguienteId = 1;

function memoriaKb(pid: number | undefined): number | null {
  if (!pid) return null;
  try {
    const m = /VmRSS:\s+(\d+)\s+kB/.exec(readFileSync(`/proc/${pid}/status`, "utf8"));
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

function arrancar(): Hijo {
  const proceso = fork(HIJO, [__non_webpack_require__.resolve("@duckdb/node-api"), DIR, JSON.stringify(NOMBRES_TABLAS)], {
    // Sin las variables de la función: el hijo no las necesita.
    env: { NODE_ENV: "production" },
    execArgv: ["--max-old-space-size=192"],
    serialization: "json",
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  const h: Hijo = { proceso, listo: Promise.resolve(), pendientes: new Map(), motivo: null };
  h.listo = new Promise<void>((resolver, rechazar) => {
    proceso.once("message", (m: Respuesta) => (m?.listo ? resolver() : rechazar(new Error(`el motor no arrancó: ${m?.error ?? "?"}`))));
    proceso.once("exit", () => rechazar(new Error("el motor salió al arrancar")));
  });
  h.listo.catch(() => {});
  proceso.on("message", (m: Respuesta) => {
    if (m?.id == null) return;
    h.pendientes.get(m.id)?.resolver(m);
    h.pendientes.delete(m.id);
  });
  const vigia = setInterval(() => {
    const kb = memoriaKb(proceso.pid);
    if (kb != null && kb > TOPE_MEMORIA_KB) matar(h, "pasó de la memoria permitida");
  }, 100);
  vigia.unref();
  proceso.once("exit", () => {
    clearInterval(vigia);
    const motivo = h.motivo ?? "el motor se detuvo";
    for (const p of h.pendientes.values()) {
      p.rechazar(
        new ErrorDeConsulta(`La consulta se detuvo porque ${motivo} (y con ella las que corrían a la vez): filtra antes de unir, agrega o pon un LIMIT, y no armes cadenas enormes.`),
      );
    }
    h.pendientes.clear();
    if (hijo === h) hijo = null;
  });
  return h;
}

function matar(h: Hijo, motivo: string) {
  if (h.motivo) return;
  h.motivo = motivo;
  h.proceso.kill("SIGKILL");
  if (hijo === h) hijo = null;
}

/* ------------------------------------------------------------ los turnos */

let corriendo = 0;
const cola: (() => void)[] = [];

/** Espera un turno; si no llega en `TOPE_ESPERA_MS`, avisa que el motor está ocupado. */
function turno(): Promise<() => void> {
  let suelto = false;
  const soltar = () => {
    if (suelto) return;
    suelto = true;
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

/* ---------------------------------------------------------------- correr */

/** Corre una consulta de solo lectura y devuelve a lo sumo `TOPE_FILAS` filas. */
export async function consultarSql(texto: string): Promise<ResultadoSql> {
  const sql = texto.trim().replace(/;\s*$/, "");
  if (!sql) throw new ErrorDeConsulta("La consulta está vacía.");
  if (sql.length > TOPE_SQL) throw new ErrorDeConsulta(`La consulta pasa de ${TOPE_SQL} caracteres.`);
  const soltar = await turno();
  let reloj: ReturnType<typeof setTimeout> | undefined;
  try {
    hijo ??= arrancar();
    const h = hijo;
    await h.listo;
    const t0 = performance.now();
    const id = siguienteId++;
    const r = await new Promise<Respuesta>((resolver, rechazar) => {
      h.pendientes.set(id, { resolver, rechazar });
      reloj = setTimeout(() => matar(h, `pasó de ${TOPE_MS / 1000} s`), TOPE_MS);
      h.proceso.send({ id, sql });
    });
    if (!r.ok) {
      if ((r.estado ?? 400) === 400) throw new ErrorDeConsulta(r.error ?? "La consulta no corrió.");
      throw new Error(`el motor: ${r.error ?? "?"}`);
    }
    return recortar(r, Math.round(performance.now() - t0));
  } finally {
    clearTimeout(reloj);
    const h = hijo;
    if (h && h.pendientes.size === 0 && (memoriaKb(h.proceso.pid) ?? 0) > RECICLAR_KB) matar(h, "se recicló");
    soltar();
  }
}

/** Números como números; ninguna celda de más de `TOPE_CELDA` caracteres; ninguna respuesta de más de `TOPE_CARACTERES`. */
function recortar(r: Respuesta, ms: number): ResultadoSql {
  const columnas = r.columnas ?? [];
  const numericas = (r.tipos ?? []).map((t) => NUMERICO.test(t));
  const crudas = r.filas ?? [];
  let truncada = crudas.length > TOPE_FILAS;
  let filas = crudas.slice(0, TOPE_FILAS).map((f) =>
    f.map((v, i) => {
      if (typeof v === "string" && numericas[i] && /^-?\d+(\.\d+)?$/.test(v) && Math.abs(Number(v)) <= Number.MAX_SAFE_INTEGER) {
        return Number(v);
      }
      if (v === null || typeof v === "number" || typeof v === "boolean") return v;
      // Una cadena, una lista o una estructura: si su texto pasa del tope, sale cortada como texto.
      const texto = typeof v === "string" ? v : JSON.stringify(v);
      if (texto.length > TOPE_CELDA) {
        truncada = true;
        return `${sinCedula(texto.slice(0, TOPE_CELDA))}…`;
      }
      if (typeof v === "string") return sinCedula(v);
      const limpio = sinCedula(texto);
      if (limpio === texto) return v;
      try {
        return JSON.parse(limpio);
      } catch {
        return limpio;
      }
    }),
  );
  while (filas.length > 1 && JSON.stringify(filas).length > TOPE_CARACTERES) {
    filas = filas.slice(0, Math.floor(filas.length / 2));
    truncada = true;
  }
  // Una sola fila muy ancha: se vacían celdas desde la derecha.
  const fila = filas[0];
  for (let k = (fila?.length ?? 0) - 1; k > 0 && JSON.stringify(filas).length > TOPE_CARACTERES; k--) {
    fila[k] = null;
    truncada = true;
  }
  return { columnas, filas, truncada, ms };
}
