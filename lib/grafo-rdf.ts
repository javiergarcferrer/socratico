import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { unstable_cache } from "next/cache";
import { SITIO } from "@/lib/sitio";
import { nodoDeRuta, numeroCanonico, rutaDeNodo, type NodoRdf, type TipoNodoRdf } from "@/lib/grafo";
import { PREFIJOS, expandir, type Cuadruple, type Termino, type Triple } from "@/lib/rdf";
import { ETIQUETA_MOVIMIENTO } from "@/lib/cargos";
import type { Movimiento } from "@/lib/funcionarios";
import { buscarInstituciones } from "@/lib/instituciones";
import { empresaPorRnc } from "@/lib/empresas";
import { PROVINCIAS } from "@/lib/provincias";
import { hrefWikidata } from "@/lib/wikidata";
import { agujas, contieneTodas, plano } from "@/lib/raiz";
import { desdeMayusculas } from "@/lib/congreso";
import { describirEmpresaSola, iriDe, nombreDecreto, type Descripcion } from "@/lib/grafo-nodo";
import {
  buscarFinancieras,
  buscarPersonas,
  decretoCompilado,
  leerDescripcion,
  leerVecinos,
  metaGrafo,
  triplesDeGrafos,
  type ClaseContada,
  type Vecino,
} from "@/lib/grafo-compilado";

/**
 * El grafo semántico de la plataforma, nodo a nodo (docs/INFRAESTRUCTURA.md
 * §7): la descripción RDF de cada ficha y lo que se lee de
 * ella —sus aristas, el camino entre dos fichas, la búsqueda de nodos—.
 *
 * La descripción **no se arma aquí**: se lee del grafo compilado
 * (`lib/grafo-compilado.ts`, `datos/grafo/`), que `scripts/build-grafo.mjs`
 * produce corriendo los constructores (`lib/grafo-constructores.ts`) sobre
 * las instantáneas y comprobándolo nodo a nodo. Abrir una ficha del grafo es
 * leer un fragmento, no releer las instantáneas de personas, decretos,
 * empresas y contrataciones. Sigue sin haber un almacén de triples ni un
 * servidor: archivos que se leen, como el índice del buscador.
 *
 * Módulo de servidor.
 */

export { iriDe };
export type { ClaseContada, Descripcion };

/** Un texto largo cortado en una palabra, con puntos suspensivos. */
function recortar(texto: string, n: number): string {
  if (texto.length <= n) return texto;
  const corte = texto.slice(0, n);
  return `${corte.slice(0, Math.max(corte.lastIndexOf(" "), n - 20)).trimEnd()}…`;
}

/**
 * La descripción RDF de un nodo, del grafo compilado. Una empresa que el
 * compilado no trae es de las que no se ligan a nada: la describe su fila del
 * padrón, con la misma plantilla que usó el compilador.
 */
export async function describir(n: NodoRdf): Promise<Descripcion | null> {
  const d = await leerDescripcion(n);
  if (d) return d;
  if (n.tipo !== "empresa") return null;
  const e = await empresaPorRnc(n.id);
  return e ? describirEmpresaSola(e) : null;
}

/**
 * Los triples de una descripción con el grafo con nombre de cada uno (TriG,
 * N-Quads), y en el grafo por omisión lo que se dice de esos grafos: su
 * fuente, su corte o su regla.
 */
export async function cuadruplesDe(d: Descripcion): Promise<Cuadruple[]> {
  const meta = await metaGrafo();
  if (!meta || !d.grafos) return d.triples;
  const porClave = new Map(meta.grafos.map((g) => [g.clave, g]));
  const cuadruples: Cuadruple[] = d.triples.map((x, i) => ({ ...x, g: porClave.get(d.grafos![i])?.iri }));
  const usados = [...new Set(d.grafos)].map((k) => porClave.get(k)!).filter(Boolean);
  return [...triplesDeGrafos(usados, meta.grafos), ...cuadruples];
}

/** Describe la ficha de una ruta de la plataforma, si es un nodo del grafo. */
export async function describirRuta(ruta: string): Promise<Descripcion | null> {
  const n = nodoDeRuta(ruta);
  return n ? describir(n) : null;
}

/* ------------------------------------------------------------ el conjunto */

