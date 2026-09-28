import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { etiquetaCorte, getFiscal, type InstitucionFiscal } from "@/lib/fiscal";
import { SECCIONES_INSTITUCIONALES } from "@/lib/capitulos";
import { getDeuda } from "@/lib/deuda";
import { institucionesDelCapitulo } from "@/lib/instituciones";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarrasHorizontales, MarcaBarra } from "@/components/graficos";
import { EstadoVacio } from "@/components/estado-vacio";
import { BuscadorUrl } from "@/components/buscador-url";
import { FiltroEnlace, NavFiltros } from "@/components/nav-filtros";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";
import { formatMagnitud, formatPesos, hace, SIN_DATO } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { Termino } from "@/components/termino";
import { DescargarCsv } from "./descargar-csv";
import { SubsidioElectrico } from "@/components/fuentes-nuevas/subsidio-electrico";
import { enlace } from "@/lib/grafo";
import { agujas, contieneTodas, plano, recortar } from "@/lib/raiz";

export const metadata: Metadata = {
  alternates: { canonical: "/finanzas" },
  title: "Ejecución del presupuesto",
  description:
    "En qué gasta el Estado dominicano: presupuesto vigente, comprometido, devengado y pagado por institución, mes a mes, según la API de datos abiertos del SIGEF.",
};

/** Porcentaje con una decimal, o «sin dato» si no hay contra qué medir. */
function pct(v: number | null): string {
  return v === null ? SIN_DATO : `${(v * 100).toFixed(1)} %`;
}

/** Un monto con su signo delante: «+RD$ 12.0 mil millones», «−RD$ 2.0 …». */
function conSigno(v: number): string {
  if (Math.abs(v) < 1) return formatPesos(0);
  return `${v > 0 ? "+" : "−"}${formatPesos(Math.abs(v))}`;
}

/*
  Los cuatro órdenes de la tabla. Cada uno responde una pregunta distinta, y
  por eso la fila dice debajo la cifra por la que está ordenada.
*/
const ORDENES = {
  devengado: { etiqueta: "Gasto devengado", valor: (i: InstitucionFiscal) => i.devengado },
  ejecucion: { etiqueta: "% ejecutado", valor: (i: InstitucionFiscal) => i.ejecucion ?? -1 },
  cambio: { etiqueta: "Cambio en el año", valor: (i: InstitucionFiscal) => i.vigente - i.inicial },
  pendiente: {
    etiqueta: "Devengado sin pagar",
    valor: (i: InstitucionFiscal) => i.devengado - i.pagado,
  },
} as const;
type Orden = keyof typeof ORDENES;

/** Nombres cortos de las secciones: caben en un filtro de 40 px. */
const SECCIONES_CORTAS: Record<string, string> = {
  "11111": "Gobierno central",
  "11112": "Descentralizadas",
  "11113": "Seguridad social",
};

/** Umbral de «quién ejecuta menos»: sin él, ganan instituciones diminutas. */
const VIGENTE_MINIMO = 1e9;

