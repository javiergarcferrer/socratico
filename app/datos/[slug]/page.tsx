import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { conjuntoPorSlug, getCatalogo, hrefConjunto, institucionDeOrganizacion } from "@/lib/catalogo";
import { hrefInstitucion } from "@/lib/instituciones";
import { formatFecha } from "@/lib/format";
import { enlace } from "@/lib/grafo";
import { Ruta } from "@/components/ruta";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconExternal } from "@/components/icons";
import { ConectadoCon } from "@/components/conectado-con";
import { EnElGrafo, alternasRdf } from "@/components/en-el-grafo";

export const revalidate = 86400;

interface Props {
  params: Promise<{ slug: string }>;
}

/** El nombre de un conjunto en datos.gob.do. */
const NOMBRE = /^[a-z0-9_-]{1,200}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = NOMBRE.test(slug) ? await conjuntoPorSlug(slug) : null;
  if (!c) return { title: "Conjunto de datos no encontrado" };
  return {
    title: c.titulo,
    alternates: { canonical: enlace.conjunto(slug), types: alternasRdf({ tipo: "conjunto", id: slug }) },
    description: `Conjunto de datos abiertos que publica ${c.org} en datos.gob.do: sus formatos, su grupo temático y dónde están sus archivos.`,
  };
}

/**
 * Ficha de un conjunto de datos abiertos: qué es, quién lo publica, en qué
 * formatos y de qué grupo, y dónde están sus archivos —en datos.gob.do: la
 * plataforma no los copia—. Es un nodo del grafo (`lib/catalogo.ts`,
 * docs/INFRAESTRUCTURA.md §7): la institución que lo publica la ata
 * `institucionDeOrganizacion`, o la ficha dice que no la identificó.
 */
export default async function ConjuntoPage({ params }: Props) {
  const { slug } = await params;
  if (!NOMBRE.test(slug)) notFound();
  const [c, catalogo] = await Promise.all([conjuntoPorSlug(slug), getCatalogo()]);
  if (!c || !catalogo) notFound();
  const inst = institucionDeOrganizacion(c.org);
  const deLaOrganizacion = catalogo.conjuntos.filter((x) => x.org === c.org).length;

  return (
    <div className="space-y-5">
      <Ruta raiz={{ href: "/datos", label: "Datos abiertos" }} actual="Conjunto de datos" />

      <Card as="section" className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rotulo text-ink-soft">Conjunto de datos abiertos</span>
          {c.grupos.map((g) => (
            <Badge key={g} variant="contorno">
              {g}
            </Badge>
          ))}
        </div>
        <h1 className="mt-3 font-display text-2xl leading-tight [overflow-wrap:anywhere] sm:text-3xl">{c.titulo}</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Lo publica{" "}
          {inst ? (
            <Link href={hrefInstitucion(inst)} className="font-medium text-brand-700 hover:underline">
              {inst.nombre}
            </Link>
          ) : (
            <span className="font-medium text-ink">{c.org}</span>
          )}
          {inst && inst.nombre !== c.org ? `, que datos.gob.do nombra «${c.org}»` : ""}.
          {!inst && " No la encontramos en el cruce de instituciones del Estado, así que no se liga a ninguna ficha."}
        </p>
        {c.formatos.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
            <span>Formatos:</span>
            {c.formatos.map((f) => (
              <Badge key={f} variant="contorno">
                {f}
              </Badge>
            ))}
          </p>
        )}
      </Card>

      <ConectadoCon
        aristas={[
          inst && { etiqueta: "Institución que lo publica", href: hrefInstitucion(inst), nombre: inst.nombre, fuente: "datos.gob.do ↔ cruce de instituciones" },
          { etiqueta: "Conjuntos de la misma organización", href: `/datos?org=${encodeURIComponent(c.org)}`, cuenta: deLaOrganizacion, fuente: "datos.gob.do" },
        ]}
      />

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle>¿Dónde están los datos?</CardTitle>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          En su página de datos.gob.do, con cada archivo y su fecha. Que el conjunto esté en el catálogo no garantiza que
          su archivo esté al día ni que el enlace funcione: muchas páginas remiten al portal de la institución.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <a href={hrefConjunto(slug)} target="_blank" rel="noopener noreferrer">
              Sus archivos en datos.gob.do
              <IconExternal className="h-4 w-4" />
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          </Button>
        </div>
      </Card>

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuente:{" "}
        <a href={catalogo.fuente} className="font-medium text-brand-700 hover:underline">
          datos.gob.do
        </a>
        , catálogo recorrido el {formatFecha(catalogo.generado)}. El título, la organización, los formatos y el grupo son
        los del portal, erratas incluidas.
      </p>
      <EnElGrafo nodo={{ tipo: "conjunto", id: slug }} className="mt-6" />
    </div>
  );
}