/** Cuántos nodos de cada clase tiene el grafo: para VoID y para `/grafo`. Se cuentan al compilar. */
export async function inventario(): Promise<ClaseContada[]> {
  return (await metaGrafo())?.inventario ?? [];
}

/** El volcado del grafo sin personas naturales (`scripts/build-grafo-volcado.mjs`): dónde se descarga, cuánto pesa y de cuándo es. */
export interface Volcado {
  url: string;
  /** El mismo grafo en TriG: cada triple en el grafo de su fuente y su corte. */
  urlTrig: string;
  triples: number;
  bytes: number;
  generado: string;
  excluye: string;
}

let volcadoMemo: Promise<Volcado | null> | null = null;

export function volcadoDelGrafo(): Promise<Volcado | null> {
  volcadoMemo ??= readFile(join(process.cwd(), "public", "data", "grafo", "meta.json"), "utf8")
    .then((t) => {
      const m = JSON.parse(t) as { triples: number; bytes: number; generado: string; excluye: string };
      return {
        url: `${SITIO}/data/grafo/grafo.nt.gz`,
        urlTrig: `${SITIO}/data/grafo/grafo.trig.gz`,
        triples: m.triples,
        bytes: m.bytes,
        generado: m.generado,
        excluye: m.excluye,
      };
    })
    .catch(() => {
      volcadoMemo = null;
      return null;
    });
  return volcadoMemo;
}

/** Cuántos nodos están atados a Wikidata, por tipo (las personas, solo las que se enlazan: PEP o firmantes). Se cuentan al compilar. */
export async function enlacesWikidata(): Promise<{ total: number; generado: string | null; porTipo: Record<string, number> }> {
  return (await metaGrafo())?.wikidata ?? { total: 0, generado: null, porTipo: {} };
}

/* ------------------------------------------------------------- relaciones */

/** El nodo que nombra un IRI de la plataforma (`…/funcionarios/x#id`), o `null` si es de fuera o no es un nodo. */
export function nodoDeIri(valor: string): NodoRdf | null {
  if (!valor.startsWith(SITIO + "/")) return null;
  return nodoDeRuta(valor.slice(SITIO.length));
}

/** La clase de cada tipo de nodo, en llano (la etiqueta de `lib/ontologia.ts`). */
export const CLASE_DE_TIPO: Record<TipoNodoRdf, string> = {
  funcionario: "Persona con cargo público",
  institucion: "Institución del Estado",
  "entidad-financiera": "Entidad financiera supervisada",
  empresa: "Persona jurídica",
  decreto: "Decreto",
  provincia: "Provincia",
};

/** Los grupos de aristas, en el orden en que se leen. */
export type GrupoRelacion = "cargos" | "compras" | "decretos" | "entidades" | "lugares" | "registros";

export const GRUPOS: readonly { id: GrupoRelacion; etiqueta: string }[] = [
  { id: "cargos", etiqueta: "Cargos" },
  { id: "compras", etiqueta: "Mayores contrataciones desde 2015" },
  { id: "decretos", etiqueta: "Decretos" },
  { id: "entidades", etiqueta: "La misma entidad y quien la supervisa" },
  { id: "lugares", etiqueta: "Provincias" },
  { id: "registros", etiqueta: "Documentos y registros" },
];

/** Una arista vista desde un nodo. */
export interface Relacion {
  grupo: GrupoRelacion;
  /** Cómo se lee desde este nodo: «Cargo en», «Lo firma». */
  verbo: string;
  /** La misma arista sin dirección, para un camino: «Cargo: Ministro de Hacienda». */
  neutro: string;
  /** El otro extremo, si es un nodo del grafo (se puede explorar). */
  nodo: NodoRdf | null;
  /** Su ficha en la plataforma o su dirección fuera (un PDF, Wikidata); `null` si no tiene. */
  href: string | null;
  /** `href` sale de la plataforma. */
  externo: boolean;
  nombre: string;
  /** Lo que precisa la arista: el cargo. */
  detalle: string | null;
  /** El movimiento del cargo, en llano: «Designación». */
  movimiento: string | null;
  fecha: string | null;
  /** Una contratación: el valor contratado en pesos (no pagado). */
  monto: number | null;
}

