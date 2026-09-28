import {
  getBcrd,
  mesCorto,
  mesEnPalabras,
  mismoMesAnterior,
  type MesIpc,
  type MesLlegadas,
} from "@/lib/bcrd";
import { puntos, variacion } from "@/lib/cifras";
import { formatFecha, SIN_DATO } from "@/lib/format";
import { MatrizMensual, SerieTemporal, VerComoTabla, type FilaMatriz } from "@/components/graficos";
import { Cifra, TiraDeCifras } from "@/components/papel";
import Plegable from "@/components/plegable";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconChartBar, IconExternal } from "@/components/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * La inflación interanual y las llegadas de pasajeros por vía aérea, del Banco
 * Central (`lib/bcrd.ts`, instantánea de `scripts/build-bcrd.py`: los archivos
 * son `.xls` viejos que la plataforma no lee en vivo).
 *
 * Componente de servidor. Si la instantánea falta, no pinta nada: una tarjeta
 * vacía no dice más que su ausencia. Las barras de 36 meses se leen también en
 * una tabla desplegable, porque el `<title>` de una barra exige apuntar.
 */

const decimal = (n: number, d: number) =>
  n.toLocaleString("es-DO", { minimumFractionDigits: d, maximumFractionDigits: d });
const entero = (n: number) => n.toLocaleString("es-DO", { maximumFractionDigits: 0 });
const porciento = (n: number) => `${decimal(n, 2)} %`;
const mayuscula = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

/** «subió 1.4 pp» / «bajó 0.3 pp» / «prácticamente igual», sin inventar un «%». */
function cambioEnPuntos(actual: number, anterior: number) {
  const d = actual - anterior;
  if (Math.abs(d) < 0.05) return "prácticamente igual";
  return `${d > 0 ? "subió" : "bajó"} ${puntos(actual, anterior).slice(1)}`;
}

/** «6.7 % más» / «2.1 % menos» / «prácticamente igual». */
function cambioPct(actual: number, anterior: number | null) {
  const v = variacion(actual, anterior);
  if (v?.pct == null) return null;
  if (Math.abs(v.pct) < 0.05) return "prácticamente igual";
  return `${decimal(Math.abs(v.pct), 1)} % ${v.pct > 0 ? "más" : "menos"}`;
}

function marcaLlegadas(m: MesLlegadas) {
  const partes = [mayuscula(mesEnPalabras(m.periodo))];
  if (m.estimado) partes.push("estimada por el BCRD");
  if (m.preliminar) partes.push("sujeta a rectificación");
  partes.push("instantánea");
  return partes.join(" · ");
}

/** La serie de llegadas, doblada en filas de año con sus doce meses. */
function filasLlegadas(serie: MesLlegadas[]): FilaMatriz[] {
  const porAnio = new Map<number, (number | null)[]>();
  for (const m of serie) {
    const [anio, mes] = m.periodo.split("-").map(Number);
    if (!porAnio.has(anio)) porAnio.set(anio, new Array(12).fill(null));
    porAnio.get(anio)![mes - 1] = m.total;
  }
  return [...porAnio.entries()].sort(([a], [b]) => a - b).map(([anio, valores]) => ({ anio, valores }));
}

