import { Cargando, Esqueleto, EsqueletoFilas } from "@/components/esqueleto";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * La silueta del directorio de medidas: la banda de tinta con la pregunta y
 * sus cuatro cifras (dos filas en el teléfono, una desde `sm`), el campo de
 * búsqueda con su alcance debajo, las dos filas de filtros y el listado. La
 * pregunta ocupa cuatro renglones a 390 px, y la banda crece con ella.
 */
export default function Loading() {
  return (
    <Cargando className="space-y-5">
      <Esqueleto className="h-[37rem] border-transparent bg-ink/90 sm:h-[23rem]" />
      <div className="space-y-2">
        <Esqueleto className="h-11" />
        <Skeleton className="h-3 w-full max-w-xl bg-hairline/70" />
        <Skeleton className="h-3 w-2/3 max-w-md bg-hairline/70" />
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 sm:gap-1.5">
          {["w-28", "w-32", "w-32", "w-40"].map((w, i) => (
            <Skeleton key={i} className={`h-10 ${w} rounded-lg bg-hairline/70 sm:h-9`} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-1.5">
          {["w-40", "w-24", "w-24", "w-24", "w-24", "w-24", "w-24", "w-24", "w-36"].map((w, i) => (
            <Skeleton key={i} className={`h-10 ${w} rounded-lg bg-hairline/70 sm:h-9`} />
          ))}
        </div>
      </div>
      <EsqueletoFilas n={8} />
    </Cargando>
  );
}