const V = {
  tipo: expandir("rdf:type"),
  etiqueta: expandir("rdfs:label"),
  titulo: expandir("dct:title"),
  nombre: expandir("schema:name"),
  cargo: expandir("soc:Cargo"),
  ocupa: expandir("soc:ocupa"),
  titular: expandir("soc:titular"),
  enInstitucion: expandir("soc:enInstitucion"),
  enProvincia: expandir("soc:enProvincia"),
  segunDecreto: expandir("soc:segunDecreto"),
  movimiento: expandir("soc:movimiento"),
  fecha: expandir("soc:fecha"),
  firmadoPor: expandir("soc:firmadoPor"),
  firmo: expandir("soc:firmo"),
  designa: expandir("soc:designa"),
  dirige: expandir("soc:dirige"),
  supervisadaPor: expandir("soc:supervisadaPor"),
  declaracion: expandir("soc:declaracion"),
  publicadaPor: expandir("soc:publicadaPor"),
  inscritaComo: expandir("soc:inscritaComo"),
  contratante: expandir("soc:contratante"),
  contratista: expandir("soc:contratista"),
  montoContratado: expandir("soc:montoContratado"),
  numeroDeContratos: expandir("soc:numeroDeContratos"),
  decretosFirmados: expandir("soc:decretosFirmados"),
  mismo: expandir("owl:sameAs"),
  verTambien: expandir("rdfs:seeAlso"),
  fuente: expandir("dct:source"),
  codificacion: expandir("schema:encoding"),
  subida: expandir("schema:uploadDate"),
} as const;

/**
 * Las aristas de un nodo, leídas de su descripción RDF: el explorador pinta
 * exactamente lo que dice el RDF, ni más ni menos. Un cargo (nodo intermedio)
 * se atraviesa: desde una persona, la arista va a la institución, al decreto
 * y a la provincia del cargo; desde una institución, una provincia o un
 * decreto, a la persona que lo ocupa.
 */
