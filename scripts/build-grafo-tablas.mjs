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
 * Se corre después del volcado. `meta.json` guarda, por tabla, sus columnas
 * con su descripción, su fuente, su corte y sus filas: de ahí lee el servidor
 * lo que le explica al asistente.
 *
 * Uso: node scripts/build-grafo-tablas.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { Parser } from "n3";
import { DuckDBInstance } from "@duckdb/node-api";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATOS = path.join(RAIZ, "public", "data");
// Fuera de public/data: las funciones que leen instantáneas por nombre variable
// arrastran public/data entero, y estas tablas solo las lee `/api/sql`.
const SALIDA = path.join(RAIZ, "public", "tablas");
const leer = (ruta) => JSON.parse(readFileSync(path.join(DATOS, ruta), "utf8"));
const SITIO = /SITIO = "([^"]+)"/.exec(readFileSync(path.join(RAIZ, "lib", "sitio.ts"), "utf8"))[1];

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
 * Cada tabla: su descripción, su fuente, su corte y sus columnas (nombre,
 * tipo de DuckDB, descripción). Lo que dice aquí es lo que el asistente lee.
 */
const TABLAS = [];
function tabla(nombre, descripcion, fuente, corte, columnas, filas) {
  TABLAS.push({ nombre, descripcion, fuente, corte, columnas, filas });
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
  tabla(
    "instituciones",
    "Las instituciones del Estado (clasificador de DIGEPRES), con lo que contrataron desde 2015 según la DGCP.",
    "DIGEPRES; DGCP, tabla de contratos",
    resumen.corte,
    [
      ["id", "INTEGER", "Identificador de la institución; es también su código de unidad de compra en la DGCP."],
      ["nombre", "VARCHAR", "Nombre oficial."],
      ["siglas", "VARCHAR", "Siglas, si las tiene (MINERD, MOPC)."],
      ["sector", "VARCHAR", "ejecutivo, descentralizada, local (ayuntamientos y juntas de distrito), empresa, financiera, poderes, seguridad-social, fideicomiso."],
      ["capitulo", "VARCHAR", "Capítulo del presupuesto (DIGEPRES)."],
      ["contratos", "INTEGER", "Contratos registrados desde 2015. NULL si no hay ninguno que se le pueda atribuir: no compra por la DGCP, o sus contratos no se atribuyen (sin_asignar). NULL no es cero."],
      ["monto_contratado", "BIGINT", "Pesos contratados desde 2015 (contratado, no pagado; sin cancelados, otras monedas ni contratos de RD$10 mil millones o más). NULL como contratos."],
      ["sin_asignar", "VARCHAR", "Si sus contratos comparten prefijo de código con otra unidad y no se le atribuyen, ese prefijo (MOPC, MEPYD): lo contratado existe pero no está en esta fila."],
      ["url", "VARCHAR", "Su ficha en Socrático."],
    ],
    filas,
  );
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
  tabla(
    "empresas",
    "Personas jurídicas del padrón de la DGII que el grafo liga a algo: proveedoras del Estado, con medidas de la DGCP, en la lista de la OFAC o supervisadas. Ninguna persona física.",
    "DGII, padrón de contribuyentes (RNC)",
    leer("empresas/meta.json").corteDgii,
    [
      ["rnc", "VARCHAR", "RNC de nueve cifras."],
      ["nombre", "VARCHAR", "Razón social."],
      ["estado", "VARCHAR", "Estado en el padrón: ACTIVO, SUSPENDIDO, CESE TEMPORAL, DADO DE BAJA, ANULADO."],
      ["inicio_operaciones", "DATE", "Fecha de inicio de operaciones declarada."],
      ["actividad", "VARCHAR", "Actividad económica declarada."],
      ["url", "VARCHAR", "Su ficha en Socrático."],
    ],
    filas,
  );
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
  tabla(
    "proveedores",
    "Proveedores del Estado inscritos en la DGCP y atados a una empresa por su RNC, con lo que contrataron desde 2015. No incluye a los proveedores personas físicas.",
    "DGCP, registro de proveedores y tabla de contratos",
    resumen.corte,
    [
      ["rpe", "VARCHAR", "Registro de Proveedores del Estado."],
      ["nombre", "VARCHAR", "Nombre como lo registra la DGCP."],
      ["rnc", "VARCHAR", "RNC de la empresa (empresas.rnc)."],
      ["contratos", "INTEGER", "Contratos desde 2015 (total, con todos sus clientes)."],
      ["monto_contratado", "BIGINT", "Pesos contratados desde 2015 (total; contratado, no pagado; sin cancelados, otras monedas ni contratos de RD$10 mil millones o más)."],
      ["primer_contrato", "DATE", "Fecha del primer contrato registrado."],
      ["ultimo_contrato", "DATE", "Fecha del último contrato registrado."],
      ["url", "VARCHAR", "Su ficha en Socrático."],
    ],
    filas,
  );
}

