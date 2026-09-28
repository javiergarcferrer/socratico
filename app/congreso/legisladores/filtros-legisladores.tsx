"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CampoBusqueda } from "@/components/campo-busqueda";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { hrefDirectorio, type FiltrosDirectorio } from "./href";

const TODOS = "__todos";

/**
 * La búsqueda por nombre dentro del directorio ya leído —no una consulta nueva
 * al SIL—, y por eso la ayuda dice exactamente eso.
 */
export default function BuscadorLegisladores({
  filtros,
  total,
}: {
  filtros: FiltrosDirectorio;
  total: number;
}) {
  const router = useRouter();
  const [valor, setValor] = useState(filtros.q);
  const [pendiente, startTransition] = useTransition();

  const ir = (q: string) =>
    startTransition(() => router.push(hrefDirectorio({ ...filtros, q })));

  return (
    <CampoBusqueda
      valor={valor}
      onValor={setValor}
      onEnviar={ir}
      onLimpiar={() => {
        setValor("");
        ir("");
      }}
      etiqueta="Buscar un legislador por nombre"
      placeholder="Nombre o apellido…"
      ayuda={`Busca por nombre entre los ${total} legisladores del directorio del SIL, sin importar tildes.`}
      pendiente={pendiente}
    />
  );
}

export interface OpcionPartido {
  siglas: string;
  /** El nombre completo tal como lo publica el SIL; `null` si no lo trae. */
  nombre: string | null;
  cuantos: number;
}

/**
 * Demarcación y partido: los dos filtros que no caben como enlaces.
 *
 * La provincia son 34 demarcaciones y los partidos una docena: como filas de
 * enlaces ocupaban media pantalla del teléfono antes del primer nombre —trece
 * chips de partido con siglas que nadie explicaba—. En un `Select` cada
 * partido se lee con su nombre completo, y al elegir navega igual que un
 * enlace.
 */
export function SelectoresLegisladores({
  filtros,
  provincias,
  partidos,
}: {
  filtros: FiltrosDirectorio;
  provincias: { nombre: string; cuantos: number }[];
  partidos: OpcionPartido[];
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  const ir = (cambio: Partial<FiltrosDirectorio>) =>
    startTransition(() => router.push(hrefDirectorio({ ...filtros, ...cambio })));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="filtro-provincia" className="text-xs text-ink-soft">
          Provincia o demarcación
        </Label>
        <Select
          value={filtros.provincia || TODOS}
          onValueChange={(v) => ir({ provincia: v === TODOS ? "" : v })}
          disabled={pendiente}
        >
          <SelectTrigger id="filtro-provincia" className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS} ayuda="Las 32 provincias, la lista nacional y el exterior.">
              Todo el país
            </SelectItem>
            {provincias.map((p) => (
              <SelectItem key={p.nombre} value={p.nombre}>
                {`${p.nombre} · ${p.cuantos}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="filtro-partido" className="text-xs text-ink-soft">
          Partido
        </Label>
        <Select
          value={filtros.partido || TODOS}
          onValueChange={(v) => ir({ partido: v === TODOS ? "" : v })}
          disabled={pendiente}
        >
          <SelectTrigger id="filtro-partido" className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los partidos</SelectItem>
            {partidos.map((p) => (
              <SelectItem key={p.siglas} value={p.siglas}>
                {`${p.nombre ? `${p.nombre} (${p.siglas})` : p.siglas} · ${p.cuantos}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
