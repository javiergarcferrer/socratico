import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";
import type { Metadata } from "next";
import {
  INSTITUCIONES,
  buscarInstituciones,
  cabezaDelCapitulo,
  hrefInstitucion,
  type Institucion,
} from "@/lib/instituciones";
import { etiquetaCorte, getFiscal } from "@/lib/fiscal";
import { formatPesos } from "@/lib/format";
import { desdeMayusculas } from "@/lib/congreso";
import { formatInt } from "@/lib/nomina";
import { BuscadorUrl } from "@/components/buscador-url";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EstadoVacio } from "@/components/estado-vacio";
import Plegable from "@/components/plegable";
import { IconChevronRight } from "@/components/icons";
import { normalize } from "@/lib/dgcp";
import { enlace } from "@/lib/grafo";
import { recortar } from "@/lib/raiz";

/**
 * Filas que se ven en cada capítulo antes de plegar. El Ministerio de Defensa
 * tiene 35 unidades de compra y el Servicio Nacional de Salud 185: en bruto,
 * la página era una pared de siglas.
 */
const A_LA_VISTA = 5;

export const metadata: Metadata = {
  alternates: { canonical: "/instituciones" },
  title: "Instituciones del Estado",
  description:
    "Cada institución del Estado dominicano en una página: presupuesto, compras, nómina y normativa, que el Estado publica en cuatro catálogos distintos.",
};

export const revalidate = 86400;

/**
 * El directorio de instituciones: la puerta a las fichas.
 *
 * Sin búsqueda, lista los capítulos del presupuesto de mayor gasto con sus
 * unidades de compra —lo que casi todo el mundo busca—, y deja hospitales y
 * ayuntamientos a una búsqueda de distancia. Con `?q=`, filtra el cruce entero.
 */
