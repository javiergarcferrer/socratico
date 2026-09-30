import { Cargando, Esqueleto } from "@/components/esqueleto";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * La silueta de la consulta de un caso mientras contesta el rol del Poder
 * Judicial (unos cinco segundos la primera vez). Medida contra la página real
 * con un caso de cinco audiencias (2026-09-30): a 390 px, la pregunta y su
 * explicación 215 px, el campo con su alcance 111, la próxima audiencia 245 y
 * todas las audiencias 808 (filas de ~139, apiladas); a 1280, 92, 87, 184 y
 * 524 (filas de 80, en cuadro). Lo que llega cae en su sitio.
 */
export default function Loading() {
  return (
    <Cargando className="mx-auto max-w-4xl space-y-5">
      <div className="h-[215px] sm:h-[92px]">
        <div className="space-y-1 sm:space-y-0">
          <Skeleton className="h-8 w-full max-w-xl bg-hairline/70 sm:h-10" />
          <Skeleton className="h-8 w-2/3 bg-hairline/70 sm:hidden" />
        </div>
        <div className="mt-3 space-y-2.5 sm:mt-2.5">
          <Skeleton className="h-3 w-11/12 bg-hairline/70" />
          <Skeleton className="h-3 w-full bg-hairline/70" />
          <Skeleton className="h-3 w-4/5 bg-hairline/70 sm:hidden" />
          <Skeleton className="h-3 w-11/12 bg-hairline/70 sm:hidden" />
          <Skeleton className="h-3 w-5/6 bg-hairline/70 sm:hidden" />
          <Skeleton className="h-3 w-1/3 bg-hairline/70 sm:hidden" />
        </div>
      </div>

      <div className="h-[111px] sm:h-[87px]">
        <Esqueleto className="h-11 sm:h-10" />
        <div className="mt-3 space-y-2">
          <Skeleton className="h-3 w-full max-w-2xl bg-hairline/70" />
          <Skeleton className="h-3 w-5/6 max-w-xl bg-hairline/70" />
          <Skeleton className="h-3 w-1/2 bg-hairline/70 sm:hidden" />
        </div>
      </div>

      <div className="h-[245px] overflow-hidden rounded-lg border border-hairline bg-surface sm:h-[184px]">
        <div className="flex h-[49px] items-center justify-between border-b border-hairline px-5">
          <Skeleton className="h-3.5 w-36 bg-hairline/70" />
          <Skeleton className="h-3 w-28 bg-hairline/70" />
        </div>
        <div className="space-y-2.5 px-5 py-4">
          <Skeleton className="h-7 w-60 bg-hairline/70" />
          <Skeleton className="h-3 w-24 bg-hairline/70" />
          <Skeleton className="h-3.5 w-11/12 bg-hairline/70" />
          <Skeleton className="h-3.5 w-1/2 bg-hairline/70 sm:hidden" />
          <Skeleton className="h-3 w-4/5 bg-hairline/70" />
          <Skeleton className="h-3 w-2/3 bg-hairline/70 sm:hidden" />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
        <div className="flex h-[49px] items-center justify-between border-b border-hairline px-5">
          <Skeleton className="h-3.5 w-44 bg-hairline/70" />
          <Skeleton className="h-3 w-4 bg-hairline/70" />
        </div>
        <div className="h-[51px] space-y-2 px-5 pt-3 sm:h-[31px]">
          <Skeleton className="h-3 w-full max-w-lg bg-hairline/70" />
          <Skeleton className="h-3 w-1/3 bg-hairline/70 sm:hidden" />
        </div>
        {/* En el teléfono, fichas apiladas: fecha y estado, tribunal, resultado, asunto, partes. */}
        <div className="mt-2 divide-y divide-hairline border-t border-hairline sm:hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[139px] space-y-2.5 px-5 py-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-40 bg-hairline/70" />
                <Skeleton className="h-5 w-24 bg-hairline/70" />
              </div>
              <Skeleton className="h-3.5 w-11/12 bg-hairline/70" />
              <Skeleton className="h-3 w-20 bg-hairline/70" />
              <Skeleton className="h-3 w-1/2 bg-hairline/70" />
              <Skeleton className="h-3 w-3/4 bg-hairline/70" />
            </div>
          ))}
        </div>
        {/* Desde `sm`, el cuadro: cabecera y filas de cuatro columnas. */}
        <div className="mt-2 hidden sm:block">
          <div className="flex h-[37px] items-center gap-6 border-b border-hairline px-5">
            <Skeleton className="h-2.5 w-14 bg-hairline/70" />
            <Skeleton className="h-2.5 w-14 bg-hairline/70" />
            <Skeleton className="h-2.5 w-20 bg-hairline/70" />
            <Skeleton className="h-2.5 w-24 bg-hairline/70" />
          </div>
          <div className="divide-y divide-hairline">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid h-20 grid-cols-[6rem_1fr_8rem_1fr] gap-4 px-5 py-3">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20 bg-hairline/70" />
                  <Skeleton className="h-3 w-14 bg-hairline/70" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-4/5 bg-hairline/70" />
                  <Skeleton className="h-3 w-16 bg-hairline/70" />
                </div>
                <Skeleton className="h-5 w-24 bg-hairline/70" />
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-2/3 bg-hairline/70" />
                  <Skeleton className="h-3 w-4/5 bg-hairline/70" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Cargando>
  );
}
