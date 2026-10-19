import { nodoDeRuta, rutaDeNodo, type TipoNodoRdf } from "@/lib/grafo";
import { CLASE_DE_TIPO, GRUPOS, claveNodo, describir, iriDe, relacionesDesdeTriples } from "@/lib/grafo-rdf";
import { metaGrafo } from "@/lib/grafo-compilado";
import { datosDe } from "@/lib/grafo-hechos";
import type { TipoEntrada } from "@/lib/espacios";
import { ARISTAS_POR_GRUPO, type Inspeccion, type ProcedenciaVista, type Pulso } from "@/lib/explorar-tipos";

/**
 * El inspector del banco de trabajo del grafo (`/explorar`,
 * docs/INFRAESTRUCTURA.md §7.7): un nodo con lo que dice de sí, sus aristas
 * por grupo y de qué grafo con nombre —qué fuente y qué corte, o qué regla—
 * sale cada triple; y el tamaño del compilado para la banda de la página.
 * Lee solo el grafo compilado (`describir`, `metaGrafo`), nunca el índice
 * del buscador: así la función del inspector y la de la página no lo cargan.
 */

/** Qué tipo de entrada guarda cada nodo en una investigación (`lib/espacios.ts`); una provincia no se guarda. */
const GUARDABLE: Record<TipoNodoRdf, TipoEntrada | null> = {
  funcionario: "funcionario",
  institucion: "institucion",
  "entidad-financiera": "entidad-financiera",
  empresa: "empresa",
  decreto: "norma",
  ley: "norma",
  resolucion: "norma",
  provincia: null,
  proveedor: "proveedor",
  proceso: "proceso",
  obra: "obra",
  iniciativa: "proyecto",
  documento: "documento",
  conjunto: "dato",
};

/**
 * Un nodo para el inspector: lo que dice de sí, sus aristas por grupo (hasta
 * `ARISTAS_POR_GRUPO` de cada uno, con la cuenta entera) y de qué grafo con
 * nombre sale cada triple. `null` si la ruta no es un nodo o no existe.
 */
export async function inspeccionar(ruta: string): Promise<Inspeccion | null> {
  const nodo = nodoDeRuta(ruta);
  if (!nodo) return null;
  const [d, meta] = await Promise.all([describir(nodo), metaGrafo()]);
  if (!d) return null;
  const sujeto = iriDe(nodo);
  const relaciones = relacionesDesdeTriples(d.triples, sujeto);
  const propia = claveNodo(nodo);
  const otros = new Set(relaciones.flatMap((r) => (r.nodo && claveNodo(r.nodo) !== propia ? [claveNodo(r.nodo)] : [])));

  const grupos = GRUPOS.map((g) => {
    const del = relaciones.filter((r) => r.grupo === g.id);
    return {
      id: g.id,
      etiqueta: g.etiqueta,
      total: del.length,
      aristas: del.slice(0, ARISTAS_POR_GRUPO).map((r) => ({
        verbo: r.verbo,
        nombre: r.nombre,
        detalle: r.detalle,
        movimiento: r.movimiento,
        fecha: r.fecha,
        monto: r.monto,
        ruta: r.nodo ? rutaDeNodo(r.nodo) : null,
        href: r.href,
        externo: r.externo,
      })),
    };
  }).filter((g) => g.total > 0);

  // La procedencia: cuántos triples del nodo salen de cada grafo con nombre.
  const porGrafo = new Map<string, number>();
  for (const g of d.grafos ?? []) porGrafo.set(g, (porGrafo.get(g) ?? 0) + 1);
  const procedencia: ProcedenciaVista[] = (meta?.grafos ?? [])
    .filter((g) => porGrafo.has(g.clave) && g.clave !== "plataforma")
    .map((g) => ({ etiqueta: g.etiqueta, corte: g.corte, derivado: !!g.derivado, triples: porGrafo.get(g.clave)! }))
    .sort((a, b) => Number(a.derivado) - Number(b.derivado) || b.triples - a.triples);

  return {
    ruta: rutaDeNodo(nodo),
    tipo: nodo.tipo,
    clase: CLASE_DE_TIPO[nodo.tipo],
    titulo: d.titulo,
    nota: d.nota ?? null,
    hechos: datosDe(d.triples, sujeto),
    grupos,
    aristas: relaciones.length,
    vecinos: otros.size,
    triples: d.triples.length,
    procedencia,
    guardable: GUARDABLE[nodo.tipo],
  };
}

/** El tamaño del grafo compilado: lo que la barra del banco dice que se está recorriendo. */
export async function pulsoDelGrafo(): Promise<Pulso | null> {
  const m = await metaGrafo();
  if (!m) return null;
  const nodos = Object.values(m.tipos).reduce((s, t) => s + t.nodos, 0) + m.empresasSolas;
  return { triples: m.triples, nodos, clases: Object.keys(m.tipos).length, grafos: m.grafos.length, compilado: m.generado };
}
