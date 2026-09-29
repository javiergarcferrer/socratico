import { Cargando, Esqueleto, EsqueletoFilas } from "@/components/esqueleto";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * La silueta del registro de entidades financieras: la pregunta en dos
 * renglones (a 390 px no cabe en uno) y su párrafo, la tira de cuatro cifras
 * —apilada en el teléfono, dos por dos en `sm`, en fila desde `lg`—, el
 * buscador con su alcance, la fila de sectores y el listado. Lee una
 * instantánea local: casi nunca se llega a ver.
 */
export default function Loading() {
  return (
    <Cargando className="mx-auto max-w-4xl space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-9 w-full max-w-md bg-hairline/70" />
        <Skeleton className="h-9 w-3/5 max-w-xs bg-hairline/70 sm:hidden" />
        <Skeleton className="h-3 w-full max-w-2xl bg-hairline/70" />
        <Skeleton className="h-3 w-11/12 max-w-2xl bg-hairline/70" />
        <Skeleton className="h-3 w-2/3 max-w-xl bg-hairline/70" />
      </div>
      <Esqueleto className="h-[26rem] sm:h-56 lg:h-32" />
      <div className="space-y-2">
        <Esqueleto className="h-11" />
        <Skeleton className="h-3 w-3/4 max-w-lg bg-hairline/70" />
      </div>
      <div className="flex flex-wrap gap-2 sm:gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-32 bg-hairline/70 sm:h-9" />
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
        <Skeleton className="mx-5 mt-4 h-3 w-64 max-w-full bg-hairline/70" />
        <EsqueletoFilas n={10} className="mt-2 rounded-none border-x-0 border-b-0" />
      </div>
    </Cargando>
  );
}
