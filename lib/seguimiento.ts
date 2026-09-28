/**
 * Lo que el visitante sigue: guardado en **su** navegador, y en ningún otro
 * sitio.
 *
 * La invariante de la plataforma (CLAUDE.md) prohíbe una base de datos fuera de
 * `/democracia`, y seguir algo no la necesita: la lista vive en
 * `localStorage`, y «qué cambió desde tu última visita» se calcula en el
 * navegador comparando lo que la fuente dice hoy con la **huella** —el estado
 * en palabras— que se guardó la última vez que se miró. Las notificaciones
 * push exigirían guardar suscripciones en un servidor; es una decisión abierta
 * del dueño (`docs/PLAN-ACCESO.md` §6) y no se construye aquí.
 *
 * Empezó guardando solo códigos de proceso de compras, como una lista de
 * cadenas bajo la misma clave. Esa forma se sigue leyendo: cada cadena suelta
 * se migra a una entrada de tipo `proceso` la primera vez que se lee, sin
 * perder nada de lo que el visitante ya tenía marcado.
 *
 * El módulo no lleva `"use client"` a propósito: los tipos y `huellaDe` los
 * usan también las fichas del servidor y `/api/seguimiento`, para que la
 * huella se calcule con **una sola** función a los dos lados. Las funciones
 * que tocan el almacenamiento comprueban `window` y no hacen nada en el
 * servidor.
 */

import * as z from "zod/mini";
import { enlace } from "@/lib/grafo";

const KEY = "lrd:seguimiento";
const EVENTO = "lrd:seguimiento-cambio";

export const TIPOS_SEGUIDO = [
  "proceso",
  "proyecto",
  "expediente-senado",
  "proveedor",
  "institucion",
  "norma",
] as const;

export type TipoSeguido = (typeof TIPOS_SEGUIDO)[number];

/** Cómo se nombra cada grupo en `/seguimiento`, en el orden en que se pinta. */
export const GRUPOS_SEGUIDO: Record<TipoSeguido, { singular: string; plural: string }> = {
  proceso: { singular: "Compra pública", plural: "Compras públicas" },
  proyecto: { singular: "Iniciativa de Diputados", plural: "Iniciativas en Diputados" },
  "expediente-senado": { singular: "Expediente del Senado", plural: "Expedientes del Senado" },
  proveedor: { singular: "Proveedor", plural: "Proveedores del Estado" },
  institucion: { singular: "Institución", plural: "Instituciones" },
  norma: { singular: "Norma", plural: "Decretos y normas" },
};

/** ¿Este tipo tiene un estado que pueda cambiar y que la plataforma sepa leer? */
export const TIPOS_CON_ESTADO: ReadonlySet<TipoSeguido> = new Set([
  "proceso",
  "proyecto",
  "expediente-senado",
]);

export interface Seguido {
  tipo: TipoSeguido;
  /**
   * Identificador dentro de su tipo: el código del proceso, el id del SIL,
   * `cuatrienio/id` en el Senado, el RPE, el id de la institución, `tipo/numero`
   * en una norma.
   */
  id: string;
  titulo: string;
  href: string;
  /** El estado en palabras la última vez que se miró. */
  huella?: string;
  /** Cuándo se empezó a seguir (ISO). */
  desde?: string;
  /** Cuándo se miró por última vez en `/seguimiento` (ISO). */
  visto?: string;
}

/**
 * Lo que hace falta para escribir la huella de una pieza. Cada fuente da un
 * subconjunto: la DGCP solo un estado; el SIL, condición y estado; el Senado,
 * además, si se promulgó o perimió. Solo se leen estos campos, así que se le
 * puede pasar el objeto normalizado de la fuente tal cual.
 */
export interface Situacion {
  condicion?: string | null;
  estado?: string | null;
  /** El estado que el consultante del Senado destaca en cabecera. */
  estadoActual?: string | null;
  promulgada?: boolean | null;
  perimida?: boolean | null;
}

/**
 * El estado de una pieza como una frase corta y estable. Es lo que se guarda
 * y lo que se enseña («Antes: En comisión · Ahora: Aprobada»), así que tiene
 * que leerse y no ser un hash. Las partes vacías o repetidas se descartan.
 */
