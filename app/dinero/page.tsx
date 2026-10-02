import type { Metadata } from "next";
import Link from "next/link";
import {
  getBalanceBcrd,
  getOperacionesMonetarias,
  getPoliticaMonetaria,
  getTasasActivas,
  getTasasPasivas,
  mesLargo,
  ultimaTasa,
} from "@/lib/banco-central";
import { getBcrd, mesEnPalabras } from "@/lib/bcrd";
import { getTenedores, GRUPOS, repartoDelMes } from "@/lib/tenedores";
import { formatFecha, formatMagnitud, formatMes, SIN_DATO } from "@/lib/format";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";
import { EstadoVacio } from "@/components/estado-vacio";
import { Termino } from "@/components/termino";
import { IconArrowRight } from "@/components/icons";
import { IndicadoresBanca } from "@/components/fuentes-nuevas/indicadores-banca";
import { EscaleraTasas, mesComun } from "@/components/dinero/escalera-tasas";
import { RepartoTenedores } from "@/components/dinero/reparto-tenedores";
import { decimal, parte, pesosDeMillones, porciento } from "@/components/dinero/formato";

export const metadata: Metadata = {
  alternates: { canonical: "/dinero" },
  title: "El costo del dinero",
  description:
    "Cuánto cuesta el dinero en la República Dominicana: la tasa del Banco Central, lo que cobran los bancos por prestar y pagan por el ahorro, quién le presta al Estado y qué hace el Banco Central cada día. Con sus fuentes oficiales.",
};

/** Las hojas del BCRD se rehacen a diario; cada lectura guarda su propia caché. */
export const revalidate = 3600;

