"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { RedVecinos, type VecinoRed } from "@/components/graficos";
import { EsqueletoLineas } from "@/components/esqueleto";
import { claves, inspeccionarNodo } from "@/lib/consultas";
import { formatPesos } from "@/lib/format";
import type { Inspeccion } from "@/lib/explorar-tipos";

/** Cuántos vecinos se dibujan; el inspector, al lado, los trae todos. */
const DIBUJO_MAX = 18;

/**
 * El cupo del dibujo repartido entre los grupos: un ministerio con 140
 * cargos llenaría los 18 puntos con cargos y escondería a quién le contrata y
 * qué publica. Cada grupo recibe su parte (al menos dos), lo que sobra se
 * reparte en orden, y los grupos siguen juntos y en su orden, que es como
 * `RedVecinos` pone un rótulo por tramo.
 */
function repartir(grupos: VecinoRed[][], tope: number): VecinoRed[] {
  if (grupos.length === 0) return [];
  const parte = Math.max(2, Math.floor(tope / grupos.length));
  const tomados = grupos.map((g) => Math.min(g.length, parte));
  let libres = tope - tomados.reduce((s, x) => s + x, 0);
  for (let i = 0; i < grupos.length && libres > 0; i++) {
    const mas = Math.min(grupos[i].length - tomados[i], libres);
    tomados[i] += mas;
    libres -= mas;
  }
  // Con muchos grupos la parte mínima puede pasarse del tope: se recorta por el final.
  return grupos.flatMap((g, i) => g.slice(0, tomados[i])).slice(0, tope);
}

/**
 * La red del nodo abierto, dibujada en el banco de trabajo con la misma
 * primitiva que `/grafo` (`RedVecinos`): el nodo en el centro y sus vecinos
 * con la arista escrita. Cada vecino abre su red aquí mismo, y el que se
 * deja entra al rastro. Lee la misma consulta que el inspector
 * (`claves.nodo`), así que no pide nada de más. El dibujo no sustituye a la
 * lista: el inspector de al lado la trae entera, y es el camino del lector
 * de pantalla.
 */
export function RedDelNodo({
  ruta,
  hacia,
  onCerrar,
}: {
  ruta: string;
  /** La dirección del banco con otro nodo abierto en su red, conservando la búsqueda. */
  hacia: (ruta: string) => string;
  onCerrar: () => void;
}) {
  const consulta = useQuery({
    queryKey: claves.nodo(ruta),
    queryFn: ({ signal }) => inspeccionarNodo<Inspeccion>(ruta, signal),
    staleTime: 60 * 60 * 1000,
  });
  const n = consulta.data;

  // Un vecino por nodo, en el orden de las aristas: la primera arista es la que se escribe.
  const porGrupo: VecinoRed[][] = [];
  const vistos = new Set<string>([ruta]);
  for (const g of n?.grupos ?? []) {
    const del: VecinoRed[] = [];
    for (const a of g.aristas) {
      if (!a.ruta || vistos.has(a.ruta)) continue;
      vistos.add(a.ruta);
      del.push({
        clave: a.ruta,
        nombre: a.nombre,
        // El rótulo del tramo ya dice «Cargos»: el cargo va solo; los demás verbos sí dicen algo.
        arista: a.verbo === "Cargo" && a.detalle ? a.detalle : [a.verbo, a.monto != null ? formatPesos(a.monto) : null, a.detalle].filter(Boolean).join(" · "),
        grupo: g.etiqueta,
        href: hacia(a.ruta),
      });
    }
    if (del.length) porGrupo.push(del);
  }
  const total = porGrupo.reduce((s, g) => s + g.length, 0);
  const vecinos = repartir(porGrupo, DIBUJO_MAX);

  return (
    <Card as="section" aria-labelledby="red-del-nodo" className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle id="red-del-nodo">{n ? `La red de ${n.titulo}` : "La red del nodo"}</CardTitle>
        <Button variant="secondary" size="sm" onClick={onCerrar}>
          Volver a la lista
        </Button>
      </div>
      {consulta.isPending ? (
        <div role="status" aria-busy="true" className="mt-4">
          <span className="sr-only">Leyendo la red…</span>
          <EsqueletoLineas n={6} />
        </div>
      ) : consulta.isError ? (
        <p className="mt-3 text-sm text-ink-soft">No se pudo leer la red de este nodo. El inspector de al lado dice qué pasó.</p>
      ) : total === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">Ninguna de las fuentes cruzadas liga este nodo con otro nodo todavía.</p>
      ) : (
        <RedVecinos
          className="mx-auto mt-3 max-w-4xl"
          centro={n!.titulo}
          vecinos={vecinos}
          total={total}
          etiqueta={`Los nodos que los registros del Estado ligan con ${n!.titulo}; cada uno abre su red aquí`}
        />
      )}
    </Card>
  );
}
