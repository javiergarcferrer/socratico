import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import type { NodoRdf, TipoNodoRdf } from "@/lib/grafo";
import { SITIO } from "@/lib/sitio";
import type { ComprasPublicadas } from "@/lib/tablas-compras";
import { PREFIJOS, fecha, iri, lit, t, type Termino, type Triple } from "@/lib/rdf";
import { agujas, contieneTodas } from "@/lib/raiz";
import { MATERIAS, type Materia } from "@/lib/materias-decreto";
import type { AvisoDecreto } from "@/lib/decretos-base";
import {
  FORMATO_GRAFO,
  archivoFragmento,
  claveCompilada,
  decodificarTermino,
  fragmentoDe,
  iriDe,
  grafosDe,
  triplesDe,
  type ClaveGrafo,
  type Descripcion,
  type FragmentoNodos,
  type FragmentoVecinos,
} from "@/lib/grafo-nodo";

/**
 * El grafo compilado (docs/INFRAESTRUCTURA.md §7): la descripción de cada nodo,
 * leída de `datos/grafo/` en vez de armada en cada petición.
 * `scripts/build-grafo.mjs` corre los constructores
 * (`lib/grafo-constructores.ts`) sobre todas las instantáneas, escribe cada
 * nodo en el fragmento que le toca por su clave y, antes de dar el compilado
 * por bueno, lo relee por este módulo y lo compara nodo a nodo con lo que
 * dicen los constructores. El gate lo vuelve a comparar en cada entrega.
 *
 * Leer un nodo es abrir un fragmento (~30 KB en brotli) y decodificar sus
 * términos: una institución en frío en milisegundos, sin abrir las
 * instantáneas de personas, decretos, empresas ni contrataciones.
 *
 * Fuera de `public/`, a propósito: el compilado trae a cada persona con sus
 * cargos y no se sirve como archivo; se lee por consulta, nodo a nodo, como
 * siempre (§6 del plan). Módulo de servidor.
 */

/** Una clase del grafo con cuántos nodos tiene hoy y de qué fuente salen. */
export interface ClaseContada {
  clase: string;
  etiqueta: string;
  n: number;
  fuente: string;
  /** La fecha de la instantánea (ISO), si la tiene. */
  corte: string | null;
}

/** Un grafo con nombre del compilado: de qué fuente y de qué corte, o de qué regla, y su IRI. */
export interface GrafoConNombre {
  clave: ClaveGrafo;
  iri: string;
  etiqueta: string;
  descripcion: string;
  fuentes: string[];
  corte: string | null;
  derivado?: { de: ClaveGrafo[] };
}

/** Lo que dice `datos/grafo/meta.json` del compilado. */
export interface MetaGrafo {
  formato: number;
  /** El día en que se compiló (ISO). */
  generado: string;
  /** La fecha a la que se calcula el estado PEP: el corte de las personas, no el reloj. */
  aFecha: string | null;
  /** Los grafos con nombre, en el orden en que los cita cada cuádruplo. */
  grafos: GrafoConNombre[];
  /** Por tipo: nodos con registro propio, triples y la primera clave de cada fragmento. */
  tipos: Record<TipoNodoRdf, { nodos: number; triples: number; limites: string[] }>;
  /** Empresas del padrón que no tienen registro: las describe su fila (`describirEmpresaSola`). */
  empresasSolas: number;
  triples: number;
  /** Las firmas del registro de decretos, en el orden de sus archivos en `firmados/`. */
  firmantes: string[];
  /** sha256 de los fragmentos: cambia con cualquier cambio del grafo (la clave de caché de los caminos). */
  huella: string;
  inventario: ClaseContada[];
  wikidata: { total: number; generado: string | null; porTipo: Record<string, number> };
}

let metaMemo: Promise<MetaGrafo | null> | null = null;

