import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { documentoPorClave, getIndiceBiblioteca, tituloLegible, type TipoDocumento } from "@/lib/biblioteca";
import { hrefInstitucion, institucionPorId } from "@/lib/instituciones";
import { referenciasNormativas } from "@/lib/legislacion";
import { formatFecha } from "@/lib/format";
import { enlace, nodoDeRuta } from "@/lib/grafo";
import { sinCedula } from "@/lib/padron";
import { Ruta } from "@/components/ruta";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconExternal } from "@/components/icons";
import { ConectadoCon } from "@/components/conectado-con";
import { EnElGrafo, alternasRdf } from "@/components/en-el-grafo";

export const revalidate = 86400;

interface Props {
  params: Promise<{ ruta: string[] }>;
}

const ETIQUETA_TIPO: Record<TipoDocumento, string> = { pdf: "PDF", xlsx: "Excel", xls: "Excel", docx: "Word", doc: "Word" };

/** El documento de la ruta: su clave (la dirección de su archivo sin `https://`), si la ruta es la de un documento. */
function claveDe(ruta: string[]): string | null {
  const n = nodoDeRuta(`/documentos/${ruta.join("/")}`);
  return n?.tipo === "documento" ? n.id : null;
}

async function cargar(ruta: string[]) {
  const clave = claveDe(ruta);
  const d = clave ? await documentoPorClave(clave) : null;
  return clave && d ? { clave, d } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const x = await cargar((await params).ruta);
  if (!x) return { title: "Documento no encontrado" };
  const titulo = tituloLegible(sinCedula(x.d.titulo));
  return {
    title: titulo,
    alternates: { canonical: enlace.documento(x.clave), types: alternasRdf({ tipo: "documento", id: x.clave }) },
    description: `Documento ${ETIQUETA_TIPO[x.d.tipo]} que una institución publica en ${x.d.host}: quién lo publica, cuándo lo subió y dónde está el archivo.`,
  };
}

/**
 * Ficha de un documento de la biblioteca de una institución: qué es, quién lo
 * publica, cuándo se subió y en qué formato, qué normas nombra su título y
 * dónde está el archivo —en el sitio de la institución: la plataforma no lo
 * copia—. Es un nodo del grafo (`lib/biblioteca.ts`, docs/INFRAESTRUCTURA.md §7).
 */
export default async function DocumentoPage({ params }: Props) {
  const x = await cargar((await params).ruta);
  if (!x) notFound();
  const { d } = x;
  const indice = await getIndiceBiblioteca();
  const fuente = indice?.fuentes.find((f) => f.host === d.host) ?? null;
  const inst = fuente?.uc != null ? institucionPorId(fuente.uc) : null;
  const original = sinCedula(d.titulo);
  const titulo = tituloLegible(original);
  // Las normas que nombra su título, con la misma lectura que el grafo. Solo
  // una ley o un decreto llevan a su ficha: una resolución la numeran muchos
  // órganos, y la «Resolución 206-2026» de un ministerio no es la del Congreso.
  const normas = referenciasNormativas(titulo)
    .map((r) => ({
      texto: `${r.tipo}${r.numero ? ` ${r.numero}` : ""}`,
      href: r.numero && (r.tipo === "Ley" || r.tipo === "Decreto") ? enlace.norma(r.tipo, r.numero) : null,
    }))
    .filter((r, i, todas) => todas.findIndex((o) => o.texto === r.texto) === i);
  const sitio = /^https?:\/\/([^/]+)/.exec(d.url)?.[1] ?? d.host;

  return (
    <div className="space-y-5">
      <Ruta raiz={{ href: "/documentos", label: "Biblioteca del Estado" }} actual="Documento" />

      <Card as="section" className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="contorno">{ETIQUETA_TIPO[d.tipo]}</Badge>
          <span className="rotulo text-ink-soft">Subido el {formatFecha(d.fecha)}</span>
        </div>
        <h1 className="mt-3 font-display text-2xl leading-tight [overflow-wrap:anywhere] sm:text-3xl">{titulo}</h1>
        {titulo !== original && <p className="mt-1 text-xs text-ink-soft [overflow-wrap:anywhere]">Publicado como «{original}».</p>}
        <p className="mt-2 text-sm text-ink-soft">
          Lo publica{" "}
          {inst ? (
            <Link href={hrefInstitucion(inst)} className="font-medium text-brand-700 hover:underline">
              {inst.nombre}
            </Link>
          ) : (
            <span className="font-medium text-ink">{fuente?.nombre ?? d.host}</span>
          )}{" "}
          en su sitio, <span className="font-mono">{sitio}</span>.
        </p>
      </Card>

      <ConectadoCon
        aristas={[
          inst && { etiqueta: "Institución que lo publica", href: hrefInstitucion(inst), nombre: inst.nombre, fuente: "Biblioteca de su portal" },
          fuente && { etiqueta: "Su biblioteca", href: `/documentos?inst=${encodeURIComponent(fuente.host)}`, cuenta: fuente.documentos, fuente: fuente.nombre },
        ]}
      />

      {normas.length > 0 && (
        <Card as="section" className="p-5 sm:p-6">
          <CardTitle>¿Qué normas nombra?</CardTitle>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Las que nombra su título, leídas con las mismas reglas que los títulos de las normas. Un documento no cambia una
            norma: solo la nombra.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {normas.map((r) => (
              <li key={r.texto}>
                {r.href ? (
                  <Link href={r.href} className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 hover:underline sm:min-h-0">
                    {r.texto}
                  </Link>
                ) : (
                  <span className="text-sm text-ink">{r.texto}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle>¿Dónde está el archivo?</CardTitle>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          En el sitio de la institución, tal como lo subió. El título es el que le puso y la fecha es la de subida, no la
          del documento: un informe de hace años puede haberse subido ayer.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <a href={d.url} target="_blank" rel="noopener noreferrer">
              Abrir el archivo ({ETIQUETA_TIPO[d.tipo]})
              <IconExternal className="h-4 w-4" />
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          </Button>
        </div>
      </Card>

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuente: la biblioteca pública de {fuente?.nombre ?? d.host}, leída
        {indice ? ` el ${formatFecha(indice.generado)}` : ""} por la vía de lectura que su sitio WordPress deja abierta.
        Mira{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          el estado de las fuentes
        </Link>
        .
      </p>
      <EnElGrafo nodo={{ tipo: "documento", id: x.clave }} className="mt-6" />
    </div>
  );
}
