import { getMacro, type Indicador } from "@/lib/macro";
import { puntos, variacion } from "@/lib/cifras";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { IconChartBar, IconExternal } from "@/components/icons";
import { SIN_DATO } from "@/lib/format";

/**
 * Tres cifras mensuales del Banco Central para el panorama: remesas, reservas
 * internacionales y la tasa activa ponderada de los bancos múltiples (archivos
 * públicos del CDN del BCRD, `lib/macro.ts`).
 *
 * Componente de servidor; quien lo coloque lo envuelve en su `Suspense` con
 * una `Esqueleto` de la misma altura, como `SeccionBolsillo`. Cada cifra se
 * degrada por su cuenta: la que no se pudo leer lo dice en su casilla y las
 * otras siguen en pie.
 */

const decimal = (n: number, d: number) =>
  n.toLocaleString("es-DO", { minimumFractionDigits: d, maximumFractionDigits: d });

const millonesUSD = (n: number) => `US$\u00A0${decimal(n, 1)} millones`;
const porciento = (n: number) => `${decimal(n, 2)} %`;

function notaPeriodo(i: Indicador) {
  return `${i.periodo[0].toUpperCase()}${i.periodo.slice(1)}${i.preliminar ? " · preliminar" : ""}`;
}

/** «En agosto 2025 fueron US$ 1,046.5 millones: 6.7 % más.» — solo si el archivo trae el punto. */
function comparacionMonto(i: Indicador, verbo: string) {
  if (!i.comparacion) return "El archivo no trae el mismo mes del año anterior; aquí no se compara.";
  const v = variacion(i.valor, i.comparacion.valor);
  const cambio =
    v?.pct == null
      ? ""
      : Math.abs(v.pct) < 0.05
        ? ": prácticamente igual"
        : `: ${decimal(Math.abs(v.pct), 1)} % ${v.pct > 0 ? "más" : "menos"}`;
  return `En ${i.comparacion.periodo} ${verbo} ${millonesUSD(i.comparacion.valor)}${cambio}.`;
}

function comparacionTasa(i: Indicador) {
  if (!i.comparacion) return "El archivo no trae el mes anterior; aquí no se compara.";
  const d = i.valor - i.comparacion.valor;
  const cambio =
    Math.abs(d) < 0.05 ? "prácticamente igual" : `${d > 0 ? "subió" : "bajó"} ${puntos(i.valor, i.comparacion.valor).slice(1)}`;
  return `En ${i.comparacion.periodo} estaba en ${porciento(i.comparacion.valor)}: ${cambio}.`;
}

function Casilla({
  etiqueta,
  indicador,
  valor,
  comparacion,
  extra,
}: {
  etiqueta: string;
  indicador: Indicador | null;
  valor: (i: Indicador) => string;
  comparacion: (i: Indicador) => string;
  extra?: (i: Indicador) => string | null;
}) {
  if (!indicador) {
    return (
      <div>
        <Cifra
          etiqueta={etiqueta}
          valor={SIN_DATO}
          tono="text-ink-soft"
          nota={<span className="text-alerta-700">No se pudo leer el archivo del BCRD. No mostramos una cifra que no leímos.</span>}
        />
      </div>
    );
  }
  const adicional = extra?.(indicador);
  return (
    <div className="flex flex-col gap-2">
      <Cifra etiqueta={etiqueta} valor={valor(indicador)} nota={notaPeriodo(indicador)} />
      <p className="text-sm leading-snug text-ink-soft">{comparacion(indicador)}</p>
      {adicional && <p className="text-xs leading-snug text-ink-soft">{adicional}</p>}
    </div>
  );
}

export async function IndicadoresMacro() {
  const { remesas, reservas, tasaActiva } = await getMacro();
  const ninguno = !remesas && !reservas && !tasaActiva;
  return (
    <Card as="section" className="flex h-full flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <IconChartBar className="h-4 w-4 text-ink-soft" />
            ¿Cómo le va a la economía?
          </CardTitle>
          <p className="mt-0.5 text-xs text-ink-soft">
            Tres cifras mensuales que publica el Banco Central
          </p>
        </div>
        <Button asChild variant="link" className="-my-2 -mr-2 px-2 text-xs">
          <a href="https://www.bancentral.gov.do/" target="_blank" rel="noopener noreferrer">
            BCRD
            <IconExternal className="h-3.5 w-3.5" />
            <span className="sr-only">(se abre en otra pestaña)</span>
          </a>
        </Button>
      </div>
      {ninguno ? (
        <p className="mt-4 text-sm text-alerta-700">
          Los archivos del Banco Central no contestaron. No mostramos cifras que no
          pudimos leer; siguen publicadas en su sitio.
        </p>
      ) : (
        <>
          <TiraDeCifras className="-mx-5 mt-4 sm:grid-cols-3 lg:grid-cols-3">
            <Casilla
              etiqueta="Remesas recibidas en el mes"
              indicador={remesas}
              valor={(i) => millonesUSD(i.valor)}
              comparacion={(i) => comparacionMonto(i, "fueron")}
            />
            <Casilla
              etiqueta="Reservas internacionales brutas"
              indicador={reservas}
              valor={(i) => millonesUSD(i.valor)}
              comparacion={(i) => comparacionMonto(i, "eran")}
            />
            <Casilla
              etiqueta="Tasa a la que prestan los bancos"
              indicador={tasaActiva}
              valor={(i) => porciento(i.valor)}
              comparacion={comparacionTasa}
              extra={(i) =>
                i.parcial
                  ? `${i.parcial.periodo[0].toUpperCase()}${i.parcial.periodo.slice(1)}, mes en curso${
                      i.parcial.hastaElDia ? ` (promedio hasta el día ${i.parcial.hastaElDia})` : ""
                    }: ${porciento(i.parcial.valor)}, preliminar.`
                  : null
              }
            />
          </TiraDeCifras>
          <p className="mt-auto pt-3 text-xs leading-relaxed text-ink-soft">
            Son las cifras que publica el Banco Central en sus hojas de cálculo, sin
            ajustes nuestros; «preliminar» junto a una cifra quiere decir que el propio
            BCRD la marca así y puede rectificarla. Remesas y reservas en millones de
            dólares estadounidenses, comparadas con el mismo mes del año anterior;
            reservas brutas del Banco Central, no netas. La tasa es el promedio ponderado, en % nominal anual, de los
            préstamos en pesos de los bancos múltiples; se compara con el mes anterior
            y la diferencia va en puntos.
          </p>
        </>
      )}
    </Card>
  );
}
