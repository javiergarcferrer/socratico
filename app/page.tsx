import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, cache } from "react";
import { dgcpFetch, type Proceso } from "@/lib/dgcp";
import {
  SIL_PAGE_SIZE,
  VENTANA_ALERTA_DIAS,
  diffDias,
  getCountIniciativas,
  legislaturaVigente,
  muestrearIniciativas,
  resumirIniciativas,
  type Legislatura,
} from "@/lib/congreso";
import { getCensoSenado } from "@/lib/senado";
import { getDeuda } from "@/lib/deuda";
import { etiquetaCorte, getResumenFiscal } from "@/lib/fiscal";
import { formatCompactDOP, formatInt } from "@/lib/nomina";
import { getResumenNomina } from "@/lib/nomina-server";
import { getTasa } from "@/lib/tasa";
import { getCombustibles } from "@/lib/combustibles";
import { getMacro } from "@/lib/macro";
import { diasHasta, formatFecha, formatMagnitud, formatMonto, formatPesos, SIN_DATO } from "@/lib/format";
import { SECCIONES } from "@/lib/secciones";
import { MENU, puntoDe, type GrupoMenu } from "@/lib/menu";
import { consultarNormativa } from "@/lib/normativa";
import { desdeMayusculas } from "@/lib/congreso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconArrowRight,
  IconBell,
  IconBookmark,
  IconChartBar,
  IconClock,
  IconCoins,
  IconDoc,
  IconFolder,
  IconLayers,
  IconLink,
  IconPencil,
  IconSearch,
  IconShare,
  IconTrendingUp,
} from "@/components/icons";
import { MarcaEstado } from "@/components/marca-estado";
import { Portada } from "@/components/portada";
import { Cifra, Rotulo, TiraDeCifras } from "@/components/papel";
import LlamadaCuenta from "@/components/espacios/llamada-cuenta";
import { enlace } from "@/lib/grafo";
import { cn } from "@/lib/cn";
import ConversacionesVivas from "@/components/espacios/conversaciones-vivas";

export const revalidate = 1800;

export const metadata: Metadata = { alternates: { canonical: "/" } };

/** Páginas del SIL que alimentan la portada (10 iniciativas por página). */
const PAGINAS_CONGRESO = 10;

/**
 * La fecha ISO de hace N días, para acotar una consulta al origen.
 *
 * No confundir con `hace()` de `lib/format.ts`, que hace lo contrario: recibe
 * una fecha y devuelve «hace 4 meses» para que lo lea una persona. Este toma
 * un número de días y devuelve `2026-08-05` para que lo lea la DGCP.
 */
