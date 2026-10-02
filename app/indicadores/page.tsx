import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getDeuda } from "@/lib/deuda";
import { formatFecha, formatMagnitud } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Esqueleto } from "@/components/esqueleto";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { IconExternal, IconTrendingUp } from "@/components/icons";
import { EstadoVacio } from "@/components/estado-vacio";
import { Portada } from "@/components/portada";
import { SeccionBolsillo } from "@/components/fuentes-nuevas/indicadores-bolsillo";
import { AlertasTiempo } from "@/components/fuentes-nuevas/alertas-tiempo";
import { SiniestralidadVial } from "@/components/fuentes-nuevas/siniestralidad-vial";
import { DiaElectrico } from "@/components/fuentes-nuevas/dia-electrico";
import { IndicadoresMacro } from "@/components/fuentes-nuevas/indicadores-macro";
import { ComercioExterior } from "@/components/fuentes-nuevas/comercio-exterior";
import { InflacionTurismo } from "@/components/fuentes-nuevas/inflacion-turismo";
import { IndicadoresBanca } from "@/components/fuentes-nuevas/indicadores-banca";
import { EstadisticasJudiciales } from "@/components/fuentes-nuevas/estadisticas-judiciales";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Indicadores del país",
  description:
    "Deuda pública, combustibles, dólar, remesas, reservas, comercio exterior, inflación, turismo, banca, tribunales, luz, alertas del tiempo y muertes en las vías, leídos de sus fuentes oficiales.",
  alternates: { canonical: "/indicadores" },
};

/**
 * Los indicadores del país, enteros. Vivían en la portada, uno debajo de otro
 * —diez tableros a lo ancho—, y la empujaban hasta que quien llegaba por
 * primera vez no veía qué es la plataforma ni qué más hay. La portada conserva
 * una línea con las cuatro cifras que más se preguntan y trae aquí; aquí está
 * cada tablero completo, con su fuente y su fecha (docs/INFRAESTRUCTURA.md
 * §3). Cada uno espera solo a su fuente.
 */
export default function IndicadoresPage() {
  return (
    <div className="space-y-6">
      <Portada
        rotulo="Indicadores · fuentes oficiales leídas en vivo"
        titulo="¿Cómo va el país hoy?"
        descripcion={
          <p>
            La deuda, lo que se paga de bolsillo, la economía, los tribunales y la calle,
            cada cifra con su fuente y su fecha. Lo que llega de una instantánea lo dice.
          </p>
        }
      />

      <Suspense fallback={<Esqueleto className="h-[404px] sm:h-[200px]" />}>
        <SeccionDeuda />
      </Suspense>

      {/* Lo que el Estado fija y se paga de bolsillo: combustibles y dólar. */}
      <SeccionBolsillo />

      {/* La economía: remesas, reservas y tasa activa (BCRD); lo que entra y sale por Aduanas. */}
      <section className="grid gap-4 lg:grid-cols-2" aria-label="Economía y comercio exterior">
        <Suspense fallback={<Esqueleto className="h-[780px] sm:h-[420px]" />}>
          <IndicadoresMacro />
        </Suspense>
        <Suspense fallback={<Esqueleto className="h-[780px] sm:h-[420px]" />}>
          <ComercioExterior />
        </Suspense>
      </section>

      {/* Precios y turismo (instantánea del BCRD) y la banca (SIMBAD). */}
      <section className="grid gap-4 lg:grid-cols-2" aria-label="Precios, turismo y banca">
        <Suspense fallback={<Esqueleto className="h-[640px] sm:h-[460px]" />}>
          <InflacionTurismo />
        </Suspense>
        <Suspense fallback={<Esqueleto className="h-[520px] sm:h-[420px]" />}>
          <IndicadoresBanca />
        </Suspense>
      </section>

      {/* La carga de los tribunales ordinarios, del boletín mensual del Poder Judicial (instantánea). */}
      <Suspense fallback={<Esqueleto className="h-[640px] sm:h-[460px]" />}>
        <EstadisticasJudiciales />
      </Suspense>

      {/* Lo que el Estado avisa y registra de la calle: la luz, el tiempo y las vías. */}
      <section className="grid gap-4 lg:grid-cols-3" aria-label="Luz, tiempo y vías">
        <Suspense fallback={<Esqueleto className="h-[280px]" />}>
          <DiaElectrico />
        </Suspense>
        <Suspense fallback={<Esqueleto className="h-[220px]" />}>
          <AlertasTiempo />
        </Suspense>
        <Suspense fallback={<Esqueleto className="h-[300px]" />}>
          <SiniestralidadVial />
        </Suspense>
      </section>
    </div>
  );
}

