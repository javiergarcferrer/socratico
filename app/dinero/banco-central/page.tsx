import type { Metadata } from "next";
import Link from "next/link";
import {
  getBalanceBcrd,
  getOperacionesMonetarias,
  getPoliticaMonetaria,
  mesLargo,
  URL_INDICADORES_BCRD,
  URL_OPERACIONES,
  type ClaveBalance,
  type PuntoMes,
  type SerieBalance,
} from "@/lib/banco-central";
import { getFuncionarios, personasDeInstitucion } from "@/lib/funcionarios";
import { enlace } from "@/lib/grafo";
import { variacion } from "@/lib/cifras";
import { formatFecha, formatMagnitud, formatMes, SIN_DATO } from "@/lib/format";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";
import { EstadoVacio } from "@/components/estado-vacio";
import { Termino } from "@/components/termino";
import { SerieTemporal, type Punto } from "@/components/graficos";
import { decimal, pesosDeMillones, porciento } from "@/components/dinero/formato";

export const metadata: Metadata = {
  alternates: { canonical: "/dinero/banco-central" },
  title: "El Banco Central por dentro",
  description:
    "Qué hace el Banco Central de la República Dominicana: sus reservas internacionales, los billetes en la calle, los títulos que vende para retirar pesos, lo que recoge y presta a los bancos cada día y quién lo dirige. Con sus archivos oficiales.",
};

export const revalidate = 3600;

/** El Banco Central en el clasificador institucional (`lib/instituciones.ts`). */
const ID_BCRD = 905002;

/** El último saldo de una serie del balance: el del día si lo hay, si no el del mes. */
function ultimo(s: SerieBalance | undefined): { valor: number; cuando: string; periodo: string } | null {
  if (!s) return null;
  if (s.dia) return { valor: s.dia.valor, cuando: `al ${formatFecha(s.dia.fecha)}`, periodo: s.dia.fecha.slice(0, 7) };
  const m = s.meses.at(-1);
  return m ? { valor: m.valor, cuando: mesLargo(m.periodo), periodo: m.periodo } : null;
}

/** El cierre de cada diciembre desde `desde`, y el último mes. */
function anuales(meses: PuntoMes[], desde: number): PuntoMes[] {
  const out = meses.filter((p) => p.periodo.endsWith("-12") && Number(p.periodo.slice(0, 4)) >= desde);
  const fin = meses.at(-1);
  if (fin && out.at(-1)?.periodo !== fin.periodo) out.push(fin);
  return out;
}

function aPuntos(serie: PuntoMes[], escribir: (v: number) => string): Punto[] {
  return serie.map((p, i) => ({
    clave: p.periodo,
    valor: p.valor,
    lectura: `${p.periodo.endsWith("-12") && i < serie.length - 1 ? `Cierre de ${p.periodo.slice(0, 4)}` : formatMes(p.periodo)}: ${escribir(p.valor)}`,
    marca: i === 0 || i === serie.length - 1 || i % 5 === 0 ? p.periodo.slice(0, 4) : undefined,
  }));
}

const AGREGADOS: { k: ClaveBalance; nombre: React.ReactNode; texto: string }[] = [
  { k: "billetesPublico", nombre: "Billetes y monedas en manos del público", texto: "El efectivo en la calle." },
  { k: "m1", nombre: <Termino clave="m1">Dinero para gastar ya (M1)</Termino>, texto: "Efectivo más las cuentas que se usan para pagar." },
  { k: "m2", nombre: <Termino clave="m2">Todo el dinero en pesos (M2)</Termino>, texto: "M1 más ahorros y depósitos a plazo." },
  { k: "baseRestringida", nombre: <Termino clave="baseMonetaria">Base monetaria</Termino>, texto: "Lo que crea el Banco Central directamente." },
  { k: "encajeMN", nombre: <Termino clave="encajeLegal">Encaje de los bancos</Termino>, texto: "Lo que los bancos guardan en el Banco Central, en pesos." },
  { k: "valoresEnCirculacion", nombre: <Termino clave="valoresBcrd">Sus títulos en circulación</Termino>, texto: "Su propia deuda." },
  {
    k: "activosGobierno",
    nombre: "Lo que tiene contra el Gobierno central",
    texto: "Según el archivo: bonos y valores del Gobierno con sus intereses, y cuentas a cobrarle según la Ley 183-02.",
  },
];

