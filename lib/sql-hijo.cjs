"use strict";
/**
 * El proceso hijo de `/api/sql` (`lib/grafo-sql.ts`): tiene el motor DuckDB con
 * las tablas cargadas y corre las consultas que le manda el proceso de la
 * función. Vive aparte para que se le pueda matar: una función escalar de
 * DuckDB no se deja interrumpir (una cadena que se multiplica con `replace`
 * llegó a 9 GB y 104 s en la revisión) y una expresión constante se calcula al
 * preparar. El padre lo mata a los 10 s o si pasa del techo de memoria, y
 * arranca otro en la consulta siguiente.
 *
 * Argumentos: la ruta resuelta de `@duckdb/node-api`, el directorio de las
 * tablas y sus nombres en JSON. Mensajes: `{id, sql}` entra; sale
 * `{id, ok, columnas, tipos, filas}` o `{id, ok: false, error, estado}`.
 * Al arrancar manda `{listo: true}` o `{listo: false, error}`.
 */
const path = require("node:path");
const { DuckDBInstance } = require(process.argv[2]);

const DIR = process.argv[3];
const TABLAS = JSON.parse(process.argv[4]);
const TOPE_FILAS = 200;

/** Las funciones de tabla que se admiten en FROM: generan filas y nada más. */
const TABLAS_PERMITIDAS = new Set(["range", "generate_series", "unnest", "duckdb_tables", "duckdb_columns"]);
/**
 * Funciones que arman una cadena o una lista del tamaño que se les pida, con
 * un número. No es la defensa (hay otras formas de multiplicar, como un
 * `replace` dentro de otro): la defensa es que el padre mata al hijo; esto
 * evita llegar ahí con las obvias. `range` y `generate_series`, como listas,
 * no como tablas.
 */
const VETADAS = new Set(["repeat", "lpad", "rpad", "format", "printf", "bar", "bitstring", "list_resize", "array_resize", "range", "generate_series"]);
/** Una cadena literal más larga que esto no hace falta para consultar estas tablas. */
const TOPE_LITERAL = 500;

class ErrorDeConsulta extends Error {}

let inst = null;

async function arrancar() {
  inst = await DuckDBInstance.create(":memory:", {
    threads: "1",
    memory_limit: "512MB",
    autoinstall_known_extensions: "false",
    autoload_known_extensions: "false",
    allow_community_extensions: "false",
    home_directory: "/tmp",
  });
  const c = await inst.connect();
  try {
    for (const t of TABLAS) {
      await c.run(`CREATE TABLE ${t} AS SELECT * FROM read_parquet('${path.join(DIR, `${t}.parquet`).replace(/'/g, "''")}')`);
    }
    await c.run("SET enable_external_access = false");
    await c.run("SET lock_configuration = true");
  } finally {
    c.closeSync();
  }
}

/** Lee la consulta en su árbol (el analizador del motor) y la rechaza si pide algo que no se admite. */
async function revisar(c, sql) {
  const crudo = (await c.runAndReadAll("SELECT json_serialize_sql($1::VARCHAR)", [sql])).getRowsJson()[0]?.[0];
  const arbol = JSON.parse(String(crudo));
  if (arbol.error) {
    if (arbol.error_type === "not implemented") throw new ErrorDeConsulta("Solo consultas SELECT (o WITH … SELECT).");
    throw new ErrorDeConsulta(arbol.error_message || "La consulta no se pudo leer.");
  }
  if ((arbol.statements || []).length !== 1) throw new ErrorDeConsulta("Una sola consulta por llamada.");
  const recorrer = (x, deTabla) => {
    if (Array.isArray(x)) {
      for (const y of x) recorrer(y, false);
      return;
    }
    if (!x || typeof x !== "object") return;
    if (x.type === "TABLE_FUNCTION") {
      const nombre = String((x.function && x.function.function_name) || "").toLowerCase();
      if (!TABLAS_PERMITIDAS.has(nombre)) {
        throw new ErrorDeConsulta(`La función de tabla «${nombre}» no se admite: en FROM van las tablas, o ${[...TABLAS_PERMITIDAS].join(", ")}.`);
      }
      for (const [k, v] of Object.entries(x)) recorrer(v, k === "function");
      return;
    }
    if (typeof x.function_name === "string" && !deTabla && VETADAS.has(x.function_name.toLowerCase())) {
      throw new ErrorDeConsulta(`La función «${x.function_name.toLowerCase()}» no se admite aquí: arma cadenas o listas sin tope.`);
    }
    if (x.class === "CONSTANT" && x.value && typeof x.value.value === "string" && x.value.value.length > TOPE_LITERAL) {
      throw new ErrorDeConsulta(`Una cadena de la consulta pasa de ${TOPE_LITERAL} caracteres.`);
    }
    for (const v of Object.values(x)) recorrer(v, false);
  };
  recorrer(arbol.statements, false);
}

async function correr(sql) {
  const c = await inst.connect();
  try {
    await revisar(c, sql);
    let preparada;
    try {
      preparada = await c.prepare(sql);
    } catch (err) {
      throw new ErrorDeConsulta(String(err.message || err).split("\n")[0]);
    }
    // 1 es SELECT en el enum de DuckDB: la segunda llave, por si el árbol no la dijo.
    if (preparada.statementType !== 1) throw new ErrorDeConsulta("Solo consultas SELECT (o WITH … SELECT).");
    let lector;
    try {
      lector = await preparada.streamAndReadUntil(TOPE_FILAS + 1);
    } catch (err) {
      throw new ErrorDeConsulta(String(err.message || err).split("\n")[0]);
    }
    return {
      columnas: lector.columnNames(),
      tipos: lector.columnTypes().map((t) => t.toString()),
      filas: lector.getRowsJson(),
    };
  } finally {
    c.closeSync();
  }
}

process.on("message", async (m) => {
  if (!m || typeof m.sql !== "string") return;
  try {
    process.send({ id: m.id, ok: true, ...(await correr(m.sql)) });
  } catch (err) {
    const esDeConsulta = err instanceof ErrorDeConsulta;
    const mensaje = String((err && err.message) || err).split("\n")[0].slice(0, 300);
    process.send({ id: m.id, ok: false, estado: esDeConsulta || /Error:/.test(mensaje) ? 400 : 502, error: mensaje });
  }
});
// Muere con su padre.
process.on("disconnect", () => process.exit(0));

arrancar().then(
  () => process.send({ listo: true }),
  (err) => {
    process.send({ listo: false, error: String((err && err.message) || err) });
    process.exit(1);
  },
);
