import type { Metadata } from "next";
import Link from "next/link";
import {
  getPoliticaMonetaria,
  getTasasActivas,
  getTasasPasivas,
  mesLargo,
  serieTasa,
  ultimaTasa,
  valorEn,
  URL_ACTIVAS,
  URL_PASIVAS,
  URL_TPM,
  type ClaveActiva,
  type ClavePasiva,
  type PuntoMes,
  type SerieTasas,
} from "@/lib/banco-central";
import { getBcrd } from "@/lib/bcrd";
import { formatMes, SIN_DATO } from "@/lib/format";
import { puntos } from "@/lib/cifras";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Plegable from "@/components/plegable";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";
import { EstadoVacio } from "@/components/estado-vacio";
import { Termino } from "@/components/termino";
import { BarrasHorizontales, Multiples, SerieTemporal, maximoComun, type Barra, type Punto } from "@/components/graficos";
import { EscaleraTasas } from "@/components/dinero/escalera-tasas";
import { decimal, enPuntos, porciento } from "@/components/dinero/formato";

export const metadata: Metadata = {
  alternates: { canonical: "/dinero/tasas" },
  title: "Tasas de interés",
  description:
    "Las tasas de interés en pesos de la República Dominicana: la tasa de política monetaria del Banco Central desde 2013, lo que cobran los bancos múltiples por prestar y lo que pagan por el ahorro, mes a mes desde 2017, por destino y por plazo.",
};

export const revalidate = 3600;

/** Una serie mensual como puntos de línea, con marca en enero de los años pares. */
function aPuntos(serie: PuntoMes[], nombre: string): Punto[] {
  return serie.map((p, i) => ({
    clave: p.periodo,
    valor: p.valor,
    lectura: `${formatMes(p.periodo)}: ${nombre} ${porciento(p.valor)}`,
    marca:
      i === 0 || i === serie.length - 1 || (p.periodo.endsWith("-01") && Number(p.periodo.slice(0, 4)) % 2 === 0 && i > 6 && i < serie.length - 8)
        ? p.periodo.slice(0, 4)
        : undefined,
  }));
}

/** El mismo mes un año antes. */
const haceUnAnio = (p: string) => `${Number(p.slice(0, 4)) - 1}${p.slice(4)}`;

function Comparacion({ actual, anterior }: { actual: number; anterior: number | undefined }) {
  if (anterior === undefined) return <>Sin el mismo mes del año anterior para comparar.</>;
  const d = actual - anterior;
  return (
    <>
      Hace un año: {porciento(anterior)} ({Math.abs(d) < 0.05 ? "prácticamente igual" : `${d > 0 ? "subió" : "bajó"} ${enPuntos(d)}`}).
    </>
  );
}

function barrasDe<K extends string>(
  s: SerieTasas<K>,
  claves: { k: K; etiqueta: string; detalle: string }[],
): { mes: string; barras: Barra[] } | null {
  const ultimo = s.meses.at(-1);
  if (!ultimo) return null;
  const previo = s.meses.find((m) => m.periodo === haceUnAnio(ultimo.periodo));
  const barras: Barra[] = [];
  for (const { k, etiqueta, detalle } of claves) {
    const v = ultimo.valores[k];
    if (v === undefined) continue;
    barras.push({
      clave: k,
      etiqueta,
      titulo: `${etiqueta}: ${porciento(v)}`,
      valor: v,
      cifra: porciento(v),
      detalle: (
        <>
          {detalle} <Comparacion actual={v} anterior={previo?.valores[k]} />
        </>
      ),
    });
  }
  return { mes: ultimo.periodo, barras };
}

