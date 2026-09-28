import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import {
  RUTA_POR_TIPO,
  TIPOS_NORMATIVA,
  designacionesPorMes,
  listaNormativa,
  materiaDe,
  materiaPorSlug,
  materiasDe,
  type Documento,
  type Materia,
  type MesDesignaciones,
  type TipoNormativa,
} from "@/lib/normativa";
import { IconDownload, IconExternal, IconDoc } from "@/components/icons";
import { BuscadorUrl } from "@/components/buscador-url";
import { Card, CardTitle } from "@/components/ui/card";
import { BarrasHorizontales } from "@/components/graficos";
import { desdeMayusculas } from "@/lib/congreso";
import { formatFecha, formatMes } from "@/lib/format";
import { Esqueleto, EsqueletoFilas } from "@/components/esqueleto";
import Antiguedad from "@/components/antiguedad";
import { Button } from "@/components/ui/button";
import { EstadoVacio } from "@/components/estado-vacio";
import { FiltroEnlace, NavFiltros } from "@/components/nav-filtros";
import { Termino } from "@/components/termino";
import { Paginador } from "@/components/paginador";
import Plegable from "@/components/plegable";
import { enlace } from "@/lib/grafo";
import { Alert } from "@/components/ui/alert";
import { recortar } from "@/lib/raiz";

export const metadata: Metadata = {
  alternates: { canonical: "/normativa" },
  title: "Normativa del Ejecutivo",
  description:
    "Decretos, leyes, reglamentos, resoluciones y Gaceta Oficial de República Dominicana, en vivo desde la Consultoría Jurídica del Poder Ejecutivo.",
};

export const revalidate = 3600;

const ANIO_ACTUAL = 2026;
const ANIOS = [ANIO_ACTUAL, ANIO_ACTUAL - 1, ANIO_ACTUAL - 2, ANIO_ACTUAL - 3];

const NOMBRE_CITA: Record<string, string> = {
  ley: "la Ley",
  decreto: "el Decreto",
  reglamento: "el Reglamento",
  resolucion: "la Resolución",
};
const sinTildesMin = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** El tipo de la pestaña, para una cita tecleada sin él («606-26» en decretos). */
const TIPO_DE_CITA: Partial<Record<TipoNormativa, string>> = {
  "1": "ley",
  "3": "decreto",
  "4": "reglamento",
  "7": "resolucion",
};

/**
 * Normas por página. Un año de decretos son cientos: la lista entera en una
 * página medía 24.000 px en el teléfono y se cortaba en 200 sin decirlo hasta
 * el final. Veinticinco caben en unas pocas pantallas y el resto está a un
 * toque, en una URL que se comparte (docs/IDENTIDAD.md §2).
 */
const POR_PAGINA = 25;

/**
 * Enlace de la página con los filtros dados; lo por defecto no viaja. La
 * página no viaja salvo que se pida: cambiar de filtro vuelve a la primera.
 */
function hrefNormativa(f: {
  tipo: string;
  anio: number;
  q?: string;
  mes?: string;
  materia?: string;
  pagina?: number;
}): string {
  const p = new URLSearchParams();
  p.set("tipo", f.tipo);
  if (f.anio !== ANIO_ACTUAL) p.set("anio", String(f.anio));
  if (f.q) p.set("q", f.q);
  if (f.mes) p.set("mes", f.mes);
  if (f.materia) p.set("materia", f.materia);
  if (f.pagina && f.pagina > 1) p.set("pagina", String(f.pagina));
  return `/normativa?${p}`;
}

