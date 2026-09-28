import { getEstadisticasJudiciales } from "@/lib/justicia";
import { puntos, variacion } from "@/lib/cifras";
import { formatFecha, SIN_DATO } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { IconChartBar, IconExternal } from "@/components/icons";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** «2026-07» → «julio de 2026». */
function mesLargo(aaaamm: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(aaaamm);
  const i = m ? Number(m[2]) - 1 : -1;
  return m && i >= 0 && i < 12 ? `${MESES[i]} de ${m[1]}` : aaaamm;
}

/** Salidas por cada 100 entradas, sin decimales engañosos. */
function porCien(tasa: number | null): string {
  return tasa == null ? SIN_DATO : formatInt(tasa * 100);
}

/**
 * ¿Cuántas solicitudes entran a los tribunales y cuántas despachan? — la entrada y la
 * salida de solicitudes de un mes en la jurisdicción ordinaria, por
 * departamento judicial, según el boletín del Poder Judicial
 * (`lib/justicia.ts`, instantánea de `scripts/build-justicia.py`).
 */
export async function EstadisticasJudiciales() {
  const d = await getEstadisticasJudiciales();
  const a = d?.actual;
  const b = d?.anterior ?? null;
  const cambio = a && b ? variacion(a.entradas, b.entradas) : null;
  return (
    <Card as="section" className="flex h-full flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <IconChartBar className="h-4 w-4 text-ink-soft" />
            ¿Cuántas solicitudes entran a los tribunales y cuántas despachan?
          </CardTitle>
          <p className="mt-0.5 text-xs text-ink-soft">
            {a
              ? `Tribunales de jurisdicción ordinaria, ${mesLargo(a.mes)}`
              : "Boletines estadísticos del Poder Judicial"}
          </p>
        </div>
        <Button asChild variant="link" className="-my-2 -mr-2 px-2 text-xs">
          <a
            href={d?.indice ?? "https://transparencia.poderjudicial.gob.do/transparencia/estadisticas_judiciales/BoletinesEstadisticos"}
            target="_blank"
            rel="noopener noreferrer"
          >
            Poder Judicial
            <IconExternal className="h-3.5 w-3.5" />
            <span className="sr-only">(se abre en otra pestaña)</span>
          </a>
        </Button>
      </div>
      {d && a ? (
        <>
          <TiraDeCifras className="-mx-5 mt-4 sm:grid-cols-3 lg:grid-cols-3">
            <Cifra
              etiqueta="Entraron"
              valor={formatInt(a.entradas)}
              ancla={{ alcance: "instantanea", periodo: mesLargo(a.mes) }}
            />
            <Cifra etiqueta="Salieron" valor={formatInt(a.salidas)} nota="solicitudes cerradas en el mes" />
            <Cifra
              etiqueta="Salidas por cada 100 entradas"
              valor={porCien(a.tasa)}
              nota={b && b.tasa != null ? `${porCien(b.tasa)} en ${mesLargo(b.mes)}` : undefined}
            />
          </TiraDeCifras>
          {b && cambio && cambio.pct != null && a.tasa != null && b.tasa != null && (
            <p className="mt-3 text-sm text-ink-soft">
              Frente a {mesLargo(b.mes)} entraron {formatInt(Math.abs(cambio.abs))}{" "}
              {cambio.abs >= 0 ? "más" : "menos"} ({cambio.abs >= 0 ? "+" : "−"}
              {Math.abs(cambio.pct).toFixed(1)} %), y por cada 100 que entraron salieron{" "}
              {porCien(a.tasa)} en vez de {porCien(b.tasa)} ({puntos(a.tasa * 100, b.tasa * 100)}).
            </p>
          )}

          <h3 className="mt-5 text-sm font-bold text-ink">
            Por departamento judicial, del que más da abasto al que menos
          </h3>
          <ol className="-mx-5 mt-2 divide-y divide-hairline border-y border-hairline">
            {a.departamentos.map((dep) => (
              <li key={dep.nombre} className="px-5 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] text-ink">{dep.nombre}</span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-ink">
                    {porCien(dep.tasa)}
                    <span className="sr-only"> salidas por cada 100 entradas</span>
                  </span>
                </div>
                <Progress value={dep.tasa != null ? dep.tasa * 100 : null} className="mt-1.5" />
                <p className="mt-1 font-mono text-xs tabular-nums text-ink-soft">
                  {formatInt(dep.entradas)} entradas · {formatInt(dep.salidas)} salidas
                </p>
              </li>
            ))}
          </ol>

          <p className="mt-auto pt-3 text-xs leading-relaxed text-ink-soft">
            {a.preliminar
              ? "Cifras preliminares del Poder Judicial, «sujetas a verificación» según su propia hoja. "
              : "Cifras del Poder Judicial. "}
            Cuenta solicitudes de servicio judicial (demandas, recursos,
            pedidos al tribunal), no expedientes ni personas, en la corte de
            apelación, la primera instancia y los juzgados de paz; la Suprema Corte
            va aparte. Una «salida» es una solicitud que el tribunal cerró ese mes,
            {" "}<em>sin importar cuándo entró</em>: por eso la proporción dice si los
            tribunales dan abasto, no qué parte de lo que entró quedó resuelto.
            Instantánea del{" "}
            <a href={a.fuente} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
              boletín de {mesLargo(a.mes)}
            </a>
            {b && (
              <>
                {" "}y el de{" "}
                <a href={b.fuente} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
                  {mesLargo(b.mes)}
                </a>
              </>
            )}
            , generada el {formatFecha(d.generadoEn)}.
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-alerta-700">
          No pudimos leer la instantánea de las estadísticas judiciales. No mostramos
          una cifra que no pudimos leer; los boletines siguen en el portal de
          transparencia del Poder Judicial.
        </p>
      )}
    </Card>
  );
}
