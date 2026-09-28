import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { rutaDirecta } from "@/lib/buscar";
import {
  buscarEnTodo,
  buscarPantallas,
  type PantallaHallada,
  esTipoResultado,
  EN_MAYUSCULAS,
  TIPOS_RESULTADO,
  type Resultado,
  type TipoResultado,
} from "@/lib/busqueda";
import { desdeMayusculas } from "@/lib/congreso";
import { formatFecha, formatPesos, SIN_DATO } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { BUSQUEDAS } from "@/lib/secciones";
import Antiguedad from "@/components/antiguedad";
import { BuscadorUrl } from "@/components/buscador-url";
import { EstadoVacio } from "@/components/estado-vacio";
import { EsqueletoFilas } from "@/components/esqueleto";
import { FiltroEnlace, NavFiltros } from "@/components/nav-filtros";
import { Paginador } from "@/components/paginador";
import { Resaltado } from "@/components/resaltado";
import Guardar from "@/components/espacios/guardar";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { IconArrowRight, IconExternal } from "@/components/icons";
import { recortar } from "@/lib/raiz";

export const metadata: Metadata = {
  alternates: { canonical: "/buscar" },
  // Una página de resultados no es contenido: se sigue, no se indexa.
  robots: { index: false, follow: true },
  title: "Buscar en toda la plataforma",
  description:
    "Una sola caja para instituciones, legisladores, proveedores, compras, leyes y normativa, iniciativas del Congreso, sentencias, obras, documentos, datos abiertos y nómina del Estado dominicano, por palabra y por tema.",
};

/**
 * Buscar en toda la plataforma. Si lo tecleado tiene forma inequívoca —un RNC,
 * «Ley 47-20», un código de proceso, unas siglas— lleva directo
 * (`lib/buscar.ts`). Si no, el índice de `lib/busqueda.ts` ordena en una sola
 * lista, por palabra y por tema, lo que traen las instantáneas —los
 * proveedores, los que tienen contratos desde 2015; los procesos, los del
 * último año; las iniciativas de Diputados, las de los dos períodos que
 * expone el SIL—. Lo que el índice no cubre (el Senado, los procesos más
 * viejos, lo publicado después de la instantánea) se ofrece como enlace a su
 * vertical con su alcance, no se finge.
 *
 * Dos vistas del mismo resultado: «Todo» junta los mejores de cada tipo, en
 * el orden de su mejor acierto —se ve de un vistazo en qué vertical vive lo
 * buscado—; un tipo elegido es la lista entera de ese tipo, paginada. Los
 * filtros son enlaces: la vista se comparte y vuelve con «atrás».
 */