/** El índice del compilado, o `null` si no está (o es de otro formato). */
export function metaGrafo(): Promise<MetaGrafo | null> {
  metaMemo ??= readFile(join(process.cwd(), "datos", "grafo", "meta.json"), "utf8")
    .then((t) => {
      const m = JSON.parse(t) as MetaGrafo;
      if (m.formato !== FORMATO_GRAFO) throw new Error(`formato ${m.formato}, se esperaba ${FORMATO_GRAFO}`);
      return m;
    })
    .catch((err) => {
      console.error("[grafo-compilado] meta.json:", err);
      metaMemo = null; // un fallo no se queda pegado en la instancia
      return null;
    });
  return metaMemo;
}

const clavesMemo = new WeakMap<MetaGrafo, ClaveGrafo[]>();
const claves = (m: MetaGrafo) => {
  let c = clavesMemo.get(m);
  if (!c) clavesMemo.set(m, (c = m.grafos.map((g) => g.clave)));
  return c;
};

interface Fragmento {
  terminos: Termino[];
  nodos: FragmentoNodos["nodos"];
}

/** Fragmentos ya leídos, por instancia; se descarta el más viejo pasado el tope. */
const fragmentos = new Map<string, Promise<Fragmento | null>>();
const MAX_FRAGMENTOS = 128;

function leerFragmento(tipo: TipoNodoRdf, i: number): Promise<Fragmento | null> {
  const k = `${tipo}/${i}`;
  const hecho = fragmentos.get(k);
  if (hecho) {
    fragmentos.delete(k); // el más reciente, al final
    fragmentos.set(k, hecho);
    return hecho;
  }
  const p = readFile(join(process.cwd(), "datos", "grafo", "nodos", tipo, archivoFragmento(i)))
    .then((b) => {
      const f = JSON.parse(brotliDecompressSync(b).toString("utf8")) as FragmentoNodos;
      return { terminos: f.terminos.map(decodificarTermino), nodos: f.nodos };
    })
    .catch((err) => {
      console.error(`[grafo-compilado] ${k}:`, err);
      fragmentos.delete(k);
      return null;
    });
  fragmentos.set(k, p);
  if (fragmentos.size > MAX_FRAGMENTOS) fragmentos.delete(fragmentos.keys().next().value as string);
  return p;
}

/**
 * La descripción compilada de un nodo. `undefined` si el compilado no tiene
 * registro de ese nodo: para todos los tipos quiere decir que no existe,
 * salvo para una empresa, que puede ser de las que describe su fila del
 * padrón. Lanza si el compilado no está: sin él no hay grafo que leer.
 */
export async function leerDescripcion(n: NodoRdf): Promise<Descripcion | undefined> {
  const meta = await metaGrafo();
  if (!meta) throw new Error("el grafo compilado no está (datos/grafo/): node scripts/build-grafo.mjs");
  const clave = claveCompilada(n);
  const i = clave == null ? -1 : fragmentoDe(clave, meta.tipos[n.tipo]?.limites ?? []);
  if (clave == null || i < 0) return undefined;
  const f = await leerFragmento(n.tipo, i);
  if (!f) throw new Error(`no se pudo leer el fragmento de ${n.tipo}:${clave}`);
  const r = f.nodos[clave];
  if (!r) return undefined;
  const [titulo, nota, indices] = r;
  const d: Descripcion = { triples: triplesDe(indices, f.terminos), grafos: grafosDe(indices, claves(meta)), titulo };
  if (nota != null) d.nota = nota;
  return d;
}

/**
 * Las claves de todos los nodos de un tipo que el compilado describe,
 * fragmento a fragmento: lo recorren el buscador (`scripts/busqueda-grafo.mjs`)
 * y su comprobación contra el grafo. Lanza si un fragmento no se lee.
 */
export async function clavesCompiladas(tipo: TipoNodoRdf): Promise<string[]> {
  const meta = await metaGrafo();
  if (!meta) throw new Error("el grafo compilado no está (datos/grafo/): node scripts/build-grafo.mjs");
  const salida: string[] = [];
  for (let i = 0; i < (meta.tipos[tipo]?.limites.length ?? 0); i++) {
    const f = await leerFragmento(tipo, i);
    if (!f) throw new Error(`no se pudo leer el fragmento ${i} de ${tipo}`);
    salida.push(...Object.keys(f.nodos));
  }
  return salida;
}