export default async function NormativaPage({
  searchParams,
}: {
  searchParams: Promise<{
    tipo?: string;
    anio?: string;
    q?: string;
    mes?: string;
    materia?: string;
    pagina?: string;
  }>;
}) {
  const params = await searchParams;
  const tipo = (params.tipo && params.tipo in TIPOS_NORMATIVA ? params.tipo : "3") as TipoNormativa;
  const anio = ANIOS.includes(Number(params.anio)) ? Number(params.anio) : ANIO_ACTUAL;
  const q = recortar(params.q, 80);
  // Un año que no leemos no se cambia en silencio por el actual: se dice.
  const anioFuera = params.anio && !ANIOS.includes(Number(params.anio)) ? params.anio.slice(0, 8) : null;
  // «Ley 47-25», «decreto núm. 606-26», «606-26»: una cita tiene ficha propia.
  const cita = /^(ley|decreto|reglamento|resoluci[oó]n)?\s*(?:n[uú]m(?:ero)?\.?|nos?\.?)?\s*(\d{1,4}-\d{2,4})$/i.exec(q);
  const tipoCita = cita?.[1] ?? TIPO_DE_CITA[tipo];
  const fichaCita = cita && tipoCita ? enlace.norma(tipoCita, cita[2]) : null;
  // El mes solo filtra decretos, y solo uno del año elegido.
  const mesPedido = params.mes ?? "";
  const mes =
    tipo === "3" && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesPedido) && mesPedido.startsWith(String(anio))
      ? mesPedido
      : undefined;
  // La materia solo existe en los decretos (`materiaDe`); otro valor no filtra.
  // Con un mes elegido la lista ya son sus nombramientos: la materia no viaja,
  // o una URL escrita a mano dejaría al lector sin ninguna tarjeta para salir.
  const materia = tipo === "3" && !mes ? materiaPorSlug(params.materia)?.slug : undefined;
  const nombreMateria = materiaPorSlug(materia)?.nombre;
  // La página pedida; la lista la acota a las que existen cuando sabe cuántas hay.
  const pagina = /^\d{1,4}$/.test(params.pagina ?? "") ? Math.max(1, Number(params.pagina)) : 1;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-5">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          Normativa del Poder Ejecutivo
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          <Termino clave="decreto">Decretos</Termino>, leyes,{" "}
          <Termino clave="reglamento">reglamentos</Termino>,{" "}
          <Termino clave="resolucion">resoluciones</Termino> y{" "}
          <Termino clave="gacetaOficial">Gaceta Oficial</Termino>, en vivo
          desde la Consultoría Jurídica del Poder Ejecutivo. Es la tercera pata
          del triángulo legislativo, junto a{" "}
          <Link href="/congreso" className="font-medium text-brand-700 hover:underline">
            Diputados y Senado
          </Link>
          .
        </p>
      </header>

      <Suspense>
        <BuscadorUrl
          etiqueta="Buscar en los títulos"
          placeholder="Por ejemplo: pensión o 606-26…"
          ayuda={`Busca en el número y el título de ${TIPOS_NORMATIVA[tipo].toLowerCase()} de ${anio}${
            nombreMateria ? `, solo en ${nombreMateria.toLowerCase()}` : ""
          }${mes ? `, solo en los nombramientos y ceses de ${nombreMes(mes)}` : ""}, sin distinguir tildes; todas las palabras tienen que aparecer. No busca dentro del texto de la norma.`}
        />
      </Suspense>

      {anioFuera && (
        <Alert variant="aviso" role="note" className="mt-3">
          No leemos {anioFuera}: esta vista cubre de {ANIOS.at(-1)} a {ANIO_ACTUAL}. Mostramos {anio}.
        </Alert>
      )}
      {fichaCita && (
        <p className="mt-3 text-sm text-ink-soft">
          ¿Buscas la norma misma?{" "}
          <Link href={fichaCita} className="font-medium text-brand-700 hover:underline">
            Abrir {NOMBRE_CITA[sinTildesMin(tipoCita ?? "")] ?? tipoCita} {cita?.[2]}
          </Link>
          , sea del año que sea.
        </p>
      )}

      {/*
        Filtros de tipo y de año. A 390 px las dos barras envuelven en líneas
        limpias —cinco tipos en dos líneas, cuatro años en una— sin cortar el
        último filtro; la altura táctil la pone `FiltroEnlace`, que es donde
        vive esa decisión. La búsqueda viaja con ellos: cambiar de año busca
        lo mismo en otro año.
      */}
      <NavFiltros etiqueta="Tipo de documento" className="mt-4">
        {(Object.entries(TIPOS_NORMATIVA) as [TipoNormativa, string][]).map(([code, label]) => (
          <FiltroEnlace
            key={code}
            href={hrefNormativa({ tipo: code, anio, q })}
            activo={tipo === code}
          >
            {label}
          </FiltroEnlace>
        ))}
      </NavFiltros>

      <NavFiltros etiqueta="Año" className="mt-2.5">
        {ANIOS.map((a) => (
          <FiltroEnlace
            key={a}
            href={hrefNormativa({ tipo, anio: a, q })}
            activo={anio === a}
            mono
          >
            {a}
          </FiltroEnlace>
        ))}
      </NavFiltros>

      {/*
        La Consultoría responde por año y tipo, y no siempre rápido. Los
        filtros llegan al instante; el listado cae en su hueco al contestar.
      */}
      <Suspense
        key={`${tipo}-${anio}-${q}-${mes ?? ""}-${materia ?? ""}-${pagina}`}
        fallback={<ListaEsqueleto tipo={tipo} anio={anio} conMaterias={tipo === "3" && !mes && pagina === 1} />}
      >
        <ListaNormativa tipo={tipo} anio={anio} q={q} mes={mes} materia={materia} pagina={pagina} />
      </Suspense>

      <p className="mt-4 text-xs leading-relaxed text-ink-soft">
        Fuente: Consultoría Jurídica del Poder Ejecutivo. La consulta se acota por
        año porque el origen no pagina. «Leer» abre el texto íntegro dentro de la
        plataforma, servido desde el sitio oficial.{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          Estado de las fuentes
        </Link>
        .
      </p>
    </div>
  );
}

