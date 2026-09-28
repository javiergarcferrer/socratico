import { getComercioExterior, type SerieAduanas } from "@/lib/aduanas";
import { variacion } from "@/lib/cifras";
import { formatFecha, SIN_DATO } from "@/lib/format";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { IconChartBar, IconExternal } from "@/components/icons";

/**
 * Comercio exterior y recaudación de Aduanas (DGA): el último mes de
 * importaciones y exportaciones FOB y lo que cobró la DGA, cada cifra con su
 * mes, su unidad y —solo cuando el archivo lo trae— el mismo mes del año
 * anterior y el acumulado de enero a ese mes.
 *
 * Componente de servidor; quien lo coloque lo envuelve en `Suspense` con su
 * silueta (`Esqueleto`), como `SeccionBolsillo`. Cada cifra se cae sola: la que
 * no se pudo leer lo dice, y las otras siguen en pie.
 */

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const mesDe = (s: Pick<SerieAduanas, "anio" | "mes">, anio = s.anio) => `${MESES[s.mes - 1]} ${anio}`;

/** Millones escritos con su moneda: «US$ 2,778.4 millones». La unidad viaja con el número. */
function millones(valor: number, unidad: SerieAduanas["unidad"]): string {
  const n = (valor / 1e6).toLocaleString("es-DO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${unidad === "USD" ? "US$" : "RD$"}\u00A0${n} millones`;
}

function cambio(actual: number, anterior: number): string {
  const v = variacion(actual, anterior);
  if (!v || v.pct === null) return "";
  if (Math.abs(v.pct) < 0.05) return "prácticamente igual";
  const pct = Math.abs(v.pct).toLocaleString("es-DO", { maximumFractionDigits: 1 });
  return `${v.pct > 0 ? "subió" : "bajó"} ${pct} %`;
}

const FIGURAS = [
  { clave: "importaciones", etiqueta: "Importaciones", unidad: "valor FOB, en dólares" },
  { clave: "exportaciones", etiqueta: "Exportaciones", unidad: "valor FOB, en dólares" },
  { clave: "recaudacion", etiqueta: "Lo que cobró Aduanas para el fondo general", unidad: "recaudación «Fondo 100», en pesos" },
] as const;

export async function ComercioExterior() {
  const c = await getComercioExterior();
  const series = FIGURAS.map((f) => ({ ...f, serie: c[f.clave] }));
  const algunaLeida = series.some((s) => s.serie);
  const nota = series.find((s) => s.serie?.nota)?.serie?.nota ?? null;
  const publicado = series
    .map((s) => s.serie?.publicado)
    .filter((p): p is string => !!p)
    .sort()
    .at(-1);

  return (
    <Card as="section" className="flex h-full flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <IconChartBar className="h-4 w-4 text-ink-soft" />
            ¿Cuánto compra y vende el país afuera?
          </CardTitle>
          <p className="mt-0.5 text-xs text-ink-soft">
            {publicado
              ? `Series de la Dirección General de Aduanas · archivo más reciente del ${formatFecha(publicado.slice(0, 10))}`
              : "Series de tiempo de la Dirección General de Aduanas"}
          </p>
        </div>
        <Button asChild variant="link" className="-my-2 -mr-2 px-2 text-xs">
          <a href={c.fuente} target="_blank" rel="noopener noreferrer">
            Aduanas
            <IconExternal className="h-3.5 w-3.5" />
            <span className="sr-only">(se abre en otra pestaña)</span>
          </a>
        </Button>
      </div>

      {algunaLeida ? (
        <>
          <TiraDeCifras className="-mx-5 mt-4 sm:grid-cols-3 lg:grid-cols-3">
            {series.map(({ clave, etiqueta, unidad, serie }) =>
              serie ? (
                <Cifra
                  key={clave}
                  etiqueta={etiqueta}
                  valor={millones(serie.valor, serie.unidad)}
                  nota={`En ${mesDe(serie)} · ${unidad}`}
                />
              ) : (
                <Cifra
                  key={clave}
                  etiqueta={etiqueta}
                  valor={SIN_DATO}
                  tono="text-alerta-700"
                  nota="No se pudo leer su archivo; no mostramos una cifra adivinada."
                />
              ),
            )}
          </TiraDeCifras>

          <ul className="mt-3 space-y-1.5 text-sm text-ink-soft">
            {series.map(({ clave, etiqueta, serie }) => {
              if (!serie || (serie.mismoMesAnterior === null && serie.acumulado === null)) return null;
              const partes: string[] = [];
              if (serie.mismoMesAnterior !== null) {
                const dir = cambio(serie.valor, serie.mismoMesAnterior);
                partes.push(
                  `en ${mesDe(serie, serie.anio - 1)} fueron ${millones(serie.mismoMesAnterior, serie.unidad)}${dir ? `: ${dir}` : ""}.`,
                );
              }
              if (serie.acumulado !== null) {
                const desde = serie.mes === 1 ? `En enero` : `De enero a ${MESES[serie.mes - 1]}`;
                partes.push(
                  `${desde} de ${serie.anio}, ${millones(serie.acumulado, serie.unidad)}${
                    serie.acumuladoAnterior !== null
                      ? ` (${millones(serie.acumuladoAnterior, serie.unidad)} en el mismo tramo de ${serie.anio - 1})`
                      : ""
                  }.`,
                );
              }
              return (
                <li key={clave}>
                  <span className="text-ink">{etiqueta}:</span> {partes.join(" ")}
                </li>
              );
            })}
          </ul>

          <p className="mt-auto pt-3 text-xs leading-relaxed text-ink-soft">
            FOB es lo que vale la mercancía puesta en el barco, sin flete ni seguro.
            Se leen los totales por régimen (nacional, zonas francas y los demás) y la
            recaudación mensual de la DGA; no es la balanza comercial del Banco
            Central, que mide distinto. {nota ? `La DGA advierte: «${nota}»` : "Son cifras preliminares de la DGA."}{" "}
            Los títulos de sus archivos dicen «millones», pero las celdas traen
            dólares y pesos: aquí se convierten una sola vez.
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-alerta-700">
          {c.indiceLeido
            ? "Aduanas contestó, pero sus archivos no se pudieron leer o cambiaron de forma. No mostramos cifras que no pudimos leer; las series siguen en su sitio."
            : "El índice de series de Aduanas no contestó. No mostramos cifras que no pudimos leer; las series siguen en su sitio."}
        </p>
      )}
    </Card>
  );
}
