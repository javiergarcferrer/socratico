import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Historia de las compras públicas desde 2015 — todos los contratos y procesos
 * que el registro de la DGCP conserva, agregados.
 *
 * Mecánica verificada en docs/AUDITORIA.md §G.1: las tablas `contratos` y
 * `procesos` de la sección «Tablas» de datos abiertos de la DGCP bajan enteras
 * como CSV (~115 y ~245 MB). `scripts/build-historico.py` las agrega en build
 * —nunca por request— y deja en `public/data/historico/`:
 *
 *  - `resumen.json` — serie por año, los 100 mayores proveedores y unidades
 *    de compra de todo el período, y los contratos atípicos;
 *  - `instituciones.json` — por unidad de compra: serie anual y principales
 *    proveedores;
 *  - `proveedores/{0..9}.json` — por RPE (último dígito): serie anual y
 *    principales clientes.
 *
 * Lo que la cifra es y no es (lo declara toda superficie que la pinte):
 *  - Valor **contratado** en pesos, no pagado; sin contratos cancelados ni en
 *    otras monedas.
 *  - Un contrato de RD$10 mil millones o más **no se suma**: se lista aparte
 *    (`atipicos`), porque varios son errores de captura evidentes.
 *  - La institución de un contrato se deduce del prefijo de su código; lo que
 *    no se puede asignar sin adivinar (0.8 % de los contratos, pero ~8.5 % del
 *    valor: casi todo es el MOPC, cuyo prefijo comparte la OPRET) queda fuera
 *    de las series por institución, se cuenta y se nombra (`sinAsignar`).
 *  - Cada ficha dice cuántos de sus propios contratos atípicos quedaron fuera
 *    (`atipicos`).
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

export interface AnioHistorico {
  anio: number;
  contratos: number;
  monto: number;
  procesos: number;
  /** Procesos publicados por alguna vía de excepción (no «Proceso ordinario»). */
  excepcion: number;
  modalidades: Record<string, number>;
}

export interface Atipico {
  codigo: string;
  fecha: string;
  valor: number;
  estado: string;
  rpe: string | null;
  proveedor: string;
  uc: number | null;
  institucion: string | null;
}

export interface ResumenHistorico {
  generado: string;
  /** La última fecha de adjudicación del registro (ISO). */
  corte: string;
  fuentes: string[];
  contratosLeidos: number;
  procesosLeidos: number;
  cancelados: number;
  otrasMonedas: Record<string, number>;
  sinInstitucion: number;
  sinInstitucionMonto: number;
  /** Prefijos que no se asignan, con las unidades que los comparten. */
  sinAsignar: { prefijo: string; contratos: number; monto: number; unidades: string[] }[];
  prefijosAmbiguos: string[];
  umbralAtipico: number;
  anios: AnioHistorico[];
  proveedores: { rpe: string; nombre: string; monto: number; contratos: number; desde: string; hasta: string }[];
  instituciones: { uc: number; nombre: string; monto: number; contratos: number }[];
  atipicos: Atipico[];
}

export interface HistoriaInstitucion {
  nombre: string;
  /** [año, contratos, monto, procesos publicados] */
  serie: [number, number, number, number][];
  /** [rpe, nombre, contratos, monto] */
  top: [string, string, number, number][];
  /** Proveedores distintos a los que contrató en todo el período. */
  proveedores: number;
  /** [contratos, monto] atípicos propios, fuera de las sumas. */
  atipicos: [number, number] | null;
}

export interface HistoriaProveedor {
  nombre: string;
  desde: string;
  hasta: string;
  /** [año, contratos, monto] */
  serie: [number, number, number][];
  /** [unidad de compra, contratos, monto] — los ocho mayores clientes. */
  clientes: [number, number, number][];
  /** Instituciones distintas que le contrataron. */
  totalClientes: number;
  /** [contratos, monto] atípicos propios, fuera de las sumas. */
  atipicos: [number, number] | null;
}

const DIR = join(process.cwd(), "public", "data", "historico");

const memo = new Map<string, Promise<unknown>>();

function leer<T>(nombre: string): Promise<T | null> {
  let p = memo.get(nombre) as Promise<T | null> | undefined;
  if (!p) {
    p = readFile(join(DIR, nombre), "utf8")
      .then((t) => JSON.parse(t) as T)
      .catch((err) => {
        console.error(`[historico] ${nombre}:`, err);
        memo.delete(nombre); // un fallo no se queda pegado en la instancia
        return null;
      });
    memo.set(nombre, p);
  }
  return p;
}

