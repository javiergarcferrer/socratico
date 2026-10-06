#!/usr/bin/env node
/**
 * Valida el grafo contra su ontología (docs/INFRAESTRUCTURA.md §7): cada
 * instancia contra las formas SHACL que salen de `lib/ontologia.ts`
 * (`/ontologia.shacl.ttl`), y cada término `soc:` o `do:` que el grafo usa
 * contra los que la ontología declara.
 *
 * Qué valida, contra `next start` (como `scripts/eval-mcp.mjs`):
 *
 *  · el volcado entero (`public/data/grafo/grafo.nt.gz`): instituciones,
 *    entidades financieras, empresas, proveedores, contrataciones, medidas,
 *    procesos de compra, obras, provincias y conjuntos de datos abiertos, sin
 *    personas naturales;
 *  · una muestra de personas y de los decretos que las nombran, de
 *    iniciativas del Congreso y de las leyes, resoluciones y decretos que
 *    nombran, y de documentos de las bibliotecas institucionales, pedidos uno
 *    a uno a `/api/grafo` (el volcado no los trae);
 *  · unido todo con la ontología (`/ontologia.ttl`): SHACL lee de ahí las
 *    subclases, y los conceptos de las listas cerradas están ahí.
 *
 * Una forma con `sh:class` falla cuando el nodo de llegada no tiene ese
 * tipo. Si es una persona, una norma, una iniciativa o un documento sin **ningún** tipo, es
 * que la muestra no lo describe (el volcado no los trae y solo se piden
 * algunos): eso se cuenta aparte. Cualquier otro nodo sin tipo es una arista
 * colgando —el volcado sí trae todo lo demás— y cuenta como violación.
 *
 * Y ningún IRI del espacio de la versión 1 (`ESPACIO_V1` de `lib/rdf.ts`):
 * el grafo emite solo los de ahora.
 *
 * Uso:
 *     node scripts/validar-grafo.mjs --url http://localhost:3000 [--personas 300] [--iniciativas 200] [--documentos 200]
 * Sale con 1 si hay una violación o un término sin declarar.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { Parser } from "n3";
import rdf from "@zazuko/env-node";
import SHACLValidator from "rdf-validate-shacl";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (nombre, omision) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 ? process.argv[i + 1] : omision;
};
const URL_BASE = arg("url", "http://localhost:3000").replace(/\/$/, "");
const N_PERSONAS = Number(arg("personas", "300"));
const N_INICIATIVAS = Number(arg("iniciativas", "200"));
const N_DOCUMENTOS = Number(arg("documentos", "200"));
const W3ID = /W3ID = "([^"]+)"/.exec(readFileSync(path.join(RAIZ, "lib", "rdf.ts"), "utf8"))[1];
const SOC = `${W3ID}/def/core#`;
const DO = `${W3ID}/def/do#`;
const V1 = /ESPACIO_V1 = "([^"]+)"/.exec(readFileSync(path.join(RAIZ, "lib", "rdf.ts"), "utf8"))[1];
// Lo que la muestra puede no describir: personas, normas, iniciativas y documentos (el volcado no los trae).
const SOLO_EN_MUESTRA = /\/(funcionarios|normativa|congreso|documentos)\//;
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const CLASE_SH = "http://www.w3.org/ns/shacl#ClassConstraintComponent";

const pedir = async (ruta, intento = 0) => {
  let r;
  try {
    r = await fetch(`${URL_BASE}${ruta}`, { signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    // Mientras se lee el volcado (segundos), el servidor cierra por inactivo el
    // socket de la ontología, y el primer pedido que lo reusa falla al enviarse:
    // un GET se repite, una sola vez y solo por eso. Lo demás es un fallo.
    if (intento === 0 && err?.cause?.code === "UND_ERR_SOCKET") return pedir(ruta, 1);
    throw err;
  }
  if (!r.ok) throw new Error(`${ruta} respondió ${r.status}`);
  return r.text();
};
const quads = (texto, formato) => new Parser({ format: formato }).parse(texto);

const t0 = performance.now();
const [ontologia, formas] = await Promise.all([pedir("/ontologia.ttl"), pedir("/ontologia.shacl.ttl")]);
const qOntologia = quads(ontologia, "text/turtle");
const qFormas = quads(formas, "text/turtle");

// Los términos que la ontología declara (clases, propiedades, conceptos y esquemas).
const declarados = new Set(qOntologia.filter((q) => q.predicate.value === RDF_TYPE).map((q) => q.subject.value));

// El volcado, y una muestra de personas: las PEP primero (las que más se
// consultan), luego el resto, en el orden del archivo para que sea estable.
const volcado = quads(gunzipSync(readFileSync(path.join(RAIZ, "public", "data", "grafo", "grafo.nt.gz"))).toString("utf8"), "N-Triples");
if (!volcado.some((q) => q.predicate.value === RDF_TYPE && q.object.value.startsWith(SOC))) {
  console.log("el volcado no usa el núcleo de esta ontología: vuelve a correr scripts/build-grafo-volcado.mjs");
  process.exit(1);
}
const { personas } = JSON.parse(readFileSync(path.join(RAIZ, "public", "data", "funcionarios.json"), "utf8"));
const conNumeral = personas.filter((p) => p.c?.some((c) => c.n != null));
const muestra = [...conNumeral.filter((_, i) => i % Math.max(1, Math.floor(conNumeral.length / (N_PERSONAS / 2))) === 0)];
for (let i = 0; muestra.length < N_PERSONAS && i < personas.length; i += Math.max(1, Math.floor(personas.length / N_PERSONAS))) {
  if (!muestra.includes(personas[i])) muestra.push(personas[i]);
}
const qPersonas = [];
const decretos = new Set();
const enLotes = async (lista, n, hacer) => {
  for (let i = 0; i < lista.length; i += n) await Promise.all(lista.slice(i, i + n).map(hacer));
};
await enLotes(muestra.slice(0, N_PERSONAS), 8, async (p) => {
  const q = quads(await pedir(`/api/grafo?formato=nt&nodo=${encodeURIComponent(`/funcionarios/${p.id}`)}`), "N-Triples");
  qPersonas.push(...q);
  for (const x of q) {
    const m = /\/normativa\/decreto\/([^#/?]+)#id$/.exec(x.object.value);
    if (m) decretos.add(m[1]);
  }
});
await enLotes([...decretos].slice(0, N_PERSONAS), 8, async (n) => {
  qPersonas.push(...quads(await pedir(`/api/grafo?formato=nt&nodo=${encodeURIComponent(`/normativa/decreto/${n}`)}`), "N-Triples"));
});
// Una muestra de iniciativas, las promulgadas primero (las que llevan a una
// norma), luego el resto, en el orden del archivo; y las leyes, resoluciones
// y decretos que nombran.
const { iniciativas } = JSON.parse(readFileSync(path.join(RAIZ, "public", "data", "congreso.json"), "utf8"));
const promulgadas = iniciativas.filas.filter((f) => f[7]);
const muestraIniciativas = promulgadas.filter((_, i) => i % Math.max(1, Math.floor(promulgadas.length / (N_INICIATIVAS / 2))) === 0);
for (let i = 0; muestraIniciativas.length < N_INICIATIVAS && i < iniciativas.filas.length; i += Math.max(1, Math.floor(iniciativas.filas.length / N_INICIATIVAS))) {
  if (!muestraIniciativas.includes(iniciativas.filas[i])) muestraIniciativas.push(iniciativas.filas[i]);
}
const normas = new Set();
await enLotes(muestraIniciativas.slice(0, N_INICIATIVAS), 8, async (f) => {
  const q = quads(await pedir(`/api/grafo?formato=nt&nodo=${encodeURIComponent(`/congreso/${f[0]}`)}`), "N-Triples");
  qPersonas.push(...q);
  for (const x of q) {
    const m = /\/normativa\/(ley|resolucion|decreto)\/([^#/?]+)#id$/.exec(x.object.value);
    if (m) normas.add(`/normativa/${m[1]}/${m[2]}`);
  }
});
await enLotes([...normas].slice(0, N_INICIATIVAS), 8, async (ruta) => {
  qPersonas.push(...quads(await pedir(`/api/grafo?formato=nt&nodo=${encodeURIComponent(ruta)}`), "N-Triples"));
});
// Una muestra de documentos repartida por la biblioteca, en el orden del
// archivo: cada uno por la ruta de su ficha, la dirección de su archivo sin
// `https://` con cada tramo codificado (`enlace.documento` de `lib/grafo.ts`).
const { filas: documentos } = JSON.parse(readFileSync(path.join(RAIZ, "public", "data", "documentos", "filas.json"), "utf8"));
const muestraDocumentos = documentos.filter((_, i) => i % Math.max(1, Math.floor(documentos.length / N_DOCUMENTOS)) === 0).slice(0, N_DOCUMENTOS);
await enLotes(muestraDocumentos, 8, (f) => {
  const ruta = `/documentos/${f[3].replace(/^https:\/\//, "").split("/").map(encodeURIComponent).join("/")}`;
  return pedir(`/api/grafo?formato=nt&nodo=${encodeURIComponent(ruta)}`).then((t) => qPersonas.push(...quads(t, "N-Triples")));
});
const msLeer = performance.now() - t0;

// Los términos del grafo que la ontología no declara, y los de la v1.
const sinDeclarar = new Map();
const deV1 = new Map();
for (const q of [...volcado, ...qPersonas]) {
  for (const termino of [q.subject.value, q.predicate.value, q.object.value]) {
    if (termino.startsWith(V1)) deV1.set(termino, (deV1.get(termino) ?? 0) + 1);
  }
  for (const termino of [q.predicate.value, q.predicate.value === RDF_TYPE ? q.object.value : null]) {
    if (!termino || !(termino.startsWith(SOC) || termino.startsWith(DO)) || declarados.has(termino)) continue;
    sinDeclarar.set(termino, (sinDeclarar.get(termino) ?? 0) + 1);
  }
  // Los conceptos (sector, materia, movimiento, medida) también tienen que existir.
  if (q.object.termType === "NamedNode" && (q.object.value.startsWith(SOC) || q.object.value.startsWith(DO)) && !declarados.has(q.object.value)) {
    sinDeclarar.set(q.object.value, (sinDeclarar.get(q.object.value) ?? 0) + 1);
  }
}

// SHACL sobre todo junto.
const datos = rdf.dataset([...volcado, ...qPersonas, ...qOntologia]);
const t1 = performance.now();
const informe = await new SHACLValidator(rdf.dataset(qFormas), { factory: rdf }).validate(datos);
const msValidar = performance.now() - t1;

const conTipo = new Set([...volcado, ...qPersonas].filter((q) => q.predicate.value === RDF_TYPE).map((q) => q.subject.value));
const grupos = new Map();
let fueraDeMuestra = 0;
for (const r of informe.results) {
  const componente = r.sourceConstraintComponent?.value ?? "";
  if (componente === CLASE_SH && r.value && !conTipo.has(r.value.value) && SOLO_EN_MUESTRA.test(r.value.value)) {
    fueraDeMuestra++;
    continue;
  }
  const k = `${r.sourceShape?.value ?? "?"} · ${r.path?.value ?? "(nodo)"} · ${componente.split("#").pop()}`;
  const g = grupos.get(k) ?? { n: 0, ejemplos: [] };
  g.n++;
  if (g.ejemplos.length < 3) g.ejemplos.push(`${r.focusNode?.value}${r.value ? ` → ${r.value.value}` : ""}`);
  grupos.set(k, g);
}

const nodos = new Set([...volcado, ...qPersonas].map((q) => q.subject.value)).size;
console.log(
  `${(volcado.length + qPersonas.length).toLocaleString("en-US")} triples de ${nodos.toLocaleString("en-US")} nodos ` +
    `(volcado entero, ${muestra.length.toLocaleString("en-US")} personas, ${decretos.size.toLocaleString("en-US")} decretos, ` +
    `${Math.min(muestraIniciativas.length, N_INICIATIVAS).toLocaleString("en-US")} iniciativas y ${Math.min(normas.size, N_INICIATIVAS).toLocaleString("en-US")} normas que nombran, ` +
    `${muestraDocumentos.length.toLocaleString("en-US")} documentos) · ` +
    `leer ${Math.round(msLeer / 1000)} s, validar ${Math.round(msValidar / 1000)} s`,
);
for (const [termino, n] of sinDeclarar) console.log(`SIN DECLARAR ${termino} (${n} veces)`);
for (const [termino, n] of deV1) console.log(`DE LA V1 ${termino} (${n} veces)`);
for (const [k, g] of [...grupos].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`VIOLA ${k}: ${g.n.toLocaleString("en-US")}`);
  for (const e of g.ejemplos) console.log(`      ${e}`);
}
const conforme = grupos.size === 0 && sinDeclarar.size === 0 && deV1.size === 0;
console.log(
  `${conforme ? "conforme" : "no conforme"}: ` +
    `${[...grupos.values()].reduce((s, g) => s + g.n, 0).toLocaleString("en-US")} violaciones, ${sinDeclarar.size} términos sin declarar, ` +
    `${deV1.size} IRIs de la v1, ${fueraDeMuestra.toLocaleString("en-US")} enlaces a personas, normas, iniciativas o documentos fuera de la muestra`,
);
process.exit(conforme ? 0 : 1);
