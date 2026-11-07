import Link from "next/link";
import type { Metadata } from "next";
import { describir, iriDe, relacionesDesdeTriples, type Relacion } from "@/lib/grafo-rdf";
import { DEFINICION_SENTIDO, ETIQUETA_SENTIDO, SENTIDOS, type Sentido } from "@/lib/vocabulario-textos";
import { Aristas } from "@/components/aristas";
import { metaGrafo } from "@/lib/grafo-compilado";
import { enlace, type NodoRdf } from "@/lib/grafo";
import { expandir, type Triple } from "@/lib/rdf";
import { formatFecha } from "@/lib/format";
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
 * resuelve, de qué trata, qué decidió —su dispositivo y el sentido que se lee
 * de él, de su texto íntegro (`scripts/build-textos.mjs`)—, qué normas
 * declara conformes o no con la Constitución, qué normas y qué sentencias
 * nombra, cuáles la nombran y dónde está su texto —en el sitio del tribunal:
 * la plataforma no lo copia—. Es un nodo del grafo y se lee del compilado, no de la instantánea
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
  /** Lo que se leyó en su texto íntegro, si se leyó: el PDF, sus páginas, su dispositivo y su sentido. */
  pdf: string | null;
  paginas: number | null;
  dispositivo: string | null;
  sentido: Sentido | null;
  /** Cuántas sentencias la nombran en su texto. */
  citadaEn: number;
  relaciones: Relacion[];
  corte: string | null;
  corteTexto: string | null;
}

const P = {
  codigo: expandir("soc:codigo"),
  fecha: expandir("soc:fecha"),
  descripcion: expandir("dct:description"),
  expediente: expandir("do:expediente"),
  fuente: expandir("dct:source"),
  archivo: expandir("schema:encoding"),
  paginas: expandir("soc:paginas"),
  dispositivo: expandir("soc:dispositivo"),
  sentido: expandir("soc:sentido"),
  vecesCitada: expandir("soc:vecesCitada"),
};
const SENTIDO_DE_IRI = new Map(SENTIDOS.map((x) => [expandir(`soc:sentido-${x}`), x]));

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
    pdf: literales(d.triples, s, P.archivo)[0] ?? null,
    paginas: Number(literales(d.triples, s, P.paginas)[0] ?? 0) || null,
    dispositivo: literales(d.triples, s, P.dispositivo)[0] ?? null,
    sentido: SENTIDO_DE_IRI.get(literales(d.triples, s, P.sentido)[0] ?? "") ?? null,
    citadaEn: Number(literales(d.triples, s, P.vecesCitada)[0] ?? 0),
    relaciones: relacionesDesdeTriples(d.triples, s, d.grafos),
    corte: meta?.grafos.find((g) => g.clave === "sentencias")?.corte ?? null,
    corteTexto: meta?.grafos.find((g) => g.clave === "texto")?.corte ?? null,
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
    description: `Sentencia ${x.numero} del ${tribunal}${x.fecha ? `, del ${formatFecha(x.fecha)}` : ""}: de qué trata${x.sentido ? ", qué decidió" : ""}, qué normas y sentencias nombra y dónde está su texto.`,
  };
}

export function FichaSentencia({ x }: { x: Leida }) {
  const listado = LISTADO[x.tribunal];
  const tribunal = x.relaciones.find((r) => r.verbo === "La dicta");
  const declara = x.relaciones.filter((r) => r.verbo.startsWith("Declara"));
  const normas = x.relaciones.filter((r) => r.grupo === "normas" && !declara.includes(r));
  const nombra = x.relaciones.filter((r) => r.verbo === "Cita la sentencia");
  const laNombran = x.relaciones.filter((r) => r.verbo.startsWith("Una sentencia"));
  const deSuTexto = (r: Relacion) => r.grafo === "texto";
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

      {x.dispositivo && (
        <Card as="section" className="p-5 sm:p-6">
          <CardTitle>¿Qué decidió?</CardTitle>
          {x.sentido && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge forma="etiqueta" variant="contorno">
                {ETIQUETA_SENTIDO[x.sentido]}
              </Badge>
              <span className="text-xs text-ink-soft">{DEFINICION_SENTIDO[x.sentido]}</span>
            </div>
          )}
          <p className="mt-3 text-xs text-ink-soft">Su dispositivo, como lo escribe el tribunal:</p>
          <p className="mt-1 text-[15px] leading-relaxed text-ink [overflow-wrap:anywhere]">{x.dispositivo}</p>
          {declara.length > 0 && <Aristas lista={declara} />}
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">
            Leído de su texto íntegro{x.paginas ? ` (${x.paginas.toLocaleString("es-DO")} páginas)` : ""}
            {x.corteTexto ? ` el ${formatFecha(x.corteTexto)}` : ""}. El sentido sale de los verbos del dispositivo («ACOGER», «RECHAZAR»,
            «DECLARAR no conforme con la Constitución…») con reglas fijas; el dispositivo manda.
          </p>
        </Card>
      )}

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
            Las del Tribunal Constitucional nombradas por su número («TC/0425/24») en lo que el listado dice de ella o en su texto íntegro
            (sus precedentes)
            {x.citadaEn > 0 ? `. La nombra el texto de ${x.citadaEn.toLocaleString("es-DO")} ${x.citadaEn === 1 ? "sentencia" : "sentencias"}` : ""}
            {laNombran.filter(deSuTexto).length < x.citadaEn ? `; aquí, las ${laNombran.filter(deSuTexto).length} más recientes` : ""}.
          </p>
          {nombra.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-bold text-ink">Las que nombra</p>
              <Aristas lista={nombra} visibles={6} cuantas="sentencias" />
            </div>
          )}
          {laNombran.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-bold text-ink">Las que la nombran</p>
              <Aristas lista={laNombran} visibles={6} cuantas="sentencias" />
            </div>
          )}
        </Card>
      )}

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle>¿Dónde está su texto?</CardTitle>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          En el sitio del tribunal. Ningún listado trae el PDF: está en la ficha de cada sentencia
          {x.pdf ? ", de donde se tomó este enlace" : ", que es adonde lleva este enlace"}.
        </p>
        {x.ficha && (
          <div className="mt-4 flex flex-wrap gap-2">
            {x.pdf && (
              <Button asChild>
                <a href={x.pdf} target="_blank" rel="noopener noreferrer">
                  Abrir el PDF
                  <IconExternal className="h-4 w-4" />
                  <span className="sr-only">(se abre en otra pestaña)</span>
                </a>
              </Button>
            )}
            <Button asChild variant={x.pdf ? "outline" : undefined}>
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