export function relacionesDesdeTriples(triples: Triple[], sujeto: string): Relacion[] {
  const salen = new Map<string, Triple[]>();
  const entran = new Map<string, Triple[]>();
  for (const x of triples) {
    if (x.s.tipo === "iri") salen.set(x.s.valor, [...(salen.get(x.s.valor) ?? []), x]);
    if (x.o.tipo === "iri") entran.set(x.o.valor, [...(entran.get(x.o.valor) ?? []), x]);
  }
  const uno = (s: string, p: string, tipo: Termino["tipo"]) =>
    salen.get(s)?.find((x) => x.p === p && x.o.tipo === tipo)?.o.valor ?? null;
  const nombre = (s: string) => uno(s, V.etiqueta, "literal") ?? uno(s, V.titulo, "literal") ?? uno(s, V.nombre, "literal") ?? s;
  const esCargo = (s: string) => salen.get(s)?.some((x) => x.p === V.tipo && x.o.valor === V.cargo) ?? false;
  const movimiento = (c: string) => {
    const m = uno(c, V.movimiento, "iri")?.split("#movimiento-")[1] as Movimiento | undefined;
    return m ? (ETIQUETA_MOVIMIENTO[m] ?? null) : null;
  };
  const hacia = (valor: string) => {
    const nodo = nodoDeIri(valor);
    if (nodo) return { nodo, href: rutaDeNodo(nodo), externo: false };
    if (valor.startsWith(SITIO + "/")) return { nodo: null, href: valor.slice(SITIO.length).split("#")[0], externo: false };
    return { nodo: null, href: valor, externo: true };
  };

  const salida: Relacion[] = [];
  const vistas = new Set<string>();
  const agregar = (r: Omit<Relacion, "detalle" | "movimiento" | "fecha" | "monto"> & Partial<Relacion>) => {
    const completa: Relacion = { detalle: null, movimiento: null, fecha: null, monto: null, ...r };
    const k = [completa.grupo, completa.verbo, completa.href, completa.nombre, completa.detalle, completa.fecha].join("|");
    if (vistas.has(k)) return;
    vistas.add(k);
    salida.push(completa);
  };

  for (const x of salen.get(sujeto) ?? []) {
    if (x.o.tipo !== "iri") continue;
    const o = x.o.valor;
    switch (x.p) {
      case V.ocupa: {
        const cargo = nombre(o);
        const base = { detalle: cargo, movimiento: movimiento(o), fecha: uno(o, V.fecha, "literal") };
        const inst = uno(o, V.enInstitucion, "iri");
        const dec = uno(o, V.segunDecreto, "iri");
        const prov = uno(o, V.enProvincia, "iri");
        if (inst) agregar({ grupo: "cargos", verbo: "Cargo en", neutro: `Cargo: ${cargo}`, ...hacia(inst), nombre: nombre(inst), ...base });
        else {
          const fuente = salen.get(o)?.find((y) => y.p === V.fuente && y.o.tipo === "iri")?.o.valor ?? null;
          agregar({
            grupo: "cargos",
            verbo: "Cargo",
            neutro: `Cargo: ${cargo}`,
            nodo: null,
            href: fuente,
            externo: fuente != null,
            nombre: cargo,
            movimiento: base.movimiento,
            fecha: base.fecha,
          });
        }
        if (dec) agregar({ grupo: "decretos", verbo: "Decreto de su cargo", neutro: `El decreto de su cargo: ${cargo}`, ...hacia(dec), nombre: nombre(dec), ...base });
        if (prov) agregar({ grupo: "lugares", verbo: "Provincia de su cargo", neutro: `Cargo en la provincia: ${cargo}`, ...hacia(prov), nombre: nombre(prov), ...base });
        break;
      }
      case V.firmadoPor:
        agregar({ grupo: "decretos", verbo: "Lo firma", neutro: "La firma del decreto", ...hacia(o), nombre: nombre(o) });
        break;
      case V.firmo: {
        const titulo = uno(o, V.titulo, "literal");
        agregar({
          grupo: "decretos",
          verbo: "Firmó",
          neutro: "La firma del decreto",
          ...hacia(o),
          nombre: nombre(o),
          detalle: titulo ? recortar(desdeMayusculas(titulo), 160) : null,
          fecha: uno(o, V.fecha, "literal"),
        });
        break;
      }
      case V.supervisadaPor:
        agregar({ grupo: "entidades", verbo: "La supervisa", neutro: "La supervisión", ...hacia(o), nombre: nombre(o) });
        break;
      case V.mismo: {
        if (o.startsWith(PREFIJOS.wd)) {
          const qid = o.slice(PREFIJOS.wd.length);
          agregar({ grupo: "registros", verbo: "En Wikidata", neutro: "Wikidata", nodo: null, href: hrefWikidata(qid), externo: true, nombre: qid });
          break;
        }
        const h = hacia(o);
        if (h.nodo) {
          agregar({ grupo: "entidades", verbo: "Es la misma entidad que", neutro: "La misma entidad en dos registros", ...h, nombre: nombre(o) });
        } else if (h.href?.startsWith("/congreso/")) {
          agregar({ grupo: "cargos", verbo: "En el Congreso", neutro: "Su ficha de legislador", ...h, nombre: "Su ficha de legislador" });
        }
        break;
      }
      case V.declaracion:
        agregar({
          grupo: "registros",
          verbo: "Declaración jurada",
          neutro: "Una declaración jurada publicada",
          nodo: null,
          href: o,
          externo: true,
          nombre: nombre(o),
          fecha: uno(o, V.subida, "literal"),
        });
        break;
      case V.inscritaComo:
        agregar({ grupo: "registros", verbo: "Inscrita como proveedora", neutro: "Su inscripción de proveedora", ...hacia(o), nombre: nombre(o) });
        break;
      case V.codificacion:
        agregar({ grupo: "registros", verbo: "Su texto", neutro: "Su texto", nodo: null, href: o, externo: true, nombre: "El PDF en la Consultoría Jurídica" });
        break;
      case V.verTambien: {
        const h = hacia(o);
        if (!h.externo && h.href?.endsWith("/decretos")) {
          const n = uno(sujeto, V.decretosFirmados, "literal");
          agregar({ grupo: "decretos", verbo: "Firmó", neutro: "Sus decretos firmados", ...h, nombre: n ? `${Number(n).toLocaleString("es-DO")} decretos` : "Sus decretos" });
        } else if (h.externo) {
          agregar({ grupo: "registros", verbo: "En la lista de la OFAC", neutro: "La lista de la OFAC", ...h, nombre: "Su entrada en la lista SDN" });
        }
        break;
      }
    }
  }

  for (const x of entran.get(sujeto) ?? []) {
    if (x.s.tipo !== "iri") continue;
    const s = x.s.valor;
    if (esCargo(s) && (x.p === V.enInstitucion || x.p === V.enProvincia || x.p === V.segunDecreto)) {
      const titular = uno(s, V.titular, "iri");
      if (!titular) continue;
      const cargo = nombre(s);
      const base = { detalle: cargo, movimiento: movimiento(s), fecha: uno(s, V.fecha, "literal") };
      if (x.p === V.segunDecreto) {
        agregar({ grupo: "decretos", verbo: "Registra el cargo de", neutro: `El decreto de su cargo: ${cargo}`, ...hacia(titular), nombre: nombre(titular), ...base });
      } else {
        agregar({
          grupo: "cargos",
          verbo: x.p === V.enProvincia ? "Cargo en la provincia" : "Cargo",
          neutro: x.p === V.enProvincia ? `Cargo en la provincia: ${cargo}` : `Cargo: ${cargo}`,
          ...hacia(titular),
          nombre: nombre(titular),
          ...base,
        });
      }
    } else if (x.p === V.dirige) {
      agregar({ grupo: "cargos", verbo: "La dirige", neutro: "La dirige", ...hacia(s), nombre: nombre(s) });
    } else if (x.p === V.publicadaPor) {
      agregar({ grupo: "registros", verbo: "Publica la declaración", neutro: "Una declaración que publica", nodo: null, href: s, externo: true, nombre: nombre(s) });
    }
  }

  // Las contrataciones: desde la institución, a quién contrató (la empresa si
  // el padrón la ata, si no la ficha del proveedor); desde la empresa, qué
  // institución le contrató, por cada una de sus inscripciones.
  const cuanto = (c: string) => {
    const m = uno(c, V.montoContratado, "literal");
    const n = uno(c, V.numeroDeContratos, "literal");
    return {
      monto: m ? Number(m) : null,
      detalle: `${Number(n ?? 0).toLocaleString("es-DO")} ${n === "1" ? "contrato" : "contratos"} desde 2015 · valor contratado, no pagado`,
    };
  };
  for (const x of entran.get(sujeto) ?? []) {
    if (x.p !== V.contratante || x.s.tipo !== "iri") continue;
    const pr = uno(x.s.valor, V.contratista, "iri");
    if (!pr) continue;
    const empresa = entran.get(pr)?.find((y) => y.p === V.inscritaComo && y.s.tipo === "iri")?.s.valor ?? null;
    agregar({ grupo: "compras", verbo: "Contrató a", neutro: "Una contratación", ...hacia(empresa ?? pr), nombre: nombre(pr), ...cuanto(x.s.valor) });
  }
  for (const x of salen.get(sujeto) ?? []) {
    if (x.p !== V.inscritaComo || x.o.tipo !== "iri") continue;
    for (const y of entran.get(x.o.valor) ?? []) {
      if (y.p !== V.contratista || y.s.tipo !== "iri") continue;
      const inst = uno(y.s.valor, V.contratante, "iri");
      if (inst) agregar({ grupo: "compras", verbo: "Le contrató", neutro: "Una contratación", ...hacia(inst), nombre: nombre(inst), ...cuanto(y.s.valor) });
    }
  }

  // Quien designa un decreto sin un cargo que lo diga (el cargo cita otra fila con el mismo número).
  const conCargo = new Set(salida.filter((r) => r.grupo === "decretos" && r.nodo).map((r) => r.href));
  for (const x of salen.get(sujeto) ?? []) {
    if (x.p !== V.designa || x.o.tipo !== "iri") continue;
    const h = hacia(x.o.valor);
    if (conCargo.has(h.href)) continue;
    agregar({ grupo: "decretos", verbo: "Registra el cargo de", neutro: "Un cargo que registra el decreto", ...h, nombre: nombre(x.o.valor) });
  }

  // Por grupo, y dentro de cada uno en el orden de su fuente (estable): los
  // cargos de una persona del más reciente al más viejo; los de una
  // institución, de su cabeza hacia abajo; los de una provincia, del
  // gobernador a los directores.
  const orden = new Map(GRUPOS.map((g, i) => [g.id, i]));
  return salida.sort((a, b) => orden.get(a.grupo)! - orden.get(b.grupo)!);
}

