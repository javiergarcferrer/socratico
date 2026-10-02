/**
 * Mantenimientos programados de las distribuidoras — Edenorte y Edesur.
 *
 * Mecánica verificada en docs/INFRAESTRUCTURA.md §5.4 (recon del 2026-09-24, con
 * este User-Agent y `robots.txt` leído antes en cada host: ambos permiten `/`).
 * Responde a «¿me van a quitar la luz esta semana?» con lo único que las
 * empresas publican **por adelantado**: los cortes por trabajos en la red. Las
 * averías y los apagones por déficit de generación no se anuncian y no están
 * aquí; la generación del día vive en `lib/energia.ts`.
 *
 * **Edenorte** (WordPress): el feed RSS de la categoría
 *
 *   https://edenorte.com.do/category/programa-de-mantenimiento-de-redes/feed/
 *
 * → 200 `application/rss+xml`, las 10 entradas más recientes (~530 KB), una
 * por semana («Mantenimientos programados del 12 al 18 de septiembre de
 * 2026»). El `content:encoded` de cada una trae **una** tabla HTML
 * Municipio | Circuito | Fecha | Periodo | Zonas Afectadas | Causa, ~140–240
 * filas por semana. Peculiaridades:
 *  - La REST de WordPress está cerrada (`/wp-json/wp/v2/posts` → 401): el feed
 *    es la vía.
 *  - Fecha `D/M/AAAA` sin ceros; período en 12 horas con puntos
 *    («9:00 a. m. a 12:00 p. m.»). Aquí se pasa a `HH:MM` de 24 horas; si una
 *    fila no casa con ese patrón se conserva el texto tal cual en `desde`.
 *  - Da municipio y circuito, **no provincia**. La causa viene en mayúsculas
 *    («PODA PREVENTIVO»).
 *  - La semana se publica tarde o no se publica: el 2026-09-24 la entrada más
 *    reciente seguía siendo la del 12 al 18 de septiembre. Por eso se devuelve
 *    la última semana publicada, para que la interfaz lo diga en vez de
 *    callarlo como «no hay cortes».
 *  - Lectura acotada: las `TOPE_ENTRADAS` entradas más recientes del feed.
 *    Las encabezadas por una columna que no se reconoce se descartan.
 *
 * **Edesur** (Umbraco, HTML servido desde el servidor):
 *
 *   https://edesur.com.do/enlaces-empresa/mantenimientos-programados/
 *
 * → 200 `text/html`, ~145 KB: la semana en curso (sábado a viernes) en siete
 * pestañas. Cada botón `#pills-<uuid>-tab` lleva la fecha («19 de septiembre,
 * 2026»); su panel `#pills-<uuid>` agrupa por **provincia** (`<h4>` de un
 * acordeón) y dentro, pares `<h5 class="title-zona">Zonas en mantenimiento
 * 09:00 a. m. a 03:00 p. m.</h5>` + `<p>` con los sectores. Peculiaridades:
 *  - No publica circuito, municipio ni causa: el rótulo «Mantenimiento
 *    Programado» de cada provincia es un tipo fijo, no una causa.
 *  - Un día sin trabajos trae «No hay trabajos de mantenimiento programados
 *    para…» (bloque `.no-activity`); eso es un día vacío, no una caída.
 *  - Solo la semana en curso: los días ya pasados siguen en la página hasta
 *    que cambia la semana. Lectura acotada: la página tal como se sirve.
 *
 * **Edeeste** publica solo un PDF semanal en
 * `https://edeeste.com.do/index.php/inicio/aprende-con-edeeste/programa-de-mantenimiento/`:
 * fuera de alcance, se enlaza.
 *
 * Solo se quedan las filas con fecha de hoy o posterior (día calendario de
 * Santo Domingo): un mantenimiento pasado no es noticia. Cada empresa se
 * degrada a `null` por su cuenta; esta función nunca lanza.
 */

import { desentidades } from "@/lib/html";
import { MESES, numeroMes } from "@/lib/format";
import { pedirTexto } from "@/lib/pedir";

const USER_AGENT = "Socratico-Inteligencia/1.0 (mantenimientos programados; herramienta independiente)";
const REVALIDAR = 21_600; // 6 h: las empresas publican una vez por semana.
const TOPE_ENTRADAS = 2;

