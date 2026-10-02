import Link from "next/link";
import { cache, Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import IniciativaCard from "@/components/iniciativa-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EstadoVacio } from "@/components/estado-vacio";
import { Paginador } from "@/components/paginador";
import { BarraFiltros, type ChipFiltro } from "@/components/barra-filtros";
import { FiltroEnlace, NavFiltros } from "@/components/nav-filtros";
import BuscadorCongreso from "./buscador-congreso";
import SelectorTema from "./selector-tema";
import { hrefCongreso, TIPO_INICIAL, type FiltrosCongreso } from "./filtros";
import { Esqueleto, EsqueletoFilas } from "@/components/esqueleto";
import {
  buscarIniciativasTolerante,
  fraseParaSil,
  getGrupos,
  limpiarTexto,
  listIniciativasFiltradas,
  normalizarIniciativa,
  SIL_PAGE_SIZE,
  legislaturaVigente,
  diffDias,
  type TipoIniciativa,
  type BusquedaIniciativas,
  type SilIniciativa,
  type SilPage,
} from "@/lib/congreso";
import { TONOS } from "@/lib/estados";
import { cn } from "@/lib/cn";
import { IconArrowRight, IconClock } from "@/components/icons";
import { Termino } from "@/components/termino";
import { recortar } from "@/lib/raiz";

export const metadata: Metadata = {
  alternates: { canonical: "/congreso" },
  title: "Cámara de Diputados",
  description:
    "Busca iniciativas legislativas de la Cámara de Diputados dominicana: estado procesal, trámites, proponentes y alertas de perención.",
};

export const revalidate = 300;

/*
  La página se pinta en tres tiempos. La cabecera, la alerta de legislatura y
  el buscador no dependen del SIL y llegan con la primera respuesta. Los
  filtros esperan a los temas del SIL (cacheados un día) en su propio
  `Suspense`, y el listado espera a la página de iniciativas en el suyo. Quien
  busca ve al instante que la búsqueda se está haciendo, en lugar de una
  pantalla congelada mientras el SIL tarda: con el SIL lento, el `fetch` de
  los temas podía retener la página entera hasta 25 s por intento.
*/

interface ParamsCongreso {
  q?: string;
  page?: string;
  tema?: string;
  tipo?: string;
  estado?: string;
  /** Enlace viejo: el tema por su nombre, que se filtraba sobre una sola página. */
  grupo?: string;
}

type Tema = { id: number; nombre: string };

/**
 * Los 15 temas del SIL. `cache` porque los piden los filtros y el listado en
 * la misma petición: una sola lectura. Si el SIL no contesta, la lista queda
 * vacía, el selector no se pinta y el listado es el registro entero.
 */
const leerTemas = cache(async (): Promise<Tema[]> =>
  (await getGrupos()).map((g) => ({ id: g.id, nombre: limpiarTexto(g.descripcion) })),
);

/**
 * El tema que de verdad vale: el id pedido si el SIL lo conoce o, en un
 * enlace viejo, el nombre de `?grupo=`. Se resuelve dentro de cada `Suspense`
 * —no con un `redirect`, que ya no puede reescribir la respuesta una vez
 * empezado el streaming—, y los enlaces que se construyen desde ahí llevan ya
 * el `?tema=` por id, así que el enlace viejo se cura al primer clic.
 */
function resolverTema(temas: Tema[], filtros: FiltrosCongreso, grupoViejo: string): Tema | null {
  return (
    temas.find((t) => t.id === filtros.tema) ??
    (grupoViejo ? temas.find((t) => t.nombre === grupoViejo) : undefined) ??
    null
  );
}

/** Los filtros con el tema resuelto; sin tema, tipo y estado vuelven a los de fábrica. */
function conTemaResuelto(filtros: FiltrosCongreso, tema: Tema | null): FiltrosCongreso {
  return tema ? { ...filtros, tema: tema.id } : { ...filtros, tema: null };
}

export default async function CongresoPage({
  searchParams,
}: {
  searchParams: Promise<ParamsCongreso>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  // El tema tal como llega en la URL; lo validan contra el SIL los filtros y
  // el listado, cada uno dentro de su `Suspense`.
  const temaPedido = Number(params.tema);
  const grupoViejo = params.grupo?.trim() ?? "";
  const filtros: FiltrosCongreso = {
    q: recortar(params.q, 120),
    tema: Number.isInteger(temaPedido) && temaPedido > 0 ? temaPedido : null,
    tipo: params.tipo === "resolucion" ? "resolucion" : TIPO_INICIAL,
    perimidas: params.estado === "perimidas",
  };

  const legislatura = legislaturaVigente();
  const diasParaCierre = legislatura ? diffDias(new Date(), legislatura.cierre) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-5">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          Cámara de Diputados
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          <Termino clave="iniciativa">Iniciativas</Termino> en vivo desde el SIL de la Cámara.{" "}
          <Link
            href="/congreso/senado"
            className="font-medium text-brand-700 hover:underline"
          >
            El Senado tiene su propia vista
          </Link>
          .
          {" "}
          <Link href="/congreso/guia" className="font-medium text-brand-700 hover:underline">
            ¿Cómo nace una ley?
          </Link>
        </p>
      </header>

      {/* La tarjeta que es un enlace toma el relieve sola (app/globals.css);
          un `transition-colors` aquí le quitaba la transición del canto. */}
      {legislatura && diasParaCierre !== null && (
        <Card asChild className="mb-5">
          <Link href="/congreso/perencion" className="flex items-center gap-3 px-4 py-3">
          <IconClock className="h-5 w-5 shrink-0 text-alerta-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">
              {legislatura.nombre} {legislatura.anio}
            </p>
            <p className="text-xs text-ink-soft">
              {diasParaCierre === 1 ? "Queda" : "Quedan"}{" "}
              <span className="font-mono font-semibold tabular-nums text-ink">
                {diasParaCierre} {diasParaCierre === 1 ? "día" : "días"}
              </span>{" "}
              antes de que las piezas pendientes se perimen.
            </p>
          </div>
          <IconArrowRight className="h-4 w-4 shrink-0 text-ink-soft" />
          </Link>
        </Card>
      )}

      <BuscadorCongreso initial={filtros.q} filtros={filtros} />

      {/*
        Sin `key`: al cambiar de filtro, los filtros de antes siguen a la vista
        mientras llegan los nuevos (los temas ya están en caché), en vez de
        parpadear en silueta a cada clic.
      */}
      <Suspense fallback={<FiltrosEsqueleto conTema={filtros.tema !== null || !!grupoViejo} />}>
        <FiltrosCargados filtros={filtros} grupoViejo={grupoViejo} />
      </Suspense>

      <Suspense
        key={`${hrefCongreso(filtros, page)}|${grupoViejo}`}
        fallback={<ListaEsqueleto q={filtros.q} />}
      >
        <ListaIniciativas filtros={filtros} grupoViejo={grupoViejo} page={page} />
      </Suspense>
    </div>
  );
}

async function FiltrosCargados({
  filtros,
  grupoViejo,
}: {
  filtros: FiltrosCongreso;
  grupoViejo: string;
}) {
  const temas = await leerTemas();
  if (temas.length === 0) return null;
  const tema = resolverTema(temas, filtros, grupoViejo);
  return (
    <FiltrosIniciativas
      filtros={conTemaResuelto(filtros, tema)}
      temas={temas}
      nombreTema={tema?.nombre ?? null}
    />
  );
}

/**
 * La silueta de la barra de filtros mientras el SIL da los temas. Las alturas
 * se midieron contra la barra real: a 390 px, 44 px sin tema (el botón
 * «Filtros») y 135 con tema (botón, fila de chips y la nota de los fijos, en
 * dos líneas); a 1366, 91,5 y 157 px el panel entero.
 */
function FiltrosEsqueleto({ conTema }: { conTema: boolean }) {
  return (
    <div aria-hidden className="mt-4">
      <div className="lg:hidden">
        <Esqueleto className="h-11 w-32 sm:h-10" />
        {conTema && (
          <>
            <Esqueleto className="-mb-0.5 mt-2 h-10 w-full" />
            <div className="mt-1.5 h-[2.4375rem] sm:h-[1.21875rem]" />
          </>
        )}
      </div>
      <div className={cn("hidden lg:block", conTema ? "h-[9.8125rem]" : "h-[5.71875rem]")}>
        <Esqueleto className="h-[3.75rem] w-full" />
      </div>
    </div>
  );
}

/** Cómo se nombra cada tipo en el chip y en el recuento. */
const NOMBRE_TIPO: Record<TipoIniciativa, string> = {
  ley: "proyectos de ley",
  resolucion: "resoluciones",
};

/*
  Tema, tipo y estado: exactamente lo que el SIL sabe filtrar, y nada más.

  El listado del SIL solo corta por tipo y por perimidas **dentro de un tema**
  (docs/INFRAESTRUCTURA.md §5.5): no existe «los proyectos de ley de todos los temas», y
  fabricarlo filtrando la página de diez del registro entero daría páginas de
  tres filas y un recuento que no corresponde a nada. Así lo hacía antes el
  tema, y por eso se quitó. Sin tema, tipo y estado se ven apagados y dicen por
  qué; con tema, toman los valores con los que abre el propio portal del SIL
  —proyectos de ley, sin las perimidas— y se enseñan como chips de fábrica,
  porque son los que más recortan.
*/
function FiltrosIniciativas({
  filtros,
  temas,
  nombreTema,
}: {
  filtros: FiltrosCongreso;
  temas: { id: number; nombre: string }[];
  nombreTema: string | null;
}) {
  const conTema = filtros.tema !== null;
  const chips: ChipFiltro[] = [];
  if (conTema && nombreTema) {
    chips.push({
      clave: "tema",
      label: nombreTema,
      href: hrefCongreso({ ...filtros, tema: null }),
    });
    chips.push(
      filtros.tipo === TIPO_INICIAL
        ? {
            clave: "tipo",
            label: NOMBRE_TIPO.ley,
            porDefecto: true,
          }
        : {
            clave: "tipo",
            label: NOMBRE_TIPO[filtros.tipo],
            href: hrefCongreso({ ...filtros, tipo: TIPO_INICIAL }),
          },
    );
    chips.push(
      filtros.perimidas
        ? {
            clave: "estado",
            label: "solo las perimidas",
            href: hrefCongreso({ ...filtros, perimidas: false }),
          }
        : {
            clave: "estado",
            label: "sin las perimidas",
            porDefecto: true,
          },
    );
  }

  return (
    <BarraFiltros
      chips={chips}
      notaFijos="Los grises vienen de fábrica: dentro de un tema el SIL siempre pide un tipo y un estado, así que se cambian, no se quitan."
      className="mt-4"
    >
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr_1fr] lg:items-start">
        <SelectorTema filtros={filtros} temas={temas} />

        <GrupoFiltro etiqueta="Tipo">
          {(["ley", "resolucion"] as const).map((tipo) => {
            const texto = tipo === "ley" ? "Proyectos de ley" : "Resoluciones";
            return conTema ? (
              <FiltroEnlace
                key={tipo}
                href={hrefCongreso({ ...filtros, tipo })}
                activo={filtros.tipo === tipo}
              >
                {texto}
              </FiltroEnlace>
            ) : (
              <FiltroApagado key={tipo}>{texto}</FiltroApagado>
            );
          })}
        </GrupoFiltro>

        <GrupoFiltro etiqueta="Estado">
          {([false, true] as const).map((perimidas) => {
            // El punto de las perimidas es el oficio `anulado` de
            // lib/estados.ts: el mismo que lleva su marca en cada fila.
            const texto = perimidas ? (
              <>
                <span
                  aria-hidden
                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONOS.anulado.dot)}
                />
                Solo las perimidas
              </>
            ) : (
              "Sin las perimidas"
            );
            return conTema ? (
              <FiltroEnlace
                key={String(perimidas)}
                href={hrefCongreso({ ...filtros, perimidas })}
                activo={filtros.perimidas === perimidas}
              >
                {texto}
              </FiltroEnlace>
            ) : (
              <FiltroApagado key={String(perimidas)}>{texto}</FiltroApagado>
            );
          })}
        </GrupoFiltro>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-ink-soft">
        {conTema ? (
          <>
            Una pieza <Termino clave="perime">perime</Termino> cuando se le
            acaba el plazo para completar el trámite y se archiva. Las
            resoluciones incluyen las internas de la Cámara y las bicamerales.
          </>
        ) : (
          "El SIL solo separa por tipo y por estado dentro de un tema: elige uno y se activan. Sin tema, la lista es el registro entero de la Cámara."
        )}
      </p>
    </BarraFiltros>
  );
}

