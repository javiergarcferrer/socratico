import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { NodoRdf } from "@/lib/grafo";

/**
 * Los identificadores de Wikidata de los nodos del grafo: la instantánea
 * `public/data/wikidata.json` que escribe `scripts/build-wikidata.py` con
 * consultas a la réplica de Wikidata de QLever (docs/AUDITORIA.md §H.14; el
 * servicio SPARQL de Wikidata veta `/sparql` en su robots).
 *
 * Solo el QID, para `owl:sameAs` y `schema:sameAs`: ni descripciones, ni
 * fotos, ni biografías, ni nada que Wikidata diga de una persona. Un nodo se
 * ata a un QID solo si la correspondencia es única en los dos sentidos (el
 * script dice cómo, por tipo).
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

export interface Wikidata {
  generado: string;
  fuente: string;
  /** QID por id de nodo, por tipo. */
  personas: Record<string, string>;
  instituciones: Record<string, string>;
  financieras: Record<string, string>;
  provincias: Record<string, string>;
}

let memo: Promise<Wikidata | null> | null = null;

export function getWikidata(): Promise<Wikidata | null> {
  memo ??= readFile(join(process.cwd(), "public", "data", "wikidata.json"), "utf8")
    .then((t) => JSON.parse(t) as Wikidata)
    .catch((err) => {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") console.error("[wikidata]", err);
      memo = null;
      return null;
    });
  return memo;
}

/** El QID de un nodo, o `null`. */
export async function wikidataDe(n: NodoRdf): Promise<string | null> {
  const w = await getWikidata();
  if (!w) return null;
  const tabla =
    n.tipo === "funcionario"
      ? w.personas
      : n.tipo === "institucion"
        ? w.instituciones
        : n.tipo === "entidad-financiera"
          ? w.financieras
          : n.tipo === "provincia"
            ? w.provincias
            : null;
  return tabla?.[n.id] ?? null;
}

/** La página de un QID en Wikidata. */
export function hrefWikidata(qid: string): string {
  return `https://www.wikidata.org/wiki/${qid}`;
}
