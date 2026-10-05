#!/usr/bin/env node
/**
 * Genera public/data/grafo/: el grafo de Socrático sin personas naturales,
 * para cargarlo en un motor SPARQL propio (Oxigraph, QLever, Apache Jena,
 * GraphDB…). El dueño decidió no servir un almacén SPARQL del grafo entero;
 * esta es la otra salida: el grafo, para descargar.
 *
 *  - `grafo.nt.gz`: N-Triples, los triples.
 *  - `grafo.trig.gz`: TriG, los mismos triples, cada uno en el grafo con
 *    nombre de la fuente y el corte que lo dice, o de la regla de Socrático
 *    que lo deriva; en el grafo por omisión, lo que se dice de cada grafo en
 *    PROV-O (docs/INFRAESTRUCTURA.md §7).
 *  - `meta.json`: cuántos, de cuándo, qué excluye.
 *
 * Cada triple sale del grafo compilado (`datos/grafo/`, de
 * `scripts/build-grafo.mjs`), leído por `describir()`, el mismo que sirve
 * `/api/grafo`, el explorador y el servidor MCP: el volcado no puede decir
 * otra cosa que la plataforma. No hace falta un servidor.
 *
 * Qué entra y qué no. La regla es «ninguna
 * herramienta lista personas en masa»: una persona se lee una a una, en su
 * ficha, en /api/grafo o por MCP, nunca en un archivo con todas.
 *  - Entran las instituciones, las entidades financieras, las provincias y las
 *    personas jurídicas que el grafo liga a algo (proveedoras del Estado con
 *    RNC, con medidas de la DGCP, en la lista de la OFAC o supervisadas), con
 *    sus contrataciones, sus medidas, su supervisión y sus enlaces a Wikidata;
 *    los procesos de compra, las obras con sus contratos y las inscripciones
 *    de proveedor de una empresa.
 *  - No entra ninguna persona natural: ni las personas con cargo ni sus
 *    cargos, ni los decretos (sus títulos nombran a quien designan), ni las
 *    declaraciones juradas, ni las fichas del Congreso, ni un proveedor que no
 *    esté atado a una empresa (puede ser una persona física), con todo lo que
 *    cuelga de él: sus contrataciones, sus medidas y sus contratos de obra.
 *    Un triple que toca cualquiera de esos nodos no entra.
 *
 * Se corre después de `scripts/build-grafo.mjs`. Los dos archivos se releen
 * con N3.js antes de escribirse: un volcado que no parsea no se guarda.
 *
 * Uso: node scripts/build-grafo-volcado.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { Parser } from "n3";
import { registrarTs } from "./cargador-ts.mjs";

registrarTs();

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATOS = path.join(RAIZ, "public", "data");
const SALIDA = path.join(DATOS, "grafo");
const leer = (ruta) => JSON.parse(readFileSync(path.join(DATOS, ruta), "utf8"));
const SITIO = /SITIO = "([^"]+)"/.exec(readFileSync(path.join(RAIZ, "lib", "sitio.ts"), "utf8"))[1];
const CONSULTORIA_PDF = /CONSULTORIA_PDF = "([^"]+)"/.exec(readFileSync(path.join(RAIZ, "lib", "decretos-base.ts"), "utf8"))[1];
// Los espacios de nombres de la ontología (lib/rdf.ts): el núcleo y el módulo dominicano.
const W3ID = /W3ID = "([^"]+)"/.exec(readFileSync(path.join(RAIZ, "lib", "rdf.ts"), "utf8"))[1];
const SOC = `${W3ID}/def/core#`;
const DO = `${W3ID}/def/do#`;
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

// Los módulos del servidor leen desde process.cwd(), como en el servidor.
process.chdir(RAIZ);
const lib = (m) => import(pathToFileURL(path.join(RAIZ, "lib", `${m}.ts`)).href);
const R = await lib("grafo-rdf");
const G = await lib("grafo");
const RDF = await lib("rdf");
const C = await lib("grafo-compilado");
const K = await lib("grafo-constructores");

/* ---------------------------------------------------------------- los nodos */

