/**
 * Rol Nacional de Audiencias del Poder Judicial: la historia de un caso en
 * todos los tribunales por los que pasó, buscada por su número único (NUC).
 *
 * Mecánica verificada en docs/AUDITORIA.md §H.13 (2026-09-30), con la consulta:
 *
 *  1. La página pública `rolnacionalaudiencias.poderjudicial.gob.do` es una SPA
 *     de React, sin CAPTCHA ni clave. Su API vive en
 *     `apigestionaudienciasroles.poderjudicial.gob.do/api/` (robots de 0 bytes).
 *  2. El rol es `POST /api/Audiencias/ObtenerRolAudiencias/` con el JSON que
 *     arma la propia SPA: `idTipoConsulta: 4` (número único de caso),
 *     `tipoConsulta: "<NUC>"`, ceros y nulos en los demás filtros, y la página.
 *     Responde `totalRegistros`, `totalPaginas` y `datos[]`: una fila por
 *     audiencia, con fecha y hora locales, tribunal, sala, modalidad, estado,
 *     resultado, materia, asunto y las partes. 4.6 s para un caso.
 *  3. El NUC no tiene un formato único (nueve patrones en veinte filas): se
 *     envía tal como lo escribe el lector, sin los espacios de los extremos.
 *
 * Los límites del dueño, que esta capa hace cumplir y no la página:
 *  · se consulta **solo por un NUC exacto** que escribe el lector. Nunca por
 *    nombre de parte, cédula o representante (los tipos 6, 7 y 26 que la API
 *    admite) ni el rol entero sin filtro;
 *  · **ningún nombre de parte sale de aquí.** `partes` es una cadena
 *    «NOMBRE (PAPEL); NOMBRE (PAPEL)…»: de cada entrada se queda solo el papel
 *    del final, y solo si está en la lista cerrada `PAPELES`; lo demás se
 *    cuenta como «otro papel», sin texto. La transformación ocurre dentro de la
 *    función cacheada, así que el nombre no llega ni a la caché ni a la página;
 *  · el enlace a la sala virtual (`urlAudiencia`) tampoco se guarda: se abre
 *    desde el rol del Poder Judicial;
 *  · la página no se indexa cuando lleva un número (`app/audiencias/page.tsx`).
 *
 * ⚠️ En `next dev` la respuesta cruda **sí** aparece en el HTML: React 19.2, en
 * su build de desarrollo, serializa como información de depuración el valor de
 * cada lectura que espera un componente de servidor. El servidor de producción
 * de React no tiene ese código (docs/ARQUITECTURA.md, «Consultas por número»):
 * lo que no pinta un componente no llega a la página.
 *
 * Contrato (`.claude/rules/fuentes.md`): `lib/pedir.ts` con el User-Agent de la
 * casa, 25 s, un reintento, `content-type` JSON y la forma validada con `zod`.
 * Lectura acotada: a lo sumo `MAX_PAGINAS` páginas de `POR_PAGINA`; si el caso
 * tiene más audiencias, se declara (`truncado`). Caché por NUC con
 * `unstable_cache` (el cuerpo POST la deja fuera de la caché de `fetch`), una
 * hora; un fallo lanza dentro de la función cacheada para que **nunca se
 * guarde un `null`**, y hacia la página se degrada a `null`.
 */

import { unstable_cache } from "next/cache";
import { z } from "zod";
import { filas, pedirJsonOLanzar } from "@/lib/pedir";
import type { Tono } from "@/lib/estados";

const API = "https://apigestionaudienciasroles.poderjudicial.gob.do/api/Audiencias/ObtenerRolAudiencias/";
/** La página pública del rol, para quien quiera consultarlo allí. */
export const ROL_PUBLICO = "https://rolnacionalaudiencias.poderjudicial.gob.do/";
const USER_AGENT = "Socratico-Inteligencia/1.0 (justicia; herramienta independiente)";
/** La SPA pide 20 por página en su tabla; el caso medido tenía 5 audiencias. */
const POR_PAGINA = 20;
/** 3 × 20 = 60 audiencias, las más recientes: la API las da de la más nueva a la más vieja. */
const MAX_PAGINAS = 3;
/** Una hora: el rol se mueve con cada audiencia conocida o reprogramada. */
const CACHE_S = 3600;

/* ---------------------------------------------------------------- el NUC */

/** Cifras, letras, guion, barra y punto; de 5 a 40 caracteres. */
const FORMA_NUC = /^[\p{L}\p{N}./-]{5,40}$/u;

