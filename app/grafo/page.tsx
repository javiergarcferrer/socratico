import Link from "next/link";
import { cache } from "react";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Cifra, Rotulo, TiraDeCifras } from "@/components/papel";
import { EstadoVacio } from "@/components/estado-vacio";
import { BuscadorUrl } from "@/components/buscador-url";
import { RedVecinos, type VecinoRed } from "@/components/graficos";
import { Ruta } from "@/components/ruta";
import Plegable from "@/components/plegable";
import Antiguedad from "@/components/antiguedad";
import { IconExternal } from "@/components/icons";
import { formatInt } from "@/lib/nomina";
import { formatFecha, formatPesos } from "@/lib/format";
import { SITIO } from "@/lib/sitio";
import { enlace, nodoDeRuta, rutaDeNodo, type NodoRdf } from "@/lib/grafo";
import {
  GRUPOS,
  buscarNodos,
  claveNodo,
  enlacesWikidata,
  inventario,
  vecindario,
  volcadoDelGrafo,
  type Candidato,
  type Candidatos,
  type Relacion,
} from "@/lib/grafo-rdf";

/**
 * El explorador del grafo: la plataforma vista como lo que es, nodos y
 * aristas. Sin `nodo`, la portada (qué hay, cuánto, cómo se lee a máquina);
 * con `nodo`, la red de una ficha, pintada de su descripción RDF
 * (`lib/grafo-rdf.ts`), y la búsqueda de un camino hacia otra.
 *
 * Todo sale de las mismas instantáneas que pintan las fichas: ni base de
 * datos ni almacén de triples. La vista de un nodo no se indexa (repetiría su
 * ficha) y `robots.ts` la deja fuera del rastreo.
 */

export const revalidate = 86400;

type Props = { searchParams: Promise<{ nodo?: string; q?: string }> };

const cargar = cache(async (ruta: string) => {
  const nodo = nodoDeRuta(ruta);
  return nodo ? vecindario(nodo) : null;
});

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { nodo } = await searchParams;
  if (nodo) {
    const v = await cargar(nodo.slice(0, 200));
    return {
      title: v ? `${v.titulo}, en el grafo` : "Nodo no encontrado",
      description: v ? `Con quién se liga ${v.titulo} en los registros del Estado, y su descripción RDF.` : undefined,
      robots: { index: false, follow: true },
      ...(v
        ? {
            alternates: {
              canonical: enlace.grafo(rutaDeNodo(v.nodo)),
              types: {
                "text/turtle": enlace.rdf(rutaDeNodo(v.nodo), "ttl"),
                "application/ld+json": enlace.rdf(rutaDeNodo(v.nodo), "jsonld"),
              },
            },
          }
        : {}),
    };
  }
  return {
    title: "El grafo",
    description:
      "Cómo se ligan las personas con cargo, las instituciones, los decretos, los bancos, las empresas y las provincias en los registros del Estado dominicano. Con su ontología y en RDF.",
    alternates: { canonical: enlace.grafo(), types: { "text/turtle": "/.well-known/void" } },
  };
}

export default async function GrafoPage({ searchParams }: Props) {
  const { nodo, q } = await searchParams;
  const consulta = (q ?? "").trim().slice(0, 120);
  if (nodo) return <VistaNodo ruta={nodo.slice(0, 200)} consulta={consulta} />;
  return <Portada consulta={consulta} />;
}

/* ---------------------------------------------------------------- portada */

/** Las fichas por donde empezar: una de cada clase, con aristas que enseñan algo. */
const EJEMPLOS: { nodo: NodoRdf; nombre: string; porque: string }[] = [
  { nodo: { tipo: "funcionario", id: "luis-rodolfo-abinader-corona" }, nombre: "Luis Rodolfo Abinader Corona", porque: "Su cargo, los decretos que firmó y su identificador en Wikidata" },
  { nodo: { tipo: "institucion", id: "4" }, nombre: "Ministerio de Hacienda", porque: "Quién la dirige y los cargos de hoy, de su cabeza hacia abajo" },
  { nodo: { tipo: "decreto", id: "339-20" }, nombre: "Decreto 339-20", porque: "Quién lo firma y los cargos que registra" },
  { nodo: { tipo: "entidad-financiera", id: "banreservas" }, nombre: "Banreservas", porque: "Quién lo supervisa y su misma ficha como empresa y como institución" },
  { nodo: { tipo: "provincia", id: "santiago" }, nombre: "Santiago", porque: "Su gobernación y las alcaldías y juntas de distrito electas" },
];