/** Un nodo con sus aristas: lo que pinta el explorador. */
export interface Vecindario {
  nodo: NodoRdf;
  titulo: string;
  clase: string;
  nota?: string;
  relaciones: Relacion[];
}

export async function vecindario(n: NodoRdf): Promise<Vecindario | null> {
  const d = await describir(n);
  if (!d) return null;
  return { nodo: n, titulo: d.titulo, clase: CLASE_DE_TIPO[n.tipo], nota: d.nota, relaciones: relacionesDesdeTriples(d.triples, iriDe(n)) };
}

/** La clave de un nodo para conjuntos y mapas. */
export const claveNodo = (n: NodoRdf) => `${n.tipo}:${n.id}`;

/**
 * Las aristas de un nodo hacia otros nodos, sin dirección, para recorrer el
 * grafo: del índice de vecinos compilado (`leerVecinos`) o, si no lo trae —una
 * empresa que solo es su fila del padrón—, de su descripción. Son las mismas
 * que `vecindario` (el compilador lo comprueba nodo a nodo).
 */
export async function vecinosDe(n: NodoRdf): Promise<{ titulo: string; vecinos: Vecino[] } | null> {
  const v = await leerVecinos(n);
  if (v) return v;
  const w = await vecindario(n);
  if (!w) return null;
  return { titulo: w.titulo, vecinos: w.relaciones.flatMap((r) => (r.nodo ? [{ nodo: r.nodo, via: r.neutro, nombre: r.nombre }] : [])) };
}

