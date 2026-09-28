import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { aniosTC, anioActualTC, listarSentencias, urlListadoTC } from "@/lib/tc";
import { formatFecha, SIN_DATO } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";
import { NavFiltros, FiltroEnlace } from "@/components/nav-filtros";
import { BuscadorUrl } from "@/components/buscador-url";
import { EstadoVacio } from "@/components/estado-vacio";
import { Paginador } from "@/components/paginador";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Plegable from "@/components/plegable";
import Antiguedad from "@/components/antiguedad";
import { TextoEnlazado } from "@/components/texto-enlazado";
import { agujas, contieneTodas, plano, recortar } from "@/lib/raiz";

export const metadata: Metadata = {
  alternates: { canonical: "/constitucional" },
  title: "Sentencias del Tribunal Constitucional",
  description:
    "Todas las sentencias del Tribunal Constitucional dominicano por año, desde 2012: número, fecha, expediente y de qué trata cada una, con enlace a su ficha y su PDF en el sitio del Tribunal.",
};

export const revalidate = 21600;

const POR_PAGINA = 40;
/** Años a la vista como chips; el resto, a un toque. */
const ANIOS_VISIBLES = 5;

/**
 * ¿Qué ha decidido el Tribunal Constitucional? — el listado anual de la
 * Secretaría del Tribunal (`lib/tc.ts`), leído entero y filtrado aquí.
 *
 * Año, búsqueda y página viven en la URL: una búsqueda se comparte tal cual.
 * El PDF no se enlaza directo porque su dirección solo aparece en la ficha de
 * cada sentencia; la fila lleva a esa ficha, en el sitio del Tribunal.
 */