export default async function BancoCentralPage() {
  const [balance, operaciones, politica, funcionarios] = await Promise.all([
    getBalanceBcrd(),
    getOperacionesMonetarias(),
    getPoliticaMonetaria(),
    getFuncionarios(),
  ]);

  if (!balance && !operaciones && !politica) {
    return (
      <EstadoVacio
        variante="caida"
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="No pudimos leer los archivos del Banco Central"
        accion={
          <Button asChild variant="secondary">
            <a href="https://www.bancentral.gov.do/a/d/2536-sector-monetario-y-financiero" target="_blank" rel="noopener noreferrer">
              Ir a las estadísticas del Banco Central
            </a>
          </Button>
        }
      >
        Ni su balance, ni sus operaciones diarias, ni su tasa contestaron. La guía de la vertical sigue en pie.
      </EstadoVacio>
    );
  }

  const s = balance?.series ?? {};
  const reservas = ultimo(s.reservasBrutas);
  const billetes = ultimo(s.billetesPublico);
  const valores = ultimo(s.valoresEnCirculacion);
  const dias = operaciones?.dias ?? [];
  const dia = dias.at(-1) ?? null;

  const junta = funcionarios
    ? personasDeInstitucion(funcionarios, ID_BCRD)
        .filter(({ cargo }) => cargo.origen === "bcrd")
        .sort((a, b) => Number(/^Presidente/.test(b.cargo.titulo)) - Number(/^Presidente/.test(a.cargo.titulo)))
    : [];

  const valoresAnuales = s.valoresEnCirculacion ? anuales(s.valoresEnCirculacion.meses, 2004) : [];
  const reservasAnuales = s.reservasBrutas ? anuales(s.reservasBrutas.meses, 2004) : [];

  return (
    <div className="space-y-5">
      <Portada
        rotulo="Banco Central de la República Dominicana · balance y operaciones"
        titulo="¿Qué hace el Banco Central con el dinero del país?"
        descripcion={
          <>
            Su tarea es que los precios suban poco y de forma estable. Para eso emite los billetes, guarda las
            reservas en dólares, fija una tasa de referencia y, cada día, recoge o presta pesos a los bancos.
          </>
        }
      >
        <PortadaCifras>
          <PortadaCifra destacar etiqueta="Su tasa de política monetaria" valor={porciento(politica?.vigente.tpm)} />
          <PortadaCifra
            etiqueta={reservas ? `Reservas internacionales, ${reservas.cuando}` : "Reservas internacionales"}
            valor={reservas ? formatMagnitud(reservas.valor) : SIN_DATO}
          />
          <PortadaCifra
            etiqueta={billetes ? `Efectivo en manos del público, ${billetes.cuando}` : "Efectivo en manos del público"}
            valor={billetes ? pesosDeMillones(billetes.valor) : SIN_DATO}
          />
          <PortadaCifra
            etiqueta={valores ? `Sus títulos en circulación, ${valores.cuando}` : "Sus títulos en circulación"}
            valor={valores ? pesosDeMillones(valores.valor) : SIN_DATO}
          />
        </PortadaCifras>
      </Portada>

      {dia && (
        <Card as="section" className="p-5 sm:p-6">
          <CardTitle>¿Cuántos pesos recoge y presta cada día?</CardTitle>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-soft">
            Al cierre de cada día, los bancos con pesos de sobra se los dejan al Banco Central a cambio de un interés,
            y los que necesitan los piden prestados. Recogerlos es una{" "}
            <Termino clave="contraccion">operación de contracción</Termino>; prestarlos con títulos de garantía, un{" "}
            <Termino clave="repo">repo</Termino>. Con eso el Banco Central acerca la tasa de corto plazo a la suya.
          </p>
          <TiraDeCifras className="-mx-5 mt-4 sm:-mx-6 lg:grid-cols-3">
            <Cifra
              etiqueta="Depósitos de un día que recibió"
              valor={pesosDeMillones(dia.depositos)}
              nota={`${formatFecha(dia.fecha)}${dia.preliminar ? " · preliminar" : ""}`}
            />
            <Cifra etiqueta="Letras a un día que vendió" valor={pesosDeMillones(dia.letras)} nota={formatFecha(dia.fecha)} />
            <Cifra etiqueta="Pesos que prestó en repos" valor={pesosDeMillones(dia.expansion)} nota={formatFecha(dia.fecha)} />
          </TiraDeCifras>
          <SerieTemporal
            forma="columnas"
            formato="pesos"
            etiqueta={`Pesos recogidos de los bancos cada día hábil, del ${formatFecha(dias[0].fecha)} al ${formatFecha(dia.fecha)}`}
            puntos={dias.map((d, i) => ({
              clave: d.fecha,
              valor: d.contraccion * 1e6,
              lectura: `${formatFecha(d.fecha)}: recogió ${pesosDeMillones(d.contraccion)} y prestó ${pesosDeMillones(d.expansion)}`,
              marca: i === 0 || i === dias.length - 1 || d.fecha.endsWith("-01") ? formatFecha(d.fecha).replace(/ de \d{4}$/, "") : undefined,
            }))}
          />
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">
            Lo recogido cada día hábil (depósitos remunerados de corto plazo más letras a un día) en los últimos{" "}
            {dias.length} días publicados. «Operaciones diarias de expansión y contracción monetaria» del Banco Central,
            en millones de pesos; las del día más reciente son preliminares.{" "}
            <a href={URL_OPERACIONES} className="font-medium text-brand-700 hover:underline">
              Descargar el archivo
            </a>
            .
          </p>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {valoresAnuales.length > 1 && valores && (
          <Card as="section" className="p-5 sm:p-6">
            <CardTitle>¿Cuánto debe el Banco Central en sus propios títulos?</CardTitle>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              Los <Termino clave="valoresBcrd">valores del Banco Central</Termino> en circulación al cierre de cada
              año. Cada peso que alguien le presta comprando un título es un peso que sale de la economía; a cambio,
              el Banco Central paga intereses.
            </p>
            <SerieTemporal
              forma="linea"
              formato="pesos"
              alto="bajo"
              etiqueta={`Valores del Banco Central en circulación, de ${pesosDeMillones(valoresAnuales[0].valor)} en ${valoresAnuales[0].periodo.slice(0, 4)} a ${pesosDeMillones(valoresAnuales.at(-1)!.valor)} en ${formatMes(valoresAnuales.at(-1)!.periodo)}`}
              puntos={aPuntos(
                valoresAnuales.map((p) => ({ ...p, valor: p.valor * 1e6 })),
                (v) => pesosDeMillones(v / 1e6),
              )}
            />
          </Card>
        )}
        {reservasAnuales.length > 1 && reservas && (
          <Card as="section" className="p-5 sm:p-6">
            <CardTitle>¿Cuántos dólares guarda?</CardTitle>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              Las <Termino clave="reservasInternacionales">reservas internacionales</Termino> brutas al cierre de cada
              año: lo que respalda al peso y permite pagar afuera aunque falten dólares un tiempo.
            </p>
            <SerieTemporal
              forma="linea"
              formato="usd-millones"
              alto="bajo"
              etiqueta={`Reservas internacionales brutas, de ${formatMagnitud(reservasAnuales[0].valor)} en ${reservasAnuales[0].periodo.slice(0, 4)} a ${formatMagnitud(reservasAnuales.at(-1)!.valor)} en ${formatMes(reservasAnuales.at(-1)!.periodo)}`}
              puntos={aPuntos(reservasAnuales, formatMagnitud)}
            />
          </Card>
        )}
      </div>

      {balance && (
        <Card as="section" className="p-5 sm:p-6">
          <CardTitle>¿Cuánto dinero hay en la economía?</CardTitle>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-soft">
            Las cuentas del Banco Central y del dinero en pesos, contra el mismo mes de un año antes. Las del último mes
            son preliminares.
          </p>
          <Table className="mt-3">
            <TableHeader>
              <TableRow>
                <TableHead>Cuenta</TableHead>
                <TableHead className="text-right">Último mes</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Un año antes</TableHead>
                <TableHead className="text-right">Cambio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {AGREGADOS.map(({ k, nombre, texto }) => {
                const serie = s[k];
                const m = serie?.meses.at(-1);
                if (!serie || !m) return null;
                const antes = serie.meses.find((p) => p.periodo === `${Number(m.periodo.slice(0, 4)) - 1}${m.periodo.slice(4)}`);
                const v = variacion(m.valor, antes?.valor);
                return (
                  <TableRow key={k}>
                    <TableCell>
                      <span className="font-medium">{nombre}</span>
                      <span className="block text-xs text-ink-soft">{texto}</span>
                      <span className="block font-mono text-xs text-ink-soft">{formatMes(m.periodo)}</span>
                    </TableCell>
                    <TableCell numerica className="whitespace-nowrap">{pesosDeMillones(m.valor)}</TableCell>
                    <TableCell numerica className="hidden whitespace-nowrap sm:table-cell">
                      {antes ? pesosDeMillones(antes.valor) : SIN_DATO}
                    </TableCell>
                    <TableCell numerica className="whitespace-nowrap">
                      {v?.pct != null ? `${v.pct >= 0 ? "+" : "−"}${decimal(Math.abs(v.pct), 1)} %` : SIN_DATO}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">
            «Indicadores monetarios y bancarios armonizados» del Banco Central, en millones de pesos, mes a mes desde
            1996; la última columna del archivo es el saldo de un día del mes en curso, que aquí va en las cifras de
            arriba y no en esta tabla.{" "}
            <a href={URL_INDICADORES_BCRD} className="font-medium text-brand-700 hover:underline">
              Descargar el archivo
            </a>
            .
          </p>
        </Card>
      )}

      {junta.length > 0 && (
        <Card as="section" className="p-5 sm:p-6">
          <CardTitle>¿Quién lo dirige?</CardTitle>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-soft">
            La Junta Monetaria es el órgano superior del Banco Central (Constitución, artículo 223). La preside el
            gobernador; el ministro de Hacienda y Economía y el superintendente de Bancos son miembros por su cargo.
            Fija, entre otras cosas, el <Termino clave="encajeLegal">encaje legal</Termino>.
          </p>
          <ul className="mt-3 divide-y divide-hairline border-y border-hairline">
            {junta.map(({ persona, cargo }) => (
              <li key={persona.id} className="relative flex flex-col gap-0.5 py-2.5">
                <Link href={enlace.funcionario(persona.id)} className="estira font-medium text-ink hover:text-brand-700">
                  {persona.nombre}
                </Link>
                <span className="text-xs text-ink-soft">{cargo.titulo}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            <Link href={enlace.institucion(ID_BCRD, "bcrd")} className="font-medium text-brand-700 hover:underline">
              La ficha del Banco Central
            </Link>
            {" · "}
            <Link href="/dinero/tasas" className="font-medium text-brand-700 hover:underline">
              Su tasa, mes a mes
            </Link>
            {" · "}
            <Link href="/dinero/guia" className="font-medium text-brand-700 hover:underline">
              Cómo funciona el dinero
            </Link>
          </p>
        </Card>
      )}
    </div>
  );
}
