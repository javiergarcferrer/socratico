"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MarcaEstado } from "@/components/marca-estado";
import { EsqueletoLineas } from "@/components/esqueleto";
import Antiguedad from "@/components/antiguedad";
import { claves, vivoDelNodo } from "@/lib/consultas";
import { formatFecha, formatPesos } from "@/lib/format";
import type { Vivo } from "@/lib/explorar-tipos";

/**
 * «Ahora, en su fuente»: el bloque del inspector con lo que la DGCP o el SIL
 * dicen hoy del nodo (`/api/explorar/vivo`, `lib/explorar-vivo.ts`), al lado
 * de lo que el grafo dice desde su instantánea. Así se ve que el grafo está
 * vivo: una institución con sus procesos abiertos hoy, un proceso con su
 * etapa de hoy y a quién se le adjudicó. Un tipo de nodo sin fuente en vivo
 * no pinta nada; una fuente que no contesta lo dice y deja en pie lo demás.
 */
export function EnVivo({ ruta }: { ruta: string }) {
  const consulta = useQuery({
    queryKey: claves.vivo(ruta),
    queryFn: ({ signal }) => vivoDelNodo<{ vivo: Vivo | null; sinFuente: boolean }>(ruta, signal),
    staleTime: 5 * 60 * 1000,
  });

  if (consulta.data?.sinFuente) return null;
  return (
    <section aria-labelledby="inspector-vivo" className="px-4 py-3">
      <h3 id="inspector-vivo" className="flex items-center gap-2 text-sm font-bold text-ink">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
        Ahora, en su fuente
      </h3>
      {consulta.isPending ? (
        <div role="status" aria-busy="true" className="mt-2">
          <span className="sr-only">Leyendo la fuente en vivo…</span>
          <EsqueletoLineas n={3} />
        </div>
      ) : consulta.isError ? (
        <div className="mt-1 space-y-2 text-xs leading-relaxed text-ink-soft">
          <p>{consulta.error.message}</p>
          <Button variant="secondary" size="sm" onClick={() => void consulta.refetch()}>
            Leerla otra vez
          </Button>
        </div>
      ) : consulta.data.vivo ? (
        <Cuerpo v={consulta.data.vivo} />
      ) : null}
    </section>
  );
}

function Cuerpo({ v }: { v: Vivo }) {
  return (
    <>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
        {v.titulo}: {v.fuente}, leída el <time dateTime={v.leido}>{formatFecha(v.leido, true)}</time> ({v.ventana}).
      </p>
      {v.resumen && <p className="mt-2 text-sm text-ink">{v.resumen}</p>}
      {v.filas.length > 0 && (
        <ul className="mt-2 divide-y divide-hairline">
          {v.filas.map((f, i) => (
            <li key={`${f.href ?? f.titulo}-${i}`} className="relative py-2">
              {f.marca && (
                <MarcaEstado tono={f.marca.tono} title={f.marca.original ?? undefined} className="mb-1">
                  {f.marca.texto}
                </MarcaEstado>
              )}
              {f.href ? (
                <Link href={f.href} className="estira block text-sm font-medium leading-snug text-ink hover:text-brand-700">
                  {f.titulo}
                </Link>
              ) : (
                <p className="text-sm font-medium leading-snug text-ink">{f.titulo}</p>
              )}
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                {f.monto != null && (
                  <span className="font-mono tabular-nums text-ink">{formatPesos(f.monto)}</span>
                )}
                {f.monto != null && f.montoEs ? ` ${f.montoEs}` : ""}
                {f.monto != null && (f.detalle || f.fecha) ? " · " : ""}
                {f.detalle}
                {f.detalle && f.fecha ? " · " : ""}
                <Antiguedad iso={f.fecha} prefijo={f.prefijoFecha ?? undefined} />
              </p>
            </li>
          ))}
        </ul>
      )}
      {v.enlace && (
        <Link href={v.enlace.href} className="mt-2 inline-flex min-h-11 items-center text-xs text-brand-700 underline sm:min-h-0">
          {v.enlace.texto}
        </Link>
      )}
    </>
  );
}
