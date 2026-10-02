import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Catálogo de datos abiertos del Estado — los conjuntos públicos de
 * datos.gob.do, con su organización, formatos y grupo temático.
 *
 * Mecánica verificada en docs/INFRAESTRUCTURA.md §5.10: su `/api/` la veta el propio
 * robots, pero la búsqueda HTML `/dataset/?q=*:*&sort=name+asc&page=N` es
 * server-rendered y recorre el catálogo entero. `scripts/build-catalogo.py` la
 * lee con los diez segundos de espera que pide el robots (~55 peticiones) y
 * deja `public/data/catalogo.json`. El rótulo del portal («1199 resultados»)
 * no cambia con la búsqueda y no se usa: el total es el que se contó.
 *
 * Cada fila enlaza a la ficha del conjunto en datos.gob.do, que es donde están
 * los archivos: la plataforma no los copia.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

export interface Conjunto {
  slug: string;
  titulo: string;
  org: string;
  formatos: string[];
  grupos: string[];
}

export interface Catalogo {
  generado: string;
  fuente: string;
  total: number;
  organizaciones: number;
  conjuntos: Conjunto[];
}

let memo: Promise<Catalogo | null> | null = null;

export function getCatalogo(): Promise<Catalogo | null> {
  memo ??= readFile(join(process.cwd(), "public", "data", "catalogo.json"), "utf8")
    .then((t) => JSON.parse(t) as Catalogo)
    .catch((err) => {
      console.error("[catalogo]", err);
      memo = null;
      return null;
    });
  return memo;
}

export function hrefConjunto(slug: string): string {
  return `https://datos.gob.do/dataset/${encodeURIComponent(slug)}`;
}
