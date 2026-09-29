import type { Poder } from "@/lib/funcionarios";

/** Filtros del directorio de funcionarios. Todo vive en la URL y se comparte. */
export interface FiltrosFuncionarios {
  q: string;
  poder: Poder | "";
  pep: boolean;
  /** Familia de cargos PEP (`FAMILIAS_PEP`); solo cuenta con `pep`. */
  tipo: string;
  /** Solo quienes han tenido cargo en esta institución (id del cruce). */
  inst: number | null;
}

/** La URL del directorio con estos filtros. */
export function hrefFuncionarios(f: Partial<FiltrosFuncionarios>): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.poder) sp.set("poder", f.poder);
  if (f.pep) sp.set("pep", "1");
  if (f.pep && f.tipo) sp.set("tipo", f.tipo);
  if (f.inst != null) sp.set("inst", String(f.inst));
  const qs = sp.toString();
  return `/funcionarios${qs ? `?${qs}` : ""}`;
}
