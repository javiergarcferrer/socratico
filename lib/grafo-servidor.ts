/**
 * El reconocimiento del grafo que necesita datos: nombres de instituciones en
 * un texto (docs/INFRAESTRUCTURA.md §7). Solo servidor: carga el cruce de
 * instituciones, que no viaja al navegador.
 *
 * Mismo criterio que `institucionesNombradasEn`: solo el **nombre completo**
 * de 18 letras o más, sin hospitales ni ayuntamientos —que se repiten entre
 * sí—, porque un enlace adivinado es peor que ninguno. «Ministerio de Salud
 * Pública y Asistencia Social» enlaza; «Salud» no.
 */

import { INSTITUCIONES, seReconocePorNombre } from "@/lib/instituciones";
import { enlace, reconocerPorForma, sinSolapes, type Mencion } from "@/lib/grafo";

/** Cada carácter del texto, en minúscula, sin tilde y con los signos como espacio: mismo largo. */
function planoPorCaracter(texto: string): string {
  let salida = "";
  for (const ch of texto) {
    const base = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    // Un carácter que se descompone en varios (ﬁ) o en nada conserva un hueco.
    const c = base.length === 1 ? base : " ";
    salida += /[a-z0-9]/.test(c) ? c : " ";
    // Los caracteres fuera del plano básico ocupan dos unidades en JS.
    if (ch.length === 2) salida += " ";
  }
  return salida;
}

interface Patron {
  re: RegExp;
  href: string;
}

let patrones: Patron[] | null = null;

/** Un patrón por institución: sus palabras en orden, separadas por cualquier signo o espacio. */
function patronesDeInstituciones(): Patron[] {
  if (patrones) return patrones;
  const salida: Patron[] = [];
  for (const i of INSTITUCIONES) {
    // El mismo criterio que `institucionesNombradasEn`: ni hospitales ni
    // gobiernos locales, tampoco los que entran por el Clasificador
    // Institucional sin unidad de compra (su tipo es el del clasificador).
    if (!seReconocePorNombre(i)) continue;
    const palabras = planoPorCaracter(i.nombre.replace(/\([^)]*\)/g, " ")).split(/\s+/).filter(Boolean);
    if (palabras.join(" ").length < 18) continue;
    salida.push({
      re: new RegExp(`(?<![a-z0-9])${palabras.join("\\s+")}(?![a-z0-9])`, "g"),
      href: enlace.institucion(i.id, i.acronimo || i.nombre),
    });
  }
  // Los nombres largos primero: «Ministerio de Educación Superior…» antes
  // que «Ministerio de Educación».
  patrones = salida.sort((a, b) => b.re.source.length - a.re.source.length);
  return patrones;
}

/** Instituciones nombradas por su nombre completo, con su posición en el texto. */
export function reconocerInstituciones(texto: string): Mencion[] {
  const plano = planoPorCaracter(texto);
  const salida: Mencion[] = [];
  for (const p of patronesDeInstituciones()) {
    p.re.lastIndex = 0;
    for (const m of plano.matchAll(p.re)) {
      const inicio = m.index ?? 0;
      salida.push({ inicio, fin: inicio + m[0].length, tipo: "institucion", href: p.href });
    }
  }
  return salida;
}

/** Todo lo que se reconoce en un texto: normas, procesos, obras e instituciones. */
export function reconocerTodo(texto: string, excluir?: string): Mencion[] {
  return sinSolapes([...reconocerPorForma(texto), ...reconocerInstituciones(texto)]).filter(
    (m) => m.href !== excluir,
  );
}
