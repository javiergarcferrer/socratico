#!/usr/bin/env node
/**
 * Genera public/data/grafo/: el grafo de Socrático entero en N-Triples
 * (`grafo.nt.gz`) y su `meta.json`, para cargarlo en un motor SPARQL propio
 * (Oxigraph, QLever, Apache Jena, GraphDB…). El dueño decidió no servir un
 * almacén SPARQL del grafo entero;
 * esta es la otra salida: el grafo, para descargar.
 *
 * Cada triple sale de la plataforma misma. El script pide a un servidor en
 * marcha (`next start` sobre el build) la descripción de cada nodo por
 * `/api/grafo`, la misma que pintan el explorador y el servidor MCP, así que el
 * volcado no puede decir otra cosa que la plataforma.
 *
 * Qué entra y qué no. La regla es «ninguna
 * herramienta lista personas en masa»: una persona se lee una a una, en su
 * ficha, en /api/grafo o por MCP, nunca en un archivo con todas.
 *  - Entran las instituciones, las entidades financieras, las provincias y las
 *    personas jurídicas que el grafo liga a algo (proveedoras del Estado con
 *    RNC, con medidas de la DGCP, en la lista de la OFAC o supervisadas), con
 *    sus contrataciones, sus medidas, su supervisión y sus enlaces a Wikidata.
 *  - No entra ninguna persona natural: ni las personas con cargo ni sus
 *    cargos, ni los decretos (sus títulos nombran a quien designan), ni las
 *    declaraciones juradas, ni las fichas del Congreso, ni un proveedor que no
 *    esté atado a una empresa (puede ser una persona física), con todo lo que
 *    cuelga de él. Un triple que toca cualquiera de esos nodos no entra.
 *
 * Se corre después de las demás instantáneas y de un build. El resultado se
 * relee con N3.js antes de escribirse: un volcado que no parsea no se guarda.
 *
 * Uso:
 *     node scripts/build-grafo-volcado.mjs                          # levanta next start en un puerto libre
 *     node scripts/build-grafo-volcado.mjs --url http://localhost:3000
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { Parser } from "n3";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATOS = path.join(RAIZ, "public", "data");
const SALIDA = path.join(DATOS, "grafo");
const leer = (ruta) => JSON.parse(readFileSync(path.join(DATOS, ruta), "utf8"));
const SITIO = /SITIO = "([^"]+)"/.exec(readFileSync(path.join(RAIZ, "lib", "sitio.ts"), "utf8"))[1];
const CONSULTORIA_PDF = /CONSULTORIA_PDF = "([^"]+)"/.exec(readFileSync(path.join(RAIZ, "lib", "decretos.ts"), "utf8"))[1];
const SOC = `${SITIO}/ontologia#`;
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const CONCURRENCIA = 8;

/* ------------------------------------------------------------ el servidor */

function puertoLibre() {
  return new Promise((resolver) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => resolver(port));
    });
  });
}

