"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EstadoVacio } from "@/components/estado-vacio";
import { EsqueletoFilas } from "@/components/esqueleto";
import { IconArrowRight } from "@/components/icons";
import { claves, preguntarAlGrafo } from "@/lib/consultas";
import { enlace, nodoDeRuta } from "@/lib/grafo";
import { formatInt } from "@/lib/nomina";
import { formatPesos } from "@/lib/format";
import { SITIO } from "@/lib/sitio";
import type { Recuperacion } from "@/lib/mcp";
import type { PasoRastro } from "./inspector";
import { clicSimple } from "./clic";

/** Cuántos datos y relaciones de cada entidad se ven; «Inspeccionar» abre el nodo entero. */
const HECHOS = 6;
const RELACIONES = 8;

/** Una dirección de la plataforma como ruta propia; la de fuera, tal cual. */
const propia = (url: string) => (url.startsWith(SITIO + "/") ? url.slice(SITIO.length) : url);

/** Los nombres de las herramientas del servidor MCP: lo que un asistente pide, no lo que lee una persona. */
const HERRAMIENTA = /\b(search|fetch|retrieve|procurement|contracting_history|query|path|signed_decrees|ontology)\b/;

/**
 * El «por qué salió» de `retrieve` está escrito para un asistente, con el
 * nombre de sus herramientas y sus argumentos; aquí se lee en llano.
 */
function porLlano(por: string): string {
  return por
    .replace(/contracting_history(?: con [a-z]+ «[^»]*»)*(?: e [a-z]+ «[^»]*»)?/g, "lo contratado desde 2015")
    .replace(/\bprocurement\b/g, "la consulta de compras")
    .replace(/^path entre .*/, "el camino más corto entre las dos")
    .replace(/signed_decrees con person «[^»]*»/g, "los decretos que firmó")
    .replace(/ \(Model2Vec[^)]*\)/g, "")
    .replace(/ ?\(fetch con group «[^»]+»\)/g, "")
    .replace(/\s+\./g, ".");
}

/**
 * Las notas de `retrieve`, en llano: se dejan fuera las frases que le dicen a
 * un asistente qué herramienta llamar o cómo está hecho el índice. Lo que
 * avisan a la persona (qué no se pudo atar, qué no cubre la instantánea) se queda.
 */
function notaLlana(nota: string): string {
  return nota
    .split(/(?<=\.)\s+/)
    .filter((frase) => !HERRAMIENTA.test(frase) && !/BM25|Model2Vec|cita su url/.test(frase))
    .join(" ");
}

/** Una línea de relación de `retrieve` («Cargo: Ministro (…) → /instituciones/4»), con su destino aparte. */
function partirRelacion(linea: string): { texto: string; ruta: string | null } {
  const m = /^(.*) → (\/\S+)$/.exec(linea);
  return m ? { texto: m[1], ruta: m[2] } : { texto: linea.replace(/ → https?:\/\/\S+ \(fuera de Socrático\)$/, ""), ruta: null };
}

