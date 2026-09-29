import type { Tono } from "@/lib/estados";
import { SIN_DATO } from "@/lib/format";

/**
 * El vocabulario del padrón de contribuyentes de la DGII, sin leer nada: qué
 * número puede ser de una empresa, cómo se dicen su estado y su régimen, y de
 * qué color va su estado.
 *
 * Lo usan la ficha de proveedor (`components/fuentes-nuevas/ficha-rnc.tsx`)
 * y las páginas de `/empresas`. Estaba escrito dentro de la ficha de
 * proveedor; con dos lectores, una segunda copia sería la «segunda tabla»
 * que `lib/estados.ts` documenta como la forma en que un sistema se rompe.
 *
 * Vive aparte de `lib/rnc.ts` y `lib/empresas.ts` porque esos leen archivos:
 * si una página importara `lib/empresas.ts` solo por estas funciones, el
 * trazado de Next metería los 16 MB del padrón en su función.
 */

/**
 * ¿Puede este número ser el RNC de una persona jurídica? Nueve cifras que
 * empiezan por 1 (sociedades) o por 4 (asociaciones, fundaciones, entidades
 * públicas). Las cédulas (11 cifras) y los RNC que empiezan por 5 son de
 * personas físicas (scripts/build-empresas.py lo midió en el padrón).
 * Es la forma, no la existencia: la de una persona que el padrón inscribió
 * con RNC de empresa también pasa, y la ficha la niega.
 */
export function esRncDeEmpresa(rnc: string): boolean {
  return /^[14]\d{8}$/.test(rnc);
}

/**
 * El documento de un proveedor como se puede enseñar: el RNC de una persona
 * jurídica, sí; la cédula o el pasaporte de una persona, nunca (el registro de
 * la DGCP los publica, pero publicar no es exponer: docs/AUDITORIA.md §E).
 */
export function documentoPublicable(tipo: string | null | undefined, numero: string | null | undefined): string {
  const t = (tipo ?? "").trim();
  if (/^rnc$/i.test(t)) return `RNC ${numero?.trim() || "sin número"}`;
  return t ? `${t}, sin publicar` : "Documento sin publicar";
}

/** ¿Es persona física quien el registro de proveedores dice? Su ficha no se indexa. */
export function esPersonaFisica(tipoPersona: string | null | undefined, tipoDocumento?: string | null): boolean {
  return /f[ií]sica|natural/i.test(tipoPersona ?? "") || /c[eé]dula|pasaporte/i.test(tipoDocumento ?? "");
}

/** Lo tecleado, sin espacios, guiones ni puntos: «4-01-01006-2» → «401010062». */
export function soloCifras(texto: string): string {
  return texto.replace(/[\s.\-/]/g, "");
}

/** ¿Es lo tecleado un RNC de nueve cifras (con o sin guiones)? */
export function pareceRnc(texto: string): boolean {
  return /^\d{9}$/.test(soloCifras(texto));
}

/** ¿Es lo tecleado una cédula (once cifras, con o sin guiones)? */
export function pareceCedula(texto: string): boolean {
  return /^\d{11}$/.test(soloCifras(texto));
}

/**
 * El estado ante la DGII, traducido a los oficios de `lib/estados.ts`: activa
 * no pide nada (grafito), suspendida o en cese temporal avisa (ocre), y dada
 * de baja, anulada o rechazada se cayó (sello).
 */
export function tonoContribuyente(estado: string): Tono {
  if (/^ACTIVO$/i.test(estado)) return "contexto";
  if (/SUSPENDIDO|CESE/i.test(estado)) return "aviso";
  return "anulado"; // dado de baja, anulado, rechazado
}

/**
 * «DADO DE BAJA» → «Dado de baja»: un literal del padrón (estado, actividad),
 * que la DGII escribe todo en mayúsculas, en letra de frase. La razón social
 * no pasa por aquí: es un nombre propio y se muestra como está inscrito.
 */
export function enLlano(texto: string): string {
  const t = texto.trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : SIN_DATO;
}

/**
 * El régimen de pago en palabras. «NORMAL» es el ordinario; «RST», el
 * régimen simplificado de tributación. Lo que no se conoce se dice como lo
 * publica la DGII, sin adivinarlo.
 */
export function regimenEnLlano(regimen: string): string {
  const r = regimen.trim().toUpperCase();
  if (r === "NORMAL") return "Ordinario";
  if (r === "RST") return "Simplificado (RST)";
  return regimen.trim() || SIN_DATO;
}
