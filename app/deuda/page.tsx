import type { Metadata } from "next";
import { getSerieDeuda, periodoDeFecha, type CierreDeuda } from "@/lib/deuda";
import { formatFecha, formatMagnitud, SIN_DATO } from "@/lib/format";
import { variacion } from "@/lib/cifras";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EstadoVacio } from "@/components/estado-vacio";
import Plegable from "@/components/plegable";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";
import { SerieTemporal } from "@/components/graficos";
import { SubastasDeuda } from "@/components/fuentes-nuevas/subastas-deuda";

export const metadata: Metadata = {
  alternates: { canonical: "/deuda" },
  title: "Deuda pública en el tiempo",
  description:
    "Cómo ha crecido la deuda del Sector Público No Financiero dominicano: cierre de cada año desde 2000 con su peso en el PIB y cierres trimestrales desde 2015, según Crédito Público.",
};

/** La serie es mensual en origen y se regenera a mano: un día basta. */
export const revalidate = 86400;

/** «US$ 1.2 mil millones» con signo, para una variación. */
function conSigno(millones: number): string {
  if (Math.abs(millones) < 0.05) return "sin cambio";
  return `${millones > 0 ? "+" : "−"}${formatMagnitud(Math.abs(millones))}`;
}

/** Una variación entre dos cierres, en monto y en por ciento. */
function cambio(actual: number, anterior: number | undefined): string {
  const v = variacion(actual, anterior);
  if (!v) return SIN_DATO;
  return v.pct === null
    ? conSigno(v.abs)
    : `${conSigno(v.abs)} (${v.pct >= 0 ? "+" : "−"}${Math.abs(v.pct).toFixed(1)} %)`;
}

/** Cierres del trimestre: los meses sueltos del año en curso no se mezclan. */
const FIN_DE_TRIMESTRE = /-(03-31|06-30|09-30|12-31)$/;