/**
 * Lo que se dice de unos grafos con nombre, en PROV-O: qué son, de qué
 * fuente o de qué grafos se derivan y de qué corte. Va en el grafo por
 * omisión de un TriG o unos N-Quads.
 */
export function triplesDeGrafos(grafos: GrafoConNombre[], todos: GrafoConNombre[]): Triple[] {
  const porClave = new Map(todos.map((g) => [g.clave, g]));
  const x: Triple[] = [];
  for (const g of grafos) {
    x.push(t(g.iri, "rdf:type", iri("prov:Entity")), t(g.iri, "rdfs:label", lit(g.etiqueta, "es")), t(g.iri, "dct:description", lit(g.descripcion, "es")));
    if (g.corte) x.push(t(g.iri, "dct:date", fecha(g.corte)));
    for (const u of g.fuentes) x.push(t(g.iri, "prov:wasDerivedFrom", iri(u)));
    if (g.derivado) {
      // Lo afirma una regla de Socrático, no la fuente: lo dice.
      x.push(t(g.iri, "prov:wasAttributedTo", iri(`${SITIO}/`)));
      for (const k of g.derivado.de) {
        const de = porClave.get(k);
        if (de) x.push(t(g.iri, "prov:wasDerivedFrom", iri(de.iri)));
      }
    }
  }
  return x;
}

/* ------------------------------------------------------------ los vecinos */

/** Una arista del índice de vecinos: adónde lleva, por qué y cómo se llama el otro extremo. */
export interface Vecino {
  nodo: NodoRdf;
  via: string;
  nombre: string;
}

const fragmentosVecinos = new Map<string, Promise<{ f: FragmentoVecinos; donde: Map<string, number> } | null>>();

function leerVecinosDe(tipo: TipoNodoRdf, i: number) {
  const k = `${tipo}/${i}`;
  const hecho = fragmentosVecinos.get(k);
  if (hecho) {
    fragmentosVecinos.delete(k);
    fragmentosVecinos.set(k, hecho);
    return hecho;
  }
  const p = readFile(join(process.cwd(), "datos", "grafo", "vecinos", tipo, archivoFragmento(i)))
    .then((b) => {
      const f = JSON.parse(brotliDecompressSync(b).toString("utf8")) as FragmentoVecinos;
      return { f, donde: new Map(f.claves.map((c, j) => [c, j])) };
    })
    .catch((err) => {
      console.error(`[grafo-compilado] vecinos ${k}:`, err);
      fragmentosVecinos.delete(k);
      return null;
    });
  fragmentosVecinos.set(k, p);
  if (fragmentosVecinos.size > MAX_FRAGMENTOS) fragmentosVecinos.delete(fragmentosVecinos.keys().next().value as string);
  return p;
}

/**
 * El nombre de un nodo y sus aristas hacia otros nodos, del índice de
 * vecinos: lo mismo que `relacionesDesdeTriples` saca de su descripción,
 * sin decodificarla. `undefined` si el índice no lo trae (una empresa que
 * describe su fila del padrón: no se liga a nada).
 */
export async function leerVecinos(n: NodoRdf): Promise<{ titulo: string; vecinos: Vecino[] } | undefined> {
  const meta = await metaGrafo();
  if (!meta) throw new Error("el grafo compilado no está (datos/grafo/): node scripts/build-grafo.mjs");
  const clave = claveCompilada(n);
  const i = clave == null ? -1 : fragmentoDe(clave, meta.tipos[n.tipo]?.limites ?? []);
  if (clave == null || i < 0) return undefined;
  const r = await leerVecinosDe(n.tipo, i);
  if (!r) throw new Error(`no se pudo leer el índice de vecinos de ${n.tipo}:${clave}`);
  const j = r.donde.get(clave);
  if (j === undefined) return undefined;
  const { cadenas, aristas, inicio } = r.f;
  const vecinos: Vecino[] = [];
  for (let a = inicio[j] * 3; a < inicio[j + 1] * 3; a += 3) {
    const destino = cadenas[aristas[a]];
    const dos = destino.indexOf(":");
    vecinos.push({ nodo: { tipo: destino.slice(0, dos) as TipoNodoRdf, id: destino.slice(dos + 1) }, via: cadenas[aristas[a + 1]], nombre: cadenas[aristas[a + 2]] });
  }
  return { titulo: cadenas[r.f.titulos[j]], vecinos };
}

