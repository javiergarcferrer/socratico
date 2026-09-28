import Link from "next/link";
import { getSiniestralidad, tramoDeMeses } from "@/lib/siniestralidad";
import { variacion } from "@/lib/cifras";
import { formatInt } from "@/lib/nomina";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { IconMapPin, IconExternal } from "@/components/icons";
import { enlace } from "@/lib/grafo";

/**
 * ¿Cuántos mueren en las vías? — el año en curso contra los mismos meses del
 * anterior, según el observatorio del INTRANT (`lib/siniestralidad.ts`).
 */
export async function SiniestralidadVial() {
  const s = await getSiniestralidad();
  const cambio = s && s.muertesAnterior != null ? variacion(s.muertes, s.muertesAnterior) : null;
  return (
    <Card as="section" className="flex h-full flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <IconMapPin className="h-4 w-4 text-ink-soft" />
            ¿Cuántos mueren en las vías?
          </CardTitle>
          <p className="mt-0.5 text-xs text-ink-soft">
            {s ? `Fallecidos en siniestros de tránsito, ${tramoDeMeses(s.meses)} de ${s.anio}` : "Observatorio de Seguridad Vial del INTRANT"}
          </p>
        </div>
        <Button asChild variant="link" className="-my-2 -mr-2 px-2 text-xs">
          <a href="https://opsevi.intrant.gob.do/" target="_blank" rel="noopener noreferrer">
            OPSEVI
            <IconExternal className="h-3.5 w-3.5" />
            <span className="sr-only">(se abre en otra pestaña)</span>
          </a>
        </Button>
      </div>
      {s ? (
        <>
          <TiraDeCifras className="-mx-5 mt-4 sm:grid-cols-3">
            <Cifra etiqueta="Fallecidos" valor={formatInt(s.muertes)} nota={`${tramoDeMeses(s.meses)} ${s.anio}`} />
            {s.muertesAnterior != null && (
              <Cifra etiqueta={`Mismos meses de ${s.anio - 1}`} valor={formatInt(s.muertesAnterior)} />
            )}
            {s.motocicleta && (
              <Cifra etiqueta="Iban en motocicleta" valor={`${s.motocicleta.pct.toFixed(0)} %`} nota={`${formatInt(s.motocicleta.muertes)} personas`} />
            )}
          </TiraDeCifras>
          {cambio && cambio.pct != null && (
            <p className="mt-3 text-sm text-ink-soft">
              {Math.abs(cambio.abs) === 0
                ? "La misma cifra que en esos meses del año anterior."
                : `Con cifras preliminares, que pueden subir a medida que se completa el registro: ${formatInt(Math.abs(cambio.abs))} ${cambio.abs > 0 ? "más" : "menos"} que en esos meses del año anterior (${cambio.abs > 0 ? "+" : "−"}${Math.abs(cambio.pct).toFixed(1)} %).`}
              {s.tasa != null && ` Van ${s.tasa.toFixed(1)} por cada 100 mil habitantes en el año.`}
            </p>
          )}
          {s.provincias.length > 0 && (
            <p className="mt-2 text-sm text-ink-soft">
              Donde más:{" "}
              {s.provincias.slice(0, 4).map((p, i) => (
                <span key={p.nombre}>
                  {i > 0 && ", "}
                  {p.provincia ? (
                    <Link href={enlace.provincia(p.provincia.slug)} className="text-ink hover:text-brand-700 hover:underline">
                      {p.nombre}
                    </Link>
                  ) : (
                    <span className="text-ink">{p.nombre}</span>
                  )}{" "}
                  <span className="font-mono tabular-nums">({formatInt(p.muertes)})</span>
                </span>
              ))}
              .
            </p>
          )}
          <p className="mt-auto pt-3 text-xs leading-relaxed text-ink-soft">
            Cifras preliminares del observatorio del INTRANT, leídas de la interfaz de
            datos de su tablero, que no está documentada y se revisa. El año en curso
            se compara con los mismos meses del anterior, no con el año entero.
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-alerta-700">
          El observatorio del INTRANT no contestó o cambió de forma. No mostramos una
          cifra que no pudimos leer; su tablero sigue en su sitio.
        </p>
      )}
    </Card>
  );
}
