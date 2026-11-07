/**
 * Lo que se lee en el texto íntegro de una sentencia, una ley o un documento
 * institucional (docs/INFRAESTRUCTURA.md §5.12): reglas sobre la redacción
 * oficial, sin interpretación, como `lib/legislacion.ts` con los títulos.
 *
 *  · De una sentencia, su **dispositivo** («DECIDE: PRIMERO: …»): qué decidió,
 *    tal como lo escribe el tribunal, el **sentido** que se lee de sus verbos
 *    (acoge, rechaza, inadmisible, declara no conforme con la Constitución…),
 *    las normas que nombra cada ordinal y qué le hace a cada una, y las
 *    sentencias del Tribunal Constitucional que cita el texto (sus
 *    precedentes).
 *  · De una ley, qué normas nombra **cada artículo** y qué les hace (deroga,
 *    modifica, cita), con el número del artículo.
 *  · De un documento, las normas, los códigos de proceso de la DGCP, los
 *    números SNIP y los RNC que nombra.
 *
 * Módulo puro (sin `node:`): lo usan `scripts/build-textos.mjs`, que lee los
 * textos, y nada del servidor lo necesita para servir: el grafo compilado ya
 * trae lo que de aquí sale. Si una regla cambia, `VERSION_TEXTOS` sube y el
 * script vuelve a leer los textos que guarda en su caché.
 */

import { reconocerPorForma } from "@/lib/grafo";
import { referenciasNormativas, type RelacionNorma } from "@/lib/legislacion";
import type { Sentido } from "@/lib/vocabulario-textos";

export type { Sentido };

/** Sube cuando cambia una regla de este módulo: las filas de otra versión se vuelven a leer. */
export const VERSION_TEXTOS = 4;

/* ------------------------------------------------------------- limpieza */

/**
 * Las páginas de un PDF, unidas en un texto: sin el encabezado ni el pie que
 * se repiten en cada página («Expediente núm. TC-05-2023-0048 … Página 12 de
 * 30»), con las palabras que el renglón partió vueltas a unir
 * («inconstitu-\ncionalidad») y con el inicio de cada página, para decir en
 * cuál está cada cosa.
 */
export function unirPaginas(paginas: string[]): { texto: string; inicios: number[] } {
  const lineas = paginas.map((p) =>
    p
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((l) => l.replace(/[\t  ]+/g, " ").trim())
      .filter(Boolean),
  );
  // Un renglón corto que, con sus cifras borradas, sale en al menos el 40 % de las páginas es encabezado o pie.
  const repetidos = new Set<string>();
  if (lineas.length >= 4) {
    const cuenta = new Map<string, number>();
    for (const ls of lineas) for (const k of new Set(ls.filter((l) => l.length <= 160).map(huellaRenglon))) cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
    const umbral = Math.max(3, Math.ceil(lineas.length * 0.4));
    for (const [k, n] of cuenta) if (n >= umbral) repetidos.add(k);
  }
  const inicios: number[] = [];
  let texto = "";
  for (const ls of lineas) {
    inicios.push(texto.length);
    const pagina = ls.filter((l) => !repetidos.has(huellaRenglon(l))).join("\n");
    texto += (texto ? "\n" : "") + pagina;
  }
  // «inconstitu-\ncionalidad» → «inconstitucionalidad»; «TC-05-\n2022» no (sigue una cifra).
  texto = texto.replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2").normalize("NFC");
  return { texto, inicios };
}

const huellaRenglon = (l: string) => l.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ");

/** La página (desde 1) en que empieza la posición `i` del texto que dio `unirPaginas`. */
export function paginaDe(i: number, inicios: number[]): number {
  let lo = 0;
  let hi = inicios.length - 1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (inicios[m] <= i) lo = m;
    else hi = m - 1;
  }
  return lo + 1;
}

/* ----------------------------------------------------------- sentencias */

/**
 * Un ordinal del dispositivo: «SEGUNDO», su verbo principal (el primero, en
 * infinitivo: «DECLARA inadmisible» manda DECLARAR), todos los verbos que
 * manda y su texto.
 */
