"use client";

/**
 * El mapa de la ontología en la sección Ontología del banco: el dibujo (desde
 * `lg`, `components/grafo/mapa-ontologia.tsx`), el interruptor de las
 * alineaciones, la leyenda, lo elegido con sus aristas de ejemplo y la tabla
 * equivalente. Va en su propio trozo (`next/dynamic` desde `ontologia.tsx`):
 * la portada no lo carga hasta que se abre la sección.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseAsArrayOf, parseAsStringLiteral, useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EsqueletoLineas } from "@/components/esqueleto";
import { CATEGORICA, Leyenda, OTROS, VerComoTabla } from "@/components/graficos";
import { formatInt } from "@/lib/nomina";
import { formatFecha } from "@/lib/format";
import { claves, consultarSparql, type CeldaSparql } from "@/lib/consultas";
import type { OntologiaVista } from "@/lib/explorar-tipos";
import {
  CLAVES_VOCABULARIO,
  VOCABULARIOS,
  armarMapa,
  dondeEsta,
  instanciasDe,
  vocabularioDe,
  type AristaMapa,
  type Mapa,
  type RelacionMapa,
} from "@/components/grafo/modelo-ontologia";
import { plantillasDeClase } from "@/lib/plantillas";
import { iriDe, rutaDe } from "./ontologia-sparql";

/** El dibujo en WebGL solo en el navegador; por debajo de `lg` no se monta (la tabla lo reemplaza). */
const MapaOntologia = dynamic(() => import("@/components/grafo/mapa-ontologia").then((m) => m.MapaOntologia), {
  ssr: false,
  loading: () => (
    <div role="status" aria-busy="true" className="h-[min(70vh,38rem)]">
      <span className="sr-only">Cargando el mapa…</span>
      <EsqueletoLineas n={6} />
    </div>
  ),
});

/** Los vocabularios de fuera puestos en el mapa, en la URL (`oal=schema,wikidata`). */
const ALINEACIONES = parseAsArrayOf(parseAsStringLiteral(CLAVES_VOCABULARIO), ",");

/* ===================================================================== el mapa */

/**
 * El mapa de la ontología: el dibujo (desde `lg`), el interruptor de las
 * alineaciones de fuera, la leyenda, lo elegido (una arista: qué propiedades
 * la forman y aristas de ejemplo del grafo) y la tabla equivalente, que trae
 * cada clase y cada propiedad con dónde está en el mapa. Todo sale de
 * `armarMapa` (`components/grafo/modelo-ontologia.ts`).
 */
