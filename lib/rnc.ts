import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { esRncDeEmpresa } from "@/lib/padron";

/**
 * Registro tributario (DGII) de un proveedor del Estado.
 *
 * Mecánica verificada en docs/AUDITORIA.md §A.2 (padrón RNC de la DGII, ZIP
 * estático sin clave) y §A.12 (la tabla completa del Registro de Proveedores
 * que la DGCP sirve como archivo). `scripts/build-rnc.py` cruza las dos en
 * build —~107 MB de descarga, nunca por request— y deja en
 * `public/data/rnc/{0..9}.json` una fila por RPE de persona jurídica: RNC,
 * actividad económica, fecha de inicio de operaciones, estado y régimen.
 *
 * Módulo de servidor (`node:fs`). Cada ficha lee solo el archivo del último
 * dígito de su RPE (~375 KB), y lo memoiza por instancia.
 *
 * Lo que no hay: proveedores inscritos con cédula (el cruce se acota a RNC de
 * 9 dígitos, casi todos empresas; unos pocos parecen de personas físicas) ni
 * ningún dato de contacto (el script no los lee).
 */

export interface RegistroTributario {
  rnc: string;
  actividad: string;
  /** Fecha de inicio de operaciones declarada a la DGII (ISO), si consta. */
  inicio: string | null;
  /** ACTIVO, SUSPENDIDO, DADO DE BAJA, CESE TEMPORAL, ANULADO, RECHAZADO. */
  estado: string;
  /** NORMAL o RST (régimen simplificado). */
  regimen: string;
  /** Día del padrón (ISO), sacado del nombre del archivo de la DGII. */
  corteDgii: string | null;
}

interface Fragmento {
  generado: string;
  corteDgii: string | null;
  actividades: string[];
  estados: string[];
  filas: Record<string, [string, number, string | null, number]>;
}

const fragmentos = new Map<string, Promise<Fragmento | null>>();

function fragmento(digito: string): Promise<Fragmento | null> {
  let p = fragmentos.get(digito);
  if (!p) {
    p = readFile(join(process.cwd(), "public", "data", "rnc", `${digito}.json`), "utf8")
      .then((t) => JSON.parse(t) as Fragmento)
      .catch((err) => {
        console.error(`[rnc] fragmento ${digito}:`, err);
        fragmentos.delete(digito); // un fallo no se queda pegado en la instancia
        return null;
      });
    fragmentos.set(digito, p);
  }
  return p;
}

/**
 * El registro tributario del proveedor con ese RPE. `null` si la instantánea
 * no está disponible; `undefined` si el proveedor no está en el cruce (persona
 * física, documento extranjero, o RNC que el padrón no lista).
 */
export async function getRegistroTributario(
  rpe: string,
): Promise<RegistroTributario | null | undefined> {
  if (!/^\d{1,10}$/.test(rpe)) return undefined;
  const f = await fragmento(rpe.slice(-1));
  if (!f) return null;
  const fila = f.filas[rpe];
  if (!fila) return undefined;
  const [rnc, act, inicio, est] = fila;
  const [estado, regimen] = (f.estados[est] ?? "|").split("|");
  return {
    rnc,
    actividad: f.actividades[act] ?? "",
    inicio,
    estado,
    regimen,
    corteDgii: f.corteDgii,
  };
}

let sinFicha: Promise<Set<string> | null> | null = null;

/**
 * ¿Tiene este RNC su ficha en `/empresas`? Sí, si tiene forma de RNC de
 * empresa y el padrón de empresas no lo dejó fuera por ser de una persona
 * (`scripts/build-empresas.py` anota en su `meta.json` los proveedores que
 * deja fuera: 16 en el corte del 19 sep 2026). Lee solo ese archivo de
 * 8 KB, con su ruta entera, para que el trazado de Next no meta los 16 MB
 * del padrón en la función de la ficha de proveedor. Si la instantánea no
 * está, no hay enlace: nunca uno a una ficha que no existe.
 */
export async function tieneFichaDeEmpresa(rnc: string): Promise<boolean> {
  if (!esRncDeEmpresa(rnc)) return false;
  sinFicha ??= readFile(join(process.cwd(), "public", "data", "empresas", "meta.json"), "utf8")
    .then((t) => new Set((JSON.parse(t) as { proveedoresSinFicha?: string[] }).proveedoresSinFicha ?? []))
    .catch((err) => {
      console.error("[rnc] empresas/meta.json:", err);
      sinFicha = null;
      return null;
    });
  const fuera = await sinFicha;
  return fuera !== null && !fuera.has(rnc);
}

/** Días de calendario entre dos fechas ISO (b − a). */
export function diasEntre(a: string, b: string): number {
  const ms = new Date(`${b.slice(0, 10)}T12:00:00Z`).getTime() - new Date(`${a.slice(0, 10)}T12:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}
