import { fork, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Generator, Parser } from "sparqljs";
import { FORMAS, triplesFormas, triplesOntologia } from "@/lib/ontologia";
import { llevaCedula, sinCedula } from "@/lib/padron";
import { aJsonLd, aNTriples, aTurtle, PREFIJOS, type Termino, type Triple } from "@/lib/rdf";
import { SITIO } from "@/lib/sitio";
import { DIRECCION_SPARQL, GRAFO_FORMAS, GRAFO_ONTOLOGIA, VOLCADO_SPARQL } from "@/lib/sparql-meta";

/**
 * SPARQL 1.1 de solo lectura sobre el volcado del grafo sin personas naturales
 * (§7.8), con la ontología y sus formas SHACL en grafos con nombre
 * (docs/INFRAESTRUCTURA.md §7.12). Oxigraph (WASM) en un **proceso hijo**
 * (`lib/sparql-hijo.cjs`) que carga `datos/sparql/grafo.nq.gz` al arrancar,
 * ~7,5 s y ~0,7 GB: ningún servidor que mantener, ninguna base de datos, nada
 * que escribir. Por qué un hijo: una consulta dentro del WASM no se deja
 * interrumpir, así que el padre lo **mata** a los 10 s o si pasa del techo de
 * memoria, y arranca otro.
 *
 * Antes de correr, la consulta se lee en su árbol (sparqljs): solo SELECT,
 * ASK, CONSTRUCT o DESCRIBE; nada de SERVICE (ni UPDATE ni LOAD, que no son
 * consultas); ningún producto cartesiano evidente (dos partes de un mismo
 * grupo que no comparten variable; lo que no es evidente lo corta el plazo);
 * ninguna cédula; y un LIMIT de a lo sumo 10 000 filas,
 * puesto si no viene. Se corre la consulta que sparqljs vuelve a escribir, no
 * el texto que llegó. Cada literal que sale pasa por `sinCedula`.
 *
 * Una consulta a la vez en el motor; a lo sumo dos en curso (la que corre y
 * una que espera), y la tercera recibe un 503.
 */

declare const __non_webpack_require__: NodeJS.Require;

if (`${GRAFO_FORMAS}#` !== FORMAS) throw new Error("lib/sparql-meta.ts: GRAFO_FORMAS no es FORMAS de lib/ontologia.ts");

const VOLCADO = path.join(process.cwd(), "datos", "sparql", "grafo.nq.gz");
const HIJO = path.join(process.cwd(), "lib", "sparql-hijo.cjs");
export const TOPE_FILAS = 10_000;
export const TOPE_MS = 10_000;
export const TOPE_CONSULTA = 8_000;
/**
 * El techo del hijo, mirado cada 50 ms: con el proceso de Next (~150 MB) y lo
 * que una consulta crece entre dos miradas, deja margen bajo los 2 GB de la
 * función. El motor cargado ocupa ~0,75 GB.
 */
const TOPE_MEMORIA_KB = 1_250 * 1024;
/**
 * La memoria de WASM no vuelve al sistema: un hijo que tras una consulta queda
 * por encima de esto se cambia por otro mientras nadie lo usa, en vez de que
 * el vigía se lo cobre a una consulta inocente más tarde.
 */
const RECICLAR_KB = 1_000 * 1024;
const EN_CURSO = 2;
/** Una respuesta de función en Vercel no pasa de 4,5 MB: se deja margen. */
export const TOPE_CARACTERES = 4_000_000;
/** Lo que el arranque puede tardar antes de que la consulta se dé por perdida. */
const TOPE_ARRANQUE_MS = 40_000;


