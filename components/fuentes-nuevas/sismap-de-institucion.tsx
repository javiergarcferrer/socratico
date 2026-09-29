import Link from "next/link";
import { sismapDeGobiernoLocal, sismapDeInstitucion, TABLAS_SISMAP } from "@/lib/sismap";
import { formatFecha } from "@/lib/format";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { IconExternal } from "@/components/icons";

/**
 * «¿Qué tan bien se gestiona?» en la ficha de institución: su puesto y su
 * valoración en el ranking del SISMAP, contra cuántos se mide.
 *
 * Si la institución no está en el ranking (o su nombre no casó en
 * `scripts/build-sismap.py`), no pinta nada. Con `gobiernoLocal` (el nombre
 * de un gobierno local que entró por el Clasificador Institucional) prueba
 * además el cruce cierto de `sismapDeGobiernoLocal`.
 */
export async function SismapDeInstitucion({ uc, gobiernoLocal }: { uc: number; gobiernoLocal?: string }) {
  const s = gobiernoLocal ? await sismapDeGobiernoLocal(uc, gobiernoLocal) : await sismapDeInstitucion(uc);
  if (!s) return null;
  const { fila, tabla, total, consultado } = s;
  const t = TABLAS_SISMAP.find((x) => x.clave === tabla)!;
  return (
    <Card as="section" className="p-5 sm:p-6">
      <CardTitle>Calidad de la gestión</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Ranking del Sistema de Monitoreo de la Administración Pública (SISMAP), que
        mide cuánto cumple cada organismo los indicadores de gestión del Ministerio
        de Administración Pública con las evidencias que el propio organismo carga.
        Consultado el {formatFecha(consultado)}; el SISMAP no publica fecha de corte.
      </p>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-2xl font-semibold tabular-nums">{fila.valor.toFixed(2)} %</span>
        <span className="text-sm text-ink-soft">
          puesto <span className="font-mono font-semibold tabular-nums text-ink">{fila.posicion}</span> de{" "}
          <span className="font-mono tabular-nums">{total}</span> en {t.nombre.toLowerCase()}
        </span>
      </div>
      <Progress
        value={fila.valor}
        aria-label={`Valoración SISMAP: ${fila.valor.toFixed(2)} %`}
        className="mt-3"
      />
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link href={`/gestion?tabla=${tabla}`} className="inline-flex min-h-11 items-center font-medium text-brand-700 hover:underline sm:min-h-0">
          Ver el ranking completo
        </Link>
        {fila.ficha && (
          <a
            href={fila.ficha}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 font-medium text-brand-700 hover:underline sm:min-h-0"
          >
            Sus evidencias en el SISMAP
            <IconExternal className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </Card>
  );
}
