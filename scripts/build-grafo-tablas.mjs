#!/usr/bin/env node
/**
 * Genera public/tablas/: el grafo sin personas naturales y los
 * procesos de compra, en tablas Parquet con tipos, para consultarlas en SQL
 * (la herramienta `query` del servidor MCP, por `/api/sql`) o bajarlas y
 * abrirlas en DuckDB, pandas, Polars o una hoja de cálculo.
 *
 * De dónde sale cada tabla:
 *  - Del volcado del grafo (`grafo.nt.gz`, de `scripts/build-grafo-volcado.mjs`):
 *    instituciones, proveedores, empresas, contrataciones, medidas,
 *    financieras, provincias y equivalencias. Las mismas reglas que el
 *    volcado: ninguna persona natural, ningún proveedor que no esté atado a
 *    una empresa por su RNC.
 *  - De `historico/` (`scripts/build-historico.py`): los totales desde 2015 de
 *    cada institución y cada proveedor, que el grafo no trae (el grafo guarda
 *    solo los pares mayores: los 12 mayores proveedores de cada institución y
 *    los 8 mayores clientes de cada empresa).
 *  - De `procesos.json` (`scripts/build-procesos.py`): los procesos de compra
 *    de los últimos doce meses.
 *
 * Ninguna tabla guarda una cédula: los textos pasan por las formas de
 * `lib/padron.ts` (`sinCedula`) y, antes de escribir, se comprueba que no
 * quede ninguna; si queda, no se escribe nada.
 *
 * Qué tablas hay, sus columnas, sus tipos y sus descripciones no se escriben
 * aquí: salen de la ontología (`TABLAS` en `lib/ontologia-esquemas.ts`), donde
 * cada columna dice qué propiedad guarda. Cada fila se valida con el esquema
 * zod de su tabla antes de escribirse; si una no cabe, no se escribe nada.
 *
 * Se corre después del volcado. `meta.json` guarda, por tabla, sus columnas
 * con su descripción, su tipo y su propiedad, su fuente, su corte y sus filas:
 * de ahí lee el servidor lo que le explica al asistente.
 *
 * Uso: node scripts/build-grafo-tablas.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { Parser } from "n3";
import { DuckDBInstance } from "@duckdb/node-api";
import { registrarTs } from "./cargador-ts.mjs";

registrarTs();

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATOS = path.join(RAIZ, "public", "data");
// Fuera de public/data: las funciones que leen instantáneas por nombre variable
// arrastran public/data entero, y estas tablas solo las lee `/api/sql`.
const SALIDA = path.join(RAIZ, "public", "tablas");
const leer = (ruta) => JSON.parse(readFileSync(path.join(DATOS, ruta), "utf8"));
const SITIO = /SITIO = "([^"]+)"/.exec(readFileSync(path.join(RAIZ, "lib", "sitio.ts"), "utf8"))[1];
process.chdir(RAIZ);
// Las tablas, sus columnas y sus tipos: de la ontología.
const ESQ = await import(pathToFileURL(path.join(RAIZ, "lib", "ontologia-esquemas.ts")).href);

const P = {
  tipo: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
  etiqueta: "http://www.w3.org/2000/01/rdf-schema#label",
  nombre: "http://schema.org/name",
  razonSocial: "http://schema.org/legalName",
  alterno: "http://schema.org/alternateName",
  descripcion: "http://schema.org/description",
  dctDescripcion: "http://purl.org/dc/terms/description",
  pagina: "http://xmlns.com/foaf/0.1/page",
  mismo: "http://www.w3.org/2002/07/owl#sameAs",
};
// Los espacios de nombres de la ontología (lib/rdf.ts): el núcleo y el módulo dominicano.
const W3ID = /W3ID = "([^"]+)"/.exec(readFileSync(path.join(RAIZ, "lib", "rdf.ts"), "utf8"))[1];
const SOC = `${W3ID}/def/core#`;
const DO = `${W3ID}/def/do#`;

/* ------------------------------------------------------------ la cédula */

