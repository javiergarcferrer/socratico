import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardTitle } from "@/components/ui/card";
import { Cifra, Rotulo, TiraDeCifras } from "@/components/papel";
import { formatFecha } from "@/lib/format";
import { enlace } from "@/lib/grafo";
import { PREFIJOS, expandir } from "@/lib/rdf";
import { CLASES, PROPIEDADES, PUBLICADA, VERSION, esquemas, resumenOntologia } from "@/lib/ontologia";
import { hrefWikidata } from "@/lib/wikidata";

/**
 * La ontología en llano: la página que abre un navegador cuando sigue un
 * término `soc:` (`…/ontologia#Persona`). Cada clase, propiedad y esquema
 * tiene su ancla con el nombre local del término. Sale de `lib/ontologia.ts`,
 * la misma fuente que `/ontologia.ttl` y `/ontologia.jsonld`: no puede
 * desalinearse. Una máquina que pide esta dirección con `Accept: text/turtle`
 * recibe el Turtle (`next.config.ts`).
 */

export const metadata: Metadata = {
  title: "Ontología",
  description:
    "Las clases y relaciones del grafo de Socrático.do en OWL y RDFS: personas con cargo, instituciones, decretos, entidades financieras, empresas y provincias, alineadas con schema.org, W3C ORG, FOAF, ELI y Wikidata.",
  alternates: {
    canonical: "/ontologia",
    types: { "text/turtle": "/ontologia.ttl", "application/ld+json": "/ontologia.jsonld" },
  },
};

/** Los vocabularios con que se alinea, y para qué. */
const ALINEADOS: { prefijo: keyof typeof PREFIJOS; nombre: string; para: string }[] = [
  { prefijo: "schema", nombre: "schema.org", para: "Lo que leen los buscadores: personas, organizaciones, normas, lugares." },
  { prefijo: "org", nombre: "Ontología de Organizaciones (W3C ORG)", para: "Cargos como membresías: quién, dónde, desde cuándo." },
  { prefijo: "foaf", nombre: "FOAF", para: "Personas, agentes y documentos." },
  { prefijo: "eli", nombre: "European Legislation Identifier (ELI)", para: "Normas: número, fecha, quién la firma, su texto." },
  { prefijo: "rov", nombre: "Organizaciones Registradas (W3C ROV)", para: "Personas jurídicas con su número de registro." },
  { prefijo: "skos", nombre: "SKOS", para: "Listas cerradas (materias, movimientos, sectores) y la correspondencia con Wikidata." },
  { prefijo: "dct", nombre: "Dublin Core (DCTerms)", para: "Títulos, fuentes y fechas." },
  { prefijo: "wd", nombre: "Wikidata", para: "El identificador universal de una clase o de una ficha, solo cuando la correspondencia no tiene dudas." },
];

/** Adónde lleva un término: su ancla aquí, o su definición en el vocabulario que lo define. */
function destino(curie: string): string | null {
  if (curie.startsWith("soc:")) return `#${curie.slice(4)}`;
  if (curie.startsWith("xsd:")) return null;
  const completo = expandir(curie);
  return completo === curie ? null : completo;
}

function Termino({ curie }: { curie: string }) {
  const href = destino(curie);
  const texto = <code className="font-mono text-[13px]">{curie}</code>;
  if (!href) return <span className="text-ink">{texto}</span>;
  if (href.startsWith("#")) {
    return (
      <a href={href} className="text-brand-700 underline">
        {texto}
      </a>
    );
  }
  return (
    <a href={href} className="text-brand-700 underline" target="_blank" rel="noopener noreferrer">
      {texto}
    </a>
  );
}

/**
 * Varios términos en una frase. «y» cuando valen todos a la vez (una clase es
 * subclase de cada uno); «o» cuando vale cualquiera (la unión de un dominio o
 * de un rango).
 */