export const URL_EDENORTE_FEED = "https://edenorte.com.do/category/programa-de-mantenimiento-de-redes/feed/";
export const URL_EDENORTE_PAGINA = "https://edenorte.com.do/category/programa-de-mantenimiento-de-redes/";
export const URL_EDESUR = "https://edesur.com.do/enlaces-empresa/mantenimientos-programados/";
export const URL_EDEESTE = "https://edeeste.com.do/index.php/inicio/aprende-con-edeeste/programa-de-mantenimiento/";

export type Empresa = "edenorte" | "edesur";

export const NOMBRE_EMPRESA: Record<Empresa, string> = {
  edenorte: "Edenorte",
  edesur: "Edesur",
};

export interface Corte {
  empresa: Empresa;
  provincia: string | null;
  municipio: string | null;
  circuito: string | null;
  /** Día calendario dominicano, `AAAA-MM-DD`. */
  fecha: string;
  /** `HH:MM` de 24 horas; el texto publicado tal cual si no se pudo leer. */
  desde: string;
  hasta: string;
  zonas: string;
  causa: string | null;
  /** La página de la empresa donde está publicada la fila. */
  url: string;
}

export interface FuenteCortes {
  empresa: Empresa;
  nombre: string;
  /** Lo que se lee (el feed o la página). */
  lectura: string;
  /** La página que ve una persona. */
  pagina: string;
  /** La semana que cubre lo último publicado, como `AAAA-MM-DD`. */
  semanaDesde: string | null;
  semanaHasta: string | null;
  /** Título de la última entrada publicada (Edenorte) o rango de la página (Edesur). */
  ultimaPublicacion: string | null;
  /** Instante de publicación de la última entrada (el `pubDate` de Edenorte); Edesur no lo da. */
  publicado: string | null;
  /** Filas leídas en total, pasadas incluidas. */
  leidas: number;
}

export interface Cortes {
  edenorte: Corte[] | null;
  edesur: Corte[] | null;
  fuentes: {
    edenorte: FuenteCortes;
    edesur: FuenteCortes;
    edeeste: { nombre: string; pagina: string };
  };
  /** Hoy en Santo Domingo, `AAAA-MM-DD`: el corte de «de hoy en adelante». */
  hoy: string;
}

function pedir(url: string, tipo: RegExp): Promise<string | null> {
  return pedirTexto(url, { fuente: "cortes", ua: USER_AGENT, tipo, revalidate: REVALIDAR });
}

function decodificar(s: string): string {
  return desentidades(s);
}