export default async function DineroPage() {
  const [politica, activas, pasivas, balance, operaciones, bcrd, tenedores] = await Promise.all([
    getPoliticaMonetaria(),
    getTasasActivas(),
    getTasasPasivas(),
    getBalanceBcrd(),
    getOperacionesMonetarias(),
    getBcrd(),
    getTenedores(),
  ]);

  if (!politica && !activas && !pasivas && !balance && !tenedores) {
    return (
      <EstadoVacio
        variante="caida"
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="No pudimos leer al Banco Central ni a Crédito Público"
        accion={
          <Button asChild variant="secondary">
            <Link href="/dinero/guia">Leer cómo funciona el dinero</Link>
          </Button>
        }
      >
        Los archivos del Banco Central no contestaron y la instantánea de Crédito Público no está. La guía,
        que no depende de ninguna fuente, sigue en pie.
      </EstadoVacio>
    );
  }

  const activa = ultimaTasa(activas, "ponderado");
  const pasiva = ultimaTasa(pasivas, "ponderado");
  const ipc = bcrd?.ipc.ultimo ?? null;
  const mes = mesComun(activas, pasivas);

  const valores = balance?.series.valoresEnCirculacion;
  const reservas = balance?.series.reservasBrutas;
  const ultimoDia = operaciones?.dias.at(-1) ?? null;

  const t = tenedores?.tenedores;
  const reparto = t ? repartoDelMes(t, t.meses.length - 1) : [];
  const deudaTotal = tenedores?.acreedores.total.at(-1);
  const corteAcreedores = tenedores?.acreedores.cortes.at(-1);

  const pasivaReal = pasiva && ipc ? pasiva.valor - ipc[2] : null;

  return (
    <div className="space-y-5">
      <Portada
        rotulo="Banco Central · Superintendencia de Bancos · Crédito Público"
        titulo="¿Cuánto cuesta el dinero en la República Dominicana?"
        descripcion={
          <>
            El Banco Central fija una tasa de referencia; los bancos cobran más que eso por prestar y pagan menos
            por guardar tu dinero; y el Estado, cuando le falta, vende bonos a quien quiera prestarle. Aquí están
            las tres cosas con sus cifras de hoy y de dónde salen.
          </>
        }
      >
        <PortadaCifras>
          <PortadaCifra
            destacar
            etiqueta={
              politica?.cambios[0] ? `Tasa del Banco Central desde ${mesLargo(politica.cambios[0].periodo)}` : "Tasa del Banco Central"
            }
            valor={porciento(politica?.vigente.tpm)}
          />
          <PortadaCifra
            etiqueta={activa ? `Por prestar, ${formatMes(activa.periodo)}` : "Por prestar"}
            valor={porciento(activa?.valor)}
          />
          <PortadaCifra
            etiqueta={pasiva ? `Por un depósito a plazo, ${formatMes(pasiva.periodo)}` : "Por un depósito a plazo"}
            valor={porciento(pasiva?.valor)}
          />
          <PortadaCifra
            etiqueta={ipc ? `Inflación en 12 meses, ${formatMes(ipc[0])}` : "Inflación en 12 meses"}
            valor={ipc ? porciento(ipc[2]) : SIN_DATO}
          />
        </PortadaCifras>
      </Portada>

      {mes && (
        <Card as="section" className="p-5 sm:p-6">
          <CardTitle>¿Cuánto cuesta el dinero según quién lo pide?</CardTitle>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Las tasas de un mismo mes, de la más baja a la más alta. Abajo, lo que el banco te paga a ti; arriba,
            lo que te cobra. La diferencia es su negocio.
          </p>
          <EscaleraTasas politica={politica} activas={activas} pasivas={pasivas} />
          {pasivaReal !== null && ipc && (
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              Con los precios subiendo {porciento(ipc[2])} al año ({mesEnPalabras(ipc[0])}), un depósito a plazo
              al {porciento(pasiva!.valor)} gana más o menos {decimal(pasivaReal, 1)} puntos por encima de la
              inflación: es su <Termino clave="tasaReal">tasa real</Termino>, una resta aproximada que hace
              Socrático.
            </p>
          )}
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link href="/dinero/tasas">
                Todas las tasas, mes a mes
                <IconArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {t && reparto.length > 0 && (
          <Card as="section" className="flex flex-col p-5 sm:p-6">
            <CardTitle>¿Quién le presta al Estado en pesos?</CardTitle>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              Quién tenía, en {mesEnPalabras(t.meses.at(-1)!)}, los {pesosDeMillones(t.total.at(-1)!)} en{" "}
              <Termino clave="bono">bonos</Termino> internos del Estado. El mayor{" "}
              <Termino clave="tenedor">tenedor</Termino>: {GRUPOS[reparto[0].grupo].nombre.toLowerCase()}, con el{" "}
              {parte(reparto[0].parte)}.
            </p>
            <RepartoTenedores t={t} compacto />
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              Relación de tenedores de Crédito Público, según el registro de{" "}
              <Termino clave="cevaldom">CEVALDOM</Termino>. La agrupación en familias es de Socrático.
              Instantánea del {formatFecha(tenedores!.generado)}.
              {deudaTotal != null && corteAcreedores && (
                <>
                  {" "}Toda la deuda del sector público, interna y externa, sumaba{" "}
                  {formatMagnitud(deudaTotal)} a {corteAcreedores.etiqueta.replace("*", "")}.
                </>
              )}
            </p>
            <div className="mt-auto pt-4">
              <Button asChild variant="outline">
                <Link href="/dinero/bonos">
                  Quién compra los bonos y a quién le debe el Estado
                  <IconArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Card>
        )}

        {(valores || reservas || ultimoDia) && (
          <Card as="section" className="flex flex-col p-5 sm:p-6">
            <CardTitle>¿Qué hace el Banco Central?</CardTitle>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              Cuida el valor del peso: emite los billetes, guarda las reservas en dólares y, cada día, recoge o
              presta pesos a los bancos para que la tasa de corto plazo se acerque a la suya.
            </p>
            <TiraDeCifras className="-mx-5 mt-4 sm:-mx-6 sm:grid-cols-1 sm:divide-x-0 sm:divide-y lg:grid-cols-1">
              {reservas && (
                <Cifra
                  etiqueta={<Termino clave="reservasInternacionales">Reservas internacionales</Termino>}
                  valor={formatMagnitud(reservas.dia?.valor ?? reservas.meses.at(-1)!.valor)}
                  nota={reservas.dia ? `al ${formatFecha(reservas.dia.fecha)}` : mesLargo(reservas.meses.at(-1)!.periodo)}
                />
              )}
              {valores && (
                <Cifra
                  etiqueta={<Termino clave="valoresBcrd">Sus propios títulos vendidos</Termino>}
                  valor={pesosDeMillones(valores.dia?.valor ?? valores.meses.at(-1)!.valor)}
                  nota={`deuda del Banco Central, ${valores.dia ? `al ${formatFecha(valores.dia.fecha)}` : mesLargo(valores.meses.at(-1)!.periodo)}`}
                />
              )}
              {ultimoDia && (
                <Cifra
                  etiqueta={<Termino clave="contraccion">Pesos que recogió en un día</Termino>}
                  valor={pesosDeMillones(ultimoDia.contraccion)}
                  nota={`${formatFecha(ultimoDia.fecha)}; prestó ${pesosDeMillones(ultimoDia.expansion)}`}
                />
              )}
            </TiraDeCifras>
            <div className="mt-auto pt-4">
              <Button asChild variant="outline">
                <Link href="/dinero/banco-central">
                  El Banco Central por dentro
                  <IconArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Card>
        )}
      </div>

      <div className="space-y-2">
        <IndicadoresBanca />
        <p className="text-sm text-ink-soft">
          Cada entidad, con su supervisor y su registro:{" "}
          <Link href="/banca" className="font-medium text-brand-700 hover:underline">
            bancos, cooperativas, AFP y aseguradoras
          </Link>
          .
        </p>
      </div>

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle>¿Primera vez con estas palabras?</CardTitle>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Qué es la tasa de política monetaria, por qué el Banco Central vende títulos, qué es un bono y por qué
          tus ahorros de pensión terminan prestados al Estado: la guía lo cuenta en llano, con un ejemplo en
          cada paso.
        </p>
        <div className="mt-4">
          <Button asChild>
            <Link href="/dinero/guia">
              Cómo funciona el dinero
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