export interface Ordinal {
  ordinal: string;
  principal: string | null;
  verbos: string[];
  texto: string;
}

export interface Dispositivo {
  /** El dispositivo entero, desde el primer ordinal hasta la firma (a lo sumo `TOPE_DISPOSITIVO`). */
  texto: string;
  ordinales: Ordinal[];
  /** Dónde empieza en el texto. */
  inicio: number;
}

/** El largo máximo que se guarda de un dispositivo. */
export const TOPE_DISPOSITIVO = 3000;

/*
  La marca del fallo: «DECIDE», «FALLA» o «RESUELVE», en cualquier caja, a
  veces con las letras espaciadas por el PDF («D E C I D E :»), seguida de su
  primer ordinal a pocos caracteres («DECIDE: PRIMERO:»). Se toma la
  **última**: una sentencia cita fallos de otros tribunales y resoluciones de
  la JCE con la misma forma, y las conclusiones de las partes con los mismos
  ordinales («PRIMERO: ACOGER…») van antes del fallo. Sin ninguna marca, el
  último «PRIMERO» al que sigue la firma. Lo que viene tras el título de un
  voto particular no cuenta (`TITULO_VOTO`).
*/
const MARCA_DISPOSITIVO =
  /\b(?:D\s?E\s?C\s?I\s?D\s?E|F\s?A\s?L\s?L\s?A|R\s?E\s?S\s?U\s?E\s?L\s?V\s?E)\b\s*:?\s*(?=(?:\S+\s+){0,3}?PRIMERO\s*[:.\-–—])/gi;
const PRIMER_ORDINAL = /(?:^|\n|[.;:]\s)\s*PRIMERO\s*[:.\-–—]/g;

/**
 * El título de un voto particular, en mayúsculas como lo pone el tribunal
 * («VOTO SALVADO DE LA MAGISTRADA…», «VOTO DISIDENTE…»; en minúsculas es la
 * frase que lo anuncia antes del fallo: «Figura incorporado el voto salvado
 * de…»). Lo que le sigue ya no es la sentencia: un voto reproduce a veces la
 * norma juzgada con su propio «RESUELVE: PRIMERO:» (TC/0903/26) o el fallo
 * de la mayoría, y cita sus propios precedentes.
 */
const TITULO_VOTO = /\bVOTOS?\s+(?:DISIDENTES?|SALVADOS?|PARTICULAR(?:ES)?|CONCURRENTES?)\b/g;

/** Lo que cierra el dispositivo: la firma (también «Aprobada:» tras el último ordinal), los votos o la certificación de la secretaría. */
const FIN_DISPOSITIVO =
  /(?:\n|\.\s+)\s*(?:Firmad[ao]s?\s*(?:por|:)|Firman?\s*:|Aprobad[ao]s?\s*:|La presente (?:sentencia|decisi[oó]n) (?:es|ha sido) dada|VOTO\s+(?:DISIDENTE|SALVADO|PARTICULAR|CONCURRENTE)|Así ha sido|Esta (?:decisi[oó]n|sentencia),? (?:es )?(?:dada y )?firmada|Nosotros, (?:los )?jueces|Certifico)/i;

const NOMBRE_ORDINAL =
  "PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO(?:\\s+(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO))?|UND[ÉE]CIMO|DUOD[ÉE]CIMO";
const ORDINAL = new RegExp(`(?:^|\\n|[.;]\\s)\\s*(${NOMBRE_ORDINAL})\\s*[:.\\-–—]`, "g");

/**
 * Los verbos de un fallo, en infinitivo, con las formas en que los escriben
 * el TC y el TSE: el infinitivo («DECLARAR», lo más común desde 2013) y la
 * tercera persona («DECLARA», en las primeras sentencias del TC y en las del
 * TSE).
 */
