#!/usr/bin/env node
/**
 * Comprueba que (docs/INFRAESTRUCTURA.md §7.1) ninguna
 * ficha pinta una cita de norma, un código de proceso o un SNIP **sin
 * enlace**. Recorre fichas de muestra en un servidor en marcha y busca esas
 * formas en el texto que no está dentro de un `<a>`.
 *
 * Uso, con `npm run build && npx next start -p 3500` en otra terminal:
 *     node scripts/menciones-sin-enlace.mjs [http://localhost:3500]
 *
 * Sale con 1 si encuentra alguna, y dice dónde. Las fichas de muestra están
 * abajo; una ficha nueva se añade a la lista.
 */
import * as cheerio from "cheerio";

const BASE = process.argv[2] ?? "http://localhost:3500";
const FICHAS = [
  "/instituciones/237-minerd",
  "/instituciones/5-mopc",
  "/finanzas/0206",
  "/provincias/santiago",
  "/normativa/ley/47-25",
  "/normativa/decreto/38-25",
  "/obras",
  "/congreso",
  "/constitucional",
  "/tse",
  "/congreso/159814",
  "/obras/12416",
  "/congreso/senado/2024-2028/40147",
  "/congreso/legisladores/3680",
  "/proveedores/7003",
  "/procesos/DAEH-DAF-CM-2026-0014",
];

// Las mismas formas que reconoce `lib/grafo.ts`.
const FORMAS = [
  ["cita de norma", /\b(?:ley|decreto|reglamento|resoluci[oó]n)\s+(?:(?:n[uú]m|no)\.?\s*)?\d{1,4}-\d{2,4}\b/giu],
  ["código de proceso", /\b[A-Z0-9]{2,15}(?:-[A-Z0-9]{1,10}){2,4}-\d{4}-\d{3,5}\b/g],
  ["SNIP", /\bSNIP\s*(?:n[uú]m\.?\s*|:\s*)?\d{3,7}\b/gi],
];

/**
 * El texto fuera de enlaces, de scripts y de lo que no se lee, con un
 * espacio entre nodos (dos celdas vecinas no son una palabra). Del `body`
 * entero y no de `#contenido`: la página llega por streaming y lo que manda
 * cada `Suspense` viaja en segmentos ocultos al final del documento, igual
 * que el `<title>`.
 */
function textoSinEnlaces($) {
  const raiz = $("body");
  // El pie y la cabecera son de la plataforma, no de la ficha: el criterio
  // es lo que la ficha pinta. (El pie cita las leyes 172-13 y 200-04, que la
  // Consultoría no nos entrega: enlazarlas llevaría a «no tenemos el texto».)
  raiz.find("header").first().remove();
  raiz.find("a, script, style, noscript, template, button, title, meta, footer").remove();
  const partes = [];
  const recorrer = (nodos) => {
    for (const n of nodos) {
      if (n.type === "text") partes.push(n.data);
      else if (n.children) recorrer(n.children);
    }
  };
  recorrer(raiz.toArray());
  return partes.join(" ");
}

/** Adónde llevaría la mención, con la misma forma que `enlace.*`. */
function destino(nombre, mencion) {
  const plano = mencion.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (nombre === "SNIP") return `/obras/${/\d+/.exec(plano)[0]}`;
  if (nombre === "código de proceso") return `/procesos/${mencion.toUpperCase()}`;
  const tipo = /^(ley|decreto|reglamento|resolucion)/.exec(plano)?.[1];
  const numero = /\d{1,4}-\d{2,4}/.exec(plano)[0].replace(/^(\d{1,4})-(?:19|20)(\d{2})$/, (m, a, b) => (tipo === "ley" || tipo === "decreto" ? `${a}-${b}` : m));
  return `/normativa/${tipo}/${numero}`;
}

let hallazgos = 0;
for (const ruta of FICHAS) {
  const res = await fetch(BASE + ruta).catch(() => null);
  if (!res?.ok) {
    console.log(`? ${ruta}: ${res ? res.status : "sin respuesta"}`);
    continue;
  }
  const html = await res.text();
  // Los destinos que la página ya enlaza en algún sitio: una fila cuya
  // tarjeta entera lleva a la obra no necesita otro enlace sobre su SNIP.
  const enlazados = new Set([ruta, ...[...html.matchAll(/href="([^"]+)"/g)].map((m) => decodeURIComponent(m[1]))]);
  const texto = textoSinEnlaces(cheerio.load(html)).replace(/\s+/g, " ");
  for (const [nombre, re] of FORMAS) {
    for (const m of texto.matchAll(re)) {
      if (enlazados.has(destino(nombre, m[0]))) continue;
      hallazgos++;
      console.log(`✗ ${ruta}: ${nombre} sin enlace — «…${texto.slice(Math.max(0, m.index - 40), m.index + m[0].length + 20)}…»`);
    }
  }
}
console.log(hallazgos ? `${hallazgos} menciones sin enlace` : "Ninguna mención sin enlace en las fichas de muestra");
process.exit(hallazgos ? 1 : 0);