/* ---------------------------------------------------------------- caminos */

export interface Paso {
  nodo: NodoRdf;
  nombre: string;
  /** La arista que llega a este paso desde el anterior, sin dirección; `null` en el primero. */
  via: string | null;
}

export interface Camino {
  pasos: Paso[] | null;
  /** Cuántas fichas se abrieron buscando. */
  exploradas: number;
  /**
   * Por qué no hay camino: `agotado` si ya no quedaba a quién abrir desde
   * ninguno de los dos lados; `saltos` o `fichas` si se paró en un tope (puede
   * haber uno más largo). `null` si se encontró.
   */
  motivo: "agotado" | "saltos" | "fichas" | null;
  maxSaltos: number;
}

/** Hasta cuántos saltos y cuántas fichas abre una búsqueda de camino. */
export const TOPE_CAMINO = { saltos: 6, fichas: 300 } as const;

/**
 * El camino más corto que se encuentra entre dos fichas, por búsqueda en
 * anchura desde los dos extremos a la vez (siempre avanza el lado con menos
 * frontera). No es completo: una arista que solo dice un nodo que ningún lado
 * abre no se ve, y la página lo dice. Las aristas
 * se toman sin dirección: una institución solo describe sus cargos de hoy,
 * pero la persona que la dirigió en 2004 sí la nombra. Acotado en saltos y en
 * fichas abiertas; el resultado dice si el tope se alcanzó.
 */