export default async function InstitucionesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = recortar((await searchParams).q, 80);
  const fiscal = await getFiscal();
  const porCapitulo = new Map<string, Institucion[]>();
  for (const i of INSTITUCIONES) {
    if (!i.capitulo) continue;
    const lista = porCapitulo.get(i.capitulo) ?? [];
    lista.push(i);
    porCapitulo.set(i.capitulo, lista);
  }
  const capitulos = (fiscal?.instituciones ?? [])
    .filter((c) => porCapitulo.has(c.codigo))
    .sort((a, b) => b.devengado - a.devengado);
  /*
    Un capítulo con una sola unidad que además lo encabeza —el INAIPI, la
    Superintendencia de Electricidad— no necesita tarjeta: es una institución
    con su presupuesto, y como fila de un mismo listado ocupa un tercio.
    Medio centenar de tarjetas así eran la mayor parte de la página.
  */
  const propios = capitulos.flatMap((c) => {
    const unidades = porCapitulo.get(c.codigo) ?? [];
    const cabeza = unidades.length === 1 ? cabezaDelCapitulo(c.nombreLegible, unidades) : null;
    return cabeza ? [{ i: cabeza, devengado: c.devengado }] : [];
  });
  const conTarjeta = capitulos.filter((c) => !propios.some((p) => p.i.capitulo === c.codigo));
  const locales = INSTITUCIONES.filter((i) => i.tipo === "Gobierno local").length;
  const hospitales = INSTITUCIONES.filter((i) => i.tipo === "Hospital").length;
  const resultados = q ? buscarInstituciones(q, INSTITUCIONES.length) : [];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="font-display text-3xl text-ink sm:text-4xl">Instituciones del Estado</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          El Estado publica cada institución en cuatro catálogos que no se hablan:
          presupuesto, compras, nómina y normativa. Aquí cada una tiene una sola
          página. {formatInt(INSTITUCIONES.length)} unidades de compra, entre ellas{" "}
          {formatInt(hospitales)} hospitales y {formatInt(locales)} gobiernos locales.
        </p>
      </header>

      <Suspense>
        <BuscadorUrl
          etiqueta="Buscar una institución"
          placeholder="Nombre o siglas: MINERD…"
          ayuda={`Busca en el nombre y las siglas de las ${formatInt(INSTITUCIONES.length)} unidades de compra activas de la DGCP: todas las palabras, en cualquier orden y sin distinguir tildes.`}
        />
      </Suspense>

      {q ? (
        resultados.length === 0 ? (
          <EstadoVacio
            titulo={`Ninguna institución coincide con «${q}»`}
            accion={
              <Button asChild variant="secondary">
                <Link href={`/buscar?q=${encodeURIComponent(q)}`}>Buscar «{q}» en toda la plataforma</Link>
              </Button>
            }
          >
            Prueba con las siglas (MOPC, MINERD) o con una palabra del nombre.
          </EstadoVacio>
        ) : (
          <Card as="section">
            <p className="px-5 pt-4 text-sm text-ink-soft" aria-live="polite">
              <span className="font-mono tabular-nums">{formatInt(resultados.length)}</span>{" "}
              {resultados.length === 1 ? "institución" : "instituciones"} para «{q}»
            </p>
            <ul className="mt-2 divide-y divide-hairline">
              {resultados.map((i) => (
                <FilaInstitucion key={i.id} i={i} />
              ))}
            </ul>
          </Card>
        )
      ) : (
        <div className="space-y-4">
          {fiscal && (
            <p className="rotulo text-ink-soft">
              Montos: lo devengado en {fiscal.anio}, con corte a{" "}
              {etiquetaCorte(fiscal.mesCorte, fiscal.anio)} · SIGEF
            </p>
          )}
          {conTarjeta.map((c) => (
            <TarjetaCapitulo
              key={c.codigo}
              codigo={c.codigo}
              nombre={c.nombreLegible}
              devengado={c.devengado}
              unidades={porCapitulo.get(c.codigo) ?? []}
            />
          ))}
          {propios.length > 0 && (
            <Card as="section" aria-labelledby="propios">
              <div className="px-5 pb-3 pt-4">
                <CardTitle id="propios">Organismos con presupuesto propio</CardTitle>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  {formatInt(propios.length)} instituciones que son, cada una, un
                  capítulo del presupuesto. La cifra es lo devengado en el año; su
                  ejecución mes a mes está en la ficha.
                </p>
              </div>
              <ul className="divide-y divide-hairline border-t border-hairline">
                {propios.map(({ i, devengado }) => (
                  <FilaInstitucion key={i.id} i={i} compacta devengado={devengado} />
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <p className="text-xs leading-relaxed text-ink-soft">
        La institución es la unidad de compra de la DGCP; su presupuesto es el del
        capítulo al que la propia DGCP la adscribe. El cruce se regenera con{" "}
        <code className="font-mono">scripts/build-instituciones.py</code>.
      </p>
    </div>
  );
}

/**
 * Un capítulo del presupuesto con sus unidades de compra.
 *
 * El titular lleva a la ficha de quien encabeza el capítulo —el Ministerio de
 * Educación, no el capítulo en abstracto—; el monto, a su ejecución en
 * Finanzas, como enlace secundario. Antes era al revés: el titular no llevaba
 * a ninguna parte y el único enlace era la cifra. Las unidades son filas
 * enteras con su nombre completo: una sigla sola («ARSSEMMA», «OCI») obliga a
 * recordar qué es, y un enlace de cinco letras es un objetivo de 16 px.
 */
function TarjetaCapitulo({
  codigo,
  nombre,
  devengado,
  unidades,
}: {
  codigo: string;
  nombre: string;
  devengado: number;
  unidades: Institucion[];
}) {
  const cabeza = cabezaDelCapitulo(nombre, unidades);
  const resto = unidades
    .filter((u) => u.id !== cabeza?.id)
    .sort(
      (a, b) =>
        Number(b.tipo === "Institución") - Number(a.tipo === "Institución") ||
        a.nombre.localeCompare(b.nombre, "es"),
    );
  const vista = resto.slice(0, A_LA_VISTA);
  const plegadas = resto.slice(A_LA_VISTA);
  const lista = (filas: Institucion[]) => (
    <ul className="divide-y divide-hairline">
      {filas.map((u) => (
        <FilaInstitucion key={u.id} i={u} compacta />
      ))}
    </ul>
  );

  return (
    <Card as="section" aria-label={nombre}>
      <div className="px-5 pb-3 pt-4">
        <CardTitle>
          {cabeza ? (
            <Link
              href={hrefInstitucion(cabeza)}
              className="group -mx-1 flex min-h-11 items-center justify-between gap-3 rounded-md px-1 hover:text-brand-700 sm:min-h-10"
            >
              {/*
                El chevrón va al borde derecho, en la misma columna que el de
                las filas de abajo: pegado al nombre saltaba de sitio según
                cuántos renglones ocupara el titular.
              */}
              <span className="min-w-0 break-words">{nombre}</span>
              <IconChevronRight className="h-4 w-4 shrink-0 text-brand-700" />
            </Link>
          ) : (
            <span className="flex min-h-11 items-center sm:min-h-10">{nombre}</span>
          )}
        </CardTitle>
        <Link
          href={enlace.capitulo(codigo)}
          className="inline-flex min-h-11 items-center font-mono text-xs tabular-nums text-ink-soft hover:text-brand-700 hover:underline sm:min-h-0"
        >
          {formatPesos(devengado)} devengado · ver en Finanzas
        </Link>
      </div>
      {vista.length > 0 &&
        (plegadas.length > 0 ? (
          <Plegable
            resumen={<div className="border-t border-hairline">{lista(vista)}</div>}
            etiqueta={`Ver las otras ${formatInt(plegadas.length)} unidades de compra del capítulo`}
          >
            {lista(plegadas)}
          </Plegable>
        ) : (
          <div className="border-t border-hairline">{lista(vista)}</div>
        ))}
    </Card>
  );
}

/** ¿Dice la sigla algo que el nombre no dice ya? «Bellas Artes» no. */
function siglaUtil(i: Institucion): string | null {
  const s = i.acronimo.trim();
  if (!s) return null;
  return normalize(i.nombre).includes(normalize(s)) ? null : s;
}

/**
 * Una unidad de compra como fila entera: nombre completo y, detrás, su sigla.
 * `compacta` es la fila dentro de un capítulo, donde decir «Presupuesto» en
 * cada una no informa: todas lo tienen.
 */
function FilaInstitucion({
  i,
  compacta = false,
  devengado,
}: {
  i: Institucion;
  compacta?: boolean;
  /** Lo devengado por su capítulo, cuando la fila es un capítulo entero. */
  devengado?: number;
}) {
  const sigla = siglaUtil(i);
  return (
    <li>
      <Link
        href={hrefInstitucion(i)}
        className={
          compacta
            ? "flex min-h-11 items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-canvas/60 active:bg-canvas"
            : "flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-canvas/60 active:bg-canvas sm:px-5"
        }
      >
        {compacta ? (
          <span className="min-w-0">
            <span className="block text-[15px] leading-snug text-ink">
              {desdeMayusculas(i.nombre)}
              {sigla && <span className="whitespace-nowrap font-mono text-xs text-ink-soft"> · {sigla}</span>}
            </span>
            {devengado !== undefined && (
              <span className="mt-0.5 block font-mono text-xs tabular-nums text-ink-soft">
                {formatPesos(devengado)} devengado
              </span>
            )}
          </span>
        ) : (
          <span className="min-w-0">
            <span className="block text-[15px] leading-snug text-ink">{desdeMayusculas(i.nombre)}</span>
            <span className="mt-0.5 block text-xs text-ink-soft">
              {[i.acronimo, i.tipo].filter(Boolean).join(" · ")}
            </span>
          </span>
        )}
        {compacta ? (
          <IconChevronRight className="h-4 w-4 shrink-0 text-ink-soft" />
        ) : (
          <span className="flex shrink-0 flex-wrap justify-end gap-1">
            {i.capitulo && <Badge variant="neutro">Presupuesto</Badge>}
            {i.nomina && <Badge variant="neutro">Nómina</Badge>}
          </span>
        )}
      </Link>
    </li>
  );
}
