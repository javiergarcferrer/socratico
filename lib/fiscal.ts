/**
 * Ejecución presupuestaria — API de datos abiertos del SIGEF (Hacienda).
 *
 * Responde la pregunta que a la plataforma le faltaba: **en qué gasta el
 * Estado, institución por institución y mes a mes**, con el ciclo completo del
 * gasto (presupuesto vigente → comprometido → devengado → pagado).
 *
 * Por qué esto lee una instantánea y no la API en vivo: el SIGEF calcula el
 * año en curso al vuelo —una sección entera tarda ~97 s, una institución
 * suelta entre 20 y 90 s (docs/INFRAESTRUCTURA.md §5.2)—, muy por encima de lo que puede
 * esperar un request. `scripts/build-fiscal.py` consolida las tres secciones
 * institucionales en `public/data/fiscal.json` y esta capa lo sirve al
 * instante. La contrapartida es honesta y se declara en la interfaz: el dato
 * es de la fecha de la instantánea, no de este segundo.
 *
 * Módulo SOLO de servidor (usa `node:fs`), igual que `lib/nomina-server.ts`.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CAPITULOS, SECCIONES_INSTITUCIONALES, titulizar } from "./capitulos";
import { MESES } from "@/lib/format";

export interface MesEjecucion {
  /** 1–12. */
  mes: number;
  devengado: number;
  pagado: number;
}

export interface UnidadEjecutora {
  nombre: string;
  devengado: number;
}

export interface InstitucionFiscal {
  /** Código de capítulo presupuestario, p. ej. `0206`. */
  codigo: string;
  /** Nombre oficial, en mayúsculas como lo publica Hacienda. */
  nombre: string;
  /** Nombre en caja de lectura, para la interfaz. */
  nombreLegible: string;
  seccion: string;
  seccionNombre: string;
  /** Presupuesto aprobado al abrir el año. */
  inicial: number;
  /** Presupuesto vigente: el inicial más las modificaciones del año. */
  vigente: number;
  comprometido: number;
  /** Gasto devengado: la obligación ya contraída. Es la cifra a mirar. */
  devengado: number;
  pagado: number;
  /** Devengado ÷ vigente. `null` cuando no hay presupuesto vigente. */
  ejecucion: number | null;
  meses: MesEjecucion[];
  unidades: UnidadEjecutora[];
}

export interface Fiscal {
  /** Cuándo se generó la instantánea (ISO). */
  generadoEn: string;
  anio: number;
  /**
   * Último mes con gasto devengado **real**. El origen ya devuelve filas del
   * mes en curso con cero devengado (el mes acaba de empezar), y tomarlas por
   * buenas dibujaría una caída que no existe: aquí el corte es el último mes
   * que tiene algo que contar.
   */
  mesCorte: number;
  fuente: string;
  /** Serie mensual agregada de todo el Estado. */
  porMes: MesEjecucion[];
  instituciones: InstitucionFiscal[];
  /** Totales del conjunto, ya sumados. */
  total: {
    inicial: number;
    vigente: number;
    comprometido: number;
    devengado: number;
    pagado: number;
    ejecucion: number | null;
  };
}

interface FiscalCrudo {
  generadoEn: string;
  anio: number;
  mesCorte: number;
  fuente: string;
  instituciones: {
    codigo: string;
    nombre: string;
    seccion: string;
    inicial: number;
    vigente: number;
    comprometido: number;
    devengado: number;
    pagado: number;
    meses: MesEjecucion[];
    unidades: UnidadEjecutora[];
  }[];
}

const NOMBRES_CAPITULO = new Map(CAPITULOS.map((c) => [c.codigo, c.nombre]));

/** Porcentaje de ejecución, o `null` si no hay presupuesto contra el que medir. */
function tasa(devengado: number, vigente: number): number | null {
  if (!vigente || vigente <= 0) return null;
  return devengado / vigente;
}