type Params = { q?: string; seccion?: string; orden?: string };

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const sp = await searchParams;
  const [fiscal, deuda] = await Promise.all([getFiscal(), getDeuda()]);

  if (!fiscal) {
    return (
      <EstadoVacio
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="Todavía no hay instantánea de ejecución"
        accion={
          <Button asChild variant="secondary">
            <Link href="/fuentes">Ver el estado de las fuentes</Link>
          </Button>
        }
      >
        Se genera con{" "}
        <span className="font-mono">python3 scripts/build-fiscal.py</span>, que
        consulta la API de datos abiertos del SIGEF. Mientras tanto, la deuda
        pública sigue en <Link href="/deuda" className="font-medium text-brand-700 hover:underline">/deuda</Link>.
      </EstadoVacio>
    );
  }

  const q = recortar(sp.q, 80);
  const seccion = sp.seccion && SECCIONES_INSTITUCIONALES[sp.seccion] ? sp.seccion : null;
  const orden: Orden = sp.orden && sp.orden in ORDENES ? (sp.orden as Orden) : "devengado";

  /** El enlace de un filtro: cambia un parámetro y conserva los demás. */
  const href = (cambio: Partial<Params>) => {
    const p = new URLSearchParams();
    const junto = { q: q || undefined, seccion: seccion ?? undefined, orden, ...cambio };
    if (junto.q) p.set("q", junto.q);
    if (junto.seccion) p.set("seccion", junto.seccion);
    if (junto.orden && junto.orden !== "devengado") p.set("orden", junto.orden);
    const s = p.toString();
    return s ? `/finanzas?${s}#instituciones` : "/finanzas#instituciones";
  };

  // Todas las palabras, en cualquier orden, sobre el nombre (que el SIGEF trae
  // con espacios dobles) y las siglas de las unidades del capítulo: «MOPC».
  const aguja = q.trim() ? agujas(q) : null;
  const visibles = fiscal.instituciones
    .filter((i) => !seccion || i.seccion === seccion)
    .filter(
      (i) =>
        !aguja ||
        i.codigo === q.trim() ||
        contieneTodas(
          plano(`${i.nombre} ${institucionesDelCapitulo(i.codigo).map((u) => u.acronimo).join(" ")}`),
          aguja,
        ),
    )
    .sort((a, b) => ORDENES[orden].valor(b) - ORDENES[orden].valor(a));

  const corte = etiquetaCorte(fiscal.mesCorte, fiscal.anio);
  const maxDevengado = Math.max(1, ...fiscal.instituciones.map((i) => i.devengado));
  const maxMes = Math.max(1, ...fiscal.porMes.map((m) => m.devengado));
  const mesesVisibles = fiscal.porMes.filter((m) => m.mes <= fiscal.mesCorte);

  // Los tres rankings: lo que el año cambió, lo que se debe, lo que no se gasta.
  const porCambio = [...fiscal.instituciones].sort(
    (a, b) => b.vigente - b.inicial - (a.vigente - a.inicial),
  );
  const ganaron = porCambio.filter((i) => i.vigente - i.inicial >= 1).slice(0, 5);
  const perdieron = porCambio
    .filter((i) => i.vigente - i.inicial <= -1)
    .reverse()
    .slice(0, 5);
  const deben = [...fiscal.instituciones]
    .filter((i) => i.devengado - i.pagado >= 1)
    .sort((a, b) => b.devengado - b.pagado - (a.devengado - a.pagado))
    .slice(0, 6);
  const pendienteTotal = fiscal.total.devengado - fiscal.total.pagado;
  /*
    Las que tienen presupuesto grande y **ningún** devengado no ejecutan poco:
    su gasto no aparece en el SIGEF (UASD, INFOTEP, DGII, SeNaSa en el corte
    de agosto de 2026; el porqué no lo dice el dato). Ponerlas primeras con «0 %»
    afirmaría algo que el dato no dice; se nombran aparte.
  */
  const grandesLista = fiscal.instituciones.filter((i) => i.vigente >= VIGENTE_MINIMO);
  const sinRegistro = grandesLista.filter((i) => i.devengado <= 0);
  const lentas = grandesLista
    .filter((i) => i.devengado > 0 && i.ejecucion !== null)
    .sort((a, b) => (a.ejecucion ?? 0) - (b.ejecucion ?? 0))
    .slice(0, 6);
  const grandes = grandesLista.length - sinRegistro.length;

  const kpis = [
    { etiqueta: "Devengado en el año", valor: formatPesos(fiscal.total.devengado), destacar: true },
    { etiqueta: "Presupuesto vigente", valor: formatPesos(fiscal.total.vigente) },
    { etiqueta: "Ejecutado", valor: pct(fiscal.total.ejecucion) },
    { etiqueta: "Instituciones", valor: formatInt(fiscal.instituciones.length) },
  ];

  const csvEncabezado = [
    "Capítulo",
    "Institución",
    "Sección",
    "Presupuesto inicial (RD$)",
    "Presupuesto vigente (RD$)",
    "Cambio en el año (RD$)",
    "Comprometido (RD$)",
    "Devengado (RD$)",
    "Pagado (RD$)",
    "Devengado sin pagar (RD$)",
    "Ejecutado (%)",
  ];
  const csvFilas = visibles.map((i) => [
    i.codigo,
    i.nombreLegible,
    i.seccionNombre,
    Math.round(i.inicial),
    Math.round(i.vigente),
    Math.round(i.vigente - i.inicial),
    Math.round(i.comprometido),
    Math.round(i.devengado),
    Math.round(i.pagado),
    Math.round(i.devengado - i.pagado),
    i.ejecucion === null ? "" : Number((i.ejecucion * 100).toFixed(2)),
  ]);

  return (
    <div className="space-y-5">
      <Portada
        rotulo={`Ejecución presupuestaria · SIGEF · corte a ${corte}`}
        titulo="¿En qué gasta el Estado?"
        descripcion={
          <>
            El presupuesto no se ejecuta de golpe: se aprueba, se modifica, se
            compromete, se devenga y se paga. Estas son las cifras de cada
            institución en {fiscal.anio}, con el gasto{" "}
            <Termino clave="devengado" className="font-medium text-canvas">devengado</Termino> como
            medida: lo que el Estado ya se obligó a pagar.
          </>
        }
      >
        <PortadaCifras>
          {kpis.map((k) => (
            <PortadaCifra
              key={k.etiqueta}
              etiqueta={k.etiqueta}
              valor={k.valor}
              destacar={k.destacar}
            />
          ))}
        </PortadaCifras>
      </Portada>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card as="section" className="p-5 sm:p-6 lg:col-span-3">
          <CardTitle>Gasto devengado mes a mes</CardTitle>
          <p className="mt-1 text-xs text-ink-soft">
            Todo el Estado, {fiscal.anio}. Cada barra es un mes cerrado.
          </p>
          <BarrasHorizontales
            className="mt-4"
            forma="periodo"
            maximo={maxMes}
            etiqueta={`Gasto devengado por mes, ${fiscal.anio}`}
            barras={mesesVisibles.map((m) => ({
              clave: String(m.mes),
              etiqueta: etiquetaCorte(m.mes, fiscal.anio).split(" de ")[0],
              titulo: `${etiquetaCorte(m.mes, fiscal.anio)}: ${formatPesos(m.devengado)}`,
              valor: m.devengado,
              cifra: formatPesos(m.devengado),
            }))}
          />
        </Card>

        <Card as="section" className="p-5 sm:p-6 lg:col-span-2">
          <CardTitle>Y lo que debe</CardTitle>
          {deuda ? (
            <>
              <p className="mt-3 font-mono text-2xl font-bold tabular-nums">
                {formatMagnitud(deuda.saldoTotal)}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                Saldo de la deuda del <Termino clave="spnf">Sector Público No Financiero</Termino> · {deuda.periodo}
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex items-baseline justify-between gap-2 rounded-lg bg-canvas px-3 py-2">
                  <dt className="text-ink-soft"><Termino clave="deudaExterna">Externa</Termino></dt>
                  <dd className="font-mono tabular-nums">
                    {formatMagnitud(deuda.saldoExterna)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-2 rounded-lg bg-canvas px-3 py-2">
                  <dt className="text-ink-soft"><Termino clave="deudaInterna">Interna</Termino></dt>
                  <dd className="font-mono tabular-nums">
                    {formatMagnitud(deuda.saldoInterna)}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-ink-soft">
                Fuente: Crédito Público (Ministerio de Hacienda).
                {deuda.desdeInstantanea && " Instantánea guardada: el portal de origen no responde desde nuestros servidores."}
              </p>
              <Button asChild variant="secondary" className="mt-4 w-full">
                <Link href="/deuda">Cómo ha crecido desde 2000</Link>
              </Button>
              <Link href="/finanzas/guia/deuda" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-brand-700 hover:underline sm:min-h-0">
                ¿Qué es la deuda pública? Lee la guía →
              </Link>
            </>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              Crédito Público no respondió y no hay instantánea que mostrar.
              Revisa su estado en{" "}
              <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
                las fuentes
              </Link>{" "}
              o vuelve en unos minutos.
            </p>
          )}
        </Card>
      </div>

      {/*
        Los tres rankings leen las mismas columnas de la instantánea que la
        tabla de abajo —inicial, vigente, devengado, pagado—; lo único que
        añaden es la resta que el lector tendría que hacer de cabeza.
      */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card as="section" className="p-5">
          <CardTitle>¿Quién ganó o perdió presupuesto en el año?</CardTitle>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Presupuesto vigente menos el aprobado al abrir {fiscal.anio}: lo que
            las modificaciones le sumaron o le quitaron.
          </p>
          <p className="rotulo mt-4 text-ink-soft">Le añadieron</p>
          <FilasRanking
            filas={ganaron.map((i) => ({ i, cifra: conSigno(i.vigente - i.inicial) }))}
            vacio="Ninguna institución ha recibido aumentos."
          />
          <p className="rotulo mt-4 text-ink-soft">Le recortaron</p>
          <FilasRanking
            filas={perdieron.map((i) => ({ i, cifra: conSigno(i.vigente - i.inicial) }))}
            vacio="Ninguna institución ha tenido recortes."
          />
        </Card>

        <Card as="section" className="p-5">
          <CardTitle>¿Quién debe más de lo que ya recibió?</CardTitle>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Devengado menos pagado: bienes, obras y servicios ya recibidos que
            todavía no han salido de caja. En todo el Estado suman{" "}
            <span className="font-medium text-ink">{formatPesos(pendienteTotal)}</span>.
          </p>
          <FilasRanking
            filas={deben.map((i) => ({ i, cifra: formatPesos(i.devengado - i.pagado) }))}
            vacio="Todo lo devengado está pagado."
          />
        </Card>

        <Card as="section" className="p-5">
          <CardTitle>¿Quién ejecuta menos?</CardTitle>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Devengado sobre presupuesto vigente, entre las {grandes} instituciones
            con más de RD$ 1,000 millones vigentes. A {corte} el año no ha
            terminado: una cifra baja puede ser gasto que llega al final.
          </p>
          <FilasRanking
            filas={lentas.map((i) => ({ i, cifra: pct(i.ejecucion) }))}
            vacio="No hay instituciones con presupuesto suficiente para comparar."
          />
          {sinRegistro.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              {sinRegistro.length === 1 ? "Otra no registra" : `Otras ${sinRegistro.length} no registran`}{" "}
              ningún gasto devengado en el SIGEF este año, así que no se pueden
              medir aquí: {sinRegistro.map((i) => i.nombreLegible).join(", ")}.
            </p>
          )}
        </Card>
      </div>

      <SubsidioElectrico />

      <Card as="section" className="p-5 sm:p-6" id="instituciones">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Institución por institución</CardTitle>
            <p className="mt-1 text-xs text-ink-soft">
              El porcentaje es cuánto lleva ejecutado de su presupuesto vigente.
            </p>
          </div>
          <DescargarCsv
            encabezado={csvEncabezado}
            filas={csvFilas}
            nombre={`ejecucion-${fiscal.anio}-${String(fiscal.mesCorte).padStart(2, "0")}.csv`}
            etiqueta={`Descargar ${formatInt(visibles.length)} en CSV`}
          />
        </div>

        <div className="mt-4 space-y-3">
          <Suspense>
            <BuscadorUrl
              etiqueta="Buscar una institución en el presupuesto"
              placeholder="Educación, MOPC, 0206…"
              ayuda={`Busca en el nombre, las siglas y el código de capítulo de las ${fiscal.instituciones.length} instituciones del Presupuesto General del Estado, todas las palabras en cualquier orden y sin distinguir tildes.`}
            />
          </Suspense>
          <NavFiltros etiqueta="Sección institucional">
            <FiltroEnlace href={href({ seccion: undefined })} activo={!seccion}>
              Todas
            </FiltroEnlace>
            {Object.keys(SECCIONES_INSTITUCIONALES).map((s) => (
              <FiltroEnlace key={s} href={href({ seccion: s })} activo={seccion === s}>
                {SECCIONES_CORTAS[s]}
              </FiltroEnlace>
            ))}
          </NavFiltros>
          <NavFiltros etiqueta="Ordenar por">
            {(Object.keys(ORDENES) as Orden[]).map((o) => (
              <FiltroEnlace key={o} href={href({ orden: o })} activo={orden === o}>
                {ORDENES[o].etiqueta}
              </FiltroEnlace>
            ))}
          </NavFiltros>
          <p aria-live="polite" className="text-sm text-ink-soft">
            <span className="font-semibold text-ink">{formatInt(visibles.length)}</span> de{" "}
            {formatInt(fiscal.instituciones.length)} instituciones · ordenadas por{" "}
            {ORDENES[orden].etiqueta.toLowerCase()}, de mayor a menor
          </p>
        </div>

        {visibles.length === 0 ? (
          <EstadoVacio
            className="mt-4"
            titulo={q ? `Ninguna institución coincide con «${q}»` : "Ninguna institución en esta sección"}
          >
            Prueba con una palabra del nombre (Salud, Obras) o con el código de
            capítulo, o quita el filtro de sección.
          </EstadoVacio>
        ) : (
          <ul className="-mx-2 mt-4 divide-y divide-hairline border-y border-hairline">
            {visibles.map((i) => (
              /*
                `--cv-alto` es lo que el navegador reserva por fila sin pintarla:
                a 390 px el nombre de la institución ocupa dos líneas y la fila
                mide unos 110 px, no los 80 de escritorio. Con la estimación corta
                la barra de desplazamiento saltaba al pintar cada tramo.

                La fila entera es el enlace (`estira`): responde como fila de
                lista, con tinta al apuntar y hundida al pulsar, en vez de ser
                una hoja con borde dentro de otra hoja.
              */
              <li
                key={i.codigo}
                className="relative cv-auto px-2 py-3 [--cv-alto:7rem] sm:[--cv-alto:5rem]"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <Link
                    href={enlace.capitulo(i.codigo)}
                    className="estira min-w-0 font-medium text-ink [overflow-wrap:anywhere]"
                  >
                    {i.nombreLegible}
                  </Link>
                  <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                    {formatPesos(i.devengado)}
                  </span>
                </div>
                <MarcaBarra
                  valor={i.devengado}
                  maximo={maxDevengado}
                  minimo={1}
                  className="mt-1.5"
                />
                {/*
                  Los dos metadatos van a los extremos, no en una fila que se
                  parte: con `flex-wrap` y un «·» al principio del segundo, a
                  390 px la línea se rompía y dejaba el punto huérfano abriendo
                  el renglón. La sección se cuela en medio desde `sm`.
                */}
                <div className="mt-1.5 flex items-baseline justify-between gap-x-3 text-xs text-ink-soft">
                  <span className="shrink-0 font-mono">Capítulo {i.codigo}</span>
                  <span className="hidden min-w-0 truncate sm:block">{i.seccionNombre}</span>
                  <span className="min-w-0 text-right tabular-nums sm:shrink-0">{detalleOrden(i, orden)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card as="section" className="p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle>Cómo leer estas cifras</CardTitle>
          <Link href="/finanzas/guia" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 hover:underline sm:min-h-0">
            Guía: cómo leer el presupuesto →
          </Link>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="rotulo text-ink-soft">Presupuesto vigente</dt>
            <dd className="text-ink-soft">
              El aprobado al abrir el año más las modificaciones hechas después.
              Sube y baja durante el año: por eso no coincide con el inicial.
            </dd>
          </div>
          <div>
            <dt className="rotulo text-ink-soft">Comprometido</dt>
            <dd className="text-ink-soft">
              El Estado firmó algo que lo obliga (un contrato, una orden),
              pero todavía no ha recibido el bien o el servicio.
            </dd>
          </div>
          <div>
            <dt className="rotulo text-ink-soft">Devengado</dt>
            <dd className="text-ink-soft">
              Ya recibió lo que compró y nació la obligación de pagar. Es la
              medida honesta de «cuánto gastó».
            </dd>
          </div>
          <div>
            <dt className="rotulo text-ink-soft">Pagado</dt>
            <dd className="text-ink-soft">
              El dinero salió de la cuenta. Puede ir por detrás del devengado:
              esa distancia es lo que se le debe a proveedores, la{" "}
              <Termino clave="deudaAdministrativa">deuda administrativa</Termino>.
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-ink-soft">
          Fuente: API de datos abiertos del <Termino clave="sigef">SIGEF</Termino> (Ministerio de Hacienda),{" "}
          <span className="break-all font-mono">{fiscal.fuente}</span>. La API calcula el
          año en curso en vivo y tarda minutos, así que la plataforma consolida
          las tres secciones institucionales en una instantánea
          {hace(fiscal.generadoEn) ? ` (generada ${hace(fiscal.generadoEn)})` : ""}{" "}
          y la sirve al instante; se regenera con{" "}
          <span className="font-mono">python3 scripts/build-fiscal.py</span>.
          Cubre {fiscal.instituciones.length} instituciones del Presupuesto
          General del Estado: no incluye ayuntamientos ni empresas públicas
          financieras.
        </p>
      </Card>
    </div>
  );
}

/** La cifra por la que está ordenada la tabla, dicha en llano. */
function detalleOrden(i: InstitucionFiscal, orden: Orden): string {
  if (orden === "cambio") {
    const c = i.vigente - i.inicial;
    if (Math.abs(c) < 1) return "sin cambios en el año";
    return `${c > 0 ? "le añadieron" : "le recortaron"} ${formatPesos(Math.abs(c))}`;
  }
  if (orden === "pendiente") {
    return `${formatPesos(Math.max(0, i.devengado - i.pagado))} devengado sin pagar`;
  }
  return `${pct(i.ejecucion)} de su presupuesto vigente`;
}

/** Una lista corta de instituciones con su cifra: cada fila lleva a su capítulo. */
function FilasRanking({
  filas,
  vacio,
}: {
  filas: { i: InstitucionFiscal; cifra: string }[];
  vacio: string;
}) {
  if (filas.length === 0) return <p className="mt-2 text-sm text-ink-soft">{vacio}</p>;
  return (
    <ol className="mt-2 divide-y divide-hairline text-sm">
      {filas.map(({ i, cifra }) => (
        <li key={i.codigo}>
          <Link
            href={enlace.capitulo(i.codigo)}
            className="flex min-h-11 items-center justify-between gap-3 py-2 transition-colors hover:text-brand-700"
          >
            <span className="min-w-0 leading-snug">{i.nombreLegible}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-ink-soft">
              {cifra}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
