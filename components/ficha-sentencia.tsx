import Link from "next/link";
import type { Metadata } from "next";
import { describir, iriDe, relacionesDesdeTriples, type Relacion } from "@/lib/grafo-rdf";
import { metaGrafo } from "@/lib/grafo-compilado";
import { enlace, type NodoRdf } from "@/lib/grafo";
import { expandir, type Triple } from "@/lib/rdf";
import { formatFecha } from "@/lib/format";
import Antiguedad from "@/components/antiguedad";
import { Ruta } from "@/components/ruta";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconExternal } from "@/components/icons";
import { ConectadoCon } from "@/components/conectado-con";
import Guardar from "@/components/espacios/guardar";
import { EnElGrafo, alternasRdf } from "@/components/en-el-grafo";

/**
 * La ficha de una sentencia del Tribunal Constitucional o del Tribunal
 * Superior Electoral: qué tribunal la dicta, cuándo, qué expedientes
 * resuelve, de qué trata, qué normas y qué sentencias nombra, cuáles la
 * nombran y dónde está su texto —en el sitio del tribunal: la plataforma no lo
 * copia—. Es un nodo del grafo y se lee del compilado, no de la instantánea
 * (`sentencias.json` no viaja en ninguna función; docs/INFRAESTRUCTURA.md §7).
 * La usan `/constitucional/[numero]` y `/tse/[ficha]`.
 */

const LISTADO = {
  tc: { href: "/constitucional", label: "Tribunal Constitucional" },
  tse: { href: "/tse", label: "Tribunal Superior Electoral" },
} as const;

interface Leida {
  nodo: NodoRdf;
  tribunal: keyof typeof LISTADO;
  numero: string;
  fecha: string | null;
  relativo: string | null;
  expedientes: string[];
  /** Su ficha en el sitio del tribunal. */
  ficha: string | null;
  relaciones: Relacion[];
  corte: string | null;
}

const P = {
  codigo: expandir("soc:codigo"),
  fecha: expandir("soc:fecha"),
  descripcion: expandir("dct:description"),
  expediente: expandir("do:expediente"),
  fuente: expandir("dct:source"),
};

function literales(triples: Triple[], sujeto: string, p: string): string[] {
  return triples.filter((x) => x.s.valor === sujeto && x.p === p).map((x) => x.o.valor);
}

/** La sentencia de un nodo, leída del grafo compilado; `null` si no lo es o no está. */
export async function cargarSentencia(n: NodoRdf | null): Promise<Leida | null> {
  if (n?.tipo !== "sentencia") return null;
  const [d, meta] = await Promise.all([describir(n), metaGrafo()]);
  if (!d) return null;
  const s = iriDe(n);
  const [numero] = literales(d.triples, s, P.codigo);
  if (!numero) return null;
  return {
    nodo: n,
    tribunal: n.id.startsWith("TSE-") ? "tse" : "tc",
    numero,
    fecha: literales(d.triples, s, P.fecha)[0] ?? null,
    relativo: literales(d.triples, s, P.descripcion)[0] ?? null,
    expedientes: literales(d.triples, s, P.expediente),
    ficha: literales(d.triples, s, P.fuente)[0] ?? null,
    relaciones: relacionesDesdeTriples(d.triples, s),
    corte: meta?.grafos.find((g) => g.clave === "sentencias")?.corte ?? null,
  };
}

/**
 * El nombre de la ficha. El TSE repite números (697 para 713 sentencias): la
 * suya lleva además la fecha, para que dos fichas no se llamen igual.
 */
const titulo = (x: Leida) => `Sentencia ${x.numero}${x.tribunal === "tse" && x.fecha ? ` del ${formatFecha(x.fecha)}` : ""}`;

export function metadatosSentencia(x: Leida | null): Metadata {
  if (!x) return { title: "Sentencia no encontrada" };
  const tribunal = LISTADO[x.tribunal].label;
  return {
    title: titulo(x),
    alternates: { canonical: enlace.sentencia(x.nodo.id), types: alternasRdf(x.nodo) },
    description: `Sentencia ${x.numero} del ${tribunal}${x.fecha ? `, del ${formatFecha(x.fecha)}` : ""}: de qué trata, qué normas y sentencias nombra y dónde está su texto.`,
  };
}

