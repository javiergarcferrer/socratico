import Link from "next/link";
import { notFound } from "next/navigation";
import { etiquetaCorte, getFiscal, getInstitucionFiscal } from "@/lib/fiscal";
import { formatMonto, formatPesos, SIN_DATO } from "@/lib/format";
import { cabezaDelCapitulo, fichaDelCapitulo, hrefInstitucion, institucionesDelCapitulo } from "@/lib/instituciones";
import { ConectadoCon } from "@/components/conectado-con";
import { desdeMayusculas } from "@/lib/congreso";
import { getObras } from "@/lib/obras";
import Plegable from "@/components/plegable";

import { Card, CardTitle } from "@/components/ui/card";
import { BarrasHorizontales, Leyenda } from "@/components/graficos";
import { Ruta } from "@/components/ruta";
import AccionesFicha from "@/components/acciones-ficha";
import { Termino } from "@/components/termino";
import { enlace } from "@/lib/grafo";

export async function generateStaticParams() {
  const fiscal = await getFiscal();
  return (fiscal?.instituciones ?? []).map((i) => ({ capitulo: i.codigo }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ capitulo: string }>;
}) {
  const { capitulo } = await params;
  const datos = await getInstitucionFiscal(capitulo);
  if (!datos) {
    return {
      title: `Capítulo ${capitulo}`,
      description: `Ejecución presupuestaria del capítulo ${capitulo} según el SIGEF.`,
    };
  }
  return {
    title: `${datos.institucion.nombreLegible}: ejecución presupuestaria`,
    alternates: { canonical: enlace.capitulo(capitulo) },
    description: `Presupuesto vigente, comprometido, devengado y pagado de ${datos.institucion.nombreLegible} en ${datos.fiscal.anio}.`,
  };
}

function pct(v: number | null): string {
  return v === null ? SIN_DATO : `${(v * 100).toFixed(1)} %`;
}