/** Texto plano de un fragmento HTML: sin etiquetas, entidades resueltas, espacios colapsados. */
function texto(html: string): string {
  return decodificar(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** «9:00 a. m.» → «09:00»; `null` si no casa. */
function hora24(s: string): string | null {
  const m = /^(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?$/i.exec(s.trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "p") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** «9:00 a. m. a 12:00 p. m.» → ["09:00", "12:00"]; si no casa, el texto en `desde`. */
function ventana(s: string): { desde: string; hasta: string } {
  const partes = s.split(/\s+a\s+(?=\d)/);
  if (partes.length === 2) {
    const d = hora24(partes[0]);
    const h = hora24(partes[1]);
    if (d && h) return { desde: d, hasta: h };
  }
  return { desde: s.trim(), hasta: "" };
}


function iso(a: number, m: number, d: number): string | null {
  if (!(a > 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** «14/9/2026» → «2026-09-14». */
function fechaNumerica(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  return m ? iso(Number(m[3]), Number(m[2]), Number(m[1])) : null;
}

/** «19 de septiembre, 2026» / «19 de septiembre de 2026» → «2026-09-19». */
function fechaEnLetras(s: string): string | null {
  const m = /(\d{1,2})\s+de\s+([a-záéíóú]+),?\s+(?:de\s+)?(\d{4})/i.exec(s);
  if (!m) return null;
  const mes = numeroMes(m[2]);
  return mes ? iso(Number(m[3]), mes, Number(m[1])) : null;
}

/**
 * «del 12 al 18 de septiembre de 2026», «del 29 de agosto al 4 de septiembre
 * de 2026» → [desde, hasta]. El año del inicio se toma del final (y se resta
 * uno si la semana cruza el año).
 */
function semanaDelTitulo(t: string): [string | null, string | null] {
  const m = /del\s+(\d{1,2})(?:\s+de\s+([a-záéíóú]+))?\s+al\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i.exec(t);
  if (!m) return [null, null];
  const a = Number(m[5]);
  const mf = MESES.indexOf(m[4].toLowerCase()) + 1;
  const mi = m[2] ? MESES.indexOf(m[2].toLowerCase()) + 1 : mf;
  if (!mf || !mi) return [null, null];
  return [iso(mi > mf ? a - 1 : a, mi, Number(m[1])), iso(a, mf, Number(m[3]))];
}

const DIA_RD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santo_Domingo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function nulo(s: string): string | null {
  return s ? s : null;
}

/* ───────────────────────────── Edenorte ───────────────────────────── */

interface Lectura {
  cortes: Corte[];
  semanaDesde: string | null;
  semanaHasta: string | null;
  ultimaPublicacion: string | null;
  publicado: string | null;
}

function leerEdenorte(rss: string): Lectura | null {
  const items = rss.split(/<item>/).slice(1, 1 + TOPE_ENTRADAS);
  if (items.length === 0) return null;
  const cortes: Corte[] = [];
  let primera: { titulo: string; semana: [string | null, string | null]; publicado: string | null } | null = null;

  for (const item of items) {
    const titulo = texto(/<title>([\s\S]*?)<\/title>/.exec(item)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "") ?? "");
    const enlace = /<link>([^<]+)<\/link>/.exec(item)?.[1]?.trim() ?? URL_EDENORTE_PAGINA;
    const url = enlace.startsWith("https://edenorte.com.do/") ? enlace : URL_EDENORTE_PAGINA;
    if (!primera) {
      const t = Date.parse(/<pubDate>([^<]+)<\/pubDate>/.exec(item)?.[1] ?? "");
      primera = { titulo, semana: semanaDelTitulo(titulo), publicado: Number.isFinite(t) ? new Date(t).toISOString() : null };
    }

    const contenido = /<content:encoded>([\s\S]*?)<\/content:encoded>/.exec(item)?.[1] ?? "";
    for (const tabla of contenido.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
      const cabecera = [...(/<thead[\s\S]*?<\/thead>/i.exec(tabla)?.[0] ?? "").matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
        .map((m) => texto(m[1]).toLowerCase());
      const col = (nombre: string) => cabecera.findIndex((c) => c.startsWith(nombre));
      const i = {
        municipio: col("municipio"),
        circuito: col("circuito"),
        fecha: col("fecha"),
        periodo: col("periodo"),
        zonas: col("zonas"),
        causa: col("causa"),
      };
      if (i.fecha < 0 || i.periodo < 0 || i.zonas < 0) continue; // otra tabla, u otro formato

      const cuerpo = /<tbody[\s\S]*?<\/tbody>/i.exec(tabla)?.[0] ?? "";
      for (const fila of cuerpo.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
        const celdas = [...fila.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => texto(m[1]));
        const fecha = fechaNumerica(celdas[i.fecha] ?? "");
        const zonas = (celdas[i.zonas] ?? "").replace(/\.$/, "");
        if (!fecha || !zonas) continue;
        cortes.push({
          empresa: "edenorte",
          provincia: null,
          municipio: i.municipio >= 0 ? nulo(celdas[i.municipio] ?? "") : null,
          circuito: i.circuito >= 0 ? nulo(celdas[i.circuito] ?? "") : null,
          fecha,
          ...ventana(celdas[i.periodo] ?? ""),
          zonas,
          causa: i.causa >= 0 ? nulo(celdas[i.causa] ?? "") : null,
          url,
        });
      }
    }
  }
  // Un feed que responde pero del que no sale ni una fila cambió de formato:
  // eso es una caída, no una semana sin trabajos.
  if (cortes.length === 0) return null;
  return {
    cortes,
    semanaDesde: primera?.semana[0] ?? null,
    semanaHasta: primera?.semana[1] ?? null,
    ultimaPublicacion: primera?.titulo || null,
    publicado: primera?.publicado ?? null,
  };
}

/* ────────────────────────────── Edesur ────────────────────────────── */

function leerEdesur(html: string): Lectura | null {
  // Pestañas: id → fecha.
  const dias = new Map<string, string>();
  for (const m of html.matchAll(/id="(pills-[0-9a-f-]+)-tab"[\s\S]*?<small[^>]*>([\s\S]*?)<\/small>/gi)) {
    const fecha = fechaEnLetras(texto(m[2]));
    if (fecha) dias.set(m[1], fecha);
  }
  if (dias.size === 0) return null;

  // Paneles, en orden de aparición; cada uno llega hasta el siguiente.
  const paneles = [...html.matchAll(/<div class="tab-pane[^"]*"\s+id="(pills-[0-9a-f-]+)"/gi)];
  const cortes: Corte[] = [];
  paneles.forEach((p, k) => {
    const fecha = dias.get(p[1]);
    if (!fecha) return;
    const fin = k + 1 < paneles.length ? paneles[k + 1].index! : html.length;
    const panel = html.slice(p.index!, fin);
    for (const bloque of panel.split(/<div class="accordion-item"/i).slice(1)) {
      const provincia = texto(/<h4[^>]*>([\s\S]*?)<\/h4>/i.exec(bloque)?.[1] ?? "");
      const pares = bloque.split(/<h5 class="title-zona"[^>]*>/i).slice(1);
      for (const par of pares) {
        const cierre = par.indexOf("</h5>");
        if (cierre < 0) continue;
        const rotulo = texto(par.slice(0, cierre)).replace(/^zonas en mantenimiento\s*/i, "");
        // El sector va en el primer `<p>` (Umbraco lo anida: `<p><p>…</p></p>`);
        // tras el último viene el pie de la página, que no es una zona.
        const parrafo = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(par.slice(cierre + 5))?.[1] ?? "";
        const zonas = texto(parrafo).replace(/\.$/, "");
        if (!zonas) continue;
        cortes.push({
          empresa: "edesur",
          provincia: nulo(provincia),
          municipio: null,
          circuito: null,
          fecha,
          ...ventana(rotulo),
          zonas,
          causa: null,
          url: URL_EDESUR,
        });
      }
    }
  });

  const fechas = [...dias.values()].sort();
  const rango = /Mantenimientos Programados del[\s\S]*?<\/p>/i.exec(html)?.[0];
  return {
    cortes,
    semanaDesde: fechas[0] ?? null,
    semanaHasta: fechas[fechas.length - 1] ?? null,
    ultimaPublicacion: rango ? texto(rango) : null,
    publicado: null,
  };
}

/* ─────────────────────────────── Juntos ────────────────────────────── */

function ordenar(a: Corte, b: Corte): number {
  return a.fecha.localeCompare(b.fecha) || a.desde.localeCompare(b.desde);
}

async function leer(
  url: string,
  tipo: RegExp,
  lector: (s: string) => Lectura | null,
  empresa: Empresa,
): Promise<Lectura | null> {
  try {
    const cuerpo = await pedir(url, tipo);
    if (!cuerpo) return null;
    const r = lector(cuerpo);
    if (!r) console.error(`[cortes] ${empresa}: la respuesta no trae el formato esperado`);
    return r;
  } catch (err) {
    console.error(`[cortes] ${empresa}: ${String(err)}`);
    return null;
  }
}

export async function getCortes(): Promise<Cortes> {
  const hoy = DIA_RD.format(new Date());
  const [norte, sur] = await Promise.all([
    leer(URL_EDENORTE_FEED, /xml/i, leerEdenorte, "edenorte"),
    leer(URL_EDESUR, /text\/html/i, leerEdesur, "edesur"),
  ]);
  const vigentes = (l: Lectura | null) =>
    l ? l.cortes.filter((c) => c.fecha >= hoy).sort(ordenar) : null;
  const fuente = (empresa: Empresa, lectura: string, pagina: string, l: Lectura | null): FuenteCortes => ({
    empresa,
    nombre: NOMBRE_EMPRESA[empresa],
    lectura,
    pagina,
    semanaDesde: l?.semanaDesde ?? null,
    semanaHasta: l?.semanaHasta ?? null,
    ultimaPublicacion: l?.ultimaPublicacion ?? null,
    publicado: l?.publicado ?? null,
    leidas: l?.cortes.length ?? 0,
  });
  return {
    edenorte: vigentes(norte),
    edesur: vigentes(sur),
    fuentes: {
      edenorte: fuente("edenorte", URL_EDENORTE_FEED, URL_EDENORTE_PAGINA, norte),
      edesur: fuente("edesur", URL_EDESUR, URL_EDESUR, sur),
      edeeste: { nombre: "Edeeste", pagina: URL_EDEESTE },
    },
    hoy,
  };
}