function Lista({ terminos, conjuncion }: { terminos: string[]; conjuncion: "y" | "o" }) {
  return (
    <>
      {terminos.map((x, i) => (
        <span key={x}>
          {i > 0 && (i === terminos.length - 1 ? ` ${conjuncion} ` : ", ")}
          <Termino curie={x} />
        </span>
      ))}
    </>
  );
}

export default function OntologiaPage() {
  const resumen = resumenOntologia();
  const listas = esquemas();
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <Rotulo>Ontología</Rotulo>
        <h1 className="mt-1.5 font-display text-3xl leading-tight text-ink sm:text-4xl">
          ¿Con qué palabras se describe el grafo?
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
          Las clases de cosas que hay en{" "}
          <Link href={enlace.grafo()} className="text-brand-700 underline">
            el grafo
          </Link>{" "}
          y cómo se relacionan, escritas en OWL y RDFS para que una máquina las lea sin preguntar. Cada término se
          alinea con los vocabularios que el mundo ya usa y, donde lo hay, con su elemento de Wikidata.
        </p>
        <p className="mt-3 text-sm text-ink-soft">
          Espacio de nombres <code className="break-all font-mono text-[13px] text-ink">{PREFIJOS.soc}</code>, prefijo{" "}
          <code className="font-mono text-[13px] text-ink">soc:</code> · versión {VERSION} del {formatFecha(PUBLICADA)} ·
          descargar en{" "}
          <a href="/ontologia.ttl" className="text-brand-700 underline">
            Turtle
          </a>
          ,{" "}
          <a href="/ontologia.jsonld" className="text-brand-700 underline">
            JSON-LD
          </a>{" "}
          o{" "}
          <a href="/ontologia.nt" className="text-brand-700 underline">
            N-Triples
          </a>
          .
        </p>
      </header>

      <TiraDeCifras>
        <Cifra etiqueta="Clases" valor={resumen.clases} nota="OWL 2" />
        <Cifra etiqueta="Relaciones y datos" valor={resumen.propiedades} nota="Con dominio y rango" />
        <Cifra etiqueta="Listas cerradas" valor={resumen.esquemas} nota={`${resumen.conceptos} conceptos en SKOS`} />
      </TiraDeCifras>

      <section aria-labelledby="clases" className="space-y-3">
        <h2 id="clases" className="font-display text-xl text-ink">
          ¿Qué clases de cosas hay?
        </h2>
        {CLASES.map((c) => (
          <Card as="article" key={c.id} id={c.id} className="scroll-mt-24 px-5 py-4 sm:px-6">
            <CardTitle as="h3">{c.etiqueta}</CardTitle>
            <p className="mt-0.5 font-mono text-xs text-ink-soft">soc:{c.id}</p>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{c.comentario}</p>
            <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[9rem_1fr]">
              {c.subClaseDe.length > 0 && (
                <div className="contents">
                  <dt className="text-ink-soft">Es una</dt>
                  <dd>
                    <Lista terminos={c.subClaseDe} conjuncion="y" />
                  </dd>
                </div>
              )}
              {c.wikidata?.map((w) => (
                <div key={w.qid} className="contents">
                  <dt className="text-ink-soft">{w.relacion === "closeMatch" ? "En Wikidata" : "En Wikidata, más amplio"}</dt>
                  <dd>
                    <a href={hrefWikidata(w.qid)} className="text-brand-700 underline" target="_blank" rel="noopener noreferrer">
                      {w.nombre}
                    </a>{" "}
                    <span className="font-mono text-xs text-ink-soft">
                      ({w.qid}, skos:{w.relacion})
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </section>

      <section aria-labelledby="propiedades" className="space-y-3">
        <h2 id="propiedades" className="font-display text-xl text-ink">
          ¿Cómo se relacionan?
        </h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Una relación liga dos cosas del grafo (una persona con su cargo); un dato le da un valor a una (la fecha
          de un decreto). Con varios dominios o rangos, vale cualquiera de ellos (la unión, en OWL).
        </p>
        <Card className="overflow-hidden">
          <ul>
            {PROPIEDADES.map((p) => (
              <li key={p.id} id={p.id} className="scroll-mt-24 border-b border-hairline px-5 py-3.5 last:border-0 sm:px-6">
                <p className="text-[15px] font-medium text-ink">
                  {p.etiqueta}{" "}
                  <span className="font-mono text-xs font-normal text-ink-soft">
                    soc:{p.id} · {p.tipo === "objeto" ? "relación" : "dato"}
                    {p.funcional ? " · uno solo" : ""}
                  </span>
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{p.comentario}</p>
                <p className="mt-1 text-sm text-ink-soft">
                  De <Lista terminos={p.dominio} conjuncion="o" /> a <Lista terminos={p.rango} conjuncion="o" />
                  {p.subPropiedadDe?.length ? (
                    <>
                      {" · "}cuenta también como <Lista terminos={p.subPropiedadDe} conjuncion="y" />
                    </>
                  ) : null}
                  {p.inversa ? (
                    <>
                      {" · "}inversa de <Termino curie={`soc:${p.inversa}`} />
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section aria-labelledby="listas" className="space-y-3">
        <h2 id="listas" className="font-display text-xl text-ink">
          ¿Qué listas cerradas usa?
        </h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Salen de las mismas tablas que usa la interfaz, así que el grafo y las páginas nunca dicen cosas distintas.
        </p>
        {listas.map((e) => (
          <Card as="section" key={e.id} id={e.id} aria-labelledby={`lista-${e.id}`} className="scroll-mt-24">
            <div className="px-5 pb-3 pt-4 sm:px-6">
              <CardTitle id={`lista-${e.id}`}>{e.etiqueta}</CardTitle>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{e.comentario}</p>
            </div>
            {/*
              Abiertas y no en un Plegable: cada concepto es el destino de su
              IRI (`…/ontologia#movimiento-designa`), y un Plegable cerrado no
              monta sus anclas.
            */}
            <ul className="grid grid-cols-1 gap-x-6 border-t border-hairline px-5 py-2 sm:grid-cols-2 sm:px-6">
              {e.conceptos.map((c) => (
                <li key={c.id} id={c.id} className="scroll-mt-24 py-1.5 text-sm">
                  <span className="text-ink">{c.etiqueta}</span>{" "}
                  <span className="font-mono text-xs text-ink-soft">soc:{c.id}</span>
                  {c.definicion && <span className="block text-xs leading-relaxed text-ink-soft">{c.definicion}</span>}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </section>

      <section aria-labelledby="alineados" className="space-y-3">
        <h2 id="alineados" className="font-display text-xl text-ink">
          ¿Con qué vocabularios se alinea?
        </h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Siempre hacia fuera y sin afirmar de más: una persona de aquí es una <code className="font-mono text-[13px]">schema:Person</code>,
          no al revés; con Wikidata, cuyos elementos no son clases OWL, la correspondencia es{" "}
          <code className="font-mono text-[13px]">skos:closeMatch</code> o{" "}
          <code className="font-mono text-[13px]">skos:broadMatch</code>, y una ficha solo se ata a un elemento con{" "}
          <code className="font-mono text-[13px]">owl:sameAs</code> si la correspondencia es única en los dos sentidos.
        </p>
        <Card className="overflow-hidden">
          <ul>
            {ALINEADOS.map((v) => (
              <li key={v.prefijo} className="border-b border-hairline px-5 py-3 last:border-0 sm:px-6">
                <p className="text-sm font-medium text-ink">
                  {v.nombre} <span className="font-mono text-xs font-normal text-ink-soft">{v.prefijo}:</span>
                </p>
                <p className="mt-0.5 break-all font-mono text-xs text-ink-soft">{PREFIJOS[v.prefijo]}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{v.para}</p>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