export function getResumenHistorico(): Promise<ResumenHistorico | null> {
  return leer<ResumenHistorico>("resumen.json");
}

export async function historiaDeInstitucion(
  uc: number,
): Promise<{ historia: HistoriaInstitucion; corte: string } | null> {
  const d = await leer<{ corte: string; filas: Record<string, HistoriaInstitucion> }>("instituciones.json");
  const h = d?.filas[String(uc)];
  return h && d ? { historia: h, corte: d.corte } : null;
}

interface FilaProveedor {
  n: string;
  d: string;
  h: string;
  s: [number, number, number][];
  c: [number, number, number][];
  k: number;
  a?: [number, number] | null;
}

export async function historiaDeProveedor(
  rpe: string,
): Promise<{ historia: HistoriaProveedor; corte: string } | null> {
  if (!/^\d{1,10}$/.test(rpe)) return null;
  const d = await leer<{ corte: string; filas: Record<string, FilaProveedor> }>(
    `proveedores/${rpe.slice(-1)}.json`,
  );
  const f = d?.filas[rpe];
  if (!f || !d) return null;
  return {
    historia: { nombre: f.n, desde: f.d, hasta: f.h, serie: f.s, clientes: f.c, totalClientes: f.k, atipicos: f.a ?? null },
    corte: d.corte,
  };
}

/** Suma de una serie anual por posición (contratos o monto). */
export function sumar<T extends number[]>(serie: T[], i: number): number {
  return serie.reduce((s, f) => s + (f[i] ?? 0), 0);
}

/** «1 contrato», «2,979 contratos». */
export function nContratos(n: number): string {
  return `${n.toLocaleString("es-DO")} ${n === 1 ? "contrato" : "contratos"}`;
}

/**
 * Si la unidad de compra comparte prefijo con otra y por eso no tiene serie,
 * el prefijo y lo que quedó sin asignar; si no, `null`.
 */
export async function prefijoSinAsignar(nombre: string): Promise<ResumenHistorico["sinAsignar"][number] | null> {
  const r = await getResumenHistorico();
  const clave = nombre.trim().toLowerCase();
  return r?.sinAsignar.find((s) => s.unidades.some((u) => u.trim().toLowerCase() === clave)) ?? null;
}

/**
 * El RNC de persona jurídica de un proveedor de la historia, por su RPE:
 * `rnc.json`, el cruce de `scripts/build-historico-rnc.py` con el padrón de la
 * DGII. `null` si no tiene (una persona física, un proveedor extranjero): el
 * grafo lo ata a la empresa solo cuando el padrón lo dice.
 */
export async function rncDeProveedor(rpe: string): Promise<string | null> {
  const d = await leer<{ rnc: Record<string, string> }>("rnc.json");
  return d?.rnc[rpe] ?? null;
}

let paresMemo: Promise<{ pares: number; proveedores: number; corte: string } | null> | null = null;

/**
 * Cuántas contrataciones institución → proveedor describe el grafo: los pares
 * de las listas de mayores (los ocho clientes de cada proveedor y los doce
 * proveedores de cada institución), sin repetir. Para el inventario del grafo.
 */
export function contarContrataciones(): Promise<{ pares: number; proveedores: number; corte: string } | null> {
  paresMemo ??= (async () => {
    const pares = new Set<string>();
    let corte = "";
    let proveedores = 0;
    for (let n = 0; n < 10; n++) {
      const d = await leer<{ corte: string; filas: Record<string, FilaProveedor> }>(`proveedores/${n}.json`);
      if (!d) return null;
      corte = d.corte;
      for (const [rpe, f] of Object.entries(d.filas)) {
        proveedores++;
        for (const [uc] of f.c) pares.add(`${uc}|${rpe}`);
      }
    }
    const inst = await leer<{ filas: Record<string, HistoriaInstitucion> }>("instituciones.json");
    for (const [uc, h] of Object.entries(inst?.filas ?? {})) for (const [rpe] of h.top) pares.add(`${uc}|${rpe}`);
    return { pares: pares.size, proveedores, corte };
  })().catch((err) => {
    console.error("[historico] contrataciones:", err);
    paresMemo = null;
    return null;
  });
  return paresMemo;
}