// contrataciones
{
  const filas = deTipo("Contratacion").map((s) => ({
    institucion_id: Number(clave(uno(s, `${SOC}contratante`), "instituciones")),
    proveedor_rpe: clave(uno(s, `${SOC}contratista`), "proveedores"),
    contratos: numero(uno(s, `${SOC}numeroDeContratos`)),
    monto: numero(uno(s, `${SOC}montoContratado`)),
  }));
  tabla(
    "contrataciones",
    "Pares institución → proveedor con lo contratado entre ellos desde 2015. Son solo los pares mayores (los 12 mayores proveedores de cada institución y los 8 mayores clientes de cada empresa), no todos: para el total de una institución o de un proveedor usa instituciones.monto_contratado o proveedores.monto_contratado, nunca la suma de esta tabla.",
    "DGCP, tabla de contratos",
    resumen.corte,
    [
      ["institucion_id", "INTEGER", "La institución que contrata (instituciones.id)."],
      ["proveedor_rpe", "VARCHAR", "El proveedor contratado (proveedores.rpe)."],
      ["contratos", "INTEGER", "Contratos entre los dos desde 2015."],
      ["monto", "BIGINT", "Pesos contratados entre los dos desde 2015."],
    ],
    filas,
  );
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
  tabla(
    "medidas",
    "Medidas de la DGCP sobre proveedores atados a una empresa: inhabilitaciones, suspensiones, penalidades.",
    "DGCP, proveedores con medidas",
    leer("sanciones.json").generado,
    [
      ["proveedor_rpe", "VARCHAR", "El proveedor (proveedores.rpe)."],
      ["tipo", "VARCHAR", "prohibicion, inhabilitacion-permanente, inhabilitacion-temporal, cancelacion, penal, suspension, incumplimiento, condena, levantamiento…"],
      ["fecha", "DATE", "Fecha de la medida."],
      ["titulo", "VARCHAR", "Título del acto."],
      ["descripcion", "VARCHAR", "Lo que dispone."],
    ],
    filas,
  );
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
  tabla(
    "financieras",
    "Entidades financieras supervisadas: bancos, asociaciones, cooperativas, AFP, aseguradoras.",
    "Superintendencias de Bancos, Pensiones y Seguros; IDECOOP",
    leer("banca.json").generado,
    [
      ["slug", "VARCHAR", "Identificador en Socrático."],
      ["nombre", "VARCHAR", "Nombre comercial."],
      ["razon_social", "VARCHAR", "Razón social."],
      ["supervisor_id", "INTEGER", "La institución que la supervisa (instituciones.id)."],
      ["url", "VARCHAR", "Su ficha en Socrático."],
    ],
    filas,
  );
}

// provincias
tabla(
  "provincias",
  "Las provincias y el Distrito Nacional.",
  "ONE",
  null,
  [
    ["slug", "VARCHAR", "Identificador en Socrático."],
    ["nombre", "VARCHAR", "Nombre."],
  ],
  [...S.keys()]
    .filter((s) => clave(s, "provincias") && uno(s, P.etiqueta))
    .map((s) => ({ slug: clave(s, "provincias"), nombre: uno(s, P.etiqueta) })),
);

// equivalencias
tabla(
  "equivalencias",
  "Un mismo ente en dos registros: una institución que es también una entidad financiera, o su entrada en Wikidata.",
  "Socrático; Wikidata",
  leer("wikidata.json").generado,
  [
    ["nodo", "VARCHAR", "La ruta del registro en Socrático (/instituciones/1, /banca/banreservas)."],
    ["equivale_a", "VARCHAR", "La otra ruta en Socrático, o la dirección de Wikidata."],
  ],
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
  tabla(
    "procesos",
    `Todos los procesos de compra publicados en la DGCP del ${t.desde} al ${t.hasta}, con su valor estimado (no adjudicado: el ganador y el monto final no están en esta tabla).`,
    "DGCP, tabla de procesos",
    t.hasta,
    [
      ["codigo", "VARCHAR", "Código del proceso."],
      ["titulo", "VARCHAR", "Carátula, como la publica la unidad de compra."],
      ["unidad_compra", "VARCHAR", "Unidad de compra que lo publica."],
      ["modalidad", "VARCHAR", "Modalidad, como la dice la DGCP: Compras por Debajo del Umbral, Contratación Menor, Procesos de Excepción, Comparación de Precios, Licitación Pública Nacional, Subasta Inversa, Licitación Pública Abreviada, Sorteo de Obras, Licitación Pública Internacional, Licitación Restringida."],
      ["estado", "VARCHAR", "Estado el día del corte, como lo dice la DGCP: Proceso publicado (abierto a ofertas), Proceso con etapa cerrada, Sobres estan abriendose, Sobres abiertos o aperturados, Proceso adjudicado y celebrado, Proceso desierto, Cancelado, Suspendido."],
      ["objeto", "VARCHAR", "Bienes, Obras o Servicios."],
      ["fecha", "DATE", "Fecha de publicación."],
      ["valor_estimado", "BIGINT", "Valor estimado en pesos; NULL si no lo trae."],
      ["url", "VARCHAR", "Su ficha en Socrático."],
    ],
    filas,
  );
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
    columnas: t.columnas.map(([nombre, tipo, descripcion]) => ({ nombre, tipo, descripcion })),
  };
  console.error(`${t.nombre.padEnd(15)} ${String(n).padStart(7)} filas`);
}
rmSync(TMP, { recursive: true, force: true });
writeFileSync(path.join(SALIDA, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
