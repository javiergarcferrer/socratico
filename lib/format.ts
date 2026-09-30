/**
 * Lo que se escribe donde falta un valor: «sin dato», en palabras y no con
 * una raya, que se leía como un número borrado (docs/DESIGN.md §6 y §8).
 */
export const SIN_DATO = "sin dato";

export function formatMonto(monto: number, divisa: string): string {
  if (!monto && monto !== 0) return SIN_DATO;
  try {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: divisa || "DOP",
      maximumFractionDigits: 0,
    }).format(monto);
  } catch {
    return `${divisa} ${monto.toLocaleString("es-DO")}`;
  }
}

/**
 * Un valor **sin offset** (`2026-08-28`, `2026-08-28T00:00:00`) es una fecha
 * calendario declarada por la fuente (hora dominicana implícita): se muestra
 * tal cual, sin conversión de zona — convertirla corría el día hacia atrás y
 * dependía de la zona del servidor. Solo los valores con `Z`/offset real son
 * instantes y se convierten a `America/Santo_Domingo`.
 */
export function formatFecha(iso: string | undefined, conHora = false): string {
  if (!iso) return SIN_DATO;
  const naive = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/.test(iso);
  const d = new Date(naive && iso.includes("T") ? `${iso}Z` : iso);
  if (isNaN(d.getTime())) return SIN_DATO;
  return new Intl.DateTimeFormat("es-DO", {
    dateStyle: "medium",
    ...(conHora ? { timeStyle: "short" } : {}),
    timeZone: naive ? "UTC" : "America/Santo_Domingo",
  }).format(d);
}

/**
 * Los nombres de los meses salen de `Intl` y no de tablas copiadas: había
 * nueve en `lib/`. `MESES` es «enero»…«diciembre»; `MESES_CORTOS`, sus tres
 * primeras letras («sep», no el «sept» de `Intl`, que es la forma que ya
 * usaban las etiquetas y las hojas del BCRD).
 */
export const MESES: readonly string[] = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("es-DO", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, i, 15))),
);
export const MESES_CORTOS: readonly string[] = MESES.map((m) => m.slice(0, 3));

/**
 * El mes que nombra la **primera palabra** de un texto: «Ago», «AGOSTO 2/»,
 * «*Setiembre», «Sept.» → el número; otra cosa → 0.
 *
 * Estricto por defecto: la palabra tiene que ser el nombre o una abreviatura
 * de él (tres letras o más), así que «Mayor», «Total» o «Enero-Agosto» no
 * son un mes. Con `{ abreviado: true }` basta con las tres primeras letras,
 * que es como leen sus columnas de mes la hoja de la tasa del BCRD y el visor
 * del TSE: así pasan «Novienbre», «Septiempre» y los nombres ingleses
 * («June», «October»).
 */
export function numeroMes(texto: string, { abreviado = false }: { abreviado?: boolean } = {}): number {
  const w = (
    texto
      .trim()
      .split(/\s+/)[0]
      ?.normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase() ?? ""
  )
    // «*Septiembre» o «Sept.»: los signos alrededor no son parte de la palabra;
    // uno en medio («Enero-Agosto») sí la cambia.
    .replace(/^[^a-z]+|[^a-z]+$/g, "");
  if (w.length < 3 || /[^a-z]/.test(w)) return 0;
  const OTRAS: Record<string, number> = { jan: 1, apr: 4, aug: 8, dec: 12 };
  if (abreviado) {
    const t = w.slice(0, 3);
    return t === "set" ? 9 : MESES_CORTOS.indexOf(t) + 1 || OTRAS[t] || 0;
  }
  if (w.startsWith("set") && "setiembre".startsWith(w)) return 9;
  const i = MESES.findIndex((m) => m.startsWith(w));
  if (i >= 0) return i + 1;
  return OTRAS[w] ?? 0;
}

/** «ene» → «Ene». */
export const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «2026-08» → «ago 2026»: un mes se nombra, no se codifica. */
export function formatMes(aaaamm: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(aaaamm);
  const i = m ? Number(m[2]) - 1 : -1;
  return m && i >= 0 && i < 12 ? `${MESES_CORTOS[i]} ${m[1]}` : aaaamm;
}

