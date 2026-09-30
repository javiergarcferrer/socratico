import Link from "next/link";
import { Suspense, cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { SerieTemporal } from "@/components/graficos";
import { NavFiltros, FiltroEnlace } from "@/components/nav-filtros";
import { BuscadorUrl } from "@/components/buscador-url";
import { EstadoVacio } from "@/components/estado-vacio";
import { Paginador } from "@/components/paginador";
import { MarcaEstado } from "@/components/marca-estado";
import Antiguedad from "@/components/antiguedad";
import { Ruta } from "@/components/ruta";
import { IconExternal } from "@/components/icons";
import { desdeMayusculas } from "@/lib/congreso";
import { formatFecha } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { enlace } from "@/lib/grafo";
import { agujas, contieneTodas, plano } from "@/lib/raiz";
import { MATERIAS } from "@/lib/materias-decreto";
import { personaPorId } from "@/lib/funcionarios";
import {
  AVISO_DECRETO as AVISO,
  decretosDeFirmante,
  firmante as leerFirmante,
  hrefDecreto,
  indiceDecretos,
  type Decreto,
} from "@/lib/decretos";

export const revalidate = 86400;

const POR_PAGINA = 40;
/** Con más años que estos, el filtro de año va por décadas. */
const ANIOS_SUELTOS = 12;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; materia?: string; anio?: string; decada?: string; p?: string }>;
};

const cargar = cache((slug: string) => personaPorId(decodeURIComponent(slug)));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await cargar(slug);
  if (!p?.firma) return { title: "Decretos no encontrados" };
  return {
    title: `Decretos firmados por ${p.nombre}`,
    alternates: { canonical: enlace.decretosFirmados(p.id) },
    description: `Los ${p.firma.decretos.toLocaleString("es-DO")} decretos que la Consultoría Jurídica registra con la firma de ${p.nombre}, del ${formatFecha(p.firma.desde)} al ${formatFecha(p.firma.hasta)}: por año, por materia y con su texto oficial.`,
  };
}

/**
 * Los decretos que firmó una persona: todo lo que el registro de la
 * Consultoría Jurídica le atribuye (`lib/decretos.ts`), filtrable por materia,
 * año y texto, con la ficha o el PDF oficial de cada uno. Es un acto de
 * Estado, no un dato personal: se indexa aunque la ficha de la persona no.
 */
