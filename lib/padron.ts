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

/*
 * Una cédula dentro de un texto: las mismas formas que `scripts/privacidad.py`
 * quita al construir y que `.claude/hooks/cedulas.py` vigila en las
 * instantáneas.
 *  - Con guiones, en cualquier parte, también dentro del nombre de un archivo
 *    («DJ-001-0000000-0.pdf»); no el final de un número más largo.
 *  - Con rayas u otros guiones tipográficos.
 *  - Tras la palabra «cédula» (o «céd.»), con espacios, puntos o sin
 *    separadores: «cédula núm. 00100000000».
 * Once cifras juntas sin la palabra no cuentan: así se escriben también
 * números de sentencia, parcelas y matrículas.
 */
const GUIONES = /(?<!\d)(?<!\d-)\d{3}-\d{7}-\d(?![\d-])/;
const RAYAS = /(?<!\d)\d{3}[\u2010\u2013]\d{7}[\u2010\u2013]\d(?!\d)/;
const NOMBRADA = /(\bc[eé]d(?:ula)?\b\.?[^\d\t\n]{0,40}?)(\d{3}[ .\u2010\u2013-]?\d{7}[ .\u2010\u2013-]?\d)(?!\d)/i;
/** Todo lo tecleado es una cédula, con o sin separadores. */
const SOLA = /^\s*\d{3}[ .\u2010\u2013-]?\d{7}[ .\u2010\u2013-]?\d\s*$/;

const todas = (r: RegExp) => new RegExp(r.source, `${r.flags}g`);
const GUIONES_G = todas(GUIONES);
const RAYAS_G = todas(RAYAS);
const NOMBRADA_G = todas(NOMBRADA);

/**
 * El texto sin cédulas. Un título oficial puede traer la de una persona (tres
 * en todas las instantáneas al 30-09-2026: dos decretos y una sentencia del
 * TC); la plataforma nunca la enseña ni la guarda, así
 * que el número se cambia por «[omitida]», en mayúsculas si el texto lo está,
 * para que `desdeMayusculas` lo trate como al resto. Lo usan los adaptadores
 * al leer (también sobre lo que sale de una caché de datos, que sobrevive a
 * un despliegue), `limpiarTexto` y el servidor MCP al responder.
 */
export function sinCedula(texto: string): string {
  if (!/\d{7}/.test(texto)) return texto;
  const marca = texto === texto.toLocaleUpperCase("es") ? "[OMITIDA]" : "[omitida]";
  return texto
    .replace(NOMBRADA_G, (_, antes: string) => `${antes}${marca}`)
    .replace(GUIONES_G, marca)
    .replace(RAYAS_G, marca);
}

/**
 * ¿Lleva lo tecleado una cédula? En cualquiera de las formas de arriba, o si
 * todo lo tecleado lo es. Los buscadores de texto de la plataforma y el
 * servidor MCP no buscan por ella; una cédula sola en `/buscar` sigue yendo a
 * los proveedores del Estado (`rutaDirecta`), cuyo registro la resuelve.
 */
export function llevaCedula(texto: string): boolean {
  return GUIONES.test(texto) || RAYAS.test(texto) || NOMBRADA.test(texto) || SOLA.test(texto);
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
