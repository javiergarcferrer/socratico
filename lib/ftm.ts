/**
 * Un caso, en FollowTheMoney (FtM): el modelo de entidades con que trabajan
 * OCCRP, OpenSanctions y Aleph (https://followthemoney.tech, licencia MIT).
 * Exportar en FtM deja que una investigación hecha aquí siga en esas
 * herramientas —cargarla en Aleph, cruzarla con listas de sanciones— sin
 * reescribirla (docs/INFRAESTRUCTURA.md §10).
 *
 * Una línea JSON por entidad, que es lo que lee `ftm` en la línea de
 * comandos. Los esquemas y propiedades se comprobaron contra
 * `followthemoney/schema/*.yaml` el 2026-09-28:
 *
 *  · cada registro es la entidad que su tipo nombra, con los requisitos de su
 *    esquema (`name`, o `title` en Contract, o `fileName` en Document);
 *  · cada enlace es un `UnknownLink` (subject → object, `role` = el verbo).
 *    No se usan `Ownership`, `Directorship` y parientes aunque el verbo lo
 *    sugiera: esos esquemas exigen tipos de entidad concretos a cada lado
 *    (una Person en `Family`), y aquí dos registros cualesquiera se unen.
 *    `UnknownLink` admite cualquier `Thing` y el verbo va en `role`.
 *
 * Lo que sale es lo que el investigador guardó —referencias, notas, fechas y
 * verbos—, nunca una cifra del Estado: la ficha la sigue leyendo en vivo.
 */

import { VERBO_ENLACE, type Referencia, type TipoEnlace, type TipoEntrada } from "@/lib/espacios";

export interface EntradaFtm extends Referencia {
  id: string;
  nota: string;
  fecha: string | null;
}

export interface EnlaceFtm {
  desde: string;
  hasta: string;
  tipo: TipoEnlace;
  nota: string;
}

interface EntidadFtm {
  id: string;
  schema: string;
  properties: Record<string, string[]>;
}

const ESQUEMA: Record<TipoEntrada, string> = {
  institucion: "PublicBody",
  // Un proveedor del Estado puede ser persona o empresa: LegalEntity es el
  // esquema de FtM para «no se sabe cuál».
  proveedor: "LegalEntity",
  legislador: "Person",
  proceso: "Contract",
  obra: "Project",
  cargo: "Position",
  norma: "Document",
  proyecto: "Document",
  "expediente-senado": "Document",
  sentencia: "Document",
  capitulo: "Document",
  documento: "Document",
  dato: "Document",
  busqueda: "Document",
  // Una persona con cargo público es una persona; una entidad supervisada por
  // la SB o una empresa del padrón de la DGII, una empresa.
  funcionario: "Person",
  "entidad-financiera": "Company",
  empresa: "Company",
};

/** El último tramo de la ruta, como nombre de archivo (Document lo exige). */
function nombreDeArchivo(href: string): string {
  const limpio = href.split(/[?#]/)[0].replace(/\/+$/, "");
  const tramo = limpio.slice(limpio.lastIndexOf("/") + 1) || "registro";
  try {
    return decodeURIComponent(tramo).slice(0, 200);
  } catch {
    // Un «%» suelto no se decodifica: se queda como vino.
    return tramo.slice(0, 200);
  }
}

/**
 * Las entidades del caso, una por línea. `origen` es el dominio desde el que
 * se exporta: las rutas propias se vuelven direcciones completas.
 */
export function casoAFtm(caso: { titulo: string; entradas: EntradaFtm[]; enlaces: EnlaceFtm[] }, origen: string): string {
  const id = (k: string) => `socratico-${k}`;
  const entidades: EntidadFtm[] = [];
  const presentes = new Set<string>();

  for (const e of caso.entradas) {
    const schema = ESQUEMA[e.tipo];
    const url = e.href.startsWith("/") ? `${origen}${e.href}` : e.href;
    const notas = [e.fecha ? `Fecha anotada en «${caso.titulo}»: ${e.fecha}.` : "", e.nota].filter(Boolean).join("\n\n");
    const properties: Record<string, string[]> = { name: [e.titulo], sourceUrl: [url] };
    if (notas) properties.notes = [notas];
    if (schema === "Contract") properties.title = [e.titulo];
    if (schema === "Document") {
      properties.title = [e.titulo];
      properties.fileName = [nombreDeArchivo(e.href)];
    }
    entidades.push({ id: id(e.id), schema, properties });
    presentes.add(e.id);
  }

  caso.enlaces.forEach((l, i) => {
    if (!presentes.has(l.desde) || !presentes.has(l.hasta)) return;
    const role = [VERBO_ENLACE[l.tipo], l.nota].filter(Boolean).join(": ");
    entidades.push({
      id: id(`enlace-${l.desde}-${l.hasta}-${l.tipo}-${i}`),
      schema: "UnknownLink",
      properties: { subject: [id(l.desde)], object: [id(l.hasta)], role: [role] },
    });
  });

  return entidades.map((x) => JSON.stringify(x)).join("\n") + "\n";
}

/** El nombre del archivo que se descarga. */
export function archivoFtm(titulo: string): string {
  const base = titulo
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "proyecto"}.json`;
}