async function SeccionDeuda() {
  const deuda = await getDeuda();
  // Una fuente caída no deja un hueco que se lea como «no hay deuda»: dice
  // qué pasó y adónde ir.
  if (!deuda) {
    return (
      <EstadoVacio
        variante="caida"
        rotulo="Deuda pública"
        titulo="Crédito Público no respondió"
        accion={
          <Button asChild variant="secondary">
            <Link href="/deuda">Ver la serie de la deuda</Link>
          </Button>
        }
      >
        Ni el archivo del mes ni la última instantánea se pudieron leer. El
        resto de los indicadores sigue en pie, más abajo.
      </EstadoVacio>
    );
  }

  return (
    <Card as="section" className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <IconTrendingUp className="h-4 w-4 text-ink-soft" />
            Deuda pública
          </CardTitle>
          <p className="mt-0.5 text-xs text-ink-soft">
            Sector Público No Financiero · saldo a {deuda.periodo}
          </p>
        </div>
        {/*
          El enlace al origen medía 100 × 16 px: en un teléfono eso no se
          acierta. Toma la altura de la primitiva y los márgenes negativos
          devuelven el bloque a su sitio, así que el objetivo crece sin que el
          diseño se mueva.
        */}
        <Button asChild variant="link" className="-mx-2 -my-2 px-2 text-xs">
          <a
            href="https://www.creditopublico.gob.do/inicio/estadisticas"
            target="_blank"
            rel="noopener noreferrer"
          >
            Crédito Público
            <IconExternal className="h-3.5 w-3.5" />
            <span className="sr-only">(se abre en otra pestaña)</span>
          </a>
        </Button>
      </div>
      {/*
        A 390 px las tres casillas en fila de tres partían «US$ 61.5 mil
        millones» en cuatro líneas y la última se recortaba contra el filete:
        la cifra más grande de la página quedaba ilegible. En teléfono las tres
        se apilan y cada una pone su etiqueta a la izquierda y su cifra a la
        derecha —la fila completa da los 326 px que el monto necesita—; desde
        `sm`, donde caben, vuelven a la fila de tres con la etiqueta encima.
      */}
      <div className="mt-4 grid gap-2 sm:grid-cols-3 sm:gap-4">
        <IndicadorDeuda
          etiqueta="Deuda total"
          valor={formatMagnitud(deuda.saldoTotal)}
          destacar
        />
        <IndicadorDeuda etiqueta="Externa" valor={formatMagnitud(deuda.saldoExterna)} />
        <IndicadorDeuda etiqueta="Interna" valor={formatMagnitud(deuda.saldoInterna)} />
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        Fuente: Dirección General de Crédito Público del Ministerio de Hacienda.
        {deuda.desdeInstantanea && (
          <>
            {" "}
            Instantánea verificada{deuda.generadoEn ? ` del ${formatFecha(deuda.generadoEn)}` : ""}: el servidor del origen
            no acepta lecturas desde la nube.
          </>
        )}
      </p>
    </Card>
  );
}

function IndicadorDeuda({
  etiqueta,
  valor,
  destacar,
}: {
  etiqueta: string;
  valor: string;
  destacar?: boolean;
}) {
  /*
    La destacada se queda apilada también en teléfono: «US$ 61.5 mil millones»
    a 18 px necesita los 326 px de la fila entera, y compartiéndola con su
    etiqueta se partía en dos. Externa e interna van a 16 px y sí caben al lado
    de la suya, que es lo que las deja leerse como el desglose de la de arriba.
  */
  return (
    <Card
      className={cn(
        "bg-canvas/60 px-4 py-3",
        destacar ? "block" : "flex items-baseline justify-between gap-3 sm:block",
      )}
    >
      <div className="shrink-0 text-[13px] text-ink-soft sm:text-xs">{etiqueta}</div>
      {/*
        Las tres cifras son comparables entre sí, así que las tres van en mono
        tabular: lo único que distingue a la destacada es el tamaño. Con una
        en mono y dos en sans, los dígitos no alinean y el ojo lee dos de
        ellas como texto.
      */}
      <div
        className={
          destacar
            ? "mt-0.5 font-mono text-lg font-semibold tabular-nums tracking-tight text-ink"
            : "font-mono text-base font-semibold tabular-nums text-ink sm:mt-0.5"
        }
      >
        {valor}
      </div>
    </Card>
  );
}