export default async function TasasPage() {
  const [politica, activas, pasivas, bcrd] = await Promise.all([
    getPoliticaMonetaria(),
    getTasasActivas(),
    getTasasPasivas(),
    getBcrd(),
  ]);

  if (!politica && !activas && !pasivas) {
    return (
      <EstadoVacio
        variante="caida"
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="No pudimos leer las tasas del Banco Central"
        accion={
          <Button asChild variant="secondary">
            <a href="https://www.bancentral.gov.do/a/d/2536-sector-monetario-y-financiero" target="_blank" rel="noopener noreferrer">
              Ir a las estadísticas del Banco Central
            </a>
          </Button>
        }
      >
        Ninguno de los tres archivos del Banco Central contestó. La guía y el resto de la vertical siguen en pie.
      </EstadoVacio>
    );
  }

  const activa = ultimaTasa(activas, "ponderado");
  const pasiva = ultimaTasa(pasivas, "ponderado");
  const interbancaria = ultimaTasa(pasivas, "interbancaria");
  const parcial = activas?.parcial ?? pasivas?.parcial ?? null;
  const ipc = bcrd?.ipc.ultimo ?? null;

  const serieActiva = activas ? serieTasa(activas, "ponderado") : [];
  const seriePasiva = pasivas ? serieTasa(pasivas, "ponderado") : [];
  const maxComun = maximoComun([serieActiva.map((p) => p.valor), seriePasiva.map((p) => p.valor)]);

  const porDestino = activas
    ? barrasDe<ClaveActiva>(activas, [
        { k: "consumo", etiqueta: "Préstamos personales y de consumo", detalle: "Para gastos personales." },
        { k: "ponderado", etiqueta: "Todos los préstamos, en promedio", detalle: "Ponderado por lo que se prestó." },
        { k: "comercio", etiqueta: "Préstamos al comercio", detalle: "Para negocios." },
        { k: "hipotecario", etiqueta: "Préstamos para vivienda", detalle: "Hipotecarios y de desarrollo." },
        { k: "preferencial", etiqueta: "A los clientes preferenciales", detalle: "Lo que cobran a quienes más negocio les dan." },
      ])
    : null;
  const porPlazo = pasivas
    ? barrasDe<ClavePasiva>(pasivas, [
        { k: "a30", etiqueta: "Depósito a 30 días o menos", detalle: "" },
        { k: "a90", etiqueta: "De 61 a 90 días", detalle: "" },
        { k: "a360", etiqueta: "De 181 a 360 días", detalle: "" },
        { k: "a2anios", etiqueta: "De un año a dos", detalle: "" },
        { k: "a5anios", etiqueta: "De dos a cinco años", detalle: "" },
        { k: "ponderado", etiqueta: "Todos los plazos, en promedio", detalle: "Ponderado por lo depositado." },
        { k: "ahorros", etiqueta: "Una cuenta de ahorro", detalle: "Dinero que puedes sacar cuando quieras." },
      ])
    : null;

  // La tabla: los últimos 36 meses cerrados, del más reciente al más viejo.
  const meses = (activas?.meses ?? pasivas?.meses ?? []).slice(-36).map((m) => m.periodo).reverse();
  const valorDe = <K extends string>(s: SerieTasas<K> | null, p: string, k: K) =>
    s?.meses.find((m) => m.periodo === p)?.valores[k];

  return (
    <div className="space-y-5">
      <Portada
        rotulo="Banco Central de la República Dominicana · tasas en pesos de los bancos múltiples"
        titulo="¿Cuánto cobran los bancos por prestar y cuánto pagan por tu ahorro?"
        descripcion={
          <>
            Lo que cobran por prestar es la <Termino clave="tasaActiva">tasa activa</Termino>; lo que pagan por tu
            dinero, la <Termino clave="tasaPasiva">tasa pasiva</Termino>. Las dos se mueven detrás de la{" "}
            <Termino clave="tpm">tasa de política monetaria</Termino>, la que fija el Banco Central.
          </>
        }
        aviso={
          parcial
            ? `${mesLargo(parcial.periodo)} va${parcial.hastaElDia ? ` por el día ${parcial.hastaElDia}` : " en curso"}: su promedio es parcial y aquí no se cuenta como mes cerrado`
            : undefined
        }
      >
        <PortadaCifras>
          <PortadaCifra
            destacar
            etiqueta={politica?.cambios[0] ? `Tasa del Banco Central desde ${mesLargo(politica.cambios[0].periodo)}` : "Tasa del Banco Central"}
            valor={porciento(politica?.vigente.tpm)}
          />
          <PortadaCifra etiqueta={activa ? `Por prestar, ${formatMes(activa.periodo)}` : "Por prestar"} valor={porciento(activa?.valor)} />
          <PortadaCifra etiqueta={pasiva ? `Por un depósito, ${formatMes(pasiva.periodo)}` : "Por un depósito"} valor={porciento(pasiva?.valor)} />
          <PortadaCifra
            etiqueta={interbancaria ? `Entre bancos, ${formatMes(interbancaria.periodo)}` : "Entre bancos"}
            valor={porciento(interbancaria?.valor)}
          />
        </PortadaCifras>
      </Portada>

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle>La escalera de las tasas</CardTitle>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Todas del mismo mes, de la más baja a la más alta.
        </p>
        <EscaleraTasas politica={politica} activas={activas} pasivas={pasivas} />
      </Card>

      {politica && (
        <Card as="section" className="p-5 sm:p-6">
          <CardTitle>¿Cómo se ha movido la tasa del Banco Central?</CardTitle>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Mes a mes desde {mesLargo(politica.serie[0].periodo)}, cuando pasó a ser la tasa de referencia que es
            hoy. Cambió en {politica.cambios.length} meses distintos; la última vez, en {mesLargo(politica.cambios[0]?.periodo ?? politica.vigente.periodo)}
            {politica.cambios[0] ? `, de ${porciento(politica.cambios[0].antes)} a ${porciento(politica.cambios[0].despues)}` : ""}.
          </p>
          <SerieTemporal
            forma="linea"
            formato="porciento"
            etiqueta={`Tasa de política monetaria, de ${porciento(politica.serie[0].valor)} en ${mesLargo(politica.serie[0].periodo)} a ${porciento(politica.vigente.tpm)} en ${mesLargo(politica.vigente.periodo)}`}
            puntos={aPuntos(politica.serie, "TPM")}
          />
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Junto a ella, el Banco Central fija dos ventanillas permanentes para los bancos: les paga{" "}
            {porciento(politica.vigente.deposito)} por el dinero que le dejan un día y les cobra{" "}
            {porciento(politica.vigente.prestamo)} por el que les presta un día. Las anuncia en sus{" "}
            <a
              href="https://www.bancentral.gov.do/a/d/2576-comunicados-de-politica-monetaria"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-700 hover:underline"
            >
              comunicados de política monetaria
            </a>
            .
          </p>
          <Plegable
            className="-mx-5 mt-4 border-t border-hairline sm:-mx-6"
            etiqueta={`Ver los ${politica.cambios.length} cambios en una tabla`}
            etiquetaCerrar="Ocultar la tabla"
          >
            <div className="px-5 py-3 sm:px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead className="text-right">Antes</TableHead>
                    <TableHead className="text-right">Después</TableHead>
                    <TableHead className="text-right">Cambio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {politica.cambios.map((c) => (
                    <TableRow key={c.periodo}>
                      <TableCell className="font-mono tabular-nums">{formatMes(c.periodo)}</TableCell>
                      <TableCell numerica>{porciento(c.antes)}</TableCell>
                      <TableCell numerica>{porciento(c.despues)}</TableCell>
                      <TableCell numerica>{puntos(c.despues, c.antes)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Plegable>
        </Card>
      )}

      {(serieActiva.length > 0 || seriePasiva.length > 0) && (
        <Card as="section" className="p-5 sm:p-6">
          <CardTitle>¿Y lo que cobran y pagan los bancos?</CardTitle>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Promedio ponderado de cada mes desde 2017, las dos en la misma escala para que se comparen.
          </p>
          <Multiples className="mt-2">
            {serieActiva.length > 0 && (
              <figure>
                <figcaption className="text-sm font-semibold">Por prestar</figcaption>
                <SerieTemporal
                  forma="linea"
                  formato="porciento"
                  maximo={maxComun}
                  alto="bajo"
                  className="mt-2"
                  etiqueta={`Tasa activa promedio, de ${porciento(serieActiva[0].valor)} en ${mesLargo(serieActiva[0].periodo)} a ${porciento(serieActiva.at(-1)!.valor)} en ${mesLargo(serieActiva.at(-1)!.periodo)}`}
                  puntos={aPuntos(serieActiva, "por prestar")}
                />
              </figure>
            )}
            {seriePasiva.length > 0 && (
              <figure>
                <figcaption className="text-sm font-semibold">Por un depósito a plazo</figcaption>
                <SerieTemporal
                  forma="linea"
                  formato="porciento"
                  maximo={maxComun}
                  alto="bajo"
                  className="mt-2"
                  etiqueta={`Tasa pasiva promedio, de ${porciento(seriePasiva[0].valor)} en ${mesLargo(seriePasiva[0].periodo)} a ${porciento(seriePasiva.at(-1)!.valor)} en ${mesLargo(seriePasiva.at(-1)!.periodo)}`}
                  puntos={aPuntos(seriePasiva, "por un depósito")}
                />
              </figure>
            )}
          </Multiples>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {porDestino && (
          <Card as="section" className="p-5 sm:p-6">
            <CardTitle>¿Para qué es el préstamo?</CardTitle>
            <p className="mt-1 text-sm text-ink-soft">
              Tasa activa de {mesLargo(porDestino.mes)} según el destino, contra el mismo mes del año anterior.
            </p>
            <BarrasHorizontales
              barras={porDestino.barras}
              etiqueta={`Tasa de los préstamos por destino, ${mesLargo(porDestino.mes)}`}
              filas
              className="-mx-5 mt-3 border-t border-hairline sm:-mx-6"
            />
          </Card>
        )}
        {porPlazo && (
          <Card as="section" className="p-5 sm:p-6">
            <CardTitle>¿Por cuánto tiempo dejas tu dinero?</CardTitle>
            <p className="mt-1 text-sm text-ink-soft">
              Tasa pasiva de {mesLargo(porPlazo.mes)} según el plazo del certificado o depósito.
            </p>
            <BarrasHorizontales
              barras={porPlazo.barras}
              etiqueta={`Tasa de los depósitos por plazo, ${mesLargo(porPlazo.mes)}`}
              filas
              className="-mx-5 mt-3 border-t border-hairline sm:-mx-6"
            />
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              Un plazo más largo no siempre paga más: el promedio de cada plazo depende de qué bancos captaron ese
              mes y por cuánto.
            </p>
          </Card>
        )}
      </div>

      {meses.length > 0 && (
        <Card as="section" className="p-5 sm:p-6">
          <CardTitle>Mes a mes</CardTitle>
          <p className="mt-1 text-sm text-ink-soft">
            Los últimos {meses.length} meses cerrados. El margen es la resta de las dos tasas de los bancos; la
            tasa real del depósito resta la inflación de doce meses del mismo mes. Las dos restas las hace
            Socrático.
          </p>
          <Plegable
            className="-mx-5 mt-4 border-t border-hairline sm:-mx-6"
            etiqueta={`Ver los ${meses.length} meses en una tabla`}
            etiquetaCerrar="Ocultar la tabla"
          >
            <div className="px-5 py-3 sm:px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead className="text-right">Banco Central</TableHead>
                    <TableHead className="text-right">Entre bancos</TableHead>
                    <TableHead className="text-right">Depósito</TableHead>
                    <TableHead className="text-right">Préstamo</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Margen, en puntos</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Depósito real, en puntos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meses.map((p) => {
                    const tpm = politica ? valorEn(politica.serie, p)?.valor : undefined;
                    const inter = valorDe(pasivas, p, "interbancaria");
                    const dep = valorDe(pasivas, p, "ponderado");
                    const pre = valorDe(activas, p, "ponderado");
                    const inf = bcrd?.ipc.serie.find((m) => m[0] === p)?.[2];
                    return (
                      <TableRow key={p}>
                        <TableCell className="font-mono tabular-nums">{formatMes(p)}</TableCell>
                        <TableCell numerica>{porciento(tpm)}</TableCell>
                        <TableCell numerica>{porciento(inter)}</TableCell>
                        <TableCell numerica>{porciento(dep)}</TableCell>
                        <TableCell numerica>{porciento(pre)}</TableCell>
                        <TableCell numerica className="hidden sm:table-cell">
                          {pre !== undefined && dep !== undefined ? decimal(pre - dep) : SIN_DATO}
                        </TableCell>
                        <TableCell numerica className="hidden sm:table-cell">
                          {dep !== undefined && inf !== undefined ? `${dep - inf >= 0 ? "" : "−"}${decimal(Math.abs(dep - inf))}` : SIN_DATO}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Plegable>
          {ipc && (
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              Inflación: índice de precios al consumidor del Banco Central, variación de doce meses
              {` (${porciento(ipc[2])} en ${mesLargo(ipc[0])})`}.
            </p>
          )}
        </Card>
      )}

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle>De dónde salen estas cifras</CardTitle>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
          <li>
            <a href={URL_TPM} className="font-medium text-brand-700 hover:underline">Serie de la tasa de política monetaria</a>{" "}
            del Banco Central, con sus facilidades de depósito y de préstamo. Antes de febrero de 2013 la tasa
            funcionaba de otra forma y no se pinta.
          </li>
          <li>
            Tasas{" "}
            <a href={URL_ACTIVAS} className="font-medium text-brand-700 hover:underline">activas</a> y{" "}
            <a href={URL_PASIVAS} className="font-medium text-brand-700 hover:underline">pasivas</a> en moneda nacional
            de los bancos múltiples, promedio ponderado en % nominal anual, desde 2017. Son solo los bancos
            múltiples: no incluyen asociaciones, bancos de ahorro y crédito ni cooperativas. El mes en curso es un promedio de los días que van y aquí no se
            cuenta como cerrado.
          </li>
          <li>
            Los archivos se leen del servidor público del Banco Central y se guardan seis horas. Las cifras recientes
            son preliminares: el Banco Central puede corregirlas.
          </li>
        </ul>
        <p className="mt-3 text-sm">
          <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
            Todas las fuentes y sus límites
          </Link>
        </p>
      </Card>
    </div>
  );
}
