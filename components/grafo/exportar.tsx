"use client";

/**
 * Exportar lo que el lienzo muestra (docs/INFRAESTRUCTURA.md §11.11 y §7.11):
 *
 *  - **el dibujo**: SVG armado con las posiciones y los colores que el lienzo
 *    pinta ahora (`LienzoApi.instantanea()`), y PNG rasterizado de ese mismo
 *    SVG al doble de resolución. La arista derivada por una regla va punteada
 *    de verdad (en WebGL solo es más fina);
 *  - **lo que el grafo dice de cada nodo visible**, en Turtle, JSON-LD y TriG
 *    (con el grafo con nombre de cada triple). Si ningún nodo es de una ruta
 *    con personas naturales, sale de `/sparql` —solo el volcado sin personas,
 *    §7.8— por CONSTRUCT (TriG, por SELECT con `GRAPH`) en tandas de
 *    `VALUES`; lo que el volcado no tiene (un proveedor persona física, una
 *    empresa sin contratos) y, si hay personas, todo, sale **nodo a nodo** de
 *    `/api/grafo` en el mismo formato, hasta
 *    `TOPE_NODO_A_NODO` nodos: lo masivo nunca toca personas (§7.11);
 *  - **GraphML**, los nodos y las aristas del dibujo con su clase, su relación
 *    y su fuente, para Gephi, yEd o Cytoscape.
 *
 * Una vista con alguna ruta personal (§7.11) no se exporta en ningún formato
 * si pasa de `TOPE_NODO_A_NODO` nodos: las personas salen de a una, no en
 * masa. Un proveedor persona física tiene ruta de proveedor y el navegador no
 * lo distingue: el dibujo lo lleva como en pantalla, y su RDF sale de a uno.
 *
 * Cada archivo lleva el aviso de herramienta independiente y no oficial, la
 * fecha del grafo compilado (`/data/grafo/meta.json`: el volcado sale del
 * compilado y lleva su fecha) y el enlace que reproduce la vista. Nada se
 * guarda: el archivo se arma en el navegador y se descarga.
 */
import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Guardar from "@/components/espacios/guardar";
import { Button } from "@/components/ui/button";
import { pedirSparqlTexto, rdfDeNodo } from "@/lib/consultas";
import { formatFecha } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { SITIO } from "@/lib/sitio";
import type { Paleta } from "./motor";
import { FAMILIAS } from "./familias";

/** Lo que el lienzo pinta en un momento, en coordenadas de la vista (px). */
export interface InstantaneaLienzo {
  ancho: number;
  alto: number;
  nodos: { ruta: string; titulo: string; tipo: string; x: number; y: number; radio: number; color: string; rotulo: boolean }[];
  aristas: { de: string; a: string; relacion: string; fuente: string; punteada: boolean; color: string }[];
  paleta: Paleta;
  /** La dirección que reproduce la vista (el estado del lienzo va en ella). */
  enlace: string;
}

/** Cuántos nodos se piden de a uno a `/api/grafo` como mucho. */
export const TOPE_NODO_A_NODO = 40;
/** Cuántos nodos se piden por SPARQL como mucho (en tandas que caben en una consulta). */
export const TOPE_SPARQL = 600;
/** El largo de una consulta: `/sparql` acepta 8,000 caracteres. */
const LARGO_CONSULTA = 7_400;

/** Las rutas cuyos nodos son personas naturales o las nombran: fuera del volcado (§7.8). */
const PERSONALES = ["/funcionarios/", "/normativa/", "/congreso/", "/documentos/", "/constitucional/", "/tse/"];
const esPersonal = (ruta: string) => PERSONALES.some((p) => ruta.startsWith(p));
const sinAncla = (ruta: string) => ruta.split("#")[0];
const iriNodo = (ruta: string) => `${SITIO}${sinAncla(ruta)}#id`;

type Formato = "png" | "svg" | "ttl" | "jsonld" | "trig" | "graphml";