/**
 * El NUC tal como lo escribió el lector (sin los espacios de los extremos), o
 * el motivo por el que no puede ser uno. Lleva al menos una cifra: así una
 * palabra suelta —un apellido— no llega a la API como si fuera un número.
 */
export function validarNuc(texto: string | null | undefined): { nuc: string } | { error: string } {
  const t = (texto ?? "").trim();
  if (!FORMA_NUC.test(t) || !/\p{N}/u.test(t)) {
    return {
      error:
        "Un número único de caso lleva cifras y, a veces, letras, guiones, barras o puntos, sin espacios: entre 5 y 40 caracteres. Aquí no se busca por nombre ni por cédula.",
    };
  }
  return { nuc: t };
}

/* ------------------------------------------------------------- los papeles */

/**
 * Los papeles que se muestran, por su forma plana (sin tildes, en minúscula):
 * una lista **cerrada**. Lo que va entre paréntesis al final de cada parte es
 * casi siempre su papel, pero un nombre con paréntesis («EMPRESA (EMT)») o una
 * errata del tribunal podría colar un nombre: si no está aquí, no se muestra.
 * Salen de los papeles que trae el rol en las filas del reconocimiento
 * (AUDITORIA §H.13: dieciséis distintos) y de los que usan los procesos penal,
 * civil, laboral e inmobiliario.
 */
const PAPELES: Record<string, string> = Object.fromEntries(
  [
    "abogado", "abogada", "accionante", "accionado", "accionada", "actor civil", "actora civil",
    "adolescente imputado", "adolescente imputada", "agraviado", "agraviada", "apelante", "apelado",
    "apelada", "codemandado", "codemandada", "coimputado", "coimputada", "curador", "curadora",
    "defensor", "defensora", "defensor publico", "defensora publica", "demandado", "demandada",
    "demandante", "embargado", "embargada", "embargante", "fiscal", "impetrante", "imputado",
    "imputada", "interviniente", "intimado", "intimada", "intimante", "ministerio publico",
    "objetado", "objetada", "objetante", "ofendido", "ofendida", "perito", "perita",
    "procurador fiscal", "procuradora fiscal", "querellado", "querellada", "querellante",
    "reclamado", "reclamada", "reclamante", "recurrente", "recurrido", "recurrida",
    "representante", "representante fisico", "representante legal", "requerido", "requerida",
    "requirente", "solicitado", "solicitada", "solicitante", "tercero civilmente demandado",
    "tercera civilmente demandada", "testigo", "tutor", "tutora", "victima",
  ].map((p) => [p, etiquetaPapel(p)]),
);

/** La forma escrita de un papel de la lista: con sus tildes y «Ministerio Público» en mayúscula. */
function etiquetaPapel(plano: string): string {
  return plano
    .replace(/\bpublic([oa])\b/g, "públic$1")
    .replace(/\bvictima\b/, "víctima")
    .replace(/\bfisico\b/, "físico")
    .replace(/^ministerio públic/, "Ministerio Públic");
}