const LISTADO_DE_CLASE: Record<string, string> = {
  "soc:Persona": "/funcionarios",
  "soc:Institucion": "/instituciones",
  "soc:Decreto": "/normativa",
  "soc:EntidadFinanciera": "/banca",
  "soc:Empresa": "/empresas",
  "soc:Provincia": "/provincias",
  "soc:DeclaracionJurada": "/auditorias",
  "do:MedidaDGCP": "/proveedores/inhabilitados",
  "soc:Proveedor": "/historico",
  "soc:Contratacion": "/historico",
};

async function Portada({ consulta }: { consulta: string }) {
  const [clases, wikidata, candidatos, volcado] = await Promise.all([
    inventario(),
    enlacesWikidata(),
    consulta ? buscarNodos(consulta) : Promise.resolve(null),
    volcadoDelGrafo(),
  ]);
  const ejemplo = `${SITIO}${enlace.funcionario("luis-rodolfo-abinader-corona")}`;
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <Rotulo>El grafo</Rotulo>
        <h1 className="mt-1.5 font-display text-3xl leading-tight text-ink sm:text-4xl">
          ¿Cómo se liga lo que publica el Estado?
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
          Cada ficha de la plataforma es un nodo: una persona con cargo, una institución, un decreto, un banco, una
          empresa, una provincia. Las aristas salen de los registros del Estado: quién ocupa qué cargo, qué decreto lo
          designó, quién lo firmó, quién supervisa a quién. Elige una ficha y mira con quién se liga; elige dos
          y busca el camino entre ellas.
        </p>
      </header>

      <section aria-labelledby="buscar-nodo" className="space-y-3">
        <h2 id="buscar-nodo" className="text-sm font-bold text-ink">
          ¿Por qué ficha empiezas?
        </h2>
        <BuscadorUrl
          etiqueta="Buscar una ficha del grafo"
          placeholder="Un nombre, una institución, 339-20 o un RNC"
          ayuda="Busca entre los nodos del grafo: personas con cargo, instituciones, entidades financieras y provincias por su nombre; un decreto por su número; una empresa por su RNC."
        />
        {candidatos && <ListaCandidatos resultado={candidatos} consulta={consulta} hacia={(c) => enlace.grafo(rutaDeNodo(c.nodo))} />}
      </section>

      {!consulta && (
        <Card as="section" aria-labelledby="para-empezar">
          <div className="px-5 pb-2 pt-4 sm:px-6">
            <CardTitle id="para-empezar">Para empezar</CardTitle>
          </div>
          <ul className="border-t border-hairline">
            {EJEMPLOS.map((e) => (
              <li key={claveNodo(e.nodo)} className="relative border-b border-hairline last:border-0">
                <div className="px-5 py-3.5 sm:px-6">
                  <Link
                    href={enlace.grafo(rutaDeNodo(e.nodo))}
                    rel="nofollow"
                    className="estira text-[15px] font-medium leading-snug text-ink hover:text-brand-700"
                  >
                    {e.nombre}
                  </Link>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{e.porque}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section aria-labelledby="que-hay" className="space-y-3">
        <h2 id="que-hay" className="text-sm font-bold text-ink">
          ¿Qué hay en el grafo?
        </h2>
        <TiraDeCifras>
          {clases.map((c) => (
            <Cifra
              key={c.clase}
              etiqueta={c.etiqueta}
              valor={formatInt(c.n)}
              nota={c.corte ? `${c.fuente}, al ${formatFecha(c.corte)}` : c.fuente}
              href={LISTADO_DE_CLASE[c.clase]}
            />
          ))}
          {wikidata.total > 0 && (
            <Cifra
              etiqueta="Fichas atadas a Wikidata"
              valor={formatInt(wikidata.total)}
              nota={`Solo sin dudas: ${wikidata.porTipo.provincias} provincias, ${wikidata.porTipo.instituciones} instituciones, ${wikidata.porTipo.financieras} bancos y ${wikidata.porTipo.personas} personas (PEP hoy o jefes de Estado); consultado el ${formatFecha(wikidata.generado ?? "")}`}
            />
          )}
        </TiraDeCifras>
        <p className="text-xs leading-relaxed text-ink-soft">
          Censos de las instantáneas de la plataforma, cada uno con su fuente y su fecha. Cada ficha dice además las
          suyas.
        </p>
      </section>

      <section aria-labelledby="a-maquina" className="space-y-3 text-[15px] leading-relaxed text-ink-soft">
        <h2 id="a-maquina" className="text-sm font-bold text-ink">
          ¿Y para leerlo a máquina?
        </h2>
        <p>
          Cada ficha tiene una dirección estable que nombra la cosa, no la página: la de la ficha con{" "}
          <code className="font-mono text-[13px] text-ink">#id</code> al final. Pedida con{" "}
          <code className="font-mono text-[13px] text-ink">Accept: text/turtle</code>,{" "}
          <code className="font-mono text-[13px] text-ink">application/ld+json</code> o{" "}
          <code className="font-mono text-[13px] text-ink">application/n-triples</code>, la ficha remite a su
          descripción RDF; cada una la trae además incrustada en schema.org para los buscadores.
        </p>
        <Card>
          <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed text-ink">
            {`curl -L -H "Accept: text/turtle" \\\n  ${ejemplo}`}
          </pre>
        </Card>
        <p>
          El vocabulario es la{" "}
          <Link href="/ontologia" className="text-brand-700 underline">
            ontología de la plataforma
          </Link>
          , en OWL y RDFS, alineada con schema.org, la Ontología de Organizaciones del W3C, FOAF, ELI y la de
          Organizaciones Registradas, con sus clases atadas a Wikidata. El conjunto se describe en{" "}
          <a href="/.well-known/void" className="text-brand-700 underline">
            VoID
          </a>
          . Cada descripción se arma al pedirla, de las mismas instantáneas que pintan las fichas: no hay un
          almacén de triples ni un servidor que mantener.
        </p>
        {volcado && (
          <p>
            El grafo sin personas naturales se descarga entero, para consultarlo con un motor propio:{" "}
            <a href={volcado.url} className="text-brand-700 underline">
              grafo.nt.gz
            </a>
            , <span className="font-mono text-[13px] text-ink">{formatInt(volcado.triples)}</span> triples en N-Triples
            comprimido, del {formatFecha(volcado.generado)}, para SPARQL (Oxigraph, QLever o Apache Jena, todos
            abiertos). Las mismas entidades, con lo contratado desde 2015 y los procesos de compra del último año,
            están también en nueve tablas para abrir en DuckDB, pandas o Polars (formato Parquet;{" "}
            <a href="/tablas/procesos.parquet" className="text-brand-700 underline">
              la de procesos
            </a>
            , por ejemplo; la lista de las nueve y sus columnas, en{" "}
            <a href="/tablas/meta.json" className="text-brand-700 underline">
              meta.json
            </a>
            ), y los asistentes de IA las consultan en SQL por el servidor MCP. Las personas
            con cargo, sus cargos y los decretos no entran:
            se leen una a una, en su ficha.
          </p>
        )}
        <p>
          Un asistente de IA (Claude, ChatGPT o cualquier cliente del Model Context Protocol) lo recorre con las
          mismas reglas por el servidor MCP de la plataforma:{" "}
          <Link href="/conectar" className="text-brand-700 underline">
            cómo conectarlo
          </Link>
          .
        </p>
      </section>

      <Aviso />
    </div>
  );
}

/** Lo que una arista no dice. Va en la portada, en cada nodo y en cada camino. */
function Aviso() {
  return (
    <p className="border-t border-hairline pt-4 text-xs leading-relaxed text-ink-soft">
      Que dos fichas se toquen dice que un registro del Estado las nombra juntas (un cargo, un decreto, una
      supervisión), no que haya una relación personal entre ellas. Una persona es su nombre: dos grafías son dos
      nodos, y nunca se usa la cédula.
    </p>
  );
}

function ListaCandidatos({
  resultado,
  consulta,
  hacia,
  sin,
}: {
  resultado: Candidatos;
  consulta: string;
  hacia: (c: Candidato) => string;
  /** Un nodo que no se ofrece (el de la vista, al buscar el otro extremo de un camino). */
  sin?: NodoRdf;
}) {
  const candidatos = sin ? resultado.candidatos.filter((c) => claveNodo(c.nodo) !== claveNodo(sin)) : resultado.candidatos;
  if (candidatos.length === 0) {
    return (
      <EstadoVacio titulo={`Ningún nodo del grafo se llama «${consulta}».`}>
        Prueba con menos palabras, con el nombre como lo escribe el Estado o con el número del decreto (339-20).
      </EstadoVacio>
    );
  }
  return (
    <Card as="section" aria-label={`Fichas que se llaman «${consulta}»`}>
      <p className="px-5 pt-3 text-xs text-ink-soft sm:px-6" aria-live="polite">
        {resultado.truncado
          ? `Las primeras ${candidatos.length} fichas con «${consulta}» en el nombre: hay más; escribe más palabras para afinar.`
          : `${candidatos.length === 1 ? "Una ficha" : `${candidatos.length} fichas`} con «${consulta}» en el nombre`}
      </p>
      <ul className="mt-2 border-t border-hairline">
        {candidatos.map((c) => (
          <li key={claveNodo(c.nodo)} className="relative border-b border-hairline last:border-0">
            <div className="px-5 py-3 sm:px-6">
              <Link href={hacia(c)} className="estira text-[15px] font-medium leading-snug text-ink hover:text-brand-700">
                {c.nombre}
              </Link>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                {c.clase}
                {c.detalle ? ` · ${c.detalle}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------- nodo */

/** Cuántos vecinos se dibujan; la lista los trae todos. */
const DIBUJO_MAX = 18;
/** Cuántas aristas de un grupo se ven antes de plegar el resto. */
const VISIBLES = 12;

async function VistaNodo({ ruta, consulta }: { ruta: string; consulta: string }) {
  const v = await cargar(ruta);
  if (!v) {
    return (
      <div className="mx-auto max-w-4xl">
        <Ruta raiz={{ href: enlace.grafo(), label: "El grafo" }} actual="Nodo no encontrado" />
        <EstadoVacio como="h1" titulo="Esa dirección no es un nodo del grafo." className="mt-6">
          El grafo tiene personas con cargo, instituciones, entidades financieras, empresas, decretos con ficha y
          provincias. Búscalo por su nombre en{" "}
          <Link href={enlace.grafo()} className="text-brand-700 underline">
            la portada del grafo
          </Link>
          .
        </EstadoVacio>
      </div>
    );
  }
  const propia = rutaDeNodo(v.nodo);
  const candidatos = consulta ? await buscarNodos(consulta) : null;

  // Un vecino por nodo, en el orden de las aristas: la primera arista es la que se escribe.
  const vistos = new Set<string>();
  const vecinos: VecinoRed[] = [];
  for (const r of v.relaciones) {
    if (!r.nodo) continue;
    const k = claveNodo(r.nodo);
    if (vistos.has(k) || k === claveNodo(v.nodo)) continue;
    vistos.add(k);
    vecinos.push({
      clave: k,
      nombre: r.nombre,
      // El rótulo del tramo ya dice «Cargos»: el cargo va solo; los demás verbos sí dicen algo.
      arista: r.verbo === "Cargo" && r.detalle ? r.detalle : [r.verbo, r.monto != null ? formatPesos(r.monto) : null, r.detalle].filter(Boolean).join(" · "),
      grupo: GRUPOS.find((g) => g.id === r.grupo)!.etiqueta,
      href: enlace.grafo(rutaDeNodo(r.nodo)),
    });
  }
  const grupos = GRUPOS.map((g) => ({ ...g, relaciones: v.relaciones.filter((r) => r.grupo === g.id) })).filter(
    (g) => g.relaciones.length > 0,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Ruta raiz={{ href: enlace.grafo(), label: "El grafo" }} actual={v.titulo} />
      <header>
        <p className="rotulo text-ink-soft">{v.clase}</p>
        <h1 className="mt-1.5 font-display text-3xl leading-tight text-ink sm:text-4xl">{v.titulo}</h1>
        <p className="mt-2 text-sm text-ink-soft">
          {v.relaciones.length === 1 ? "Una arista" : `${formatInt(v.relaciones.length)} aristas`}
          {vecinos.length > 0 && ` con ${vecinos.length === 1 ? "una ficha" : `${formatInt(vecinos.length)} fichas`}`}
          {v.nota && <span className="block text-xs leading-relaxed">{v.nota}</span>}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button asChild variant="secondary">
            <Link href={propia}>Abrir su ficha</Link>
          </Button>
          <p className="text-xs text-ink-soft">
            En RDF:{" "}
            <a href={enlace.rdf(propia, "ttl")} className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-0">
              Turtle
            </a>
            {" · "}
            <a href={enlace.rdf(propia, "jsonld")} className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-0">
              JSON-LD
            </a>
            {" · "}
            <a href={enlace.rdf(propia, "nt")} className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-0">
              N-Triples
            </a>
          </p>
        </div>
      </header>

      {vecinos.length > 0 && (
        <RedVecinos
          centro={v.titulo}
          vecinos={vecinos.slice(0, DIBUJO_MAX)}
          total={vecinos.length}
          etiqueta={`Las fichas que los registros del Estado ligan con ${v.titulo}`}
        />
      )}

      {grupos.length === 0 ? (
        <EstadoVacio titulo="Esta ficha no tiene aristas en el grafo todavía.">
          Su ficha dice lo que se sabe de ella; ninguna de las fuentes cruzadas la liga con otra.
        </EstadoVacio>
      ) : (
        grupos.map((g) => (
          <Card as="section" key={g.id} aria-labelledby={`grupo-${g.id}`}>
            <div className="px-5 pb-2 pt-4 sm:px-6">
              <CardTitle id={`grupo-${g.id}`}>
                {g.etiqueta} <span className="font-mono text-sm font-normal tabular-nums text-ink-soft">{formatInt(g.relaciones.length)}</span>
              </CardTitle>
            </div>
            <ul className="border-t border-hairline">
              {g.relaciones.slice(0, VISIBLES).map((r, i) => (
                <FilaRelacion key={`${g.id}-${i}`} r={r} />
              ))}
            </ul>
            {g.relaciones.length > VISIBLES && (
              <Plegable
                className="border-t border-hairline"
                etiqueta={`Ver las otras ${formatInt(g.relaciones.length - VISIBLES)}`}
                etiquetaCerrar="Ocultarlas"
              >
                <ul>
                  {g.relaciones.slice(VISIBLES).map((r, i) => (
                    <FilaRelacion key={`${g.id}-mas-${i}`} r={r} />
                  ))}
                </ul>
              </Plegable>
            )}
          </Card>
        ))
      )}

      <section aria-labelledby="camino" className="space-y-3">
        <h2 id="camino" className="text-sm font-bold text-ink">
          ¿Cómo se liga con otra ficha?
        </h2>
        <BuscadorUrl
          etiqueta="Buscar la otra ficha del camino"
          placeholder="Otra persona, institución, decreto o provincia"
          ayuda={`Elige la otra ficha y se busca el camino más corto desde ${v.titulo}, de hasta seis saltos.`}
        />
        {candidatos && (
          <ListaCandidatos
            resultado={candidatos}
            sin={v.nodo}
            consulta={consulta}
            hacia={(c) => enlace.caminoGrafo(propia, rutaDeNodo(c.nodo))}
          />
        )}
      </section>

      <Aviso />
    </div>
  );
}

function FilaRelacion({ r }: { r: Relacion }) {
  const nombre = r.nodo ? (
    <Link href={enlace.grafo(rutaDeNodo(r.nodo))} className="estira text-[15px] font-medium leading-snug text-ink hover:text-brand-700">
      {r.nombre}
    </Link>
  ) : r.href && r.externo ? (
    <a
      href={r.href}
      target="_blank"
      rel="noopener noreferrer"
      className="estira inline-flex items-center gap-1 text-[15px] font-medium leading-snug text-ink hover:text-brand-700"
    >
      {r.nombre}
      <IconExternal className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
    </a>
  ) : r.href ? (
    <Link href={r.href} className="estira text-[15px] font-medium leading-snug text-ink hover:text-brand-700">
      {r.nombre}
    </Link>
  ) : (
    <span className="text-[15px] font-medium leading-snug text-ink">{r.nombre}</span>
  );
  return (
    <li className="relative border-b border-hairline last:border-0">
      <div className="flex items-start gap-3 px-5 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-soft">{r.verbo}</p>
          <div className="mt-0.5 break-words">{nombre}</div>
          {(r.detalle || r.fecha || r.monto != null) && (
            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
              {r.monto != null && <span className="font-mono tabular-nums text-ink">{formatPesos(r.monto)}</span>}
              {r.monto != null && r.detalle ? " · " : ""}
              {r.detalle}
              {r.detalle && r.fecha ? " · " : ""}
              <Antiguedad iso={r.fecha} prefijo={r.movimiento ?? undefined} />
            </p>
          )}
        </div>
        {r.nodo && (
          <Link
            href={rutaDeNodo(r.nodo)}
            className="relative z-10 inline-flex min-h-11 shrink-0 items-center text-xs text-brand-700 underline sm:min-h-0"
          >
            Ficha
          </Link>
        )}
      </div>
    </li>
  );
}
