/**
 * El trabajador de `scripts/build-textos.mjs` (docs/INFRAESTRUCTURA.md §5.12):
 * saca el texto de un PDF (pdf.js, el mismo que abre el lector de la
 * plataforma), de un DOCX o de un XLSX (`fflate`), página por página —una
 * hoja de cálculo es una página por hoja—. Corre en un hilo aparte para que un
 * PDF que cuelga a pdf.js no cuelgue la descarga: el script lo termina al
 * pasar su plazo y levanta otro.
 *
 * Mensaje: `{ id, tipo: "pdf" | "docx" | "xlsx", datos: ArrayBuffer }`.
 * Respuesta: `{ id, paginas: string[], total: number, recortado: boolean }`
 * (`total`: las páginas del archivo, aunque se lean menos) o `{ id, error }`.
 */
import { parentPort } from "node:worker_threads";
import { decodeXML } from "entities";
import { strFromU8, unzipSync } from "fflate";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Más allá, el documento se lee hasta aquí y se dice. */
const TOPE_PAGINAS = 400;
const TOPE_CARACTERES = 3_000_000;

async function pdf(datos) {
  const tarea = getDocument({
    data: new Uint8Array(datos),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
    stopAtErrors: false,
    verbosity: 0,
  });
  const doc = await tarea.promise;
  const paginas = [];
  let largo = 0;
  const n = Math.min(doc.numPages, TOPE_PAGINAS);
  try {
    for (let i = 1; i <= n && largo < TOPE_CARACTERES; i++) {
      const pagina = await doc.getPage(i);
      const contenido = await pagina.getTextContent();
      const texto = contenido.items.map((x) => ("str" in x ? x.str + (x.hasEOL ? "\n" : "") : "")).join("");
      paginas.push(texto);
      largo += texto.length;
      pagina.cleanup();
    }
  } finally {
    await tarea.destroy();
  }
  return { paginas, total: doc.numPages, recortado: doc.numPages > paginas.length };
}

const textoXml = (xml) =>
  decodeXML(
    xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>|<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  );

function docx(datos) {
  const z = unzipSync(new Uint8Array(datos), { filter: (f) => f.name === "word/document.xml" });
  const xml = z["word/document.xml"];
  if (!xml) throw new Error("docx sin word/document.xml");
  return { paginas: [textoXml(strFromU8(xml)).slice(0, TOPE_CARACTERES)], total: 1, recortado: false };
}

/**
 * Cada hoja, un renglón por fila con sus celdas separadas por « | ». Una
 * columna cuya cabecera es «RNC» (y no nombra la cédula: «RNC/Cédula» mezcla
 * personas) repite su valor como «RNC: …» al final de la fila: es la forma que
 * `mencionesDe` (`lib/texto-extraccion.ts`) reconoce, que nunca toma un número
 * de nueve cifras suelto. Solo una celda de **texto** o un valor con guiones:
 * Excel guarda como número una cédula tecleada sin sus ceros a la izquierda
 * (la 001-1234567-8 queda en 112345678, nueve cifras).
 */
function xlsx(datos) {
  const z = unzipSync(new Uint8Array(datos), {
    filter: (f) => f.name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(f.name),
  });
  const compartidas = [];
  if (z["xl/sharedStrings.xml"]) {
    for (const si of strFromU8(z["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      compartidas.push(decodeXML([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("")));
    }
  }
  const hojas = Object.keys(z)
    .filter((k) => k.startsWith("xl/worksheets/"))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)[1]) - Number(/(\d+)\.xml$/.exec(b)[1]));
  const paginas = [];
  let largo = 0;
  for (const nombre of hojas) {
    if (largo >= TOPE_CARACTERES) break;
    const filas = [];
    let columnaRnc = null;
    for (const fila of strFromU8(z[nombre]).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const celdas = [];
      for (const c of fila[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const atributos = c[1];
        const dentro = c[2] ?? "";
        const columna = /\br="([A-Z]+)\d+"/.exec(atributos)?.[1] ?? null;
        const tipo = /\bt="(\w+)"/.exec(atributos)?.[1];
        let valor;
        if (tipo === "s") valor = compartidas[Number(/<v>([\s\S]*?)<\/v>/.exec(dentro)?.[1])] ?? "";
        else if (tipo === "inlineStr") valor = decodeXML([...dentro.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
        else valor = decodeXML(/<v>([\s\S]*?)<\/v>/.exec(dentro)?.[1] ?? "");
        celdas.push([columna, valor.trim(), tipo === "s" || tipo === "inlineStr" || tipo === "str"]);
      }
      const cabecera = celdas.find(([, v]) => /^R\.?\s?N\.?\s?C\.?(?:\s|$|\/)/i.test(v) && v.length < 40);
      if (cabecera) columnaRnc = /c[ée]d/i.test(cabecera[1]) ? null : cabecera[0];
      const extra = columnaRnc
        ? celdas
            .filter(([col, v, texto]) => col === columnaRnc && (texto ? /^\d[\d-]{7,12}\d$/.test(v) : /^\d{1,3}-\d{2,5}-\d{1,5}-?\d?$/.test(v)))
            .map(([, v]) => ` RNC: ${v}`)
            .join("")
        : "";
      filas.push(celdas.map(([, v]) => v).filter(Boolean).join(" | ") + extra);
    }
    const texto = filas.join("\n");
    paginas.push(texto);
    largo += texto.length;
  }
  return { paginas, total: hojas.length, recortado: paginas.length < hojas.length };
}

parentPort.on("message", async ({ id, tipo, datos }) => {
  try {
    const r = tipo === "pdf" ? await pdf(datos) : tipo === "docx" ? docx(datos) : xlsx(datos);
    parentPort.postMessage({ id, ...r });
  } catch (e) {
    parentPort.postMessage({ id, error: String(e?.message ?? e).slice(0, 200) });
  }
});
