import Link from "next/link";
import { finVencido, tonoDeObra, type Obra } from "@/lib/obras";
import { formatPesos, tituloLegible } from "@/lib/format";
import { MarcaEstado } from "@/components/marca-estado";
import { Progress } from "@/components/ui/progress";
import { enlace } from "@/lib/grafo";

/**
 * Una obra en un listado: qué es, quién la ejecuta, dónde, en qué estado y
 * cuánto dice haber avanzado. La fila entera lleva a la ficha (docs/INFRAESTRUCTURA.md §11).
 *
 * Componente de servidor: importa `lib/obras.ts`, que lee disco con `node:fs`.
 * Lo pintan el listado `/obras` y la ficha de institución; nunca un cliente.
 */
export function FilaObra({ obra: o }: { obra: Obra }) {
  const lugar = o.nacional
    ? "Alcance nacional"
    : o.provincias.length > 3
      ? `${o.provincias.slice(0, 2).join(", ")} y ${o.provincias.length - 2} provincias más`
      : o.provincias.join(", ");
  return (
    <li className="relative px-4 py-3.5 transition-colors hover:bg-canvas/60 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <MarcaEstado tono={tonoDeObra(o.estado)}>{o.estado}</MarcaEstado>
        <span className="font-mono text-xs tabular-nums text-ink-soft">SNIP {o.snip}</span>
        {finVencido(o) && (
          <span className="text-xs text-alerta-700">Pasó su fecha de fin prevista</span>
        )}
      </div>
      <Link
        href={enlace.obra(o.snip)}
        title={o.nombre}
        className="mt-1.5 block text-[15px] leading-snug text-ink estira hover:text-brand-700"
      >
        {tituloLegible(o.nombre)}
      </Link>
      <p className="mt-0.5 text-xs text-ink-soft">
        {[o.entidad && tituloLegible(o.entidad), lugar].filter(Boolean).join(" · ")}
      </p>
      <div className="mt-2 flex items-center gap-3">
        <Progress
          value={o.avance}
          aria-label={`Avance declarado: ${o.avance.toFixed(0)} %`}
          className="flex-1"
        />
        <span className="shrink-0 font-mono text-xs tabular-nums text-ink-soft">
          {o.avance.toFixed(0)} % · {formatPesos(o.valor)}
        </span>
      </div>
    </li>
  );
}