export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string; pagina?: string }>;
}) {
  const sp = await searchParams;
  const q = recortar(sp.q, 120);
  const tipo = esTipoResultado(sp.tipo) ? sp.tipo : undefined;
  const pagina = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);
  if (q) {
    const directa = rutaDirecta(q);
    if (directa) redirect(directa);
  }
  const sigue = BUSQUEDAS.filter((d) => d.href !== "/buscar");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="font-display text-3xl text-ink sm:text-4xl">Buscar en todo</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          Escribe un nombre, un tema, una cita o un número. Un RNC, «Ley 47-20», un
          código de proceso o unas siglas te llevan directo a su página.
        </p>
      </header>

      <Suspense>
        <BuscadorUrl
          etiqueta="Buscar en toda la plataforma"
          placeholder="MINERD, Ley 47-20, agua potable, computadoras, sueldo de un médico…"
          ayuda="Instituciones, legisladores, proveedores con contratos desde 2015, compras del último año, leyes desde 1844 y normativa reciente, iniciativas de Diputados, sentencias del TC y del TSE, obras, documentos, datos abiertos y cargos de nómina con su sueldo, por palabra y por tema. El Senado se abre en su vertical."
        />
      </Suspense>

      {q && (
        <>
          {/*
            El índice se carga una vez por instancia (menos de un segundo
            en frío): la cabecera y la caja no lo esperan.
          */}
          <Suspense
            key={`${q}|${tipo ?? ""}|${pagina}`}
            fallback={
              <Card as="section" className="p-5" aria-busy="true">
                <EsqueletoFilas n={6} />
              </Card>
            }
          >
            <Resultados q={q} tipo={tipo} pagina={pagina} />
          </Suspense>

          {/* Al final, siempre: lo que el índice no cubre sigue en su vertical. */}
          <Card as="section" className="p-5">
            <CardTitle>Sigue buscando «{q}» en</CardTitle>
            <ul className="mt-2 divide-y divide-hairline">
              {sigue.map((d) => (
                <li key={d.href}>
                  <Fila href={`${d.href}?q=${encodeURIComponent(q)}`} titulo={d.etiqueta} detalle={d.alcance} />
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

function hrefBusqueda(q: string, tipo?: TipoResultado, pagina?: number): string {
  const p = new URLSearchParams({ q });
  if (tipo) p.set("tipo", tipo);
  if (pagina && pagina > 1) p.set("pagina", String(pagina));
  return `/buscar?${p.toString()}`;
}

/** Las plazas se cuentan en la foto de nómina, no en todo el Estado. */
const NOTA_CARGOS =
  "Plazas contadas en la foto de nómina de las instituciones que la publican en formato procesable, no en todo el Estado.";

/**
 * Qué proveedores están y cuáles no: los inscritos que nunca contrataron no
 * tienen ficha que enseñar, y un nombre de empresa no dice de qué trata.
 */
const NOTA_PROVEEDORES =
  "Los que tienen al menos un contrato desde 2015 en el registro de la DGCP, por nombre, RNC o RPE; no los inscritos que nunca contrataron. Se encuentran por palabra, no por tema.";

const NOTAS: Partial<Record<TipoResultado, string>> = {
  cargo: `${NOTA_CARGOS} El sueldo es el mensual bruto de esas plazas.`,
  proveedor: NOTA_PROVEEDORES,
  proceso: "Los publicados en el Portal Transaccional en los últimos doce meses, por su carátula, código y unidad de compra; el monto es el estimado.",
  legislador: "Diputados y senadores con ficha en la plataforma, por nombre, cámara y provincia. Se encuentran por palabra, no por tema.",
  iniciativa: "Proyectos de ley y de resolución del SIL de la Cámara de Diputados, por su título y número de expediente.",
  sentencia: "Del Tribunal Constitucional (desde 2012) y del Tribunal Superior Electoral (desde 2021), por lo que dice su listado; el texto de la sentencia no se busca. Abren la ficha del Tribunal.",
  norma: "Decretos, reglamentos y resoluciones de los últimos cuatro años y todas las leyes desde 1844. Las leyes sin ficha propia abren su PDF en la Consultoría Jurídica.",
};

/**
 * La nota de un tipo con la fecha de su instantánea: el estado de un proceso
 * o de una iniciativa es el de ese día, no el de hoy, y se dice junto a él.
 */
function notaDe(tipo: TipoResultado, instantaneas: Partial<Record<string, string>>): string {
  const corte = instantaneas[tipo];
  const fecha = corte ? `Instantánea del ${formatFecha(corte)}.` : "";
  const vigente = VIVO[tipo] ? ` El estado de hoy, en su ${VIVO[tipo]}.` : "";
  return [NOTAS[tipo], fecha + vigente].filter(Boolean).join(" ");
}

/** Dónde se lee en vivo lo que en el índice es de la fecha de la instantánea. */
const VIVO: Partial<Record<TipoResultado, string>> = { proceso: "ficha", iniciativa: "ficha" };

const PLURAL = Object.fromEntries(TIPOS_RESULTADO.map((t) => [t.clave, t.plural])) as Record<TipoResultado, string>;

async function Resultados({ q, tipo, pagina }: { q: string; tipo?: TipoResultado; pagina: number }) {
  // Primero, la pantalla que responde a la pregunta: «¿cuánto debe el
  // país?» es Deuda pública antes que cualquier documento que diga «deuda».
  // Solo en «Todo» y en la primera página, y en el mismo `Suspense` que los
  // resultados: llegando aparte, empujaba la lista hacia abajo.
  const [h, pantallas] = await Promise.all([
    buscarEnTodo(q, { tipo, pagina }),
    !tipo && pagina === 1 ? buscarPantallas(q, 3) : Promise.resolve(null),
  ]);
  const bloquePantallas = pantallas?.length ? <Pantallas lista={pantallas} /> : null;
  if (!h) {
    return (
      <EstadoVacio
        variante="caida"
        titulo="El índice de búsqueda no cargó"
        accion={
          <Link href={`/instituciones?q=${encodeURIComponent(q)}`} className="font-medium text-brand-700 hover:underline">
            Buscar «{q}» en Instituciones
          </Link>
        }
      >
        No es que no haya nada: es que esta vez no pudimos mirar. Cada vertical
        conserva su propio buscador, abajo.
      </EstadoVacio>
    );
  }

  const todos = TIPOS_RESULTADO.reduce((n, t) => n + h.porTipo[t.clave], 0);
  const llenos = TIPOS_RESULTADO.filter((t) => h.porTipo[t.clave] > 0);
  const vacios = TIPOS_RESULTADO.filter((t) => h.porTipo[t.clave] === 0).map((t) => t.plural);
  const fechaIndice = formatFecha(h.generado);

  if (todos === 0) {
    return (
      <>
        {bloquePantallas}
        <EstadoVacio titulo={<>Nada con «{q}» en el índice</>}>
        Ni por palabra ni por tema en{" "}
        {new Intl.ListFormat("es", { type: "disjunction" }).format(TIPOS_RESULTADO.map((t) => t.plural.toLowerCase()))}{" "}
        (índice del {fechaIndice}).
        {h.pregunta ? " Una pregunta se contesta mejor en la pantalla que la responde, arriba si la hay." : " Prueba con menos palabras, o sigue en una vertical."}
        </EstadoVacio>
      </>
    );
  }

  return (
    <>
      {bloquePantallas}
      {/*
        Los filtros dicen cuánto hay detrás antes del toque: un filtro que
        promete y devuelve cero es un control sin efecto. Los tipos vacíos no
        se ofrecen; se nombran juntos abajo.
      */}
      <NavFiltros etiqueta="Qué tipo de resultado">
        <FiltroEnlace href={hrefBusqueda(q)} activo={!tipo}>
          Todo <span className="font-mono tabular-nums">{formatInt(todos)}</span>
        </FiltroEnlace>
        {llenos.map((t) => (
          <FiltroEnlace key={t.clave} href={hrefBusqueda(q, t.clave)} activo={tipo === t.clave}>
            {t.plural} <span className="font-mono tabular-nums">{formatInt(h.porTipo[t.clave])}</span>
          </FiltroEnlace>
        ))}
      </NavFiltros>

      {/* Una búsqueda también se guarda: vuelve a correrla sobre el índice del día. */}
      <div className="flex justify-end">
        <Guardar referencia={{ tipo: "busqueda", ref: hrefBusqueda(q), titulo: `Búsqueda: «${q}»`, href: hrefBusqueda(q) }} className="h-11 sm:h-9" />
      </div>

      <p aria-live="polite" className="px-1 text-xs leading-relaxed text-ink-soft">
        {h.conErrata && <>Casi nada con «{q}» tal cual: se suman palabras a una letra de diferencia, detrás de lo exacto. </>}
        {h.soloOrdenan.length > 0 && (
          <>
            {new Intl.ListFormat("es", { type: "conjunction" }).format(h.soloOrdenan.map((w) => `«${w}»`))}{" "}
            {h.soloOrdenan.length === 1 ? "ayuda a ordenar pero no se exige" : "ayudan a ordenar pero no se exigen"}.{" "}
          </>
        )}
        Por palabra (sin tildes, con plurales y conjugaciones) y por tema, en el
        índice del {fechaIndice}.
        {h.soloTema > 0 && <> Lo marcado «por tema» no lleva todas tus palabras: trata de algo parecido.</>}
        {h.truncado && <> Hay más coincidencias de las que se ordenan: la lista recorre las veinte mil más pertinentes.</>}
      </p>

      {tipo ? (
        h.resultados.length === 0 ? (
          <EstadoVacio titulo={<>Nada con «{q}» en {PLURAL[tipo]}</>}>
            <Link href={hrefBusqueda(q)} className="font-medium text-brand-700 hover:underline">
              Ver todos los tipos
            </Link>
          </EstadoVacio>
        ) : (
          <Card as="section" className="p-5">
            <CardTitle>{PLURAL[tipo]}</CardTitle>
            {notaDe(tipo, h.instantaneas) && (
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{notaDe(tipo, h.instantaneas)}</p>
            )}
            <ul className="mt-2 divide-y divide-hairline">
              {h.resultados.map((r, k) => (
                <li key={`${r.tipo}-${k}-${r.href ?? r.titulo}`}>
                  <FilaResultado r={r} q={q} corte={h.instantaneas[r.tipo]} />
                </li>
              ))}
            </ul>
            {h.paginas > 1 && (
              <Paginador
                pagina={h.pagina}
                paginas={h.paginas}
                href={(p) => hrefBusqueda(q, tipo, p)}
                etiqueta={`Páginas de ${PLURAL[tipo].toLowerCase()}`}
                className="mt-3"
              />
            )}
          </Card>
        )
      ) : (
        <>
          {h.grupos.map((g) => (
            <Grupo
              key={g.tipo}
              titulo={PLURAL[g.tipo]}
              nota={notaDe(g.tipo, h.instantaneas)}
              mas={
                g.total > g.resultados.length
                  ? { href: hrefBusqueda(q, g.tipo), texto: `Ver los ${formatInt(g.total)}` }
                  : undefined
              }
            >
              <ul className="divide-y divide-hairline">
                {g.resultados.map((r, k) => (
                  <li key={`${r.tipo}-${k}-${r.href ?? r.titulo}`}>
                    <FilaResultado r={r} q={q} corte={h.instantaneas[r.tipo]} />
                  </li>
                ))}
              </ul>
            </Grupo>
          ))}
          {vacios.length > 0 && <SinCoincidencias q={q} donde={vacios} />}
        </>
      )}
    </>
  );
}

/** Lo que cada tipo dice debajo del título, con las primitivas de formato. */
function detalleDe(r: Resultado, corte?: string): React.ReactNode {
  switch (r.tipo) {
    case "norma":
      return [r.detalle, r.fecha && formatFecha(r.fecha)].filter(Boolean).join(" · ");
    case "obra":
      return [r.detalle, r.valor ? formatPesos(r.valor) : null].filter(Boolean).join(" · ");
    case "documento":
      return (
        <>
          {[r.detalle, r.origen].filter(Boolean).join(" · ")}
          {r.fecha && (
            <>
              {" · "}
              <Antiguedad iso={r.fecha} prefijo="subido" />
            </>
          )}
        </>
      );
    case "dato":
      return [r.origen, r.detalle].filter(Boolean).join(" · ");
    case "cargo":
      return [
        r.plazas
          ? `${formatInt(r.plazas)} ${r.plazas === 1 ? "plaza" : "plazas"} en ${r.instituciones ?? 0} ${r.instituciones === 1 ? "institución" : "instituciones"}`
          : null,
        sueldoDe(r),
      ]
        .filter(Boolean)
        .join(" · ");
    case "proceso":
    case "iniciativa":
      // El estado es el del día de la instantánea: se dice al lado, no en
      // una nota al pie («Abierto a ofertas» ayer puede estar cerrado hoy).
      return (
        <>
          {[
            r.detalle && corte && formatFecha(corte) !== SIN_DATO ? `${r.detalle} al ${formatFecha(corte)}` : r.detalle,
            r.tipo === "proceso" ? r.origen : null,
            r.valor ? `${formatPesos(r.valor)} estimado` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          {r.fecha && (
            <>
              {" · "}
              <Antiguedad iso={r.fecha} prefijo={r.tipo === "proceso" ? "publicado" : "depositada"} />
            </>
          )}
        </>
      );
    case "sentencia":
      return (
        <>
          {[r.detalle, r.origen].filter(Boolean).join(" · ")}
          {r.fecha && (
            <>
              {" · "}
              <Antiguedad iso={r.fecha} prefijo="dictada" />
            </>
          )}
        </>
      );
    default:
      return r.detalle;
  }
}

/**
 * «RD$50,000 de mediana al mes; 8 de cada 10 plazas, de RD$40,000 a
 * RD$95,000», o una sola cifra si no varía.
 */
function sueldoDe(r: Resultado): string | null {
  const s = r.sueldo;
  if (!s) return null;
  // Con menos de diez plazas no hay «8 de cada 10»: el tramo es de todas.
  if (r.plazas !== null && r.plazas < 10 && s.alto - s.bajo > s.mediana * 0.01) {
    return `${formatPesos(s.mediana)} de mediana al mes; de ${formatPesos(s.bajo)} a ${formatPesos(s.alto)} en sus ${r.plazas} plazas`;
  }
  // Un tramo de centavos (RD$82,605 a RD$82,606) es una sola cifra.
  if (s.alto - s.bajo <= s.mediana * 0.01) return `${formatPesos(s.mediana)} al mes`;
  return `${formatPesos(s.mediana)} de mediana al mes; 8 de cada 10 plazas, de ${formatPesos(s.bajo)} a ${formatPesos(s.alto)}`;
}

function FilaResultado({ r, q, corte }: { r: Resultado; q: string; corte?: string }) {
  const titulo = EN_MAYUSCULAS.has(r.tipo) ? desdeMayusculas(r.titulo) : r.titulo;
  return (
    <Fila
      href={r.href}
      externo={r.externo}
      titulo={<Resaltado texto={titulo} consulta={q} />}
      detalle={detalleDe(r, corte)}
      marca={
        r.via === "tema" ? (
          <Badge variant="contorno" title="No lleva todas tus palabras: trata de algo parecido.">
            Por tema
          </Badge>
        ) : null
      }
    />
  );
}

/** Las pantallas de la plataforma que contestan lo tecleado (G4). */
function Pantallas({ lista }: { lista: PantallaHallada[] }) {
  return (
    <Grupo titulo="Pantallas que lo responden" nota="Por lo que significa tu búsqueda, no solo por sus palabras.">
      <ul className="divide-y divide-hairline">
        {lista.map((p) => (
          <li key={p.href}>
            <Fila
              href={p.href}
              titulo={p.titulo}
              detalle={p.pregunta ? `${p.nota} · «${p.pregunta}»` : `${p.nota} · ${p.tema}`}
            />
          </li>
        ))}
      </ul>
    </Grupo>
  );
}

function Grupo({
  titulo,
  nota,
  mas,
  children,
}: {
  titulo: string;
  nota?: string;
  mas?: { href: string; texto: string };
  children: React.ReactNode;
}) {
  return (
    <Card as="section" className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <CardTitle>{titulo}</CardTitle>
        {mas && (
          <Link href={mas.href} className="inline-flex min-h-6 shrink-0 items-center text-xs font-medium text-brand-700 hover:underline">
            {mas.texto}
          </Link>
        )}
      </div>
      {nota && <p className="mt-1 text-xs leading-relaxed text-ink-soft">{nota}</p>}
      <div className="mt-2">{children}</div>
    </Card>
  );
}

/**
 * Los grupos que no trajeron nada, nombrados juntos en una línea: «Nada con
 * «agua» en Normativa u Obras públicas.» Se lee de una vez y no empuja fuera
 * de la pantalla lo que sí trajo algo. Una lista disyuntiva y no «ni»: la
 * frase afirma que no apareció en ninguno, y «o» lo dice sin doble negación.
 */
function SinCoincidencias({ q, donde }: { q: string; donde: string[] }) {
  const lista = new Intl.ListFormat("es", { type: "disjunction" }).format(donde);
  return (
    <p className="px-1 text-sm leading-relaxed text-ink-soft">
      Nada con «{q}» en {lista}.
    </p>
  );
}

function Fila({
  href,
  titulo,
  detalle,
  marca,
  externo = false,
}: {
  href: string | null;
  titulo: React.ReactNode;
  detalle?: React.ReactNode;
  /** Una marca al lado del detalle: «Por tema». */
  marca?: React.ReactNode;
  /** Un archivo o una ficha en el sitio de otra institución: pestaña nueva y su icono. */
  externo?: boolean;
}) {
  const Icono = externo ? IconExternal : IconArrowRight;
  const cuerpo = (
    <>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm leading-snug text-ink [overflow-wrap:anywhere] group-hover:text-brand-700">
          {titulo}
        </span>
        {(detalle || marca) && (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
            {detalle && <span className="min-w-0">{detalle}</span>}
            {marca}
          </span>
        )}
      </span>
      {href && <Icono className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />}
    </>
  );
  if (href && externo) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="group flex min-h-11 items-start gap-3 py-2.5">
        {cuerpo}
        <span className="sr-only">(se abre en otra pestaña)</span>
      </a>
    );
  }
  return href ? (
    <Link href={href} className="group flex min-h-11 items-start gap-3 py-2.5">
      {cuerpo}
    </Link>
  ) : (
    <div className="flex items-start gap-3 py-2.5">{cuerpo}</div>
  );
}
