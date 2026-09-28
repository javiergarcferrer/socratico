import Link from "next/link";
import { getDiaElectrico } from "@/lib/energia";
import { formatFecha } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { IconChartBar, IconExternal } from "@/components/icons";

/**
 * ¿Alcanzó la electricidad ayer? — generación real contra programada y las
 * horas que el Organismo Coordinador marcó como desabastecimiento
 * (`lib/energia.ts`).
 */
export async function DiaElectrico() {
  const d = await getDiaElectrico();
  const desvio = d ? ((d.generado - d.programado) / d.programado) * 100 : 0;
  return (
    <Card as="section" className="flex h-full flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <IconChartBar className="h-4 w-4 text-ink-soft" />
            ¿Alcanzó la electricidad ayer?
          </CardTitle>
          <p className="mt-0.5 text-xs text-ink-soft">
            {d ? `Sistema eléctrico interconectado · ${formatFecha(d.fecha)}` : "Organismo Coordinador del sistema eléctrico"}
          </p>
        </div>
        <Button asChild variant="link" className="-my-2 -mr-2 px-2 text-xs">
          <a href="https://www.oc.org.do/" target="_blank" rel="noopener noreferrer">
            OC
            <IconExternal className="h-3.5 w-3.5" />
            <span className="sr-only">(se abre en otra pestaña)</span>
          </a>
        </Button>
      </div>
      {d ? (
        <>
          <TiraDeCifras className="-mx-5 mt-4 sm:grid-cols-3">
            <Cifra etiqueta="Generado" valor={`${formatInt(Math.round(d.generado))} MWh`} nota={`${desvio >= 0 ? "+" : "−"}${Math.abs(desvio).toFixed(1)} % sobre lo programado`} />
            <Cifra etiqueta="Hora de más generación" valor={`${formatInt(Math.round(d.pico.mw))} MW`} nota={`de ${String(d.pico.periodo - 1).padStart(2, "0")}:00 a ${String(d.pico.periodo).padStart(2, "0")}:00`} />
            {d.desabastecimiento && (
              <Cifra
                etiqueta="Horas con desabastecimiento"
                valor={formatInt(d.desabastecimiento.horas)}
                nota={`de ${d.desabastecimiento.declaradas} horas que declara el OC`}
              />
            )}
          </TiraDeCifras>
          <p className="mt-auto pt-3 text-xs leading-relaxed text-ink-soft">
            Lo que publica el Organismo Coordinador para el día cerrado. Una hora con
            «desabastecimiento» es una hora en que el OC registró que la oferta de
            generación no alcanzó para toda la demanda: es la huella pública de los
            apagones por falta de energía, no de las averías de las distribuidoras.
            Los cortes programados por mantenimiento están en{" "}
            <Link href="/luz" className="font-medium text-brand-700 hover:underline">
              cortes de luz programados
            </Link>
            .
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-alerta-700">
          El Organismo Coordinador no contestó o no tiene aún las 24 horas de ayer. No
          mostramos un día a medias.
        </p>
      )}
    </Card>
  );
}
