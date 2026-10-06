import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { SITIO } from "@/lib/sitio";
import type { NodoRdf, TipoNodoRdf } from "@/lib/grafo";
import { PREFIJOS, expandir, type Triple } from "@/lib/rdf";
import { hrefWikidata } from "@/lib/wikidata";
import { FORMATO_GRAFO, archivoFragmento, claveCompilada, describirEmpresaSola, fragmentoDe, iriDe } from "@/lib/grafo-nodo";
import type { Empresa } from "@/lib/empresas";

/**
 * El schema.org de cada ficha que es un nodo del grafo: el JSON-LD que se
 * incrusta en la página para los buscadores (`components/en-el-grafo.tsx`).
 * Sale de la descripción **ligera** del nodo —él y sus datos propios, sin
 * cargos, designaciones ni medidas alrededor— y se compila con el resto del
 * grafo (`scripts/build-grafo.mjs`) en `datos/grafo/ld/`, aparte de las
 * descripciones enteras: una ficha lee solo esto, y su función no arrastra
 * ni el compilado entero ni las instantáneas de las que sale.
 *
 * Módulo de servidor.
 */

const SCHEMA = PREFIJOS.schema;
const local = (v: string) => v.slice(v.lastIndexOf("/") + 1);
const V = {
  tipo: expandir("rdf:type"),
  etiqueta: expandir("rdfs:label"),
  nombre: expandir("schema:name"),
  mismo: expandir("owl:sameAs"),
  pagina: expandir("foaf:page"),
} as const;

/** Los tipos de archivo de una biblioteca institucional; lo que no trae extensión (el PDF de la Consultoría) es PDF. */
const MIME: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};
const tipoMime = (url: string) => MIME[/\.([a-z0-9]{2,5})$/i.exec(url)?.[1]?.toLowerCase() ?? ""] ?? "application/pdf";

/**
 * La descripción de un nodo en schema.org, para incrustarla en su ficha. Sale
 * de los triples, filtrados al sujeto: sus tipos y propiedades de schema.org,
 * su `owl:sameAs` como `sameAs` y su página como `url`; cada vecino, con su
 * nombre y su tipo si la descripción los trae.
 */
export function aSchemaOrg(triples: Triple[], sujeto: string): Record<string, unknown> {
  const nombres = new Map<string, string>();
  const tipos = new Map<string, string[]>();
  for (const x of triples) {
    if (x.s.tipo !== "iri") continue;
    if ((x.p === V.nombre || x.p === V.etiqueta) && x.o.tipo === "literal" && !nombres.has(x.s.valor)) nombres.set(x.s.valor, x.o.valor);
    if (x.p === V.tipo && x.o.tipo === "iri" && x.o.valor.startsWith(SCHEMA)) {
      tipos.set(x.s.valor, [...(tipos.get(x.s.valor) ?? []), local(x.o.valor)]);
    }
  }
  const url = (v: string) => (v.startsWith(PREFIJOS.wd) ? hrefWikidata(v.slice(PREFIJOS.wd.length)) : v.split("#")[0]);
  const ref = (v: string) => {
    const r: Record<string, unknown> = {};
    const tipo = tipos.get(v)?.[0];
    if (tipo) r["@type"] = tipo;
    r["@id"] = v;
    const n = nombres.get(v);
    if (n) r.name = n;
    if (v.startsWith(SITIO) || v.startsWith(PREFIJOS.wd)) r.url = url(v);
    return r;
  };
  const obj: Record<string, unknown> = { "@context": "https://schema.org" };
  const t0 = tipos.get(sujeto) ?? [];
  if (t0.length) obj["@type"] = t0.length === 1 ? t0[0] : t0;
  obj["@id"] = sujeto;
  const sumar = (k: string, v: unknown) => {
    const antes = obj[k];
    obj[k] = antes === undefined ? v : Array.isArray(antes) ? [...antes, v] : [antes, v];
  };
  for (const x of triples) {
    if (x.s.tipo !== "iri" || x.s.valor !== sujeto) continue;
    if (x.p.startsWith(SCHEMA)) {
      const k = local(x.p);
      if (x.o.tipo === "literal") sumar(k, x.o.valor);
      else if (x.o.tipo === "iri") sumar(k, x.p === SCHEMA + "encoding" ? { "@type": "MediaObject", contentUrl: x.o.valor, encodingFormat: tipoMime(x.o.valor) } : ref(x.o.valor));
    } else if (x.p === V.mismo && x.o.tipo === "iri") {
      sumar("sameAs", url(x.o.valor));
    } else if (x.p === V.pagina && x.o.tipo === "iri") {
      obj.url = x.o.valor;
    }
  }
  if (!obj.name && nombres.has(sujeto)) obj.name = nombres.get(sujeto);
  return obj;
}

/** Un fragmento del schema.org compilado: por clave, el objeto de su ficha. */
export type FragmentoLd = Record<string, Record<string, unknown>>;

/** `datos/grafo/ld/meta.json`: por tipo, la primera clave de cada fragmento. */
export interface MetaLd {
  formato: number;
  limites: Record<TipoNodoRdf, string[]>;
}

let metaMemo: Promise<MetaLd | null> | null = null;

function metaLd() {
  metaMemo ??= readFile(join(process.cwd(), "datos", "grafo", "ld", "meta.json"), "utf8")
    .then((t) => {
      const m = JSON.parse(t) as MetaLd;
      if (m.formato !== FORMATO_GRAFO) throw new Error(`formato ${m.formato}, se esperaba ${FORMATO_GRAFO}`);
      return m;
    })
    .catch((err) => {
      console.error("[grafo-ld] meta.json:", err);
      metaMemo = null;
      return null;
    });
  return metaMemo;
}

const fragmentos = new Map<string, Promise<FragmentoLd | null>>();
const MAX_FRAGMENTOS = 64;

function leerFragmento(tipo: TipoNodoRdf, i: number): Promise<FragmentoLd | null> {
  const k = `${tipo}/${i}`;
  const hecho = fragmentos.get(k);
  if (hecho) {
    fragmentos.delete(k);
    fragmentos.set(k, hecho);
    return hecho;
  }
  const p = readFile(join(process.cwd(), "datos", "grafo", "ld", tipo, archivoFragmento(i)))
    .then((b) => JSON.parse(brotliDecompressSync(b).toString("utf8")) as FragmentoLd)
    .catch((err) => {
      console.error(`[grafo-ld] ${k}:`, err);
      fragmentos.delete(k);
      return null;
    });
  fragmentos.set(k, p);
  if (fragmentos.size > MAX_FRAGMENTOS) fragmentos.delete(fragmentos.keys().next().value as string);
  return p;
}

/**
 * El JSON-LD de schema.org de una ficha, o `null` si no es un nodo o el
 * compilado no se puede leer (la ficha se pinta igual, sin él). Una empresa
 * que el compilado no trae es de las que describe su fila del padrón: su
 * ficha, que ya la leyó, la pasa en `empresa`.
 */
export async function schemaOrgDe(n: NodoRdf, empresa?: Empresa | null): Promise<Record<string, unknown> | null> {
  const meta = await metaLd();
  const clave = claveCompilada(n);
  if (!meta || clave == null) return null;
  const i = fragmentoDe(clave, meta.limites[n.tipo] ?? []);
  const f = i < 0 ? {} : await leerFragmento(n.tipo, i);
  if (!f) return null;
  const ld = f[clave];
  if (ld) return structuredClone(ld);
  if (n.tipo === "empresa" && empresa && empresa.rnc === clave) return aSchemaOrg(describirEmpresaSola(empresa).triples, iriDe(n));
  return null;
}