export default async function InstitucionFiscalPage({
  params,
}: {
  params: Promise<{ capitulo: string }>;
}) {
  const { capitulo } = await params;
  if (!/^\d{4}$/.test(capitulo)) notFound();

  const datos = await getInstitucionFiscal(capitulo);
  if (!datos) notFound();
  const { institucion: i, fiscal } = datos;

  const meses = i.meses.filter((m) => m.mes <= fiscal.mesCorte);
  const maxMes = Math.max(1, ...meses.map((m) => Math.max(m.devengado, m.pagado)));
  const maxUnidad = Math.max(1, ...i.unidades.map((u) => u.devengado));
  const modificaciones = i.vigente - i.inicial;
  const pendientePago = i.devengado - i.pagado;
  const unidades = institucionesDelCapitulo(i.codigo);
  const cabeza = cabezaDelCapitulo(i.nombreLegible, unidades);
  // Un capítulo sin unidad de compra (el Senado, el Poder Judicial) tiene su ficha del Clasificador.
  const ficha = unidades.length === 0 ? fichaDelCapitulo(i.codigo) : null;
  const obras = cabeza ? await getObras() : null;
  const obrasCabeza = obras && cabeza ? obras.proyectos.filter((o) => o.uc === cabeza.id).length : 0;

  return (
    <div className="space-y-5">
      <Ruta seccion="finanzas" actual={`Capítulo ${i.codigo}`} />

      <Card as="section" className="p-5 sm:p-6">
        <div className="rotulo text-ink-soft">
          <Termino clave="capitulo">Capítulo</Termino> {i.codigo} · {i.seccionNombre}
        </div>
        <h1 className="mt-1 font-display text-2xl leading-tight sm:text-3xl">
          {i.nombreLegible}
        </h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          Ejecución de {fiscal.anio}, con corte a {etiquetaCorte(fiscal.mesCorte, fiscal.anio)}.
        </p>
        <AccionesFicha className="mt-3" tipo="capitulo" id={i.codigo} titulo={i.nombreLegible} href={enlace.capitulo(i.codigo)} />

        {/*
          «RD$ 330.0 mil millones» no cabe en una casilla de media pantalla: a
          390 px se partía en tres líneas —«RD$ 330.0» / «mil» / «millones»— y
          las cuatro casillas quedaban desiguales. A 16 px y con `text-balance`
          la magnitud cae en dos líneas parejas y la unidad no se despega del
          número. La unidad viaja con la cifra por decisión de `formatPesos`:
          «MM» se lee *millones* en RD y se equivocaría por mil.
        */}
        <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { etiqueta: "Presupuesto vigente", valor: formatPesos(i.vigente) },
            { etiqueta: "Devengado", valor: formatPesos(i.devengado), tinta: true },
            { etiqueta: "Pagado", valor: formatPesos(i.pagado) },
            { etiqueta: "Ejecutado", valor: pct(i.ejecucion) },
          ].map((k) => (
            <div
              key={k.etiqueta}
              className={`rounded-lg px-4 py-3 ${k.tinta ? "bg-ink text-canvas" : "bg-canvas"}`}
            >
              <dt className={`text-xs ${k.tinta ? "text-canvas/70" : "text-ink-soft"}`}>
                {k.etiqueta}
              </dt>
              <dd className="mt-0.5 text-balance font-mono text-base font-bold leading-tight tabular-nums sm:text-lg">
                {k.valor}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          Abrió el año con {formatMonto(i.inicial, "DOP")} y su presupuesto
          vigente es de {formatMonto(i.vigente, "DOP")}:{" "}
          {Math.abs(modificaciones) < 1 ? (
            <>no ha tenido modificaciones.</>
          ) : (
            <>
              {modificaciones > 0 ? "le añadieron " : "le recortaron "}
              <span className="font-medium text-ink">
                {formatMonto(Math.abs(modificaciones), "DOP")}
              </span>{" "}
              durante el año.
            </>
          )}
          {pendientePago > 0 && (
            <>
              {" "}
              Entre lo devengado y lo pagado hay{" "}
              <span className="font-medium text-ink">
                {formatMonto(pendientePago, "DOP")}
              </span>{" "}
              de diferencia: gasto ya causado que aún no ha salido de caja.
            </>
          )}
        </p>
      </Card>

      <ConectadoCon
        aristas={[
          cabeza && {
            etiqueta: "La institución que lo encabeza",
            href: hrefInstitucion(cabeza),
            nombre: desdeMayusculas(cabeza.nombre),
            fuente: "DGCP ↔ SIGEF",
          },
          ficha && {
            etiqueta: "Su ficha de institución",
            href: hrefInstitucion(ficha),
            nombre: desdeMayusculas(ficha.nombre),
            fuente: "Clasificador Institucional de DIGEPRES",
          },
          { etiqueta: "Unidades de compra que gastan este presupuesto", href: "#unidades", cuenta: unidades.length, fuente: "DGCP" },
          cabeza && {
            // La cuenta es la de la lista que abre: las de quien lo encabeza.
            etiqueta: "Obras que ejecuta quien lo encabeza",
            href: `/obras?uc=${cabeza.id}`,
            cuenta: obrasCabeza,
            fuente: "MapaInversiones",
          },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-5">
        <Card as="section" className="p-5 sm:p-6 lg:col-span-3">
          <CardTitle>Mes a mes</CardTitle>
          {/*
            En escritorio la leyenda podía ser telegráfica porque el cursor
            revela el detalle de cada barra; en un teléfono no hay puntero, así
            que la leyenda es lo único que explica el tramo interior y tiene
            que decirlo entero.
          */}
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Cada barra es lo devengado del mes, medido contra el mes mayor. El
            tramo oscuro de dentro es cuánto de eso ya salió de caja.
          </p>
          {meses.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">
              Esta institución no registra ejecución mensual en {fiscal.anio}.
            </p>
          ) : (
            <>
              <Leyenda
                className="mt-3"
                entradas={[
                  { clave: "devengado", etiqueta: "Devengado", clase: "bg-grafico-sec-3" },
                  { clave: "pagado", etiqueta: "Ya pagado", clase: "bg-grafico-1" },
                ]}
              />
              {/*
                Dos medidas en una barra: el ancho es lo devengado sobre el mes
                mayor, y el tramo de dentro es cuánto de eso ya salió de caja.
                El `title` de cada mes dice las dos, porque el tramo interior no
                se puede leer con un lector de pantalla.
              */}
              <BarrasHorizontales
                className="mt-3"
                forma="periodo"
                minimo={1}
                maximo={maxMes}
                etiqueta={`Gasto devengado y pagado por mes, ${fiscal.anio}`}
                barras={meses.map((m) => ({
                  clave: String(m.mes),
                  etiqueta: etiquetaCorte(m.mes, fiscal.anio).split(" de ")[0],
                  titulo: `${etiquetaCorte(m.mes, fiscal.anio)}: devengado ${formatPesos(m.devengado)}, pagado ${formatPesos(m.pagado)}`,
                  valor: m.devengado,
                  parte: m.pagado,
                  cifra: formatPesos(m.devengado),
                }))}
              />
            </>
          )}
        </Card>

        <Card as="section" className="p-5 sm:p-6 lg:col-span-2">
          <CardTitle>Quién ejecuta dentro</CardTitle>
          <p className="mt-1 text-xs text-ink-soft">
            Unidades ejecutoras con más gasto devengado.
          </p>
          {i.unidades.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">
              El registro no desglosa unidades ejecutoras para esta institución.
            </p>
          ) : (
            /*
              Los nombres de unidad ejecutora vienen en mayúsculas y son
              largos: con una sola línea a 390 px todos quedaban en
              «INSTITUTO NACIONAL DE…» y la lista no distinguía una de otra.
              Dos líneas alcanzan para leerlos.
            */
            <BarrasHorizontales
              className="mt-4"
              lineas={2}
              maximo={maxUnidad}
              etiqueta="Unidades ejecutoras por gasto devengado"
              barras={i.unidades.map((u) => ({
                clave: u.nombre,
                etiqueta: u.nombre,
                titulo: `${u.nombre}: ${formatPesos(u.devengado)}`,
                valor: u.devengado,
                cifra: formatPesos(u.devengado),
              }))}
            />
          )}
        </Card>
      </div>

      <UnidadesDeCompra capitulo={i.codigo} />

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuente: API de datos abiertos del SIGEF (Ministerio de Hacienda), sección{" "}
        <span className="font-mono">{i.seccion}</span>, capítulo{" "}
        <span className="font-mono">{i.codigo}</span>. El presupuesto vigente se
        calcula como la suma de la apertura del año y sus modificaciones
        mensuales, que es como lo publica el origen.
      </p>
    </div>
  );
}

/** Cuántas unidades se ven sin abrir: las demás quedan a un toque. */
const UNIDADES_VISIBLES = 12;

/**
 * Quién compra con este presupuesto: las unidades de compra de la DGCP que la
 * propia DGCP adscribe al capítulo (`lib/instituciones.ts`). Es el puente de
 * vuelta a la ficha de institución, donde están sus compras, su nómina y sus
 * decretos. Un capítulo como el del Servicio Nacional de Salud agrupa cientos
 * de hospitales: los ministerios y oficinas centrales van primero, y el resto
 * se despliega diciendo cuántos son.
 */
function UnidadesDeCompra({ capitulo }: { capitulo: string }) {
  const orden = (tipo: string) => (tipo === "Institución" ? 0 : tipo === "Hospital" ? 2 : 1);
  const unidades = institucionesDelCapitulo(capitulo).sort(
    (a, b) => orden(a.tipo) - orden(b.tipo) || a.nombre.localeCompare(b.nombre, "es"),
  );
  const fila = (u: (typeof unidades)[number]) => (
    <li key={u.id}>
      <Link
        href={hrefInstitucion(u)}
        className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm transition-colors hover:text-brand-700"
      >
        <span className="min-w-0 leading-snug">{u.nombre}</span>
        <span className="shrink-0 text-xs text-ink-soft">
          {[u.acronimo, u.tipo].filter(Boolean).join(" · ")}
        </span>
      </Link>
    </li>
  );

  return (
    <Card as="section" id="unidades" className="overflow-hidden">
      <div className="p-5 sm:p-6">
        <CardTitle>¿Quién compra con este presupuesto?</CardTitle>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          {unidades.length === 0
            ? "La DGCP no adscribe ninguna unidad de compra activa a este capítulo."
            : `${unidades.length === 1 ? "La unidad de compra" : `Las ${unidades.length} unidades de compra`} que la DGCP adscribe a este capítulo. Cada una lleva a su ficha de institución, con sus compras.`}
        </p>
        {unidades.length > 0 && (
          <ul className="mt-3 divide-y divide-hairline">
            {unidades.slice(0, UNIDADES_VISIBLES).map(fila)}
          </ul>
        )}
      </div>
      {unidades.length > UNIDADES_VISIBLES && (
        <Plegable
          etiqueta={`Ver las otras ${unidades.length - UNIDADES_VISIBLES} unidades`}
          etiquetaCerrar="Ocultar las demás unidades"
        >
          <ul className="divide-y divide-hairline px-5 sm:px-6">
            {unidades.slice(UNIDADES_VISIBLES).map(fila)}
          </ul>
        </Plegable>
      )}
    </Card>
  );
}
