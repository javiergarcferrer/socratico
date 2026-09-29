import type { Poder } from "@/lib/funcionarios";

/** Filtros del directorio de funcionarios. Todo vive en la URL y se comparte. */
export interface FiltrosFuncionarios {
  q: string;
  poder: Poder | "";
  pep: boolean;
}

/** La URL del directorio con estos filtros. */
export function hrefFuncionarios(f: Partial<FiltrosFuncionarios>): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.poder) sp.set("poder", f.poder);
  if (f.pep) sp.set("pep", "1");
  const qs = sp.toString();
  return `/funcionarios${qs ? `?${qs}` : ""}`;
}