async function buscarCamino(de: NodoRdf, a: NodoRdf): Promise<Camino> {
  const { saltos: maxSaltos, fichas: maxFichas } = TOPE_CAMINO;
  const kDe = claveNodo(de);
  const kA = claveNodo(a);
  const nombres = new Map<string, string>();
  const nodos = new Map<string, NodoRdf>([
    [kDe, de],
    [kA, a],
  ]);
  if (kDe === kA) {
    const v = await vecindario(de);
    return { pasos: v ? [{ nodo: de, nombre: v.titulo, via: null }] : null, exploradas: 1, motivo: v ? null : "agotado", maxSaltos };
  }
  // padre[lado]: clave → { la clave desde donde se llegó, la arista }
  const padre = [new Map<string, { desde: string; via: string } | null>([[kDe, null]]), new Map<string, { desde: string; via: string } | null>([[kA, null]])];
  let fronteras = [[kDe], [kA]];
  const profundidad = [0, 0];
  let exploradas = 0;
  let encuentro: string | null = null;

  // Mientras quede frontera en algún lado: una arista la puede decir solo uno de
  // sus extremos, así que un lado agotado no cierra la búsqueda del otro.
  while (!encuentro && (fronteras[0].length || fronteras[1].length) && profundidad[0] + profundidad[1] < maxSaltos) {
    const lado = !fronteras[1].length ? 0 : !fronteras[0].length ? 1 : fronteras[0].length <= fronteras[1].length ? 0 : 1;
    const otro = 1 - lado;
    const siguiente: string[] = [];
    for (const k of fronteras[lado]) {
      if (exploradas >= maxFichas) break;
      const v = await vecinosDe(nodos.get(k)!);
      exploradas++;
      if (!v) continue;
      nombres.set(k, v.titulo);
      for (const r of v.vecinos) {
        const kv = claveNodo(r.nodo);
        if (!nombres.has(kv)) nombres.set(kv, r.nombre);
        if (padre[lado].has(kv)) continue;
        padre[lado].set(kv, { desde: k, via: r.via });
        nodos.set(kv, r.nodo);
        if (padre[otro].has(kv)) {
          encuentro = kv;
          break;
        }
        siguiente.push(kv);
      }
      if (encuentro) break;
    }
    profundidad[lado]++;
    fronteras[lado] = siguiente;
    if (exploradas >= maxFichas) break;
  }

  if (!encuentro) {
    const motivo = exploradas >= maxFichas ? "fichas" : !fronteras[0].length && !fronteras[1].length ? "agotado" : "saltos";
    return { pasos: null, exploradas, motivo, maxSaltos };
  }

  // De `de` al encuentro, y del encuentro a `a`.
  const ida: Paso[] = [];
  for (let k: string | undefined = encuentro; k; ) {
    const p = padre[0].get(k);
    ida.unshift({ nodo: nodos.get(k)!, nombre: nombres.get(k) ?? k, via: p?.via ?? null });
    k = p?.desde;
  }
  const vuelta: Paso[] = [];
  let via = padre[1].get(encuentro)?.via ?? null;
  for (let k = padre[1].get(encuentro)?.desde; k; ) {
    const p = padre[1].get(k);
    vuelta.push({ nodo: nodos.get(k)!, nombre: nombres.get(k) ?? k, via });
    via = p?.via ?? null;
    k = p?.desde;
  }
  return { pasos: [...ida, ...vuelta], exploradas, motivo: null, maxSaltos };
}

/**
 * La forma del resultado. Si cambia, cambia este número: la caché de datos
 * sobrevive a un despliegue y devolvería un resultado con la forma vieja.
 */
const VERSION_CAMINO = "3";

/**
 * El camino, cacheado por par **sin orden** (de A a B es el de B a A, al
 * revés) y por la huella del grafo compilado: un despliegue con otro grafo
 * no lee caminos calculados sobre el viejo.
 */
export async function camino(de: NodoRdf, a: NodoRdf): Promise<Camino> {
  const [x, y] = [claveNodo(de), claveNodo(a)];
  const alReves = x > y;
  const [primero, segundo] = alReves ? [a, de] : [de, a];
  const huella = (await metaGrafo())?.huella ?? "sin-compilado";
  const r = await unstable_cache(
    () => buscarCamino(primero, segundo),
    ["grafo-camino", VERSION_CAMINO, huella, claveNodo(primero), claveNodo(segundo)],
    { revalidate: 86400 },
  )();
  if (!alReves || !r.pasos) return r;
  // Del otro extremo: los mismos pasos, al revés, cada arista con el paso al que llega.
  const pasos = [...r.pasos].reverse().map((p, i, lista) => ({ ...p, via: i === 0 ? null : lista[i - 1].via }));
  return { ...r, pasos };
}

/* -------------------------------------------------------------- búsqueda */

export interface Candidato {
  nodo: NodoRdf;
  nombre: string;
  clase: string;
  detalle: string | null;
}

/** Lo que devuelve la búsqueda de nodos: los candidatos y si hay más que no se muestran. */
export interface Candidatos {
  candidatos: Candidato[];
  /** Algún tipo tenía más coincidencias que las que caben: la lista es una muestra. */
  truncado: boolean;
}