/** El nombre del otro extremo de una línea de relación: lo que sigue al último «: », sin su paréntesis. */
const nombreDe = (texto: string) => texto.replace(/ \(.*$/, "").split(": ").pop() ?? texto;

/**
 * El modo «Preguntar» del banco de trabajo: una pregunta en llano y la
 * evidencia del grafo con que se contesta (GraphRAG sin modelo, la misma
 * recuperación que la herramienta `retrieve` del servidor MCP). Las entidades
 * que la pregunta nombra van primero, cada una con lo que dice de sí y sus
 * aristas —que se abren en el inspector—; luego la consulta de compras que la
 * pregunta pide, corrida de verdad con los filtros que se dicen, y la
 * evidencia del índice. La plataforma no redacta la respuesta: la evidencia,
 * con su fuente y su fecha, la contesta, y el lector concluye.
 */
export function Preguntar({ pregunta, onAbrir }: { pregunta: string; onAbrir: (p: PasoRastro) => void }) {
  const consulta = useQuery({
    queryKey: claves.preguntar(pregunta),
    queryFn: ({ signal }) => preguntarAlGrafo<Recuperacion>(pregunta, signal),
    staleTime: 60 * 60 * 1000,
  });

  if (consulta.isPending) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Juntando la evidencia del grafo…</span>
        <EsqueletoFilas n={6} />
      </div>
    );
  }
  if (consulta.isError) {
    return (
      <EstadoVacio
        variante="caida"
        titulo="No se pudo juntar la evidencia."
        accion={
          <Button variant="secondary" onClick={() => void consulta.refetch()}>
            Intentar de nuevo
          </Button>
        }
      >
        {consulta.error.message} El modo «Buscar» sigue en pie: busca las palabras de la pregunta.
      </EstadoVacio>
    );
  }

  const r = consulta.data;
  const nada = r.entidades.length === 0 && r.evidencias.length === 0 && r.pantallas.length === 0;
  if (nada) {
    return (
      <EstadoVacio titulo="El grafo no tiene evidencia para esa pregunta.">
        Prueba nombrando a quién: unas siglas en mayúsculas (MINERD), el nombre de una institución o de una persona, un
        RNC, «Ley 87-01».
      </EstadoVacio>
    );
  }

  return (
    <div className="space-y-4">
      <p className="sr-only" aria-live="polite">
        {`Evidencia: ${r.entidades.length} entidades del grafo y ${r.evidencias.length} piezas.`}
      </p>
      {r.entidades.length > 0 && (
        <section aria-labelledby="preguntar-entidades" className="space-y-3">
          <h2 id="preguntar-entidades" className="font-sans text-sm font-bold text-ink">
            Lo que la pregunta nombra, en el grafo
          </h2>
          {r.entidades.map((e) => (
            <Card as="article" key={e.id} aria-label={e.titulo}>
              <div className="px-4 pb-2 pt-3">
                <p className="rotulo text-ink-soft">{e.clase}</p>
                <CardTitle className="mt-1">{e.titulo}</CardTitle>
                <p className="mt-0.5 text-xs text-ink-soft">Se ató porque {e.por}.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => onAbrir({ ruta: e.id, titulo: e.titulo })}>
                    Inspeccionar
                  </Button>
                  <Button asChild size="sm" variant="secondary">
                    <Link href={e.id}>Abrir su ficha</Link>
                  </Button>
                </div>
              </div>
              {e.hechos.length > 0 && (
                <dl className="grid gap-x-4 gap-y-1 border-t border-hairline px-4 py-3 text-sm sm:grid-cols-2">
                  {e.hechos.slice(0, HECHOS).map((h) => {
                    const [dato, ...valor] = h.split(": ");
                    return (
                      <div key={h} className="min-w-0">
                        <dt className="text-xs text-ink-soft">{dato}</dt>
                        <dd className="break-words text-ink">{valor.join(": ")}</dd>
                      </div>
                    );
                  })}
                </dl>
              )}
              {e.relaciones.length > 0 && (
                <ul className="border-t border-hairline px-4 py-2 text-sm">
                  {e.relaciones.slice(0, RELACIONES).map((linea) => {
                    const { texto, ruta } = partirRelacion(porLlano(linea));
                    return (
                      <li key={linea} className="py-1 leading-snug text-ink">
                        {ruta && nodoDeRuta(ruta) ? (
                          <Link
                            href={enlace.explorar({ nodo: ruta })}
                            className="text-brand-700 hover:underline"
                            onClick={(ev) => {
                              if (!clicSimple(ev)) return;
                              ev.preventDefault();
                              onAbrir({ ruta, titulo: nombreDe(texto) });
                            }}
                          >
                            {texto}
                          </Link>
                        ) : ruta ? (
                          <Link href={ruta} className="text-brand-700 hover:underline">
                            {texto}
                          </Link>
                        ) : (
                          texto
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {(e.hechos.length > HECHOS || e.relaciones.length > RELACIONES) && (
                <p className="border-t border-hairline px-4 py-2 text-xs text-ink-soft">
                  Aquí van {Math.min(e.hechos.length, HECHOS)} de sus {e.hechos.length} datos y {Math.min(e.relaciones.length, RELACIONES)} de
                  las {e.relaciones.length} relaciones que trajo la evidencia; «Inspeccionar» las abre todas.
                </p>
              )}
              {e.compras.length > 0 && (
                <ul className="border-t border-hairline px-4 py-2 text-xs leading-relaxed text-ink-soft">
                  {e.compras.map((c) => (
                    <li key={c} className="py-0.5">
                      {c}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </section>
      )}

      {r.compras && (
        <Card as="section" aria-labelledby="preguntar-compras" className="px-4 py-3">
          <h2 id="preguntar-compras" className="font-sans text-sm font-bold text-ink">
            La consulta de compras que pide
          </h2>
          <p className="mt-1 text-xs text-ink-soft">Filtros leídos de la pregunta: {r.compras.deducidos}.</p>
          <p className="mt-2 text-sm text-ink">
            <span className="font-mono tabular-nums">{formatInt(r.compras.total)}</span> procesos cumplen; su valor estimado suma{" "}
            <span className="font-mono tabular-nums">{formatPesos(r.compras.suma)}</span> (estimado al publicar, no adjudicado ni
            pagado).
          </p>
          {r.compras.notas.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs leading-relaxed text-ink-soft">
              {r.compras.notas.map(notaLlana).filter(Boolean).map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {r.evidencias.length > 0 && (
        <Card as="section" aria-labelledby="preguntar-evidencia">
          <div className="px-4 pb-2 pt-3">
            <h2 id="preguntar-evidencia" className="font-sans text-sm font-bold text-ink">
              La evidencia
            </h2>
            <p className="mt-0.5 text-xs text-ink-soft">Cada pieza con su fuente y su fecha: lo que se cita.</p>
          </div>
          <ul className="border-t border-hairline">
            {r.evidencias.map((x, i) => {
              const url = propia(x.url);
              const fuera = !url.startsWith("/");
              return (
                <li key={`${x.url}-${i}`} className="relative border-b border-hairline px-4 py-3 last:border-0">
                  <p className="rotulo text-ink-soft">{x.clase}</p>
                  {fuera ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="estira mt-0.5 block text-[15px] font-medium leading-snug text-ink hover:text-brand-700">
                      {x.titulo}
                    </a>
                  ) : (
                    <Link href={url} className="estira mt-0.5 block text-[15px] font-medium leading-snug text-ink hover:text-brand-700">
                      {x.titulo}
                    </Link>
                  )}
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{x.texto}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">Salió por {porLlano(x.por).replace(/\.$/, "")}.</p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {r.pantallas.length > 0 && (
        <section aria-labelledby="preguntar-pantallas">
          <h2 id="preguntar-pantallas" className="font-sans text-sm font-bold text-ink">
            Las pantallas que la responden
          </h2>
          <ul className="mt-2 space-y-1">
            {r.pantallas.map((p) => (
              <li key={p.url}>
                <Link href={propia(p.url)} className="inline-flex min-h-11 items-center gap-1 text-sm text-brand-700 hover:underline sm:min-h-0">
                  {p.titulo}
                  <IconArrowRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
                <span className="block text-xs text-ink-soft">{p.texto}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(r.notas.length > 0 || r.aviso) && (
        <footer className="space-y-1 border-t border-hairline pt-3 text-xs leading-relaxed text-ink-soft">
          {r.notas.map(notaLlana).filter(Boolean).map((n) => (
            <p key={n}>{n}</p>
          ))}
          <p>{r.aviso}</p>
        </footer>
      )}
    </div>
  );
}