/* ----------------------------------------------------- lo publicado */

let comprasMemo: Promise<ComprasPublicadas | null> | null = null;

/**
 * Lo que cada institución publicó en la tabla de procesos de la DGCP en su
 * ventana de doce meses (`publicadoPorInstitucion`), compilado con el grafo:
 * así `fetch` no lee la tabla entera (11 MB) para decir dos cifras.
 */
export function comprasPublicadas(): Promise<ComprasPublicadas | null> {
  comprasMemo ??= readFile(join(process.cwd(), "datos", "grafo", "compras.json"), "utf8")
    .then((t) => JSON.parse(t) as ComprasPublicadas)
    .catch((err) => {
      console.error("[grafo-compilado] compras.json:", err);
      comprasMemo = null;
      return null;
    });
  return comprasMemo;
}

/* ---------------------------------------------------- nombres y firmas */

/**
 * El índice de nombres (`datos/grafo/nombres.json.br`): lo que hace falta para
 * buscar una persona o una entidad financiera por su nombre sin abrir
 * `funcionarios.json` ni `banca.json` —su texto buscable ya plano, su peso en
 * el orden, su cargo principal y su firma—, en el orden de su instantánea.
 */
interface Nombres {
  /** `[id, nombre, texto plano, puntaje, cargo principal, firma]` */
  personas: [string, string, string, number, string | null, [string, string, number, string, string] | null][];
  /** `[slug, nombre, tipo, rnc, texto plano]` */
  financieras: [string, string, string | null, string | null, string][];
}

/** Una persona del índice de nombres. */
export interface PersonaCompilada {
  id: string;
  nombre: string;
  /** El título de su cargo principal (`cargoPrincipal`). */
  cargo: string | null;
  firma: { como: string; clave: string; decretos: number; desde: string; hasta: string } | null;
}

/** Una entidad financiera del índice de nombres. */
export interface FinancieraCompilada {
  slug: string;
  nombre: string;
  tipo: string | null;
  rnc: string | null;
}

let nombresMemo: Promise<(Nombres & { porId: Map<string, Nombres["personas"][number]> }) | null> | null = null;

function nombres() {
  nombresMemo ??= readFile(join(process.cwd(), "datos", "grafo", "nombres.json.br"))
    .then((b) => {
      const n = JSON.parse(brotliDecompressSync(b).toString("utf8")) as Nombres;
      return { ...n, porId: new Map(n.personas.map((p) => [p[0], p])) };
    })
    .catch((err) => {
      console.error("[grafo-compilado] nombres.json.br:", err);
      nombresMemo = null;
      return null;
    });
  return nombresMemo;
}

const persona = ([id, nombre, , , cargo, f]: Nombres["personas"][number]): PersonaCompilada => ({
  id,
  nombre,
  cargo,
  firma: f ? { como: f[0], clave: f[1], decretos: f[2], desde: f[3], hasta: f[4] } : null,
});

const COLADOR = new Intl.Collator("es");

/**
 * Las personas que se llaman así: todas las palabras, en cualquier orden,
 * sobre el nombre y sus grafías; primero quien pesa más, luego por nombre.
 * Lo mismo que `filtrarPersonas(f, { q })` de `lib/funcionarios.ts` (el
 * compilador lo coteja). `null` si el índice no está.
 */
export async function buscarPersonas(q: string): Promise<PersonaCompilada[] | null> {
  const n = await nombres();
  if (!n) return null;
  const a = q.trim() ? agujas(q) : null;
  return n.personas
    .filter((p) => !a || contieneTodas(p[2], a))
    .sort((x, y) => y[3] - x[3] || COLADOR.compare(x[1], y[1]))
    .map(persona);
}

