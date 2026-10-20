import { Cargando, Esqueleto, EsqueletoFilas } from "@/components/esqueleto";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * La silueta de las señales: la banda de tinta con la pregunta y sus cuatro
 * cifras (dos filas en el teléfono, una desde `sm`), la fila de filtros y el
 * listado.
 */
export default function Loading() {
  return (
    <Cargando className="space-y-5">
      <Esqueleto className="h-[37rem] border-transparent bg-ink/90 sm:h-[23rem]" />
      <div className="space-y-3">
        <Skeleton className="h-3 w-56 bg-hairline/70" />
        <div className="flex flex-wrap gap-2 sm:gap-1.5">
          {["w-28", "w-56", "w-72", "w-56", "w-64", "w-56"].map((w, i) => (
            <Skeleton key={i} className={`h-10 ${w} rounded-lg bg-hairline/70 sm:h-9`} />
          ))}
        </div>
      </div>
      <EsqueletoFilas n={8} />
    </Cargando>
  );
}
