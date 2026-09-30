/**
 * Sentencias del Tribunal Constitucional — el listado anual de la Secretaría.
 *
 * Mecánica verificada en docs/AUDITORIA.md §G.6 (tercera pasada, 2026-09-24)
 * y re-medida el mismo día con este User-Agent:
 *
 *  1. `tc.gob.do/robots.txt` responde 404 vacío: no hay reglas. El portal es
 *     Umbraco sobre Azure App Service; el listado es HTML hecho en el
 *     servidor, sin token ni cookie: el `__RequestVerificationToken` que trae
 *     la página es del buscador global y no hace falta para listar.
 *  2. Un año entero cabe en **una** respuesta:
 *     `GET /consultas/secretar%C3%ADa/sentencias?searchCriteria=&searchString=&size=999999&filtery=AAAA&criteriay=years&order=Date`.
 *     Con `size=999999` el pie dice «Página 1 de 1», así que no hay paginación
 *     que recorrer ni un contador ajeno que creer: se cuentan las filas. Medido:
 *     2026 → 966 filas, 885 KB, 7,7 s; 2023 → 1 159 filas, 1,09 MB, 3,5 s;
 *     2012 → 104 filas, 149 KB.
 *  3. La tabla tiene cuatro columnas: número (`TC/0966/26`, enlazado a su
 *     ficha), fecha `DD-MM-AAAA`, «Referencia» (el expediente) y «Relativo a».
 *
 * Particularidades que el lector obedece:
 *  · La ruta lleva `secretaría` **con tilde**: en el HTML viene como
 *    `secretar&#237;a` y en la petición hay que codificarla `%C3%AD`.
 *  · La «Referencia» es texto libre, no un código: en los años recientes es
 *    `TC-05-2026-0147` o varios separados por coma (expedientes fusionados);
 *    en 2012 conviven «Expediente No. 2011- 5744», «2011-5770» y «N/D». Se
 *    guarda tal cual —espacios normalizados— y «N/D» pasa a `null`.
 *  · Todo el texto viene con entidades numéricas (`&#243;`, `&#171;`): se
 *    decodifican aquí.
 *  · La fecha del listado es `DD-MM-AAAA`; la de la ficha, `DD/MM/AAAA`. Se
 *    devuelve ISO de calendario (`AAAA-MM-DD`), sin hora.
 *  · El PDF vive en `tribunalsitestorage.blob.core.windows.net/media/<id>/…`
 *    con un id **opaco** que solo aparece en la ficha. Leer la ficha de cada
 *    fila para sacarlo sería una petición por sentencia (N+1 sobre mil filas):
 *    no se hace. La ficha es el camino al documento y se enlaza tal cual.
 *
 * Contrato (`.claude/rules/fuentes.md`): GET solamente, User-Agent
 * identificable, 60 s de tiempo máximo —el año en curso tardó 7,7 s en llegar
 * (casi 1 MB de HTML desde Azure, con 7,2 s hasta el primer byte) y un tope de
 * 25 s dejaba poco margen a un mal día del portal—, un reintento, `content-type` validado y la tabla presente; si algo
 * falla, `null` y nunca una excepción hacia la página.
 *
 * Caché: `unstable_cache` sobre las **filas ya leídas**, no `fetch` con
 * `revalidate`. Un año pesa hasta 1,1 MB de HTML y crece con el Tribunal; el
 * caché de datos de Next rechaza respuestas de más de 2 MB y en ese caso cada
 * visita volvería a descargar el año entero. Las filas en JSON pesan la mitad.
 * Ventana: 6 h para el año en curso (el Tribunal publica varias sentencias por
 * semana), 7 días para un año cerrado. Un fallo lanza dentro de la función
 * cacheada para que **nunca se guarde un `null`**.
 */

import { unstable_cache } from "next/cache";
import { arbol, textoDe, type CheerioAPI, type Element } from "@/lib/html";
import { pedirTextoOLanzar } from "@/lib/pedir";
import { sinCedula } from "@/lib/padron";

const ORIGEN = "https://tc.gob.do";
const RUTA = "/consultas/secretar%C3%ADa/sentencias";
const USER_AGENT =
  "Socratico-Inteligencia/1.0 (sentencias del Tribunal Constitucional; herramienta independiente)";
const TIMEOUT_MS = 60_000;

/** El Tribunal dictó su primera sentencia en 2012 (TC/0001/12). */
export const PRIMER_ANIO_TC = 2012;

export interface SentenciaTC {
  /** «TC/0966/26», tal como la numera el Tribunal. */
  numero: string;
  /** Fecha de la sentencia, `AAAA-MM-DD` (calendario, sin hora). */
  fecha: string;
  /** La «Referencia» del listado: uno o varios expedientes, texto libre. `null` si dice «N/D» o viene vacía. */
  expediente: string | null;
  /** «Relativo a…»: de qué trata, redactado por la Secretaría. */
  relativo: string;
  /** URL absoluta de la ficha en tc.gob.do, que es la que enlaza el PDF. */
  ficha: string;
}