export default async function DeudaPage() {
  const datos = await getSerieDeuda();

  if (!datos) {
    return (
      <EstadoVacio
        variante="caida"
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="No pudimos leer la serie de deuda"
        accion={
          <Button asChild variant="secondary">
            <a
              href="https://www.creditopublico.gob.do/inicio/estadisticas"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ir a las estadísticas de Crédito Público
            </a>
          </Button>
        }
      >
        Ni el servidor de Crédito Público respondió ni hay una instantánea
        publicada. El resto de Finanzas sigue en pie.
      </EstadoVacio>
    );
  }

  const { ultimo, serie, anual, generadoEn } = datos;
  const ultimoAnio = anual[anual.length - 1];
  const primerAnio = anual[0];
  const trimestral = serie.filter((c) => FIN_DE_TRIMESTRE.test(c.fecha));
  const recientes = [...serie].reverse().slice(0, 6);
  const previoDe = (c: CierreDeuda) => serie[serie.indexOf(c) - 1];
  const cierreAnterior = anual.find((a) => ultimo.fecha?.startsWith(String(a.anio + 1)));
  const cambioEnElAnio = cierreAnterior
    ? variacion(ultimo.saldoTotal, cierreAnterior.total)
    : null;

  const cifras = [
    { etiqueta: `Saldo a ${ultimo.periodo}`, valor: formatMagnitud(ultimo.saldoTotal), destacar: true },
    { etiqueta: "Externa", valor: formatMagnitud(ultimo.saldoExterna) },
    { etiqueta: "Interna", valor: formatMagnitud(ultimo.saldoInterna) },
    ultimoAnio?.pctPib != null
      ? { etiqueta: `Del PIB al cierre de ${ultimoAnio.anio}`, valor: `${ultimoAnio.pctPib.toFixed(1)} %` }
      : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);

  return (
    <div className="space-y-5">
      <Portada
        rotulo={`Deuda del Sector Público No Financiero · Crédito Público · ${ultimo.fecha ? formatFecha(ultimo.fecha) : ultimo.periodo}`}
        titulo="¿Cuánto debe el Estado y cómo ha crecido?"
        descripcion={
          <>
            Lo que deben el Gobierno central y el resto del sector público no
            financiero, en dólares, al cierre de cada período.
            {cambioEnElAnio && cierreAnterior && (
              <>
                {" "}En lo que va de {Number(cierreAnterior.anio) + 1} el saldo cambió{" "}
                <span className="font-medium text-canvas">{conSigno(cambioEnElAnio.abs)}</span>{" "}
                desde el 31 de diciembre de {cierreAnterior.anio}.
              </>
            )}
          </>
        }
        aviso={
          ultimo.desdeInstantanea
            ? `Instantánea verificada el ${formatFecha(generadoEn)}: el servidor del origen no acepta lecturas desde la nube`
            : undefined
        }
      >
        <PortadaCifras>
          {cifras.map((c) => (
            <PortadaCifra key={c.etiqueta} etiqueta={c.etiqueta} valor={c.valor} destacar={c.destacar} />
          ))}
        </PortadaCifras>
      </Portada>

      {anual.length > 0 && primerAnio && ultimoAnio && (
        <Card as="section" className="p-5 sm:p-6">
          <CardTitle>Al cierre de cada año</CardTitle>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Saldo total al 31 de diciembre, {primerAnio.anio}–{ultimoAnio.anio}: de{" "}
            {formatMagnitud(primerAnio.total)} a {formatMagnitud(ultimoAnio.total)}.
            {primerAnio.pctPib != null && ultimoAnio.pctPib != null && (
              <>
                {" "}Medida contra la economía, pasó del {primerAnio.pctPib.toFixed(1)} % al{" "}
                {ultimoAnio.pctPib.toFixed(1)} % del PIB.
              </>
            )}
          </p>
          <SerieTemporal
            forma="linea"
            formato="usd-millones"
            etiqueta={`Deuda al cierre de cada año, de ${formatMagnitud(primerAnio.total)} en ${primerAnio.anio} a ${formatMagnitud(ultimoAnio.total)} en ${ultimoAnio.anio}`}
            puntos={anual.map((a, i) => ({
              clave: String(a.anio),
              valor: a.total,
              lectura: `${a.anio}: ${formatMagnitud(a.total)}${a.pctPib != null ? ` · ${a.pctPib.toFixed(1)} % del PIB` : ""}`,
              marca: i === 0 || i === anual.length - 1 || a.anio % 5 === 0 ? String(a.anio) : undefined,
            }))}
          />
          <Plegable
            className="-mx-5 mt-4 border-t border-hairline sm:-mx-6"
            etiqueta={`Ver los ${anual.length} años en una tabla`}
            etiquetaCerrar="Ocultar la tabla"
          >
            <div className="px-5 py-3 sm:px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Año</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Externa</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Interna</TableHead>
                    <TableHead className="text-right">% del PIB</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...anual].reverse().map((a) => (
                    <TableRow key={a.anio}>
                      <TableCell className="font-mono tabular-nums">{a.anio}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatMagnitud(a.total)}</TableCell>
                      <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">{formatMagnitud(a.externa)}</TableCell>
                      <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">{formatMagnitud(a.interna)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {a.pctPib != null ? `${a.pctPib.toFixed(1)} %` : SIN_DATO}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Plegable>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        {trimestral.length > 1 && (
          <Card as="section" className="p-5 sm:p-6 lg:col-span-3">
            <CardTitle>Trimestre a trimestre</CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Saldo al cierre de cada trimestre, {periodoDeFecha(trimestral[0].fecha)} a{" "}
              {periodoDeFecha(trimestral[trimestral.length - 1].fecha)}. Es lo que el
              origen conserva publicado: de los años cerrados solo quedan los
              trimestres.
            </p>
            <SerieTemporal
              forma="linea"
              formato="usd-millones"
              etiqueta={`Deuda al cierre de cada trimestre, de ${formatMagnitud(trimestral[0].total)} a ${formatMagnitud(trimestral[trimestral.length - 1].total)}`}
              puntos={trimestral.map((c, i) => ({
                clave: c.fecha,
                valor: c.total,
                lectura: `${formatFecha(c.fecha)}: ${formatMagnitud(c.total)}`,
                marca:
                  i === 0 ||
                  i === trimestral.length - 1 ||
                  (c.fecha.endsWith("12-31") &&
                    Number(c.fecha.slice(0, 4)) % 3 === 0 &&
                    i > 4 &&
                    i < trimestral.length - 6)
                    ? c.fecha.slice(0, 4)
                    : undefined,
              }))}
            />
          </Card>
        )}

        <Card as="section" className="p-5 sm:p-6 lg:col-span-2">
          <CardTitle>Los últimos cierres</CardTitle>
          <p className="mt-1 text-xs text-ink-soft">
            Cada cierre contra el anterior publicado.
          </p>
          <ol className="mt-3 divide-y divide-hairline text-sm">
            {recientes.map((c) => (
              <li key={c.fecha} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block font-mono tabular-nums">{formatFecha(c.fecha)}</span>
                  <span className="block text-xs text-ink-soft">
                    {previoDe(c)
                      ? `${cambio(c.total, previoDe(c)!.total)} desde ${periodoDeFecha(previoDe(c)!.fecha)}`
                      : "primer cierre publicado"}
                  </span>
                </span>
                <span className="shrink-0 font-mono font-semibold tabular-nums">
                  {formatMagnitud(c.total)}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <SubastasDeuda />

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle>Cómo leer estas cifras</CardTitle>
        <dl className="mt-3 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="rotulo text-ink-soft">Sector Público No Financiero</dt>
            <dd className="text-ink-soft">
              El Gobierno central más las instituciones y empresas públicas que no
              son bancos. No incluye la deuda del Banco Central.
            </dd>
          </div>
          <div>
            <dt className="rotulo text-ink-soft">Externa e interna</dt>
            <dd className="text-ink-soft">
              Externa es la que se debe a acreedores de fuera: organismos como el
              BID, otros países, bonos vendidos afuera. Interna, la que se debe
              dentro del país. Toda se expresa en dólares.
            </dd>
          </div>
          <div>
            <dt className="rotulo text-ink-soft">% del PIB</dt>
            <dd className="text-ink-soft">
              La deuda dividida entre todo lo que produjo la economía ese año: dice
              cuánto pesa, no solo cuánto es.
            </dd>
          </div>
          <div>
            <dt className="rotulo text-ink-soft">Cifras preliminares</dt>
            <dd className="text-ink-soft">
              El origen las marca así: un cierre reciente puede corregirse cuando
              se publica el siguiente.
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-ink-soft">
          Fuente: Dirección General de Crédito Público del Ministerio de Hacienda
          y Economía. Los cierres salen de la hoja «Saldo Evolución Deuda del
          Sector Público No Financiero» de cada período, columna del saldo de
          cierre; los años, del archivo «Saldo Deuda Histórico», metodología
          nueva. El origen no conserva los meses intermedios de años pasados, y
          su servidor no acepta conexiones desde la nube: la serie es una
          instantánea generada el {formatFecha(generadoEn)} con{" "}
          <span className="font-mono">python3 scripts/build-deuda.py</span>.
        </p>
      </Card>
    </div>
  );
}