async function nodos() {
  const instituciones = leer("instituciones.json").instituciones.map((i) => `/instituciones/${i.id}`);
  const banca = leer("banca.json").entidades;
  const financieras = banca.map((e) => `/banca/${e.slug}`);
  const provincias = [...readFileSync(path.join(RAIZ, "lib", "provincias.ts"), "utf8").matchAll(/\{ slug: "([a-z0-9-]+)"/g)].map(
    (m) => `/provincias/${m[1]}`,
  );
  // Las personas jurídicas que el grafo liga a algo: por RNC de nueve cifras.
  const rnc = new Set();
  const sumar = (x) => x && /^\d{9}$/.test(x) && rnc.add(x);
  for (const x of Object.values(leer("historico/rnc.json").rnc)) sumar(x);
  for (const e of banca) sumar(e.rnc);
  const sanciones = leer("sanciones.json");
  for (const p of sanciones.proveedores) if (!p.fisica) sumar(p.rnc);
  for (const o of sanciones.ofac) sumar(o.rnc);
  // Los proveedores que el grafo liga a algo: con contratos desde 2015, con
  // medidas o con contratos de obra (no cada inscripción del registro); y la
  // empresa de los de obra. El filtro deja fuera al que no es una empresa.
  const conAlgo = new Set();
  const rncDe = {};
  for (let n = 0; n < 10; n++) {
    for (const rpe of Object.keys(leer(`historico/proveedores/${n}.json`).filas)) conAlgo.add(String(Number(rpe)));
    Object.assign(rncDe, leer(`rnc/${n}.json`).filas);
  }
  for (const p of sanciones.proveedores) conAlgo.add(String(Number(p.rpe)));
  for (const o of Object.values(leer("obras-detalle.json").obras)) {
    for (const c of o.contratos) {
      conAlgo.add(String(Number(c.rpe)));
      sumar(rncDe[c.rpe]?.[0]);
    }
  }
  const empresas = [...rnc].sort().map((x) => `/empresas/${x}`);
  const compras = await K.clavesDeCompras();
  return {
    instituciones,
    financieras,
    provincias,
    empresas,
    proveedores: compras.proveedor.filter((x) => conAlgo.has(x)).map((x) => G.enlace.proveedor(x)),
    procesos: compras.proceso.map((x) => G.enlace.proceso(x)),
    obras: compras.obra.map((x) => G.enlace.obra(x)),
  };
}

/* ------------------------------------------------------------- las lecturas */

const meta0 = await C.metaGrafo();
if (!meta0) throw new Error("no hay grafo compilado: node scripts/build-grafo.mjs");
const grafoDe = new Map(meta0.grafos.map((g) => [g.clave, g]));

/**
 * Las líneas de un nodo, como las da `/api/grafo` en N-Triples (sin repetir
 * dentro del nodo, en el orden de su descripción), cada una con su triple y
 * los grafos que la afirman: un mismo triple puede decirlo más de uno.
 */
async function lineasDe(ruta) {
  const d = await R.describir(G.nodoDeRuta(ruta));
  if (!d) return null;
  const porLinea = new Map();
  d.triples.forEach((x, i) => {
    const linea = RDF.aNTriples([x]).trimEnd();
    const g = grafoDe.get(d.grafos[i]).iri;
    const e = porLinea.get(linea);
    if (!e) porLinea.set(linea, { linea, triple: x, grafos: [g] });
    else if (!e.grafos.includes(g)) e.grafos.push(g);
  });
  return [...porLinea.values()];
}

/* ------------------------------------------------------------- el filtro */

const LINEA = /^(<[^>]*>|_:\S+) <([^>]*)> (.*) \.$/;
const iriDe = (termino) => (termino.startsWith("<") ? termino.slice(1, -1) : null);
const RPE_DE = new RegExp(`^${SITIO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/proveedores/(\\d+)#`);

/** Lo que nunca entra: una persona natural, o lo que la nombra. */
function esPersonal(v, declaraciones) {
  return (
    v.startsWith(`${SITIO}/funcionarios/`) ||
    v.startsWith(`${SITIO}/normativa/decreto/`) ||
    v.startsWith(`${SITIO}/congreso/`) ||
    v.startsWith(CONSULTORIA_PDF) ||
    declaraciones.has(v)
  );
}

/** Lo que entra, una vez por línea, en el orden en que apareció; con los grafos de todos los nodos que la dicen. */
function filtrar(porNodo) {
  const lineas = [];
  const declaraciones = new Set();
  const proveedoresDeEmpresa = new Set();
  for (const entradas of porNodo) {
    for (const e of entradas ?? []) {
      const m = LINEA.exec(e.linea);
      if (!m) continue;
      const [, s, p, o] = m;
      lineas.push([s, p, o, e]);
      if (p === RDF_TYPE && o === `<${SOC}DeclaracionJurada>`) declaraciones.add(iriDe(s));
      if (p === `${SOC}inscritaComo` && iriDe(s)?.startsWith(`${SITIO}/empresas/`)) {
        const rpe = RPE_DE.exec(iriDe(o) ?? "")?.[1];
        if (rpe) proveedoresDeEmpresa.add(rpe);
      }
    }
  }
  const fuera = (v) => {
    if (!v) return false;
    if (esPersonal(v, declaraciones)) return true;
    const rpe = RPE_DE.exec(v)?.[1];
    return rpe != null && !proveedoresDeEmpresa.has(rpe);
  };
  const vistas = new Map();
  for (const [s, , o, e] of lineas) {
    if (fuera(iriDe(s)) || fuera(iriDe(o))) continue;
    const ya = vistas.get(e.linea);
    if (!ya) vistas.set(e.linea, { ...e, grafos: [...e.grafos] });
    else for (const g of e.grafos) if (!ya.grafos.includes(g)) ya.grafos.push(g);
  }
  return [...vistas.values()];
}

/* ------------------------------------------------------------------ correr */

const t0 = Date.now();
const lista = await nodos();
const todos = [...lista.instituciones, ...lista.financieras, ...lista.provincias, ...lista.empresas, ...lista.proveedores, ...lista.procesos, ...lista.obras];
console.error(
  `Nodos: ${lista.instituciones.length} instituciones, ${lista.financieras.length} financieras, ${lista.provincias.length} provincias, ${lista.empresas.length} empresas, ` +
    `${lista.proveedores.length} proveedores, ${lista.procesos.length} procesos, ${lista.obras.length} obras`,
);
const porNodo = [];
for (const ruta of todos) porNodo.push(await lineasDe(ruta));
const sinFicha = todos.filter((_, i) => porNodo[i] == null);
const entradas = filtrar(porNodo);
const lineas = entradas.map((e) => e.linea);

// Se relee antes de guardarse: un volcado que no parsea no se escribe.
const nt = `${lineas.join("\n")}\n`;
const quads = new Parser({ format: "N-Triples" }).parse(nt);
if (quads.length !== lineas.length) throw new Error(`se escribieron ${lineas.length} líneas y se leen ${quads.length} triples`);
const personales = quads.filter((q) => [q.subject, q.object].some((x) => x.termType === "NamedNode" && x.value.startsWith(`${SITIO}/funcionarios/`)));
if (personales.length) throw new Error(`${personales.length} triples tocan a una persona`);

// TriG: cada triple en cada grafo que lo afirma; en el grafo por omisión, lo que se dice de los grafos.
const cuadruples = entradas.flatMap((e) => e.grafos.map((g) => ({ ...e.triple, g })));
const usados = meta0.grafos.filter((g) => cuadruples.some((x) => x.g === g.iri));
const sobreGrafos = C.triplesDeGrafos(usados, meta0.grafos);
const trig = RDF.aTrig([...sobreGrafos, ...cuadruples], "El grafo de Socrático.do sin personas naturales, por fuente y corte. Herramienta independiente y no oficial.");
const leidos = new Parser({ format: "TriG" }).parse(trig);
const enGrafos = leidos.filter((q) => q.graph.termType === "NamedNode");
if (enGrafos.length !== cuadruples.length) throw new Error(`TriG: ${cuadruples.length} cuádruplos escritos y ${enGrafos.length} leídos`);
if (new Set(enGrafos.map((q) => `${q.subject.value} ${q.predicate.value} ${q.object.id}`)).size !== quads.length) {
  throw new Error("TriG: no trae los mismos triples que N-Triples");
}
const porGrafo = Object.fromEntries(usados.map((g) => [g.clave, cuadruples.filter((x) => x.g === g.iri).length]));

const clases = {};
// Por su nombre local, único entre los dos módulos (lib/ontologia.ts).
for (const q of quads) {
  if (q.predicate.value !== RDF_TYPE) continue;
  const ns = [SOC, DO].find((n) => q.object.value.startsWith(n));
  if (ns) clases[q.object.value.slice(ns.length)] = (clases[q.object.value.slice(ns.length)] ?? 0) + 1;
}

mkdirSync(SALIDA, { recursive: true });
const gz = gzipSync(nt, { level: 9 });
writeFileSync(path.join(SALIDA, "grafo.nt.gz"), gz);
const gzTrig = gzipSync(trig, { level: 9 });
writeFileSync(path.join(SALIDA, "grafo.trig.gz"), gzTrig);
const meta = {
  generado: new Date().toISOString().slice(0, 10),
  formato: "N-Triples (application/n-triples), comprimido con gzip",
  triples: quads.length,
  bytes: gz.length,
  trig: {
    formato: "TriG (application/trig), comprimido con gzip: cada triple en el grafo con nombre de su fuente y su corte, o de la regla que lo deriva; en el grafo por omisión, PROV-O de cada grafo",
    bytes: gzTrig.length,
    cuadruples: cuadruples.length,
    grafos: porGrafo,
  },
  nodos: {
    instituciones: lista.instituciones.length,
    financieras: lista.financieras.length,
    provincias: lista.provincias.length,
    empresas: lista.empresas.length,
    // Los proveedores que entran: los que una empresa tiene inscritos (los demás pueden ser personas físicas).
    proveedores: new Set(entradas.map((e) => LINEA.exec(e.linea)?.[1]).filter((x) => x && /\/proveedores\/\d+#id>$/.test(x))).size,
    procesos: lista.procesos.length,
    obras: lista.obras.length,
    sinFicha: sinFicha.length,
  },
  clases,
  cortes: {
    instituciones: leer("instituciones.json").generado,
    financieras: leer("banca.json").generado,
    contratos: leer("historico/resumen.json").corte,
    padron: leer("empresas/meta.json").corteDgii,
    sanciones: leer("sanciones.json").generado,
    wikidata: leer("wikidata.json").generado,
    procesos: leer("procesos.json").hasta,
    obras: leer("obras.json").corte,
  },
  excluye:
    "Ninguna persona natural: ni las personas con cargo ni sus cargos, ni los decretos, ni las declaraciones juradas, ni las fichas del Congreso, ni los proveedores que no están atados a una empresa, con lo que cuelga de ellos (sus contrataciones, sus medidas y sus contratos de obra).",
};
writeFileSync(path.join(SALIDA, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
console.error(
  `${quads.length} triples de ${todos.length - sinFicha.length} nodos (${sinFicha.length} sin ficha), ${(gz.length / 1e6).toFixed(1)} MB comprimidos; ` +
    `TriG: ${cuadruples.length} cuádruplos en ${usados.length} grafos, ${(gzTrig.length / 1e6).toFixed(1)} MB; en ${Math.round((Date.now() - t0) / 1000)} s`,
);
