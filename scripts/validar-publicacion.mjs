#!/usr/bin/env node
/**
 * Lo que la plataforma publica para máquinas, contra un servidor en marcha
 * (`next start`): el gate lo corre tras el build (`.claude/hooks/verificar.sh`,
 * paso 6d; docs/INFRAESTRUCTURA.md §7.3).
 *
 *  1. El catálogo DCAT (`/dcat.ttl`) parsea con N3.js; cada conjunto y cada
 *     distribución llevan título, licencia, fecha y el aviso de herramienta no
 *     oficial; cada distribución, su dirección de descarga, su formato y su
 *     tipo IANA; cada descarga de este sitio responde 200.
 *  2. Negociación: cada ficha de muestra, `/ontologia` y `/def/core` responden
 *     303 al destino de su formato con cada `Accept` RDF, con `Vary: Accept`;
 *     con el de un navegador, la página (y `/def/*`, su 303 a ella, que
 *     también varía).
 *
 * Uso: node scripts/validar-publicacion.mjs --url http://localhost:3000
 */
import { Parser } from "n3";

const i = process.argv.indexOf("--url");
const BASE = (i > 0 ? process.argv[i + 1] : "http://localhost:3000").replace(/\/$/, "");
const SITIO = "https://socratico.vercel.app";
const UA = "Socratico-gate/1.0 (+https://socratico.vercel.app/fuentes)";
const fallos = [];
const mal = (m) => fallos.push(m);

const DCAT = "http://www.w3.org/ns/dcat#";
const DCT = "http://purl.org/dc/terms/";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

/* ------------------------------------------------------------ 1. el catálogo */
const r = await fetch(`${BASE}/dcat.ttl`, { headers: { "User-Agent": UA } });
if (r.status !== 200) mal(`/dcat.ttl → ${r.status}`);
if (!(r.headers.get("content-type") ?? "").startsWith("text/turtle")) mal(`/dcat.ttl con Content-Type ${r.headers.get("content-type")}`);
let quads = [];
try {
  quads = new Parser({ format: "text/turtle", baseIRI: `${SITIO}/dcat.ttl` }).parse(await r.text());
} catch (e) {
  mal(`/dcat.ttl no parsea: ${e.message}`);
}
const de = (s, p) => quads.filter((q) => q.subject.value === s && q.predicate.value === p).map((q) => q.object);
const deTipo = (c) => quads.filter((q) => q.predicate.value === RDF_TYPE && q.object.value === c).map((q) => q.subject.value);
const conjuntos = deTipo(DCAT + "Dataset");
const distribuciones = deTipo(DCAT + "Distribution");
const conAviso = (s) => [...de(s, DCT + "description"), ...de(s, DCT + "rights")].some((o) => /no oficial/.test(o.value));
for (const s of conjuntos) {
  for (const p of ["title", "description", "license", "modified", "publisher"]) if (!de(s, DCT + p).length) mal(`${s} sin dct:${p}`);
  if (!conAviso(s)) mal(`${s} sin el aviso de herramienta no oficial`);
  if (!de(s, DCAT + "distribution").length) mal(`${s} sin distribución`);
}
const descargas = [];
for (const d of distribuciones) {
  for (const p of ["title", "license", "modified", "format"]) if (!de(d, DCT + p).length) mal(`${d} sin dct:${p}`);
  const tipo = de(d, DCAT + "mediaType")[0]?.value ?? "";
  if (!tipo.startsWith("http://www.iana.org/assignments/media-types/")) mal(`${d} sin dcat:mediaType de IANA`);
  if (!conAviso(d)) mal(`${d} sin el aviso de herramienta no oficial`);
  const url = de(d, DCAT + "downloadURL")[0]?.value;
  if (!url) mal(`${d} sin dcat:downloadURL`);
  else descargas.push({ url, tipo: tipo.split("/media-types/")[1] });
}
if (conjuntos.length < 4 || distribuciones.length < 4) mal(`el catálogo trae ${conjuntos.length} conjuntos y ${distribuciones.length} distribuciones`);
// Cada descarga de este sitio existe. HEAD no trae el cuerpo: el volcado pesa 17 MB.
for (const { url, tipo } of descargas) {
  if (!url.startsWith(SITIO + "/")) {
    mal(`descarga fuera del sitio: ${url}`);
    continue;
  }
  const h = await fetch(BASE + url.slice(SITIO.length), { method: "HEAD", headers: { "User-Agent": UA } });
  if (h.status !== 200) mal(`${url} → ${h.status}`);
  // Los archivos de public/ los sirve Next con el tipo de su extensión; las rutas del vocabulario, con el suyo.
  const ct = h.headers.get("content-type") ?? "";
  if (!/\.(gz|parquet)$/.test(url) && !ct.startsWith(tipo)) mal(`${url} con Content-Type ${ct}, el catálogo dice ${tipo}`);
}
const servicios = deTipo(DCAT + "DataService");
for (const sv of servicios) {
  const ep = de(sv, DCAT + "endpointURL")[0]?.value;
  if (!ep?.startsWith(SITIO + "/")) mal(`${sv} sin dcat:endpointURL de este sitio`);
  else {
    // Sin consulta, el punto responde la descripción del servicio.
    const r = await fetch(BASE + ep.slice(SITIO.length), { headers: { Accept: "text/turtle", "User-Agent": UA } });
    if (r.status !== 200) mal(`${ep} → ${r.status}`);
    await r.arrayBuffer();
  }
  if (!conAviso(sv)) mal(`${sv} sin el aviso de herramienta no oficial`);
  for (const p of ["title", "license"]) if (!de(sv, DCT + p).length) mal(`${sv} sin dct:${p}`);
}