async function ListaNormativa({
  tipo,
  anio,
  q,
  mes,
  materia,
  pagina: paginaPedida,
}: {
  tipo: TipoNormativa;
  anio: number;
  q: string;
  mes?: string;
  materia?: string;
  pagina: number;
}) {
  const { docs, origen, total, todos } = await listaNormativa({ tipo, anio, q, mes, materia });
  const paginas = Math.max(1, Math.ceil(docs.length / POR_PAGINA));
  const pagina = Math.min(paginas, paginaPedida);
  const desde = (pagina - 1) * POR_PAGINA;
  const visibles = docs.slice(desde, desde + POR_PAGINA);
  const nombreTipo = TIPOS_NORMATIVA[tipo].toLowerCase();

  /*
    «No hay» y «no contestó» dicen cosas opuestas sobre el Ejecutivo. La capa
    ya las separa: una lista con origen es una respuesta, aunque venga vacía;
    sin origen no contestó nadie. Cloudflare desafía hoy a los servidores de
    la plataforma, así que el origen suele ser la instantánea, y se dice.
  */
  const consultoriaCaida = origen === null;
  const instantanea = origen !== null && origen !== "vivo" ? origen : null;
  const designaciones = tipo === "3" && !q && !materia ? designacionesPorMes(todos) : [];
  // Las materias reparten el año entero y la búsqueda viaja con ellas; con un
  // mes elegido la lista ya es de nombramientos, así que no se ofrecen.
  const materias = tipo === "3" && !mes ? materiasDe(todos) : [];
  const nombreMateria = materiaPorSlug(materia)?.nombre;
  const enMateria = materia ? todos.filter((d) => materiaDe(d)?.slug === materia).length : total;
  const filtrada = Boolean(q || mes || materia);
  const consulta = new URLSearchParams({ tipo, anio: String(anio) });
  if (q) consulta.set("q", q);
  if (mes) consulta.set("mes", mes);
  if (materia) consulta.set("materia", materia);
  const csv = `/normativa/csv?${consulta}`;

  return (
    <>
      {/*
        Las dos tarjetas responden «¿qué pasó este año?», y eso se pregunta en
        la primera página. Desde la segunda el lector ya está recorriendo la
        lista: la tarjeta solo empujaría las normas hacia abajo, así que de
        ella queda la materia elegida con su salida.
      */}
      {materias.length > 1 && pagina === 1 && (
        <Materias materias={materias} anio={anio} q={q} activa={materia} instantanea={instantanea} />
      )}
      {nombreMateria && pagina > 1 && (
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
          <span>
            Solo <span className="font-semibold text-ink">{nombreMateria.toLowerCase()}</span>
          </span>
          <Link
            href={hrefNormativa({ tipo, anio, q })}
            className="inline-flex min-h-11 items-center font-medium text-brand-700 hover:underline sm:min-h-0"
          >
            Ver todos los decretos de {anio}
          </Link>
        </p>
      )}

      {designaciones.length > 0 && pagina === 1 && (
        <Designaciones meses={designaciones} anio={anio} mes={mes} />
      )}

      {(docs.length > 0 || filtrada) && !consultoriaCaida && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {/*
            El conteo dice también qué parte se ve: una lectura partida lo
            declara junto a la cifra, no después de la última fila.
          */}
          <p className="font-mono text-sm tabular-nums text-ink-soft" aria-live="polite">
            {filtrada
              ? `${docs.length.toLocaleString("es-DO")} de ${total.toLocaleString("es-DO")} ${nombreTipo} de ${anio}${
                  mes ? ` · nombramientos y ceses de ${nombreMes(mes)}` : ""
                }${nombreMateria ? ` · ${nombreMateria.toLowerCase()}` : ""}${q ? ` · «${q}»` : ""}`
              : `${docs.length.toLocaleString("es-DO")} ${nombreTipo} en ${anio}`}
            {paginas > 1 &&
              ` · se muestran del ${(desde + 1).toLocaleString("es-DO")} al ${(desde + visibles.length).toLocaleString("es-DO")}, lo más reciente primero`}
          </p>
          {docs.length > 0 && (
            <Button asChild variant="secondary" size="sm" className="h-10 shrink-0 self-start sm:h-9 sm:self-auto">
              <a
                href={csv}
                download
                title={`Descarga las ${docs.length.toLocaleString("es-DO")} normas de esta lista, no solo las ${visibles.length} de esta página`}
              >
                <IconDownload className="h-4 w-4" /> CSV ({docs.length.toLocaleString("es-DO")})
              </a>
            </Button>
          )}
        </div>
      )}

      {instantanea && (
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          Instantánea del {formatFecha(instantanea)}: la Consultoría rechaza hoy
          las consultas desde los servidores de la plataforma, así que lo más
          reciente puede faltar. Lo publicado después está en{" "}
          <a
            href="https://www.consultoria.gov.do/consultas?tab=legislacion"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-700 hover:underline"
          >
            el buscador oficial
          </a>
          .
        </p>
      )}

      {docs.length > 0 ? (
        <>
          <Card as="section" className="mt-3">
            <ul className="divide-y divide-hairline">
              {visibles.map((d, i) => (
                <FilaDoc key={`${d.documentId}-${desde + i}`} doc={d} />
              ))}
            </ul>
          </Card>
          {paginas > 1 && (
            <Paginador
              className="mt-3"
              pagina={pagina}
              paginas={paginas}
              href={(n) => hrefNormativa({ tipo, anio, q, mes, materia, pagina: n })}
              etiqueta={`Páginas de ${nombreTipo} de ${anio}`}
            />
          )}
        </>
      ) : consultoriaCaida ? (
        <EstadoVacio
          variante="caida"
          titulo="La Consultoría Jurídica no respondió"
          className="mt-4"
          accion={
            <Button asChild variant="secondary">
              <Link href="/fuentes">Ver el estado de las fuentes</Link>
            </Button>
          }
        >
          El buscador de la Consultoría Jurídica del Poder Ejecutivo está caído
          o rechazó la conexión. No es que no haya normativa: es que no pudimos
          mirar. Los datos vuelven solos cuando el origen se restablece.
        </EstadoVacio>
      ) : filtrada ? (
        <EstadoVacio
          titulo={
            q
              ? `Ningún título coincide con «${q}»`
              : mes
                ? "Sin decretos en ese mes"
                : `Sin decretos de ${(nombreMateria ?? "esa materia").toLowerCase()} en ${anio}`
          }
          className="mt-4"
          accion={
            <Button asChild variant="secondary">
              <Link href={hrefNormativa({ tipo, anio })}>
                Quitar la búsqueda y los filtros
              </Link>
            </Button>
          }
        >
          {q
            ? `Entre ${nombreMateria ? "los " : ""}${enMateria.toLocaleString("es-DO")} ${TIPOS_NORMATIVA[tipo].toLowerCase()}${
                nombreMateria ? ` de ${nombreMateria.toLowerCase()}` : ""
              } de ${anio}, ninguno tiene esas palabras en el número o el título. Prueba con menos palabras, otra forma de escribirlas${
                nombreMateria ? ", quita la materia" : ""
              } u otro año.`
            : mes
              ? "No hay nombramientos ni ceses con fecha de ese mes en la lista del año."
              : "Ningún decreto del año cae en esa materia. Prueba otro año o vuelve a todos los decretos."}
        </EstadoVacio>
      ) : (
        <EstadoVacio titulo="Sin resultados" className="mt-4">
          {instantanea ? "La instantánea de la Consultoría" : "La Consultoría respondió, pero"}{" "}
          no tiene {TIPOS_NORMATIVA[tipo].toLowerCase()} de {anio}.
          Prueba otro año o cambia el tipo de documento.
        </EstadoVacio>
      )}
    </>
  );
}