export function MapaDeLaOntologia({ ontologia, clase, hrefClase }: { ontologia: OntologiaVista; clase: string | null; hrefClase: (curie: string) => string }) {
  const router = useRouter();
  const [alineaciones, setAlineaciones] = useQueryState("oal", ALINEACIONES.withOptions({ history: "replace" }));
  const puestas = useMemo(() => new Set(alineaciones ?? []), [alineaciones]);
  const mapa = useMemo(() => armarMapa(ontologia, puestas), [ontologia, puestas]);
  const donde = useMemo(() => dondeEsta(ontologia, mapa), [ontologia, mapa]);
  // Lo elegido: una arista del mapa (`a:` y su clave), un nodo que no es de aquí (`n:`) o una propiedad de la tabla (`p:`).
  const [eleccion, setEleccion] = useState<string | null>(null);
  const deAqui = (curie: string) => ontologia.clases.some((c) => c.curie === curie);
  const alNodo = (curie: string) => {
    if (deAqui(curie)) {
      setEleccion(null);
      router.push(hrefClase(curie), { scroll: false });
    } else setEleccion(`n:${curie}`);
  };
  const seleccion = eleccion?.startsWith("a:") ? eleccion.slice(2) : null;
  const nombre = (curie: string) => mapa.nodos.get(curie)?.etiqueta ?? curie;
  const relaciones = mapa.aristas.filter((a) => a.tipo === "relacion");
  const observadas = relaciones.filter((a) => !a.definida).length;

  return (
    <Card as="section" aria-labelledby="onto-mapa" className="px-4 py-4">
      <p className="rotulo text-ink-soft">
        Ontología {ontologia.version}
        {ontologia.medido && <> · uso medido en el grafo del {formatFecha(ontologia.medido)}</>}
      </p>
      <CardTitle id="onto-mapa" className="mt-0.5">
        ¿Cómo se ligan las clases del grafo?
      </CardTitle>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-soft lg:hidden">
        {formatInt(ontologia.clases.length)} clases y {formatInt(ontologia.propiedades.length)} propiedades. El mapa se dibuja en una pantalla ancha; aquí
        abajo, cada clase y cada relación en tabla.
      </p>
      <p className="mt-1 hidden max-w-prose text-sm leading-relaxed text-ink-soft lg:block">
        {formatInt(ontologia.clases.length)} clases, del tamaño de sus instancias; {formatInt(relaciones.length)} pares de clases ligados por las
        propiedades de la ontología, {formatInt(observadas)} con triples en el grafo (el grosor) y {formatInt(relaciones.length - observadas)} que la
        ontología define y el grafo todavía no llena (punteados).
      </p>

      <div className="mt-3 hidden space-y-2 lg:block">
        <h3 id="onto-alineaciones" className="rotulo text-ink-soft">
          Alineaciones con vocabularios de fuera
        </h3>
        <p className="text-xs text-ink-soft">Pon un vocabulario para ver sus clases junto a las de aquí. La cifra: cuántos de sus términos apunta la ontología.</p>
        <ToggleGroup
          type="multiple"
          value={alineaciones ?? []}
          onValueChange={(v) => void setAlineaciones(v.length ? (v as typeof CLAVES_VOCABULARIO) : null)}
          aria-labelledby="onto-alineaciones"
          className="flex-wrap"
        >
          {VOCABULARIOS.map((v) => {
            const n = new Set(ontologia.clases.flatMap((c) => c.alineaciones.filter((a) => vocabularioDe(a.curie) === v.clave).map((a) => a.curie))).size;
            return (
              <ToggleGroupItem key={v.clave} value={v.clave} className="min-h-11 text-xs sm:min-h-9">
                {v.etiqueta}
                <span className="font-mono">{formatInt(n)}</span>
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </div>

      <div className="mt-3 hidden lg:block">
        <MapaOntologia mapa={mapa} clase={clase} seleccion={seleccion} onNodo={alNodo} onArista={(k) => setEleccion(`a:${k}`)} />
      </div>

      <Leyenda
        className="mt-3 hidden lg:flex"
        entradas={[
          { clave: "clase", etiqueta: "Clase con instancias", clase: CATEGORICA[0].bg, forma: "punto" },
          { clave: "definida", etiqueta: "Clase definida, sin instancias", clase: OTROS.bg, forma: "punto" },
          { clave: "concepto", etiqueta: "Vocabulario controlado", clase: CATEGORICA[2].bg, forma: "punto" },
          ...(puestas.size ? [{ clave: "externa", etiqueta: "Clase de fuera", clase: CATEGORICA[4].bg, forma: "punto" as const }] : []),
          { clave: "caso", etiqueta: "Es un caso de (trazo de tinta)", clase: "bg-ink", forma: "linea" },
          { clave: "relacion", etiqueta: "Relación con triples (el grosor, en escala logarítmica)", clase: "bg-grafico-rejilla", forma: "linea" },
          { clave: "definida-rel", etiqueta: "Relación definida, sin uso", clase: "border-grafico-rejilla", forma: "punteada" },
          ...(puestas.size ? [{ clave: "alineacion", etiqueta: "Alineación con una clase de fuera (1 px)", clase: "bg-grafico-rejilla", forma: "linea" as const }] : []),
        ]}
      />

      {clase && plantillasDeClase(clase).length > 0 && (
        <div className="mt-3 space-y-1">
          <h3 className="rotulo text-ink-soft">Preguntas listas sobre {nombre(clase)}</h3>
          <ul className="space-y-0.5 text-sm">
            {plantillasDeClase(clase).map((p) => (
              <li key={p.id} className="text-ink">
                {p.pregunta}
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-soft">
            Se eligen y se llenan en{" "}
            <Link href="/?seccion=sparql" className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-0">
              las plantillas de investigación de la sección SPARQL
            </Link>
            .
          </p>
        </div>
      )}

      <Eleccion ontologia={ontologia} mapa={mapa} eleccion={eleccion} nombre={nombre} hrefClase={hrefClase} onCerrar={() => setEleccion(null)} />

      <VerComoTabla
        className="mx-0 sm:mx-0"
        nombre="clases"
        columnas={[{ titulo: "Clase" }, { titulo: "Instancias", numerica: true }, { titulo: "Es un caso de" }, { titulo: "Alineada con" }]}
        filas={ontologia.clases.map((c) => ({
          clave: c.curie,
          celdas: [
            <Link key="c" href={hrefClase(c.curie)} scroll={false} className="font-sans text-brand-700 hover:underline">
              {c.etiqueta}
            </Link>,
            instanciasDe(c) != null ? formatInt(instanciasDe(c)!) : "definida",
            c.padre ? nombre(c.padre) : "—",
            c.alineaciones.map((a) => a.curie).join(", ") || "—",
          ],
        }))}
      />
      <VerComoTabla
        className="mx-0 mt-0 sm:mx-0"
        nombre="propiedades"
        columnas={[{ titulo: "Propiedad" }, { titulo: "Entre" }, { titulo: "Triples", numerica: true }, { titulo: "En el mapa" }]}
        filas={ontologia.propiedades.map((p) => ({
          clave: p.curie,
          celdas: [
            <Button
              key="p"
              variant="link"
              size="sm"
              className="h-auto min-h-11 whitespace-normal px-0 text-left font-sans sm:min-h-0"
              onClick={() => setEleccion(`p:${p.curie}`)}
            >
              {p.etiqueta} <span className="font-mono text-xs text-ink-soft">{p.curie}</span>
            </Button>,
            p.uso?.pares.length
              ? p.uso.pares.map((x) => `${nombre(x.dominio)} → ${nombre(x.rango)}`).join("; ")
              : `${p.dominio.map(nombre).join(", ")} → ${p.rango.map(nombre).join(", ")} (declarado)`,
            p.uso ? formatInt(p.uso.triples) : "sin uso",
            donde.get(p.curie) ?? "falta",
          ],
        }))}
      />
    </Card>
  );
}

/** Lo elegido en el mapa o en la tabla: qué es, con su definición, y aristas de ejemplo de cada propiedad. */
function Eleccion({
  ontologia,
  mapa,
  eleccion,
  nombre,
  hrefClase,
  onCerrar,
}: {
  ontologia: OntologiaVista;
  mapa: Mapa;
  eleccion: string | null;
  nombre: (curie: string) => string;
  hrefClase: (curie: string) => string;
  onCerrar: () => void;
}) {
  if (!eleccion) return null;
  const [tipo, clave] = [eleccion.slice(0, 1), eleccion.slice(2)];
  let titulo: ReactNode = null;
  let cuerpo: ReactNode = null;
  if (tipo === "n") {
    const n = mapa.nodos.get(clave);
    if (!n) return null;
    titulo = n.etiqueta;
    cuerpo = <p className="max-w-prose text-sm leading-relaxed text-ink">{n.definicion.replace(/`/g, "")}</p>;
  } else {
    const relaciones: RelacionMapa[] = [];
    let arista: AristaMapa | undefined;
    if (tipo === "a") {
      arista = mapa.aristas.find((a) => a.clave === clave);
      if (!arista) return null;
      relaciones.push(...arista.relaciones);
      titulo = `${nombre(arista.de)} · ${arista.rotulo} · ${nombre(arista.a)}`;
    } else {
      const p = ontologia.propiedades.find((x) => x.curie === clave);
      if (!p) return null;
      titulo = `${p.etiqueta} (${p.curie})`;
      for (const a of mapa.aristas) relaciones.push(...a.relaciones.filter((r) => r.propiedad === p.curie));
      for (const n of mapa.nodos.values()) relaciones.push(...n.bucles.filter((r) => r.propiedad === p.curie));
      if (!relaciones.length) {
        cuerpo = (
          <>
            <p className="max-w-prose text-sm leading-relaxed text-ink">{p.comentario.replace(/`/g, "")}</p>
            <p className="mt-1 text-xs text-ink-soft">{mapa.fuera.find((f) => f.propiedad === p.curie)?.razon}</p>
          </>
        );
      }
    }
    if (arista?.tipo === "caso") {
      const [hijo, padre] = ontologia.clases.find((c) => c.curie === arista!.de)?.padre === arista.a ? [arista.de, arista.a] : [arista.a, arista.de];
      titulo = `${nombre(hijo)} es un caso de ${nombre(padre)}`;
      cuerpo = (
        <p className="max-w-prose text-sm leading-relaxed text-ink">
          Toda instancia de{" "}
          <Link href={hrefClase(hijo)} scroll={false} className="text-brand-700 underline">
            {nombre(hijo)}
          </Link>{" "}
          lo es también de{" "}
          <Link href={hrefClase(padre)} scroll={false} className="text-brand-700 underline">
            {nombre(padre)}
          </Link>{" "}
          (<span className="font-mono text-xs">rdfs:subClassOf</span>): hereda sus relaciones y sus datos.
        </p>
      );
    } else if (!cuerpo) {
      cuerpo = (
        <ul className="space-y-3">
          {relaciones.map((r) => {
            const p = ontologia.propiedades.find((x) => x.curie === r.propiedad);
            return (
              <li key={`${r.propiedad} ${r.dominio} ${r.rango}`} className="space-y-1">
                <p className="text-sm text-ink">
                  <span className="font-semibold">{r.etiqueta}</span> <span className="font-mono text-xs text-ink-soft">{r.propiedad}</span>
                  <span className="text-ink-soft">
                    {" "}
                    · {nombre(r.dominio)} → {nombre(r.rango)} ·{" "}
                    {r.triples != null ? <span className="font-mono">{formatInt(r.triples)} triples</span> : "definida: el grafo todavía no la usa"}
                  </span>
                </p>
                {r.definicion && <p className="max-w-prose text-xs leading-relaxed text-ink-soft">{r.definicion}</p>}
                {p && p.alineaciones.length > 0 && <p className="text-xs text-ink-soft">Es un caso de: <span className="font-mono">{p.alineaciones.join(", ")}</span></p>}
                {r.triples != null && r.propiedad.includes(":") && !r.propiedad.startsWith("rdfs:") && !r.propiedad.startsWith("skos:") && (
                  <EjemplosDeRelacion r={r} />
                )}
              </li>
            );
          })}
        </ul>
      );
    }
  }
  return (
    <Card as="section" aria-labelledby="onto-eleccion" className="mt-3 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id="onto-eleccion" aria-live="polite" className="text-sm font-bold text-ink">
          {titulo}
        </h3>
        <Button variant="link" size="sm" className="h-auto min-h-11 px-0 sm:min-h-0" onClick={onCerrar}>
          Quitar
        </Button>
      </div>
      <div className="mt-1">{cuerpo}</div>
    </Card>
  );
}

/** Cinco aristas de una propiedad entre un par de clases, del volcado de SPARQL (sin personas naturales). */
function EjemplosDeRelacion({ r }: { r: RelacionMapa }) {
  const [pedido, setPedido] = useState(false);
  const [p, d, a] = [iriDe(r.propiedad), iriDe(r.dominio), iriDe(r.rango)];
  const consulta =
    p && d && a
      ? `PREFIX schema: <http://schema.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?s (SAMPLE(COALESCE(?s1, ?s2)) AS ?sn) ?o (SAMPLE(COALESCE(?o1, ?o2, ?o3)) AS ?on) WHERE {
  { SELECT DISTINCT ?s ?o WHERE { ?s ${p} ?o . ?s a ${d} . ?o a ${a} } LIMIT 5 }
  OPTIONAL { ?s schema:name ?s1 } OPTIONAL { ?s rdfs:label ?s2 }
  OPTIONAL { ?o schema:name ?o1 } OPTIONAL { ?o rdfs:label ?o2 } OPTIONAL { ?o skos:prefLabel ?o3 }
} GROUP BY ?s ?o`
      : null;
  const q = useQuery({
    queryKey: claves.sparql(consulta ?? ""),
    queryFn: ({ signal }) => consultarSparql(consulta!, signal),
    enabled: pedido && !!consulta,
    staleTime: Infinity,
  });
  if (!consulta) return null;
  if (!pedido) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setPedido(true)}>
        Aristas de ejemplo
      </Button>
    );
  }
  if (q.isPending) return <p className="text-xs text-ink-soft">Preguntando al grafo…</p>;
  if (q.isError)
    return (
      <p className="text-xs text-ink-soft">
        El servicio SPARQL no respondió; la relación sigue en la tabla de su clase.{" "}
        <Button variant="link" size="sm" className="h-auto px-0 text-xs" onClick={() => void q.refetch()}>
          Preguntar de nuevo
        </Button>
      </p>
    );
  const filas = q.data.tipo === "filas" ? q.data.filas : [];
  if (!filas.length) {
    return (
      <p className="text-xs leading-relaxed text-ink-soft">
        El volcado de SPARQL no trae aristas de este par: lleva el grafo sin personas naturales (docs/INFRAESTRUCTURA.md §7.11), y las personas se
        recorren nodo a nodo en el banco.
      </p>
    );
  }
  const celda = (c: CeldaSparql | undefined, nombre: CeldaSparql | undefined) => {
    const ruta = rutaDe(c);
    const texto = nombre?.value ?? (c?.value ?? "").replace(/^.*[#/]/, "");
    return ruta ? (
      <Link href={`/?${new URLSearchParams({ nodo: ruta })}`} className="text-brand-700 hover:underline">
        {texto}
      </Link>
    ) : (
      <span>{texto}</span>
    );
  };
  return (
    <ul className="space-y-1 text-[13px]">
      {filas.map((f, i) => (
        <li key={i}>
          {celda(f.s, f.sn)} <span className="text-ink-soft">· {r.etiqueta} ·</span> {celda(f.o, f.on)}
        </li>
      ))}
    </ul>
  );
}