/** Días (con decimales truncados hacia abajo) hasta una fecha; negativo si ya pasó. */
export function diasHasta(iso: string | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((d.getTime() - Date.now()) / 86400000);
}

/** El día calendario dominicano de un instante, como `2026-09-04`. */
const DIA_RD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santo_Domingo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Antigüedad en lenguaje llano: «hace 4 meses», «ayer», «hoy».
 *
 * Una fecha absoluta obliga a restar mentalmente. En una lista de veinte
 * iniciativas, ese cálculo se repite veinte veces y nadie lo hace: se deja de
 * comparar. El dato que responde «¿esto está vivo o parado?» no puede costar
 * una resta.
 *
 * Se cuenta en **días de calendario dominicano**, la misma regla que
 * `formatFecha`: «ayer» significa la fecha de ayer en Santo Domingo, no «entre
 * 24 y 48 horas atrás». Antes se restaban milisegundos contra un ancla
 * arbitraria al mediodía UTC, y eso rompía dos veces al día: entre las 00:00 y
 * las 12:00 UTC —cuando en el país todavía es la tarde o la noche anterior—
 * una pieza depositada *hoy* salía como fecha futura y la interfaz caía a la
 * fecha absoluta; y la frontera entre «hoy» y «ayer» se movía a las 8 de la
 * mañana local en vez de a medianoche.
 */
