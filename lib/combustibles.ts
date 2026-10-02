/**
 * Precios de los combustibles — Ministerio de Industria, Comercio y Mipymes.
 *
 * Mecánica en docs/INFRAESTRUCTURA.md §5.4, re-verificada el 2026-09-23: el robots
 * de `micm.gob.do` es Yoast abierto; el aviso semanal tiene el cuerpo vacío y
 * su `wp-json` está cerrado, así que la **portada** es la única lectura por
 * máquina. Hoy trae seis precios —antes cuatro— y la frase de vigencia
 * («Precios actualizados correspondientes a la semana del 19 a 25 de
 * septiembre del 2026.»), cada precio como `$350.10<br><p>Gasolina Premium</p>` (el del GLP sin cerrar
 * el `<p>`: el nombre se corta en la siguiente etiqueta).
 *
 * Fuente viva, caché de 1 h (precio), 25 s, un reintento, `content-type`
 * validado. Si la portada cambia de forma, `null`: la interfaz dice que la
 * fuente no contestó, nunca un precio inventado.
 */

import { desentidades } from "@/lib/html";
import { pedirTexto } from "@/lib/pedir";

const URL_MICM = "https://micm.gob.do/";
const USER_AGENT = "Socratico-Inteligencia/1.0 (precios de combustibles; herramienta independiente)";

export interface PrecioCombustible {
  nombre: string;
  /** RD$ por unidad de venta. */
  precio: number;
  /**
   * «galón» para gasolinas y gasoil, la unidad con que se venden en bomba y la
   * que registró la auditoría. `null` para el GLP y el gas natural: la portada
   * no escribe unidades y no se afirma la que no se ha visto.
   */
  unidad: "galón" | null;
}

export interface Combustibles {
  /** «19 a 25 de septiembre del 2026», tal como lo escribe el MICM. */
  semana: string | null;
  precios: PrecioCombustible[];
  fuente: string;
}

function limpiar(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&[#a-z0-9]+;/gi, (e) => desentidades(e))
    .replace(/Petrole[oó]/g, "Petróleo")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getCombustibles(): Promise<Combustibles | null> {
  const html = await pedirTexto(URL_MICM, {
    fuente: "combustibles",
    ua: USER_AGENT,
    tipo: /text\/html/i,
    revalidate: 3600,
  });
  if (!html) return null;
  const vistos = new Map<string, PrecioCombustible>();
  for (const m of html.matchAll(/\$\s*([\d,]+\.\d{2})\s*<br\s*\/?>\s*<p[^>]*>([^<]{3,80})</g)) {
    const nombre = limpiar(m[2]);
    if (vistos.has(nombre)) continue; // la portada repite el bloque para el teléfono
    vistos.set(nombre, {
      nombre,
      precio: Number(m[1].replace(/,/g, "")),
      unidad: /gasolina|gasoil/i.test(nombre) ? "galón" : null,
    });
  }
  const precios = [...vistos.values()];
  if (precios.length < 4) {
    console.error("[combustibles] la portada cambió de forma: menos de cuatro precios");
    return null;
  }
  const semana = /semana del\s+([^.<]{6,80}?\d{4})/i.exec(html)?.[1]?.trim() ?? null;
  return { semana, precios, fuente: URL_MICM };
}