let cache: Fiscal | null = null;

/**
 * La instantánea de ejecución, o `null` si no está generada. Se memoriza en el
 * proceso: el archivo no cambia entre despliegues.
 */
export async function getFiscal(): Promise<Fiscal | null> {
  if (cache) return cache;
  try {
    const crudo = await readFile(
      join(process.cwd(), "public", "data", "fiscal.json"),
      "utf8",
    );
    const data = JSON.parse(crudo) as FiscalCrudo;
    if (!data?.instituciones?.length) return null;

    const instituciones: InstitucionFiscal[] = data.instituciones.map((i) => {
      const nombre = i.nombre || NOMBRES_CAPITULO.get(i.codigo) || i.codigo;
      return {
        ...i,
        nombre,
        nombreLegible: titulizar(nombre),
        seccionNombre: SECCIONES_INSTITUCIONALES[i.seccion] ?? "Sin sección",
        ejecucion: tasa(i.devengado, i.vigente),
      };
    });

    const suma = { inicial: 0, vigente: 0, comprometido: 0, devengado: 0, pagado: 0 };
    for (const i of instituciones) {
      suma.inicial += i.inicial;
      suma.vigente += i.vigente;
      suma.comprometido += i.comprometido;
      suma.devengado += i.devengado;
      suma.pagado += i.pagado;
    }
    const total = { ...suma, ejecucion: tasa(suma.devengado, suma.vigente) };

    const acumMeses = new Map<number, MesEjecucion>();
    for (const i of instituciones) {
      for (const m of i.meses) {
        const acc = acumMeses.get(m.mes) ?? { mes: m.mes, devengado: 0, pagado: 0 };
        acc.devengado += m.devengado;
        acc.pagado += m.pagado;
        acumMeses.set(m.mes, acc);
      }
    }
    const porMes = [...acumMeses.values()].sort((a, b) => a.mes - b.mes);
    const conDatos = porMes.filter((m) => m.devengado > 0);
    const mesCorte = conDatos.length
      ? conDatos[conDatos.length - 1].mes
      : data.mesCorte;

    cache = { ...data, mesCorte, porMes, instituciones, total };
    return cache;
  } catch (err) {
    console.error("[fiscal] instantánea:", err);
    return null;
  }
}

/** Una institución por su código de capítulo. */
export async function getInstitucionFiscal(
  codigo: string,
): Promise<{ institucion: InstitucionFiscal; fiscal: Fiscal } | null> {
  const fiscal = await getFiscal();
  if (!fiscal) return null;
  const institucion = fiscal.instituciones.find((i) => i.codigo === codigo);
  return institucion ? { institucion, fiscal } : null;
}

export interface ResumenFiscal {
  anio: number;
  mesCorte: number;
  devengado: number;
  vigente: number;
  ejecucion: number | null;
  instituciones: number;
  /** La que más ha devengado, para dar un ancla concreta. */
  mayor: { codigo: string; nombre: string; devengado: number } | null;
}

/** Cifras de cabecera para el panorama. */
export async function getResumenFiscal(): Promise<ResumenFiscal | null> {
  const f = await getFiscal();
  if (!f) return null;
  const mayor = f.instituciones[0] ?? null;
  return {
    anio: f.anio,
    mesCorte: f.mesCorte,
    devengado: f.total.devengado,
    vigente: f.total.vigente,
    ejecucion: f.total.ejecucion,
    instituciones: f.instituciones.length,
    mayor: mayor
      ? { codigo: mayor.codigo, nombre: mayor.nombreLegible, devengado: mayor.devengado }
      : null,
  };
}

/** Nombre del mes en es-DO, para declarar el corte. */
export const MESES_LARGOS = MESES;

export function etiquetaCorte(mes: number, anio: number): string {
  const nombre = MESES_LARGOS[mes - 1] ?? "";
  return nombre ? `${nombre} de ${anio}` : String(anio);
}
