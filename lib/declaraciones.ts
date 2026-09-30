import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Declaraciones juradas de patrimonio (Ley 311-14) que las propias
 * instituciones publican en sus portales, atadas a la ficha de quien declara
 * cuando no hay duda. Instantánea `public/data/declaraciones.json`
 * (`scripts/build-declaraciones.py`; mecánica en docs/AUDITORIA.md §H.12).
 *
 * Decisión del dueño (2026-09-30, docs/DECISIONES.md): se **enlazan**. No se
 * copia ningún PDF ni se lee su contenido: título, institución, fecha de
 * subida y la URL original. El registro central lo custodia la Cámara de
 * Cuentas en su Consulta Pública de DJP, que exige un CAPTCHA: la plataforma
 * no la lee y la ficha la enlaza para que el lector busque.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

export interface Declaracion {
  /** El título que puso la institución, tal cual. */
  titulo: string;
  /** Fecha de subida a la biblioteca (no la de la declaración), ISO, o `null`. */
  fecha: string | null;
  url: string;
  institucion: string;
  institucionId: number | null;
  /** El nombre que se lee del título, plano, o `null`. */
  nombre: string | null;
  /** La ficha de quien declara, si se ató sin dudas. */
  personaId: string | null;
  /**
   * Cómo se ató: `institucion` si tiene un cargo en la que la publica;
   * `nombre` si su nombre, de tres o más palabras, es único en la plataforma.
   */
  via: "institucion" | "nombre" | null;
}

export interface FuenteDeclaraciones {
  base: string;
  institucion: string;
  id: number | null;
  estado: string;
  nota: string;
  encontradas: number;
}

export interface Declaraciones {
  generado: string;
  /** La Consulta Pública de DJP de la Cámara de Cuentas. */
  camara: string;
  fuentes: FuenteDeclaraciones[];
  declaraciones: Declaracion[];
}

interface Cruda {
  generado: string;
  camara: string;
  fuentes: FuenteDeclaraciones[];
  declaraciones: {
    t: string;
    f: string | null;
    u: string;
    b: number;
    n: string | null;
    p: string | null;
    v?: "institucion" | "nombre" | null;
  }[];
}

let memo: Promise<Declaraciones | null> | null = null;

export function getDeclaraciones(): Promise<Declaraciones | null> {
  memo ??= readFile(join(process.cwd(), "public", "data", "declaraciones.json"), "utf8")
    .then((t) => {
      const d = JSON.parse(t) as Cruda;
      if (!Array.isArray(d.declaraciones) || !Array.isArray(d.fuentes)) throw new Error("declaraciones.json sin filas");
      return {
        generado: d.generado,
        camara: d.camara,
        fuentes: d.fuentes,
        declaraciones: d.declaraciones.map((x) => ({
          titulo: x.t,
          fecha: x.f,
          url: x.u,
          institucion: d.fuentes[x.b]?.institucion ?? "",
          institucionId: d.fuentes[x.b]?.id ?? null,
          nombre: x.n,
          personaId: x.p,
          via: x.v ?? (x.p ? "institucion" : null),
        })),
      };
    })
    .catch((err) => {
      console.error("[declaraciones]", err);
      memo = null;
      return null;
    });
  return memo;
}

/** Las que están atadas a una persona, de la más reciente a la más vieja. */
export async function declaracionesDe(personaId: string): Promise<Declaracion[]> {
  const d = await getDeclaraciones();
  return d?.declaraciones.filter((x) => x.personaId === personaId) ?? [];
}

/** Palabras de un nombre como las compara el build: sin tildes, sin signos, en minúscula. */
function palabras(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * Las que no se ataron a nadie y cuyo nombre leído tiene todas sus palabras en
 * el de esta persona: pueden ser suyas o de otra con un nombre parecido. Se
 * enseñan como tales, nunca como suyas.
 */
export async function declaracionesParecidas(nombres: string[]): Promise<Declaracion[]> {
  const d = await getDeclaraciones();
  if (!d) return [];
  const suyas = nombres.map((n) => new Set(palabras(n)));
  return d.declaraciones.filter(
    (x) => !x.personaId && x.nombre && suyas.some((s) => x.nombre!.split(" ").every((p) => s.has(p))),
  );
}

/** Las que publica una institución en su portal. */
export async function declaracionesDeInstitucion(id: number): Promise<Declaracion[]> {
  const d = await getDeclaraciones();
  return d?.declaraciones.filter((x) => x.institucionId === id) ?? [];
}

/** Cuántas instituciones las publican en lo que la plataforma lee. */
export function institucionesQuePublican(d: Declaraciones): number {
  return d.fuentes.filter((f) => f.encontradas > 0).length;
}