function TablaIpc({ serie }: { serie: MesIpc[] }) {
  return (
    <Plegable
      className="-mx-5 mt-3 border-t border-hairline"
      etiqueta={`Ver los ${serie.length} meses en una tabla`}
      etiquetaCerrar="Ocultar la tabla"
    >
      <div className="px-5 py-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mes</TableHead>
              <TableHead className="text-right">Índice</TableHead>
              <TableHead className="text-right">En 12 meses</TableHead>
              <TableHead className="text-right">En el mes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...serie].reverse().map(([p, indice, interanual, mensual]) => (
              <TableRow key={p}>
                <TableCell className="font-mono tabular-nums">{mesCorto(p)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{decimal(indice, 2)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{porciento(interanual)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{porciento(mensual)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Plegable>
  );
}

export async function InflacionTurismo() {
  const d = await getBcrd();
  if (!d) return null;
  const { ipc, turismo } = d;

  const [pIpc, , interanual, mensual] = ipc.ultimo;
  const ipcAntes = ipc.serie.find((m) => m[0] === mismoMesAnterior(pIpc)) ?? null;

  const lleg = turismo.serie.at(-1)!;
  const llegAntes = turismo.serie.find((m) => m.periodo === mismoMesAnterior(lleg.periodo)) ?? null;
  const ac = turismo.acumulado;
  const hasta = mesEnPalabras(`${ac.anio}-${String(ac.hastaMes).padStart(2, "0")}`).split(" ")[0];
  const tramo = ac.hastaMes === 1 ? "enero" : `enero–${hasta}`;

  const marcas = new Set([ipc.serie[0][0], ipc.serie.at(-1)![0]]);
  for (const [p] of ipc.serie) if (p.endsWith("-01")) marcas.add(p);
  const minimo = ipc.serie.reduce((a, b) => (b[2] < a[2] ? b : a));
  const maximo = ipc.serie.reduce((a, b) => (b[2] > a[2] ? b : a));

  return (
    <Card as="section" className="flex h-full flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <IconChartBar className="h-4 w-4 text-ink-soft" />
            ¿Cuánto suben los precios y cuántos turistas llegan?
          </CardTitle>
          <p className="mt-0.5 text-xs text-ink-soft">
            La inflación y las llegadas por avión que publica el Banco Central
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

      <TiraDeCifras className="-mx-5 mt-4 sm:grid-cols-3 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Cifra
            etiqueta="Inflación de los últimos 12 meses"
            valor={porciento(interanual)}
            nota={`${mayuscula(mesEnPalabras(pIpc))} · instantánea`}
          />
          <p className="text-sm leading-snug text-ink-soft">
            {ipcAntes
              ? `En ${mesEnPalabras(ipcAntes[0])} era ${porciento(ipcAntes[2])}: ${cambioEnPuntos(interanual, ipcAntes[2])}.`
              : "La serie no trae el mismo mes del año anterior; aquí no se compara."}
          </p>
          <p className="text-xs leading-snug text-ink-soft">
            Solo en {mesEnPalabras(pIpc).split(" ")[0]}, los precios {mensual >= 0 ? "subieron" : "bajaron"}{" "}
            {porciento(Math.abs(mensual))}.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Cifra
            etiqueta="Pasajeros que llegaron por avión en el mes"
            valor={entero(lleg.total)}
            nota={marcaLlegadas(lleg)}
          />
          <p className="text-sm leading-snug text-ink-soft">
            {llegAntes
              ? `En ${mesEnPalabras(llegAntes.periodo)} fueron ${entero(llegAntes.total)}${
                  cambioPct(lleg.total, llegAntes.total) ? `: ${cambioPct(lleg.total, llegAntes.total)}` : ""
                }.`
              : "La serie no trae el mismo mes del año anterior; aquí no se compara."}
          </p>
          {lleg.noResidentes !== null && (
            <p className="text-xs leading-snug text-ink-soft">
              De ellos, {entero(lleg.noResidentes)} no residentes (los que se cuentan como
              turistas), según el reparto que estima el BCRD.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {ac.valor !== null ? (
            <>
              <Cifra
                etiqueta={`Llegadas por avión, ${tramo} ${ac.anio}`}
                valor={entero(ac.valor)}
                nota={`Acumulado del año${lleg.preliminar ? " · sujeto a rectificación" : ""} · instantánea`}
              />
              <p className="text-sm leading-snug text-ink-soft">
                {ac.anterior !== null
                  ? `En ${tramo} ${ac.anio - 1} fueron ${entero(ac.anterior)}${
                      cambioPct(ac.valor, ac.anterior) ? `: ${cambioPct(ac.valor, ac.anterior)}` : ""
                    }.`
                  : "La serie no trae el mismo tramo del año anterior; aquí no se compara."}
              </p>
            </>
          ) : (
            <Cifra
              etiqueta="Llegadas en lo que va de año"
              valor={SIN_DATO}
              tono="text-ink-soft"
              nota="La serie no trae todos los meses del año; no sumamos lo que falta."
            />
          )}
        </div>
      </TiraDeCifras>

      <h3 className="rotulo mt-4 text-ink-soft">Inflación en 12 meses, mes a mes</h3>
      <SerieTemporal
        forma="linea"
        formato="porciento"
        etiqueta={`Inflación interanual de ${mesEnPalabras(ipc.serie[0][0])} a ${mesEnPalabras(pIpc)}: la más baja, ${porciento(minimo[2])} en ${mesEnPalabras(minimo[0])}; la más alta, ${porciento(maximo[2])} en ${mesEnPalabras(maximo[0])}`}
        puntos={ipc.serie.map(([p, , ia]) => ({
          clave: p,
          valor: ia,
          lectura: `${mayuscula(mesEnPalabras(p))}: ${porciento(ia)} en 12 meses`,
          marca: marcas.has(p) ? mesCorto(p) : undefined,
        }))}
      />
      <TablaIpc serie={ipc.serie} />

      {/*
        Las llegadas tienen temporada: en 36 columnas seguidas el ojo ve una
        sierra; en una matriz mes × año, diciembre y marzo se comparan con su
        mismo mes del año anterior, que es la comparación honesta.
      */}
      <h3 className="rotulo mt-4 text-ink-soft">Llegadas por avión, mes a mes</h3>
      <MatrizMensual
        className="mt-3"
        etiqueta={`Pasajeros llegados por avión cada mes, de ${mesEnPalabras(turismo.serie[0].periodo)} a ${mesEnPalabras(turismo.serie.at(-1)!.periodo)}`}
        filas={filasLlegadas(turismo.serie)}
      />
      <VerComoTabla
        className="-mx-5 sm:-mx-5"
        nombre="meses"
        columnas={[{ titulo: "Mes" }, { titulo: "Llegadas", numerica: true }, { titulo: "No residentes", numerica: true }]}
        filas={[...turismo.serie].reverse().map((m) => ({
          clave: m.periodo,
          celdas: [
            mesCorto(m.periodo),
            entero(m.total),
            m.noResidentes === null ? SIN_DATO : entero(m.noResidentes),
          ],
        }))}
      />

      <p className="mt-auto pt-3 text-xs leading-relaxed text-ink-soft">
        Índice de Precios al Consumidor nacional del Banco Central (base {ipc.base}),
        hasta {mesEnPalabras(ipc.corte)}; la inflación es la variación del índice en 12
        meses y su cambio contra el año anterior va en puntos. Llegadas: {turismo.alcance.toLowerCase()}{" "}
        Hasta {mesEnPalabras(turismo.corte)}; el BCRD marca las cifras del año en curso
        como sujetas a rectificación
        {turismo.repartoEstimado ? " y el reparto entre residentes y no residentes es una estimación suya" : ""}.
        Los archivos del BCRD son hojas de Excel antiguas que no leemos en vivo: esto es
        una instantánea que regenera un script, generada el {formatFecha(d.generado)}.
      </p>
    </Card>
  );
}
