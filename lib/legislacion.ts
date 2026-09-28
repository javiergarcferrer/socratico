/**
 * Lectura de una iniciativa: de metadatos a lenguaje llano.
 *
 * Ni el SIL de Diputados ni el consultante del Senado publican una sinopsis:
 * el único texto descriptivo es el **título** —que en la técnica legislativa
 * dominicana es autodescriptivo— más el historial de trámites. Este módulo
 * exprime ese título sin inventar nada:
 *
 *  1. Lo parte en **objeto** («Ley General de Alianzas Público-Privada») y
 *     **efectos** («mediante la cual se deroga la Ley núm. 47-20»), que es la
 *     forma canónica del enunciado: `<instrumento> <objeto>, <cláusula>`.
 *  2. Extrae las **normas citadas** con su relación (deroga / modifica / …).
 *     Ahí está la carga informativa real: qué del ordenamiento vigente toca
 *     esta pieza. `lib/normativa.ts` resuelve esas citas al texto oficial.
 *  3. Traduce el **instrumento** y la **condición** procesal a una frase que
 *     se entienda sin ser abogado.
 *
 * Nada de esto es interpretación editorial: son reglas sobre la propia
 * redacción oficial, y el título original queda siempre a la vista.
 */

import {
  buscarIniciativas,
  limpiarTexto,
  normalizarIniciativa,
  type Iniciativa,
} from "@/lib/congreso";

/* ------------------------------------------------------------ referencias */

export type RelacionNorma =
  | "deroga"
  | "modifica"
  | "sustituye"
  | "adiciona"
  | "reforma"
  | "cita";

export interface ReferenciaNorma {
  /** Qué le hace la iniciativa a esa norma, según el propio título. */
  relacion: RelacionNorma;
  /** «Ley», «Decreto», «Reglamento», «Resolución», «Código», «Constitución». */
  tipo: string;
  /** Número normativo dominicano: `47-20`, `176-07`. `null` en la Constitución. */
  numero: string | null;
  /** Etiqueta lista para mostrar: «Ley 47-20». */
  etiqueta: string;
}

const VERBOS: Array<{ re: RegExp; relacion: RelacionNorma }> = [
  { re: /\b(deroga|abroga|derogatoria|deroguen?)\b/i, relacion: "deroga" },
  { re: /\b(modifica|modificatoria|modifiquen?|enmienda)\b/i, relacion: "modifica" },
  { re: /\b(sustituy[ea]|reemplaza)\b/i, relacion: "sustituye" },
  { re: /\b(adiciona|agrega|a[ñn]ade|incorpora)\b/i, relacion: "adiciona" },
  { re: /\b(reforma)\b/i, relacion: "reforma" },
];

/** Cómo se lee cada relación en la ficha. */
export const ETIQUETA_RELACION: Record<RelacionNorma, string> = {
  deroga: "Deroga",
  modifica: "Modifica",
  sustituye: "Sustituye",
  adiciona: "Adiciona",
  reforma: "Reforma",
  cita: "Cita",
};

const TIPOS_NORMA = "Ley|Leyes|Decreto|Reglamento|Resoluci[oó]n|C[oó]digo";

/**
 * Normas citadas en el texto, con la relación que el propio enunciado declara.
 *
 * El verbo se busca **hacia atrás** desde la cita porque la fórmula dominicana
 * lo antepone: «…, mediante la cual se **deroga** la Ley núm. 47-20». Si no hay
 * verbo en esa ventana, la relación queda en `cita` — nunca se supone.
 */