function GrupoFiltro({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-soft">{etiqueta}</p>
      <NavFiltros etiqueta={etiqueta} className="mt-1">
        {children}
      </NavFiltros>
    </div>
  );
}

/** Un filtro que el origen no responde sin tema: se ve, apagado, y la nota dice por qué. */
function FiltroApagado({ children }: { children: ReactNode }) {
  return (
    <Button variant="secondary" size="sm" disabled className="h-10 text-ink-soft sm:h-9">
      {children}
    </Button>
  );
}

async function ListaIniciativas({
  filtros: pedidos,
  grupoViejo,
  page,
}: {
  filtros: FiltrosCongreso;
  grupoViejo: string;
  page: number;
}) {
  const { q } = pedidos;
  // El listado por tema solo acepta una frase: va con las tildes que el SIL conoce.
  const fraseTema = q && pedidos.tema !== null ? fraseParaSil(q) : Promise.resolve(q);
  const leerFiltrada = async (grupo: number, pagina = page) =>
    listIniciativasFiltradas(
      pagina,
      { grupo, tipo: pedidos.tipo, perimidas: pedidos.perimidas },
      await fraseTema,
    );

  // Los temas y la página pedida van en paralelo: con el tema de la URL casi
  // siempre válido, esperar a validarlo antes de pedir el listado sería una
  // vuelta de más al SIL.
  const adelantada = pedidos.tema !== null ? leerFiltrada(pedidos.tema) : null;
  const temas = await leerTemas();
  const tema = resolverTema(temas, pedidos, grupoViejo);
  const filtros = conTemaResuelto(pedidos, tema);
  const nombreTema = tema?.nombre ?? null;

  /*
    «No hay resultados» y «la fuente no contestó» dicen cosas opuestas sobre el
    Congreso. Las dos lecturas devuelven `null` cuando el SIL no contesta, así
    que cada pantalla sabe cuál le toca sin una petición de más.
  */
  let busqueda: BusquedaIniciativas | null = null;
  let respuesta: SilPage<SilIniciativa> | null;
  let pagina = page;
  if (filtros.tema !== null) {
    respuesta = await (filtros.tema === pedidos.tema && adelantada ? adelantada : leerFiltrada(filtros.tema));
    // Una página más allá de la última («?page=999») sirve la última, no una vacía.
    const ultima = Math.max(1, Math.ceil((respuesta?.total ?? 0) / SIL_PAGE_SIZE));
    if (respuesta && page > ultima) {
      pagina = ultima;
      respuesta = await leerFiltrada(filtros.tema, ultima);
    }
  } else {
    busqueda = await buscarIniciativasTolerante(q, page);
    respuesta = busqueda?.pagina ?? null;
    pagina = busqueda?.page ?? page;
  }
  const silCaido = respuesta === null;
  const iniciativas = (respuesta?.results ?? []).map(normalizarIniciativa);
  const total = respuesta?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / SIL_PAGE_SIZE));

  // El recuento dice sobre qué cuenta: el registro entero o un corte.
  const alcance =
    filtros.tema !== null && nombreTema
      ? `${NOMBRE_TIPO[filtros.tipo]} de ${nombreTema}, ${
          filtros.perimidas ? "solo las perimidas" : "sin las perimidas"
        }`
      : busqueda?.frase
        ? "la frase exacta en todo el registro de la Cámara"
        : busqueda?.truncado
          ? `entre las ${busqueda.leidas.toLocaleString("es-DO")} más recientes de la palabra menos común`
          : "todo el registro de la Cámara";

  return (
    <>
      <p className="mt-4 text-sm text-ink-soft" aria-live="polite">
        <span className="font-mono tabular-nums">
          {silCaido
            ? "No pudimos contar las iniciativas"
            : `${total.toLocaleString("es-DO")} ${total === 1 ? "iniciativa" : "iniciativas"}`}
        </span>
        {q ? (
          <>
            {" para "}
            <span className="font-medium text-ink">{`«${q}»`}</span>
          </>
        ) : null}
        {!silCaido && ` · ${alcance}`}
        {busqueda?.enviado ? ` · también como «${busqueda.enviado}»` : null}
      </p>

      {iniciativas.length > 0 ? (
        <Card as="section" className="mt-3">
          <ul>
            {iniciativas.map((ini) => (
              <IniciativaCard key={ini.id} iniciativa={ini} />
            ))}
          </ul>
        </Card>
      ) : silCaido ? (
        <EstadoVacio
          variante="caida"
          titulo="El SIL de la Cámara no respondió"
          className="mt-3"
          accion={
            <Button asChild variant="secondary">
              <Link href="/fuentes">Ver el estado de las fuentes</Link>
            </Button>
          }
        >
          El sistema de información legislativa de la Cámara está caído o
          rechazó la conexión. No es que no haya iniciativas: es que no pudimos
          mirar. Los datos vuelven solos cuando el origen se restablece.
        </EstadoVacio>
      ) : (
        <EstadoVacio titulo="Sin resultados" className="mt-3">
          {q
            ? "Ninguna iniciativa lleva todas esas palabras en su descripción. Prueba con menos, o con otra forma de decirlo."
            : filtros.tema !== null
              ? "El SIL no tiene iniciativas de este tema con ese tipo y ese estado. Prueba con el otro tipo o con las perimidas."
              : "El SIL no devolvió iniciativas para esta página. Vuelve a la primera o busca una palabra."}
        </EstadoVacio>
      )}

      {total > 0 && (
        <Paginador
          pagina={pagina}
          paginas={totalPaginas}
          href={(p) => hrefCongreso(filtros, p)}
          etiqueta="Paginación de iniciativas"
          className="mt-5"
        />
      )}
    </>
  );
}

function ListaEsqueleto({ q }: { q: string }) {
  return (
    <div role="status" aria-busy="true">
      <p className="mt-4 text-sm text-ink-soft">
        {q ? `Buscando «${q}» en el SIL…` : "Consultando el SIL de la Cámara…"}
      </p>
      <EsqueletoFilas n={SIL_PAGE_SIZE} className="mt-3" />
    </div>
  );
}