// Las formas de lib/padron.ts y scripts/privacidad.py.
const GUIONES = /(?<!\d)(?<!\d-)\d{3}-\d{7}-\d(?![\d-])/g;
const RAYAS = /(?<!\d)\d{3}[\u2010\u2013]\d{7}[\u2010\u2013]\d(?!\d)/g;
const NOMBRADA = /(\bc[eé]d(?:ula)?\b\.?[^\d\t\n]{0,40}?)(\d{3}[ .\u2010\u2013-]?\d{7}[ .\u2010\u2013-]?\d)(?!\d)/gi;
function sinCedula(t) {
  if (typeof t !== "string" || !/\d{7}/.test(t)) return t;
  const marca = t === t.toLocaleUpperCase("es") ? "[OMITIDA]" : "[omitida]";
  return t.replace(NOMBRADA, (_, antes) => `${antes}${marca}`).replace(GUIONES, marca).replace(RAYAS, marca);
}
const llevaCedula = (t) => typeof t === "string" && [GUIONES, RAYAS, NOMBRADA].some((r) => ((r.lastIndex = 0), r.test(t)));

/* ------------------------------------------------------------- el grafo */

const nt = gunzipSync(readFileSync(path.join(DATOS, "grafo", "grafo.nt.gz"))).toString("utf8");
const quads = new Parser({ format: "N-Triples" }).parse(nt);
/** sujeto → predicado → objetos (términos de N3). */
const S = new Map();
for (const q of quads) {
  const s = q.subject.value;
  let ps = S.get(s);
  if (!ps) S.set(s, (ps = new Map()));
  const p = q.predicate.value;
  ps.get(p)?.push(q.object) ?? ps.set(p, [q.object]);
}
const uno = (s, p) => S.get(s)?.get(p)?.[0]?.value ?? null;
const deTipo = (clase, ns = SOC) => [...S].filter(([, ps]) => ps.get(P.tipo)?.some((o) => o.value === `${ns}${clase}`)).map(([s]) => s);
/** `https://…/instituciones/1#id` → `1`; el segmento tras el tipo. */
const clave = (iri, tipo) => new RegExp(`^${SITIO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/${tipo}/([^#/]+)`).exec(iri ?? "")?.[1] ?? null;
const rutaDe = (iri) => (iri.startsWith(SITIO) ? iri.slice(SITIO.length).split("#")[0] : iri);
const numero = (v) => (v == null || v === "" ? null : Number(v));

/* ------------------------------------------------------- las instantáneas */

const historicoInst = leer("historico/instituciones.json");
const provHist = Object.assign({}, ...Array.from({ length: 10 }, (_, n) => leer(`historico/proveedores/${n}.json`).filas));
const resumen = leer("historico/resumen.json");
const instituciones = new Map(leer("instituciones.json").instituciones.map((i) => [String(i.id), i]));
const procesos = leer("procesos.json");

/* ------------------------------------------------------------- las tablas */

/**
 * Cada tabla: su definición en la ontología (descripción, fuente, columnas
 * con su tipo y su propiedad), su corte y sus filas.
 */
const TABLAS = [];
function tabla(nombre, corte, filas, ventana = {}) {
  const def = ESQ.TABLAS.find((t) => t.nombre === nombre);
  if (!def) throw new Error(`la tabla ${nombre} no está en lib/ontologia-esquemas.ts`);
  const descripcion = def.descripcion.replace(/\{(desde|hasta)\}/g, (_, k) => ventana[k]);
  const columnas = def.columnas.map((c) => [c.nombre, ESQ.tipoDeColumna(c), c.descripcion, c.propiedad ?? null]);
  TABLAS.push({ nombre, descripcion, fuente: def.fuente, corte, columnas, filas, esquema: ESQ.esquemaFila(def) });
}