export function referenciasNormativas(texto: string): ReferenciaNorma[] {
  const limpio = limpiarTexto(texto);
  if (!limpio) return [];

  const vistas = new Set<string>();
  const refs: ReferenciaNorma[] = [];

  const re = new RegExp(
    `\\b(${TIPOS_NORMA})\\b[\\s,]*(?:n[uú]m(?:ero|\\.)?|no\\.?|n[°º])?\\s*(\\d{1,4}\\s*-\\s*\\d{2,4})`,
    "gi",
  );

  for (const m of limpio.matchAll(re)) {
    const numero = m[2].replace(/\s+/g, "");
    const tipo = normalizarTipoNorma(m[1]);
    const clave = `${tipo}|${numero}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);

    refs.push({
      relacion: relacionAntesDe(limpio, m.index),
      tipo,
      numero,
      etiqueta: `${tipo} ${numero}`,
    });
  }

  // La Constitución se cita sin número.
  if (/\bConstituci[oó]n\b/i.test(limpio) && !vistas.has("Constitución|")) {
    const idx = limpio.search(/\bConstituci[oó]n\b/i);
    refs.push({
      relacion: relacionAntesDe(limpio, idx),
      tipo: "Constitución",
      numero: null,
      etiqueta: "Constitución de la República",
    });
  }

  return refs;
}

/**
 * Verbo que gobierna una cita: el **más cercano** hacia atrás, no el primero
 * de la lista. «…deroga la Ley 189-11 y modifica el Decreto 95-12» tiene dos
 * verbos y cada cita se queda con el suyo.
 */
function relacionAntesDe(texto: string, posicion: number): RelacionNorma {
  const antes = texto.slice(Math.max(0, posicion - 90), posicion);
  let mejor: RelacionNorma = "cita";
  let mejorPos = -1;
  for (const { re, relacion } of VERBOS) {
    const global = new RegExp(re.source, "gi");
    for (const m of antes.matchAll(global)) {
      if (m.index > mejorPos) {
        mejorPos = m.index;
        mejor = relacion;
      }
    }
  }
  return mejor;
}

function normalizarTipoNorma(bruto: string): string {
  const t = bruto.toLowerCase();
  if (t.startsWith("ley")) return "Ley";
  if (t.startsWith("decreto")) return "Decreto";
  if (t.startsWith("reglamento")) return "Reglamento";
  if (t.startsWith("resoluci")) return "Resolución";
  if (t.startsWith("c")) return "Código";
  return bruto;
}

/**
 * Número normativo dentro de un texto libre.
 *
 * Cada cámara escribe la promulgación a su manera —el Senado guarda `136-15`
 * pelado y Diputados `Ley núm. 43-26`—, así que se extrae la forma canónica
 * antes de buscarla en la Consultoría.
 */
export function numeroDeNorma(valor: string | null | undefined): string | null {
  const m = /(\d{1,4})\s*-\s*(\d{2,4})/.exec(valor ?? "");
  return m ? `${m[1]}-${m[2]}` : null;
}

/* ------------------------------------------------- instrumento y condición */

/** Qué es la pieza, en una frase. */
export function queEs(tipo: string | null | undefined): string | null {
  const t = (tipo ?? "").toLowerCase();
  if (!t) return null;
  if (t.includes("ley")) {
    return "Una propuesta de ley. Para convertirse en ley de la República debe aprobarla el Senado, aprobarla la Cámara de Diputados en los mismos términos y promulgarla el Presidente.";
  }
  if (t.includes("resoluci")) {
    return "Una resolución: un pronunciamiento de la cámara, como un reconocimiento, una solicitud de información al Ejecutivo o la aprobación de un contrato o un acuerdo internacional. No crea normas de alcance general.";
  }
  if (t.includes("observaci")) {
    return "Una observación del Poder Ejecutivo: el Presidente devolvió la pieza a la cámara con reparos en lugar de promulgarla. El Congreso puede acogerlos o insistir.";
  }
  if (t.includes("contrato") || t.includes("acuerdo") || t.includes("convenio")) {
    return "Un contrato o acuerdo sometido a aprobación congresual: sin ese voto no puede ejecutarse.";
  }
  return null;
}

/**
 * Qué significa el estado procesal y qué viene después. Solo se traduce lo que
 * la propia taxonomía dice; los estados que no reconocemos se muestran crudos.
 */
export function queSigue(condicion: string | null | undefined): string | null {
  const c = (condicion ?? "").toLowerCase();
  if (!c) return null;

  // Terminales primero: ganan a cualquier estado intermedio que las contenga.
  if (c.includes("promulgad")) return "Completó el trámite: es ley vigente.";
  if (c.includes("perimid")) {
    return "Perimió: se agotaron las dos legislaturas de vigencia sin completar el trámite. Para revivirla hay que volver a depositarla desde cero.";
  }
  if (c.includes("retirad")) return "Fue retirada por quien la propuso.";
  if (c.includes("rechazad")) return "Fue rechazada.";
  if (c.includes("archivad")) return "Fue archivada: el trámite se cerró sin convertirla en ley.";
  if (c.includes("fusionad")) {
    return "Se fusionó con otra iniciativa sobre lo mismo: su trámite sigue en esa otra pieza, no en esta.";
  }

  if (c.includes("depositad")) {
    return "Fue registrada en la secretaría. El siguiente paso es su lectura en sesión y el envío a comisión.";
  }
  if (c.includes("liberado de comisi")) {
    return "El pleno la liberó del trámite de comisión: se conoce directamente en sesión, sin informe.";
  }
  // «En Orden del Día para 2da. discusión» (SIL): está agendada, no aprobada.
  // Va antes de las lecturas, que se reconocen por el mismo «2da».
  if (c.includes("agenda") || c.includes("orden del d")) {
    return "Está en el orden del día: el pleno la conocerá en sesión.";
  }
  if (c.includes("consideraci")) {
    return "Está en la agenda de la sesión: la cámara debe tomarla en consideración antes de enviarla a comisión.";
  }
  if (c.includes("comisi")) {
    return "Está en comisión: es la etapa donde se estudia, se convoca a las partes y se redacta el informe. La mayoría de las piezas muere aquí, sin informe.";
  }
  if (c.includes("informe")) {
    return "La comisión ya rindió informe. Vuelve al pleno, que decide si lo acoge y la vota.";
  }
  if (c.includes("mesa")) {
    return "Quedó sobre la mesa: el pleno aplazó la decisión sin rechazarla.";
  }
  if (c.includes("primera lectura") || c.includes("primera con") || c.includes("1ra")) {
    return "Pasó su primera lectura. Falta la segunda en esta misma cámara antes de viajar a la otra.";
  }
  if (c.includes("segunda lectura") || c.includes("segunda con") || c.includes("2da")) {
    return "Aprobada en segunda lectura por esta cámara. Pasa a la otra, que puede aprobarla igual, modificarla o dejarla morir.";
  }
  if (c.includes("devuelt")) {
    return "La otra cámara la devolvió con modificaciones: esta debe decidir si las acoge.";
  }
  if (c.includes("despachad")) {
    return "Ya salió de esta cámara: siguió hacia la otra o hacia el Poder Ejecutivo.";
  }
  if (c.includes("transcripci") || c.includes("auditor") || c.includes("firmas")) {
    return "Está en trámite administrativo interno (transcripción, revisión y firmas) antes de despacharla.";
  }
  if (c.includes("observ")) {
    return "El Poder Ejecutivo la observó: vuelve al Congreso, que decide si acoge los reparos o insiste.";
  }
  if (c.includes("aprobad")) {
    return "Aprobada en esta cámara. Para ser ley necesita además el voto de la otra en los mismos términos y la promulgación del Presidente.";
  }
  return null;
}

/** Lo que se sabe del trámite de una pieza, de las dos taxonomías y la promulgación. */
export interface SituacionTramite {
  /** La condición gruesa del SIL: VIGENTE, APROBADO, PERIMIDO… */
  condicion: string | null | undefined;
  /** El estado del último trámite: «Enviado a Comisión», «Promulgado»… */
  estado?: string | null;
  /** Hay número o fecha de promulgación, o la ley resolvió en la Consultoría. */
  promulgada?: boolean;
  /** «Ley núm. 43-26», tal como lo guarda la cámara. */
  numPromulgacion?: string | null;
  tipo?: string | null;
  /** «Cámara de Diputados», «Senado»: de dónde partió la pieza. */
  camaraOrigen?: string | null;
}

/** Lo que cierra el trámite: gana a cualquier estado intermedio. */
const TERMINAL = /promulgad|perimid|retirad|rechazad|archivad|fusionad/;

/**
 * «En qué punto está», derivado del **punto más avanzado que se conoce**.
 *
 * El dossier leía solo la condición del SIL, y la condición es gruesa: una ley
 * ya promulgada, con su número y su Gaceta, sigue diciendo «APROBADO». La ficha
 * de la Ley 43-26 decía arriba «Ya es ley», abajo «Promulgado» en los trámites,
 * y en medio que «todavía necesita el voto de la otra cámara y la promulgación
 * del Presidente»: tres bloques contradiciéndose en la misma pantalla.
 *
 * El orden: la promulgación manda; después lo que cierra el trámite
 * (perimida, retirada, rechazada) en cualquiera de las dos taxonomías, porque
 * una pieza perimida conserva el estado del último trámite que tuvo; después
 * el estado del último trámite, que es el dato fino; y la condición al final.
 */
export function enQuePunto(s: SituacionTramite): string | null {
  const numero = numeroDeNorma(s.numPromulgacion);
  if (s.promulgada) {
    return numero
      ? `Completó el trámite: se promulgó como Ley ${numero} y es ley vigente.`
      : "Completó el trámite: es ley vigente.";
  }
  for (const valor of [s.condicion, s.estado]) {
    if (TERMINAL.test((valor ?? "").toLowerCase())) return queSigue(valor);
  }

  const fino = queSigue(s.estado);
  const grueso = queSigue(s.condicion);
  const aprobada = /aprobad/.test((s.condicion ?? "").toLowerCase());
  const estado = (s.estado ?? "").toLowerCase();
  // «Aprobado en 1ra. lectura» (así lo escribe el SIL) contiene «aprobad» pero
  // no cierra nada: falta la segunda en esta misma cámara. Solo la aprobación
  // que termina el paso por la cámara —«2da. lectura», «única lectura» o un
  // «aprobado» sin más— autoriza a decir que pasó al Ejecutivo o a la otra.
  const aMedias = /\b1ra\b|primera/.test(estado);
  // «Aprobada en esta cámara, necesita la otra» solo es cierto para una ley
  // que nació aquí. Una resolución interna termina con el voto de su cámara, y
  // una ley que llegó del Senado ya pasó por la otra.
  if (aprobada && !aMedias && (!fino || /aprobad/.test(estado))) {
    const tipo = (s.tipo ?? "").toLowerCase();
    if (tipo.includes("interna")) {
      return "Aprobada. Es una resolución interna de la cámara: con su voto termina el trámite, sin pasar por la otra cámara ni por el Poder Ejecutivo.";
    }
    if (/senado/i.test(s.camaraOrigen ?? "") && !/diputad/i.test(s.camaraOrigen ?? "")) {
      return "Aprobada en la Cámara de Diputados, que la recibió del Senado. Si la aprobó en los mismos términos pasa al Poder Ejecutivo para su promulgación; si la modificó, vuelve al Senado.";
    }
  }
  return fino ?? grueso;
}

/* ------------------------------------------------- cruces entre fuentes */

/** Palabras que no distinguen nada al principio o al final de una frase. */
const VACIAS = new Set([
  "que", "de", "del", "la", "las", "el", "los", "y", "e", "o", "en", "a", "al",
  "por", "para", "con", "se", "su", "sus", "un", "una", "mediante", "cual",
  "ley", "proyecto", "resolución", "resolucion", "año",
]);

/**
 * La frase más distintiva de un título para buscarla en otro origen.
 *
 * Los buscadores de ambas cámaras hacen match de **subcadena literal**,
 * sensible a tildes pero no a mayúsculas (RECON §2.3, §12.2), y cada origen
 * escribe distinto las cifras y las abreviaturas: «Ley núm.99-25» en uno,
 * «LEY NÚM. 99-25» en otro. Así que se busca el tramo de texto corrido más
 * largo sin números ni puntuación, recortado a unas pocas palabras y sin
 * palabras vacías en los bordes. `null` si no queda una frase de al menos tres
 * palabras: buscar «ley» no identifica nada.
 */
export function fraseDeBusqueda(titulo: string, maxPalabras = 7): string | null {
  const tramos = limpiarTexto(titulo)
    .split(/[,.;:()"“”«»\[\]\/\d–-]+|\bn[uú]m\b|\bno\b\.?/i)
    .map((t) => t.trim().split(/\s+/).filter(Boolean));

  let mejor: string[] = [];
  for (let palabras of tramos) {
    while (palabras.length && VACIAS.has(palabras[0].toLowerCase())) palabras = palabras.slice(1);
    palabras = palabras.slice(0, maxPalabras);
    while (palabras.length && VACIAS.has(palabras[palabras.length - 1].toLowerCase())) {
      palabras = palabras.slice(0, -1);
    }
    if (palabras.length > mejor.length) mejor = palabras;
  }
  return mejor.length >= 3 ? mejor.join(" ") : null;
}

export interface ProyectosDeNorma {
  /** La pieza de Diputados que se promulgó con este número. */
  origen: Iniciativa[];
  /** Piezas de Diputados cuyo título cita esta norma, sin contar el origen. */
  citan: Iniciativa[];
  /** Cuántas filas del buscador se revisaron para `citan`. */
  revisadas: number;
}

/**
 * De una ley a los proyectos del Congreso: el que la originó y los que hoy la
 * tocan. Solo Diputados —su buscador es JSON y barato; el del Senado es un
 * postback por consulta— y solo leyes, que son lo único que nace ahí.
 *
 * El SIL no busca sobre `numPromulgacion`, así que el origen se encuentra
 * buscando una frase del título oficial de la ley y se **confirma** por el
 * número de promulgación: una coincidencia de texto sola nunca se da por
 * buena. Límite honesto: el SIL solo guarda el registro vigente (2024-2028)
 * y lo que se arrastró; una ley cuyo proyecto murió o terminó antes no aparece.
 *
 * `null` si el SIL no contestó a ninguna consulta: la ficha calla en vez de
 * afirmar que no hay proyectos.
 */
export async function proyectosDeNorma(
  tipo: string,
  numero: string,
  titulo: string | null,
): Promise<ProyectosDeNorma | null> {
  if (tipo !== "Ley" || !/^\d{1,4}-\d{2,4}$/.test(numero)) return null;

  // Un número de 2020 («47-20») es subcadena de toda cita de expediente
  // («06347-2024-2028-CD»); con «núm.» delante deja de serlo.
  const porNumero = /-20$/.test(numero) ? `núm. ${numero}` : numero;
  // Dos cortes de la misma frase: el largo acierta cuando el proyecto y la ley
  // se titulan igual; el corto, cuando la ley añadió una palabra («…del
  // Estado *Dominicano*…») que el proyecto no tenía.
  const larga = titulo ? fraseDeBusqueda(titulo) : null;
  const corta = titulo ? fraseDeBusqueda(titulo, 4) : null;

  const consultas = await Promise.all([
    buscarIniciativas(porNumero, 1, 86400),
    larga ? buscarIniciativas(larga, 1, 86400) : Promise.resolve(null),
    corta && corta !== larga ? buscarIniciativas(corta, 1, 86400) : Promise.resolve(null),
  ]);
  if (consultas.every((c) => c === null)) return null;

  const vistas = new Map<number, Iniciativa>();
  for (const c of consultas) {
    for (const raw of c?.results ?? []) {
      if (!vistas.has(raw.id)) vistas.set(raw.id, normalizarIniciativa(raw));
    }
  }

  const origen = [...vistas.values()].filter(
    (i) =>
      i.numPromulgacion !== null &&
      /\bley\b/i.test(i.numPromulgacion) &&
      numeroDeNorma(i.numPromulgacion) === numero,
  );
  const deOrigen = new Set(origen.map((i) => i.id));

  const citan = (consultas[0]?.results ?? [])
    .map((raw) => vistas.get(raw.id)!)
    .filter(
      (i) =>
        !deOrigen.has(i.id) &&
        referenciasNormativas([i.titulo, i.tituloModificado].filter(Boolean).join(". ")).some(
          (r) => r.tipo === "Ley" && r.numero === numero,
        ),
    );

  return { origen, citan, revisadas: consultas[0]?.results.length ?? 0 };
}