async function servidor() {
  const i = process.argv.indexOf("--url");
  if (i > 0) return { url: process.argv[i + 1].replace(/\/$/, ""), cerrar: () => {} };
  const puerto = await puertoLibre();
  const hijo = spawn(process.execPath, [path.join(RAIZ, "node_modules/next/dist/bin/next"), "start", "-p", String(puerto)], {
    cwd: RAIZ,
    stdio: "ignore",
  });
  const url = `http://localhost:${puerto}`;
  for (let k = 0; k < 90; k++) {
    try {
      if ((await fetch(`${url}/robots.txt`)).ok) return { url, cerrar: () => hijo.kill() };
    } catch {
      /* aún no */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  hijo.kill();
  throw new Error("next start no respondió en 90 s: ¿hay un build?");
}

/* ---------------------------------------------------------------- los nodos */

function nodos() {
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
  const empresas = [...rnc].sort().map((x) => `/empresas/${x}`);
  return { instituciones, financieras, provincias, empresas };
}

/* ------------------------------------------------------------- las lecturas */

async function nTriples(url, ruta) {
  for (let intento = 1; ; intento++) {
    try {
      const r = await fetch(`${url}/api/grafo?nodo=${encodeURIComponent(ruta)}&formato=nt`, { signal: AbortSignal.timeout(60_000) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`${r.status}`);
      return await r.text();
    } catch (err) {
      if (intento >= 2) throw new Error(`${ruta}: ${err.message}`);
    }
  }
}

async function enLotes(lista, fn) {
  let i = 0;
  const hechos = [];
  await Promise.all(
    Array.from({ length: CONCURRENCIA }, async () => {
      while (i < lista.length) {
        const k = i++;
        hechos[k] = await fn(lista[k]);
        if ((k + 1) % 2000 === 0) process.stderr.write(`  ${k + 1} de ${lista.length}\n`);
      }
    }),
  );
  return hechos;
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

function filtrar(textos) {
  const lineas = [];
  const declaraciones = new Set();
  const proveedoresDeEmpresa = new Set();
  for (const t of textos) {
    if (!t) continue;
    for (const linea of t.split("\n")) {
      const m = LINEA.exec(linea.trim());
      if (!m) continue;
      const [, s, p, o] = m;
      lineas.push([s, p, o, linea.trim()]);
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
  const vistas = new Set();
  const salida = [];
  for (const [s, , o, linea] of lineas) {
    if (fuera(iriDe(s)) || fuera(iriDe(o))) continue;
    if (vistas.has(linea)) continue;
    vistas.add(linea);
    salida.push(linea);
  }
  return salida;
}

/* ------------------------------------------------------------------ correr */

const t0 = Date.now();
const lista = nodos();
const todos = [...lista.instituciones, ...lista.financieras, ...lista.provincias, ...lista.empresas];
console.error(
  `Nodos: ${lista.instituciones.length} instituciones, ${lista.financieras.length} financieras, ${lista.provincias.length} provincias, ${lista.empresas.length} empresas`,
);
const { url, cerrar } = await servidor();
let textos;
try {
  textos = await enLotes(todos, (ruta) => nTriples(url, ruta));
} finally {
  cerrar();
}
const sinFicha = todos.filter((_, i) => textos[i] == null);
const lineas = filtrar(textos);

// Se relee antes de guardarse: un volcado que no parsea no se escribe.
const nt = `${lineas.join("\n")}\n`;
const quads = new Parser({ format: "N-Triples" }).parse(nt);
if (quads.length !== lineas.length) throw new Error(`se escribieron ${lineas.length} líneas y se leen ${quads.length} triples`);
const personales = quads.filter((q) => [q.subject, q.object].some((x) => x.termType === "NamedNode" && x.value.startsWith(`${SITIO}/funcionarios/`)));
if (personales.length) throw new Error(`${personales.length} triples tocan a una persona`);
const clases = {};
for (const q of quads) if (q.predicate.value === RDF_TYPE && q.object.value.startsWith(SOC)) clases[q.object.value.slice(SOC.length)] = (clases[q.object.value.slice(SOC.length)] ?? 0) + 1;

mkdirSync(SALIDA, { recursive: true });
const gz = gzipSync(nt, { level: 9 });
writeFileSync(path.join(SALIDA, "grafo.nt.gz"), gz);
const meta = {
  generado: new Date().toISOString().slice(0, 10),
  formato: "N-Triples (application/n-triples), comprimido con gzip",
  triples: quads.length,
  bytes: gz.length,
  nodos: {
    instituciones: lista.instituciones.length,
    financieras: lista.financieras.length,
    provincias: lista.provincias.length,
    empresas: lista.empresas.length,
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
  },
  excluye:
    "Ninguna persona natural: ni las personas con cargo ni sus cargos, ni los decretos, ni las declaraciones juradas, ni las fichas del Congreso, ni los proveedores que no están atados a una empresa, con lo que cuelga de ellos.",
};
writeFileSync(path.join(SALIDA, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
console.error(
  `${quads.length} triples de ${todos.length - sinFicha.length} nodos (${sinFicha.length} sin ficha), ${(gz.length / 1e6).toFixed(1)} MB comprimidos, en ${Math.round((Date.now() - t0) / 1000)} s`,
);
