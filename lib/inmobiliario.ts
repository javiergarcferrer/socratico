/**
 * Registro Inmobiliario: la consulta pública de expedientes, por su número
 * exacto. En qué órgano está un trámite (Registro de Títulos, Mensuras
 * Catastrales…), cuándo se pidió, su resultado y su estado.
 *
 * Mecánica verificada en docs/AUDITORIA.md §H.13 (2026-09-30), con la consulta:
 *
 *  1. La página `https://servicios.ri.gob.do/ConsultaDeExpedientes` (robots de
 *     0 bytes) hace `POST ConsultaDeExpedientes/GetExpedient` con un
 *     formulario, `NoExpe=<número>`, y no pregunta si el número tiene menos de
 *     5 caracteres. Sin cookies, token ni CAPTCHA.
 *  2. Un número que no existe → 200 JSON
 *     `{"data":[],"statusCode":200,"errorMessage":null,"isSuccess":false}`.
 *  3. ⚠️ **Nunca se vio una respuesta con datos**: no hay un número real
 *     publicado y no se buscó uno. Las columnas salen del JS de la página
 *     (`SearchGrid()`): `fechaSolicitud, organo, numeroExpediente,
 *     numeroOriginal, resultadoExpediente, estatusDigital, tramites`. Por eso
 *     el esquema las acepta todas opcionales y de cualquier tipo (texto,
 *     número, lista), no descarta ninguna fila por su forma, y la página y
 *     `/fuentes` dicen que la forma con datos es inferida.
 *
 * Solo por el número exacto que escribe el lector: el parcelario (reCAPTCHA) y
 * las certificaciones de estado jurídico (cuenta y pago) no se tocan.
 *
 * Contrato (`.claude/rules/fuentes.md`): `lib/pedir.ts` con el User-Agent de la
 * casa, 25 s, un reintento, `content-type` JSON y el sobre validado con `zod`.
 * Caché por número con `unstable_cache` (el cuerpo POST la deja fuera de la
 * caché de `fetch`), una hora; un fallo lanza dentro de la función cacheada
 * para que **nunca se guarde un `null`**, y hacia la página se degrada a `null`.
 */

import { unstable_cache } from "next/cache";
import { z } from "zod";
import { pedirJsonOLanzar } from "@/lib/pedir";

const API = "https://servicios.ri.gob.do/ConsultaDeExpedientes/GetExpedient";
/** La página pública de la consulta, para quien quiera hacerla allí. */
export const CONSULTA_PUBLICA = "https://servicios.ri.gob.do/ConsultaDeExpedientes";
const USER_AGENT = "Socratico-Inteligencia/1.0 (justicia; herramienta independiente)";
/** Una hora: un expediente cambia de estado en días, no en minutos. */
const CACHE_S = 3600;

/* ------------------------------------------------------------- el número */

/** Cifras, letras, guion, barra y punto; de 5 (el mínimo de la página) a 40 caracteres. */
const FORMA = /^[\p{L}\p{N}./-]{5,40}$/u;

/** El número tal como lo escribió el lector (sin los espacios de los extremos), o por qué no puede ser uno. */
export function validarExpediente(texto: string | null | undefined): { numero: string } | { error: string } {
  const t = (texto ?? "").trim();
  if (!FORMA.test(t) || !/\p{N}/u.test(t)) {
    return {
      error:
        "Un número de expediente lleva cifras y, a veces, letras, guiones, barras o puntos, sin espacios: de 5 a 40 caracteres. Aquí no se busca por nombre, cédula, matrícula ni parcela.",
    };
  }
  return { numero: t };
}

/* ----------------------------------------------------------- la respuesta */

