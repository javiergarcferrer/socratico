"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Rotulo } from "@/components/papel";
import { EstadoVacio } from "@/components/estado-vacio";
import { EsqueletoLineas } from "@/components/esqueleto";
import Antiguedad from "@/components/antiguedad";
import Plegable from "@/components/plegable";
import { Termino } from "@/components/termino";
import Guardar from "@/components/espacios/guardar";
import { IconChevronRight, IconExternal, IconX } from "@/components/icons";
import { claves, inspeccionarNodo } from "@/lib/consultas";
import { enlace } from "@/lib/grafo";
import { formatFecha, formatPesos } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import type { TipoEntrada } from "@/lib/espacios";
import type { AristaVista, GrupoVisto, Inspeccion } from "@/lib/explorar-tipos";
import { clicSimple } from "./clic";

/** Cuántas aristas de un grupo se ven antes de plegar el resto. */
const VISIBLES = 6;
/** Cuántos datos del nodo se ven antes de plegar el resto. */
const HECHOS_VISIBLES = 10;

function Hechos({ hechos }: { hechos: Inspeccion["hechos"] }) {
  return (
    <dl className="mt-2 space-y-1.5 text-sm">
      {hechos.map((h) => (
        <div key={`${h.dato}|${h.valor}`} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
          <dt className="text-xs leading-5 text-ink-soft">{h.dato}</dt>
          <dd className="break-words text-ink">{h.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface PasoRastro {
  ruta: string;
  titulo: string;
}

/**
 * El inspector del banco de trabajo: un nodo del grafo abierto al lado de la
 * lista, con lo que dice de sí, sus aristas por grupo y de qué fuente y corte
 * sale cada triple. Cada vecino que es un nodo se abre **aquí mismo**
 * (`onAbrir`): se recorre el grafo de arista en arista sin perder la lista, y
 * el rastro de arriba dice por dónde se vino. La ficha, la red dibujada y el
 * RDF quedan a un toque.
 */
export function Inspector({
  ruta,
  rastro,
  enfocar,
  onCargado,
  onAbrir,
  onVolverA,
  onCerrar,
}: {
  ruta: string;
  /** Los nodos por los que se llegó a este, del primero al anterior. */
  rastro: PasoRastro[];
  /** El lector pivotó hasta aquí: el foco pasa al nombre del nodo en cuanto se lee. */
  enfocar: boolean;
  /** El nombre del nodo, en cuanto se lee: con él entra al rastro. */
  onCargado: (ruta: string, titulo: string) => void;
  onAbrir: (paso: PasoRastro) => void;
  onVolverA: (indice: number) => void;
  onCerrar: () => void;
}) {
  const consulta = useQuery({
    queryKey: claves.nodo(ruta),
    queryFn: ({ signal }) => inspeccionarNodo<Inspeccion>(ruta, signal),
    staleTime: 60 * 60 * 1000,
  });
  const titulo = useRef<HTMLHeadingElement>(null);
  const leido = consulta.data;
  useEffect(() => {
    if (!leido) return;
    onCargado(ruta, leido.titulo);
    if (enfocar) titulo.current?.focus();
    // Una vez por nodo leído: `onCargado` cambia en cada render del banco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leido, ruta]);

  return (
    <Card as="section" aria-label="Inspector del nodo" className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2">
        <Rotulo>Inspector</Rotulo>
        <Button variant="ghost" size="sm" onClick={onCerrar} aria-label="Cerrar el inspector">
          <IconX className="h-4 w-4" />
          Cerrar
        </Button>
      </div>

      {rastro.length > 0 && (
        <nav aria-label="Por dónde llegaste a este nodo" className="border-b border-hairline px-4 py-2">
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-ink-soft">
            {rastro.map((p, i) => (
              <li key={`${p.ruta}-${i}`} className="flex items-center gap-1">
                <Button variant="link" size="sm" className="h-auto min-h-11 px-0 text-xs sm:min-h-0" onClick={() => onVolverA(i)}>
                  {recortar(p.titulo, 28)}
                </Button>
                <IconChevronRight aria-hidden className="h-3 w-3" />
              </li>
            ))}
            <li aria-current="location" className="font-medium text-ink">
              {consulta.data ? recortar(consulta.data.titulo, 28) : "…"}
            </li>
          </ol>
        </nav>
      )}

      {consulta.isPending ? (
        <div role="status" aria-busy="true" className="px-4 py-4">
          <span className="sr-only">Leyendo el nodo…</span>
          <EsqueletoLineas n={8} />
        </div>
      ) : consulta.isError ? (
        <EstadoVacio
          variante="caida"
          titulo="No se pudo leer este nodo."
          className="m-4"
          accion={
            <Button variant="secondary" onClick={() => void consulta.refetch()}>
              Intentar de nuevo
            </Button>
          }
        >
          {consulta.error.message} La lista de la izquierda sigue en pie; su ficha también se abre desde ahí.
        </EstadoVacio>
      ) : (
        <Cuerpo n={consulta.data} rastro={rastro} onAbrir={onAbrir} titulo={titulo} />
      )}
    </Card>
  );
}

function Cuerpo({
  n,
  rastro,
  onAbrir,
  titulo,
}: {
  n: Inspeccion;
  rastro: PasoRastro[];
  onAbrir: (p: PasoRastro) => void;
  titulo: React.RefObject<HTMLHeadingElement | null>;
}) {
  const origen = rastro[0];
  return (
    <div className="divide-y divide-hairline">
      <header className="px-4 py-4">
        <p className="rotulo text-ink-soft">{n.clase}</p>
        <h2 ref={titulo} tabIndex={-1} className="mt-1 font-sans text-lg font-bold leading-snug text-ink focus:outline-none">
          {n.titulo}
        </h2>
        <p className="mt-1 text-xs text-ink-soft">
          <Termino clave="arista">{n.aristas === 1 ? "Una arista" : `${formatInt(n.aristas)} aristas`}</Termino>
          {n.vecinos > 0 && ` con ${n.vecinos === 1 ? "un nodo" : `${formatInt(n.vecinos)} nodos`}`} ·{" "}
          <Termino clave="triple">{`${formatInt(n.triples)} triples`}</Termino>
        </p>
        {n.nota && <p className="mt-1 text-xs leading-relaxed text-ink-soft">{n.nota}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <Link href={n.ruta}>Abrir su ficha</Link>
          </Button>
          {n.guardable && (
            <Guardar referencia={{ tipo: n.guardable as TipoEntrada, ref: n.ruta, titulo: n.titulo.slice(0, 300), href: n.ruta }} />
          )}
          <Button asChild variant="secondary" size="sm">
            {/* `nofollow`: la vista de un nodo repite la ficha y robots.txt no la deja rastrear. */}
            <Link href={enlace.grafo(n.ruta)} rel="nofollow">
              Ver su red
            </Link>
          </Button>
          {origen && origen.ruta !== n.ruta && (
            <Button asChild variant="secondary" size="sm">
              <Link href={enlace.caminoGrafo(origen.ruta, n.ruta)} rel="nofollow">
                Camino desde {recortar(origen.titulo, 24)}
              </Link>
            </Button>
          )}
        </div>
      </header>

      {n.hechos.length > 0 && (
        <section aria-labelledby="inspector-datos" className="px-4 py-3">
          <h3 id="inspector-datos" className="text-sm font-bold text-ink">
            Lo que dice de sí
          </h3>
          <Hechos hechos={n.hechos.slice(0, HECHOS_VISIBLES)} />
          {n.hechos.length > HECHOS_VISIBLES && (
            <Plegable etiqueta={`Ver los otros ${formatInt(n.hechos.length - HECHOS_VISIBLES)} datos`} etiquetaCerrar="Ocultarlos">
              <Hechos hechos={n.hechos.slice(HECHOS_VISIBLES)} />
            </Plegable>
          )}
        </section>
      )}

      {n.grupos.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ink-soft">Ninguna de las fuentes cruzadas liga este nodo con otro todavía.</p>
      ) : (
        n.grupos.map((g) => <Grupo key={g.id} g={g} ruta={n.ruta} onAbrir={onAbrir} />)
      )}

      {n.procedencia.length > 0 && (
        <section aria-labelledby="inspector-procedencia" className="px-4 py-3">
          <h3 id="inspector-procedencia" className="text-sm font-bold text-ink">
            De dónde sale
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
            Cada triple de este nodo viene de una instantánea de una fuente, con su corte, o de una regla de Socrático que lo
            deduce de otras.
          </p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {n.procedencia.map((p) => (
              <li key={p.etiqueta} className="flex items-start justify-between gap-3">
                <span className="text-ink">
                  {p.etiqueta}
                  {p.derivado && (
                    <Badge forma="sello" variant="contorno" className="ml-1.5 align-middle">
                      regla
                    </Badge>
                  )}
                </span>
                <span className="shrink-0 text-right font-mono tabular-nums text-ink-soft">
                  {p.corte ? formatFecha(p.corte) : "sin corte"} · {formatInt(p.triples)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-soft">
            En RDF:{" "}
            <a href={enlace.rdf(n.ruta, "ttl")} className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-0">
              Turtle
            </a>
            {" · "}
            <a href={enlace.rdf(n.ruta, "jsonld")} className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-0">
              JSON-LD
            </a>
            {" · "}
            <a href={enlace.rdf(n.ruta, "trig")} className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-0">
              TriG, con la fuente de cada triple
            </a>
          </p>
        </section>
      )}
    </div>
  );
}

function Grupo({ g, ruta, onAbrir }: { g: GrupoVisto; ruta: string; onAbrir: (p: PasoRastro) => void }) {
  const resto = g.total - g.aristas.length;
  return (
    <section aria-labelledby={`inspector-${g.id}`} className="py-2">
      <h3 id={`inspector-${g.id}`} className="flex items-baseline justify-between gap-2 px-4 pt-1 text-sm font-bold text-ink">
        {g.etiqueta}
        <span className="font-mono text-xs font-normal tabular-nums text-ink-soft">{formatInt(g.total)}</span>
      </h3>
      <ul className="mt-1">
        {g.aristas.slice(0, VISIBLES).map((a, i) => (
          <FilaArista key={`${g.id}-${i}`} a={a} onAbrir={onAbrir} />
        ))}
      </ul>
      {g.aristas.length > VISIBLES && (
        <Plegable etiqueta={`Ver las otras ${formatInt(g.aristas.length - VISIBLES)}`} etiquetaCerrar="Ocultarlas" className="px-4">
          <ul>
            {g.aristas.slice(VISIBLES).map((a, i) => (
              <FilaArista key={`${g.id}-mas-${i}`} a={a} onAbrir={onAbrir} />
            ))}
          </ul>
        </Plegable>
      )}
      {resto > 0 && (
        <p className="px-4 pt-1 text-xs text-ink-soft">
          Y {formatInt(resto)} más:{" "}
          <Link href={enlace.grafo(ruta)} rel="nofollow" className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-0">
            todas en su red
          </Link>
        </p>
      )}
    </section>
  );
}

function FilaArista({ a, onAbrir }: { a: AristaVista; onAbrir: (p: PasoRastro) => void }) {
  const clase = "estira text-sm font-medium leading-snug text-ink hover:text-brand-700";
  const nombre = a.ruta ? (
    <Link
      href={enlace.explorar({ nodo: a.ruta })}
      className={clase}
      onClick={(e) => {
        if (!clicSimple(e)) return;
        e.preventDefault();
        onAbrir({ ruta: a.ruta!, titulo: a.nombre });
      }}
    >
      {a.nombre}
    </Link>
  ) : a.href && a.externo ? (
    <a href={a.href} target="_blank" rel="noopener noreferrer" className={`${clase} inline-flex items-center gap-1`}>
      {a.nombre}
      <IconExternal className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
    </a>
  ) : a.href ? (
    <Link href={a.href} className={clase}>
      {a.nombre}
    </Link>
  ) : (
    <span className="text-sm font-medium leading-snug text-ink">{a.nombre}</span>
  );
  return (
    <li className="relative px-4 py-2">
      <p className="text-xs text-ink-soft">{a.verbo}</p>
      <div className="break-words">{nombre}</div>
      {(a.detalle || a.fecha || a.movimiento || a.monto != null) && (
        <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
          {a.monto != null && <span className="font-mono tabular-nums text-ink">{formatPesos(a.monto)}</span>}
          {a.monto != null && a.detalle ? " · " : ""}
          {a.detalle}
          {a.detalle && a.fecha ? " · " : ""}
          {a.fecha ? <Antiguedad iso={a.fecha} prefijo={a.movimiento ?? undefined} /> : a.movimiento}
        </p>
      )}
    </li>
  );
}

function recortar(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}