export function huellaDe(s: Situacion): string {
  const partes = [s.condicion, s.estadoActual, s.estado]
    .map((p) => (p ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    // El SIL escribe la condición en versales («DEPOSITADO»): se guarda en
    // caja de frase para que el antes y el ahora se lean sin gritar.
    .map((p) =>
      p === p.toLocaleUpperCase("es-DO") && /\p{L}{3}/u.test(p)
        ? p.charAt(0) + p.slice(1).toLocaleLowerCase("es-DO")
        : p,
    );
  if (s.promulgada) partes.push("Promulgada");
  if (s.perimida) partes.push("Perimida");
  const vistas = new Set<string>();
  return partes
    .filter((p) => {
      const k = p.toLocaleLowerCase("es-DO");
      if (vistas.has(k)) return false;
      vistas.add(k);
      return true;
    })
    .join(" · ");
}

/*
  La forma de una entrada guardada, con `zod/mini` (el `zod` que viaja al
  navegador: unos pocos KB). Tipo e id son obligatorios; lo demás, si viene
  roto, se descarta campo a campo en vez de tirar la entrada entera —el
  almacenamiento lo pudo escribir una versión anterior de la plataforma—.
*/
const TEXTO = z.catch(z.optional(z.string()), undefined);
const ENTRADA = z.object({
  tipo: z.enum(TIPOS_SEGUIDO),
  id: z.string().check(z.minLength(1)),
  titulo: z.catch(z.optional(z.string().check(z.minLength(1))), undefined),
  href: TEXTO,
  huella: TEXTO,
  desde: TEXTO,
  visto: TEXTO,
});

/** Solo una ruta de la propia plataforma: nunca `//otro-sitio` ni `https:`. */
const esRutaPropia = (h: string | undefined): h is string => !!h && h.startsWith("/") && !h.startsWith("//");

function hrefProceso(codigo: string): string {
  return enlace.proceso(codigo);
}

/** Normaliza lo que haya en el almacenamiento, venga de la forma que venga. */
function normalizar(raw: unknown): Seguido[] {
  if (!Array.isArray(raw)) return [];
  const out: Seguido[] = [];
  const claves = new Set<string>();
  for (const x of raw) {
    let item: Seguido | null = null;
    if (typeof x === "string" && x) {
      // La forma antigua: un código de proceso suelto.
      item = { tipo: "proceso", id: x, titulo: x, href: hrefProceso(x) };
    } else {
      const r = ENTRADA.safeParse(x);
      if (r.success) {
        const s = r.data;
        item = {
          tipo: s.tipo,
          id: s.id,
          titulo: s.titulo ?? s.id,
          href: esRutaPropia(s.href) ? s.href : s.tipo === "proceso" ? hrefProceso(s.id) : "/seguimiento",
          ...(s.huella !== undefined ? { huella: s.huella } : {}),
          ...(s.desde !== undefined ? { desde: s.desde } : {}),
          ...(s.visto !== undefined ? { visto: s.visto } : {}),
        };
      }
    }
    if (!item) continue;
    const k = `${item.tipo}:${item.id}`;
    if (claves.has(k)) continue;
    claves.add(k);
    out.push(item);
  }
  return out;
}

function leer(): Seguido[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return normalizar(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

function escribir(lista: Seguido[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lista));
  } catch {
    /* almacenamiento lleno o bloqueado: la lista sigue en memoria esta vez */
  }
  window.dispatchEvent(new Event(EVENTO));
}

/** Todo lo seguido, en el orden en que se marcó. */
export function getSeguidos(): Seguido[] {
  return leer();
}

export function estaSeguido(tipo: TipoSeguido, id: string): boolean {
  return leer().some((s) => s.tipo === tipo && s.id === id);
}

/** Empieza o deja de seguir. Devuelve si queda seguido. */
export function toggleSeguido(item: Omit<Seguido, "desde" | "visto">): boolean {
  const lista = leer();
  const i = lista.findIndex((s) => s.tipo === item.tipo && s.id === item.id);
  if (i >= 0) {
    lista.splice(i, 1);
    escribir(lista);
    return false;
  }
  const ahora = new Date().toISOString();
  lista.push({ ...item, desde: ahora, visto: ahora });
  escribir(lista);
  return true;
}

/**
 * Anota lo que se vio: la huella nueva, el título si la fuente trae uno mejor
 * y la hora. Se llama después de enseñar el cambio, no antes: el visitante
 * tiene que verlo una vez.
 */
export function marcarVistos(
  cambios: { tipo: TipoSeguido; id: string; huella?: string; titulo?: string }[],
): void {
  if (cambios.length === 0) return;
  const lista = leer();
  const ahora = new Date().toISOString();
  let tocado = false;
  for (const c of cambios) {
    const s = lista.find((x) => x.tipo === c.tipo && x.id === c.id);
    if (!s) continue;
    if (c.huella !== undefined) s.huella = c.huella;
    if (c.titulo) s.titulo = c.titulo;
    s.visto = ahora;
    tocado = true;
  }
  if (tocado) escribir(lista);
}

/**
 * Pone la lista entera —la que trae la cuenta del lector al entrar
 * (`lib/espacios-cliente.ts`)—, pasada por la misma normalización que lo leído
 * del almacenamiento. Con cuenta, la cuenta manda: así «dejar de seguir» en
 * un dispositivo no revive en otro.
 */
export function reemplazarSeguidos(lista: unknown): void {
  if (typeof window === "undefined") return;
  escribir(normalizar(lista));
}

/* ------------------------------------------ la forma de antes (procesos) */

/**
 * Los códigos de proceso seguidos. Es la interfaz que ya usan la tarjeta de
 * proceso y la barra de sección; se conserva para que sigan funcionando sin
 * saber que la lista ahora guarda más cosas.
 */
export function getSeguimiento(): string[] {
  return leer()
    .filter((s) => s.tipo === "proceso")
    .map((s) => s.id);
}

/** Seguir o dejar de seguir un proceso por su código. */
export function toggleSeguimiento(codigo: string, titulo?: string): string[] {
  toggleSeguido({
    tipo: "proceso",
    id: codigo,
    titulo: titulo || codigo,
    href: hrefProceso(codigo),
  });
  return getSeguimiento();
}

export function onSeguimientoCambio(cb: () => void): () => void {
  window.addEventListener(EVENTO, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENTO, cb);
    window.removeEventListener("storage", cb);
  };
}