const FORMAS_VERBO: Record<string, string[]> = {
  ADMITIR: ["ADMITIR", "ADMITE"],
  INADMITIR: ["INADMITIR", "INADMITE"],
  ACOGER: ["ACOGER", "ACOGE"],
  RECHAZAR: ["RECHAZAR", "RECHAZA"],
  DECLARAR: ["DECLARAR", "DECLARA"],
  REVOCAR: ["REVOCAR", "REVOCA"],
  CONFIRMAR: ["CONFIRMAR", "CONFIRMA"],
  ANULAR: ["ANULAR", "ANULA"],
  ORDENAR: ["ORDENAR", "ORDENA"],
  DISPONER: ["DISPONER", "DISPONE"],
  COMUNICAR: ["COMUNICAR", "COMUNICA"],
  REMITIR: ["REMITIR", "REMITE"],
  DESESTIMAR: ["DESESTIMAR", "DESESTIMA"],
  SUSPENDER: ["SUSPENDER", "SUSPENDE"],
  CONDENAR: ["CONDENAR", "CONDENA"],
  COMPENSAR: ["COMPENSAR", "COMPENSA"],
  OTORGAR: ["OTORGAR", "OTORGA"],
  LEVANTAR: ["LEVANTAR", "LEVANTA"],
  LIBRAR: ["LIBRAR", "LIBRA"],
  RATIFICAR: ["RATIFICAR", "RATIFICA"],
  EXHORTAR: ["EXHORTAR", "EXHORTA"],
  LIQUIDAR: ["LIQUIDAR", "LIQUIDA"],
  FIJAR: ["FIJAR", "FIJA"],
  ENVIAR: ["ENVIAR", "ENVÍA", "ENVIA"],
  RESERVAR: ["RESERVAR", "RESERVA"],
};
const INFINITIVO = new Map(Object.entries(FORMAS_VERBO).flatMap(([inf, formas]) => formas.map((f) => [f, inf] as const)));
/** Un verbo escrito en mayúsculas en cualquier punto del ordinal. */
const EN_MAYUSCULAS = /\b[A-ZÁÉÍÓÚÑ]{4,}\b/g;