export interface SentenciasTC {
  anio: number;
  /** Del más reciente al más antiguo (fecha, luego número). */
  sentencias: SentenciaTC[];
  /** Filas `<tr>` leídas en la tabla, incluidas las que no se pudieron interpretar. */
  escaneados: number;
  /** URL del listado del año en el sitio del Tribunal. */
  fuente: string;
  /** Instante de la lectura (ISO), para decir de cuándo es la copia. */
  consultado: string;
}

/** Año en curso en Santo Domingo, no en UTC. */
export function anioActualTC(): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo", year: "numeric" }).format(
      Date.now(),
    ),
  );
}

/** Los años que se pueden pedir, del más reciente a 2012. */
export function aniosTC(): number[] {
  const hasta = anioActualTC();
  const r: number[] = [];
  for (let a = hasta; a >= PRIMER_ANIO_TC; a--) r.push(a);
  return r;
}

export function urlListadoTC(anio: number): string {
  return `${ORIGEN}${RUTA}?searchCriteria=&searchString=&size=999999&filtery=${anio}&criteriay=years&order=Date`;
}

/**
 * La tabla del listado: la que lleva «Relativo a» en su cabecera. `null` si
 * no está —la página cambió de forma o llegó otra cosa con 200—.
 */
function tablaDeSentencias($: CheerioAPI): Element | null {
  return (
    $("table")
      .toArray()
      .find((t) => /Relativo a/.test(textoDe($(t).find("thead, tr").first().toArray()))) ?? null
  );
}

/**
 * Lee la tabla del listado con `cheerio` (`lib/html.ts`). Devuelve `null` si
 * la tabla no está o si trae filas y no se entendió ninguna.
 */
export function parsearListadoTC(html: string): { sentencias: SentenciaTC[]; escaneados: number } | null {
  const $ = arbol(html);
  const tabla = tablaDeSentencias($);
  if (!tabla) return null;

  const sentencias: SentenciaTC[] = [];
  let escaneados = 0;
  for (const tr of $(tabla).find("tbody tr").toArray()) {
    escaneados++;
    const tds = $(tr).children("td").toArray();
    if (tds.length < 4) continue;
    const enlace = $(tds[0]).find("a[href]").first();
    if (enlace.length === 0) continue;
    const numero = textoDe(enlace.toArray());
    const f = /^(\d{2})-(\d{2})-(\d{4})$/.exec(textoDe(tds[1]));
    if (!/^TC\/\d{4}\/\d{2}$/.test(numero) || !f) continue;
    const ref = textoDe(tds[2]);
    let ficha: string;
    try {
      // El analizador ya resolvió las entidades del atributo («secretar&#237;a»).
      ficha = new URL(enlace.attr("href") ?? "", ORIGEN).toString();
    } catch {
      continue;
    }
    sentencias.push({
      numero,
      fecha: `${f[3]}-${f[2]}-${f[1]}`,
      expediente: ref && !/^n\/?d$/i.test(ref) ? ref : null,
      // El TC escribe a veces la cédula de una parte («RNC núm. …»): no se enseña.
      relativo: sinCedula(textoDe(tds[3])),
      ficha,
    });
  }
  // La tabla existe pero no se entendió ninguna fila con filas presentes: cambió de forma.
  if (escaneados > 0 && sentencias.length === 0) return null;

  // Orden propio, sin fiarse del `order=` del portal: fecha y luego número.
  const n = (s: SentenciaTC) => Number(s.numero.slice(3, 7));
  sentencias.sort((a, b) => (a.fecha === b.fecha ? n(b) - n(a) : a.fecha < b.fecha ? 1 : -1));
  return { sentencias, escaneados };
}

async function leerAnio(anio: number): Promise<SentenciasTC> {
  const url = urlListadoTC(anio);
  // Lanza en cualquier fallo: `unstable_cache` no guarda una excepción.
  const html = await pedirTextoOLanzar(url, {
    fuente: "tc",
    ua: USER_AGENT,
    tipo: /text\/html/i,
    cabeceras: { Accept: "text/html" },
    cache: "no-store",
    espera: TIMEOUT_MS,
    // Un 200 sin la tabla se reintenta una vez, como antes.
    comprobar: (h) => (parsearListadoTC(h) ? null : "la página no trae la tabla de sentencias"),
  });
  const leido = parsearListadoTC(html);
  if (!leido) throw new Error("la página no trae la tabla de sentencias");
  return { anio, ...leido, fuente: url, consultado: new Date().toISOString() };
}

const anioEnCurso = unstable_cache(leerAnio, ["tc-sentencias-en-curso"], { revalidate: 21_600 });
const anioCerrado = unstable_cache(leerAnio, ["tc-sentencias-cerrado"], { revalidate: 604_800 });

/**
 * Todas las sentencias de un año, leídas del listado del Tribunal.
 * `null` si el año no está entre 2012 y el actual, o si el portal no contestó.
 */
export async function listarSentencias(anio: number): Promise<SentenciasTC | null> {
  const actual = anioActualTC();
  if (!Number.isInteger(anio) || anio < PRIMER_ANIO_TC || anio > actual) return null;
  try {
    return await (anio === actual ? anioEnCurso : anioCerrado)(anio);
  } catch (err) {
    console.error(`[tc] ${anio}: ${String(err)}`);
    return null;
  }
}
