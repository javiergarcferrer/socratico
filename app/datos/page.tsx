import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getCatalogo } from "@/lib/catalogo";
import { enlace } from "@/lib/grafo";
import { agujas, contieneTodas, plano, recortar } from "@/lib/raiz";
import { formatFecha } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";
import { NavFiltros, FiltroEnlace } from "@/components/nav-filtros";
import { BuscadorUrl } from "@/components/buscador-url";
import { EstadoVacio } from "@/components/estado-vacio";
import { Paginador } from "@/components/paginador";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  alternates: { canonical: "/datos" },
  title: "Datos abiertos del Estado",
  description:
    "Todos los conjuntos de datos públicos del portal datos.gob.do en un buscador: qué institución publica qué, en qué formato y sobre qué tema.",
};

export const revalidate = 86400;

const POR_PAGINA = 40;

/**
 * ¿Qué datos publica el Estado? — el catálogo entero de datos.gob.do, buscable
 * por título, organización, grupo y formato (`lib/catalogo.ts`). Filtros y
 * página viven en la URL.
 */
export default async function DatosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; grupo?: string; org?: string; formato?: string; p?: string }>;
}) {
  const sp = await searchParams;
  const c = await getCatalogo();
  if (!c) {
    return (
      <EstadoVacio
        variante="caida"
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="No pudimos leer el catálogo de datos abiertos"
        accion={
          <Button asChild variant="secondary">
            <a href="https://datos.gob.do/dataset/" target="_blank" rel="noopener noreferrer">
              Ir a datos.gob.do
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          </Button>
        }
      >
        La copia del catálogo no está disponible en este momento; el portal sigue en su sitio.
      </EstadoVacio>
    );
  }

  const grupos = new Map<string, number>();
  const formatos = new Map<string, number>();
  for (const x of c.conjuntos) {
    for (const g of x.grupos) grupos.set(g, (grupos.get(g) ?? 0) + 1);
    for (const f of x.formatos) formatos.set(f, (formatos.get(f) ?? 0) + 1);
  }
  const listaGrupos = [...grupos.entries()].sort((a, b) => b[1] - a[1]);
  const listaFormatos = [...formatos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const grupo = grupos.has(sp.grupo ?? "") ? sp.grupo! : null;
  const formato = formatos.has(sp.formato ?? "") ? sp.formato! : null;
  const org = (sp.org ?? "").slice(0, 160) || null;
  const q = recortar(sp.q, 120);
  const aguja = q ? agujas(q) : null;

  const filtrados = c.conjuntos.filter((x) => {
    if (grupo && !x.grupos.includes(grupo)) return false;
    if (formato && !x.formatos.includes(formato)) return false;
    if (org && x.org !== org) return false;
    if (aguja) {
      if (!contieneTodas(plano(`${x.titulo} ${x.org}`), aguja)) return false;
    }
    return true;
  });
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Number(sp.p) || 1), paginas);
  const vista = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const url = (cambios: Record<string, string | null | undefined>) => {
    const u = new URLSearchParams();
    const todo = { q: q || null, grupo, formato, org, ...cambios };
    for (const [k, v] of Object.entries(todo)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `/datos?${s}` : "/datos";
  };

  return (
    <div className="space-y-5">
      <Portada
        rotulo={`Datos abiertos · datos.gob.do · catálogo del ${formatFecha(c.generado)}`}
        titulo="¿Qué datos publica el Estado?"
        descripcion={
          <>
            El catálogo entero del portal de datos abiertos del Estado, en un solo
            buscador: qué institución publica qué, en qué formato y sobre qué tema.
            Cada conjunto abre su ficha: quién lo publica, en qué formatos y el enlace a
            datos.gob.do, donde están los archivos. El total es el que contamos
            recorriendo el catálogo, no el rótulo del portal, que dice lo mismo busques
            lo que busques.
          </>
        }
      >
        <PortadaCifras>
          <PortadaCifra etiqueta="Conjuntos de datos" valor={formatInt(c.total)} destacar />
          <PortadaCifra etiqueta="Organizaciones" valor={formatInt(c.organizaciones)} />
          <PortadaCifra etiqueta="Grupos temáticos" valor={formatInt(grupos.size)} />
        </PortadaCifras>
      </Portada>

      <Suspense>
        <BuscadorUrl
          etiqueta="Buscar en el catálogo"
          placeholder="Nómina, precios, hospitales, matrícula, accidentes…"
          ayuda={`Busca todas las palabras en el título y la organización de los ${formatInt(c.total)} conjuntos, sin distinguir tildes.`}
        />
      </Suspense>

      <NavFiltros etiqueta="Grupo temático">
        <FiltroEnlace href={url({ grupo: null, p: null })} activo={!grupo}>
          Todos
        </FiltroEnlace>
        {listaGrupos.map(([g, n]) => (
          <FiltroEnlace key={g} href={url({ grupo: g, p: null })} activo={grupo === g}>
            {g} · {formatInt(n)}
          </FiltroEnlace>
        ))}
      </NavFiltros>

      <NavFiltros etiqueta="Formato">
        <FiltroEnlace href={url({ formato: null, p: null })} activo={!formato}>
          Cualquiera
        </FiltroEnlace>
        {listaFormatos.map(([f, n]) => (
          <FiltroEnlace key={f} href={url({ formato: f, p: null })} activo={formato === f} mono>
            {f} · {formatInt(n)}
          </FiltroEnlace>
        ))}
      </NavFiltros>

      {org && (
        <p className="text-sm text-ink-soft">
          Solo de <strong className="font-medium text-ink">{org}</strong> ·{" "}
          <Link href={url({ org: null, p: null })} className="font-medium text-brand-700 hover:underline">
            ver todas las organizaciones
          </Link>
        </p>
      )}

      {vista.length === 0 ? (
        <EstadoVacio
          titulo={q ? `Ningún conjunto coincide con «${q}»` : "Ningún conjunto con estos filtros"}
          accion={
            <Button asChild variant="secondary">
              <Link href="/datos">Ver el catálogo entero</Link>
            </Button>
          }
        >
          Prueba con menos palabras, otro grupo u otro formato.
        </EstadoVacio>
      ) : (
        <Card as="section" className="overflow-hidden">
          <p className="px-5 pt-4 text-xs text-ink-soft sm:px-6" aria-live="polite">
            {formatInt(filtrados.length)} {filtrados.length === 1 ? "conjunto" : "conjuntos"}, por orden alfabético.
          </p>
          <ol className="mt-2 divide-y divide-hairline border-t border-hairline">
            {vista.map((x) => (
              <li key={x.slug} className="relative px-5 py-3 sm:px-6">
                <Link
                  href={enlace.conjunto(x.slug)}
                  className="block text-[15px] leading-snug text-ink [overflow-wrap:anywhere] estira hover:text-brand-700"
                >
                  {x.titulo}
                </Link>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                  <Link href={url({ org: x.org, p: null })} className="relative z-10 inline-flex min-h-6 items-center hover:text-brand-700 hover:underline">
                    {x.org || "Sin organización"}
                  </Link>
                  {x.formatos.slice(0, 4).map((f) => (
                    <Badge key={f} variant="contorno">
                      {f}
                    </Badge>
                  ))}
                </span>
              </li>
            ))}
          </ol>
          {paginas > 1 && (
            <div className="border-t border-hairline px-5 py-3 sm:px-6">
              <Paginador pagina={pagina} paginas={paginas} href={(p) => url({ p: p > 1 ? String(p) : null })} />
            </div>
          )}
        </Card>
      )}

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuente:{" "}
        <a href={c.fuente} className="font-medium text-brand-700 hover:underline">
          datos.gob.do
        </a>
        , recorrido entero el {formatFecha(c.generado)} por su búsqueda pública,
        respetando la pausa de diez segundos que pide su robots. Que un conjunto esté
        en el catálogo no garantiza que su archivo esté al día ni que el enlace
        funcione: muchas fichas remiten al portal de la institución. Lo que la
        plataforma ya lee y procesa de estos conjuntos (las nóminas, por ejemplo)
        está en su sección. Mira{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          el estado de las fuentes
        </Link>
        .
      </p>
    </div>
  );
}