/** «agosto de 2026» para `2026-08`. */
function nombreMes(mes: string): string {
  return new Intl.DateTimeFormat("es-DO", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${mes}-15T12:00:00Z`),
  );
}

/**
 * Designaciones del mes: cuántos nombramientos y ceses firmó el Presidente y
 * en qué cargos. Todo sale del título del decreto y de la etiqueta que le pone
 * la Consultoría, y la tarjeta lo dice: no hay un campo «cargo» en el origen.
 */
function Designaciones({
  meses,
  anio,
  mes,
}: {
  meses: MesDesignaciones[];
  anio: number;
  mes?: string;
}) {
  const actual = meses.find((m) => m.mes === mes) ?? meses[0];
  const max = Math.max(1, ...actual.porCargo.map((c) => c.n));
  const enMes = mes === actual.mes;
  return (
    <Card as="section" className="mt-5 p-5 sm:p-6">
      <CardTitle>¿A quién designó el Presidente en {nombreMes(actual.mes)}?</CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
        <span className="font-mono tabular-nums text-ink">{actual.designa}</span>{" "}
        {actual.designa === 1 ? "decreto de nombramiento" : "decretos de nombramiento"} y{" "}
        <span className="font-mono tabular-nums text-ink">{actual.cesa}</span> de cese
        (derogan una designación anterior).
      </p>

      {actual.porCargo.length > 0 && (
        <BarrasHorizontales
          className="mt-4"
          lineas={2}
          maximo={max}
          etiqueta={`Designaciones por cargo en ${nombreMes(actual.mes)}`}
          barras={actual.porCargo.slice(0, 8).map((c) => ({
            clave: c.cargo,
            etiqueta: c.cargo,
            valor: c.n,
            cifra: c.n,
          }))}
        />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {enMes ? (
          <Button asChild variant="secondary" size="sm" className="h-10 sm:h-9">
            <Link href={hrefNormativa({ tipo: "3", anio })}>Todos los decretos de {anio}</Link>
          </Button>
        ) : (
          <Button asChild variant="secondary" size="sm" className="h-10 sm:h-9">
            <Link href={hrefNormativa({ tipo: "3", anio, mes: actual.mes })}>
              Ver los {actual.designa + actual.cesa} decretos del mes
            </Link>
          </Button>
        )}
      </div>

      {meses.length > 1 && (
        <NavFiltros etiqueta="Mes de las designaciones" className="mt-4">
          {meses.map((m) => (
            <FiltroEnlace
              key={m.mes}
              href={hrefNormativa({ tipo: "3", anio, mes: m.mes })}
              activo={m.mes === mes}
              mono
            >
              {formatMes(m.mes)} · {m.designa + m.cesa}
            </FiltroEnlace>
          ))}
        </NavFiltros>
      )}

      <p className="mt-4 text-xs leading-relaxed text-ink-soft">
        Derivado del título, no de un campo del origen. La Consultoría Jurídica
        etiqueta con la Cámara de Cuentas cada decreto que designa a un
        funcionario (quien es designado declara su patrimonio ante ella) y los
        que derogan esa designación; aquí se cuentan esos decretos por su fecha
        de promulgación. El cargo es el primero que el título menciona: un
        decreto que nombra a varias personas cuenta una vez. Los ceses no se
        reparten por cargo. Por eso suma menos que la materia «Nombramientos y
        ceses», que también lee el título.
      </p>
    </Card>
  );
}

/** Filas que se ven de entrada; el resto, a un toque. */
const MATERIAS_VISIBLES = 6;

/**
 * ¿De qué tratan los decretos del año? Un año son casi mil títulos en
 * mayúsculas y el lector no viene a leerlos todos: viene por las pensiones,
 * las expropiaciones o las compras de emergencia. Cada materia es un enlace
 * que filtra la lista, con su cuenta y su barra, y la tarjeta dice cómo se
 * decidió: reglas sobre el título y la etiqueta del origen (`materiaDe`).
 */
function Materias({
  materias,
  anio,
  q,
  activa,
  instantanea,
}: {
  materias: (Materia & { n: number })[];
  anio: number;
  q: string;
  activa?: string;
  /** Fecha de la instantánea si la lista no es en vivo: se dice junto a la cifra. */
  instantanea: string | null;
}) {
  const total = materias.reduce((s, m) => s + m.n, 0);
  const max = Math.max(1, ...materias.map((m) => m.n));
  // La elegida siempre a la vista, aunque su cuenta la dejara plegada: abrir
  // la lista entera empujaba los decretos filtrados dos pantallas abajo.
  const primeras = materias.slice(0, MATERIAS_VISIBLES);
  const visibles =
    activa && !primeras.some((m) => m.slug === activa)
      ? [...primeras, ...materias.filter((m) => m.slug === activa)]
      : primeras;
  const resto = materias.filter((m) => !visibles.includes(m));

  const lista = (ms: (Materia & { n: number })[]) => (
    <BarrasHorizontales
      lineas={2}
      maximo={max}
      etiqueta="Decretos por materia"
      barras={ms.map((m) => ({
        clave: m.slug,
        etiqueta: m.nombre,
        valor: m.n,
        cifra: m.n.toLocaleString("es-DO"),
        href: hrefNormativa({ tipo: "3", anio, q, materia: m.slug }),
        actual: m.slug === activa,
      }))}
    />
  );

  return (
    <Card as="section" className="mt-5 p-5 sm:p-6">
      <CardTitle>
        ¿De qué tratan los {total.toLocaleString("es-DO")} decretos de {anio}?
      </CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
        {instantanea ? `Según la instantánea del ${formatFecha(instantanea)}. ` : ""}
        Toca una materia para ver solo sus decretos
        {q ? `; las cuentas son del año entero, sin la búsqueda «${q}», que se mantiene al tocar` : ""}.
      </p>

      <div className="mt-3">{lista(visibles)}</div>
      {resto.length > 0 && (
        <Plegable
          className="-mx-5 mt-2 sm:-mx-6"
          etiqueta={`Ver las otras ${resto.length} materias`}
        >
          <div className="px-5 pt-2 sm:px-6">{lista(resto)}</div>
        </Plegable>
      )}

      {activa && (
        <div className="mt-4">
          <Button asChild variant="secondary" size="sm" className="h-10 sm:h-9">
            <Link href={hrefNormativa({ tipo: "3", anio, q })}>Todos los decretos de {anio}</Link>
          </Button>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-ink-soft">
        La materia no es un campo del origen: se lee del título y de la etiqueta
        de institución que pone la Consultoría Jurídica, con reglas fijas y
        públicas, no con un modelo. Cada decreto cuenta en una sola materia, la
        primera que reconoce; «Otros asuntos» reúne lo que ninguna regla
        reconoce. «Nombramientos y ceses» es más amplia que las designaciones
        del mes: suma los decretos cuyo título nombra o revoca a alguien aunque
        no lleven la etiqueta de la Cámara de Cuentas. Las cuentas son del año
        entero, sin la búsqueda.
      </p>
    </Card>
  );
}

function ListaEsqueleto({
  tipo,
  anio,
  conMaterias,
}: {
  tipo: TipoNormativa;
  anio: number;
  /** La tarjeta de materias va encima de la lista: su hueco también. */
  conMaterias: boolean;
}) {
  return (
    <div role="status" aria-busy="true">
      {conMaterias && <Esqueleto className="mt-5 h-[42rem] sm:h-[35rem]" />}
      <p className="mt-4 text-sm text-ink-soft">
        Consultando {TIPOS_NORMATIVA[tipo].toLowerCase()} de {anio} en la Consultoría…
      </p>
      <EsqueletoFilas n={10} className="mt-3" />
    </div>
  );
}

/**
 * Fila de una norma.
 *
 * El objetivo táctil era «Leer»: un renglón de 46 × 16 px pegado al borde
 * derecho, el más difícil de acertar con el pulgar de toda la vertical, con
 * una fila de 70 px de alto muerta a su lado. Cuando la norma tiene ficha
 * propia, la fila **entera** es el enlace —como en las dos cámaras—; el
 * rótulo se queda como afordancia visual y el resto del papel ya responde.
 * Cuando el origen escribe el número de otra forma y no hay ficha, queda el
 * enlace al archivo del Estado, que sí sale de la plataforma y por eso sigue
 * siendo un enlace aparte, ahora con altura de mando.
 */
function FilaDoc({ doc }: { doc: Documento }) {
  // El número normalizado es la identidad de la ficha propia; si el origen lo
  // escribe de otra forma, la fila se queda con el enlace al documento.
  const materia = materiaDe(doc);
  const ruta =
    RUTA_POR_TIPO[doc.tipo] && /^\d{1,4}-\d{2,4}$/.test(doc.numero.trim())
      ? enlace.norma(doc.tipo, doc.numero)
      : null;

  const cuerpo = (
    <>
      {/*
        El icono es el mismo en las doscientas filas de una lista de
        documentos: no distingue una de otra, así que en el teléfono —donde se
        lleva 28 px de la columna más estrecha que hay— se retira y el título
        gana una palabra por línea. Desde `sm` sobra el ancho y vuelve.
      */}
      <IconDoc className="mt-0.5 hidden h-4 w-4 shrink-0 text-ink-soft sm:block" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          <span className="font-mono font-semibold tabular-nums text-brand-700">
            {doc.tipo} {doc.numero}
          </span>
          {doc.fechaIso && (
            <Antiguedad iso={doc.fechaIso} className="text-ink-soft" />
          )}
          {doc.gaceta && <span className="text-ink-soft">Gaceta {doc.gaceta}</span>}
          {materia && materia.slug !== "otros" && (
            <span className="text-ink-soft" title="Materia leída del título y la etiqueta del origen, no un campo de la Consultoría">
              {materia.nombre}
            </span>
          )}
        </div>
        {/*
          Con ficha propia, el titular es el enlace y se estira sobre la fila
          entera (`estira`): el nombre accesible es el título de la norma y no
          el renglón leído de corrido, y la fila responde como las demás.
        */}
        {ruta ? (
          <Link
            href={ruta}
            className="estira mt-1 block break-words text-[15px] leading-snug text-ink hover:text-brand-700"
          >
            {desdeMayusculas(doc.titulo)}
          </Link>
        ) : (
          <p className="mt-1 break-words text-[15px] leading-snug text-ink">
            {desdeMayusculas(doc.titulo)}
          </p>
        )}
      </div>
    </>
  );

  if (ruta) {
    return (
      <li className="cv-auto relative flex items-start gap-3 px-4 py-3.5 sm:px-5">
        {cuerpo}
        <span aria-hidden className="shrink-0 self-center text-xs font-medium text-brand-700">
          Leer
        </span>
      </li>
    );
  }

  return (
    <li className="cv-auto flex items-start gap-3 px-4 py-3.5 sm:px-5">
      {cuerpo}
      {doc.url && (
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="-my-1 -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-xs font-medium text-brand-700 hover:underline sm:my-0 sm:mr-0 sm:min-h-0 sm:px-0"
        >
          Abrir
          <span className="sr-only">{` ${doc.tipo} ${doc.numero} (en otra pestaña)`}</span>
          <IconExternal className="h-3.5 w-3.5" />
        </a>
      )}
    </li>
  );
}