/** Un error de quien escribe la consulta (400) o un motor ocupado (503), con lo que hay que hacer. */
export class ErrorDeConsulta extends Error {
  constructor(
    message: string,
    readonly estado = 400,
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------ la lectura */

export type TipoConsulta = "SELECT" | "ASK" | "CONSTRUCT" | "DESCRIBE";

export interface ConsultaRevisada {
  tipo: TipoConsulta;
  /** La consulta como la vuelve a escribir sparqljs, con el LIMIT puesto. */
  texto: string;
  /** El grafo por omisión es la unión de todos, salvo que la consulta diga FROM o FROM NAMED. */
  union: boolean;
}

const parser = () => new Parser({ prefixes: { ...PREFIJOS }, baseIRI: `${SITIO}/` });

type Nodo = Record<string, unknown>;
const esObjeto = (x: unknown): x is Nodo => !!x && typeof x === "object" && !Array.isArray(x);

/** Las variables de un término o un patrón; un nodo en blanco cuenta como variable (`_:b`): también multiplica. */
function variablesDe(x: unknown, fuera: Set<string>): void {
  if (Array.isArray(x)) {
    for (const y of x) variablesDe(y, fuera);
    return;
  }
  if (!esObjeto(x)) return;
  if ((x.termType === "Variable" || x.termType === "BlankNode") && typeof x.value === "string") {
    fuera.add(x.termType === "BlankNode" ? `_:${x.value}` : x.value);
    return;
  }
  for (const v of Object.values(x)) variablesDe(v, fuera);
}

const TIPOS_PATRON = ["bgp", "group", "optional", "union", "graph", "minus", "filter", "bind", "values", "service", "query"];

/** Las variables de una expresión; un EXISTS dentro se revisa como grupo (no une, filtra). */
function variablesDeExpresion(e: unknown, fuera: Set<string>): void {
  if (Array.isArray(e)) {
    for (const y of e) variablesDeExpresion(y, fuera);
    return;
  }
  if (!esObjeto(e)) return;
  if (e.termType === "Variable" && typeof e.value === "string") {
    fuera.add(e.value);
    return;
  }
  if (typeof e.type === "string" && TIPOS_PATRON.includes(e.type)) {
    revisarGrupo([e]);
    return;
  }
  for (const v of Object.values(e)) variablesDeExpresion(v, fuera);
}

/** Una subconsulta que agrega sin GROUP BY da una sola fila: no multiplica. */
function unaFila(q: Nodo): boolean {
  if (q.group) return false;
  const vars = Array.isArray(q.variables) ? q.variables : [];
  return vars.length > 0 && vars.every((v) => esObjeto(v) && esObjeto(v.expression) && v.expression.type === "aggregate");
}

const productoCartesiano = (a: Set<string>, b: Set<string>) =>
  new ErrorDeConsulta(
    `La consulta multiplica partes que no comparten variable (${[a, b].map((g) => [...g].slice(0, 3).map((v) => (v.startsWith("_:") ? "[]" : v.startsWith("\u0000") ? "una UNION sin variable común a sus ramas" : `?${v}`)).join(", ")).join(" y ")}): es un producto cartesiano. Únelas por una variable común, o pide cada parte aparte.`,
  );

/**
 * Revisa un grupo de patrones y devuelve las variables que liga. Lanza si
 * pide un servicio de fuera o si es un producto cartesiano evidente: las
 * partes obligatorias (cada triple, un subgrupo, GRAPH, UNION, una
 * subconsulta) deben quedar unidas por variables compartidas; una UNION une
 * solo por las variables de todas sus ramas; un OPTIONAL y un BIND no unen
 * partes entre sí: cuelgan de las que ya están, y uno que no comparte ninguna
 * variable con ellas también multiplica. Lo que no es evidente (un camino de
 * propiedades sin acotar, dos partes unidas por una variable que casi todo
 * comparte) lo corta el plazo de 10 s.
 */
function revisarGrupo(patrones: unknown[]): Set<string> {
  const partes: Set<string>[] = [];
  const colgantes: Set<string>[] = [];
  const todas = new Set<string>();
  for (const p of patrones) {
    if (!esObjeto(p)) continue;
    const vars = new Set<string>();
    switch (p.type) {
      case "service":
        throw new ErrorDeConsulta("SERVICE no se admite: este punto consulta solo el grafo de Socrático.do, sin salir a otros.");
      case "bgp":
        for (const t of (p.triples as unknown[]) ?? []) {
          const v = new Set<string>();
          variablesDe(t, v);
          if (v.size) partes.push(v);
          for (const x of v) todas.add(x);
        }
        continue;
      case "group":
        for (const x of revisarGrupo((p.patterns as unknown[]) ?? [])) vars.add(x);
        break;
      case "optional": {
        const v = revisarGrupo((p.patterns as unknown[]) ?? []);
        if (v.size) colgantes.push(v);
        for (const x of v) todas.add(x);
        continue;
      }
      case "minus":
        revisarGrupo((p.patterns as unknown[]) ?? []);
        continue;
      case "union": {
        const ramas = ((p.patterns as unknown[]) ?? []).map((rama) => revisarGrupo([rama]));
        for (const r of ramas) for (const x of r) todas.add(x);
        // Une solo por lo que todas las ramas ligan: una rama que no liga la variable común multiplica.
        const comunes = ramas.length ? new Set([...ramas[0]].filter((x) => ramas.every((r) => r.has(x)))) : new Set<string>();
        if (comunes.size) partes.push(comunes);
        else if (ramas.some((r) => r.size)) partes.push(new Set([`\u0000${partes.length}`]));
        continue;
      }
      case "graph":
        for (const x of revisarGrupo((p.patterns as unknown[]) ?? [])) vars.add(x);
        variablesDe(p.name, vars);
        break;
      case "filter":
        variablesDeExpresion(p.expression, new Set());
        continue;
      case "bind": {
        const entrada = new Set<string>();
        variablesDeExpresion(p.expression, entrada);
        variablesDe(p.variable, todas);
        // Un BIND de una constante (NOW(), un literal) da un valor por fila: no multiplica.
        if (entrada.size) colgantes.push(entrada);
        continue;
      }
      case "values":
        // Tantas filas como valores escritos en la consulta: acotado.
        variablesDe(p.values, todas);
        continue;
      case "query": {
        revisarConsulta(p);
        if (unaFila(p)) continue;
        for (const v of (p.variables as unknown[]) ?? []) {
          if (esObjeto(v) && v.termType === "Variable") variablesDe(v, vars);
          else if (esObjeto(v)) variablesDe(v.variable, vars);
        }
        if (vars.size === 0) variablesDe(p.where, vars);
        break;
      }
      default:
        continue;
    }
    if (vars.size) partes.push(vars);
    for (const x of vars) todas.add(x);
  }
  // Las partes obligatorias que comparten una variable se juntan; si quedan dos o más, se multiplican.
  const grupos: Set<string>[] = [];
  for (const p of partes) {
    const unidas = new Set(p);
    for (let i = grupos.length - 1; i >= 0; i--) {
      if ([...grupos[i]].some((v) => unidas.has(v))) {
        for (const v of grupos[i]) unidas.add(v);
        grupos.splice(i, 1);
      }
    }
    grupos.push(unidas);
  }
  if (grupos.length > 1) throw productoCartesiano(grupos[0], grupos[1]);
  // Un OPTIONAL o un BIND cuelga de lo obligatorio: si no comparte nada con ello, también multiplica.
  // Lo ligado crece con cada colgante aceptado: un BIND puede leer lo que ligó un OPTIONAL anterior.
  const ligadas = grupos[0] ?? (colgantes.length ? new Set(colgantes.shift()) : null);
  if (ligadas) {
    for (const c of colgantes) {
      if (![...c].some((v) => ligadas.has(v))) throw productoCartesiano(ligadas, c);
      for (const v of c) ligadas.add(v);
    }
  }
  return todas;
}

function revisarConsulta(q: Nodo): void {
  revisarGrupo((q.where as unknown[]) ?? []);
  // HAVING, ORDER BY y las expresiones de la proyección pueden traer EXISTS.
  for (const k of ["having", "order", "variables", "group"] as const) variablesDeExpresion(q[k], new Set());
}

/** Lee la consulta, la revisa y la vuelve a escribir con su tope de filas. */
export function revisar(texto: string): ConsultaRevisada {
  const crudo = texto.trim();
  if (!crudo) throw new ErrorDeConsulta("La consulta está vacía.");
  if (crudo.length > TOPE_CONSULTA) throw new ErrorDeConsulta(`La consulta pasa de ${TOPE_CONSULTA.toLocaleString("en")} caracteres.`);
  if (llevaCedula(crudo)) throw new ErrorDeConsulta("La consulta lleva una cédula: este grafo no tiene personas naturales y no se busca por cédula.");
  let arbol: Nodo;
  try {
    arbol = parser().parse(crudo) as unknown as Nodo;
  } catch (err) {
    const m = String(err instanceof Error ? err.message : err).split("\n");
    throw new ErrorDeConsulta(`La consulta no se pudo leer: ${m.slice(0, 3).join(" ").slice(0, 300)}`);
  }
  if (arbol.type === "update") throw new ErrorDeConsulta("Solo lectura: INSERT, DELETE, LOAD, CLEAR, CREATE, DROP y demás actualizaciones no se admiten.");
  const tipo = arbol.queryType as TipoConsulta;
  if (!["SELECT", "ASK", "CONSTRUCT", "DESCRIBE"].includes(tipo)) throw new ErrorDeConsulta("Solo SELECT, ASK, CONSTRUCT o DESCRIBE.");
  revisarConsulta(arbol);
  // Segunda llave: ningún SERVICE en ninguna parte del árbol.
  if (/"type":"service"/.test(JSON.stringify(arbol))) throw new ErrorDeConsulta("SERVICE no se admite.");
  if (tipo !== "ASK" && (typeof arbol.limit !== "number" || arbol.limit > TOPE_FILAS)) arbol.limit = TOPE_FILAS + 1;
  const union = !esObjeto(arbol.from);
  return { tipo, texto: new Generator().stringify(arbol as never), union };
}

/* -------------------------------------------------------------- el hijo */

interface Respuesta {
  id?: number;
  ok?: boolean;
  listo?: boolean;
  error?: string;
  json?: string;
  grande?: boolean;
  triples?: Triple[];
  ms?: number;
  rssMb?: number;
  cuadruplos?: number;
}

interface Hijo {
  proceso: ChildProcess;
  listo: Promise<void>;
  pendientes: Map<number, { resolver: (r: Respuesta) => void; rechazar: (e: Error) => void }>;
  motivo: string | null;
}

let hijo: Hijo | null = null;
let siguienteId = 1;

function memoriaKb(pid: number | undefined): number | null {
  if (!pid) return null;
  try {
    const m = /VmRSS:\s+(\d+)\s+kB/.exec(readFileSync(`/proc/${pid}/status`, "utf8"));
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

function arrancar(): Hijo {
  const proceso = fork(HIJO, [__non_webpack_require__.resolve("oxigraph"), VOLCADO], {
    // Sin las variables de la función: el hijo no las necesita.
    env: { NODE_ENV: "production" },
    serialization: "json",
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  const h: Hijo = { proceso, listo: Promise.resolve(), pendientes: new Map(), motivo: null };
  h.listo = new Promise<void>((resolver, rechazar) => {
    proceso.once("message", (m: Respuesta) => {
      if (!m?.listo) return rechazar(new Error(`el motor SPARQL no arrancó: ${m?.error ?? "?"}`));
      // Se registra la carga en frío (cifras, nunca una consulta): es la medida de §7.12.
      console.log(`[sparql] motor listo: ${m.cuadruplos} cuádruplos en ${m.ms} ms, ${m.rssMb} MB residentes`);
      resolver();
    });
    proceso.once("exit", () => rechazar(new Error("el motor SPARQL salió al arrancar")));
    // Un `fork` que no pudo lanzar el proceso (EAGAIN, ENOMEM) emite «error»: sin quien lo oiga, tumbaría la función.
    proceso.once("error", (err) => rechazar(err));
  });
  h.listo.catch(() => {});
  proceso.on("message", (m: Respuesta) => {
    if (m?.id == null) return;
    h.pendientes.get(m.id)?.resolver(m);
    h.pendientes.delete(m.id);
  });
  proceso.on("error", (err) => {
    console.error(`[sparql] el motor: ${err.message}`);
    for (const p of h.pendientes.values()) p.rechazar(new Error("el motor SPARQL no se pudo lanzar"));
    h.pendientes.clear();
    h.motivo ??= "no se pudo lanzar";
    if (hijo === h) hijo = null;
  });
  const vigia = setInterval(() => {
    const kb = memoriaKb(proceso.pid);
    if (kb != null && kb > TOPE_MEMORIA_KB) matar(h, MEMORIA);
  }, 50);
  vigia.unref();
  proceso.once("exit", () => {
    clearInterval(vigia);
    const motivo = h.motivo ?? "el motor se detuvo";
    for (const p of h.pendientes.values()) {
      p.rechazar(
        motivo === MEMORIA
          ? new ErrorDeConsulta("La consulta se detuvo porque el motor pasó de su memoria. Vuelve a intentarla en unos segundos; si se repite, acota con un LIMIT o filtra antes de unir.", 503)
          : new ErrorDeConsulta(`La consulta se detuvo porque ${motivo}: acota con un LIMIT, filtra antes de unir o parte la pregunta.`),
      );
    }
    h.pendientes.clear();
    if (hijo === h) hijo = null;
  });
  proceso.send({
    grafos: [
      { iri: GRAFO_ONTOLOGIA, ttl: aTurtle(triplesOntologia()) },
      { iri: GRAFO_FORMAS, ttl: aTurtle(triplesFormas()) },
    ],
  });
  return h;
}

const MEMORIA = "pasó de la memoria permitida";

function matar(h: Hijo, motivo: string) {
  if (h.motivo) return;
  h.motivo = motivo;
  h.proceso.kill("SIGKILL");
  if (hijo === h) hijo = null;
  // El siguiente arranca ya, para que la consulta que venga no espere la carga entera.
  hijo = arrancar();
}

/* ------------------------------------------------------------ los turnos */

let enCurso = 0;
let cadena: Promise<unknown> = Promise.resolve();

/* ---------------------------------------------------------------- correr */

export interface Celda {
  type: "uri" | "literal" | "bnode";
  value: string;
  "xml:lang"?: string;
  datatype?: string;
}

export type ResultadoSparql =
  | { tipo: "SELECT"; variables: string[]; filas: Record<string, Celda>[]; truncada: boolean; ms: number }
  | { tipo: "ASK"; boolean: boolean; ms: number }
  | { tipo: "CONSTRUCT" | "DESCRIBE"; triples: Triple[]; truncada: boolean; ms: number };

/**
 * Cada cadena que sale, sin cédula: el literal y también el IRI y el tipo,
 * que una consulta puede armar con `IRI(CONCAT(…))` o `STRDT`. El volcado no
 * tiene cédulas (`scripts/build-sparql.mjs` no lo escribe si una aparece):
 * esto es la red del punto, como `limpiar` en el MCP.
 */
function limpiarCelda(c: Celda): Celda {
  const x: Celda = { ...c, value: sinCedula(c.value) };
  if (c.datatype) x.datatype = sinCedula(c.datatype);
  return x;
}

function limpiarTermino(t: Termino): Termino {
  if (t.tipo !== "literal") return { ...t, valor: sinCedula(t.valor) };
  return { ...t, valor: sinCedula(t.valor), ...(t.datatype ? { datatype: sinCedula(t.datatype) } : {}) };
}

const grande = () =>
  new ErrorDeConsulta(`El resultado pasa de ${TOPE_CARACTERES / 1_000_000} MB: pide menos columnas, agrega, pon un LIMIT o no juntes textos enteros con GROUP_CONCAT.`);

/** Corre una consulta de solo lectura: a lo sumo `TOPE_FILAS` filas o triples, cada literal sin cédula. */
export async function consultarSparql(texto: string): Promise<ResultadoSparql> {
  const q = revisar(texto);
  if (enCurso >= EN_CURSO) throw new ErrorDeConsulta("El motor está ocupado con otras consultas: vuelve a intentar en unos segundos.", 503);
  enCurso++;
  const turno = cadena.then(() => correrEnHijo(q));
  cadena = turno.catch(() => {});
  try {
    return await turno;
  } finally {
    enCurso--;
  }
}

async function correrEnHijo(q: ConsultaRevisada): Promise<ResultadoSparql> {
  hijo ??= arrancar();
  const h = hijo;
  let espera: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      h.listo,
      new Promise((_, rechazar) => {
        espera = setTimeout(() => {
          // Un arranque colgado se mata: si no, cada consulta esperaría lo mismo.
          matar(h, "no arrancó a tiempo");
          rechazar(new Error("el motor SPARQL no arrancó a tiempo"));
        }, TOPE_ARRANQUE_MS);
      }),
    ]);
  } finally {
    clearTimeout(espera);
  }
  const t0 = performance.now();
  const id = siguienteId++;
  const grafo = q.tipo === "CONSTRUCT" || q.tipo === "DESCRIBE";
  let reloj: ReturnType<typeof setTimeout> | undefined;
  let r: Respuesta;
  try {
    r = await new Promise<Respuesta>((resolver, rechazar) => {
      h.pendientes.set(id, { resolver, rechazar });
      reloj = setTimeout(() => matar(h, `pasó de ${TOPE_MS / 1000} s`), TOPE_MS);
      h.proceso.send({ id, consulta: q.texto, union: q.union, grafo, tope: TOPE_FILAS, topeCaracteres: TOPE_CARACTERES });
    });
  } finally {
    clearTimeout(reloj);
    if (h === hijo && h.pendientes.size === 0 && (memoriaKb(h.proceso.pid) ?? 0) > RECICLAR_KB) matar(h, "se recicló");
  }
  const ms = Math.round(performance.now() - t0);
  if (!r.ok) throw r.grande ? grande() : new ErrorDeConsulta(`El motor no pudo correr la consulta: ${r.error ?? "?"}`);
  if (grafo) {
    const todos = r.triples ?? [];
    return { tipo: q.tipo as "CONSTRUCT" | "DESCRIBE", triples: todos.slice(0, TOPE_FILAS).map((t) => ({ s: limpiarTermino(t.s), p: t.p, o: limpiarTermino(t.o) })), truncada: todos.length > TOPE_FILAS, ms };
  }
  const json = JSON.parse(r.json ?? "{}") as { head?: { vars?: string[] }; boolean?: boolean; results?: { bindings?: Record<string, Celda>[] } };
  if (q.tipo === "ASK") return { tipo: "ASK", boolean: !!json.boolean, ms };
  const crudas = json.results?.bindings ?? [];
  let truncada = crudas.length > TOPE_FILAS;
  let filas = crudas.slice(0, TOPE_FILAS).map((f) => Object.fromEntries(Object.entries(f).map(([k, c]) => [k, limpiarCelda(c)])));
  while (filas.length > 1 && JSON.stringify(filas).length > TOPE_CARACTERES) {
    filas = filas.slice(0, Math.floor(filas.length / 2));
    truncada = true;
  }
  // Una sola fila de más del tope (un GROUP_CONCAT del grafo entero) no se parte: se dice.
  if (filas.length === 1 && JSON.stringify(filas).length > TOPE_CARACTERES) throw grande();
  return { tipo: "SELECT", variables: json.head?.vars ?? [], filas, truncada, ms };
}

/* ------------------------------------------------------------- formatos */

export const FORMATOS_FILAS = {
  json: "application/sparql-results+json",
  xml: "application/sparql-results+xml",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
} as const;
export const FORMATOS_GRAFO = {
  ttl: "text/turtle",
  nt: "application/n-triples",
  jsonld: "application/ld+json",
} as const;
export type FormatoFilas = keyof typeof FORMATOS_FILAS;
export type FormatoGrafo = keyof typeof FORMATOS_GRAFO;

/** El formato pedido por `format=` (nombre corto o tipo) o por `Accept`, en ese orden. */
export function elegirFormato(tipo: TipoConsulta, pedido: string | null, accept: string | null): string {
  const tabla: Record<string, string> = tipo === "CONSTRUCT" || tipo === "DESCRIBE" ? FORMATOS_GRAFO : FORMATOS_FILAS;
  if (pedido) {
    const p = pedido.toLowerCase().trim();
    for (const [corto, mime] of Object.entries(tabla)) if (p === corto || p === mime || (corto === "ttl" && p === "turtle")) return corto;
    throw new ErrorDeConsulta(`Formato «${pedido.slice(0, 40)}» no disponible para ${tipo}: ${Object.values(tabla).join(", ")}.`, 406);
  }
  const aceptados = (accept ?? "")
    .split(",")
    .map((x) => {
      const [mime, ...params] = x.trim().toLowerCase().split(";");
      const qv = params.map((y) => y.trim()).find((y) => y.startsWith("q="));
      return { mime, q: qv ? Number(qv.slice(2)) : 1 };
    })
    .filter((x) => x.mime && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { mime } of aceptados) for (const [corto, m] of Object.entries(tabla)) if (mime === m) return corto;
  if (tipo !== "CONSTRUCT" && tipo !== "DESCRIBE" && aceptados.some((a) => a.mime === "application/json")) return "json";
  return Object.keys(tabla)[0];
}

const escaparXml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

function celdaTsv(c: Celda | undefined): string {
  if (!c) return "";
  if (c.type === "uri") return `<${c.value}>`;
  if (c.type === "bnode") return `_:${c.value}`;
  const v = `"${c.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")}"`;
  if (c["xml:lang"]) return `${v}@${c["xml:lang"]}`;
  if (c.datatype) return `${v}^^<${c.datatype}>`;
  return v;
}

function celdaCsv(c: Celda | undefined): string {
  if (!c) return "";
  const v = c.type === "bnode" ? `_:${c.value}` : c.value;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** El cuerpo de la respuesta en el formato elegido (SPARQL 1.1 Query Results JSON, XML, CSV y TSV; Turtle, N-Triples o JSON-LD). */
export function serializarResultado(r: ResultadoSparql, formato: string): { cuerpo: string; tipo: string } {
  const enlace = `${SITIO}/fuentes`;
  if ("triples" in r) {
    const cabecera = `Resultado de una consulta SPARQL al grafo de Socrático.do sin personas naturales.\nHerramienta independiente y no oficial sobre datos del Estado dominicano; fuentes y cortes: ${enlace}`;
    if (formato === "nt") return { cuerpo: aNTriples(r.triples), tipo: FORMATOS_GRAFO.nt };
    if (formato === "jsonld") return { cuerpo: JSON.stringify(aJsonLd(r.triples)), tipo: FORMATOS_GRAFO.jsonld };
    return { cuerpo: aTurtle(r.triples, cabecera), tipo: `${FORMATOS_GRAFO.ttl}; charset=utf-8` };
  }
  if (formato === "xml") {
    const cabeza = r.tipo === "SELECT" ? r.variables.map((v) => `<variable name="${escaparXml(v)}"/>`).join("") : "";
    const cuerpo =
      r.tipo === "ASK"
        ? `<boolean>${r.boolean}</boolean>`
        : `<results>${r.filas
            .map(
              (f) =>
                `<result>${Object.entries(f)
                  .map(([k, c]) => {
                    const v =
                      c.type === "uri"
                        ? `<uri>${escaparXml(c.value)}</uri>`
                        : c.type === "bnode"
                          ? `<bnode>${escaparXml(c.value)}</bnode>`
                          : `<literal${c["xml:lang"] ? ` xml:lang="${escaparXml(c["xml:lang"])}"` : ""}${c.datatype ? ` datatype="${escaparXml(c.datatype)}"` : ""}>${escaparXml(c.value)}</literal>`;
                    return `<binding name="${escaparXml(k)}">${v}</binding>`;
                  })
                  .join("")}</result>`,
            )
            .join("\n")}</results>`;
    return {
      cuerpo: `<?xml version="1.0"?>\n<sparql xmlns="http://www.w3.org/2005/sparql-results#"><head>${cabeza}<link href="${escaparXml(enlace)}"/></head>\n${cuerpo}\n</sparql>\n`,
      tipo: `${FORMATOS_FILAS.xml}; charset=utf-8`,
    };
  }
  if (formato === "csv" || formato === "tsv") {
    if (r.tipo === "ASK") return { cuerpo: formato === "csv" ? `_askResult\r\n${r.boolean}\r\n` : `?_askResult\n${r.boolean}\n`, tipo: `${FORMATOS_FILAS[formato]}; charset=utf-8` };
    const lineas =
      formato === "csv"
        ? [r.variables.join(","), ...r.filas.map((f) => r.variables.map((v) => celdaCsv(f[v])).join(","))].join("\r\n") + "\r\n"
        : [r.variables.map((v) => `?${v}`).join("\t"), ...r.filas.map((f) => r.variables.map((v) => celdaTsv(f[v])).join("\t"))].join("\n") + "\n";
    return { cuerpo: lineas, tipo: `${FORMATOS_FILAS[formato]}; charset=utf-8` };
  }
  const json =
    r.tipo === "ASK" ? { head: { link: [enlace] }, boolean: r.boolean } : { head: { vars: r.variables, link: [enlace] }, results: { bindings: r.filas } };
  return { cuerpo: JSON.stringify(json), tipo: `${FORMATOS_FILAS.json}; charset=utf-8` };
}

/* ------------------------------------------------- descripción del servicio */

/** Los grafos con nombre que el motor tiene, con sus cuádruplos: los del volcado (`datos/sparql/meta.json`) y los dos de la ontología. */
export function grafosDelServicio(): { iri: string; cuadruplos: number }[] {
  return [
    ...VOLCADO_SPARQL.grafos,
    { iri: GRAFO_ONTOLOGIA, cuadruplos: triplesOntologia().length },
    { iri: GRAFO_FORMAS, cuadruplos: triplesFormas().length },
  ];
}

/** SPARQL 1.1 Service Description (W3C), en Turtle: lo que `/sparql` responde sin consulta. */
export function descripcionDelServicio(): string {
  const F = "http://www.w3.org/ns/formats/";
  const grafos = grafosDelServicio();
  const total = VOLCADO_SPARQL.cuadruplos + grafos.slice(-2).reduce((s, g) => s + g.cuadruplos, 0);
  const lineas = [
    "# Punto SPARQL 1.1 de solo lectura de Socrático.do: el grafo sin personas naturales, con su ontología y sus formas SHACL.",
    "# Herramienta independiente y no oficial sobre datos del Estado dominicano.",
    "",
    "@prefix sd: <http://www.w3.org/ns/sparql-service-description#> .",
    "@prefix void: <http://rdfs.org/ns/void#> .",
    "@prefix dct: <http://purl.org/dc/terms/> .",
    "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .",
    "",
    `<${DIRECCION_SPARQL}> a sd:Service ;`,
    `    sd:endpoint <${DIRECCION_SPARQL}> ;`,
    "    sd:supportedLanguage sd:SPARQL11Query ;",
    "    sd:feature sd:UnionDefaultGraph ;",
    `    sd:resultFormat <${F}SPARQL_Results_JSON>, <${F}SPARQL_Results_XML>, <${F}SPARQL_Results_CSV>, <${F}SPARQL_Results_TSV>, <${F}Turtle>, <${F}N-Triples>, <${F}JSON-LD> ;`,
    `    dct:description "Solo SELECT, ASK, CONSTRUCT y DESCRIBE; sin SERVICE ni actualizaciones; se rechazan los productos cartesianos evidentes y lo demás se corta a los 10 s; a lo sumo ${TOPE_FILAS} filas, 4 MB por respuesta y ${TOPE_MS / 1000} s por consulta; una consulta corre a la vez y otra espera. El grafo por omisión es la unión de todos los grafos con nombre. Sin personas naturales: ni funcionarios, ni normas, ni el Congreso, ni sentencias, ni documentos; proveedores solo si están atados a una empresa."@es ;`,
    `    dct:source <${SITIO}/data/grafo/grafo.trig.gz> ;`,
    "    sd:defaultDataset [",
    "        a sd:Dataset ;",
    `        dct:modified "${VOLCADO_SPARQL.generado}"^^xsd:date ;`,
    `        sd:defaultGraph [ a sd:Graph ; void:triples ${total} ] ;`,
    ...grafos.map((g, i) => `        sd:namedGraph [ a sd:NamedGraph ; sd:name <${g.iri}> ; sd:graph [ a sd:Graph ; void:triples ${g.cuadruplos} ] ]${i === grafos.length - 1 ? "" : " ;"}`),
    "    ] .",
    "",
  ];
  return lineas.join("\n");
}