/** El verbo principal de un ordinal (su primera palabra, en cualquier caja) y todos los que manda en mayúsculas. */
function verbosDe(texto: string): { principal: string | null; verbos: string[] } {
  const primera = /^[\s"“«(]*([A-Za-zÁÉÍÓÚÑáéíóúñ]+)/.exec(texto)?.[1]?.toLocaleUpperCase("es") ?? "";
  const principal = INFINITIVO.get(primera) ?? null;
  const verbos = new Set<string>(principal ? [principal] : []);
  for (const m of texto.matchAll(EN_MAYUSCULAS)) {
    const v = INFINITIVO.get(m[0]);
    if (v) verbos.add(v);
  }
  return { principal, verbos: [...verbos] };
}

/** Dónde empieza el fallo en un texto: tras su última marca o, sin ninguna, en el último «PRIMERO» al que sigue la firma a menos de 8,000 caracteres. -1 si no hay. */
function inicioDelFallo(texto: string): number {
  let desde = -1;
  for (const m of texto.matchAll(MARCA_DISPOSITIVO)) desde = (m.index ?? 0) + m[0].length;
  if (desde >= 0) return desde;
  for (const m of texto.matchAll(PRIMER_ORDINAL)) {
    const ini = m.index ?? 0;
    if (FIN_DISPOSITIVO.test(texto.slice(ini, ini + 8000))) desde = ini;
  }
  return desde;
}

/** Dónde empiezan los votos particulares: el primer título de voto que tiene un fallo delante. `null` si no hay. */
function inicioDeLosVotos(texto: string): number | null {
  for (const v of texto.matchAll(TITULO_VOTO)) if (inicioDelFallo(texto.slice(0, v.index)) >= 0) return v.index ?? 0;
  return null;
}

/** La sentencia sin sus votos particulares: lo que dice el tribunal, no lo que dice un juez que disiente o salva su voto. */
export function sinVotos(texto: string): string {
  const v = inicioDeLosVotos(texto);
  return v == null ? texto : texto.slice(0, v);
}

/**
 * El dispositivo de una sentencia: lo que sigue a la **última** marca del
 * fallo antes de los votos particulares (una anterior puede ser una cita de
 * otra sentencia; una posterior, la norma que un voto reproduce), partido en
 * sus ordinales. `null` si el texto no la trae o no le sigue ningún ordinal.
 */
export function dispositivoDe(texto: string): Dispositivo | null {
  const desde = inicioDelFallo(sinVotos(texto));
  if (desde < 0) return null;
  const resto = texto.slice(desde, desde + 20_000);
  const fin = resto.search(FIN_DISPOSITIVO);
  const cuerpo = (fin >= 0 ? resto.slice(0, fin) : resto.slice(0, 8000)).trim();
  const cortes = [...cuerpo.matchAll(ORDINAL)];
  if (!cortes.length) return null;
  const ordinales: Ordinal[] = cortes.map((m, k) => {
    const ini = (m.index ?? 0) + m[0].length;
    const hasta = k + 1 < cortes.length ? (cortes[k + 1].index ?? cuerpo.length) : cuerpo.length;
    const t = plano(cuerpo.slice(ini, hasta));
    return { ordinal: m[1].replace(/\s+/g, " ").toUpperCase(), ...verbosDe(t), texto: t };
  });
  const textoEntero = plano(cuerpo.slice(cortes[0].index ?? 0));
  return {
    texto: textoEntero.length > TOPE_DISPOSITIVO ? `${textoEntero.slice(0, TOPE_DISPOSITIVO - 1).trimEnd()}…` : textoEntero,
    ordinales,
    inicio: desde + (cortes[0].index ?? 0),
  };
}

const plano = (t: string) => t.replace(/\s+/g, " ").trim();

/**
 * El sentido de una decisión, leído de los verbos de su dispositivo:
 *
 *  · `no-conforme`: un ordinal **declara** una norma no conforme con la
 *    Constitución o inconstitucional (la acción directa prosperó);
 *  · `conforme`: un ordinal la declara conforme (un tratado, una norma
 *    atacada que se sostiene);
 *  · `acoge`, `rechaza`: lo que manda el ordinal de fondo;
 *  · `inadmisible`: el recurso o la acción no se conoció en el fondo;
 *  · `otro`: ninguno de esos (un desistimiento, un archivo, una liquidación).
 *
 * Es la lectura de la fórmula del propio tribunal; el dispositivo queda
 * siempre a la vista junto al sentido (`lib/vocabulario-textos.ts`).
 */
const NO_CONFORME = /\bno\s+conformes?\s+con\s+la\s+Constituci[oó]n|\binconstitucional(?:es)?\b/i;
const CONFORME = /(?<!\bno\s)\bconformes?\s+con\s+la\s+Constituci[oó]n/i;
const INADMISIBLE = /\binadmisibles?\b|\bINADMITIR\b/i;

/**
 * Si un ordinal declara lo que dice el patrón. «ACOGER… y, en consecuencia,
 * DECLARAR no conforme…» declara no conforme; uno que RECHAZA no declara a
 * una norma no conforme, pero sí conforme: «RECHAZAR, en cuanto al fondo, la
 * acción… y, en consecuencia, DECLARAR conforme con la Constitución…» es la
 * fórmula con que el TC sostiene la norma atacada.
 */
const declara = (o: Ordinal, re: RegExp) => o.verbos.includes("DECLARAR") && (re === CONFORME || o.principal !== "RECHAZAR") && re.test(o.texto);

/** Un ordinal que no decide el fondo: lo incidental («ACOGER el pedimento incidental», «ACOGE uno de los medios de inadmisión»), lo de forma, un desistimiento. */
const INCIDENTAL = /\bincidental|\bmedios? de inadmisi[oó]n|\bexcepci[oó]n\b|\bdesistimiento|\ben cuanto a la forma\b/i;
const DE_FONDO = /\ben cuanto al fondo\b|\bfondo\b/i;

/**
 * El sentido sale del verbo **principal** de cada ordinal, en este orden: lo
 * que se declara sobre una norma (en cualquier punto del ordinal); el verbo
 * del ordinal que dice «en cuanto al fondo»; la inadmisibilidad que un
 * ordinal declara; el primer ACOGER o RECHAZAR que no es incidental ni de
 * forma. En «LEVANTA ACTA del desistimiento…; en consecuencia, ACOGE dicho
 * desistimiento» manda LEVANTAR: otro. En «ACOGE uno de los medios de
 * inadmisión… y en consecuencia DECLARA INADMISIBLE…», inadmisible.
 */
export function sentidoDe(d: Dispositivo): Sentido {
  const os = d.ordinales;
  if (os.some((o) => declara(o, NO_CONFORME))) return "no-conforme";
  if (os.some((o) => declara(o, CONFORME))) return "conforme";
  const fondo = os.find((o) => DE_FONDO.test(o.texto) && (o.principal === "ACOGER" || o.principal === "RECHAZAR"));
  if (fondo) return fondo.principal === "ACOGER" ? "acoge" : "rechaza";
  if (os.some((o) => INADMISIBLE.test(o.texto) && (o.verbos.includes("DECLARAR") || o.verbos.includes("INADMITIR")) && o.principal !== "RECHAZAR")) return "inadmisible";
  const decide = os.find((o) => (o.principal === "ACOGER" || o.principal === "RECHAZAR") && !INCIDENTAL.test(o.texto));
  if (decide) return decide.principal === "ACOGER" ? "acoge" : "rechaza";
  return "otro";
}

/** Qué le hace un ordinal a una norma que nombra: la declara no conforme, conforme, o solo la cita. */
export type Efecto = "no-conforme" | "conforme" | "cita";

/** Una norma que nombra el dispositivo: [tipo, número, efecto, ordinal]. */
export type NormaDelDispositivo = [string, string, Efecto, string];

/**
 * Las normas que nombra cada ordinal (con número: la Constitución no es un
 * nodo), y qué le hace ese ordinal: el efecto solo se lee en un ordinal que
 * **declara**; en otro, es una cita («de acuerdo con el artículo 7.6 de la Ley
 * núm. 137-11»). Una norma nombrada en dos ordinales se queda con el efecto
 * del que la declara.
 */
export function normasDelDispositivo(d: Dispositivo): NormaDelDispositivo[] {
  const salida = new Map<string, NormaDelDispositivo>();
  const poner = (tipo: string, numero: string, efecto: Efecto, ordinal: string) => {
    const k = `${tipo}|${numero}`;
    const antes = salida.get(k);
    if (!antes || (antes[2] === "cita" && efecto !== "cita")) salida.set(k, [tipo, numero, efecto, ordinal]);
  };
  for (const o of d.ordinales) {
    const efecto: Efecto = declara(o, NO_CONFORME) ? "no-conforme" : declara(o, CONFORME) ? "conforme" : "cita";
    const declaradas = efecto === "cita" ? new Set<string>() : normasDeclaradas(o.texto, efecto === "no-conforme" ? NO_CONFORME : CONFORME);
    for (const r of referenciasNormativas(o.texto)) {
      if (!r.numero) continue;
      poner(r.tipo, r.numero, declaradas.has(`${r.tipo}|${r.numero}`) ? efecto : "cita", o.ordinal);
    }
  }
  return [...salida.values()];
}

/** Una norma con número en un texto, con su posición: el tipo (como `referenciasNormativas`) y el número sin espacios. */
const CITA_NORMA = /\b(Leyes|Ley|Decretos?|Reglamentos?|Resoluci[oó]n(?:es)?)\b[\s,]*(?:org[aá]nica\s+)?(?:n[uú]m(?:ero|s?\.)?|no\.?|n[°º])?\s*(\d{1,4}\s*-\s*\d{2,4})/gi;
const TIPO_DE_PALABRA = (p: string) => (/^ley/i.test(p) ? "Ley" : /^decreto/i.test(p) ? "Decreto" : /^reglamento/i.test(p) ? "Reglamento" : "Resolución");
/** Lo que precede a una norma que el ordinal no declara: la que modificó a la declarada, o la que da la base de lo que se dispone. */
const NO_DECLARADA = /(?:modificad[oa]s?|reformad[oa]s?|sustituid[oa]s?|derogad[oa]s?|que\s+modific[oó]?a?)\s+(?:por|a)?\s*(?:el|la|los|las)?\s*$|(?:de\s+conformidad\s+con|conforme\s+(?:a|con)|en\s+virtud\s+de|seg[uú]n|previst[oa]s?\s+en|establecid[oa]s?\s+en|dispuest[oa]s?\s+en)\b[^;]{0,120}$/i;

/**
 * Las normas que un ordinal declara: las que nombra **después** de la frase
 * que declara («DECLARAR no conforme con la Constitución el artículo 4 de la
 * Ley núm. X») y no son la que la modificó ni la base de lo dispuesto: en
 * «…del Decreto núm. 6-19…, modificado por el Decreto núm. 330-26» se declara
 * el 6-19, no el 330-26; en «…de conformidad con el artículo 7.6 de la Ley
 * núm. 137-11», la 137-11 solo se cita.
 */
function normasDeclaradas(texto: string, frase: RegExp): Set<string> {
  const salida = new Set<string>();
  const m = frase.exec(texto);
  if (!m) return salida;
  const desde = (m.index ?? 0) + m[0].length;
  const tramo = texto.slice(desde);
  for (const c of tramo.matchAll(CITA_NORMA)) {
    const antes = tramo.slice(Math.max(0, (c.index ?? 0) - 160), c.index);
    if (NO_DECLARADA.test(antes)) continue;
    salida.add(`${TIPO_DE_PALABRA(c[1])}|${c[2].replace(/\s+/g, "")}`);
  }
  return salida;
}

/**
 * «TC/0007/12», «TC/7/12», «TC/0007/2012»: una sentencia del Tribunal
 * Constitucional por su número, siempre con barras. Con guiones es un
 * expediente («TC-01-2019-0012»), no una sentencia.
 */
const CITA_TC = /\bTC\s?\/\s?0*(\d{1,4})\s?\/\s?(?:20)?(\d{2})(?![\d/-])/g;

/**
 * Las sentencias del Tribunal Constitucional que nombra un texto, por su
 * clave (`claveSentencia`: «TC-0007-12») y cuántas veces, de la más citada a
 * la menos; sin la propia.
 */
export function sentenciasCitadas(texto: string, propia: string | null): [string, number][] {
  const cuenta = new Map<string, number>();
  for (const m of texto.matchAll(CITA_TC)) {
    const k = `TC-${m[1].padStart(4, "0")}-${m[2]}`;
    if (k !== propia) cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }
  return [...cuenta].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

/* ---------------------------------------------------------------- leyes */

/** Lo que un artículo de una ley le hace a una norma: [tipo, número, relación, artículo]. */
export type CambioDeLey = [string, string, RelacionNorma, string];

/*
  «Artículo 12.-», «Art. 12.», «ARTÍCULO ÚNICO:», «Artículo 1 bis»: al
  principio de un renglón. Lo que va entre dos encabezados es un artículo.
*/
const ARTICULO = /(?:^|\n)\s*(?:ART[ÍI]CULO|Art[íi]culo|Art\.)\s+(\d{1,4}(?:\s*(?:bis|ter))?|[ÚU]NICO|[ÚU]nico|PRIMERO|Primero)\b\s*[.:\-–—]?/g;
/** Un artículo de derogaciones: el título lo dice, o el texto «quedan derogadas…». */
const ES_DEROGATORIO = /^\s*(?:\(?Derogaci[oó]n(?:es)?\)?|Disposici[oó]n(?:es)? derogatoria)|\bqueda(?:n)?\s+(?:expresamente\s+)?derogad[oa]s?\b|\bse\s+derogan?\b/i;

/**
 * Los artículos de una ley por número («12», «Único», «12 bis») y el texto
 * de cada uno. Lo que precede al primero (el título y los considerandos) va
 * con la clave «preámbulo».
 */
export function articulosDe(texto: string): [string, string][] {
  const cortes = [...texto.matchAll(ARTICULO)];
  if (!cortes.length) return [["preámbulo", texto]];
  const salida: [string, string][] = [["preámbulo", texto.slice(0, cortes[0].index ?? 0)]];
  cortes.forEach((m, k) => {
    const ini = (m.index ?? 0) + m[0].length;
    const fin = k + 1 < cortes.length ? (cortes[k + 1].index ?? texto.length) : texto.length;
    const num = m[1].replace(/\s+/g, " ").replace(/^[úu]nico$/i, "Único").replace(/^primero$/i, "1");
    salida.push([num, texto.slice(ini, fin)]);
  });
  return salida;
}

/**
 * Lo que cada artículo de una ley le hace a otras normas: la relación que
 * declara su propio verbo («Se modifica el artículo 24 de la Ley núm.
 * 340-06»: modifica), y deroga todo lo que nombra un artículo de
 * derogaciones. Los considerandos y los vistos solo citan. Una norma que dos
 * artículos tocan sale una vez por artículo.
 */
export function cambiosDeLey(texto: string): CambioDeLey[] {
  const salida: CambioDeLey[] = [];
  const vistos = new Set<string>();
  for (const [art, cuerpo] of articulosDe(texto)) {
    const derogatorio = art !== "preámbulo" && ES_DEROGATORIO.test(cuerpo.slice(0, 400));
    for (const r of referenciasNormativas(cuerpo)) {
      if (!r.numero) continue;
      const relacion: RelacionNorma = art === "preámbulo" ? "cita" : derogatorio && r.relacion === "cita" ? "deroga" : r.relacion;
      const k = `${r.tipo}|${r.numero}|${art}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      salida.push([r.tipo, r.numero, relacion, art]);
    }
  }
  return salida;
}

/* ----------------------------------------------------------- documentos */

/** Los topes por documento: una planilla de pagos puede nombrar miles de RNC. */
export const TOPES_MENCIONES = { normas: 100, procesos: 300, snip: 100, rnc: 300 } as const;

export interface MencionesDeDocumento {
  /** [tipo, número] de cada norma con número. */
  normas: [string, string][];
  /** Códigos de proceso de la DGCP. */
  procesos: string[];
  /** Números SNIP. */
  snip: string[];
  /** RNC de nueve cifras, sin guiones. */
  rnc: string[];
}

/*
  Un RNC se reconoce solo junto a su sigla («RNC 1-01-00557-1», «R.N.C.:
  101005571», «RNC núm. 130-12345-6»): un número de nueve cifras suelto puede
  ser cualquier cosa, y uno de once es una cédula. Las planillas lo traen en
  una columna con esa cabecera, que el lector de XLSX convierte a «RNC: …».
*/
const RNC = /\bR\.?\s?N\.?\s?C\.?\s*(?:n[uú]m(?:ero)?\.?|No\.?|#)?\s*[:.]?\s*(\d[\d\s-]{7,13}\d)(?![\d-])/gi;

export function mencionesDe(texto: string): MencionesDeDocumento {
  const normas = new Map<string, [string, string]>();
  for (const r of referenciasNormativas(texto)) {
    if (r.numero && normas.size < TOPES_MENCIONES.normas) normas.set(`${r.tipo}|${r.numero}`, [r.tipo, r.numero]);
  }
  const procesos = new Set<string>();
  const snip = new Set<string>();
  for (const m of reconocerPorForma(texto)) {
    const trozo = texto.slice(m.inicio, m.fin);
    if (m.tipo === "proceso" && procesos.size < TOPES_MENCIONES.procesos) procesos.add(trozo);
    if (m.tipo === "obra" && snip.size < TOPES_MENCIONES.snip) {
      const n = /(\d{3,7})\s*$/.exec(trozo)?.[1];
      if (n) snip.add(n);
    }
  }
  const rnc = new Set<string>();
  for (const m of texto.matchAll(RNC)) {
    const cifras = m[1].replace(/\D/g, "");
    if (cifras.length === 9 && rnc.size < TOPES_MENCIONES.rnc) rnc.add(cifras);
  }
  return { normas: [...normas.values()], procesos: [...procesos], snip: [...snip], rnc: [...rnc] };
}