// instituciones
{
  // Los contratos que no se le pueden atribuir a una unidad sin adivinar (su
  // código comparte prefijo con otra: el MOPC con la OPRET) no se suman a
  // ninguna; esa unidad dice el prefijo, como `contracting_history`, y no un 0.
  const plano = (x) => x.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const sinAsignar = new Map(resumen.sinAsignar.flatMap((g) => g.unidades.map((u) => [plano(u), g.prefijo])));
  const filas = deTipo("Institucion").map((s) => {
    const id = clave(s, "instituciones");
    const serie = historicoInst.filas[id]?.serie ?? [];
    const contratos = serie.reduce((t, f) => t + f[1], 0);
    const nombre = uno(s, P.etiqueta);
    return {
      id: Number(id),
      nombre,
      siglas: uno(s, P.alterno),
      sector: uno(s, `${SOC}sector`)?.replace(`${DO}sector-`, "") ?? null,
      capitulo: instituciones.get(id)?.capitulo ?? null,
      contratos: contratos > 0 ? contratos : null,
      monto_contratado: contratos > 0 ? serie.reduce((t, f) => t + f[2], 0) : null,
      sin_asignar: sinAsignar.get(plano(nombre ?? "")) ?? null,
      url: uno(s, P.pagina),
    };
  });
  tabla("instituciones", resumen.corte, filas);
}

// empresas, y de ellas el RNC de cada proveedor
const rncDeProveedor = new Map();
{
  const filas = deTipo("Empresa").map((s) => {
    for (const o of S.get(s).get(`${SOC}inscritaComo`) ?? []) rncDeProveedor.set(clave(o.value, "proveedores"), clave(s, "empresas"));
    return {
      rnc: clave(s, "empresas"),
      nombre: uno(s, P.razonSocial) ?? uno(s, P.etiqueta),
      estado: uno(s, `${SOC}estado`),
      inicio_operaciones: uno(s, `${SOC}inicioOperaciones`),
      actividad: uno(s, P.descripcion),
      url: uno(s, P.pagina),
    };
  });
  tabla("empresas", leer("empresas/meta.json").corteDgii, filas);
}

// proveedores
{
  const filas = deTipo("Proveedor").map((s) => {
    const rpe = uno(s, `${DO}rpe`) ?? clave(s, "proveedores");
    const h = provHist[rpe];
    return {
      rpe,
      nombre: uno(s, P.etiqueta),
      rnc: rncDeProveedor.get(rpe) ?? null,
      contratos: h ? h.s.reduce((t, f) => t + f[1], 0) : null,
      monto_contratado: h ? h.s.reduce((t, f) => t + f[2], 0) : null,
      primer_contrato: h?.d ?? null,
      ultimo_contrato: h?.h ?? null,
      url: `${SITIO}/proveedores/${rpe}`,
    };
  });
  tabla("proveedores", resumen.corte, filas);
}

// contrataciones
{
  const filas = deTipo("Contratacion").map((s) => ({
    institucion_id: Number(clave(uno(s, `${SOC}contratante`), "instituciones")),
    proveedor_rpe: clave(uno(s, `${SOC}contratista`), "proveedores"),
    contratos: numero(uno(s, `${SOC}numeroDeContratos`)),
    monto: numero(uno(s, `${SOC}montoContratado`)),
  }));
  tabla("contrataciones", resumen.corte, filas);
}

// medidas
{
  const filas = deTipo("MedidaDGCP", DO).map((s) => ({
    proveedor_rpe: clave(s, "proveedores"),
    tipo: uno(s, `${DO}tipoDeMedida`)?.replace(`${DO}medida-`, "") ?? null,
    fecha: uno(s, `${SOC}fecha`),
    titulo: uno(s, P.etiqueta),
    descripcion: uno(s, P.dctDescripcion),
  }));
  tabla("medidas", leer("sanciones.json").generado, filas);
}

// financieras
{
  const filas = deTipo("EntidadFinanciera").map((s) => ({
    slug: clave(s, "banca"),
    nombre: uno(s, P.nombre) ?? uno(s, P.etiqueta),
    razon_social: uno(s, P.razonSocial),
    supervisor_id: numero(clave(uno(s, `${SOC}supervisadaPor`), "instituciones")),
    url: uno(s, P.pagina),
  }));
  tabla("financieras", leer("banca.json").generado, filas);
}