function plano(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-zñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** «Víctima y Querellante» → «víctima y querellante», si las dos están en la lista. */
function papelConocido(texto: string): string | null {
  const trozos = plano(texto).split(/ y /);
  const etiquetas = trozos.map((t) => PAPELES[t]);
  return etiquetas.length > 0 && etiquetas.every(Boolean) ? etiquetas.join(" y ") : null;
}

export interface Papel {
  /** El papel en la causa, en minúscula («recurrente», «Ministerio Público»). */
  papel: string;
  /** Cuántas partes lo tienen en esa audiencia. */
  cuantas: number;
}

/**
 * De la cadena de partes, **solo los papeles**, contados en el orden en que
 * aparecen. El resto de cada entrada —el nombre— se descarta aquí mismo.
 */
function papelesDe(partes: string | null | undefined): { papeles: Papel[]; otras: number } {
  const cuenta = new Map<string, number>();
  let otras = 0;
  for (const entrada of (partes ?? "").split(";")) {
    const e = entrada.trim();
    if (!e) continue;
    const m = /\(([^()]*)\)[\s.]*$/.exec(e);
    const papel = m ? papelConocido(m[1]) : null;
    if (papel) cuenta.set(papel, (cuenta.get(papel) ?? 0) + 1);
    else otras++;
  }
  return { papeles: [...cuenta].map(([papel, cuantas]) => ({ papel, cuantas })), otras };
}

/* ----------------------------------------------------------- la respuesta */

/*
  La forma de la respuesta, validada con `zod`: todos los campos pueden faltar
  o venir nulos, y una fila con otra forma se descarta sola (`filas`). Se leen
  solo los campos que se muestran; `urlAudiencia`, los identificadores internos
  y el resto pasan de largo y no salen de `aAudiencia`.
*/
const texto = z.string().nullish();
const FILA = z.looseObject({
  idAudiencia: z.number().nullish(),
  fechaDate: texto,
  horaAudiencia: texto,
  nuc: texto,
  distritoJudicial: texto,
  categoriaTribunal: texto,
  tribunal: texto,
  sala: texto,
  modalidad: texto,
  direccionSala: texto,
  estadoRolAudiencia: texto,
  partes: texto,
  tipoResultado: texto,
  materia: texto,
  asunto: texto,
  fechaNuevaAudiencia: texto,
});
const PAGINA = z.looseObject({
  paginaActual: z.number().nullish(),
  totalPaginas: z.number().nullish(),
  totalRegistros: z.number().nullish(),
  datos: filas(FILA).nullish(),
});

export interface Audiencia {
  /** `idAudiencia` del rol: la clave de la fila. */
  id: number | null;
  /** Fecha y hora **locales** tal como las da el rol, `AAAA-MM-DDTHH:MM:SS` sin zona. */
  fecha: string | null;
  distrito: string | null;
  /** Instancia: «SUPREMA CORTE DE JUSTICIA», «PRIMERA INSTANCIA Y EQUIVALENTES». */
  categoria: string | null;
  tribunal: string | null;
  sala: string | null;
  /** Dónde queda la sala, como lo escribe el tribunal. */
  lugar: string | null;
  modalidad: string | null;
  /** «Pendiente», «Conocida», «En curso», «Recesada». */
  estado: string | null;
  /** «Aplazada», «Fallada», «Fallo Reservado»…; `null` si todavía no hay. */
  resultado: string | null;
  /** La fecha a la que se aplazó, si el rol la da (fecha local sin zona). */
  nuevaFecha: string | null;
  materia: string | null;
  asunto: string | null;
  /** Solo los papeles de las partes: nunca sus nombres. */
  papeles: Papel[];
  /** Partes cuyo papel no está en la lista cerrada: se cuentan, no se muestran. */
  otrasPartes: number;
}

export interface RolDeCaso {
  /** El número tal como se consultó. */
  nuc: string;
  /** De la más reciente (o la que viene) a la más antigua. */
  audiencias: Audiencia[];
  /** Las que el rol dice tener (`totalRegistros`), o las leídas si no lo dice. */
  total: number;
  /** `true` si el tope de páginas cortó la lectura: faltan las más antiguas. */
  truncado: boolean;
  /** Instante de la lectura (ISO). */
  consultado: string;
}

const limpio = (s: string | null | undefined): string | null => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t || null;
};

/** Una fecha local sin zona, o `null`: «2026-10-13T09:00:00», «2026-10-13». */
function fechaLocal(s: string | null | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::\d{2})?)?/.exec((s ?? "").trim());
  if (!m) return null;
  return m[2] && m[2] !== "00:00" ? `${m[1]}T${m[2]}:00` : m[1];
}

function aAudiencia(f: z.infer<typeof FILA>): Audiencia {
  const { papeles, otras } = papelesDe(f.partes);
  return {
    id: f.idAudiencia ?? null,
    fecha: fechaLocal(f.fechaDate),
    distrito: limpio(f.distritoJudicial),
    categoria: limpio(f.categoriaTribunal),
    tribunal: limpio(f.tribunal),
    sala: limpio(f.sala),
    lugar: limpio(f.direccionSala)?.replace(/[\s,.]+$/, "") || null,
    modalidad: limpio(f.modalidad),
    estado: limpio(f.estadoRolAudiencia),
    resultado: limpio(f.tipoResultado),
    nuevaFecha: fechaLocal(f.fechaNuevaAudiencia),
    materia: limpio(f.materia),
    asunto: limpio(f.asunto),
    papeles,
    otrasPartes: otras,
  };
}

function leerPagina(nuc: string, pagina: number) {
  // Lanza en cualquier fallo: `unstable_cache` no guarda una excepción.
  return pedirJsonOLanzar(API, {
    fuente: "audiencias",
    ua: USER_AGENT,
    tipo: /json/i,
    metodo: "POST",
    cabeceras: { Accept: "application/json", "Content-Type": "application/json" },
    cache: "no-store",
    esquema: PAGINA,
    // El cuerpo de la propia SPA, con el tipo de consulta fijo en 4: el NUC.
    cuerpo: JSON.stringify({
      idDistritoJudicial: 0,
      idCategoriaTribunal: 0,
      idMateria: 0,
      idTribunal: 0,
      idSala: 0,
      idModalidad: 0,
      idEstatus: 0,
      idTipoConsulta: 4,
      tipoConsulta: nuc,
      fechaDesde: null,
      fechaHasta: null,
      paginaActual: pagina,
      registrosPorPagina: POR_PAGINA,
    }),
  });
}