/** Cuántos candidatos de cada tipo, como mucho. */
const TOPE_CANDIDATOS = { personas: 8, instituciones: 5, financieras: 4, total: 16 } as const;

/**
 * Los nodos que se llaman así, para elegir uno en el explorador: un número de
 * decreto o un RNC exactos primero; luego personas, instituciones, entidades
 * financieras y provincias por todas las palabras tecleadas. No es el
 * buscador de la plataforma (`/buscar`): solo nombres de nodos del grafo.
 * Cada tipo tiene su tope, y `truncado` dice si alguno se pasó.
 */
export async function buscarNodos(q: string): Promise<Candidatos> {
  const texto = q.trim().slice(0, 120);
  if (!texto) return { candidatos: [], truncado: false };
  const salida: Candidato[] = [];
  const numero = /^(?:decreto\s+(?:n[oú]m?\.?\s*)?)?(\d{1,4}-\d{2,4})$/i.exec(texto)?.[1];
  if (numero) {
    // Un decreto con ficha es un nodo compilado: su número y su título salen de ahí.
    const d = await decretoCompilado(numeroCanonico("decreto", numero));
    if (d) salida.push({ nodo: { tipo: "decreto", id: d.numero }, nombre: nombreDecreto(d.numero), clase: CLASE_DE_TIPO.decreto, detalle: desdeMayusculas(d.titulo) });
  }
  const cifras = texto.replace(/[\s.\-]/g, "");
  if (/^\d{9}$/.test(cifras)) {
    const e = await empresaPorRnc(cifras);
    if (e) salida.push({ nodo: { tipo: "empresa", id: e.rnc }, nombre: e.razonSocial, clase: CLASE_DE_TIPO.empresa, detalle: `RNC ${e.rnc}` });
  }
  if (salida.length) return { candidatos: salida, truncado: false };

  let truncado = false;
  const a = agujas(texto);
  // Personas y entidades financieras, del índice de nombres compilado (la misma búsqueda que sus fichas).
  const personas = await buscarPersonas(texto);
  if (personas) {
    truncado ||= personas.length > TOPE_CANDIDATOS.personas;
    for (const p of personas.slice(0, TOPE_CANDIDATOS.personas)) {
      salida.push({ nodo: { tipo: "funcionario", id: p.id }, nombre: p.nombre, clase: CLASE_DE_TIPO.funcionario, detalle: p.cargo });
    }
  }
  const instituciones = buscarInstituciones(texto, TOPE_CANDIDATOS.instituciones + 1);
  truncado ||= instituciones.length > TOPE_CANDIDATOS.instituciones;
  for (const i of instituciones.slice(0, TOPE_CANDIDATOS.instituciones)) {
    salida.push({ nodo: { tipo: "institucion", id: String(i.id) }, nombre: i.nombre, clase: CLASE_DE_TIPO.institucion, detalle: i.acronimo || null });
  }
  const entidades = await buscarFinancieras(texto);
  if (entidades) {
    truncado ||= entidades.length > TOPE_CANDIDATOS.financieras;
    for (const e of entidades.slice(0, TOPE_CANDIDATOS.financieras)) {
      salida.push({ nodo: { tipo: "entidad-financiera", id: e.slug }, nombre: e.nombre, clase: CLASE_DE_TIPO["entidad-financiera"], detalle: e.tipo ?? null });
    }
  }
  for (const p of PROVINCIAS) {
    if (contieneTodas(plano(p.nombre), a)) {
      salida.push({ nodo: { tipo: "provincia", id: p.slug }, nombre: p.nombre, clase: CLASE_DE_TIPO.provincia, detalle: null });
    }
  }
  truncado ||= salida.length > TOPE_CANDIDATOS.total;
  // Quien se llama exactamente así va primero, sea del tipo que sea: «Santiago» es la provincia.
  const exacto = plano(texto).trim();
  const candidatos = salida
    .map((c, i) => ({ c, i, e: plano(c.nombre).trim() === exacto || plano(c.detalle ?? "").trim() === exacto ? 0 : 1 }))
    .sort((x, y) => x.e - y.e || x.i - y.i)
    .map((x) => x.c)
    .slice(0, TOPE_CANDIDATOS.total);
  return { candidatos, truncado };
}

export type { Termino };