// provincias
tabla(
  "provincias",
  null,
  [...S.keys()]
    .filter((s) => clave(s, "provincias") && uno(s, P.etiqueta))
    .map((s) => ({ slug: clave(s, "provincias"), nombre: uno(s, P.etiqueta) })),
);

// equivalencias
tabla(
  "equivalencias",
  leer("wikidata.json").generado,
  quads.filter((q) => q.predicate.value === P.mismo).map((q) => ({ nodo: rutaDe(q.subject.value), equivale_a: rutaDe(q.object.value) })),
);

// procesos
{
  const t = procesos;
  const filas = t.filas.map(([codigo, iu, im, ie, io, caratula, fecha, monto]) => ({
    codigo,
    titulo: caratula,
    unidad_compra: t.unidades[iu] ?? null,
    modalidad: t.modalidades[im] ?? null,
    estado: t.estados[ie] ?? null,
    objeto: t.objetos[io] || null,
    fecha,
    valor_estimado: monto || null,
    url: `${SITIO}/procesos/${encodeURIComponent(codigo)}`,
  }));
  tabla("procesos", t.hasta, filas, { desde: t.desde, hasta: t.hasta });
}

/* ------------------------------------------------------------ escribir */

let conCedula = 0;
for (const t of TABLAS) {
  for (const f of t.filas) {
    for (const [k, v] of Object.entries(f)) {
      if (typeof v !== "string") continue;
      f[k] = sinCedula(v);
      if (llevaCedula(f[k])) conCedula++;
    }
  }
}
if (conCedula) throw new Error(`${conCedula} textos siguen llevando una cédula: no se escribe nada`);

// Toda tabla de la ontología, escrita; y cada fila, contra el esquema de su tabla.
for (const d of ESQ.TABLAS) if (!TABLAS.some((t) => t.nombre === d.nombre)) throw new Error(`la tabla ${d.nombre} de la ontología no se escribe`);
let fuera = 0;
for (const t of TABLAS) {
  for (const f of t.filas) {
    const r = t.esquema.safeParse(f);
    if (r.success) continue;
    if (fuera++ < 5) console.error(`${t.nombre}: ${JSON.stringify(f).slice(0, 160)} → ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
}
if (fuera) throw new Error(`${fuera} filas no caben en el esquema de su tabla (lib/ontologia-esquemas.ts): no se escribe nada`);

const TMP = path.join(SALIDA, ".tmp");
rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
const db = await (await DuckDBInstance.create(":memory:")).connect();
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const meta = { generado: new Date().toISOString().slice(0, 10), formato: "Apache Parquet (zstd)", tablas: {} };
for (const t of TABLAS) {
  const json = path.join(TMP, `${t.nombre}.ndjson`);
  writeFileSync(json, t.filas.map((f) => JSON.stringify(f)).join("\n") + "\n");
  const columnas = `{${t.columnas.map(([n, tipo]) => `${lit(n)}: ${lit(tipo)}`).join(", ")}}`;
  const orden = t.columnas[0][0];
  await db.run(
    `COPY (SELECT * FROM read_json(${lit(json)}, format='newline_delimited', columns=${columnas}) ORDER BY ${orden}) TO ${lit(path.join(SALIDA, `${t.nombre}.parquet`))} (FORMAT parquet, COMPRESSION zstd)`,
  );
  const n = Number((await db.runAndReadAll(`SELECT count(*) FROM ${lit(path.join(SALIDA, `${t.nombre}.parquet`))}`)).getRows()[0][0]);
  if (n !== t.filas.length) throw new Error(`${t.nombre}: se escribieron ${t.filas.length} filas y se leen ${n}`);
  meta.tablas[t.nombre] = {
    descripcion: t.descripcion,
    fuente: t.fuente,
    corte: t.corte,
    filas: n,
    columnas: t.columnas.map(([nombre, tipo, descripcion, propiedad]) => ({ nombre, tipo, descripcion, ...(propiedad ? { propiedad } : {}) })),
  };
  console.error(`${t.nombre.padEnd(15)} ${String(n).padStart(7)} filas`);
}
rmSync(TMP, { recursive: true, force: true });
writeFileSync(path.join(SALIDA, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