function fechaHaceDias(dias: number): string {
  const d = new Date(Date.now() - dias * 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * Los procesos de los últimos 30 días alimentan dos piezas —el dominio de
 * compras y el panel de cierres—: `cache` garantiza una sola lectura por
 * render.
 */
const procesosRecientes = cache(() =>
  dgcpFetch<Proceso>("/procesos", { startdate: fechaHaceDias(30), limit: 1000 }, 1800).catch(
    () => null,
  ),
);

/*
  La portada responde, en orden, las cuatro preguntas de quien llega
  (docs/IDENTIDAD.md §4, «el orden de los bloques es el orden en que se
  entiende»):

  1. ¿Qué es esto? — la misión en una frase y la caja que busca en todo.
  2. ¿Qué pasa hoy? — cuatro dominios con sus cifras y una línea con los
     cuatro indicadores que más se preguntan; lo que vence esta semana.
  3. ¿Qué gano con una cuenta? — guardar, investigar, enlazar, anotar,
     publicar, colaborar, enterarse. Va después de los datos: se pide la
     cuenta a quien ya vio lo que hay, no antes.
  4. ¿Qué más hay? — la plataforma entera ordenada por tema, con el mismo
     índice que el megamenú (`lib/menu.ts`): una sola lista de destinos.

  Los diez tableros de indicadores que vivían aquí, uno bajo otro, están
  enteros en `/indicadores`: empujaban todo lo anterior fuera de la vista.
  Cada pieza espera solo a su fuente (`Suspense`); la estructura llega de
  inmediato.
*/
export default function Inicio() {
  const legislatura = legislaturaVigente();
  const diasCierre = legislatura ? diffDias(new Date(), legislatura.cierre) : null;

  return (
    <div className="space-y-10">
      <Portada
        principal
        rotulo="Independiente y no oficial · con lo que publica el Estado dominicano"
        titulo="¿Qué hace el Estado con lo que es de todos?"
        descripcion={
          <p className="sm:text-base">
            Socrático reúne en un solo lugar lo que publica el Estado (compras,
            presupuesto, deuda, nómina, leyes, Congreso, tribunales, obras), leído
            de sus fuentes oficiales y explicado en llano. Busca, compara y entiende
            sin cuenta; con una, organiza tu trabajo: guarda registros, enlázalos, anótalos y
            publica lo que encuentres.
          </p>
        }
      >
        {/*
          Una sola caja para toda la plataforma: quien llega con una pregunta
          concreta —«MINERD», «Ley 47-20», un RNC— no tiene que saber antes en
          qué vertical vive. Es un formulario GET a /buscar: funciona sin
          JavaScript y la búsqueda queda en la URL.
        */}
        <form action="/buscar" method="get" role="search" className="mb-4 flex max-w-xl gap-2">
          <label htmlFor="buscar-portada" className="sr-only">
            Buscar en toda la plataforma
          </label>
          <Input
            id="buscar-portada"
            name="q"
            type="search"
            enterKeyHint="search"
            placeholder="Una institución, una ley, un RNC, una compra…"
            className="border-canvas/25 bg-canvas text-ink"
          />
          <Button type="submit" className="shrink-0 bg-canvas text-ink hover:bg-surface">
            <IconSearch className="h-4 w-4" />
            <span className="sr-only sm:not-sr-only">Buscar</span>
          </Button>
        </form>
        <div className="flex flex-wrap gap-2.5">
          <LlamadaCuenta sobreTinta />
          <Button
            asChild
            size="lg"
            variant="tinta"
            className="border border-canvas/20 bg-canvas/10 text-canvas hover:bg-canvas/20"
          >
            <Link href="#explorar">
              <IconLayers className="h-4 w-4" />
              Ver todo lo que hay
            </Link>
          </Button>
        </div>
      </Portada>

      {/* 2. ¿Qué pasa hoy? */}
      <section aria-labelledby="hoy" className="space-y-4">
        <Encabezado
          id="hoy"
          rotulo="Hoy"
          titulo="¿Qué está pasando con el dinero y las leyes?"
          enlace={{ href: "/indicadores", texto: "Todos los indicadores" }}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Suspense fallback={<DominioEsqueleto seccion="licitaciones" Icon={IconCoins} />}>
            <DominioCompras />
          </Suspense>
          <Suspense fallback={<DominioEsqueleto seccion="finanzas" Icon={IconTrendingUp} />}>
            <DominioFinanzas />
          </Suspense>
          <Suspense fallback={<DominioEsqueleto seccion="congreso" Icon={IconLayers} />}>
            <DominioCongreso diasCierre={diasCierre} />
          </Suspense>
          <Suspense fallback={<DominioEsqueleto seccion="nomina" Icon={IconChartBar} />}>
            <DominioNomina />
          </Suspense>
        </div>
        <IndicadoresClave />
      </section>

      {/* Lo que vence o acaba de salir: donde hay algo que hacer esta semana. */}
      <section aria-labelledby="semana" className="space-y-4">
        <Encabezado id="semana" rotulo="Esta semana" titulo="¿Qué vence y qué acaba de salir?" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Suspense fallback={<PanelEsqueleto titulo="Cierran esta semana" href="/licitaciones?orden=cierre" Icon={IconClock} />}>
            <PanelCierran />
          </Suspense>
          <Suspense fallback={<PanelEsqueleto titulo="Se archivan al cerrar la legislatura" href="/congreso/perencion" Icon={IconClock} />}>
            <PanelPerencion legislatura={legislatura} diasCierre={diasCierre} />
          </Suspense>
          <Suspense fallback={<PanelEsqueleto titulo="Lo último que decretó el Ejecutivo" href="/normativa" Icon={IconDoc} />}>
            <PanelDecretos />
          </Suspense>
        </div>
      </section>

      {/* Lo que la gente discute: se lee en el navegador, la portada no toca la base. */}
      <ConversacionesVivas
        encabezado={<Encabezado id="comunidad-portada" rotulo="Comunidad" titulo="¿De qué está hablando la gente?" />}
      />

      {/* 3. ¿Qué gano con una cuenta? */}
      <SeccionEspacio />

      {/* 4. ¿Qué más hay? */}
      <section id="explorar" aria-labelledby="explorar-titulo" className="scroll-mt-24 space-y-4">
        <Encabezado
          id="explorar-titulo"
          rotulo="Todo lo que hay"
          titulo="¿Qué quieres mirar?"
          enlace={{ href: "/buscar", texto: "Buscar en todo" }}
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {MENU.map((g) => (
            <Tema key={g.id} grupo={g} />
          ))}
        </div>
      </section>

      {/* El pie de la portada declara los límites: a 12 px en un teléfono nadie lo lee. */}
      <p className="px-1 text-[13px] leading-relaxed text-ink-soft sm:text-xs">
        Herramienta independiente y no oficial. Los datos se muestran tal como los
        publican sus fuentes; ninguna cifra del Estado se guarda en una base de datos
        propia. Las cifras del Congreso marcadas «de {PAGINAS_CONGRESO * SIL_PAGE_SIZE}»
        salen de una muestra acotada, no del corpus completo.{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          Mira el estado y los límites de cada fuente
        </Link>
        .
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ encabezados */

/** El encabezado de un bloque: epígrafe, la pregunta y, si hay, adónde sigue. */
function Encabezado({
  id,
  rotulo,
  titulo,
  enlace: siguiente,
}: {
  id: string;
  rotulo: string;
  titulo: string;
  enlace?: { href: string; texto: string };
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div>
        <Rotulo>{rotulo}</Rotulo>
        <h2 id={id} className="font-display mt-1 text-2xl text-ink sm:text-[28px]">
          {titulo}
        </h2>
      </div>
      {siguiente && (
        <Button asChild variant="link" className="-mb-1 gap-1.5 px-0 font-semibold">
          <Link href={siguiente.href}>
            {siguiente.texto}
            <IconArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------ indicadores clave */

/**
 * Las cuatro cifras del país que más se preguntan, en una tira: la deuda, el
 * dólar, la gasolina y las remesas. Cada una con su fuente y su fecha debajo
 * (`Cifra`), cada una esperando solo a su fuente. Los tableros enteros, con
 * sus series y comparaciones, están en `/indicadores`.
 */
function IndicadoresClave() {
  return (
    <Card as="section" aria-label="Indicadores clave del país" className="overflow-hidden">
      <TiraDeCifras>
        <Suspense fallback={<CifraEsqueleto etiqueta="Deuda pública" />}>
          <CifraDeuda />
        </Suspense>
        <Suspense fallback={<CifraEsqueleto etiqueta="Dólar (venta)" />}>
          <CifraDolar />
        </Suspense>
        <Suspense fallback={<CifraEsqueleto etiqueta="Gasolina premium" />}>
          <CifraGasolina />
        </Suspense>
        <Suspense fallback={<CifraEsqueleto etiqueta="Remesas del mes" />}>
          <CifraRemesas />
        </Suspense>
      </TiraDeCifras>
    </Card>
  );
}

function CifraEsqueleto({ etiqueta }: { etiqueta: string }) {
  return (
    <div className="flex flex-col gap-1" aria-busy="true">
      <span className="text-xs leading-tight text-ink-soft">{etiqueta}</span>
      <Skeleton className="h-7 w-32 bg-hairline/70" />
      <Skeleton className="h-3 w-40 bg-hairline/70" />
    </div>
  );
}

/** Cuando la fuente no contesta: la cifra no se inventa, se dice. */
function CifraCaida({ etiqueta }: { etiqueta: string }) {
  return <Cifra etiqueta={etiqueta} valor={SIN_DATO} nota="La fuente no respondió. Vuelve sola cuando el origen se restablece." />;
}

async function CifraDeuda() {
  const d = await getDeuda();
  if (!d) return <CifraCaida etiqueta="Deuda pública" />;
  return (
    <Cifra
      etiqueta="Deuda pública"
      valor={formatMagnitud(d.saldoTotal)}
      nota={`Crédito Público · saldo a ${d.periodo}${d.desdeInstantanea && d.generadoEn ? ` · instantánea del ${formatFecha(d.generadoEn)}` : ""}`}
    />
  );
}

async function CifraDolar() {
  const t = await getTasa();
  if (!t) return <CifraCaida etiqueta="Dólar (venta)" />;
  return (
    <Cifra
      etiqueta="Dólar (venta)"
      valor={`RD$\u00a0${t.ultimo.venta.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      nota={`Banco Central · ${formatFecha(t.ultimo.fecha)}`}
    />
  );
}

async function CifraGasolina() {
  const c = await getCombustibles();
  const premium = c?.precios.find((p) => /gasolina\s+premium/i.test(p.nombre));
  if (!c || !premium) return <CifraCaida etiqueta="Gasolina premium" />;
  return (
    <Cifra
      etiqueta="Gasolina premium, el galón"
      valor={`RD$\u00a0${premium.precio.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      nota={`MICM${c.semana ? ` · semana del ${c.semana}` : ""}`}
    />
  );
}

async function CifraRemesas() {
  const m = await getMacro();
  const r = m.remesas;
  if (!r) return <CifraCaida etiqueta="Remesas del mes" />;
  return (
    <Cifra
      etiqueta="Remesas del mes"
      valor={r.unidad === "millones de US$" ? formatMagnitud(r.valor) : `${r.valor} ${r.unidad}`}
      nota={`Banco Central · ${r.periodo}${r.preliminar ? " · preliminar" : ""}`}
    />
  );
}

/* ---------------------------------------------------------- tu espacio */

/**
 * Para qué sirve la cuenta, dicho con lo que se hace y no con adjetivos. El
 * ejemplo de la derecha es la **forma** de una investigación —tipos de
 * registro y lo que los une—, sin nombres: un caso inventado con una
 * institución real sería una acusación que nadie hizo.
 */
function SeccionEspacio() {
  const razones: { Icon: (p: { className?: string }) => React.ReactElement; titulo: string; texto: string }[] = [
    { Icon: IconBookmark, titulo: "Guarda lo que encuentras", texto: "Una compra, una ley, un proveedor, una sentencia, una búsqueda: con un toque desde su ficha." },
    { Icon: IconFolder, titulo: "Arma proyectos", texto: "Junta registros de toda la plataforma en un mismo lugar, con su descripción." },
    { Icon: IconLink, titulo: "Enlaza y anota", texto: "Di qué une a dos registros («la adjudicó», «la firmó») y anota qué encontraste en cada uno." },
    { Icon: IconShare, titulo: "Publica o trabaja en equipo", texto: "Publica el proyecto con tu firma o invita a otras personas a editarlo o leerlo." },
    { Icon: IconBell, titulo: "Entérate de lo que cambia", texto: "Lo que sigues viaja con tu cuenta: al entrar, en cualquier dispositivo, ves qué cambió." },
  ];
  const ejemplo: { tipo: string; que: string; une?: string }[] = [
    { tipo: "Institución", que: "Un ministerio", une: "publicó" },
    { tipo: "Compra pública", que: "Un proceso de compra", une: "lo ganó" },
    { tipo: "Proveedor", que: "Una empresa", une: "aparece en" },
    { tipo: "Sentencia", que: "Un fallo del Tribunal Constitucional" },
  ];
  return (
    <section aria-labelledby="espacio" className="space-y-4">
      <Encabezado id="espacio" rotulo="Tu espacio" titulo="¿Trabajas en un tema? No lo dejes en veinte pestañas." />
      <Card className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_22rem]">
        <div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {razones.map(({ Icon, titulo, texto }) => (
              <li key={titulo} className="flex gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <div>
                  <p className="text-sm font-semibold text-ink">{titulo}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft sm:text-sm">{texto}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <LlamadaCuenta />
            <p className="text-xs leading-relaxed text-ink-soft">
              Gratis. Entras con un código al correo o, si la creas, con tu contraseña. Guardamos lo que eliges, nunca
              los datos del Estado, que siguen leyéndose de su fuente.{" "}
              <Link href="/cuenta" className="font-medium text-brand-700 hover:underline">
                Qué guardamos
              </Link>
            </p>
          </div>
        </div>

        <Card asChild className="bg-canvas p-4">
        <figure>
          <figcaption className="rotulo text-ink-soft">Así se ve un proyecto</figcaption>
          <ol className="mt-3">
            {ejemplo.map((e, i) => (
              <li key={e.tipo}>
                <Card className="px-3 py-2">
                  <Badge variant="neutro">{e.tipo}</Badge>
                  <p className="mt-1 text-sm text-ink">{e.que}</p>
                  {i === 1 && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-ink-soft">
                      <IconPencil className="h-3 w-3" />
                      Tu nota: «revisar el monto adjudicado»
                    </p>
                  )}
                </Card>
                {e.une && (
                  <p className="flex items-center gap-1.5 py-1.5 pl-4 text-xs text-ink-soft">
                    <IconLink className="h-3.5 w-3.5" />
                    {e.une}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </figure>
        </Card>
      </Card>
    </section>
  );
}

/* ------------------------------------------------------------ el mapa */

/**
 * Un tema del índice (`lib/menu.ts`): su pregunta, su entrada principal y
 * todas sus secciones a la vista, cada una con su punto de color y sus
 * destinos. Es el mismo árbol del megamenú y de la barra de sección, así que
 * el punto que el lector ve aquí es el que encuentra arriba al llegar.
 *
 * Los destinos estaban plegados tras «Ver sus 14 destinos»: el mapa de la
 * plataforma, justo en el bloque que se llama «Todo lo que hay», escondía
 * lo que había. Quien baja hasta aquí vino a verlo.
 */
function Tema({ grupo }: { grupo: GrupoMenu }) {
  return (
    <Card as="article" aria-labelledby={`tema-${grupo.id}`} className="flex flex-col p-5">
      <Rotulo id={`tema-${grupo.id}`}>{grupo.label}</Rotulo>
      <p className="mt-1.5 text-sm leading-relaxed text-ink">{grupo.resumen}</p>
      <Card className="relative mt-3 bg-canvas px-3.5 py-3">
        <Link href={grupo.destacado.href} className="estira text-sm font-semibold text-brand-700">
          {grupo.destacado.label}
        </Link>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{grupo.destacado.nota}</p>
      </Card>
      <div className="mt-5 space-y-5">
        {grupo.columnas.map((c) => {
          // La portada no se ofrece a sí misma.
          const enlaces = c.enlaces.filter((e) => e.href !== "/");
          return (
            <section key={c.titulo} aria-label={c.titulo}>
              <h3 className="flex items-center gap-2 border-b border-hairline pb-2 text-xs font-semibold uppercase tracking-wide text-ink">
                <span aria-hidden className={`h-2 w-2 rounded-full ${puntoDe(c)}`} />
                {c.titulo}
              </h3>
              {/*
                En el teléfono, dos nombres por fila y sin la línea de qué hay:
                con ella el mapa medía 3,500 px a 390, y la línea sigue en la
                hoja «Más». Desde `sm`, una fila por destino con su línea.
              */}
              <ul className="grid grid-cols-2 gap-x-4 sm:grid-cols-1 sm:divide-y sm:divide-hairline">
                {enlaces.map((e) => (
                  <li key={e.href} className="relative flex min-h-11 flex-col justify-center py-1.5 sm:min-h-0 sm:py-2">
                    <Link href={e.href} className="estira text-sm font-medium leading-snug text-ink">
                      {e.label}
                    </Link>
                    <p className="hidden text-xs leading-snug text-ink-soft sm:block">{e.nota}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------- piezas asíncronas */

/** Los decretos más recientes, del año en curso, como panel de «Esta semana». */
async function PanelDecretos() {
  const { docs, origen } = await consultarNormativa("3", new Date().getFullYear());
  const recientes = docs.slice(0, 4);
  return (
    <Panel titulo="Lo último que decretó el Ejecutivo" nota={`${recientes.length}`} href="/normativa" Icon={IconDoc}>
      {origen === null ? (
        <Vacio caida texto="La Consultoría Jurídica no respondió. Los decretos vuelven solos cuando el origen se restablece." />
      ) : recientes.length === 0 ? (
        <Vacio texto="Todavía no hay decretos publicados este año." />
      ) : (
        <>
          <ul className="divide-y divide-hairline">
            {recientes.map((d) => (
              <li key={d.numero}>
                <Link
                  href={enlace.norma("decreto", d.numero) ?? "/normativa"}
                  className="block px-5 py-3 transition-colors hover:bg-canvas/60"
                >
                  <span className="font-mono text-xs font-semibold tabular-nums text-brand-700">Decreto {d.numero}</span>
                  <span className="mt-0.5 line-clamp-2 text-sm leading-snug text-ink">{desdeMayusculas(d.titulo)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {origen !== "vivo" && (
            <p className="px-5 pb-3 text-xs text-ink-soft">Instantánea del {formatFecha(origen)}.</p>
          )}
        </>
      )}
    </Panel>
  );
}

async function DominioCompras() {
  const compras = await procesosRecientes();
  const procesos = compras?.payload.content ?? [];
  const abiertos = procesos.filter((p) => p.estado_proceso === "Proceso publicado");
  const montoAbierto = abiertos.reduce((s, p) => s + (p.monto_estimado || 0), 0);

  return (
    <Dominio
      titulo={hue.licitaciones.nombre}
      fuente={hue.licitaciones.descriptor}
      chip={hue.licitaciones.hue.chip}
      href="/licitaciones"
      cta="Buscar procesos"
      Icon={IconCoins}
      disponible={compras !== null}
      cifras={
        compras
          ? [
              {
                etiqueta: "Abiertos, de lo publicado en 30 días",
                valor: procesos.length >= 1000 ? `${formatInt(abiertos.length)} o más` : formatInt(abiertos.length),
                destacar: true,
              },
              {
                etiqueta: "Monto en juego",
                valor: formatMonto(montoAbierto, "DOP"),
              },
              {
                etiqueta: "Publicados (30 días)",
                // El pedido trae hasta 1.000: si llega al tope, lo dice.
                valor: procesos.length >= 1000 ? `${formatInt(1000)} o más` : formatInt(procesos.length),
              },
            ]
          : []
      }
    />
  );
}

async function DominioFinanzas() {
  const fiscal = await getResumenFiscal();
  return (
    <Dominio
      titulo={hue.finanzas.nombre}
      fuente={hue.finanzas.descriptor}
      chip={hue.finanzas.hue.chip}
      href="/finanzas"
      cta="Ver la ejecución"
      Icon={IconTrendingUp}
      disponible={fiscal !== null}
      cifras={
        fiscal
          ? [
              {
                etiqueta: `Devengado en ${fiscal.anio}`,
                valor: formatPesos(fiscal.devengado),
                destacar: true,
              },
              {
                etiqueta: "De su presupuesto vigente",
                valor:
                  fiscal.ejecucion === null
                    ? SIN_DATO
                    : `${(fiscal.ejecucion * 100).toFixed(1)} %`,
              },
              {
                etiqueta: "Corte",
                valor: etiquetaCorte(fiscal.mesCorte, fiscal.anio),
              },
            ]
          : []
      }
    />
  );
}

async function DominioCongreso({ diasCierre }: { diasCierre: number | null }) {
  const [censoCongreso, censoSenado] = await Promise.all([
    getCountIniciativas(),
    getCensoSenado(),
  ]);

  return (
    <Dominio
      titulo={hue.congreso.nombre}
      fuente={hue.congreso.descriptor}
      chip={hue.congreso.hue.chip}
      href="/congreso"
      cta="Ver iniciativas"
      Icon={IconLayers}
      disponible={censoCongreso !== null || censoSenado !== null}
      cifras={[
        ...(censoCongreso !== null
          ? [
              {
                etiqueta: "Iniciativas en Diputados",
                valor: formatInt(censoCongreso),
                destacar: true,
              },
            ]
          : []),
        ...(censoSenado !== null
          ? [
              {
                etiqueta: "Expedientes en el Senado",
                valor: formatInt(censoSenado),
              },
            ]
          : []),
        ...(diasCierre !== null
          ? [{ etiqueta: "Cierra la legislatura en", valor: `${diasCierre} días` }]
          : []),
      ]}
    />
  );
}

async function DominioNomina() {
  const nomina = await getResumenNomina();
  return (
    <Dominio
      titulo={hue.nomina.nombre}
      fuente={hue.nomina.descriptor}
      chip={hue.nomina.hue.chip}
      href="/nomina"
      cta="Explorar la nómina"
      Icon={IconChartBar}
      disponible={nomina !== null}
      cifras={
        nomina
          ? [
              {
                etiqueta: "Empleados públicos contados",
                valor: formatInt(nomina.plazas),
                destacar: true,
              },
              {
                etiqueta: "Masa salarial mensual",
                valor: formatCompactDOP(nomina.gastoMensual),
              },
              {
                etiqueta: "Instituciones cubiertas",
                valor: formatInt(nomina.instituciones),
              },
            ]
          : []
      }
    />
  );
}

async function PanelCierran() {
  const compras = await procesosRecientes();
  const procesos = compras?.payload.content ?? [];
  const cierranPronto = procesos
    .filter((p) => p.estado_proceso === "Proceso publicado")
    .map((p) => ({ p, dias: diasHasta(p.fecha_fin_recepcion_ofertas) }))
    .filter((x) => x.dias !== null && x.dias >= 0 && x.dias <= 7)
    .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0));

  return (
    <Panel
      titulo="Cierran esta semana"
      nota={`${cierranPronto.length}`}
      href="/licitaciones?orden=cierre"
      Icon={IconClock}
    >
      {cierranPronto.length > 0 ? (
        <ul className="divide-y divide-hairline">
          {cierranPronto.slice(0, 5).map(({ p, dias }) => (
            <li key={p.codigo_proceso}>
              <Link
                href={enlace.proceso(p.codigo_proceso)}
                className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-canvas/60"
              >
                <Badge
                  forma="etiqueta"
                  variant="alerta"
                  className="mt-0.5 font-mono tabular-nums ring-1 ring-inset ring-alerta-600/20"
                >
                  {dias === 0 ? "hoy" : `${dias} d`}
                </Badge>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm text-ink">{p.titulo}</span>
                  <span className="mt-0.5 block truncate text-xs text-ink-soft">
                    {p.unidad_compra}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : compras === null ? (
        <Vacio
          caida
          texto="La DGCP no respondió. Los datos vuelven solos cuando el origen se restablece."
        />
      ) : (
        <Vacio texto="Ningún proceso abierto cierra en los próximos 7 días." />
      )}
    </Panel>
  );
}

async function PanelPerencion({
  legislatura,
  diasCierre,
}: {
  legislatura: Legislatura | null;
  diasCierre: number | null;
}) {
  const muestra = await muestrearIniciativas(PAGINAS_CONGRESO);
  const resumen = resumirIniciativas(muestra.iniciativas);

  return (
    <Panel
      titulo="Se archivan al cerrar la legislatura"
      nota={`${resumen.enRiesgo.length}`}
      alcance={`De una muestra de ${formatInt(muestra.iniciativas.length)} iniciativas del SIL, no del total.`}
      href="/congreso/perencion"
      Icon={IconClock}
    >
      {resumen.enRiesgo.length > 0 ? (
        <ul className="divide-y divide-hairline">
          {resumen.enRiesgo.slice(0, 5).map((ini) => (
            <li key={ini.id}>
              <Link
                href={enlace.iniciativa(ini.id)}
                className="block px-5 py-3 transition-colors hover:bg-canvas/60"
              >
                <span className="line-clamp-2 text-sm text-ink">{ini.titulo}</span>
                <span className="mt-0.5 block font-mono text-xs tabular-nums text-ink-soft">
                  {ini.numero?.completo ?? `#${ini.id}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Vacio
          texto={
            legislatura && diasCierre !== null
              ? `La legislatura cierra en ${diasCierre} días; la alerta se activa a ${VENTANA_ALERTA_DIAS}.`
              : "Sin legislatura ordinaria en curso."
          }
        />
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------- piezas */

type Cifra = { etiqueta: string; valor: string; destacar?: boolean };
type Icono = (p: { className?: string }) => React.ReactElement;

/** Matices por vertical, indexados desde la fuente única de la IA. */
const hue = Object.fromEntries(SECCIONES.map((s) => [s.id, s])) as Record<
  (typeof SECCIONES)[number]["id"],
  (typeof SECCIONES)[number]
>;

function Dominio({
  titulo,
  fuente,
  chip,
  href,
  cta,
  Icon,
  cifras,
  disponible,
}: {
  titulo: string;
  fuente: string;
  chip: string;
  href: string;
  cta: string;
  Icon: Icono;
  cifras: Cifra[];
  disponible: boolean;
}) {
  return (
    <Card as="article" className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${chip}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <CardTitle className="text-base tracking-tight">{titulo}</CardTitle>
          <p className="mt-0.5 text-xs text-ink-soft">{fuente}</p>
        </div>
      </div>

      {disponible ? (
        <dl className="mt-4 flex-1 space-y-2.5">
          {/*
            En el teléfono cada tarjeta enseña su cifra destacada y nada más:
            las cuatro apiladas medían mil píxeles antes de llegar a lo que
            vence esta semana. El desglose vuelve desde `sm`, y está entero en
            la vertical, a un toque.
          */}
          {cifras.map((c) => (
            <div
              key={c.etiqueta}
              className={cn(
                "items-baseline justify-between gap-3",
                // A cuatro columnas la tarjeta mide 200 px de texto: la cifra
                // destacada baja bajo su etiqueta en vez de estrujarla.
                c.destacar ? "flex lg:flex-col lg:items-start lg:gap-0.5" : "hidden sm:flex",
              )}
            >
              {/*
                En teléfono la tarjeta ocupa el ancho entero y la etiqueta
                puede respirar a 13 px; desde `sm` la rejilla la estrecha a un
                cuarto de pantalla y vuelve a 12 px para no partirse.
              */}
              <dt className="text-[13px] leading-snug text-ink-soft sm:text-xs">
                {c.etiqueta}
              </dt>
              <dd
                className={
                  c.destacar
                    ? "shrink-0 whitespace-nowrap text-right font-mono text-lg font-semibold tabular-nums tracking-tight text-ink lg:text-left"
                    : "text-right font-mono text-sm font-semibold tabular-nums text-ink"
                }
              >
                {c.valor}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        /*
          Una fuente caída no se puede leer como un dato: la marca en ocre dice
          en una palabra que no pudimos mirar —no que no haya nada— y el párrafo
          añade lo que sigue en pie. La acción útil es la misma de abajo: entrar
          a la vertical, que conserva lo que sí cargó.
        */
        <div className="mt-4 flex-1">
          <MarcaEstado tono="aviso">Sin respuesta</MarcaEstado>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            La fuente no respondió. Los datos vuelven solos cuando el origen se
            restablece.
          </p>
        </div>
      )}

      {/*
        La llamada de la tarjeta es el objetivo táctil principal del panorama:
        con `h-auto` medía 20 px de alto. Ahora toma la altura de la primitiva
        —44 px en teléfono, 40 desde `sm`— y `px-0` la mantiene a ras del
        margen de la tarjeta.
      */}
      <Button asChild variant="link" className="mt-3 justify-start gap-1.5 px-0 font-semibold">
        <Link href={href}>
          {cta}
          <IconArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </Card>
  );
}

/** La tarjeta de un dominio con su cabecera real y las cifras aún en blanco. */
function DominioEsqueleto({
  seccion,
  Icon,
}: {
  seccion: keyof typeof hue;
  Icon: Icono;
}) {
  const s = hue[seccion];
  return (
    <Card as="article" aria-busy="true" className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${s.hue.chip}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <CardTitle className="text-base tracking-tight">{s.nombre}</CardTitle>
          <p className="mt-0.5 text-xs text-ink-soft">{s.descriptor}</p>
        </div>
      </div>
      {/*
        Las tres filas y la llamada miden aquí exactamente lo que miden llenas
        —28 px la cifra destacada, 20 px las otras dos, 44 px el enlace—, que
        es lo único que evita que la tarjeta dé un salto al llegar el dato.
      */}
      <div className="mt-4 flex-1 space-y-2.5">
        <div className="flex h-7 items-center justify-between gap-3">
          <Skeleton className="h-3 w-28 bg-hairline/70" />
          <Skeleton className="h-5 w-16 bg-hairline/70" />
        </div>
        <div className="flex h-5 items-center justify-between gap-3">
          <Skeleton className="h-3 w-24 bg-hairline/70" />
          <Skeleton className="h-3.5 w-20 bg-hairline/70" />
        </div>
        <div className="flex h-5 items-center justify-between gap-3">
          <Skeleton className="h-3 w-32 bg-hairline/70" />
          <Skeleton className="h-3.5 w-12 bg-hairline/70" />
        </div>
      </div>
      <span className="mt-3 flex h-11 items-center text-sm text-ink-soft sm:h-10">
        Consultando la fuente…
      </span>
    </Card>
  );
}

function Panel({
  titulo,
  nota,
  alcance,
  href,
  Icon,
  children,
}: {
  titulo: string;
  nota: string;
  /** Lo que la lista no es —una muestra, un corte—, dicho junto a ella. */
  alcance?: string;
  href: string;
  Icon: Icono;
  children: React.ReactNode;
}) {
  return (
    <Card as="section">
      {/*
        A 390 px dos de los tres titulares no dejan sitio para el enlace, y la
        cabecera envolvía: «Ver todas» caía solo en un segundo renglón, lejos
        de lo que nombra. Ahora la cabecera no envuelve; el titular se parte
        en dos líneas (`min-w-0`) y el enlace se queda a su lado.
      */}
      <CardHeader className="flex-nowrap">
        <CardTitle className="flex min-w-0 items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />
          <span className="min-w-0">{titulo}</span>
        </CardTitle>
        <CardAction>
          <Button asChild variant="link" className="-my-1.5 -mr-2 px-2 text-xs">
            <Link href={href}>Ver todas</Link>
          </Button>
        </CardAction>
      </CardHeader>
      {children}
      {alcance && <p className="border-t border-hairline px-5 py-2.5 text-xs leading-relaxed text-ink-soft">{alcance}</p>}
      <span className="sr-only">{nota}</span>
    </Card>
  );
}

function PanelEsqueleto({ titulo, href, Icon }: { titulo: string; href: string; Icon: Icono }) {
  return (
    <div aria-busy="true">
      <Panel titulo={titulo} nota="" href={href} Icon={Icon}>
        {/*
          Cinco filas de 82 px con su filete: exactamente las que va a haber y
          exactamente lo que miden llenas —sello, dos líneas de titular y la
          línea de registro—. El bloque de párrafos genérico que había antes
          medía 160 px contra los 410 del contenido, y el panorama entero daba
          un tirón de un cuarto de pantalla al llegar el dato.
        */}
        <ul aria-hidden className="divide-y divide-hairline">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex h-[82px] items-start gap-3 px-5 py-3">
              <Skeleton className="h-[18px] w-11 shrink-0 bg-hairline/70" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-11/12 bg-hairline/70" />
                <Skeleton className="h-3.5 w-2/3 bg-hairline/70" />
                <Skeleton className="h-3 w-1/3 bg-hairline/70" />
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/**
 * El hueco de un panel. `caida` lo separa de «no hay nada»: con la marca en
 * ocre delante, el lector sabe que no pudimos mirar —no que el Estado no tenga
 * nada que cerrar esta semana—, que es la distinción que manda la ergonomía.
 * El texto sube a 14 px: a 12 px centrados en medio de un panel vacío parecía
 * una nota al pie de algo que no estaba.
 */
function Vacio({ texto, caida = false }: { texto: string; caida?: boolean }) {
  return (
    <div className="px-5 py-8 text-center">
      {caida && <MarcaEstado tono="aviso">Sin respuesta</MarcaEstado>}
      <p className={`text-sm leading-relaxed text-ink-soft ${caida ? "mt-2" : ""}`}>
        {texto}
      </p>
    </div>
  );
}
