/**
 * El volcado del grafo (`public/data/grafo/grafo.trig.gz`, §7.8) en N-Quads,
 * para el motor de `/sparql` (`lib/sparql-hijo.cjs`, docs/INFRAESTRUCTURA.md §7.12).
 *
 * Mismos cuádruplos, otra sintaxis: Oxigraph (WASM) carga el TriG entero en
 * 15–17 s y 1,34 GB, y estas mismas líneas, por trozos, en ~7,5 s y ~0,7 GB
 * (medido el 2026-11-03). N-Quads se corta por línea; el TriG no se deja
 * cortar sin leerlo. Sale de Oxigraph mismo, así que el motor lee lo que su
 * analizador entendió del TriG, y se comprueba al releerlo: mismos cuádruplos.
 *
 * Corre tras `build-grafo-volcado.mjs`. Escribe `datos/sparql/grafo.nq.gz` y
 * `datos/sparql/meta.json` (de qué volcado sale, cuántos cuádruplos). El gate
 * (`scripts/eval-mcp.mjs`) falla si el volcado cambió y esto no se rehízo.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import path from "node:path";
import oxigraph from "oxigraph";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ORIGEN = path.join(RAIZ, "public/data/grafo/grafo.trig.gz");
const SALIDA = path.join(RAIZ, "datos/sparql");

const gz = readFileSync(ORIGEN);
const metaVolcado = JSON.parse(readFileSync(path.join(RAIZ, "public/data/grafo/meta.json"), "utf8"));
const t0 = performance.now();
const almacen = new oxigraph.Store();
almacen.load(gunzipSync(gz), { format: "application/trig", no_transaction: true, lenient: false });
const nq = almacen.dump({ format: "application/n-quads" });
const salida = gzipSync(nq, { level: 9 });

// Releer lo escrito, por el mismo camino que el motor (trozos por línea).
const relectura = new oxigraph.Store();
const texto = Buffer.from(nq);
for (let i = 0; i < texto.length; ) {
  let j = Math.min(texto.length, i + (16 << 20));
  if (j < texto.length) j = texto.indexOf(10, j) + 1;
  relectura.load(texto.subarray(i, j), { format: "application/n-quads", no_transaction: true });
  i = j;
}
if (relectura.size !== almacen.size) throw new Error(`relectura: ${relectura.size} cuádruplos, se escribieron ${almacen.size}`);
// Las rutas cuyas fichas nombran personas naturales (docs/INFRAESTRUCTURA.md §7.11) y las formas de una cédula
// (las de `lib/padron.ts`: con guiones o rayas, o «cédula» seguida de once cifras): ninguna entra al motor.
const SITIO = /SITIO = "([^"]+)"/.exec(readFileSync(path.join(RAIZ, "lib", "sitio.ts"), "utf8"))[1];
for (const r of ["/funcionarios/", "/normativa/", "/congreso/", "/constitucional/", "/tse/", "/documentos/"]) {
  if (nq.includes(`<${SITIO}${r}`)) throw new Error(`un cuádruplo toca ${r}: el volcado no debe traer personas naturales`);
}
// Las mismas expresiones que `sinCedula`, leídas de `lib/padron.ts`: si cambian allí, cambian aquí.
const PADRON = readFileSync(path.join(RAIZ, "lib", "padron.ts"), "utf8");
const expresion = (nombre) => {
  const m = new RegExp(`^const ${nombre} = /(.+)/([a-z]*);$`, "m").exec(PADRON);
  if (!m) throw new Error(`lib/padron.ts ya no define ${nombre}`);
  return new RegExp(m[1], m[2]);
};
const cedula = ["GUIONES", "RAYAS", "NOMBRADA"].map(expresion).map((r) => r.exec(nq)).find(Boolean);
if (cedula) throw new Error(`una línea trae algo con forma de cédula (posición ${cedula.index}): el volcado no debe traerla`);

// Los grafos con nombre y sus cuádruplos, para la descripción del servicio (sd:namedGraph) sin cargar el motor.
const grafos = JSON.parse(
  almacen.query("SELECT ?g (COUNT(*) AS ?n) WHERE { GRAPH ?g { ?s ?p ?o } } GROUP BY ?g ORDER BY DESC(?n) ?g", { results_format: "application/sparql-results+json" }),
).results.bindings.map((b) => ({ iri: b.g.value, cuadruplos: Number(b.n.value) }));
const enGrafos = grafos.reduce((s, g) => s + g.cuadruplos, 0);

mkdirSync(SALIDA, { recursive: true });
writeFileSync(path.join(SALIDA, "grafo.nq.gz"), salida);
const meta = {
  generado: metaVolcado.generado,
  origen: "public/data/grafo/grafo.trig.gz",
  sha256Origen: createHash("sha256").update(gz).digest("hex"),
  cuadruplos: almacen.size,
  porOmision: almacen.size - enGrafos,
  grafos,
  bytes: salida.length,
  formato: "N-Quads (application/n-quads), comprimido con gzip: los cuádruplos del volcado en TriG, con el PROV-O de cada grafo en el grafo por omisión",
};
writeFileSync(path.join(SALIDA, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
console.log(`datos/sparql: ${meta.cuadruplos.toLocaleString("en")} cuádruplos, ${salida.length.toLocaleString("en")} bytes, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