/** La persona con ese id, del índice de nombres. */
export async function personaCompilada(id: string): Promise<PersonaCompilada | null> {
  const p = (await nombres())?.porId.get(id);
  return p ? persona(p) : null;
}

/**
 * Las entidades financieras que se llaman así (o con ese RNC), en el orden
 * de su instantánea: lo mismo que `filtrarEntidades(d, { q })` de
 * `lib/financieras.ts` (el compilador lo coteja). `null` si el índice no está.
 */
export async function buscarFinancieras(q: string): Promise<FinancieraCompilada[] | null> {
  const n = await nombres();
  if (!n) return null;
  const texto = q.trim();
  const cifras = texto.replace(/\D/g, "");
  const esRnc = texto !== "" && !/\p{L}/u.test(texto) && (cifras.length === 9 || cifras.length === 11);
  const aguja = texto && !esRnc ? agujas(texto) : null;
  return n.financieras
    .filter(([, , , rnc, p]) => (esRnc ? rnc === cifras : aguja ? contieneTodas(p, aguja) : true))
    .map(([slug, nombre, tipo, rnc]) => ({ slug, nombre, tipo, rnc }));
}

/** Un decreto que firmó una persona, como lo da el registro de la Consultoría (`decretosDeFirmante`). */
export interface DecretoFirmado {
  numero: string | null;
  fecha: string | null;
  titulo: string;
  materia: Materia;
  institucion: string | null;
  aviso: AvisoDecreto | null;
  anio: number | null;
  ficha: boolean;
  docId: number | null;
}

/** `[numero, fecha, titulo, materia, institucion, aviso, anio, ficha, docId]` */
type FilaFirmada = [string | null, string | null, string, string, string | null, AvisoDecreto | null, number | null, 0 | 1, number | null];

const materias = new Map(MATERIAS.map((m) => [m.slug, m]));

/**
 * Todos los decretos que el registro atribuye a una firma (`clave`), en el
 * orden de `decretosDeFirmante`: la arista `soc:firmo` entera, que la
 * descripción de la persona corta en los veinte más recientes. Compilados
 * por firmante (`datos/grafo/firmados/`), así quien los lista no abre el
 * registro (~13 MB). `null` si esa firma no está.
 */
export async function decretosFirmados(clave: string): Promise<DecretoFirmado[] | null> {
  const meta = await metaGrafo();
  const i = meta?.firmantes.indexOf(clave) ?? -1;
  if (i < 0) return null;
  const b = await readFile(join(process.cwd(), "datos", "grafo", "firmados", archivoFragmento(i)));
  const filas = JSON.parse(brotliDecompressSync(b).toString("utf8")) as FilaFirmada[];
  return filas.map(([numero, fecha, titulo, materia, institucion, aviso, anio, ficha, docId]) => ({
    numero,
    fecha,
    titulo,
    materia: materias.get(materia)!,
    institucion,
    aviso,
    anio,
    ficha: ficha === 1,
    docId,
  }));
}

/** Lo que dice de sí un decreto con ficha, de su descripción compilada: su número, su título, su fecha y su aviso. */
export async function decretoCompilado(numero: string): Promise<{ numero: string; titulo: string; fecha: string | null; aviso: AvisoDecreto | null } | null> {
  const n: NodoRdf = { tipo: "decreto", id: numero.trim() };
  const d = await leerDescripcion(n);
  if (!d) return null;
  const s = iriDe(n);
  const valor = (p: string) => d.triples.find((x) => x.s.valor === s && x.p === p)?.o.valor ?? null;
  return {
    numero: n.id,
    titulo: valor(`${PREFIJOS.dct}title`) ?? "",
    fecha: valor(`${PREFIJOS.soc}fecha`),
    aviso: valor(`${PREFIJOS.do}aviso`) as AvisoDecreto | null,
  };
}
