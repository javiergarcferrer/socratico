import { Suspense } from "react";
import { getCombustibles } from "@/lib/combustibles";
import { getTasa } from "@/lib/tasa";
import { formatFecha } from "@/lib/format";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Esqueleto } from "@/components/esqueleto";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { IconCoins, IconTrendingUp, IconExternal } from "@/components/icons";

/**
 * Indicadores del bolsillo para el panorama: el precio de los combustibles de
 * la semana (MICM) y la tasa de referencia del dólar (BCRD, archivo del CDN).
 *
 * Listos para colocar en `app/page.tsx` debajo de `SeccionDeuda`:
 *
 *   <SeccionBolsillo />
 *
 * que ya trae su `Suspense` y su silueta, de modo que una fuente lenta no
 * retiene el panorama y una caída no lo deja en blanco: cada tarjeta que no
 * contesta dice que no contestó, y la otra sigue en pie.
 */
export function SeccionBolsillo() {
  return (
    <section className="grid gap-4 lg:grid-cols-2" aria-label="Indicadores del bolsillo">
      <Suspense fallback={<Esqueleto className="h-[318px] sm:h-[250px]" />}>
        <IndicadorCombustibles />
      </Suspense>
      <Suspense fallback={<Esqueleto className="h-[250px] sm:h-[250px]" />}>
        <IndicadorTasa />
      </Suspense>
    </section>
  );
}

const pesos = (n: number, decimales = 2) =>
  `RD$\u00A0${n.toLocaleString("es-DO", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;

export async function IndicadorCombustibles() {
  const c = await getCombustibles();
  return (
    <Card as="section" className="flex h-full flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <IconCoins className="h-4 w-4 text-ink-soft" />
            ¿Cuánto cuesta llenar el tanque?
          </CardTitle>
          <p className="mt-0.5 text-xs text-ink-soft">
            {c?.semana ? `Precios de la semana del ${c.semana}` : "Precios semanales del MICM"}
          </p>
        </div>
        <Button asChild variant="link" className="-my-2 -mr-2 px-2 text-xs">
          <a href="https://micm.gob.do/" target="_blank" rel="noopener noreferrer">
            MICM
            <IconExternal className="h-3.5 w-3.5" />
            <span className="sr-only">(se abre en otra pestaña)</span>
          </a>
        </Button>
      </div>
      {c ? (
        <>
          <TiraDeCifras className="-mx-5 mt-4 sm:grid-cols-2 lg:grid-cols-3">
            {c.precios.map((p) => (
              <Cifra
                key={p.nombre}
                etiqueta={p.nombre}
                valor={pesos(p.precio)}
                nota={p.unidad ? `por ${p.unidad}` : "unidad no indicada"}
              />
            ))}
          </TiraDeCifras>
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">
            Son los {c.precios.length} precios que el MICM pone en su portada, no el
            aviso completo (que no publica en texto legible). Sin la semana anterior:
            la portada solo trae la vigente, así que aquí no se compara. La portada
            no indica la unidad del GLP ni del gas natural, y aquí no se supone.
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-alerta-700">
          La portada del MICM no contestó o cambió de forma. No mostramos un precio
          que no pudimos leer; el aviso oficial sigue en su sitio.
        </p>
      )}
    </Card>
  );
}

export async function IndicadorTasa() {
  const t = await getTasa();
  const diferencia = t?.haceUnMes ? t.ultimo.venta - t.haceUnMes.venta : null;
  return (
    <Card as="section" className="flex h-full flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <IconTrendingUp className="h-4 w-4 text-ink-soft" />
            ¿A cuánto está el dólar?
          </CardTitle>
          <p className="mt-0.5 text-xs text-ink-soft">
            {t ? `Tasa de referencia del mercado spot · ${formatFecha(t.ultimo.fecha)}` : "Tasa de referencia del Banco Central"}
          </p>
        </div>
        <Button asChild variant="link" className="-my-2 -mr-2 px-2 text-xs">
          <a href="https://www.bancentral.gov.do/a/d/2538-mercado-cambiario" target="_blank" rel="noopener noreferrer">
            BCRD
            <IconExternal className="h-3.5 w-3.5" />
            <span className="sr-only">(se abre en otra pestaña)</span>
          </a>
        </Button>
      </div>
      {t ? (
        <>
          <TiraDeCifras className="-mx-5 mt-4 sm:grid-cols-2 lg:grid-cols-2">
            <Cifra etiqueta="Venta" valor={pesos(t.ultimo.venta, 4)} nota={`Al ${formatFecha(t.ultimo.fecha)}`} />
            <Cifra etiqueta="Compra" valor={pesos(t.ultimo.compra, 4)} nota={`Al ${formatFecha(t.ultimo.fecha)}`} />
          </TiraDeCifras>
          {diferencia !== null && t.haceUnMes && (
            <p className="mt-3 text-sm text-ink-soft">
              Un mes antes, el {formatFecha(t.haceUnMes.fecha)}, la venta estaba a{" "}
              <span className="font-mono tabular-nums text-ink">{pesos(t.haceUnMes.venta, 4)}</span>:{" "}
              {Math.abs(diferencia) < 0.005
                ? "prácticamente igual."
                : `${diferencia > 0 ? "subió" : "bajó"} ${pesos(Math.abs(diferencia))} por dólar.`}
            </p>
          )}
          <p className="mt-auto pt-3 text-xs leading-relaxed text-ink-soft">
            Pesos por un dólar estadounidense. Es la tasa de referencia que el Banco
            Central publica cada día hábil, no la de una casa de cambio.
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-alerta-700">
          El archivo del Banco Central no contestó. No mostramos una tasa que no
          pudimos leer.
        </p>
      )}
    </Card>
  );
}