/* ---------------------------------------------------------- 2. negociación */
const RDF = [
  ["text/turtle", "ttl"],
  ["application/ld+json", "jsonld"],
  ["application/n-triples", "nt"],
  ["application/trig", "trig"],
  ["application/n-quads", "nq"],
];
const NAVEGADOR = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const casos = [
  // Una ficha: los cinco formatos, a su descripción en /api/grafo.
  { ruta: "/instituciones/4", formatos: RDF, destino: (f) => `/api/grafo?nodo=/instituciones/4&formato=${f}` },
  { ruta: "/procesos/Inst.%20Nac.%20de%20Cancer-DAF-CM-2026-0247", formatos: RDF.slice(0, 1), destino: (f) => `/api/grafo?nodo=/procesos/Inst. Nac. de Cancer-DAF-CM-2026-0247&formato=${f}` },
  { ruta: "/provincias/santiago", formatos: RDF, destino: (f) => `/api/grafo?nodo=/provincias/santiago&formato=${f}` },
  // El vocabulario: tres formatos, a su archivo.
  { ruta: "/ontologia", formatos: RDF.slice(0, 3), destino: (f) => `/ontologia.${f}` },
  { ruta: "/def/core", formatos: RDF.slice(0, 3), destino: (f) => `/ontologia.${f}` },
  { ruta: "/def/do/2.5.0", formatos: RDF.slice(0, 3), destino: (f) => `/ontologia.${f}` },
];
const varia = (h) => (h.headers.get("vary") ?? "").split(",").some((v) => v.trim().toLowerCase() === "accept");
let negociadas = 0;
for (const c of casos) {
  for (const [accept, f] of c.formatos) {
    const h = await fetch(BASE + c.ruta, { redirect: "manual", headers: { Accept: accept, "User-Agent": UA } });
    const loc = h.headers.get("location") ?? "";
    if (h.status !== 303 || !decodeURIComponent(loc).endsWith(c.destino(f))) mal(`${c.ruta} con ${accept} → ${h.status} ${loc}`);
    if (!varia(h)) mal(`${c.ruta} con ${accept}: el 303 no declara Vary: Accept`);
    negociadas++;
  }
  const h = await fetch(BASE + c.ruta, { redirect: "manual", headers: { Accept: NAVEGADOR, "User-Agent": UA } });
  // `/def/*` sin Accept RDF lleva a la página de la ontología; las demás son la página misma.
  // Esa es un 303 que varía por `Accept`; una página la pinta Next, que fija su propio `Vary` (§7.3).
  const def = c.ruta.startsWith("/def/");
  const html = def ? h.status === 303 && (h.headers.get("location") ?? "").endsWith("/ontologia") : h.status === 200 && (h.headers.get("content-type") ?? "").startsWith("text/html");
  if (!html) mal(`${c.ruta} con Accept de navegador → ${h.status} ${h.headers.get("location") ?? h.headers.get("content-type")}`);
  if (def && !varia(h)) mal(`${c.ruta} con Accept de navegador: el 303 no declara Vary: Accept`);
}

if (fallos.length) {
  for (const f of fallos.slice(0, 20)) console.log(`FALLO ${f}`);
  console.log(`publicación: ${fallos.length} fallo(s)`);
  process.exit(1);
}
console.log(
  `publication: DCAT parses (${quads.length} triples, ${conjuntos.length} datasets, ${distribuciones.length} distributions, ${servicios.length} services, every download 200), ${negociadas} RDF negotiations 303 with Vary: Accept`,
);