export default async function DecretosFirmadosPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const persona = await cargar(slug);
  if (!persona?.firma) notFound();
  const sp = await searchParams;
  const [f, indice] = await Promise.all([leerFirmante(persona.firma.clave), indiceDecretos()]);

  if (indice && !f) {
    return (
      <div className="mx-auto max-w-4xl">
        <Ruta raiz={{ href: "/funcionarios", label: "Funcionarios" }} padre={{ href: enlace.funcionario(persona.id), label: persona.nombre }} actual="Decretos con su firma" />
        <EstadoVacio
          como="h1"
          className="mt-4"
          titulo="El registro de decretos no trae esta firma"
          accion={
            <Button asChild variant="secondary">
              <Link href={enlace.funcionario(persona.id)}>Volver a su ficha</Link>
            </Button>
          }
        >
          La ficha cuenta los decretos con la firma «{persona.firma.como}», pero el registro de la Consultoría
          leído el {formatFecha(indice.generado)} no tiene filas con esa firma. Las dos instantáneas se rehacen por
          separado y pueden no coincidir por unos días.
        </EstadoVacio>
      </div>
    );
  }

  if (!f || !indice) {
    return (
      <div className="mx-auto max-w-4xl">
        <Ruta raiz={{ href: "/funcionarios", label: "Funcionarios" }} padre={{ href: enlace.funcionario(persona.id), label: persona.nombre }} actual="Decretos con su firma" />
        <EstadoVacio
          como="h1"
          variante="caida"
          className="mt-4"
          titulo="No pudimos leer el registro de decretos"
          accion={
            <Button asChild variant="secondary">
              <Link href="/fuentes">Ver el estado de las fuentes</Link>
            </Button>
          }
        >
          La instantánea del registro de la Consultoría Jurídica no se pudo abrir. La cuenta de{" "}
          {persona.firma.decretos.toLocaleString("es-DO")} decretos de su ficha sigue en pie; la lista vuelve
          cuando la instantánea esté.
        </EstadoVacio>
      </div>
    );
  }

  const todos = await decretosDeFirmante(f.clave);
  const q = (sp.q ?? "").trim().slice(0, 120);
  const materia = MATERIAS.find((m) => m.slug === sp.materia)?.slug ?? null;
  const aniosDe = [...new Set(todos.map((d) => d.anio).filter((a): a is number => a != null))].sort((a, b) => b - a);
  const anio = sp.anio && /^\d{4}$/.test(sp.anio) && aniosDe.includes(Number(sp.anio)) ? Number(sp.anio) : null;
  const porDecadas = aniosDe.length > ANIOS_SUELTOS;
  const decadas = [...new Set(aniosDe.map((an) => Math.floor(an / 10) * 10))];
  const decadaPedida = sp.decada && /^\d{3}0$/.test(sp.decada) ? Number(sp.decada) : null;
  const decada =
    anio != null
      ? Math.floor(anio / 10) * 10
      : porDecadas && decadaPedida != null && decadas.includes(decadaPedida)
        ? decadaPedida
        : null;

  const url = (cambios: Partial<Record<"q" | "materia" | "anio" | "decada" | "p", string | null>>) => {
    const u = new URLSearchParams();
    const actual = {
      q: q || null,
      materia,
      anio: anio != null ? String(anio) : null,
      decada: decada != null && anio == null ? String(decada) : null,
      ...cambios,
    };
    for (const [k, v] of Object.entries(actual)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `${enlace.decretosFirmados(persona.id)}?${s}` : enlace.decretosFirmados(persona.id);
  };

  // La búsqueda primero; después, cuántos deja cada filtro con los demás puestos.
  const a = q ? agujas(q) : null;
  const buscados = a
    ? todos.filter((d) => d.numero === q || contieneTodas(plano(`${d.numero ?? ""} ${d.titulo} ${d.institucion ?? ""}`), a))
    : todos;
  const cumpleMateria = (d: Decreto, m: string | null) => !m || d.materia.slug === m;
  const cumpleAnio = (d: Decreto, an: number | null, dec: number | null) =>
    an != null ? d.anio === an : dec != null ? d.anio != null && Math.floor(d.anio / 10) * 10 === dec : true;
  const lista = buscados.filter((d) => cumpleMateria(d, materia) && cumpleAnio(d, anio, decada));
  const cuantos = (m: string | null, an: number | null, dec: number | null) =>
    buscados.filter((d) => cumpleMateria(d, m) && cumpleAnio(d, an, dec)).length;

  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Number(sp.p) || 1), paginas);
  const vista = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  // La serie por año, con la materia y la búsqueda puestas (no el año). Las
  // filas con aviso no la dibujan: una fecha que no es de fiar no hace un año
  // (el Trujillo del año 2000).
  const porAnio = new Map<number, number>();
  for (const d of buscados) {
    if (d.anio != null && !d.aviso && cumpleMateria(d, materia)) porAnio.set(d.anio, (porAnio.get(d.anio) ?? 0) + 1);
  }
  const aniosSerie = [...porAnio.keys()].sort((x, y) => x - y);
  const serie =
    aniosSerie.length > 1
      ? rellenar(aniosSerie[0], aniosSerie[aniosSerie.length - 1]).map((an, i, arr) => ({
          clave: String(an),
          valor: porAnio.get(an) ?? 0,
          lectura: `${an}: ${formatInt(porAnio.get(an) ?? 0)} ${(porAnio.get(an) ?? 0) === 1 ? "decreto" : "decretos"}`,
          marca: i === 0 || i === arr.length - 1 || an % (arr.length > 20 ? 10 : 2) === 0 ? String(an) : undefined,
          href: porAnio.has(an) ? url({ anio: String(an), decada: null, p: null }) : undefined,
        }))
      : [];

  const avisos = todos.filter((d) => d.aviso).length;
  const erratas = todos.filter((d) => /^FE DE ERRATA/i.test(d.titulo)).length;
  const aniosVisibles = porDecadas ? (decada != null ? aniosDe.filter((an) => Math.floor(an / 10) * 10 === decada) : []) : aniosDe;

  return (
    <div className="mx-auto max-w-4xl">
      <Ruta
        raiz={{ href: "/funcionarios", label: "Funcionarios" }}
        padre={{ href: enlace.funcionario(persona.id), label: persona.nombre }}
        actual="Decretos con su firma"
      />

      <header className="mt-1 sm:mt-3">
        <p className="rotulo text-ink-soft">Registro de decretos · Consultoría Jurídica</p>
        <h1 className="mt-1.5 font-display text-3xl leading-tight text-ink sm:text-4xl">
          ¿Qué decretos firmó {persona.nombre}?
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Todo lo que el registro de la Consultoría Jurídica anota con la firma «{persona.firma.como}», con su
          texto oficial: la ficha del decreto, o su PDF en la Consultoría cuando el número no tiene ficha propia.
        </p>
      </header>

      <Card as="section" className="mt-5">
        <TiraDeCifras>
          <Cifra
            etiqueta="Decretos con su firma"
            valor={formatInt(f.n)}
            ancla={{ alcance: "registro", periodo: "todo lo que publica la Consultoría Jurídica" }}
          />
          <Cifra etiqueta="El primero" valor={formatFecha(f.desde)} />
          <Cifra etiqueta="El más reciente" valor={formatFecha(f.hasta)} />
          <Cifra
            etiqueta="Con un aviso sobre su fecha"
            valor={formatInt(avisos)}
            nota={avisos > 0 ? "errores de captura probables del origen" : "ninguno"}
          />
        </TiraDeCifras>
        {serie.length > 0 && (
          <div className="border-t border-hairline px-5 py-4">
            <p className="mb-2 text-sm font-semibold text-ink">
              ¿Cuántos por año?
              {materia && <span className="font-normal text-ink-soft">{` · ${MATERIAS.find((m) => m.slug === materia)?.nombre}`}</span>}
            </p>
            <SerieTemporal
              forma="columnas"
              formato="entero"
              etiqueta={`Decretos por año con la firma de ${persona.nombre}, de ${aniosSerie[0]} a ${aniosSerie[aniosSerie.length - 1]}, sin las filas con aviso sobre su fecha`}
              puntos={serie}
              destacar={anio != null ? String(anio) : undefined}
            />
          </div>
        )}
      </Card>

      <section className="mt-6" aria-label="Decretos con su firma">
        <Suspense>
          <BuscadorUrl
            etiqueta="Buscar entre sus decretos"
            placeholder="Palabras del título o número…"
            ayuda={`Busca en el título, el número y la etiqueta de institución de sus ${formatInt(f.n)} decretos, todas las palabras en cualquier orden y sin distinguir tildes.`}
          />
        </Suspense>

        <p className="mt-4 text-xs leading-relaxed text-ink-soft">Cada filtro dice cuántos decretos deja, con los demás puestos.</p>
        <NavFiltros etiqueta="Materia del decreto" className="mt-2">
          <FiltroEnlace href={url({ materia: null, p: null })} activo={!materia}>
            {`Todas · ${formatInt(cuantos(null, anio, decada))}`}
          </FiltroEnlace>
          {MATERIAS.map((m) => {
            const n = cuantos(m.slug, anio, decada);
            return n > 0 || materia === m.slug ? (
              <FiltroEnlace key={m.slug} href={url({ materia: m.slug, p: null })} activo={materia === m.slug}>
                {`${m.nombre} · ${formatInt(n)}`}
              </FiltroEnlace>
            ) : null;
          })}
        </NavFiltros>

        <NavFiltros etiqueta={porDecadas ? "Década" : "Año"} className="mt-2">
          <FiltroEnlace href={url({ anio: null, decada: null, p: null })} activo={anio == null && decada == null}>
            {`Todos los años · ${formatInt(cuantos(materia, null, null))}`}
          </FiltroEnlace>
          {porDecadas
            ? decadas.map((dec) => (
                <FiltroEnlace
                  key={dec}
                  href={url({ decada: String(dec), anio: null, p: null })}
                  activo={decada === dec && anio == null}
                  mono
                >
                  {`${dec}s · ${formatInt(cuantos(materia, null, dec))}`}
                </FiltroEnlace>
              ))
            : aniosVisibles.map((an) => (
                <FiltroEnlace key={an} href={url({ anio: String(an), p: null })} activo={anio === an} mono>
                  {`${an} · ${formatInt(cuantos(materia, an, null))}`}
                </FiltroEnlace>
              ))}
        </NavFiltros>
        {porDecadas && decada != null && (
          <NavFiltros etiqueta={`Año dentro de los ${decada}s`} className="mt-2">
            <FiltroEnlace href={url({ anio: null, decada: String(decada), p: null })} activo={anio == null}>
              {`Toda la década · ${formatInt(cuantos(materia, null, decada))}`}
            </FiltroEnlace>
            {aniosVisibles.map((an) => (
              <FiltroEnlace key={an} href={url({ anio: String(an), p: null })} activo={anio === an} mono>
                {`${an} · ${formatInt(cuantos(materia, an, null))}`}
              </FiltroEnlace>
            ))}
          </NavFiltros>
        )}

        {vista.length === 0 ? (
          <EstadoVacio
            className="mt-4"
            titulo={q ? `Ningún decreto suyo coincide con «${q}»` : "Ningún decreto con esos filtros"}
            accion={
              <Button asChild variant="secondary">
                <Link href={enlace.decretosFirmados(persona.id)}>Quitar los filtros</Link>
              </Button>
            }
          >
            {q
              ? "La búsqueda mira el título, el número y la etiqueta de institución de sus decretos. Prueba con menos palabras o quita algún filtro."
              : "Ninguno de sus decretos cumple a la vez la materia y el año elegidos."}
          </EstadoVacio>
        ) : (
          <Card as="section" className="mt-4" aria-labelledby="lista-decretos">
            <CardHeader>
              <CardTitle id="lista-decretos" aria-live="polite">
                {`${formatInt(lista.length)} ${lista.length === 1 ? "decreto" : "decretos"}`}
                {q && <span className="font-normal text-ink-soft">{` para «${q}»`}</span>}
              </CardTitle>
              <CardAction>el más reciente primero</CardAction>
            </CardHeader>
            <ol>
              {vista.map((d, k) => (
                <FilaDecreto key={`${d.docId ?? "s"}-${k}`} d={d} />
              ))}
            </ol>
            {paginas > 1 && (
              <div className="border-t border-hairline px-5 py-3">
                <Paginador
                  pagina={pagina}
                  paginas={paginas}
                  href={(n) => url({ p: n > 1 ? String(n) : null })}
                  etiqueta="Paginación de sus decretos"
                />
              </div>
            )}
          </Card>
        )}
      </section>

      <section className="mt-6 space-y-2 text-xs leading-relaxed text-ink-soft">
        <p>
          <strong className="font-semibold text-ink">De dónde sale.</strong> El registro completo de decretos
          que publica la Consultoría Jurídica del Poder Ejecutivo ({formatInt(indice.fuente.total)} desde 1844),
          leído el {formatFecha(indice.generado)}; cada fila dice quién la firma. La materia es nuestra lectura del
          título con reglas fijas, medidas sobre los decretos de 2023 a 2026: en otras épocas, lo que no reconocen
          queda en «Otros asuntos».
        </p>
        <p>
          <strong className="font-semibold text-ink">Qué hay que saber.</strong> La cifra es de filas del
          registro, no de decretos distintos:{" "}
          {erratas > 0
            ? `${formatInt(erratas)} ${erratas === 1 ? "es una fe de errata" : "son fe de errata"}, la republicación de un decreto ya listado. `
            : ""}
          {avisos > 0
            ? `${formatInt(avisos)} ${avisos === 1 ? "tiene" : "tienen"} un aviso: una fecha fuera de sus períodos de firma o que no casa con el año del número. Se marcan y no se corrigen: el origen es el que manda.`
            : "Ninguna tiene una fecha fuera de sus períodos de firma."}{" "}
          <Link href="/fuentes" className="text-brand-700 underline">
            Estado de las fuentes
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

function FilaDecreto({ d }: { d: Decreto }) {
  const href = hrefDecreto(d);
  const externo = href != null && !href.startsWith("/");
  const titulo = desdeMayusculas(d.titulo);
  return (
    <li className="relative border-b border-hairline last:border-0">
      <div className="px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-mono text-sm font-semibold tabular-nums text-ink">
            {d.numero ? `Decreto ${d.numero}` : "Decreto sin número"}
          </span>
          <span className="text-xs text-ink-soft">
            <Antiguedad iso={d.fecha} />
          </span>
          <Badge forma="etiqueta" variant="contorno">
            {d.materia.nombre}
          </Badge>
          {d.aviso && <MarcaEstado tono="aviso">{AVISO[d.aviso].etiqueta}</MarcaEstado>}
        </div>
        {href ? (
          externo ? (
            <a
              href={href}
              rel="noopener"
              className="mt-1 flex items-start gap-1.5 text-[15px] leading-snug text-ink [overflow-wrap:anywhere] estira hover:text-brand-700"
            >
              <span>
                {titulo}
                <span className="sr-only"> (PDF en la Consultoría Jurídica)</span>
              </span>
              <IconExternal className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-soft" />
            </a>
          ) : (
            <Link
              href={href}
              className="mt-1 block text-[15px] leading-snug text-ink [overflow-wrap:anywhere] estira hover:text-brand-700"
            >
              {titulo}
            </Link>
          )
        ) : (
          <p className="mt-1 text-[15px] leading-snug text-ink [overflow-wrap:anywhere]">{titulo}</p>
        )}
        {d.institucion && <p className="mt-1 text-xs text-ink-soft">{desdeMayusculas(d.institucion)}</p>}
        {d.aviso && <p className="mt-1 text-xs leading-relaxed text-alerta-700">{AVISO[d.aviso].llano}</p>}
      </div>
    </li>
  );
}

/** Todos los años entre dos, para que un año sin decretos se vea como hueco. */
function rellenar(desde: number, hasta: number): number[] {
  return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
}
