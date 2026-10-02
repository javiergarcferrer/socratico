import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Estadísticas judiciales — cuántas solicitudes entran a los tribunales de
 * jurisdicción ordinaria en un mes y cuántas salen, por departamento judicial.
 *
 * Mecánica verificada en docs/INFRAESTRUCTURA.md §5.6 (2026-09-24): el índice
 * `transparencia.poderjudicial.gob.do/…/BoletinesEstadisticos` enlaza 943
 * PDF/XLSX con nombres irregulares; `scripts/build-justicia.py` lo lee, toma
 * el último `EST_02_tribunales_de_jurisdiccion_ordinaria_<mes>_<año>.xlsx`
 * (hoja «Ent y Sal») y el del mismo mes un año antes, valida que los 11
 * departamentos sumen el TOTAL de la hoja y escribe `public/data/justicia.json`.
 * Este módulo sirve esa instantánea.
 *
 * Lo que la cifra es y no es, según la propia hoja:
 *  · Cuenta **solicitudes de servicio judicial** (demandas, recursos,
 *    solicitudes), no expedientes ni personas.
 *  · «Salidas sin considerar la fecha de entrada»: lo que sale en un mes pudo
 *    entrar meses antes. La tasa salidas/entradas dice si los tribunales dan
 *    abasto ese mes, no qué parte de lo que entró quedó resuelto.
 *  · «Cifras de carácter preliminar, sujetas a verificación» — también las de
 *    hace un año siguen marcadas así.
 *  · Cubre la jurisdicción ordinaria (corte de apelación, primera instancia y
 *    juzgados de paz, «y equivalentes»); la Suprema Corte va en otra serie.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

export interface EntradaSalida {
  entradas: number;
  salidas: number;
}

export interface DepartamentoJudicial extends EntradaSalida {
  nombre: string;
  /** salidas / entradas; `null` si no entró nada. */
  tasa: number | null;
  categorias: Record<CategoriaTribunal, EntradaSalida>;
}

export type CategoriaTribunal = "corte" | "primeraInstancia" | "paz";

export interface MesJudicial extends EntradaSalida {
  /** `AAAA-MM`. */
  mes: string;
  preliminar: boolean;
  /** Las notas al pie de la hoja, tal cual. */
  nota: string;
  tasa: number | null;
  categorias: Record<CategoriaTribunal, EntradaSalida>;
  /** De mayor a menor tasa de salida. */
  departamentos: DepartamentoJudicial[];
  /** El XLSX leído. */
  fuente: string;
  /** Su gemelo en PDF, si el índice lo lista. */
  pdf: string | null;
}

export interface EstadisticasJudiciales {
  /** Día en que se generó la instantánea (`AAAA-MM-DD`). */
  generadoEn: string;
  /** El índice de boletines del Poder Judicial. */
  indice: string;
  /** Meses de la serie que el índice lista. */
  mesesListados: number;
  actual: MesJudicial;
  /** El mismo mes un año antes, solo si se pudo leer y cuadró. */
  anterior: MesJudicial | null;
}

let memo: Promise<EstadisticasJudiciales | null> | null = null;

export function getEstadisticasJudiciales(): Promise<EstadisticasJudiciales | null> {
  memo ??= readFile(join(process.cwd(), "public", "data", "justicia.json"), "utf8")
    .then((t) => {
      const d = JSON.parse(t) as EstadisticasJudiciales;
      return d?.actual?.departamentos?.length ? d : null;
    })
    .catch((err) => {
      console.error("[justicia]", err);
      memo = null;
      return null;
    });
  return memo;
}
