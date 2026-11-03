"use strict";
/**
 * El proceso hijo de `/sparql` (`lib/sparql.ts`): tiene Oxigraph (WASM) con el
 * volcado sin personas naturales cargado y corre las consultas que le manda el
 * proceso de la función (docs/INFRAESTRUCTURA.md §7.12). Vive aparte para que
 * se le pueda matar: una consulta dentro del WASM no se deja interrumpir. El
 * padre lo mata a los 10 s o si pasa del techo de memoria, y arranca otro.
 *
 * Argumentos: la ruta resuelta de `oxigraph` y la del volcado en N-Quads
 * (`datos/sparql/grafo.nq.gz`). El primer mensaje del padre trae la ontología
 * y las formas SHACL en Turtle, cada una con el IRI de su grafo con nombre.
 * Luego, `{id, consulta, union, grafo}` entra; sale `{id, ok, json}` (SELECT y
 * ASK, en SPARQL Results JSON) o `{id, ok, triples}` (CONSTRUCT y DESCRIBE,
 * términos sueltos), o `{id, ok: false, error}`. Al arrancar manda
 * `{listo: true, ms, rssMb}` o `{listo: false, error}`.
 *
 * El padre ya revisó la consulta (solo lectura, sin SERVICE, con tope de
 * filas). Esto es la segunda llave: `query` de Oxigraph no ejecuta
 * actualizaciones, y no hay `update` aquí.
 */
const fs = require("node:fs");
const zlib = require("node:zlib");
const oxigraph = require(process.argv[2]);

const VOLCADO = process.argv[3];
/** Trozos de ~16 MB cortados en fin de línea: cargar por trozos no guarda el texto entero en memoria. */
const TROZO = 16 << 20;

let almacen = null;

function cargarVolcado() {
  return new Promise((resolver, rechazar) => {
    const s = new oxigraph.Store();
    let resto = Buffer.alloc(0);
    const flujo = fs.createReadStream(VOLCADO).pipe(zlib.createGunzip({ chunkSize: TROZO }));
    flujo.on("data", (c) => {
      try {
        const b = resto.length ? Buffer.concat([resto, c]) : c;
        const i = b.lastIndexOf(10);
        if (i < 0) {
          resto = b;
          return;
        }
        // `lenient`: el convertidor ya lo leyó con el analizador estricto (scripts/build-sparql.mjs).
        s.load(b.subarray(0, i + 1), { format: "application/n-quads", no_transaction: true, lenient: true });
        resto = Buffer.from(b.subarray(i + 1));
      } catch (err) {
        flujo.destroy(err);
      }
    });
    flujo.on("error", rechazar);
    flujo.on("end", () => {
      try {
        if (resto.length) s.load(resto, { format: "application/n-quads", no_transaction: true, lenient: true });
        resolver(s);
      } catch (err) {
        rechazar(err);
      }
    });
  });
}

function termino(x) {
  if (x.termType === "NamedNode") return { tipo: "iri", valor: x.value };
  if (x.termType === "BlankNode") return { tipo: "blanco", valor: x.value };
  const t = { tipo: "literal", valor: x.value };
  if (x.language) t.idioma = x.language;
  else if (x.datatype && x.datatype.value !== "http://www.w3.org/2001/XMLSchema#string") t.datatype = x.datatype.value;
  return t;
}

/** Un resultado de más de `topeCaracteres` no cruza al padre: se dice, sin mandarlo. */
class Grande extends Error {}

function correr(m) {
  const opciones = m.union ? { use_default_graph_as_union: true } : {};
  if (m.grafo) {
    const r = almacen.query(m.consulta, opciones);
    // Un CONSTRUCT o un DESCRIBE devuelve cuádruplos del grafo por omisión: van como triples.
    const triples = [];
    let largo = 0;
    for (const q of r.slice(0, m.tope + 1)) {
      const t = { s: termino(q.subject), p: q.predicate.value, o: termino(q.object) };
      largo += t.s.valor.length + t.p.length + t.o.valor.length + 16;
      if (largo > m.topeCaracteres) throw new Grande();
      triples.push(t);
    }
    return { triples };
  }
  const json = almacen.query(m.consulta, { ...opciones, results_format: "application/sparql-results+json" });
  if (json.length > m.topeCaracteres * 2) throw new Grande();
  return { json };
}

let arrancado = false;
process.on("message", async (m) => {
  if (!arrancado) {
    arrancado = true;
    const t0 = performance.now();
    try {
      almacen = await cargarVolcado();
      for (const g of m.grafos || []) {
        almacen.load(g.ttl, { format: "text/turtle", to_graph_name: oxigraph.namedNode(g.iri), no_transaction: true });
      }
      process.send({
        listo: true,
        ms: Math.round(performance.now() - t0),
        rssMb: Math.round(process.memoryUsage().rss / 1048576),
        cuadruplos: almacen.size,
      });
    } catch (err) {
      process.send({ listo: false, error: String((err && err.message) || err).split("\n")[0] });
      process.exit(1);
    }
    return;
  }
  if (!m || typeof m.consulta !== "string") return;
  try {
    process.send({ id: m.id, ok: true, ...correr(m) });
  } catch (err) {
    if (err instanceof Grande) return process.send({ id: m.id, ok: false, grande: true });
    process.send({ id: m.id, ok: false, error: String((err && err.message) || err).split("\n")[0].slice(0, 300) });
  }
});
// Muere con su padre.
process.on("disconnect", () => process.exit(0));