async function leerRol(nuc: string): Promise<RolDeCaso> {
  const vistas = new Map<string, Audiencia>();
  let total: number | null = null;
  let completo = false;
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const r = await leerPagina(nuc, pagina);
    const datos = r.datos ?? [];
    total ??= r.totalRegistros ?? null;
    // Por su id: si el rol se mueve entre dos lecturas, una audiencia no sale dos veces.
    for (const f of datos) {
      const a = aAudiencia(f);
      const clave = a.id != null ? String(a.id) : `${a.fecha}|${a.tribunal}|${a.sala}|${vistas.size}`;
      if (!vistas.has(clave)) vistas.set(clave, a);
    }
    // No se cree el contador ajeno: la lectura termina cuando una página llega corta.
    if (datos.length < POR_PAGINA || (r.totalPaginas != null && pagina >= r.totalPaginas)) {
      completo = true;
      break;
    }
  }
  const audiencias = [...vistas.values()].sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  return {
    nuc,
    audiencias,
    total: Math.max(total ?? 0, audiencias.length),
    truncado: !completo,
    consultado: new Date().toISOString(),
  };
}

const rolCacheado = unstable_cache(leerRol, ["audiencias-rol-por-nuc"], { revalidate: CACHE_S });

/**
 * Las audiencias de un caso por su NUC exacto. Una lista vacía es una
 * respuesta («el rol no tiene audiencias con ese número»); `null`, que el rol
 * no contestó o el número no es válido.
 */
export async function rolDeCaso(texto: string): Promise<RolDeCaso | null> {
  const v = validarNuc(texto);
  if ("error" in v) return null;
  try {
    return await rolCacheado(v.nuc);
  } catch (err) {
    // Sin el número en el registro: es lo que tecleó el lector.
    console.error(`[audiencias] consulta por NUC: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/* ---------------------------------------------------------- vocabulario */

/**
 * El estado de una audiencia en los oficios de `lib/estados.ts`: la que está
 * por celebrarse es una fecha que corre (ocre); la conocida, la que está en
 * curso o en receso informan y no piden nada (grafito).
 */
export function tonoDeAudiencia(estado: string | null): Tono {
  return /pendiente/i.test(estado ?? "") ? "aviso" : "contexto";
}

/** El estado del rol en llano: «Conocida» es que ya se celebró. El literal va en el `title`. */
export function estadoEnLlano(estado: string | null): string {
  const e = plano(estado ?? "");
  if (e === "pendiente") return "Por celebrarse";
  if (e === "conocida") return "Celebrada";
  if (e === "recesada") return "En receso";
  return estado ?? "Sin estado";
}

/** «Fallo Reservado» → «Fallo reservado»: el resultado en letra de frase. */
export function resultadoEnLlano(resultado: string | null): string | null {
  if (!resultado) return null;
  const t = resultado.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** El instante de ahora como fecha y hora de Santo Domingo, sin zona: se compara con `fecha`. */
export function ahoraEnSantoDomingo(): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "00";
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}:00`;
}

/**
 * La próxima audiencia del caso: la pendiente más cercana desde ahora o, si el
 * rol todavía no la lista, la fecha a la que se aplazó la última. `null` si no
 * hay ninguna por delante.
 */
export function proximaAudiencia(
  rol: RolDeCaso,
  ahora = ahoraEnSantoDomingo(),
): { audiencia: Audiencia; fecha: string; porAplazamiento: boolean } | null {
  const hoy = ahora.slice(0, 10);
  const porDelante = (f: string | null): f is string => !!f && (f.length === 10 ? f >= hoy : f >= ahora);
  const pendientes = rol.audiencias
    .filter((a) => !/conocida/i.test(a.estado ?? "") && porDelante(a.fecha))
    .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
  if (pendientes[0]?.fecha) return { audiencia: pendientes[0], fecha: pendientes[0].fecha, porAplazamiento: false };
  const ultima = rol.audiencias.find((a) => a.fecha && !porDelante(a.fecha));
  if (ultima && porDelante(ultima.nuevaFecha)) {
    return { audiencia: ultima, fecha: ultima.nuevaFecha, porAplazamiento: true };
  }
  return null;
}