const AVISO = "Socrático.do, herramienta independiente y no oficial, a partir de lo que publica el Estado dominicano.";

/* -------------------------------------------------------------- utilidades */

function escaparXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}

function descargar(contenido: Blob, nombre: string) {
  const url = URL.createObjectURL(contenido);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

let compiladoMemo: Promise<string | null> | null = null;
/** La fecha del grafo compilado, de la que sale el volcado. */
function fechaCompilado(): Promise<string | null> {
  compiladoMemo ??= fetch("/data/grafo/meta.json")
    .then((r) => (r.ok ? (r.json() as Promise<{ generado?: string }>) : null))
    .then((j) => (j?.generado && /^\d{4}-\d{2}-\d{2}$/.test(j.generado) ? j.generado : null))
    .catch(() => {
      compiladoMemo = null;
      return null;
    });
  return compiladoMemo;
}

function lineasAviso(compilado: string | null, enlace: string): string[] {
  return [AVISO, compilado ? `Grafo compilado el ${formatFecha(compilado)} (${compilado}).` : "Fecha del grafo compilado: no se pudo leer.", `Vista: ${enlace}`];
}

/* ------------------------------------------------------------------ dibujo */

/** Cuánto mide un rótulo de 13 px, a ojo (sin medir la fuente: el SVG se abre donde no está). */
const anchoRotulo = (texto: string) => texto.length * 7.4;

function recortarRotulo(titulo: string): string {
  return titulo.length > 48 ? `${titulo.slice(0, 47).trimEnd()}…` : titulo;
}

/** La altura del pie: la leyenda de familias y el aviso. */
const altoPie = (aviso: string[]) => 18 * aviso.length + 44;

function aSvg(v: InstantaneaLienzo, aviso: string[]): string {
  const p = v.paleta;
  const alto = Math.round(v.alto + altoPie(aviso));
  const ancho = Math.round(v.ancho);
  const pos = new Map(v.nodos.map((n) => [n.ruta, n]));
  const fuente = escaparXml(p.fuente);
  const out: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" font-family="${fuente}">`,
    `<title>${escaparXml(`Lienzo del grafo de Socrático.do: ${v.nodos.length} nodos y ${v.aristas.length} aristas`)}</title>`,
    `<desc>${escaparXml(aviso.join(" "))}</desc>`,
    `<rect width="100%" height="100%" fill="${p.papel}"/>`,
    `<g fill="none" stroke-linecap="round">`,
  ];
  for (const a of v.aristas) {
    const de = pos.get(a.de);
    const al = pos.get(a.a);
    if (!de || !al) continue;
    out.push(
      `<line x1="${de.x.toFixed(1)}" y1="${de.y.toFixed(1)}" x2="${al.x.toFixed(1)}" y2="${al.y.toFixed(1)}" stroke="${a.color}" stroke-width="1"${a.punteada ? ' stroke-dasharray="4 3"' : ""}><title>${escaparXml(a.relacion)}</title></line>`,
    );
  }
  out.push(`</g><g>`);
  for (const n of v.nodos) {
    out.push(
      `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${Math.max(2, n.radio).toFixed(1)}" fill="${n.color}" stroke="${p.papel}" stroke-width="1.5"><title>${escaparXml(`${n.titulo} · ${n.tipo}`)}</title></circle>`,
    );
  }
  // Rótulos sin encimarse: primero los nodos grandes (abiertos y semillas); uno que choca con otro ya puesto se calla (su nombre sigue en el `<title>` del punto).
  out.push(`</g><g font-size="13" font-weight="500" fill="${p.tinta}" stroke="${p.papel}" stroke-width="3" paint-order="stroke">`);
  const puestos: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const n of [...v.nodos].filter((n) => n.rotulo).sort((a, b) => b.radio - a.radio)) {
    const texto = recortarRotulo(n.titulo);
    const caja = { x0: n.x + n.radio + 2, y0: n.y - 9, x1: n.x + n.radio + 6 + anchoRotulo(texto), y1: n.y + 8 };
    if (puestos.some((c) => caja.x0 < c.x1 && c.x0 < caja.x1 && caja.y0 < c.y1 && c.y0 < caja.y1)) continue;
    puestos.push(caja);
    out.push(`<text x="${(n.x + n.radio + 4).toFixed(1)}" y="${(n.y + 4).toFixed(1)}">${escaparXml(texto)}</text>`);
  }
  out.push(`</g>`);
  // La leyenda: cada familia presente con su punto y su nombre (el color nunca es la única lectura).
  const presentes = new Set(v.nodos.map((n) => n.color));
  const leyenda = [
    ...FAMILIAS.map((f) => ({ color: p.familias[f.paso], etiqueta: f.etiqueta })),
    { color: p.otros, etiqueta: "Otros" },
  ].filter((e) => presentes.has(e.color));
  let x = 12;
  out.push(`<g font-size="12" fill="${p.tinta}">`);
  for (const e of leyenda) {
    out.push(`<circle cx="${x + 5}" cy="${(v.alto + 16).toFixed(0)}" r="5" fill="${e.color}"/>`, `<text x="${x + 14}" y="${(v.alto + 20).toFixed(0)}">${escaparXml(e.etiqueta)}</text>`);
    x += 14 + e.etiqueta.length * 6.9 + 18;
  }
  out.push(`</g><g font-size="12" fill="${p.tintaSuave}">`);
  aviso.forEach((l, i) => out.push(`<text x="12" y="${(v.alto + 48 + i * 18).toFixed(0)}">${escaparXml(l)}</text>`));
  out.push(`</g></svg>`);
  return out.join("\n");
}