export default async function ConstitucionalPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; q?: string; pagina?: string }>;
}) {
  const sp = await searchParams;
  const anios = aniosTC();
  const actual = anioActualTC();
  const pedido = Number(sp.anio);
  const anio = anios.includes(pedido) ? pedido : actual;
  const q = recortar(sp.q, 120);

  const url = (cambios: { anio?: number; q?: string; pagina?: number }) => {
    const u = new URLSearchParams();
    const a = "anio" in cambios ? cambios.anio : anio;
    const t = "q" in cambios ? cambios.q : q;
    if (a && a !== actual) u.set("anio", String(a));
    if (t) u.set("q", t);
    if (cambios.pagina && cambios.pagina > 1) u.set("pagina", String(cambios.pagina));
    const s = u.toString();
    return s ? `/constitucional?${s}` : "/constitucional";
  };

  // El año pedido siempre queda a la vista, aunque sea de los antiguos.
  const visibles = anios.slice(0, ANIOS_VISIBLES);
  if (!visibles.includes(anio)) visibles.push(anio);
  const antiguos = anios.slice(ANIOS_VISIBLES).filter((a) => a !== anio);
  const chip = (a: number) => (
    <FiltroEnlace key={a} href={url({ anio: a, pagina: undefined })} activo={a === anio} mono>
      {a}
    </FiltroEnlace>
  );
  const chipsVisibles = (
    <NavFiltros etiqueta="Año de las sentencias" className="px-5 py-4 sm:px-6">
      {visibles.map(chip)}
    </NavFiltros>
  );
  // La tarjeta de los años: los recientes a la vista, los antiguos a un toque.
  const chipsAnios = (
    <Card as="section" className="overflow-hidden">
      {antiguos.length > 0 ? (
        <Plegable
          resumen={chipsVisibles}
          etiqueta={
            antiguos.length === 1
              ? `Ver el año anterior, ${antiguos[0]}`
              : `Ver los ${formatInt(antiguos.length)} años anteriores, de ${antiguos[antiguos.length - 1]} a ${antiguos[0]}`
          }
          etiquetaCerrar="Ocultar los años anteriores"
        >
          <NavFiltros etiqueta="Años anteriores" className="px-5 py-4 sm:px-6">
            {antiguos.map(chip)}
          </NavFiltros>
        </Plegable>
      ) : (
        chipsVisibles
      )}
    </Card>
  );

  const d = await listarSentencias(anio);
  if (!d) {
    return (
      <div className="space-y-5">
        <EstadoVacio
          variante="caida"
          como="h1"
          className="mx-auto max-w-2xl"
          titulo={`No pudimos leer las sentencias de ${anio} del Tribunal Constitucional`}
          accion={
            <Button asChild variant="secondary">
              <a href={urlListadoTC(anio)} target="_blank" rel="noopener noreferrer">
                Abrir el listado en el sitio del Tribunal
              </a>
            </Button>
          }
        >
          El sitio del Tribunal no contestó a tiempo o devolvió otra cosa que el
          listado. No es que no haya sentencias: es que no pudimos mirar. Los demás
          años pueden estar disponibles, y el resto de la plataforma sigue en pie.
        </EstadoVacio>
        <div className="mx-auto max-w-2xl">{chipsAnios}</div>
      </div>
    );
  }

  const todas = d.sentencias;
  const aguja = q.trim() ? agujas(q) : null;
  const filas = aguja
    ? todas.filter((s) => {
        const h = plano(`${s.numero} ${s.expediente ?? ""} ${s.relativo}`);
        return contieneTodas(h, aguja);
      })
    : todas;
  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Math.floor(Number(sp.pagina)) || 1), paginas);
  const vista = filas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const ultima = todas[0];
  const primera = todas[todas.length - 1];

  return (
    <div className="space-y-5">
      <Portada
        rotulo={`Tribunal Constitucional · sentencias de ${anio} · consultado el ${formatFecha(d.consultado)}`}
        titulo="¿Qué ha decidido el Tribunal Constitucional?"
        descripcion={
          <>
            El Tribunal Constitucional es quien dice la última palabra sobre si una
            ley, un decreto o una sentencia respeta la Constitución, y sus
            decisiones obligan a todos los poderes del Estado. Aquí está cada
            sentencia del año tal como la lista su Secretaría: número, fecha,
            expediente y de qué trata. El texto completo está en la ficha de cada
            una, en el sitio del Tribunal.
          </>
        }
      >
        <PortadaCifras>
          <PortadaCifra etiqueta={`Sentencias de ${anio}`} valor={formatInt(todas.length)} destacar />
          <PortadaCifra etiqueta="La más reciente" valor={ultima ? formatFecha(ultima.fecha) : SIN_DATO} />
          <PortadaCifra etiqueta="Su número" valor={ultima?.numero ?? SIN_DATO} />
          <PortadaCifra etiqueta="La primera del año" valor={primera ? formatFecha(primera.fecha) : SIN_DATO} />
        </PortadaCifras>
      </Portada>

      {chipsAnios}

      <Suspense>
        <BuscadorUrl
          etiqueta={`Buscar en las sentencias de ${anio}`}
          placeholder="Por ejemplo: amparo o TC/0966/26…"
          ayuda={`Busca todas las palabras en el número, el expediente y el «relativo a» de las ${formatInt(todas.length)} sentencias de ${anio}, sin distinguir tildes. No busca dentro del texto de la sentencia.`}
        />
      </Suspense>

      {filas.length === 0 ? (
        <EstadoVacio titulo={q ? `Ninguna sentencia de ${anio} coincide con «${q}»` : `El Tribunal no lista sentencias de ${anio} todavía`}>
          {q
            ? "Prueba con menos palabras o con otro año. Se busca en el resumen que redacta la Secretaría, no dentro de la sentencia."
            : "El listado del Tribunal llegó sin filas para este año. Prueba con el año anterior."}
        </EstadoVacio>
      ) : (
        <Card as="section" className="overflow-hidden">
          <p className="px-5 pt-4 text-xs text-ink-soft sm:px-6" aria-live="polite">
            {q
              ? `${formatInt(filas.length)} de ${formatInt(todas.length)} sentencias de ${anio} coinciden`
              : `${formatInt(todas.length)} sentencias de ${anio}`}
            , de la más reciente a la más antigua.
          </p>
          <ol className="mt-2 divide-y divide-hairline border-t border-hairline">
            {vista.map((s) => (
              <li key={s.numero} className="relative px-5 py-3 sm:px-6">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-ink-soft">
                  <a
                    href={s.ficha}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-sm font-semibold text-ink estira hover:text-brand-700"
                  >
                    {s.numero}
                    <span className="sr-only"> (abre la ficha en el sitio del Tribunal)</span>
                  </a>
                  <Antiguedad iso={s.fecha} />
                </span>
                <span className="mt-1 block text-[15px] leading-snug text-ink [overflow-wrap:anywhere]">
                  {s.relativo ? <TextoEnlazado texto={s.relativo} soloForma /> : "Sin resumen en el listado"}
                </span>
                {s.expediente && (
                  <span className="mt-1 block font-mono text-xs text-ink-soft [overflow-wrap:anywhere]">
                    Expediente {s.expediente}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {paginas > 1 && (
            <div className="border-t border-hairline px-5 py-3 sm:px-6">
              <Paginador pagina={pagina} paginas={paginas} href={(p) => url({ pagina: p })} />
            </div>
          )}
        </Card>
      )}

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuente:{" "}
        <a href={d.fuente} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
          listado de sentencias de la Secretaría del Tribunal Constitucional
        </a>
        , leído el {formatFecha(d.consultado)} y guardado{" "}
        {anio === actual ? "seis horas" : "una semana"}. Se lee el año entero en una
        sola consulta: {formatInt(d.escaneados)} filas leídas, {formatInt(todas.length)}{" "}
        sentencias. El «relativo a» y el expediente son los que escribe la
        Secretaría; cada número abre la ficha de la sentencia, donde está el PDF
        con el texto completo. Ver{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          el estado de las fuentes
        </Link>
        .
      </p>
    </div>
  );
}
