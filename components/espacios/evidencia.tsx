"use client";

import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn,
  type SortingState,
} from "@tanstack/react-table";
import { NOMBRE_TIPO, type TipoEntrada } from "@/lib/espacios";
import { formatFecha } from "@/lib/format";
import { cn } from "@/lib/cn";
import Antiguedad from "@/components/antiguedad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IconChevronUpDown } from "@/components/icons";
import { EnlaceRegistro, MarcaTipo } from "./registro";

/**
 * La evidencia del caso en un cuadro: cada registro con su tipo, la fecha que
 * se le anotó, cuántos enlaces tiene y su nota; se ordena por cualquier
 * columna y se filtra por texto. La tabla es TanStack Table (MIT), sin estilos
 * propios: la pintan las primitivas (`components/ui/table.tsx`).
 *
 * En el teléfono el cuadro se apila en fichas (docs/IDENTIDAD.md §8): las
 * mismas filas, ordenadas y filtradas igual.
 */

export interface FilaEvidencia {
  id: string;
  tipo: TipoEntrada;
  titulo: string;
  href: string;
  nota: string;
  fecha: string | null;
  creado: string;
  enlaces: number;
}

function plano(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Busca en el título, el tipo y la nota, sin tildes ni mayúsculas. */
const porTexto: FilterFn<FilaEvidencia> = (fila, _col, valor: string) => {
  const q = plano(valor.trim());
  if (!q) return true;
  const f = fila.original;
  return plano(`${f.titulo} ${NOMBRE_TIPO[f.tipo]} ${f.nota}`).includes(q);
};

const COLUMNAS: ColumnDef<FilaEvidencia>[] = [
  { id: "titulo", header: "Registro", accessorFn: (f) => plano(f.titulo) },
  { id: "tipo", header: "Tipo", accessorFn: (f) => NOMBRE_TIPO[f.tipo] },
  // Sin fecha, al final en los dos sentidos: lo que no se fechó no es «lo más viejo».
  { id: "fecha", header: "Fecha anotada", accessorFn: (f) => f.fecha ?? undefined, sortUndefined: "last" },
  { id: "enlaces", header: "Enlaces", accessorFn: (f) => f.enlaces },
  { id: "creado", header: "Agregado", accessorFn: (f) => f.creado },
];

export default function Evidencia({
  filas,
  elegida,
  onElegir,
}: {
  filas: FilaEvidencia[];
  elegida: string | null;
  onElegir: (id: string) => void;
}) {
  const [orden, setOrden] = useState<SortingState>([{ id: "creado", desc: true }]);
  const [filtro, setFiltro] = useState("");
  const columnas = useMemo(() => COLUMNAS, []);
  const tabla = useReactTable({
    data: filas,
    columns: columnas,
    state: { sorting: orden, globalFilter: filtro },
    onSortingChange: setOrden,
    onGlobalFilterChange: setFiltro,
    globalFilterFn: porTexto,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (f) => f.id,
    // Un tercer toque no deja el cuadro sin orden (que sería el de la base):
    // alterna entre los dos sentidos.
    enableSortingRemoval: false,
  });
  const visibles = tabla.getRowModel().rows;

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="evidencia-filtro" className="sr-only">Filtrar los registros</Label>
        <Input
          id="evidencia-filtro"
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar por nombre, tipo o nota…"
        />
        <p aria-live="polite" className="mt-1.5 text-xs text-ink-soft">
          {filtro.trim()
            ? `${visibles.length} de ${filas.length} registros de este proyecto.`
            : `Los ${filas.length} registros de este proyecto. Elige uno para anotarlo, fecharlo o enlazarlo.`}
        </p>
      </div>

      {/* Desde `sm`: el cuadro. */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            {tabla.getHeaderGroups().map((g) => (
              <TableRow key={g.id}>
                {g.headers.map((h) => {
                  const sentido = h.column.getIsSorted();
                  return (
                    <TableHead
                      key={h.id}
                      aria-sort={sentido === "asc" ? "ascending" : sentido === "desc" ? "descending" : "none"}
                      className={cn(h.column.id === "enlaces" && "text-right")}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rotulo -mx-2 gap-1 px-2 text-ink-soft"
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <IconChevronUpDown className="h-3.5 w-3.5" />
                        <span className="sr-only">
                          {sentido === "asc" ? "(de menor a mayor)" : sentido === "desc" ? "(de mayor a menor)" : "(ordenar)"}
                        </span>
                      </Button>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {visibles.map((r) => {
              const f = r.original;
              return (
                <TableRow key={r.id} data-state={f.id === elegida ? "selected" : undefined}>
                  <TableCell className="min-w-56 max-w-sm">
                    <EnlaceRegistro titulo={f.titulo} href={f.href} />
                    {f.nota && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-soft">{f.nota}</p>}
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="mt-0.5 h-auto p-0 text-xs"
                      aria-pressed={f.id === elegida}
                      onClick={() => onElegir(f.id)}
                    >
                      {f.id === elegida ? "Abierto abajo" : "Anotar, fechar o enlazar"}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <MarcaTipo tipo={f.tipo} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{f.fecha ? formatFecha(f.fecha) : <span className="font-sans text-ink-soft">sin fecha</span>}</TableCell>
                  <TableCell numerica>{f.enlaces}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-ink-soft">
                    <Antiguedad iso={f.creado} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* En el teléfono: las mismas filas, apiladas. */}
      <ul className="divide-y divide-hairline sm:hidden">
        {visibles.map((r) => {
          const f = r.original;
          return (
            <li key={r.id} className={cn("py-3", f.id === elegida && "bg-brand-50")}>
              <EnlaceRegistro titulo={f.titulo} href={f.href} />
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                <MarcaTipo tipo={f.tipo} />
                {f.fecha && <span className="font-mono">{formatFecha(f.fecha)}</span>}
                <span>
                  {f.enlaces} {f.enlaces === 1 ? "enlace" : "enlaces"}
                </span>
              </p>
              {f.nota && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-soft">{f.nota}</p>}
              <Button type="button" variant="outline" size="sm" className="mt-2" aria-pressed={f.id === elegida} onClick={() => onElegir(f.id)}>
                {f.id === elegida ? "Abierto abajo" : "Anotar, fechar o enlazar"}
              </Button>
            </li>
          );
        })}
      </ul>
      {filtro.trim() && visibles.length === 0 && <p className="text-sm text-ink-soft">Ningún registro del proyecto coincide con «{filtro.trim()}».</p>}
    </div>
  );
}