async function aPng(svg: string, ancho: number, alto: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((ok, mal) => {
      img.onload = () => ok();
      img.onerror = () => mal(new Error("El navegador no pudo leer el dibujo."));
      img.src = url;
    });
    const escala = 2;
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(ancho * escala);
    lienzo.height = Math.round(alto * escala);
    const ctx = lienzo.getContext("2d");
    if (!ctx) throw new Error("El navegador no dio un lienzo 2D.");
    ctx.scale(escala, escala);
    ctx.drawImage(img, 0, 0, ancho, alto);
    return await new Promise<Blob>((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo escribir el PNG."))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------------------------------------------------------------- GraphML */

function aGraphml(v: InstantaneaLienzo, aviso: string[]): string {
  const out = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- ${aviso.map((l) => l.replace(/--/g, "–")).join("\n     ")} -->`,
    `<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">`,
    `  <key id="label" for="node" attr.name="label" attr.type="string"/>`,
    `  <key id="clase" for="node" attr.name="clase" attr.type="string"/>`,
    `  <key id="ficha" for="node" attr.name="ficha" attr.type="string"/>`,
    `  <key id="x" for="node" attr.name="x" attr.type="double"/>`,
    `  <key id="y" for="node" attr.name="y" attr.type="double"/>`,
    `  <key id="color" for="node" attr.name="color" attr.type="string"/>`,
    `  <key id="relacion" for="edge" attr.name="label" attr.type="string"/>`,
    `  <key id="fuente" for="edge" attr.name="fuente" attr.type="string"/>`,
    `  <key id="derivada" for="edge" attr.name="derivada" attr.type="boolean"/>`,
    `  <graph id="lienzo" edgedefault="directed">`,
    `    <desc>${escaparXml(aviso.join(" "))}</desc>`,
  ];
  for (const n of v.nodos) {
    out.push(
      `    <node id="${escaparXml(iriNodo(n.ruta))}">`,
      `      <data key="label">${escaparXml(n.titulo)}</data>`,
      `      <data key="clase">${escaparXml(n.tipo)}</data>`,
      `      <data key="ficha">${escaparXml(`${SITIO}${sinAncla(n.ruta)}`)}</data>`,
      `      <data key="x">${n.x.toFixed(2)}</data>`,
      `      <data key="y">${n.y.toFixed(2)}</data>`,
      `      <data key="color">${escaparXml(n.color)}</data>`,
      `    </node>`,
    );
  }
  v.aristas.forEach((a, i) => {
    out.push(
      `    <edge id="e${i}" source="${escaparXml(iriNodo(a.de))}" target="${escaparXml(iriNodo(a.a))}">`,
      `      <data key="relacion">${escaparXml(a.relacion)}</data>`,
      `      <data key="fuente">${escaparXml(a.fuente)}</data>`,
      `      <data key="derivada">${a.punteada}</data>`,
      `    </edge>`,
    );
  });
  out.push(`  </graph>`, `</graphml>`, ``);
  return out.join("\n");
}

/* --------------------------------------------------------------------- RDF */

/*
  El grafo no tiene nodos en blanco (los IRI son de la plataforma o de la
  fuente), así que documentos de Turtle o TriG se pueden poner uno tras otro:
  un `@prefix` repetido es legal en cualquier punto. Turtle y JSON-LD los
  escribe el servidor (`lib/rdf.ts`, por CONSTRUCT en `/sparql` y por
  `/api/grafo`); el navegador no carga los serializadores.
*/

type FormatoRdf = "ttl" | "jsonld" | "trig";

/** Lo que `/sparql` y `/api/grafo` sirven en cada formato. */
const ACEPTA: Record<FormatoRdf, string> = { ttl: "text/turtle", jsonld: "application/ld+json", trig: "application/trig" };

/** Las rutas en tandas de `VALUES` que caben en una consulta (relativas a la base de `/sparql`, `${SITIO}/`). */
function tandas(rutas: string[]): string[] {
  const salida: string[] = [];
  let tanda: string[] = [];
  let largo = 0;
  for (const r of rutas) {
    const ref = `<${sinAncla(r).slice(1)}#id>`;
    if (largo + ref.length + 1 > LARGO_CONSULTA && tanda.length) {
      salida.push(tanda.join(" "));
      tanda = [];
      largo = 0;
    }
    tanda.push(ref);
    largo += ref.length + 1;
  }
  if (tanda.length) salida.push(tanda.join(" "));
  return salida;
}

/** N-Triples de un término de los resultados de SPARQL: lo que TriG acepta tal cual. */
function termino(c: { type: string; value: string; "xml:lang"?: string; datatype?: string }): string {
  if (c.type === "uri") return `<${c.value}>`;
  const v = `"${c.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
  if (c["xml:lang"]) return `${v}@${c["xml:lang"]}`;
  return c.datatype && c.datatype !== "http://www.w3.org/2001/XMLSchema#string" ? `${v}^^<${c.datatype}>` : v;
}

interface Partes {
  /** Documentos en el formato pedido, uno tras otro. */
  documentos: string[];
  /** Los IRI de nodo que el volcado tiene. */
  sujetos: Set<string>;
  truncada: boolean;
}

/** Lo que el volcado sin personas dice de cada nodo, por SPARQL. */
async function porSparql(rutas: string[], formato: FormatoRdf): Promise<Partes> {
  const partes: Partes = { documentos: [], sujetos: new Set(), truncada: false };
  for (const valores of tandas(rutas)) {
    // Qué nodos tiene el volcado: lo que no, se pide de a uno.
    const presentes = await pedirSparqlTexto(`SELECT DISTINCT ?s WHERE { VALUES ?s { ${valores} } ?s ?p ?o }`, "application/sparql-results+json");
    for (const f of (JSON.parse(presentes.texto) as { results?: { bindings?: { s?: { value: string } }[] } }).results?.bindings ?? []) {
      if (f.s) partes.sujetos.add(f.s.value);
    }
    if (formato === "trig") {
      // CONSTRUCT no lleva grafos: el grafo con nombre de cada triple sale de un SELECT y se escribe en bloques.
      const r = await pedirSparqlTexto(`SELECT ?g ?s ?p ?o WHERE { VALUES ?s { ${valores} } GRAPH ?g { ?s ?p ?o } }`, "application/sparql-results+json");
      partes.truncada ||= r.truncada;
      const porGrafo = new Map<string, string[]>();
      type Celda = { type: string; value: string; "xml:lang"?: string; datatype?: string };
      for (const f of (JSON.parse(r.texto) as { results?: { bindings?: Record<string, Celda>[] } }).results?.bindings ?? []) {
        if (!f.g || !f.s || !f.p || !f.o) continue;
        const lista = porGrafo.get(f.g.value) ?? [];
        lista.push(`    ${termino(f.s)} ${termino(f.p)} ${termino(f.o)} .`);
        porGrafo.set(f.g.value, lista);
      }
      for (const [g, lineas] of porGrafo) partes.documentos.push(`<${g}> {\n${lineas.join("\n")}\n}\n`);
    } else {
      const r = await pedirSparqlTexto(`CONSTRUCT { ?s ?p ?o } WHERE { VALUES ?s { ${valores} } ?s ?p ?o }`, ACEPTA[formato]);
      partes.truncada ||= r.truncada;
      partes.documentos.push(r.texto);
    }
  }
  return partes;
}

/** Lo que `/api/grafo` dice de cada nodo, de a uno (de a cuatro en vuelo). */
async function nodoANodo(rutas: string[], formato: FormatoRdf): Promise<{ documentos: string[]; fallidos: number }> {
  const documentos: string[] = [];
  let fallidos = 0;
  for (let i = 0; i < rutas.length; i += 4) {
    const lote = await Promise.all(
      rutas.slice(i, i + 4).map((ruta) => rdfDeNodo(sinAncla(ruta), formato)),
    );
    for (const d of lote) {
      if (d) documentos.push(d);
      else fallidos++;
    }
  }
  return { documentos, fallidos };
}

const RDFS_COMMENT = "http://www.w3.org/2000/01/rdf-schema#comment";
const DCT = "http://purl.org/dc/terms/";

/** El archivo: el aviso, lo que se dice de la vista (de dónde sale, de cuándo es el grafo) y los documentos. */
function armarRdf(formato: FormatoRdf, documentos: string[], aviso: string[], enlace: string, compilado: string | null): string {
  const vista = `<${enlace.replace(/[\u0000- <>"{}|^`\\]/g, (c) => encodeURIComponent(c))}>`;
  const comentario = termino({ type: "literal", value: aviso.join(" "), "xml:lang": "es" });
  if (formato === "jsonld") {
    const contexto: Record<string, unknown> = {};
    const grafo: unknown[] = [
      {
        "@id": vista.slice(1, -1),
        [RDFS_COMMENT]: { "@value": aviso.join(" "), "@language": "es" },
        [`${DCT}publisher`]: { "@id": SITIO },
        ...(compilado ? { [`${DCT}modified`]: { "@value": compilado, "@type": "http://www.w3.org/2001/XMLSchema#date" } } : {}),
      },
    ];
    for (const d of documentos) {
      const j = JSON.parse(d) as { "@context"?: Record<string, unknown>; "@graph"?: unknown[] };
      Object.assign(contexto, j["@context"] ?? {});
      grafo.push(...(j["@graph"] ?? []));
    }
    return JSON.stringify({ "@context": contexto, "@graph": grafo }, null, 2);
  }
  const meta = [
    `${vista} <${RDFS_COMMENT}> ${comentario} ;`,
    `    <${DCT}publisher> <${SITIO}>${compilado ? " ;" : " ."}`,
    ...(compilado ? [`    <${DCT}modified> "${compilado}"^^<http://www.w3.org/2001/XMLSchema#date> .`] : []),
  ];
  return [...aviso.map((l) => `# ${l}`), "", ...meta, "", ...documentos].join("\n");
}

/* -------------------------------------------------------------- componente */

/** FNV-1a de 32 bits, en base 36: la clave corta de una vista larga. */
function huella(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/**
 * «Guardar esta vista»: una entrada de tipo `busqueda` en `espacios` con la
 * dirección de la vista —su estado entero va en la URL—, nunca lo que dice el
 * grafo (§10.5). `ref` admite 300 caracteres: una dirección más larga se
 * guarda con su huella; `href` admite 1,000 (`href_valido`): una vista que no
 * cabe lo dice y no ofrece guardar.
 */
function GuardarVista({ titulo, nodos }: { titulo: string | null; nodos: number }) {
  const ruta = usePathname();
  const params = useSearchParams();
  const consulta = params.toString();
  const href = consulta ? `${ruta}?${consulta}` : ruta;
  if (href.length > 1_000 || /[\s\\]/.test(href)) {
    return (
      <p className="text-xs text-ink-soft">
        Esta vista no se puede guardar en tu espacio: su enlace mide {formatInt(href.length)} caracteres y caben 1,000. Con menos semillas, sí.
      </p>
    );
  }
  const ref = href.length <= 300 ? href : `lienzo:${huella(href)}`;
  const nombre = titulo ? `Red de ${titulo}${nodos > 1 ? ` y ${formatInt(nodos - 1)} nodos más` : ""}` : `Red de ${formatInt(nodos)} nodos`;
  return <Guardar referencia={{ tipo: "busqueda", ref, titulo: `Lienzo: ${nombre}`.slice(0, 500), href }} />;
}

export function Exportar({ obtener, titulo, nodos }: { obtener: () => InstantaneaLienzo | null; titulo: string | null; nodos: number }) {
  const [estado, setEstado] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function exportar(formato: Formato) {
    const v = obtener();
    if (!v || v.nodos.length === 0) {
      setEstado("No hay nada dibujado que exportar.");
      return;
    }
    setOcupado(true);
    setEstado("Preparando el archivo…");
    try {
      // Lo masivo nunca toca personas (§7.11): una vista con personas se exporta, en cualquier formato, hasta el tope de a uno.
      const rutas = [...new Set(v.nodos.map((n) => sinAncla(n.ruta)))];
      const personales = rutas.filter(esPersonal);
      if (personales.length && rutas.length > TOPE_NODO_A_NODO) {
        setEstado(
          `La vista tiene ${formatInt(personales.length)} ${personales.length === 1 ? "nodo que es o nombra a una persona" : "nodos que son o nombran a personas"}: con personas, se exporta hasta ${TOPE_NODO_A_NODO} nodos, y aquí hay ${formatInt(rutas.length)}. Oculta o filtra por clase y vuelve a intentar.`,
        );
        return;
      }
      const compilado = await fechaCompilado();
      const aviso = lineasAviso(compilado, v.enlace);
      const dia = new Date().toISOString().slice(0, 10);
      const base = `socratico-lienzo-${dia}`;
      if (formato === "svg" || formato === "png") {
        const svg = aSvg(v, aviso);
        if (formato === "svg") descargar(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${base}.svg`);
        else descargar(await aPng(svg, Math.round(v.ancho), Math.round(v.alto + altoPie(aviso))), `${base}.png`);
        setEstado(`Se descargó el dibujo: ${formatInt(v.nodos.length)} nodos y ${formatInt(v.aristas.length)} aristas.`);
        return;
      }
      if (formato === "graphml") {
        descargar(new Blob([aGraphml(v, aviso)], { type: "application/graphml+xml;charset=utf-8" }), `${base}.graphml`);
        setEstado(`Se descargó el GraphML: ${formatInt(v.nodos.length)} nodos y ${formatInt(v.aristas.length)} aristas.`);
        return;
      }

      // RDF: el volcado sin personas por SPARQL; lo demás, de a un nodo y con tope.
      const publicas = personales.length ? [] : rutas;
      if (publicas.length > TOPE_SPARQL) {
        setEstado(`La vista tiene ${formatInt(publicas.length)} nodos; el RDF se exporta hasta ${formatInt(TOPE_SPARQL)}. Oculta o filtra por clase y vuelve a intentar.`);
        return;
      }
      const f = formato as FormatoRdf;
      const documentos: string[] = [];
      let truncada = false;
      let deUno: string[] = rutas;
      if (publicas.length) {
        setEstado(`Consultando el volcado sin personas por SPARQL (${formatInt(publicas.length)} nodos)…`);
        const r = await porSparql(publicas, f);
        documentos.push(...r.documentos);
        truncada = r.truncada;
        // Lo que el volcado no tiene (un proveedor persona física, una empresa sin contratos) se pide de a uno.
        deUno = publicas.filter((ruta) => !r.sujetos.has(iriNodo(ruta)));
      }
      let fallidos = 0;
      let omitidos = 0;
      if (deUno.length) {
        omitidos = Math.max(0, deUno.length - TOPE_NODO_A_NODO);
        setEstado(`Leyendo de a uno ${formatInt(Math.min(deUno.length, TOPE_NODO_A_NODO))} nodos…`);
        const r = await nodoANodo(deUno.slice(0, TOPE_NODO_A_NODO), f);
        documentos.push(...r.documentos);
        fallidos = r.fallidos;
      }
      const contenido = armarRdf(f, documentos, aviso, v.enlace, compilado);
      descargar(new Blob([contenido], { type: `${ACEPTA[f]};charset=utf-8` }), `${base}.${f}`);
      const notas = [
        truncada ? "una tanda llegó cortada por el tope de filas de SPARQL" : null,
        fallidos ? `${formatInt(fallidos)} ${fallidos === 1 ? "nodo no se pudo leer" : "nodos no se pudieron leer"}` : null,
        omitidos ? `${formatInt(omitidos)} ${omitidos === 1 ? "nodo quedó fuera" : "nodos quedaron fuera"} del tope de ${TOPE_NODO_A_NODO} de a uno` : null,
      ].filter(Boolean);
      const leidos = rutas.length - fallidos - omitidos;
      setEstado(`Se descargó lo que el grafo dice de ${formatInt(leidos)} ${leidos === 1 ? "nodo" : "nodos"}${notas.length ? `; ${notas.join("; ")}` : ""}.`);
    } catch (e) {
      const red = e instanceof TypeError; // `fetch` sin red: el mensaje del navegador viene en inglés.
      setEstado(red ? "No se pudo exportar: la conexión se cortó. Vuelve a intentar." : `No se pudo exportar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupado(false);
    }
  }

  const boton = (formato: Formato, etiqueta: string) => (
    <Button variant="secondary" size="sm" disabled={ocupado} onClick={() => void exportar(formato)}>
      {etiqueta}
    </Button>
  );

  return (
    <section aria-labelledby="lienzo-exportar" className="space-y-2">
      <h3 id="lienzo-exportar" className="rotulo text-ink-soft">
        Exportar o guardar esta vista
      </h3>
      <GuardarVista titulo={titulo} nodos={nodos} />
      <div className="flex flex-wrap gap-1.5">
        {boton("png", "PNG")}
        {boton("svg", "SVG")}
        {boton("ttl", "Turtle")}
        {boton("jsonld", "JSON-LD")}
        {boton("trig", "TriG")}
        {boton("graphml", "GraphML")}
      </div>
      <p className="text-xs leading-relaxed text-ink-soft">
        PNG y SVG, el dibujo; GraphML, sus nodos y aristas. Turtle, JSON-LD y TriG, lo que el grafo dice de cada nodo visible: del volcado sin personas
        naturales por SPARQL (hasta {formatInt(TOPE_SPARQL)} nodos) o, si la vista tiene personas, de a un nodo. Con personas, ningún formato pasa de{" "}
        {TOPE_NODO_A_NODO} nodos. Cada archivo lleva el aviso de herramienta no oficial, la fecha del grafo compilado y el enlace de esta vista.
        Guardar en tu espacio guarda solo ese enlace, no los datos.
      </p>
      <p aria-live="polite" className="text-xs text-ink-soft">
        {estado}
      </p>
    </section>
  );
}