/*
  Cada campo es `unknown` y opcional a propósito: la forma con datos no se ha
  visto, así que ninguna fila se descarta por traer un número donde se
  esperaba texto, una lista donde se esperaba un número o por faltarle una
  columna. `aTexto` decide qué se puede mostrar. (En zod 4 un `unknown` sin
  `.optional()` exige la clave.)
*/
const campo = z.unknown().optional();
const FILA = z.looseObject({
  fechaSolicitud: campo,
  organo: campo,
  numeroExpediente: campo,
  numeroOriginal: campo,
  resultadoExpediente: campo,
  estatusDigital: campo,
  tramites: campo,
});
const SOBRE = z.looseObject({
  data: z.array(z.unknown()).nullish(),
  statusCode: z.number().nullish(),
  errorMessage: z.string().nullish(),
  isSuccess: z.boolean().nullish(),
});

export interface Expediente {
  /** Tal como la da el Registro: una fecha ISO si se reconoce como tal, si no el texto. */
  fechaSolicitud: string | null;
  organo: string | null;
  numeroExpediente: string | null;
  numeroOriginal: string | null;
  resultado: string | null;
  estado: string | null;
  tramite: string | null;
}

export interface ConsultaExpediente {
  numero: string;
  /** Las filas que devolvió el Registro; vacía si no tiene ese número. */
  expedientes: Expediente[];
  /** Instante de la lectura (ISO). */
  consultado: string;
}

/** Texto, número o lista de ellos → una línea; otra cosa (un objeto) → `null`. */
function aTexto(v: unknown): string | null {
  if (typeof v === "string") return v.replace(/\s+/g, " ").trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) {
    const partes = v.map(aTexto).filter((x): x is string => !!x);
    return partes.length ? partes.join(", ") : null;
  }
  return null;
}

/** «2024-01-15T00:00:00» → «2024-01-15»; cualquier otra forma se deja como llegó. */
function fecha(v: unknown): string | null {
  const t = aTexto(v);
  const m = t ? /^(\d{4}-\d{2}-\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.exec(t) : null;
  return m ? m[1] : t;
}

function aExpediente(crudo: unknown): Expediente | null {
  const r = FILA.safeParse(crudo);
  if (!r.success) return null;
  const f = r.data;
  const e: Expediente = {
    fechaSolicitud: fecha(f.fechaSolicitud),
    organo: aTexto(f.organo),
    numeroExpediente: aTexto(f.numeroExpediente),
    numeroOriginal: aTexto(f.numeroOriginal),
    resultado: aTexto(f.resultadoExpediente),
    estado: aTexto(f.estatusDigital),
    tramite: aTexto(f.tramites),
  };
  // Una fila sin ninguno de los siete campos no dice nada: no se pinta.
  return Object.values(e).some(Boolean) ? e : null;
}

async function leerExpediente(numero: string): Promise<ConsultaExpediente> {
  // Lanza en cualquier fallo: `unstable_cache` no guarda una excepción.
  const sobre = await pedirJsonOLanzar(API, {
    fuente: "inmobiliario",
    ua: USER_AGENT,
    tipo: /json/i,
    metodo: "POST",
    cabeceras: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    cache: "no-store",
    esquema: SOBRE,
    cuerpo: new URLSearchParams({ NoExpe: numero }).toString(),
    // El sobre trae su propio estado: un 4xx o 5xx dentro de un 200 es un fallo, no «no existe».
    comprobar: (s) => (s.statusCode != null && s.statusCode >= 400 ? `el Registro respondió ${s.statusCode}` : null),
  });
  return {
    numero,
    expedientes: (sobre.data ?? []).map(aExpediente).filter((e): e is Expediente => e !== null),
    consultado: new Date().toISOString(),
  };
}

const expedienteCacheado = unstable_cache(leerExpediente, ["inmobiliario-expediente"], { revalidate: CACHE_S });

/**
 * Lo que el Registro Inmobiliario publica de un expediente, por su número
 * exacto. Una lista vacía es una respuesta («no hay un expediente con ese
 * número»); `null`, que el Registro no contestó o el número no es válido.
 */
export async function consultarExpediente(texto: string): Promise<ConsultaExpediente | null> {
  const v = validarExpediente(texto);
  if ("error" in v) return null;
  try {
    return await expedienteCacheado(v.numero);
  } catch (err) {
    console.error(`[inmobiliario] consulta por número: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