export function hace(valor: string | null | undefined): string | null {
  if (!valor) return null;

  /*
    Un valor sin hora es una fecha de calendario declarada por la fuente y se
    compara tal cual; uno con instante real se lleva primero al día que era en
    el país. Misma distinción que hace `formatFecha`.
  */
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(valor);
  let dia: string;
  if (soloFecha) {
    dia = valor;
  } else {
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return null;
    dia = DIA_RD.format(d);
  }

  const hoy = DIA_RD.format(Date.now());
  const aMedianocheUTC = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  const desde = aMedianocheUTC(dia);
  const hasta = aMedianocheUTC(hoy);
  if (Number.isNaN(desde) || Number.isNaN(hasta)) return null;

  const dias = Math.round((hasta - desde) / 86_400_000);
  if (dias < 0) return null;
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;

  const meses = Math.floor(dias / 30.44);
  if (meses < 12) return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`;

  const anios = Math.floor(dias / 365.25);
  const resto = Math.floor((dias - anios * 365.25) / 30.44);
  if (resto === 0) return `hace ${anios} ${anios === 1 ? "año" : "años"}`;
  return `hace ${anios} ${anios === 1 ? "año" : "años"} y ${resto} ${resto === 1 ? "mes" : "meses"}`;
}

/**
 * Magnitud escrita, no abreviada. En uso dominicano «MM» se lee *millones*, de
 * modo que abreviar miles de millones así se equivoca por tres órdenes de
 * magnitud —y la cifra más grande de la plataforma es la más fácil de
 * malinterpretar—. Aquí la unidad viaja con el número, no en una nota al pie.
 */
/**
 * Pesos escritos con su unidad, para las cifras grandes del Estado.
 *
 * Misma regla que `formatMagnitud` y por el mismo motivo: abreviar mil
 * millones como «MM» —que en uso dominicano se lee *millones*— se equivoca por
 * tres órdenes de magnitud justo en las cifras que más pesan. El presupuesto
 * del Estado se cuenta en billones de pesos: la unidad viaja con el número.
 */
export function formatPesos(pesos: number): string {
  const abs = Math.abs(pesos);
  if (abs >= 1e12) return `RD$\u00A0${(pesos / 1e12).toFixed(2)} billones`;
  if (abs >= 1e9) return `RD$\u00A0${(pesos / 1e9).toFixed(1)} mil millones`;
  if (abs >= 1e6) return `RD$\u00A0${(pesos / 1e6).toFixed(1)} millones`;
  return formatMonto(pesos, "DOP");
}

export function formatMagnitud(millonesUSD: number): string {
  if (millonesUSD >= 1000) {
    const miles = millonesUSD / 1000;
    return `US$\u00A0${miles.toFixed(1)} mil millones`;
  }
  return `US$\u00A0${Math.round(millonesUSD).toLocaleString("es-DO")} millones`;
}

/**
 * Siglas que sobreviven al paso a minúsculas. No es exhaustiva ni necesita
 * serlo: una sigla que falte queda en minúsculas, que se lee; una frase entera
 * en mayúsculas no se lee.
 */
const SIGLAS = new Set([
  "RD", "DN", "SDE", "SDN", "SDO", "RNC", "ITBIS", "SNIP", "DGCP", "DGII", "MIPYME", "MIPYMES",
  "MINERD", "MOPC", "MISPAS", "SNS", "INAPA", "CAASD", "CORAASAN", "INDRHI", "INABIE", "INAIPI",
  "EDESUR", "EDENORTE", "EDEESTE", "ETED", "CDEEE", "IDAC", "INTRANT", "OMSA", "OPRET", "MIREX",
  "MESCYT", "INFOTEP", "ISFODOSU", "UASD", "PN", "FFAA", "ARD", "DNCD", "TSS", "AFP", "ARS",
  "CESAC", "CESFRONT", "INESPRE", "BCRD", "PGR", "JCE", "TIC", "TI", "PVC", "LED", "GPS", "UPS",
  "CCTV", "HVAC", "PC", "USB", "SAS", "SRL", "EIRL", "SCJ",
]);

/** Las palabras que un nombre propio deja en minúscula cuando no lo abren. */
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en", "a", "al", "por", "para", "con"]);

/**
 * Un **nombre propio** que la fuente copia TODO EN MAYÚSCULAS, en tipo título:
 * «JUZGADO DE TRABAJO DE SAN CRISTOBAL» → «Juzgado de Trabajo de San
 * Cristobal». Es el hermano de `tituloLegible` para lo que se nombra —un
 * tribunal, una sala, un distrito—, donde la letra de frase dejaría «san
 * cristobal». Las partículas van en minúscula salvo al principio; las siglas
 * conocidas y los números romanos («SALA II») se quedan. Solo actúa si más del
 * 60 % de las letras son mayúsculas y no pone tildes que la fuente no puso.
 */
export function nombrePropio(valor: string): string {
  const letras = valor.match(/\p{L}/gu) ?? [];
  if (letras.length < 2) return valor;
  const mayus = letras.filter((l) => l !== l.toLowerCase()).length;
  if (mayus / letras.length <= 0.6) return valor;
  let primera = true;
  return valor.replace(/[\p{L}\p{N}]+/gu, (t) => {
    const abre = primera;
    primera = false;
    if (/\d/.test(t) || SIGLAS.has(t) || /^(?=[IVX]+$)X{0,3}(IX|IV|V?I{0,3})$/.test(t)) return t;
    const bajo = t.toLowerCase();
    if (!abre && PARTICULAS.has(bajo)) return bajo;
    return bajo.charAt(0).toUpperCase() + bajo.slice(1);
  });
}

/**
 * Un título que la fuente copia TODO EN MAYÚSCULAS, en oración: «ADQUISICIÓN
 * DE PAÑALES» → «Adquisición de pañales». Solo actúa si más del 60 % de las
 * letras son mayúsculas —lo demás es de la fuente y se respeta—; conserva
 * siglas conocidas y los códigos con cifras. El original va en el `title` del
 * elemento y entero en la ficha: se hace legible, no se reescribe.
 */
export function tituloLegible(valor: string): string {
  const letras = valor.match(/\p{L}/gu) ?? [];
  if (letras.length < 4) return valor;
  const mayus = letras.filter((l) => l !== l.toLowerCase()).length;
  if (mayus / letras.length <= 0.6) return valor;
  // Una racha unida por guion, barra o punto es una sola pieza: un código
  // como «MINERD-CCC-LPN-2025-0012» se conserva entero si lleva cifras.
  const palabra = (t: string) => (SIGLAS.has(t) ? t : t.toLowerCase());
  const bajo = valor.replace(/[\p{L}\p{N}]+(?:[-/.][\p{L}\p{N}]+)*/gu, (t) =>
    /\d/.test(t) ? t : t.replace(/[\p{L}\p{N}]+/gu, palabra),
  );
  // Mayúscula inicial y tras punto final; una coma pegada gana su espacio.
  return bajo
    .replace(/,(?=\p{L})/gu, ", ")
    .replace(/(^[^\p{L}]*|[.!?]\s+)(\p{Ll})/gu, (_, pre: string, l: string) => pre + l.toUpperCase());
}