/** Una lista de aristas de la ficha: cada una a su nodo, con su fecha y lo que la precisa. */
function Aristas({ lista }: { lista: Relacion[] }) {
  return (
    <ul className="-mx-5 mt-3 divide-y divide-hairline border-t border-hairline text-sm sm:-mx-6">
      {lista.map((r) => (
        <li key={`${r.verbo}|${r.href}`} className="relative px-5 py-3 transition-colors hover:bg-brand-50/40 sm:px-6">
          <span className="rotulo text-ink-soft">{r.verbo}</span>
          {r.href ? (
            <Link href={r.href} className="estira mt-0.5 block font-medium text-ink hover:text-brand-700">
              {r.nombre}
            </Link>
          ) : (
            <span className="mt-0.5 block font-medium text-ink">{r.nombre}</span>
          )}
          {(r.detalle || r.fecha) && (
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft [overflow-wrap:anywhere]">
              {r.fecha && <Antiguedad iso={r.fecha} prefijo={(r.movimiento ?? "fechada").toLowerCase()} />}
              {r.fecha && r.detalle ? " · " : null}
              {r.detalle}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function FichaSentencia({ x }: { x: Leida }) {
  const listado = LISTADO[x.tribunal];
  const tribunal = x.relaciones.find((r) => r.verbo === "La dicta");
  const normas = x.relaciones.filter((r) => r.grupo === "normas");
  const nombra = x.relaciones.filter((r) => r.verbo === "Cita la sentencia");
  const laNombran = x.relaciones.filter((r) => r.verbo.startsWith("Una sentencia"));
  const sitio = x.ficha ? (/^https?:\/\/([^/]+)/.exec(x.ficha)?.[1] ?? null) : null;

  return (
    <div className="space-y-5">
      <Ruta seccion="normativa" padre={listado} actual={`Sentencia ${x.numero}`} />

      <Card as="section" className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="contorno">{listado.label}</Badge>
          {x.fecha && <span className="rotulo text-ink-soft">Dictada el {formatFecha(x.fecha)}</span>}
        </div>
        <h1 className="mt-3 font-display text-2xl leading-tight sm:text-3xl">{titulo(x)}</h1>
        {x.relativo && (
          <>
            <p className="mt-3 text-xs text-ink-soft">Qué dice de ella el listado del tribunal:</p>
            <p className="mt-1 text-[15px] leading-relaxed text-ink [overflow-wrap:anywhere]">{x.relativo}</p>
          </>
        )}
        {x.expedientes.length > 0 && (
          <p className="mt-2 text-sm text-ink-soft">
            {x.expedientes.length === 1 ? "Expediente" : "Expedientes"} <span className="font-mono">{x.expedientes.join(", ")}</span>
          </p>
        )}
        {/*
          Se guarda con su ficha en el tribunal como dirección, la misma con que
          se guardaban las sentencias antes de tener ficha aquí: lo guardado
          entonces se reconoce como guardado.
        */}
        {x.ficha && (
          <Guardar
            referencia={{ tipo: "sentencia", ref: x.ficha, titulo: `${titulo(x)}${x.relativo ? `: ${x.relativo}` : ""}`.slice(0, 300), href: enlace.sentencia(x.nodo.id) }}
            className="mt-4"
          />
        )}
      </Card>

      <ConectadoCon
        aristas={[
          tribunal?.href && { etiqueta: "Tribunal que la dicta", href: tribunal.href, nombre: tribunal.nombre, fuente: "Listado del tribunal" },
          { etiqueta: "Las sentencias del tribunal", href: listado.href, fuente: "Listado del tribunal, en vivo" },
        ]}
      />

      {normas.length > 0 && (
        <Card as="section" className="p-5 sm:p-6">
          <CardTitle>¿Qué normas nombra?</CardTitle>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Las leyes y los decretos con ficha que aparecen en lo que el listado dice de esta sentencia, leídos con las mismas
            reglas que los títulos de las normas. Que la nombre no dice qué decidió sobre ella: eso está en su texto.
          </p>
          <Aristas lista={normas} />
        </Card>
      )}

      {(nombra.length > 0 || laNombran.length > 0) && (
        <Card as="section" className="p-5 sm:p-6">
          <CardTitle>¿Qué sentencias nombra y cuáles la nombran?</CardTitle>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Solo las del Tribunal Constitucional que lo dicho en el listado nombra por su número («TC/0425/24»).
          </p>
          <Aristas lista={[...nombra, ...laNombran]} />
        </Card>
      )}

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle>¿Dónde está su texto?</CardTitle>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          En el sitio del tribunal. Ningún listado trae el PDF: está en la ficha de cada sentencia, que es adonde lleva este
          enlace.
        </p>
        {x.ficha && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <a href={x.ficha} target="_blank" rel="noopener noreferrer">
                Abrir su ficha en {sitio ?? "el tribunal"}
                <IconExternal className="h-4 w-4" />
                <span className="sr-only">(se abre en otra pestaña)</span>
              </a>
            </Button>
          </div>
        )}
      </Card>

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuente: el listado público de sentencias del {listado.label}
        {x.corte ? `, leído el ${formatFecha(x.corte)}` : ""}. Lo que el listado dice de cada sentencia va recortado,
        como lo publica. Mira{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          el estado de las fuentes
        </Link>
        .
      </p>
      <EnElGrafo nodo={x.nodo} className="mt-6" />
    </div>
  );
}
