import { AsyncLocalStorage } from "node:async_hooks";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { SITIO } from "@/lib/sitio";
import { enlace, nodoDeRuta, numeroCanonico, rutaDeNodo, type NodoRdf, type TipoNodoRdf } from "@/lib/grafo";
import {
  CLASE_DE_TIPO,
  GRUPOS,
  TOPE_CAMINO,
  buscarNodos,
  camino,
  claveNodo,
  describir,
  inventario,
  iriDe,
  volcadoDelGrafo,
  relacionesDesdeTriples,
  type GrupoRelacion,
  type Relacion,
} from "@/lib/grafo-rdf";
import {
  buscarEnTodo,
  buscarPantallas,
  EN_MAYUSCULAS,
  resultadoPorHref,
  TIPOS_RESULTADO,
  type Resultado,
  type TipoResultado,
} from "@/lib/busqueda";
import {
  planoNombre,
  planoTitulo,
  todosLosProcesos,
  todosLosProveedores,
  type ProcesoIndexado,
  type ProveedorIndexado,
} from "@/lib/tablas-compras";
import { getResumenHistorico, historiaDeInstitucion, historiaDeProveedor, prefijoSinAsignar } from "@/lib/historico";
import { FUENTES_DEL_CRUCE, INSTITUCIONES, institucionPorId, type Institucion } from "@/lib/instituciones";
import { buscarEmpresas, empresaPorRnc, padronEmpresas, type Empresa } from "@/lib/empresas";
import { AVISO_DECRETO, decretoPorNumero, decretosDeFirmante, hrefDecreto, indiceDecretos, type AvisoDecreto } from "@/lib/decretos";
import { MATERIAS } from "@/lib/materias-decreto";
import { filtrarPersonas, getFuncionarios, personaPorId, type Persona } from "@/lib/funcionarios";
import { PROVINCIAS } from "@/lib/provincias";
import { CLASES, PROPIEDADES, PUBLICADA, VERSION as VERSION_ONTOLOGIA, concepto, curie, esquemas, triplesOntologia } from "@/lib/ontologia";
import { PREFIJOS, aNTriples, compactar, expandir, type Triple } from "@/lib/rdf";
import { desdeMayusculas } from "@/lib/congreso";
import { agujas, contieneTodas, palabrasDeContenido, plano } from "@/lib/raiz";
import { tituloHerramienta } from "@/lib/mcp-herramientas";
import { llevaCedula, sinCedula } from "@/lib/padron";
import { NOMBRES_TABLAS, TABLAS_GENERADAS, TABLAS_GRAFO, esquemaCompacto } from "@/lib/grafo-tablas";

/**
 * El servidor MCP de Socrático.do (`/mcp`): la puerta por la que un asistente
 * de IA —Claude, ChatGPT o cualquier cliente del Model Context Protocol— lee
 * la plataforma. No es otra fuente ni otra copia: cada herramienta llama a las
 * mismas capas que pintan las fichas (`lib/busqueda.ts`, `lib/grafo-rdf.ts`,
 * `lib/decretos.ts`), así que responde lo mismo que la página y con las mismas
 * reglas: sin cédulas, PEP solo mientras dura, ni parentescos ni biografías,
 * la fuente y la fecha de corte en cada respuesta (docs/ARQUITECTURA.md, el
 * servidor MCP).
 *
 * Sin estado, sin sesión y sin clave (CLAUDE.md, la invariante): cada pedido
 * HTTP construye su servidor (`servidorMcp`) y lo suelta. Solo lectura: ninguna
 * herramienta escribe ni llama a una fuente en vivo; leen las instantáneas.
 *
 * `search` y `fetch` siguen la forma que ChatGPT exige a un conector de
 * investigación (`results` con `id`, `title` y `url`; un documento con `id`,
 * `title`, `text`, `url` y `metadata`), y devuelven el mismo objeto como
 * `structuredContent` y como texto JSON. Las demás son de la casa.
 */

/** Cambia cuando cambia la forma de una herramienta. */
export const VERSION_MCP = "2.0.0";

const AVISO =
  "Socrático.do es una herramienta independiente y no oficial: ordena lo que publica el Estado dominicano, con su fuente y su fecha de corte.";

const INSTRUCCIONES = `Socrático.do ordena lo que publica el Estado dominicano. Es una herramienta independiente y no oficial.

Qué hay: un grafo de personas con cargo público, instituciones del Estado, decretos, entidades financieras supervisadas, personas jurídicas del padrón de la DGII y provincias, con sus relaciones (cargos, firmas, supervisión, declaraciones juradas publicadas, medidas de la DGCP, la lista SDN de la OFAC, Wikidata); y un índice de búsqueda de compras públicas, proveedores, normas, iniciativas del Congreso, sentencias, obras, documentos institucionales y datos abiertos. Todo sale de instantáneas de fuentes públicas (del Estado dominicano, más la lista SDN de la OFAC y los identificadores de Wikidata): cada respuesta dice su fuente y su fecha de corte.

Cómo se usa:
0. Para una pregunta en llano, empieza por retrieve: trae en una llamada la evidencia con que contestarla (registros del buscador, las entidades del grafo que nombra con sus datos, relaciones y compras, y la consulta de compras que pide, si pide una), cada pieza con su fuente y su fecha, y las llamadas exactas para seguir.
1. search con palabras: un nombre, un RNC de nueve cifras, «Decreto 497-25», un tema. Cada resultado trae un id. Ordena por parecido, no por monto ni fecha; con type se queda en un solo tipo (proceso, proveedor, norma…).
2. fetch con ese id: el registro, con su fuente, su fecha y, si es un nodo del grafo, sus relaciones.
3. Compras públicas: procurement filtra y ordena por monto o por fecha todos los procesos de compra de los últimos doce meses (por año, institución, estado, modalidad, objeto y palabras de la carátula) y da su total y su suma; contracting_history da lo contratado desde 2015 por un proveedor, por una institución o por el país, con sus mayores contrapartes. Para «la mayor», «las más recientes», «las abiertas» o «cuánto compra», usa estas, no search.
4. query corre SQL de solo lectura sobre el grafo entero sin personas naturales (instituciones, proveedores, empresas, contrataciones, medidas, financieras) y los procesos de compra: para contar, cruzar y ordenar lo que las demás no ordenan. fetch con group y page recorre todas las relaciones de un nodo por páginas (quién dirige una institución: group cargos; a quién le contrató: group compras); path busca la cadena más corta de relaciones entre dos nodos, también a través de lo que una institución le contrató a una empresa; signed_decrees lista y filtra los decretos que firmó una persona; ontology explica las clases y relaciones del grafo y dice dónde descargarlo.

Reglas al usar estos datos:
- Cita la fuente y la fecha de corte de cada dato; son instantáneas, no tiempo real.
- El valor de un proceso de compra es el estimado al publicarlo, no lo adjudicado ni lo pagado. Quién ganó un proceso no está en las instantáneas: la ficha del proceso (su url) lo lee en vivo de la DGCP.
- «Persona expuesta políticamente» (PEP) es una categoría legal (Ley 155-17, art. 2, num. 19): quien ocupa, u ocupó en los últimos tres años, un cargo obligado a declarar patrimonio. No es una acusación.
- Una persona se identifica por su nombre normalizado, nunca por su cédula. Dos grafías son dos nodos, y dos personas con el mismo nombre pueden ser distintas: no afirmes que dos registros son la misma persona si la respuesta no lo dice.
- Una relación dice lo que registra su fuente (un cargo, una firma, una supervisión); no implica parentesco, sociedad ni conducta indebida.
- Que algo no esté en Socrático no prueba que no exista: cada respuesta dice qué cubre su fuente.`;

/* ------------------------------------------------------------ utilidades */

/** Un fallo que se le explica a quien pregunta: su mensaje sale tal cual. */
class Aviso extends Error {}

const ENTERO = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 0 });
const ETIQUETA_TIPO = Object.fromEntries(TIPOS_RESULTADO.map((t) => [t.clave, t.etiqueta])) as Record<TipoResultado, string>;

/** La dirección absoluta de una ruta de la plataforma; la de fuera, tal cual. */
const absoluta = (href: string) => (href.startsWith("/") ? `${SITIO}${href}` : href);

/** El título como se lee: los que llegan en MAYÚSCULAS, en minúsculas. */
const tituloDe = (r: Pick<Resultado, "tipo" | "titulo">) => (EN_MAYUSCULAS.has(r.tipo) ? desdeMayusculas(r.titulo) : r.titulo);

const mayuscula = (s: string) => s.charAt(0).toLocaleUpperCase("es") + s.slice(1);

function recortar(texto: string, n: number): string {
  if (texto.length <= n) return texto;
  const corte = texto.slice(0, n);
  return `${corte.slice(0, Math.max(corte.lastIndexOf(" "), n - 20)).trimEnd()}…`;
}

/**
 * Cada cadena de una respuesta, sin cédulas (`sinCedula`). Los adaptadores ya
 * las quitan al leer; esto es la red del servidor: nada con forma de cédula
 * sale por aquí, venga del campo que venga.
 */
function limpiar<T>(v: T): T {
  if (typeof v === "string") return sinCedula(v) as T;
  if (Array.isArray(v)) return v.map((x) => limpiar(x)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpiar(x)])) as T;
  return v;
}

/** Lo que el modelo recibe: el objeto como `structuredContent` y como texto JSON (la forma que pide ChatGPT). */
function resultado<T extends Record<string, unknown>>(objeto: T) {
  const limpio = limpiar(objeto);
  return { content: [{ type: "text" as const, text: JSON.stringify(limpio) }], structuredContent: limpio };
}

/** A una persona no se la busca por su número, tampoco aquí (`llevaCedula`, la regla de `/buscar` y `/empresas`). */
function sinBuscarPorCedula(...textos: (string | undefined)[]): void {
  if (textos.some((t) => t && llevaCedula(t))) {
    throw new Aviso(
      "Lo pedido lleva una cédula. Este servidor no busca por ella, y Socrático no la enseña aunque un título oficial la traiga: busca por el nombre, la institución o el tema.",
    );
  }
}

/**
 * Corre una herramienta: un `Aviso` sale con su mensaje (el SDK lo vuelve un
 * resultado con `isError`); cualquier otro fallo se registra y sale genérico,
 * sin rutas ni pilas del servidor.
 */
async function correr<T>(nombre: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // El aviso repite a veces lo pedido: tampoco lleva una cédula.
    if (err instanceof Aviso) throw new Aviso(sinCedula(err.message));
    console.error(`[mcp] ${nombre}:`, err);
    throw new Aviso("No se pudo completar la consulta: una instantánea no se pudo leer. Intenta de nuevo en un momento.");
  }
}

/* ------------------------------------------------------------ direcciones */

/** A qué lleva un `id`: un nodo del grafo, otra ficha de la plataforma o un archivo de fuera. */
type Destino = { clase: "nodo"; nodo: NodoRdf } | { clase: "ficha"; ruta: string } | { clase: "externo"; url: string };

const DECRETO = /^decreto\s+(?:n[uú]m(?:ero)?\.?\s*|no\.?\s*)?(\d{1,4}-\d{2,4})$/i;

/**
 * Lee un `id` como lo dan las herramientas (la ruta de una ficha) o como lo
 * escribiría alguien: la dirección entera, el IRI con `#id`, un RNC de nueve
 * cifras o «Decreto 497-25». `null` si no dice nada que se pueda abrir.
 */
function resolver(id: string): Destino | null {
  let v = id.trim().slice(0, 500);
  for (const origen of [SITIO, SITIO.replace(/^https:/, "http:")]) {
    if (v.startsWith(`${origen}/`)) v = v.slice(origen.length);
  }
  if (v.startsWith("/")) {
    const ruta = v.split("#")[0];
    const nodo = nodoDeRuta(ruta);
    return nodo ? { clase: "nodo", nodo } : { clase: "ficha", ruta };
  }
  if (/^https?:\/\//i.test(v)) return { clase: "externo", url: v };
  const cifras = v.replace(/[\s.-]/g, "");
  if (/^\d{9}$/.test(cifras)) return { clase: "nodo", nodo: { tipo: "empresa", id: cifras } };
  const decreto = DECRETO.exec(v)?.[1];
  if (decreto) return { clase: "nodo", nodo: { tipo: "decreto", id: numeroCanonico("decreto", decreto) } };
  return null;
}

/** El `id` de una dirección de la plataforma: la ruta estable del nodo si lo es, si no la ruta tal cual. */
function idDeHref(href: string): string {
  if (!href.startsWith("/")) return href;
  const nodo = nodoDeRuta(href);
  return nodo ? rutaDeNodo(nodo) : href;
}

/**
 * Adónde lleva una relación desde las herramientas: el `id` que abre `fetch`
 * (un nodo del grafo, o una ficha de la plataforma que está en el índice), la
 * dirección, y una pista cuando lo que la abre es otra herramienta. Lo de
 * fuera (un PDF, Wikidata, la OFAC) no tiene `id`: se cita por su dirección.
 */
function destinoDe(r: Relacion): { id: string | null; url: string | null; pista: string | null } {
  if (r.nodo) {
    const ruta = rutaDeNodo(r.nodo);
    return { id: ruta, url: absoluta(ruta), pista: null };
  }
  if (!r.href) return { id: null, url: null, pista: null };
  const firmados = /^\/funcionarios\/([^/?#]+)\/decretos$/.exec(r.href);
  if (firmados) {
    const persona = enlace.funcionario(decodeURIComponent(firmados[1]));
    return { id: null, url: absoluta(r.href), pista: `signed_decrees con person «${persona}»` };
  }
  if (r.href.startsWith("/")) return { id: r.href, url: absoluta(r.href), pista: null };
  return { id: null, url: r.href, pista: null };
}

/** Un nodo, o el aviso de que el `id` no es uno. */
function nodoDe(id: string, para: string): NodoRdf {
  const d = resolver(id);
  if (d?.clase === "nodo") return d.nodo;
  throw new Aviso(
    `«${recortar(id, 120)}» no es un nodo del grafo. ${para} funciona con personas con cargo público, instituciones, entidades financieras, empresas, decretos con ficha y provincias: usa el id que devuelve search (por ejemplo «/funcionarios/luis-rodolfo-abinader-corona» o «/instituciones/5»).`,
  );
}

/* ------------------------------------------------------- fuente y corte */

const CLASE_RDF: Record<TipoNodoRdf, string> = {
  funcionario: "soc:Persona",
  institucion: "soc:Institucion",
  "entidad-financiera": "soc:EntidadFinanciera",
  empresa: "soc:Empresa",
  decreto: "soc:Decreto",
  provincia: "soc:Provincia",
};

/** De dónde sale un nodo y de cuándo es, y los cortes de todas las instantáneas del grafo (de ahí salen sus relaciones). */
async function procedencia(tipo: TipoNodoRdf): Promise<{ fuente: string; corte: string | null; cortes: string }> {
  const clases = await inventario();
  const propia = clases.find((c) => c.clase === CLASE_RDF[tipo]);
  // Una vez por fuente: personas y cargos salen de la misma instantánea.
  const vistas = new Set<string>();
  const cortes = clases
    .filter((c) => c.corte && !vistas.has(c.fuente) && vistas.add(c.fuente))
    .map((c) => `${c.etiqueta.toLocaleLowerCase("es")}: ${c.fuente}, ${c.corte!.slice(0, 10)}`)
    .join("; ");
  return {
    fuente: propia?.fuente ?? (tipo === "provincia" ? "ONE" : "Socrático.do"),
    corte: propia?.corte?.slice(0, 10) ?? null,
    cortes,
  };
}

/** El corte del padrón de la DGII, para las empresas que `search` nombra. */
async function cortePadron(): Promise<string | null> {
  const p = await padronEmpresas();
  return (p?.corteDgii ?? p?.generado)?.slice(0, 10) ?? null;
}

/* ------------------------------------------------------------------ datos */

const ETIQUETA_PROPIEDAD = new Map(PROPIEDADES.map((p) => [curie(p), mayuscula(p.etiqueta)]));

/** Las propiedades de fuera que se leen en llano. */
const ETIQUETA_EXTERNA: Record<string, string> = {
  "schema:legalName": "Razón social",
  "schema:alternateName": "Siglas u otro nombre",
  "schema:jobTitle": "Cargo principal",
  "schema:description": "Descripción",
  "dct:title": "Título",
  "foaf:homepage": "Sitio web",
};

/** Lo que repite otro dato (el nombre en tres vocabularios, la fecha de un decreto en tres). */
const REPETIDAS = new Set([
  "rdfs:label",
  "schema:name",
  "skos:altLabel",
  "schema:taxID",
  "schema:inLanguage",
  "schema:legislationIdentifier",
  "schema:legislationType",
  "schema:legislationDate",
  "eli:id_local",
  "eli:date_document",
]);

let conceptos: Map<string, string> | null = null;

/** La etiqueta de cada concepto de la ontología (materias, sectores, movimientos, familias PEP, medidas), por su IRI. */
function conceptoDe(valor: string): string | undefined {
  conceptos ??= new Map(esquemas().flatMap((e) => e.conceptos.map((c) => [expandir(concepto(c.id)), c.etiqueta] as const)));
  return conceptos.get(valor);
}

const BOOLEANO = PREFIJOS.xsd + "boolean";
const ENTERO_XSD = PREFIJOS.xsd + "integer";

/** Lo que el nodo dice de sí mismo (sus literales y sus conceptos), en llano y sin repetir. */
function datosDe(triples: Triple[], sujeto: string): { dato: string; valor: string }[] {
  const salida: { dato: string; valor: string }[] = [];
  const vistos = new Set<string>();
  for (const x of triples) {
    if (x.s.tipo !== "iri" || x.s.valor !== sujeto) continue;
    const p = compactar(x.p) ?? x.p;
    if (REPETIDAS.has(p)) continue;
    let valor: string | null = null;
    if (x.o.tipo === "literal") {
      if (x.o.datatype === BOOLEANO) valor = x.o.valor === "true" ? "sí" : "no";
      else if (x.o.datatype === ENTERO_XSD) valor = ENTERO.format(Number(x.o.valor));
      else if (p === "dct:title" || p === "schema:description" || p === "do:etiquetaConsultoria") valor = desdeMayusculas(x.o.valor);
      else if (p === "do:aviso") valor = AVISO_DECRETO[x.o.valor as AvisoDecreto]?.llano ?? x.o.valor;
      else valor = x.o.valor;
      if (p === "soc:pepVigente" && valor === "sí") {
        valor = "sí (ocupa, u ocupó en los últimos tres años, un cargo obligado a declarar patrimonio: Ley 155-17, art. 2, num. 19; es una categoría legal, no una acusación)";
      }
    } else if (x.o.tipo === "iri") {
      valor = conceptoDe(x.o.valor) ?? (p === "foaf:homepage" ? x.o.valor : null);
    }
    if (valor == null) continue;
    const dato = ETIQUETA_PROPIEDAD.get(p) ?? ETIQUETA_EXTERNA[p] ?? p;
    const k = `${dato}|${valor}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    salida.push({ dato, valor });
  }
  return salida;
}

/** Las medidas de la DGCP que cuelgan de las inscripciones de proveedor de una empresa. */
function medidasDe(triples: Triple[]): { fecha: string | null; tipo: string | null; motivo: string | null; resolucion: string | null }[] {
  const tiene = expandir("soc:tieneMedida");
  const de = (s: string, p: string) => triples.find((x) => x.s.tipo === "iri" && x.s.valor === s && x.p === expandir(p))?.o.valor ?? null;
  const vistas = new Set<string>();
  const salida: { fecha: string | null; tipo: string | null; motivo: string | null; resolucion: string | null }[] = [];
  for (const x of triples) {
    if (x.p !== tiene || x.o.tipo !== "iri" || vistas.has(x.o.valor)) continue;
    vistas.add(x.o.valor);
    const m = x.o.valor;
    const tipo = de(m, "do:tipoDeMedida");
    salida.push({
      fecha: de(m, "soc:fecha"),
      tipo: tipo ? (conceptoDe(tipo) ?? null) : null,
      motivo: de(m, "dct:description"),
      resolucion: de(m, "rdfs:label"),
    });
  }
  return salida.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
}

/* ---------------------------------------------------------------- search */

const Hallado = z.object({
  id: z.string().describe("Lo que se le pasa a fetch (y a path si es un nodo del grafo)."),
  title: z.string(),
  url: z.string().describe("La ficha en Socrático.do o el archivo en el sitio de la institución: la dirección para citar."),
  text: z.string().describe("Qué es, en una línea: tipo, detalle, quién lo publica, fecha y la instantánea de donde sale."),
});
type Hallado = z.infer<typeof Hallado>;

const TIPOS_ID = TIPOS_RESULTADO.map((t) => t.clave) as [TipoResultado, ...TipoResultado[]];

const Busqueda = z.object({
  results: z.array(Hallado),
  tipo: z.enum(TIPOS_ID).nullable().describe("El tipo al que se limitó la búsqueda, si se pidió."),
  total: z.number().describe("Cuántos resultados del índice cumplen la consulta (sin las empresas del padrón ni las provincias)."),
  pagina: z.number(),
  paginas: z.number(),
});

/** Cuántos resultados devuelve `search`: los del índice, más empresas del padrón, provincias y lo que se nombra exacto. */
const TOPE = { indice: 20, empresas: 5, provincias: 4, total: 30 } as const;

function lineaEmpresa(e: Empresa, corte: string | null): string {
  return [
    "Persona jurídica (padrón de la DGII)",
    `RNC ${e.rnc}`,
    e.estado && `estado ${e.estado.toLocaleLowerCase("es")}`,
    e.actividad && desdeMayusculas(e.actividad),
    corte && `padrón del ${corte}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** La línea de un resultado del índice: tipo, detalle, quién lo publica, fecha, valor y su instantánea, sin repetir el tipo. */
function lineaResultado(r: Resultado, corte: string | null | undefined): string {
  const tipo = ETIQUETA_TIPO[r.tipo];
  const igual = (x: string) => x.toLocaleLowerCase("es") === tipo.toLocaleLowerCase("es");
  return [
    tipo,
    // «MIREX · Institución»: el detalle de una institución repite su tipo.
    ...(r.detalle ?? "").split(" · ").filter((x) => x && !igual(x)),
    r.origen,
    r.fecha && `fecha ${r.fecha.slice(0, 10)}`,
    r.sueldo && `mediana del sueldo mensual bruto RD$ ${ENTERO.format(r.sueldo.mediana)}`,
    r.valor != null && `${r.tipo === "proceso" ? "valor estimado" : "valor"} RD$ ${ENTERO.format(r.valor)}`,
    r.via === "tema" && "coincide por tema, no por sus palabras",
    corte && `instantánea del ${corte}`,
  ]
    .filter((x, i): x is string => typeof x === "string" && x !== "" && (i === 0 || !igual(x)))
    .join(" · ");
}

async function buscar(query: string, opciones: { tipo?: TipoResultado; pagina?: number } = {}): Promise<z.infer<typeof Busqueda>> {
  const q = query.trim().slice(0, 200);
  if (!q) throw new Aviso("La búsqueda está vacía: escribe un nombre, un RNC, un número de decreto o un tema.");
  sinBuscarPorCedula(q);
  const { tipo, pagina = 1 } = opciones;
  // Con un tipo o más allá de la primera página, solo el índice: lo que se
  // nombra exacto, las provincias y el padrón van en la primera, sin tipo.
  const soloIndice = tipo != null || pagina > 1;
  const padron = await cortePadron();
  const salida: Hallado[] = [];
  const vistos = new Set<string>();
  const sumar = (h: Hallado) => {
    if (vistos.has(h.id)) return;
    vistos.add(h.id);
    salida.push(h);
  };

  // Lo que se nombra exacto va primero: un decreto por su número, una empresa por su RNC.
  const decreto = soloIndice ? null : (DECRETO.exec(q) ?? /^(\d{1,4}-\d{2})$/.exec(q))?.[1];
  if (decreto) {
    const [d, indice] = await Promise.all([decretoPorNumero(numeroCanonico("decreto", decreto)), indiceDecretos()]);
    const ruta = d?.numero ? enlace.norma("decreto", d.numero) : null;
    if (d?.numero && d.ficha && ruta) {
      sumar({
        id: ruta,
        title: `Decreto ${d.numero}`,
        url: absoluta(ruta),
        text: [
          "Decreto",
          d.fecha && !d.aviso ? d.fecha : null,
          recortar(desdeMayusculas(d.titulo), 200),
          indice && `registro de la Consultoría Jurídica del ${indice.generado.slice(0, 10)}`,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }
  }
  const cifras = q.replace(/[\s.-]/g, "");
  if (!soloIndice && /^\d{9}$/.test(cifras)) {
    const e = await empresaPorRnc(cifras);
    if (e) sumar({ id: enlace.empresa(e.rnc), title: e.razonSocial, url: absoluta(enlace.empresa(e.rnc)), text: lineaEmpresa(e, padron) });
  }

  // Las provincias no están en el índice: se nombran.
  const a = agujas(q);
  if (!soloIndice && a.raices.length > 0) {
    for (const p of PROVINCIAS.filter((x) => contieneTodas(plano(x.nombre), a)).slice(0, TOPE.provincias)) {
      const ruta = rutaDeNodo({ tipo: "provincia", id: p.slug });
      sumar({ id: ruta, title: p.nombre, url: absoluta(ruta), text: `Provincia · cabecera: ${p.cabecera} · límites de la ONE` });
    }
  }

  const [h, empresas] = await Promise.all([
    // El mismo tamaño en todas las páginas, o la segunda se salta resultados.
    buscarEnTodo(q, { tipo, pagina, porPagina: tipo ? TOPE.total : TOPE.indice }),
    !soloIndice && a.raices.length > 0 ? buscarEmpresas(q, { limite: TOPE.empresas }) : Promise.resolve(null),
  ]);
  if (!h) throw new Aviso("El índice de búsqueda no cargó. Intenta de nuevo en un momento.");
  for (const r of h.resultados) {
    if (!r.href) continue;
    // Todo lo del índice es de su instantánea; el estado de un proceso o una
    // iniciativa, también: el de ese día. Las instituciones, del cruce.
    const corte = r.tipo === "institucion" ? FUENTES_DEL_CRUCE.dgcp.consultado : h.instantaneas[r.tipo]?.slice(0, 10);
    sumar({ id: idDeHref(r.href), title: tituloDe(r), url: absoluta(r.href), text: lineaResultado(r, corte) });
  }
  for (const e of empresas?.filas ?? []) {
    const ruta = enlace.empresa(e.rnc);
    sumar({ id: ruta, title: e.razonSocial, url: absoluta(ruta), text: lineaEmpresa(e, padron) });
  }
  return {
    results: salida.slice(0, TOPE.total),
    tipo: tipo ?? null,
    total: h.total,
    pagina: h.pagina,
    paginas: h.paginas,
  };
}

/* ----------------------------------------------------------------- fetch */

const Documento = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string().describe("El registro entero, en texto: lo que es, sus datos, sus relaciones y su fuente con fecha."),
  url: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});
type Documento = z.infer<typeof Documento>;

/** Las relaciones de cada página de `fetch` con `group` o `page`. */
const POR_PAGINA_RELACIONES = 50;

function lineaRelacion(r: Relacion): string {
  const partes = [r.monto != null ? `RD$ ${ENTERO.format(r.monto)}` : null, r.detalle, r.movimiento, r.fecha?.slice(0, 10)].filter(Boolean);
  const d = destinoDe(r);
  const destino = d.id ? ` → ${d.id}` : d.pista ? ` → ${d.pista}` : d.url ? ` → ${d.url} (fuera de Socrático)` : "";
  return `- ${r.verbo}: ${r.nombre}${partes.length ? ` (${partes.join(" · ")})` : ""}${destino}`;
}

/** Cuántas relaciones de cada grupo trae `fetch`: un grupo largo (los cargos de un ministerio) no tapa a los demás. */
const POR_GRUPO_FETCH = 15;

/** Las relaciones agrupadas, cada grupo con su título y, si pasa del tope, cuántas siguen y cómo pedirlas. */
function bloqueRelaciones(relaciones: Relacion[], ruta: string, tope = Infinity): string[] {
  const lineas: string[] = [];
  for (const g of GRUPOS) {
    const delGrupo = relaciones.filter((r) => r.grupo === g.id);
    if (delGrupo.length === 0) continue;
    lineas.push("", `### ${g.etiqueta} (${delGrupo.length})`, ...delGrupo.slice(0, tope).map(lineaRelacion));
    if (delGrupo.length > tope) lineas.push(`- Siguen ${delGrupo.length - tope}: fetch con el id «${ruta}» y group «${g.id}».`);
  }
  return lineas;
}

async function leerNodo(n: NodoRdf): Promise<Documento | null> {
  const d = await describir(n);
  if (!d) return null;
  const sujeto = iriDe(n);
  const ruta = rutaDeNodo(n);
  const url = absoluta(ruta);
  const relaciones = relacionesDesdeTriples(d.triples, sujeto);
  const datos = datosDe(d.triples, sujeto);
  const medidas = medidasDe(d.triples);
  const origen = await procedencia(n.tipo);

  const lineas = [`# ${d.titulo}`, `${CLASE_DE_TIPO[n.tipo]} · ${url}`, `IRI: ${sujeto}`];
  if (d.nota) lineas.push(d.nota);
  if (datos.length) lineas.push("", "## Datos", ...datos.map((x) => `- ${x.dato}: ${x.valor}`));
  if (medidas.length) {
    lineas.push("", `## Medidas de la DGCP sobre sus inscripciones de proveedor (${medidas.length})`);
    for (const m of medidas.slice(0, 20)) {
      lineas.push(`- ${[m.fecha, m.tipo].filter(Boolean).join(" · ")}${m.motivo ? `: ${recortar(m.motivo, 300)}` : ""}${m.resolucion ? ` (${m.resolucion})` : ""}`);
    }
    if (medidas.length > 20) lineas.push(`Siguen ${medidas.length - 20} medidas más en su ficha de proveedor.`);
  }
  // Las compras son un añadido: si el índice no carga, la ficha sale sin ellas.
  const compras = await comprasDelNodo(n).catch((err) => {
    console.error("[mcp] compras de un nodo:", err);
    return null;
  });
  if (compras) lineas.push(...compras.lineas);
  lineas.push("", `## Relaciones: ${relaciones.length}${relaciones.length > POR_GRUPO_FETCH ? ` (hasta ${POR_GRUPO_FETCH} por grupo)` : ""}`);
  if (relaciones.length === 0) lineas.push("Las fuentes no le registran relaciones con otros nodos.");
  lineas.push(...bloqueRelaciones(relaciones, ruta, POR_GRUPO_FETCH));
  lineas.push(
    "",
    "## Fuente",
    `${origen.fuente}${origen.corte ? `, instantánea del ${origen.corte}` : ""}. Las relaciones salen de las instantáneas de cada fuente (${origen.cortes}).`,
    AVISO,
  );

  return {
    id: ruta,
    title: d.titulo,
    text: lineas.join("\n"),
    url,
    metadata: {
      tipo: "nodo",
      clase: CLASE_DE_TIPO[n.tipo],
      claseRdf: CLASE_RDF[n.tipo],
      iri: sujeto,
      fuente: origen.fuente,
      corte: origen.corte,
      relaciones: relaciones.length,
      rdf: { turtle: absoluta(enlace.rdf(ruta, "ttl")), jsonld: absoluta(enlace.rdf(ruta, "jsonld")) },
      explorador: absoluta(enlace.grafo(ruta)),
      ...compras?.metadata,
      aviso: AVISO,
    },
  };
}

/** Las compras de un nodo: las de una institución con unidad de compra, o lo contratado a una empresa inscrita como proveedor. */
async function comprasDelNodo(n: NodoRdf): Promise<Seccion | null> {
  if (n.tipo === "institucion") {
    const i = institucionPorId(n.id);
    return i ? comprasDeInstitucion(i) : null;
  }
  if (n.tipo !== "empresa") return null;
  const { proveedores } = await todosLosProveedores();
  const inscritos = proveedores.filter((x) => x.rnc === n.id).sort((a, b) => (b.contratos ?? 0) - (a.contratos ?? 0));
  const p = inscritos[0];
  if (!p) return null;
  const s = await comprasDeProveedor(p.rpe);
  if (!s) return null;
  // Un RNC puede tener más de un registro de proveedor: se nombran todos, y lo contratado es el del primero.
  const otros = inscritos.slice(1).map((x) => `RPE ${x.rpe}${x.contratos ? ` (${ENTERO.format(x.contratos)} contratos)` : ""} → ${enlace.proveedor(x.rpe)}`);
  s.lineas.splice(
    2,
    0,
    `- Inscrita como proveedora del Estado: RPE ${p.rpe} → ${enlace.proveedor(p.rpe)}${otros.length ? `. Con el mismo RNC también: ${otros.join("; ")}; lo de abajo es solo del RPE ${p.rpe}` : ""}`,
  );
  return { lineas: s.lineas, metadata: { proveedor: enlace.proveedor(p.rpe), otrosRegistros: inscritos.slice(1).map((x) => enlace.proveedor(x.rpe)), ...s.metadata } };
}

async function leerRegistro(href: string): Promise<Documento | null> {
  const hallado = await resultadoPorHref(href);
  if (!hallado) return null;
  const { resultado: r, corte } = hallado;
  const url = absoluta(r.href ?? href);
  const dia = corte?.slice(0, 10) ?? null;
  const estadoAl = (r.tipo === "proceso" || r.tipo === "iniciativa") && dia ? ` (al ${dia})` : "";
  // Un proveedor con RNC de empresa es también una persona jurídica del grafo.
  const rnc = r.tipo === "proveedor" ? (/\bRNC (\d{9})\b/.exec(r.detalle ?? "")?.[1] ?? null) : null;
  // Un proceso y un proveedor traen más de lo que guarda el índice: sus
  // campos por separado, y lo contratado desde 2015.
  const propio = /^\/(procesos|proveedores)\/([^/?#]+)$/.exec(r.href ?? href);
  const extra =
    r.tipo === "proceso" && propio?.[1] === "procesos"
      ? await detalleDeProceso(decodeURIComponent(propio[2]))
      : r.tipo === "proveedor" && propio?.[1] === "proveedores"
        ? await comprasDeProveedor(decodeURIComponent(propio[2]))
        : null;
  const lineas = [
    `# ${tituloDe(r)}`,
    `${ETIQUETA_TIPO[r.tipo]} · ${url}`,
    "",
    r.detalle && `- Detalle: ${r.detalle}${estadoAl}`,
    r.origen && `- Publica o ejecuta: ${r.origen}`,
    r.fecha && `- Fecha: ${r.fecha.slice(0, 10)}`,
    r.valor != null && `- Valor${r.tipo === "proceso" ? " estimado" : ""}: RD$ ${ENTERO.format(r.valor)}`,
    r.plazas != null && `- Plazas en la nómina: ${ENTERO.format(r.plazas)}${r.instituciones ? ` en ${ENTERO.format(r.instituciones)} instituciones` : ""}`,
    r.sueldo &&
      `- Sueldo mensual bruto: mediana RD$ ${ENTERO.format(r.sueldo.mediana)}; el 80 % del medio, entre RD$ ${ENTERO.format(r.sueldo.bajo)} y RD$ ${ENTERO.format(r.sueldo.alto)}`,
    r.contratos != null && `- Contratos con el Estado desde 2015: ${ENTERO.format(r.contratos)}`,
    rnc && `- Su RNC en el padrón de la DGII, como nodo del grafo: ${enlace.empresa(rnc)}`,
    r.archivos != null && `- Archivos con el mismo título, del mismo sitio: ${ENTERO.format(r.archivos)}`,
    ...(extra?.lineas ?? []),
    "",
    "## Fuente",
    `El índice de búsqueda de Socrático.do${dia ? `, instantánea del ${dia}` : ""}. Es el resumen que guarda el índice; el registro completo, con su fuente original, está en ${url}.`,
    AVISO,
  ].filter((l): l is string => typeof l === "string");
  return {
    id: href,
    title: tituloDe(r),
    text: lineas.join("\n"),
    url,
    metadata: {
      tipo: "registro",
      clase: ETIQUETA_TIPO[r.tipo],
      fuente: "Índice de búsqueda de Socrático.do",
      corte: dia,
      externo: r.externo,
      ...extra?.metadata,
      aviso: AVISO,
    },
  };
}

async function leer(id: string): Promise<Documento> {
  const d = resolver(id);
  if (!d) {
    throw new Aviso(`No sé abrir «${recortar(id, 120)}». Usa el id que devuelve search: la ruta de una ficha («/instituciones/5»), un RNC de nueve cifras o «Decreto 497-25».`);
  }
  let doc: Documento | null = null;
  if (d.clase === "nodo") doc = (await leerNodo(d.nodo)) ?? (await leerRegistro(rutaDeNodo(d.nodo)));
  else doc = await leerRegistro(d.clase === "ficha" ? d.ruta : d.url);
  if (!doc) {
    throw new Aviso(
      `No encontramos «${recortar(id, 120)}» en las instantáneas de Socrático.do. Puede haber salido del corte, o no ser un id de esta plataforma: búscalo con search.`,
    );
  }
  return doc;
}

/* ------------------------------------------- las relaciones, por páginas */

const GRUPOS_ID = GRUPOS.map((g) => g.id) as [GrupoRelacion, ...GrupoRelacion[]];

const Vecino = z.object({
  grupo: z.enum(GRUPOS_ID),
  verbo: z.string().describe("Cómo se lee la relación desde el nodo: «Cargo en», «Firmó», «La supervisa»."),
  nombre: z.string(),
  detalle: z.string().nullable(),
  movimiento: z.string().nullable(),
  fecha: z.string().nullable(),
  monto: z.number().nullable().describe("Una contratación: el valor contratado desde 2015 en pesos (no pagado)."),
  id: z
    .string()
    .nullable()
    .describe("El otro extremo, si fetch lo abre: un nodo del grafo o una ficha de la plataforma. null si solo tiene dirección de fuera (url) o lo abre otra herramienta (pista)."),
  url: z.string().nullable().describe("La dirección del otro extremo, para citarlo."),
  pista: z.string().nullable().describe("La herramienta que lo abre, cuando no es fetch: la lista de decretos firmados se pide a signed_decrees."),
  esNodo: z.boolean().describe("Si el otro extremo es un nodo del grafo (se abre con fetch y se recorre con path)."),
});

const Vecinos = z.object({
  id: z.string(),
  title: z.string(),
  clase: z.string(),
  url: z.string(),
  grupo: z.string().nullable(),
  total: z.number(),
  pagina: z.number(),
  paginas: z.number(),
  nota: z.string().nullable(),
  relaciones: z.array(Vecino),
  fuente: z.string().describe("De dónde sale el nodo."),
  corte: z.string().nullable().describe("La fecha de la instantánea de su fuente."),
  cortes: z.string().describe("Las instantáneas de donde salen sus relaciones, con su fecha."),
  aviso: z.string(),
});

async function vecinos(id: string, grupo: GrupoRelacion | undefined, pagina: number): Promise<z.infer<typeof Vecinos>> {
  const n = nodoDe(id, "fetch con group o page");
  const d = await describir(n);
  if (!d) throw new Aviso(`No encontramos «${recortar(id, 120)}» en las instantáneas del grafo.`);
  const ruta = rutaDeNodo(n);
  const todas = relacionesDesdeTriples(d.triples, iriDe(n)).filter((r) => !grupo || r.grupo === grupo);
  const paginas = Math.max(1, Math.ceil(todas.length / POR_PAGINA_RELACIONES));
  const actual = Math.min(Math.max(1, pagina), paginas);
  const origen = await procedencia(n.tipo);
  return {
    id: ruta,
    title: d.titulo,
    clase: CLASE_DE_TIPO[n.tipo],
    url: absoluta(ruta),
    grupo: grupo ?? null,
    total: todas.length,
    pagina: actual,
    paginas,
    nota: d.nota ?? null,
    relaciones: todas.slice((actual - 1) * POR_PAGINA_RELACIONES, actual * POR_PAGINA_RELACIONES).map((r) => ({
      grupo: r.grupo,
      verbo: r.verbo,
      nombre: r.nombre,
      detalle: r.detalle,
      movimiento: r.movimiento,
      fecha: r.fecha?.slice(0, 10) ?? null,
      monto: r.monto,
      ...destinoDe(r),
      esNodo: r.nodo != null,
    })),
    fuente: origen.fuente,
    corte: origen.corte,
    cortes: origen.cortes,
    aviso: AVISO,
  };
}

/**
 * `fetch` con `group` o `page`: una página de las relaciones de un nodo, con
 * la forma de documento que ChatGPT exige a `fetch` (id, title, text, url,
 * metadata). El texto las lista; `metadata.relaciones` las trae estructuradas.
 */
async function leerRelaciones(id: string, grupo: GrupoRelacion | undefined, pagina: number): Promise<Documento> {
  const v = await vecinos(id, grupo, pagina);
  const etiqueta = grupo ? (GRUPOS.find((g) => g.id === grupo)?.etiqueta ?? grupo) : "Todas las relaciones";
  const lineas = [
    `# ${v.title}: ${etiqueta}`,
    `${v.clase} · ${v.url}`,
    `${ENTERO.format(v.total)} relaciones${grupo ? " en este grupo" : ""}; página ${v.pagina} de ${v.paginas}, de ${POR_PAGINA_RELACIONES} en ${POR_PAGINA_RELACIONES}.`,
  ];
  if (v.nota) lineas.push(v.nota);
  lineas.push("");
  for (const r of v.relaciones) {
    const partes = [r.monto != null ? `RD$ ${ENTERO.format(r.monto)}` : null, r.detalle, r.movimiento, r.fecha].filter(Boolean);
    const destino = r.id ? ` → ${r.id}` : r.pista ? ` → ${r.pista}` : r.url ? ` → ${r.url} (fuera de Socrático)` : "";
    lineas.push(`- ${r.verbo}: ${r.nombre}${partes.length ? ` (${partes.join(" · ")})` : ""}${destino}`);
  }
  if (v.total === 0) lineas.push(grupo ? "Las fuentes no le registran relaciones de este grupo." : "Las fuentes no le registran relaciones con otros nodos.");
  if (v.pagina < v.paginas) lineas.push("", `Siguen: fetch con el id «${v.id}»${grupo ? `, group «${grupo}»` : ""} y page ${v.pagina + 1}.`);
  lineas.push("", "## Fuente", `${v.fuente}${v.corte ? `, instantánea del ${v.corte}` : ""}. Las relaciones salen de ${v.cortes}.`, AVISO);
  return {
    id: v.id,
    title: v.title,
    text: lineas.join("\n"),
    url: v.url,
    metadata: {
      tipo: "relaciones",
      clase: v.clase,
      grupo: v.grupo,
      total: v.total,
      pagina: v.pagina,
      paginas: v.paginas,
      relaciones: v.relaciones,
      fuente: v.fuente,
      corte: v.corte,
      cortes: v.cortes,
      aviso: AVISO,
    },
  };
}

/* ------------------------------------------------------------------ path */

const Paso = z.object({
  id: z.string(),
  nombre: z.string(),
  clase: z.string(),
  via: z.string().nullable().describe("La relación que llega a este paso desde el anterior; null en el primero."),
});

const Cadena = z.object({
  encontrado: z.boolean(),
  saltos: z.number().nullable(),
  pasos: z.array(Paso),
  exploradas: z.number().describe("Cuántas fichas se abrieron buscando."),
  tope: z.object({ saltos: z.number(), fichas: z.number() }),
  explicacion: z.string(),
  explorador: z.string().describe("El mismo camino, dibujado en Socrático.do."),
  cortes: z.string().describe("Las instantáneas de donde salen las relaciones del camino, con su fecha."),
  aviso: z.string(),
});

async function cadena(desde: string, hasta: string): Promise<z.infer<typeof Cadena>> {
  const a = nodoDe(desde, "path");
  const b = nodoDe(hasta, "path");
  const [c, { cortes }] = await Promise.all([camino(a, b), procedencia(a.tipo)]);
  const explorador = absoluta(enlace.caminoGrafo(rutaDeNodo(a), rutaDeNodo(b)));
  const tope = { saltos: TOPE_CAMINO.saltos, fichas: TOPE_CAMINO.fichas };
  if (c.pasos) {
    return {
      encontrado: true,
      saltos: c.pasos.length - 1,
      pasos: c.pasos.map((p) => ({ id: rutaDeNodo(p.nodo), nombre: p.nombre, clase: CLASE_DE_TIPO[p.nodo.tipo], via: p.via })),
      exploradas: c.exploradas,
      tope,
      explicacion:
        "El camino más corto que se encontró, leyendo las relaciones sin dirección. Cada paso es una relación que registra una fuente del Estado; un camino no implica parentesco, sociedad ni conducta indebida.",
      explorador,
      cortes,
      aviso: AVISO,
    };
  }
  const explicacion =
    c.motivo === "agotado"
      ? "No hay camino: desde ninguno de los dos extremos quedaba a quién abrir. Una relación que solo registra un nodo que ningún lado abrió no se ve."
      : c.motivo === "saltos"
        ? `No se encontró en ${c.maxSaltos} saltos; puede haber uno más largo.`
        : `Se abrieron ${c.exploradas} fichas sin encontrarlo, el tope de la búsqueda; puede haber un camino que no se alcanzó.`;
  return { encontrado: false, saltos: null, pasos: [], exploradas: c.exploradas, tope, explicacion, explorador, cortes, aviso: AVISO };
}

/* -------------------------------------------------------- signed_decrees */

const POR_PAGINA_DECRETOS = 25;

const DecretoFirmado = z.object({
  numero: z.string().nullable(),
  fecha: z.string().nullable(),
  titulo: z.string(),
  materia: z.string(),
  etiquetaConsultoria: z.string().nullable(),
  aviso: z.string().nullable().describe("Si el registro trae la fecha dudosa o fuera del período del firmante."),
  id: z.string().nullable().describe("La ficha del decreto (se abre con fetch); null si solo tiene su PDF."),
  url: z.string().nullable(),
});

const Firmados = z.object({
  persona: z.object({ id: z.string(), nombre: z.string(), url: z.string() }),
  firma: z.object({ como: z.string(), desde: z.string(), hasta: z.string(), total: z.number() }),
  filtros: z.object({ anio: z.number().nullable(), materia: z.string().nullable(), texto: z.string().nullable() }),
  total: z.number(),
  pagina: z.number(),
  paginas: z.number(),
  decretos: z.array(DecretoFirmado),
  fuente: z.string(),
  corte: z.string().nullable(),
  lista: z.string().describe("La misma lista, con sus filtros, en Socrático.do."),
  aviso: z.string(),
});

const MATERIA_SLUGS = MATERIAS.map((m) => m.slug) as [string, ...string[]];

/** La persona que firma, por su id o por su nombre; si el nombre es de varias, el aviso las nombra. */
async function firmanteDe(texto: string): Promise<Persona> {
  const d = resolver(texto);
  if (d?.clase === "nodo" && d.nodo.tipo === "funcionario") {
    const p = await personaPorId(d.nodo.id);
    if (!p) throw new Aviso(`No encontramos a «${recortar(texto, 120)}» entre las personas con cargo público.`);
    if (!p.firma) throw new Aviso(`El registro de decretos de la Consultoría Jurídica no atribuye decretos a ${p.nombre}.`);
    return p;
  }
  const f = await getFuncionarios();
  if (!f) throw new Error("funcionarios.json no cargó");
  const candidatos = filtrarPersonas(f, { q: texto.slice(0, 120) }).filter((p) => p.firma);
  const exacta = candidatos.filter((p) => plano(p.nombre) === plano(texto));
  if (candidatos.length === 1) return candidatos[0];
  if (exacta.length === 1) return exacta[0];
  if (candidatos.length === 0) {
    throw new Aviso(`Nadie con decretos firmados en el registro se llama «${recortar(texto, 120)}». Busca a la persona con search y usa su id.`);
  }
  const lista = candidatos
    .slice(0, 8)
    .map((p) => `${p.nombre} (${p.firma!.desde.slice(0, 4)}–${p.firma!.hasta.slice(0, 4)}) → ${enlace.funcionario(p.id)}`)
    .join("; ");
  throw new Aviso(`Hay ${candidatos.length} firmantes que se llaman así: ${lista}. Pide de nuevo con el id de la persona.`);
}

async function decretosFirmados(
  persona: string,
  filtros: { anio?: number; materia?: string; texto?: string; pagina?: number },
): Promise<z.infer<typeof Firmados>> {
  sinBuscarPorCedula(persona, filtros.texto);
  const p = await firmanteDe(persona);
  const firma = p.firma!;
  const [todos, indice] = await Promise.all([decretosDeFirmante(firma.clave), indiceDecretos()]);
  if (!indice) throw new Error("decretos/indice.json no cargó");
  const texto = filtros.texto?.trim().slice(0, 120) || null;
  const a = texto ? agujas(texto) : null;
  const lista = todos.filter(
    (d) =>
      (!a || d.numero === texto || contieneTodas(plano(`${d.numero ?? ""} ${d.titulo} ${d.institucion ?? ""}`), a)) &&
      (!filtros.materia || d.materia.slug === filtros.materia) &&
      (filtros.anio == null || d.anio === filtros.anio),
  );
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA_DECRETOS));
  const pagina = Math.min(Math.max(1, filtros.pagina ?? 1), paginas);
  const consulta = new URLSearchParams();
  if (texto) consulta.set("q", texto);
  if (filtros.materia) consulta.set("materia", filtros.materia);
  if (filtros.anio != null) consulta.set("anio", String(filtros.anio));
  const base = enlace.decretosFirmados(p.id);
  return {
    persona: { id: enlace.funcionario(p.id), nombre: p.nombre, url: absoluta(enlace.funcionario(p.id)) },
    firma: { como: firma.como, desde: firma.desde.slice(0, 10), hasta: firma.hasta.slice(0, 10), total: todos.length },
    filtros: { anio: filtros.anio ?? null, materia: filtros.materia ?? null, texto },
    total: lista.length,
    pagina,
    paginas,
    decretos: lista.slice((pagina - 1) * POR_PAGINA_DECRETOS, pagina * POR_PAGINA_DECRETOS).map((d) => {
      const href = hrefDecreto(d);
      return {
        numero: d.numero,
        fecha: d.fecha?.slice(0, 10) ?? null,
        titulo: desdeMayusculas(d.titulo),
        materia: d.materia.nombre,
        etiquetaConsultoria: d.institucion ? desdeMayusculas(d.institucion) : null,
        aviso: d.aviso ? AVISO_DECRETO[d.aviso].llano : null,
        id: href?.startsWith("/") ? href : null,
        url: href ? absoluta(href) : null,
      };
    }),
    fuente: "Registro de decretos de la Consultoría Jurídica del Poder Ejecutivo",
    corte: indice.generado.slice(0, 10),
    lista: absoluta(consulta.toString() ? `${base}?${consulta.toString()}` : base),
    aviso: AVISO,
  };
}

/* ------------------------------------------------------------ procurement */

/** Las etapas de un proceso tal como las escribe el índice (`scripts/busqueda_procesos.py`, del literal de la DGCP). */
const ETAPAS = {
  abierto: "Abierto a ofertas",
  cerrado: "Recepción cerrada",
  evaluacion: "En evaluación",
  adjudicado: "Adjudicado",
  desierto: "Desierto",
  cancelado: "Cancelado",
  suspendido: "Suspendido",
} as const;

/** Las modalidades tal como las escribe el índice: el literal de la DGCP, dos dichas corto. */
const MODALIDADES = {
  lpn: "Licitación Pública Nacional",
  lpi: "Licitación Pública Internacional",
  lpa: "Licitación Pública Abreviada",
  restringida: "Licitación Restringida",
  comparacion: "Comparación de Precios",
  subasta: "Subasta Inversa",
  sorteo: "Sorteo de Obras",
  menor: "Contratación Menor",
  umbral: "Compra menor al umbral",
  excepcion: "Excepción",
} as const;

const OBJETOS = { bienes: "Bienes", obras: "Obras", servicios: "Servicios" } as const;

type ClaveEtapa = keyof typeof ETAPAS;
type ClaveModalidad = keyof typeof MODALIDADES;
const CLAVES_ETAPA = Object.keys(ETAPAS) as [ClaveEtapa, ...ClaveEtapa[]];
const CLAVES_MODALIDAD = Object.keys(MODALIDADES) as [ClaveModalidad, ...ClaveModalidad[]];
const CLAVES_OBJETO = Object.keys(OBJETOS) as [keyof typeof OBJETOS, ...(keyof typeof OBJETOS)[]];
const ORDENES_COMPRA = ["monto", "monto_asc", "fecha", "fecha_asc"] as const;

const POR_PAGINA_COMPRAS = 25;
/** Cuántas instituciones trae el desglose de `procurement`. */
const TOPE_POR_INSTITUCION = 10;

const FUENTE_PROCESOS = "Tabla de procesos de los datos abiertos de la DGCP (datosabiertos.dgcp.gob.do), los últimos doce meses";

const NOTA_VALOR =
  "El valor es el estimado que la unidad de compra registró al publicar el proceso: no es lo adjudicado ni lo pagado, y puede traer errores de captura.";
const NOTA_ADJUDICATARIO =
  "Quién ganó un proceso y por cuánto no está en esta instantánea: la ficha del proceso (su url) lo lee en vivo de la DGCP. Lo contratado desde 2015 por proveedor e institución, agregado, lo da contracting_history.";

/** La institución de cada unidad de compra, por su nombre: el cruce las nombra igual que la tabla de procesos. */
let institucionPorUnidad: Map<string, Institucion> | null = null;

function institucionDeUnidad(unidad: string): Institucion | null {
  institucionPorUnidad ??= new Map(INSTITUCIONES.map((i) => [plano(i.nombre), i]));
  return institucionPorUnidad.get(plano(unidad)) ?? null;
}

const rutaInstitucion = (i: Institucion) => rutaDeNodo({ tipo: "institucion", id: String(i.id) });

/**
 * Las instituciones que nombra un texto: su id («/instituciones/5»), sus
 * siglas exactas («MOPC»), su nombre exacto o, si no, todas las que llevan
 * esas palabras («hospital» son todos los hospitales).
 */
function institucionesDe(texto: string): Institucion[] {
  const d = resolver(texto);
  if (d?.clase === "nodo" && d.nodo.tipo === "institucion") {
    const i = institucionPorId(d.nodo.id);
    if (!i) throw new Aviso(`No hay una institución con el id «${recortar(texto, 120)}».`);
    return [i];
  }
  const p = plano(texto);
  const siglas = INSTITUCIONES.filter((i) => i.acronimo && plano(i.acronimo) === p);
  if (siglas.length) return siglas;
  const exacto = INSTITUCIONES.filter((i) => plano(i.nombre) === p);
  if (exacto.length) return exacto;
  const a = agujas(texto);
  if (a.raices.length === 0 && a.numeros.length === 0) return [];
  return INSTITUCIONES.filter((i) => contieneTodas(plano(`${i.nombre} ${i.acronimo}`), a));
}

const ProcesoHallado = z.object({
  id: z.string().describe("Lo que se le pasa a fetch."),
  codigo: z.string(),
  title: z.string(),
  url: z.string().describe("La ficha del proceso: lee en vivo de la DGCP sus documentos, ofertas y adjudicación."),
  institucion: z.object({ id: z.string().nullable().describe("El nodo de la institución, para fetch o contracting_history."), nombre: z.string() }),
  modalidad: z.string(),
  estado: z.string().describe("La etapa el día del corte."),
  objeto: z.string().nullable(),
  fecha: z.string().describe("La fecha de publicación."),
  valorEstimado: z.number().nullable().describe("En pesos. null si no lo trae o está en otra moneda."),
});

const Suma = { procesos: z.number(), suma: z.number().describe("La suma de sus valores estimados, en pesos.") };

const Compras = z.object({
  filtros: z.object({
    texto: z.string().nullable(),
    institucion: z
      .object({ pedida: z.string(), instituciones: z.number(), nombres: z.array(z.string()).describe("Hasta diez de las que casaron.") })
      .nullable(),
    desde: z.string().nullable(),
    hasta: z.string().nullable(),
    estado: z.array(z.string()),
    modalidad: z.array(z.string()),
    objeto: z.string().nullable(),
    montoMinimo: z.number().nullable(),
    montoMaximo: z.number().nullable(),
    orden: z.enum(ORDENES_COMPRA),
  }),
  total: z.number().describe("Cuántos procesos cumplen los filtros: todos los de la instantánea, no una muestra."),
  conValor: z.number().describe("Cuántos de ellos traen valor estimado en pesos."),
  suma: z.number().describe("La suma de sus valores estimados, en pesos."),
  pagina: z.number(),
  paginas: z.number(),
  procesos: z.array(ProcesoHallado),
  porEstado: z.array(z.object({ estado: z.string(), ...Suma })),
  porInstitucion: z
    .array(z.object({ id: z.string().nullable(), nombre: z.string(), ...Suma }))
    .describe(`Las ${TOPE_POR_INSTITUCION} unidades de compra con más valor estimado entre los que cumplen los filtros.`),
  cobertura: z.object({
    desde: z.string(),
    hasta: z.string(),
    procesos: z.number().describe("Todos los procesos de la instantánea."),
  }),
  notas: z.array(z.string()).describe("Qué es y qué no es cada cifra, y lo que la instantánea no cubre de lo pedido."),
  fuente: z.string(),
  corte: z.string().nullable(),
  aviso: z.string(),
});

interface FiltrosCompras {
  texto?: string;
  institucion?: string;
  anio?: number;
  desde?: string;
  hasta?: string;
  estado?: ClaveEtapa[];
  modalidad?: ClaveModalidad[];
  objeto?: keyof typeof OBJETOS;
  montoMinimo?: number;
  montoMaximo?: number;
  orden?: (typeof ORDENES_COMPRA)[number];
  pagina?: number;
}

/** Los argumentos de `procurement` (en inglés, como los nombres de las herramientas) y su filtro en `compras`. */
const ARGUMENTOS_COMPRAS = {
  text: "texto",
  institution: "institucion",
  year: "anio",
  from: "desde",
  to: "hasta",
  status: "estado",
  method: "modalidad",
  category: "objeto",
  minAmount: "montoMinimo",
  maxAmount: "montoMaximo",
  sort: "orden",
  page: "pagina",
} as const satisfies Record<string, keyof FiltrosCompras>;
type ArgumentosCompras = { [K in keyof typeof ARGUMENTOS_COMPRAS]?: FiltrosCompras[(typeof ARGUMENTOS_COMPRAS)[K]] };

function filtrosDeCompras(a: ArgumentosCompras): FiltrosCompras {
  const f: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a)) if (v !== undefined) f[ARGUMENTOS_COMPRAS[k as keyof typeof ARGUMENTOS_COMPRAS]] = v;
  return f as FiltrosCompras;
}

/** Al revés: los filtros deducidos de una pregunta, como argumentos para volver a pedir `procurement`. */
function argumentosDeCompras(f: FiltrosCompras): ArgumentosCompras {
  const a: Record<string, unknown> = {};
  for (const [k, campo] of Object.entries(ARGUMENTOS_COMPRAS)) if (f[campo] !== undefined) a[k] = f[campo];
  return a as ArgumentosCompras;
}

/** La primera y la última publicación de la instantánea. */
let coberturaMemo: { procesos: ProcesoIndexado[]; desde: string; hasta: string } | null = null;

function coberturaDe(procesos: ProcesoIndexado[]): { desde: string; hasta: string } {
  if (coberturaMemo?.procesos !== procesos) {
    let desde = procesos[0].fecha;
    let hasta = procesos[0].fecha;
    for (const p of procesos) {
      if (p.fecha < desde) desde = p.fecha;
      if (p.fecha > hasta) hasta = p.fecha;
    }
    coberturaMemo = { procesos, desde, hasta };
  }
  return coberturaMemo;
}

const mayor = (a: string | null, b: string | null) => (a == null ? b : b == null ? a : a > b ? a : b);
const menor = (a: string | null, b: string | null) => (a == null ? b : b == null ? a : a < b ? a : b);

async function compras(f: FiltrosCompras): Promise<z.infer<typeof Compras>> {
  sinBuscarPorCedula(f.texto, f.institucion);
  const { procesos, corte } = await todosLosProcesos();
  if (procesos.length === 0) throw new Error("el índice no trae procesos de compra");
  const cobertura = coberturaDe(procesos);

  const texto = f.texto?.trim().slice(0, 200) || null;
  const alternativas = texto
    ? texto
        .split("|")
        .map((t) => agujas(t))
        .filter((a) => a.raices.length > 0 || a.numeros.length > 0)
    : [];
  if (texto && alternativas.length === 0) {
    throw new Aviso(`«${recortar(texto, 120)}» no trae palabras que buscar en la carátula: prueba con lo que se compra («mobiliario», «asfalto», «raciones»).`);
  }

  let unidades: Set<string> | null = null;
  let elegidas: Institucion[] = [];
  const pedida = f.institucion?.trim().slice(0, 200) || null;
  if (pedida) {
    elegidas = institucionesDe(pedida);
    if (elegidas.length === 0) {
      throw new Aviso(`Ninguna institución se llama «${recortar(pedida, 120)}». Usa sus siglas («MOPC»), palabras de su nombre o el id que da search («/instituciones/5»).`);
    }
    unidades = new Set(elegidas.map((i) => plano(i.nombre)));
  }

  const desde = mayor(f.desde ?? null, f.anio != null ? `${f.anio}-01-01` : null);
  const hasta = menor(f.hasta ?? null, f.anio != null ? `${f.anio}-12-31` : null);
  if (desde && hasta && desde > hasta) throw new Aviso(`El período pedido está vacío: empieza el ${desde} y termina el ${hasta}.`);
  const etapas = f.estado?.length ? new Set<string>(f.estado.map((e) => ETAPAS[e])) : null;
  const modalidades = f.modalidad?.length ? new Set<string>(f.modalidad.map((m) => MODALIDADES[m])) : null;
  const objeto = f.objeto ? OBJETOS[f.objeto] : null;
  const minimo = f.montoMinimo ?? null;
  const maximo = f.montoMaximo ?? null;
  const orden = f.orden ?? "monto";

  // Las unidades son unas setecientas: su forma plana se calcula una vez por consulta.
  const planoDe = new Map<string, string>();
  const unidadPlana = (u: string) => {
    let v = planoDe.get(u);
    if (v === undefined) planoDe.set(u, (v = plano(u)));
    return v;
  };

  const lista: ProcesoIndexado[] = [];
  let conValor = 0;
  let suma = 0;
  const porEstado = new Map<string, { procesos: number; suma: number }>();
  const porUnidad = new Map<string, { procesos: number; suma: number }>();
  for (const p of procesos) {
    if (desde && p.fecha < desde) continue;
    if (hasta && p.fecha > hasta) continue;
    if (etapas && !etapas.has(p.etapa)) continue;
    if (modalidades && !modalidades.has(p.modalidad)) continue;
    if (objeto && p.objeto !== objeto) continue;
    if (minimo != null && (p.valor ?? -1) < minimo) continue;
    if (maximo != null && (p.valor == null || p.valor > maximo)) continue;
    if (unidades && !unidades.has(unidadPlana(p.unidad))) continue;
    if (alternativas.length && !alternativas.some((a) => contieneTodas(planoTitulo(p), a))) continue;
    lista.push(p);
    const v = p.valor ?? 0;
    if (p.valor != null) conValor++;
    suma += v;
    for (const [mapa, clave] of [
      [porEstado, p.etapa],
      [porUnidad, p.unidad],
    ] as const) {
      const g = mapa.get(clave) ?? { procesos: 0, suma: 0 };
      g.procesos++;
      g.suma += v;
      mapa.set(clave, g);
    }
  }

  const valor = (p: ProcesoIndexado) => p.valor ?? -1;
  const comparar: Record<(typeof ORDENES_COMPRA)[number], (a: ProcesoIndexado, b: ProcesoIndexado) => number> = {
    monto: (a, b) => valor(b) - valor(a) || b.fecha.localeCompare(a.fecha),
    // Los que no traen valor, al final también de menor a mayor.
    monto_asc: (a, b) => (a.valor == null ? 1 : 0) - (b.valor == null ? 1 : 0) || valor(a) - valor(b) || b.fecha.localeCompare(a.fecha),
    fecha: (a, b) => b.fecha.localeCompare(a.fecha) || valor(b) - valor(a),
    fecha_asc: (a, b) => a.fecha.localeCompare(b.fecha) || valor(b) - valor(a),
  };
  lista.sort(comparar[orden]);

  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA_COMPRAS));
  // Una página más allá de la última viene vacía, no repite la última: quien
  // pagina «hasta que no haya más» termina.
  const pagina = Math.max(1, f.pagina ?? 1);

  const notas = [NOTA_VALOR, NOTA_ADJUDICATARIO];
  if (corte) notas.push(`El estado de cada proceso es el que tenía al leerse la tabla, cuya última publicación es del ${corte.slice(0, 10)}: no es el de hoy.`);
  if ((desde && desde < cobertura.desde) || (hasta && hasta > cobertura.hasta)) {
    notas.push(
      `La instantánea cubre lo publicado del ${cobertura.desde} al ${cobertura.hasta}: lo pedido fuera de esas fechas no está aquí, y un total del período no es el del año entero. Para años anteriores, contracting_history (lo contratado desde 2015, agregado).`,
    );
  }
  if (orden.startsWith("monto") && lista.length > conValor) {
    notas.push(`${ENTERO.format(lista.length - conValor)} de los que cumplen los filtros no traen valor en pesos (otra moneda o sin estimar): van al final.`);
  }
  if (elegidas.length > 1) {
    notas.push(`«${recortar(pedida!, 80)}» casa con ${ENTERO.format(elegidas.length)} instituciones: se cuentan todas juntas. Para una sola, usa su id.`);
  }

  const aHallado = (p: ProcesoIndexado): z.infer<typeof ProcesoHallado> => {
    const ruta = enlace.proceso(p.codigo);
    const i = institucionDeUnidad(p.unidad);
    return {
      id: ruta,
      codigo: p.codigo,
      title: desdeMayusculas(p.titulo),
      url: absoluta(ruta),
      institucion: { id: i ? rutaInstitucion(i) : null, nombre: p.unidad },
      modalidad: p.modalidad,
      estado: p.etapa,
      objeto: p.objeto,
      fecha: p.fecha,
      valorEstimado: p.valor,
    };
  };

  return {
    filtros: {
      texto,
      institucion: pedida
        ? { pedida, instituciones: elegidas.length, nombres: elegidas.slice(0, 10).map((i) => i.nombre) }
        : null,
      desde,
      hasta,
      estado: f.estado?.map((e) => ETAPAS[e]) ?? [],
      modalidad: f.modalidad?.map((m) => MODALIDADES[m]) ?? [],
      objeto,
      montoMinimo: minimo,
      montoMaximo: maximo,
      orden,
    },
    total: lista.length,
    conValor,
    suma,
    pagina,
    paginas,
    procesos: lista.slice((pagina - 1) * POR_PAGINA_COMPRAS, pagina * POR_PAGINA_COMPRAS).map(aHallado),
    porEstado: [...porEstado].map(([estado, g]) => ({ estado, ...g })).sort((a, b) => b.procesos - a.procesos),
    porInstitucion: [...porUnidad]
      .sort((a, b) => b[1].suma - a[1].suma || b[1].procesos - a[1].procesos)
      .slice(0, TOPE_POR_INSTITUCION)
      .map(([nombre, g]) => {
        const i = institucionDeUnidad(nombre);
        return { id: i ? rutaInstitucion(i) : null, nombre, ...g };
      }),
    cobertura: { desde: cobertura.desde, hasta: cobertura.hasta, procesos: procesos.length },
    notas,
    fuente: FUENTE_PROCESOS,
    corte: corte?.slice(0, 10) ?? null,
    aviso: AVISO,
  };
}

/** Un proceso del índice por su código, para `fetch`. */
let procesoPorCodigo: { procesos: ProcesoIndexado[]; mapa: Map<string, ProcesoIndexado> } | null = null;

async function procesoDelIndice(codigo: string): Promise<ProcesoIndexado | null> {
  const { procesos } = await todosLosProcesos();
  if (procesoPorCodigo?.procesos !== procesos) procesoPorCodigo = { procesos, mapa: new Map(procesos.map((p) => [p.codigo, p])) };
  return procesoPorCodigo.mapa.get(codigo) ?? null;
}

/* ---------------------------------------------------- contracting_history */

const FUENTE_HISTORICO = "Tablas de contratos y procesos de los datos abiertos de la DGCP, desde 2015";

const NOTAS_HISTORICO = [
  "Valor contratado (adjudicado) en pesos, por año de adjudicación: no es lo pagado. Sin contratos cancelados ni en otras monedas.",
  "Un contrato de RD$ 10 mil millones o más no se suma: se cuenta aparte como atípico, porque varios son errores de captura evidentes.",
  "La institución de un contrato se deduce del prefijo de su código; lo que no se puede asignar sin adivinar (casi todo del MOPC, cuyo prefijo comparte la OPRET) queda fuera de las series por institución.",
];

const Contraparte = z.object({
  id: z.string().nullable().describe("Lo que se le pasa a fetch (o a contracting_history)."),
  nombre: z.string(),
  contratos: z.number(),
  monto: z.number().describe("Valor contratado en pesos."),
});

const Anio = z.object({
  anio: z.number(),
  contratos: z.number(),
  monto: z.number(),
  parcial: z.boolean().describe("El año del corte: va hasta la última adjudicación del registro, no está entero."),
});
const Atipicos = z.object({ contratos: z.number(), monto: z.number() }).nullable().describe("Sus contratos de RD$ 10 mil millones o más, fuera de las sumas.");

const Historial = z.object({
  alcance: z.enum(["pais", "proveedor", "institucion", "par"]),
  proveedor: z
    .object({
      id: z.string(),
      rpe: z.string(),
      nombre: z.string(),
      rnc: z.string().nullable(),
      empresa: z.string().nullable().describe("Su nodo en el padrón de la DGII, si tiene RNC de empresa."),
      url: z.string(),
      desde: z.string(),
      hasta: z.string(),
      contratos: z.number(),
      monto: z.number(),
      serie: z.array(Anio),
      mayoresClientes: z.array(Contraparte).describe("Las instituciones que más le contrataron, hasta ocho."),
      clientes: z.number().describe("Cuántas instituciones distintas le contrataron."),
      atipicos: Atipicos,
    })
    .nullable(),
  institucion: z
    .object({
      id: z.string(),
      nombre: z.string(),
      siglas: z.string().nullable(),
      url: z.string(),
      contratos: z.number(),
      monto: z.number(),
      serie: z.array(Anio.extend({ procesos: z.number().describe("Procesos que publicó ese año.") })),
      mayoresProveedores: z.array(Contraparte),
      proveedores: z.number().describe("Cuántos proveedores distintos le contrataron."),
      atipicos: Atipicos,
      sinAsignar: z.string().nullable().describe("Si sus contratos comparten prefijo con otra unidad y por eso no se le asignan."),
    })
    .nullable(),
  par: z
    .object({ encontrado: z.boolean(), contratos: z.number().nullable(), monto: z.number().nullable(), explicacion: z.string() })
    .nullable()
    .describe("Lo que la institución le contrató al proveedor, si los dos se pidieron."),
  pais: z
    .object({
      serie: z.array(Anio.extend({ procesos: z.number(), excepcion: z.number().describe("Procesos por alguna vía de excepción.") })),
      contratos: z.number(),
      monto: z.number(),
      mayoresProveedores: z.array(Contraparte).describe("Una página de los cien proveedores con más valor contratado en todo el período."),
      mayoresInstituciones: z.array(Contraparte).describe("Las veinticinco unidades de compra con más valor contratado."),
      pagina: z.number(),
      paginas: z.number(),
      atipicos: z.object({ contratos: z.number(), monto: z.number() }),
      sinAsignar: z.array(z.object({ prefijo: z.string(), contratos: z.number(), monto: z.number() })),
    })
    .nullable(),
  notas: z.array(z.string()),
  fuente: z.string(),
  corte: z.string().describe("La última fecha de adjudicación del registro."),
  aviso: z.string(),
});

const POR_PAGINA_HISTORICO = 25;

/** Lo que en una razón social no es el nombre. */
const FORMAS_JURIDICAS = new Set(["srl", "sa", "sas", "eirl", "cxa", "spa", "ltda", "inc", "s", "a", "c", "x", "por"]);

/**
 * El proveedor que nombra un texto: su id («/proveedores/1211»), su RPE, su
 * RNC de nueve cifras o su nombre. Si el nombre es de varios, el aviso los
 * nombra para que se pida con el id.
 */
async function proveedorDe(texto: string): Promise<ProveedorIndexado> {
  const { proveedores } = await todosLosProveedores();
  const t = texto.trim();
  const porRpe = (rpe: string) =>
    proveedores.find((p) => p.rpe === rpe) ??
    ({ rpe, nombre: `RPE ${rpe}`, rnc: null, contratos: null, desde: null, hasta: null } satisfies ProveedorIndexado);
  let m: RegExpExecArray | null;
  if ((m = /^(?:https?:\/\/[^/]+)?\/proveedores\/(\d{1,10})\/?$/.exec(t)) || (m = /^rpe\s*:?\s*(\d{1,10})$/i.exec(t))) return porRpe(m[1]);
  const cifras = t.replace(/^(?:https?:\/\/[^/]+)?\/empresas\//, "").replace(/[\s.-]/g, "");
  if (/^\d{11}$/.test(cifras)) {
    throw new Aviso("Once cifras pueden ser una cédula, y este servidor no busca por ella: usa el nombre del proveedor o su RPE.");
  }
  if (/^\d{9}$/.test(cifras)) {
    const conRnc = proveedores.filter((p) => p.rnc === cifras).sort((a, b) => (b.contratos ?? 0) - (a.contratos ?? 0));
    if (conRnc.length === 0) {
      throw new Aviso(`El RNC ${cifras} no figura entre los proveedores del índice (los que tienen contratos desde 2015). Que no esté no prueba que no exista: búscalo con search.`);
    }
    if (conRnc.length > 1) {
      const lista = conRnc.map((p) => `${p.nombre} (RPE ${p.rpe}${p.contratos ? `, ${ENTERO.format(p.contratos)} contratos` : ""}) → ${enlace.proveedor(p.rpe)}`).join("; ");
      throw new Aviso(`El RNC ${cifras} tiene ${conRnc.length} registros de proveedor, y la historia se lleva por registro: ${lista}. Pide cada uno con su id.`);
    }
    return conRnc[0];
  }
  if (/^\d{1,8}$/.test(cifras)) return porRpe(cifras);

  const a = agujas(t);
  if (a.raices.length === 0 && a.numeros.length === 0) throw new Aviso(`«${recortar(t, 120)}» no nombra a un proveedor: usa su nombre, su RNC o su RPE.`);
  const candidatos = proveedores.filter((p) => contieneTodas(planoNombre(p), a));
  // El nombre exacto, sin la forma jurídica: «Viamar» es «Viamar, SA», pero
  // «Constructora» no es «E&Y Constructora, SRL».
  const clave = (x: string) =>
    plano(x)
      .trim()
      .split(" ")
      .filter((w) => !FORMAS_JURIDICAS.has(w))
      .join(" ");
  const exactos = candidatos.filter((p) => clave(p.nombre) === clave(t));
  const porContratos = (x: ProveedorIndexado[]) => [...x].sort((p, q) => (q.contratos ?? 0) - (p.contratos ?? 0));
  if (exactos.length === 1) return exactos[0];
  // Dos proveedores con el mismo nombre pueden ser dos personas o dos empresas
  // distintas: no se elige por quien pregunta.
  if (exactos.length === 0 && candidatos.length === 1) return candidatos[0];
  const dudosos = exactos.length > 1 ? exactos : candidatos;
  if (candidatos.length === 0) {
    throw new Aviso(`Ningún proveedor del Estado se llama «${recortar(t, 120)}» en el índice. Búscalo con search (tipo proveedor) y usa su id.`);
  }
  const lista = porContratos(dudosos)
    .slice(0, 8)
    .map((p) => `${p.nombre} (RPE ${p.rpe}${p.rnc ? `, RNC ${p.rnc}` : ""}${p.contratos ? `, ${ENTERO.format(p.contratos)} contratos` : ""}) → ${enlace.proveedor(p.rpe)}`)
    .join("; ");
  throw new Aviso(
    `Hay ${ENTERO.format(dudosos.length)} proveedores que se llaman así${exactos.length > 1 ? ", con registros distintos: pueden ser personas o empresas distintas" : ""}: ${lista}. Pide de nuevo con el id del que buscas.`,
  );
}

/** Una sola institución: la que nombra el texto, o el aviso con las que casan. */
function institucionUnica(texto: string): Institucion {
  const todas = institucionesDe(texto);
  if (todas.length === 1) return todas[0];
  if (todas.length === 0) {
    throw new Aviso(`Ninguna institución se llama «${recortar(texto, 120)}». Usa sus siglas («MOPC»), su nombre o el id que da search («/instituciones/5»).`);
  }
  const lista = todas
    .slice(0, 8)
    .map((i) => `${i.nombre}${i.acronimo ? ` (${i.acronimo})` : ""} → ${rutaInstitucion(i)}`)
    .join("; ");
  throw new Aviso(`«${recortar(texto, 80)}» casa con ${ENTERO.format(todas.length)} instituciones: ${lista}. Pide de nuevo con el id de una.`);
}

const contraparteInstitucion = ([uc, contratos, monto]: [number, number, number]): z.infer<typeof Contraparte> => {
  const i = institucionPorId(uc);
  return { id: i ? rutaInstitucion(i) : null, nombre: i?.nombre ?? `Unidad de compra ${uc}`, contratos, monto };
};

async function historial(pedido: { proveedor?: string; institucion?: string; pagina?: number }): Promise<z.infer<typeof Historial>> {
  sinBuscarPorCedula(pedido.proveedor, pedido.institucion);
  const resumen = await getResumenHistorico();
  if (!resumen) throw new Error("historico/resumen.json no cargó");
  // Lo que la serie no es (como lo dice `/historico`): ni la subida de los
  // primeros años es gasto nuevo, ni el año del corte está entero.
  const anioCorte = Number(resumen.corte.slice(0, 4));
  const notas = [
    ...NOTAS_HISTORICO,
    "El sistema arrancó en 2015 con pocas instituciones y fue sumando las demás hasta 2018: la subida de esos años es sobre todo cobertura, no gasto nuevo.",
    `${anioCorte} va hasta el ${resumen.corte} (parcial en la serie): no se compara con un año entero.`,
  ];
  const base = { fuente: FUENTE_HISTORICO, corte: resumen.corte, aviso: AVISO };

  const textoProveedor = pedido.proveedor?.trim().slice(0, 200) || null;
  const textoInstitucion = pedido.institucion?.trim().slice(0, 200) || null;

  if (!textoProveedor && !textoInstitucion) {
    const paginas = Math.max(1, Math.ceil(resumen.proveedores.length / POR_PAGINA_HISTORICO));
    const pagina = Math.min(Math.max(1, pedido.pagina ?? 1), paginas);
    const suma = <K extends "contratos" | "monto">(k: K) => resumen.anios.reduce((s, a) => s + a[k], 0);
    const atipicos = { contratos: resumen.atipicos.length, monto: resumen.atipicos.reduce((s, a) => s + a.valor, 0) };
    return {
      alcance: "pais",
      proveedor: null,
      institucion: null,
      par: null,
      pais: {
        serie: resumen.anios.map((a) => ({
          anio: a.anio,
          contratos: a.contratos,
          monto: a.monto,
          parcial: a.anio === anioCorte,
          procesos: a.procesos,
          excepcion: a.excepcion,
        })),
        contratos: suma("contratos"),
        monto: suma("monto"),
        mayoresProveedores: resumen.proveedores
          .slice((pagina - 1) * POR_PAGINA_HISTORICO, pagina * POR_PAGINA_HISTORICO)
          .map((p) => ({ id: enlace.proveedor(p.rpe), nombre: p.nombre, contratos: p.contratos, monto: p.monto })),
        mayoresInstituciones: resumen.instituciones.slice(0, 25).map((i) => {
          const c = contraparteInstitucion([i.uc, i.contratos, i.monto]);
          return { ...c, nombre: i.nombre };
        }),
        pagina,
        paginas,
        atipicos,
        sinAsignar: resumen.sinAsignar.map((s) => ({ prefijo: s.prefijo, contratos: s.contratos, monto: s.monto })),
      },
      notas,
      ...base,
    };
  }

  let proveedor: z.infer<typeof Historial>["proveedor"] = null;
  let clientes: [number, number, number][] = [];
  if (textoProveedor) {
    const p = await proveedorDe(textoProveedor);
    const h = await historiaDeProveedor(p.rpe);
    if (!h) {
      throw new Aviso(
        `${p.nombre} (RPE ${p.rpe}) no tiene contratos en la instantánea histórica de la DGCP (corte del ${resumen.corte}). Que no los tenga ahí no prueba que no los haya: su ficha, ${absoluta(enlace.proveedor(p.rpe))}, lee su registro en vivo.`,
      );
    }
    const { historia } = h;
    clientes = historia.clientes;
    proveedor = {
      id: enlace.proveedor(p.rpe),
      rpe: p.rpe,
      nombre: historia.nombre,
      rnc: p.rnc,
      empresa: p.rnc ? enlace.empresa(p.rnc) : null,
      url: absoluta(enlace.proveedor(p.rpe)),
      desde: historia.desde,
      hasta: historia.hasta,
      contratos: historia.serie.reduce((s, f) => s + f[1], 0),
      monto: historia.serie.reduce((s, f) => s + f[2], 0),
      serie: historia.serie.map(([anio, contratos, monto]) => ({ anio, contratos, monto, parcial: anio === anioCorte })),
      mayoresClientes: historia.clientes.map(contraparteInstitucion),
      clientes: historia.totalClientes,
      atipicos: historia.atipicos ? { contratos: historia.atipicos[0], monto: historia.atipicos[1] } : null,
    };
  }

  let institucion: z.infer<typeof Historial>["institucion"] = null;
  let top: [string, string, number, number][] = [];
  if (textoInstitucion) {
    const i = institucionUnica(textoInstitucion);
    if (!i.dgcp) {
      throw new Aviso(
        `${i.nombre} no tiene unidad de compra en el catálogo de la DGCP, así que el registro de compras no le asigna contratos. Que no estén aquí no prueba que no compre: puede hacerlo fuera de ese sistema.`,
      );
    }
    const h = await historiaDeInstitucion(i.id);
    const serie = h?.historia.serie ?? [];
    // El prefijo compartido explica una serie vacía; la OPRET lo comparte con
    // el MOPC y sí tiene la suya (como la ficha, `app/instituciones/[id]`).
    const sinAsignar = serie.some((f) => f[1] > 0) ? null : await prefijoSinAsignar(i.nombre);
    top = h?.historia.top ?? [];
    const explicacion = sinAsignar
      ? `Sus contratos comparten el prefijo «${sinAsignar.prefijo}» con ${sinAsignar.unidades.filter((u) => plano(u) !== plano(i.nombre)).join(" y ") || "otra unidad"}: los ${ENTERO.format(sinAsignar.contratos)} contratos de ese prefijo (RD$ ${ENTERO.format(sinAsignar.monto)}) no se le asignan sin adivinar, y su serie de contratos sale vacía. Sus procesos sí se cuentan.`
      : null;
    if (explicacion) notas.push(explicacion);
    institucion = {
      id: rutaInstitucion(i),
      nombre: i.nombre,
      siglas: i.acronimo || null,
      url: absoluta(enlace.institucion(i.id, i.acronimo || i.nombre)),
      contratos: serie.reduce((s, f) => s + f[1], 0),
      monto: serie.reduce((s, f) => s + f[2], 0),
      serie: serie.map(([anio, contratos, monto, procesos]) => ({ anio, contratos, monto, parcial: anio === anioCorte, procesos })),
      mayoresProveedores: top.map(([rpe, nombre, contratos, monto]) => ({ id: enlace.proveedor(rpe), nombre, contratos, monto })),
      proveedores: h?.historia.proveedores ?? 0,
      atipicos: h?.historia.atipicos ? { contratos: h.historia.atipicos[0], monto: h.historia.atipicos[1] } : null,
      sinAsignar: explicacion,
    };
  }

  let par: z.infer<typeof Historial>["par"] = null;
  if (proveedor && institucion?.sinAsignar) {
    par = {
      encontrado: false,
      contratos: null,
      monto: null,
      explicacion: `Los contratos de ${institucion.nombre} no se le asignan sin adivinar (comparten prefijo con otra unidad), así que lo que le contrató a ${proveedor.nombre} no se puede leer de esta instantánea. La ficha del proveedor lee su registro en vivo.`,
    };
  } else if (proveedor && institucion) {
    const uc = Number(nodoDeRuta(institucion.id)?.id);
    const desdeProveedor = clientes.find(([c]) => c === uc);
    const desdeInstitucion = top.find(([rpe]) => rpe === proveedor.rpe);
    const fila = desdeProveedor ? { contratos: desdeProveedor[1], monto: desdeProveedor[2] } : desdeInstitucion ? { contratos: desdeInstitucion[2], monto: desdeInstitucion[3] } : null;
    par = fila
      ? {
          encontrado: true,
          ...fila,
          explicacion: `Lo que ${institucion.nombre} le contrató a ${proveedor.nombre} desde 2015, según la instantánea histórica.`,
        }
      : {
          encontrado: false,
          contratos: null,
          monto: null,
          explicacion: `${institucion.nombre} no está entre los ${clientes.length} mayores clientes de ${proveedor.nombre}, ni ${proveedor.nombre} entre los ${top.length} mayores proveedores de ${institucion.nombre}: la instantánea agregada no guarda cada par, así que no se puede decir cuánto le contrató (puede ser poco o nada). La ficha del proveedor lee su registro en vivo.`,
        };
  }

  return {
    alcance: proveedor && institucion ? "par" : proveedor ? "proveedor" : "institucion",
    proveedor,
    institucion,
    par,
    pais: null,
    notas,
    ...base,
  };
}

/* ---------------------------------------------------- compras dentro de fetch */

interface Seccion {
  lineas: string[];
  metadata: Record<string, unknown>;
}

/** Cuántos procesos publicó cada unidad de compra en la instantánea, y por cuánto, por su nombre plano. */
let porUnidadMemo: { procesos: ProcesoIndexado[]; mapa: Map<string, { procesos: number; suma: number }> } | null = null;

function publicadoPorUnidad(procesos: ProcesoIndexado[]): Map<string, { procesos: number; suma: number }> {
  if (porUnidadMemo?.procesos !== procesos) {
    const mapa = new Map<string, { procesos: number; suma: number }>();
    const planos = new Map<string, string>();
    for (const p of procesos) {
      let k = planos.get(p.unidad);
      if (k === undefined) planos.set(p.unidad, (k = plano(p.unidad)));
      const g = mapa.get(k) ?? { procesos: 0, suma: 0 };
      g.procesos++;
      g.suma += p.valor ?? 0;
      mapa.set(k, g);
    }
    porUnidadMemo = { procesos, mapa };
  }
  return porUnidadMemo.mapa;
}

/** Lo que compra una institución: lo contratado desde 2015 y lo publicado en el último año, con las herramientas que lo abren. */
async function comprasDeInstitucion(i: Institucion): Promise<Seccion | null> {
  if (!i.dgcp) return null;
  const id = rutaInstitucion(i);
  const [h, resumen, { procesos, corte }] = await Promise.all([historiaDeInstitucion(i.id), getResumenHistorico(), todosLosProcesos()]);
  const serie = h?.historia.serie ?? [];
  const sinAsignar = serie.some((f) => f[1] > 0) ? null : await prefijoSinAsignar(i.nombre);
  const contratos = serie.reduce((s, f) => s + f[1], 0);
  const monto = serie.reduce((s, f) => s + f[2], 0);
  const publicado = publicadoPorUnidad(procesos).get(plano(i.nombre)) ?? { procesos: 0, suma: 0 };
  const cobertura = procesos.length ? coberturaDe(procesos) : null;
  const lineas = ["", "## Compras públicas (DGCP)"];
  if (sinAsignar) {
    lineas.push(
      `- Contratado desde 2015: no se le asigna sin adivinar. Sus contratos comparten el prefijo «${sinAsignar.prefijo}» con otra unidad; los ${ENTERO.format(sinAsignar.contratos)} de ese prefijo suman RD$ ${ENTERO.format(sinAsignar.monto)} (tablas de contratos de la DGCP, corte del ${resumen?.corte ?? "?"}).`,
    );
  } else if (contratos > 0) {
    lineas.push(
      `- Contratado desde 2015: RD$ ${ENTERO.format(monto)} en ${ENTERO.format(contratos)} contratos con ${ENTERO.format(h?.historia.proveedores ?? 0)} proveedores (valor contratado, no pagado; tablas de contratos de la DGCP, corte del ${resumen?.corte ?? "?"}).`,
    );
  } else {
    lineas.push(`- Contratado desde 2015: la instantánea histórica de la DGCP no le registra contratos (corte del ${resumen?.corte ?? "?"}).`);
  }
  if (cobertura) {
    lineas.push(
      `- Procesos publicados del ${cobertura.desde} al ${cobertura.hasta}: ${ENTERO.format(publicado.procesos)}, por RD$ ${ENTERO.format(publicado.suma)} estimados (tabla de procesos de la DGCP, instantánea del ${corte?.slice(0, 10) ?? "?"}).`,
    );
  }
  lineas.push(`- Por año y por proveedor: contracting_history con institution «${id}». Proceso por proceso, por monto o por fecha: procurement con institution «${id}».`);
  return {
    lineas,
    metadata: {
      compras: {
        contratado: sinAsignar ? null : { contratos, monto, corte: resumen?.corte ?? null },
        publicadoUltimoAnio: { procesos: publicado.procesos, sumaEstimada: publicado.suma, desde: cobertura?.desde ?? null, hasta: cobertura?.hasta ?? null },
      },
    },
  };
}

/** Lo que el Estado le ha contratado a un proveedor desde 2015, en corto, con la herramienta que da el resto. */
async function comprasDeProveedor(rpe: string): Promise<Seccion | null> {
  const [h, resumen] = await Promise.all([historiaDeProveedor(rpe), getResumenHistorico()]);
  if (!h) return null;
  const { historia } = h;
  const contratos = historia.serie.reduce((s, f) => s + f[1], 0);
  const monto = historia.serie.reduce((s, f) => s + f[2], 0);
  const id = enlace.proveedor(rpe);
  const corte = resumen?.corte ?? h.corte;
  const lineas = [
    "",
    "## Contratado con el Estado desde 2015",
    `- RD$ ${ENTERO.format(monto)} en ${ENTERO.format(contratos)} contratos, del ${historia.desde} al ${historia.hasta}, con ${ENTERO.format(historia.totalClientes)} instituciones (valor contratado, no pagado; tablas de contratos de la DGCP, corte del ${corte}).`,
    `- Por año (contratos entre paréntesis): ${historia.serie
      .map(([anio, n, m]) => `${anio}${corte && anio === Number(corte.slice(0, 4)) ? ` hasta el ${corte}` : ""}, RD$ ${ENTERO.format(m)} (${ENTERO.format(n)})`)
      .join("; ")}.`,
    `- Sus mayores clientes: ${historia.clientes
      .slice(0, 5)
      .map((c) => {
        const x = contraparteInstitucion(c);
        return `${x.nombre}, RD$ ${ENTERO.format(x.monto)} en ${ENTERO.format(x.contratos)} contratos${x.id ? ` → ${x.id}` : ""}`;
      })
      .join("; ")}.`,
  ];
  if (historia.atipicos) {
    lineas.push(`- Fuera de las sumas: ${ENTERO.format(historia.atipicos[0])} contratos atípicos de RD$ 10 mil millones o más, por RD$ ${ENTERO.format(historia.atipicos[1])} (varios son errores de captura).`);
  }
  lineas.push(`- Completo, y lo que le contrató una institución: contracting_history con supplier «${id}».`);
  return { lineas, metadata: { contratado: { contratos, monto, desde: historia.desde, hasta: historia.hasta, corte } } };
}

/** Lo que el índice sabe de un proceso además de su resumen, y lo que no trae. */
async function detalleDeProceso(codigo: string): Promise<Seccion | null> {
  const [p, { corte }] = await Promise.all([procesoDelIndice(codigo), todosLosProcesos()]);
  if (!p) return null;
  const i = institucionDeUnidad(p.unidad);
  const dia = corte?.slice(0, 10) ?? null;
  const lineas = [
    "",
    "## El proceso",
    `- Código: ${p.codigo}`,
    `- Modalidad: ${p.modalidad}`,
    `- Estado en la instantánea${dia ? ` (publicaciones hasta el ${dia})` : ""}: ${p.etapa}`,
    ...(p.objeto ? [`- Objeto: ${p.objeto}`] : []),
    ...(i ? [`- La institución, como nodo del grafo: ${rutaInstitucion(i)}`] : []),
    "",
    "## Lo que esta instantánea no trae",
    NOTA_ADJUDICATARIO,
    NOTA_VALOR,
  ];
  return {
    lineas,
    metadata: {
      codigo: p.codigo,
      modalidad: p.modalidad,
      estado: p.etapa,
      objeto: p.objeto,
      valorEstimado: p.valor,
      institucion: i ? rutaInstitucion(i) : null,
    },
  };
}

/* ---------------------------------------------------------------- retrieve */

/**
 * La recuperación para un asistente (RAG sobre el grafo, «GraphRAG»): una
 * pregunta en llano entra, y sale la evidencia con la que contestarla, cada
 * pieza con su fuente, su fecha y su dirección. No genera la respuesta —eso
 * lo hace el asistente, que es quien tiene el modelo—; junta en una llamada
 * lo que antes pedía cinco:
 *
 *  1. el buscador híbrido de la plataforma (`buscarEnTodo`: BM25 propio más
 *     el tema por Model2Vec, abierto), que trae registros de toda vertical;
 *  2. las entidades del grafo que la pregunta nombra (por siglas exactas, por
 *     los resultados que son nodos, por nombre), con sus datos, sus
 *     relaciones y sus compras;
 *  3. la consulta de compras que la pregunta pide, si pide una («la mayor»,
 *     «las abiertas», «las del MINERD en 2026»), corrida de verdad con los
 *     filtros que se deducen y que se dicen;
 *  4. la pantalla de la plataforma que la responde, y las llamadas exactas
 *     para seguir.
 */

const Evidencia = z.object({
  id: z.string().nullable().describe("Lo que abre fetch, si lo abre."),
  clase: z.string(),
  titulo: z.string(),
  texto: z.string().describe("El dato con su fuente y su fecha: lo que se cita."),
  url: z.string(),
  por: z.string().describe("Por qué salió: sus palabras, su tema, o la consulta de compras que se corrió."),
});

const EntidadRecuperada = z.object({
  id: z.string(),
  titulo: z.string(),
  clase: z.string(),
  url: z.string(),
  por: z.string().describe("Cómo se ató a la pregunta."),
  hechos: z.array(z.string()),
  relaciones: z.array(z.string()).describe("Hasta cinco por grupo, cada una con el id de su otro extremo."),
  compras: z.array(z.string()),
});

const Siguiente = z.object({
  herramienta: z.string(),
  argumentos: z.record(z.string(), z.unknown()),
  para: z.string(),
});

const Recuperado = z.object({
  pregunta: z.string(),
  entidades: z.array(EntidadRecuperada),
  evidencias: z.array(Evidencia),
  compras: z
    .object({
      filtros: z.record(z.string(), z.unknown()),
      deducidos: z.string().describe("Qué filtros se leyeron de la pregunta, para corregirlos si no son esos."),
      total: z.number(),
      suma: z.number(),
      notas: z.array(z.string()),
    })
    .nullable()
    .describe("La consulta de procurement que la pregunta pedía, si pedía una."),
  pantallas: z.array(z.object({ titulo: z.string(), url: z.string(), texto: z.string() })),
  siguientes: z.array(Siguiente).describe("Las llamadas exactas para seguir o ampliar."),
  notas: z.array(z.string()),
  aviso: z.string(),
});

/** Lo que una pregunta pide, leído en su forma plana con reglas fijas. */
const INTENCION = {
  compras: / (compr(a|as|o|e|an|aron|ado|ados|ada|adas)|licitacion(es)?|adquisicion(es)?|adquiri(o|eron)?|procesos?|suministros?|contratacion(es)?|oportunidad(es)?|obras?) /,
  mayor: / (mas grandes?|mayor(es)?|mas caras?|mas costos[ao]s?|top|monto) /,
  reciente: / (recientes?|ultim[ao]s?|nuev[ao]s?) /,
  abierta: / (abiert[ao]s?|vigentes?|convocatorias?|oportunidad(es)?) /,
  contratado: / (contratad[ao]|le (ha )?(comprado|contratado|pagado)|proveedor(es)?|cobrad[ao]) /,
  dirige: / (quien dirige|dirige|ministr[ao]|director[a]?|titular|encabeza) /,
  decretos: / (decretos?|firm[oó]|firmados?) /,
  vinculo: / (relacion(a|es)?|vincul[ao]s?|vinculad[ao]|conect[ao]|conectad[ao]|lig[ao]|ligad[ao]|camino) /,
} as const;

/** Palabras de una pregunta de compras que dicen la intención, no lo que se compra. */
const NO_ES_OBJETO = new Set(
  "compra compras compro compraron compran comprado comprada adquirio adquirieron licitacion licitaciones adquisicion adquisiciones proceso procesos suministro contratacion contrataciones oportunidad oportunidades mayor mayores grande grandes caro cara caros caras costoso costosa top monto montos reciente recientes ultima ultimas ultimo ultimos nueva nuevas nuevo nuevos abierta abiertas abierto abiertos vigente vigentes convocatoria convocatorias publica publicas publico publicos estado gobierno republica dominicana pais ano anos hoy cual cuales cuanto cuantos cuanta cuantas dame lista busca buscar quiero saber alcover".split(" "),
);

const TOPE_RECUPERAR = { entidades: 3, evidencias: 10, compras: 5, relacionesPorGrupo: 5, hechos: 12, nombres: 3 } as const;

/** Lo que una pregunta escribe con mayúscula y no es un nombre: la palabra que la abre, o el Estado mismo. */
const INTERROGATIVA = /^(qu[eé]|qui[eé]n(es)?|cu[aá]l(es)?|cu[aá]nt[oa]s?|d[oó]nde|c[oó]mo|cu[aá]ndo|por|dame|dime|lista|busca|hay|existe|existen)$/i;
const GENERICAS = new Set(["estado", "pais", "gobierno", "republica", "republica dominicana", "dominicana", "dominicano", "rd", "socratico"]);

/**
 * Los nombres propios que escribe una pregunta: las secuencias con mayúscula
 * («Viamar», «Ministerio de Educación», «Luis Abinader»), sin la palabra que
 * la abre ni el Estado mismo. Es lo que se ata al grafo: la pregunta entera
 * ata a cualquiera que se llame «País».
 */
function nombresPropios(q: string, siglas: ReadonlySet<string> = new Set()): string[] {
  const vistos = new Set<string>(siglas);
  const salida: string[] = [];
  // La palabra que abre la pregunta lleva mayúscula por abrirla: sola, no es un nombre.
  const inicio = q.search(/\p{L}/u);
  for (const m of q.matchAll(/[A-ZÁÉÍÓÚÑ][\p{L}\d.&'-]*(?:\s+(?:(?:de|del|la|las|los|y|e)\s+)?[A-ZÁÉÍÓÚÑ][\p{L}\d.&'-]*)*/gu)) {
    let nombre = m[0].trim();
    const primera = nombre.split(/\s+/)[0];
    if (INTERROGATIVA.test(primera)) nombre = nombre.slice(primera.length).trim();
    const k = plano(nombre).trim();
    if (m.index === inicio && !/\s/.test(m[0].trim())) continue;
    if (k.length < 3 || GENERICAS.has(k) || NO_ES_OBJETO.has(k) || vistos.has(k)) continue;
    vistos.add(k);
    salida.push(nombre);
  }
  return salida.slice(0, TOPE_RECUPERAR.nombres);
}

/** Las líneas de lo que el grafo dice de una entidad, en corto, para el contexto de un asistente. */
async function contextoDeNodo(n: NodoRdf, por: string): Promise<z.infer<typeof EntidadRecuperada> | null> {
  const d = await describir(n);
  if (!d) return null;
  const sujeto = iriDe(n);
  const ruta = rutaDeNodo(n);
  const relaciones = relacionesDesdeTriples(d.triples, sujeto);
  const lineas: string[] = [];
  for (const g of GRUPOS) {
    const del = relaciones.filter((r) => r.grupo === g.id);
    if (!del.length) continue;
    lineas.push(...del.slice(0, TOPE_RECUPERAR.relacionesPorGrupo).map((r) => `${g.etiqueta}: ${lineaRelacion(r).slice(2)}`));
    if (del.length > TOPE_RECUPERAR.relacionesPorGrupo) lineas.push(`${g.etiqueta}: siguen ${del.length - TOPE_RECUPERAR.relacionesPorGrupo} (fetch con group «${g.id}»).`);
  }
  const compras = await comprasDelNodo(n).catch(() => null);
  return {
    id: ruta,
    titulo: d.titulo,
    clase: CLASE_DE_TIPO[n.tipo],
    url: absoluta(ruta),
    por,
    hechos: datosDe(d.triples, sujeto)
      .slice(0, TOPE_RECUPERAR.hechos)
      .map((x) => `${x.dato}: ${x.valor}`),
    relaciones: lineas,
    compras: compras?.lineas.filter((l) => l.startsWith("- ")).map((l) => l.slice(2)) ?? [],
  };
}

async function recuperar(pregunta: string, limite: number): Promise<z.infer<typeof Recuperado>> {
  const q = pregunta.trim().slice(0, 300);
  if (!q) throw new Aviso("La pregunta está vacía.");
  sinBuscarPorCedula(q);
  const p = plano(q);
  const pide = Object.fromEntries(Object.entries(INTENCION).map(([k, re]) => [k, re.test(p)])) as Record<keyof typeof INTENCION, boolean>;
  const anio = Number(/\b(20[1-3]\d)\b/.exec(q)?.[1] ?? NaN);

  // Siglas: una palabra que la pregunta escribe en mayúsculas y que es la
  // sigla de una institución («MINERD», «INAPA»). En minúsculas no cuentan:
  // «trabajo», «cultura» y «agricultura» son también siglas del catálogo.
  const mayusculas = new Set(q.split(/[^\p{L}\d]+/u).filter((w) => w.length >= 3 && w === w.toLocaleUpperCase("es") && /\p{L}/u.test(w)));
  const nombradas = INSTITUCIONES.filter((i) => i.acronimo && mayusculas.has(i.acronimo.toLocaleUpperCase("es")) && mayusculas.has(i.acronimo));
  const nombres = nombresPropios(q, new Set(nombradas.map((i) => plano(i.acronimo).trim())));
  // Las tablas de proveedores y de procesos se leen solo si la pregunta las
  // necesita (un nombre que el grafo no ata; un año): leerlas siempre
  // costaba en frío ~0,28 s y ~0,15 s (medido el 2026-10-01).
  const [h, pantallas, porNombre] = await Promise.all([
    buscarEnTodo(q, { porPagina: 20 }),
    buscarPantallas(q, 3),
    Promise.all(nombres.map(async (n) => ({ nombre: n, nodos: await buscarNodos(n), indice: await buscarEnTodo(n, { porPagina: 5 }) }))),
  ]);
  if (!h) throw new Aviso("El índice de búsqueda no cargó. Intenta de nuevo en un momento.");

  // Las entidades: primero las siglas, luego los nombres propios que la
  // pregunta escribe, y por último los resultados del buscador que son nodos
  // del grafo. Las dos primeras son «fuertes» (la pregunta las nombra) y son
  // las únicas que filtran una consulta; las del buscador solo acompañan.
  const nodos: { n: NodoRdf; por: string; fuerte: boolean }[] = [];
  const ya = new Set<string>();
  const sumarNodo = (n: NodoRdf, por: string, fuerte: boolean) => {
    const k = claveNodo(n);
    if (ya.has(k) || nodos.length >= TOPE_RECUPERAR.entidades) return;
    ya.add(k);
    nodos.push({ n, por, fuerte });
  };
  for (const i of nombradas) sumarNodo({ tipo: "institucion", id: String(i.id) }, `la pregunta escribe sus siglas, ${i.acronimo}`, true);
  // Un nombre propio: el nodo que se llama así; si no, el proveedor que se
  // llama exactamente así (sin la forma jurídica) y su empresa. Dos
  // proveedores con el mismo nombre pueden ser dos personas o dos empresas:
  // no se elige uno, se dice (la regla de contracting_history).
  let proveedorNombrado: ProveedorIndexado | null = null;
  const notasEnlace: string[] = [];
  const sinAtar: string[] = [];
  // El nombre en `plano()`, sin la forma jurídica. El de cada proveedor sale
  // de su forma plana ya guardada (`planoNombre`), y solo se compara el de
  // los que llevan la primera palabra: rehacer los 32 mil en cada llamada
  // costaba ~70 ms.
  const sinForma = (enPlano: string) =>
    enPlano
      .trim()
      .split(" ")
      .filter((w) => !FORMAS_JURIDICAS.has(w))
      .join(" ");
  for (const { nombre, nodos: c } of porNombre) {
    const exacto = c.candidatos.find((x) => plano(x.nombre).trim() === plano(nombre).trim());
    if (exacto) {
      sumarNodo(exacto.nodo, `la pregunta lo nombra: «${nombre}»`, true);
      continue;
    }
    const buscada = sinForma(plano(nombre));
    const primera = ` ${buscada.split(" ")[0]} `;
    const iguales = (await todosLosProveedores()).proveedores.filter(
      (x) => (!buscada || planoNombre(x).includes(primera)) && sinForma(planoNombre(x)) === buscada,
    );
    if (iguales.length === 1) {
      const elegido = iguales[0];
      proveedorNombrado ??= elegido;
      if (elegido.rnc) sumarNodo({ tipo: "empresa", id: elegido.rnc }, `la pregunta nombra al proveedor «${elegido.nombre}» (RPE ${elegido.rpe}), y su RNC es de esta empresa`, true);
      continue;
    }
    if (iguales.length > 1) {
      notasEnlace.push(
        `«${nombre}» es el nombre de ${iguales.length} registros de proveedor distintos (${iguales
          .slice(0, 4)
          .map((x) => `RPE ${x.rpe}`)
          .join(", ")}): pueden ser personas o empresas distintas, y no se eligió ninguno. Pide contracting_history con el id del que buscas.`,
      );
      continue;
    }
    if (c.candidatos.length === 1) sumarNodo(c.candidatos[0].nodo, `su nombre casa con «${nombre}»`, true);
    else sinAtar.push(nombre);
  }
  for (const r of h.resultados.slice(0, 10)) {
    if (!r.href) continue;
    const n = nodoDeRuta(r.href);
    if (n) sumarNodo(n, "el buscador la trae entre los primeros resultados", false);
    else if (r.tipo === "proveedor") {
      const rnc = /\bRNC (\d{9})\b/.exec(r.detalle ?? "")?.[1];
      if (rnc) sumarNodo({ tipo: "empresa", id: rnc }, "el buscador trae al proveedor, y su RNC es de esta empresa", false);
    }
  }
  const entidades = (await Promise.all(nodos.map(({ n, por }) => contextoDeNodo(n, por).catch(() => null)))).filter(
    (e): e is z.infer<typeof EntidadRecuperada> => e != null,
  );

  // La consulta de compras, si la pregunta pide una. La institución que filtra
  // es solo la que la pregunta nombra (siglas o nombre), nunca una que el
  // buscador trajo; y lo que la pregunta nombra no es lo que se compra.
  let compra: z.infer<typeof Recuperado>["compras"] = null;
  const evidencias: z.infer<typeof Evidencia>[] = [];
  const notasRuta: string[] = [];
  const instFuerte = nodos.find((x) => x.fuerte && x.n.tipo === "institucion")?.n;
  const institucionPedida = instFuerte ? institucionPorId(instFuerte.id) : null;
  // La cobertura de la tabla de procesos solo cuenta si la pregunta dice un año.
  const procesos = Number.isFinite(anio) ? (await todosLosProcesos()).procesos : [];
  const cobertura = procesos.length ? coberturaDe(procesos) : null;
  const antesDeLaInstantanea = Number.isFinite(anio) && cobertura != null && anio < Number(cobertura.desde.slice(0, 4));
  if (antesDeLaInstantanea && pide.compras) {
    notasRuta.push(
      `Los procesos de compra de la instantánea van del ${cobertura!.desde} al ${cobertura!.hasta}: ${anio} no está, y no se corrió procurement. Lo contratado en ${anio}, agregado por año, lo da contracting_history.`,
    );
  }
  // Si la pregunta nombra algo que no se pudo atar, una consulta sin ese filtro
  // contestaría otra pregunta: no se corre, se dice.
  const nombreSuelto = !institucionPedida && sinAtar.length > 0;
  if (pide.compras && nombreSuelto) {
    notasRuta.push(
      `No se pudo atar «${sinAtar[0]}» a una sola institución o proveedor, y no se corrió procurement: sin ese filtro contestaría por todo el Estado. Búscala con search y pide procurement con su id.`,
    );
  }
  const quiereCompras = pide.compras && !antesDeLaInstantanea && !proveedorNombrado && !nombreSuelto;
  if (quiereCompras && (pide.mayor || pide.reciente || pide.abierta || Number.isFinite(anio) || institucionPedida)) {
    const nombrado = new Set(
      [...nombres, ...nombradas.map((i) => i.acronimo), ...(institucionPedida ? [institucionPedida.nombre, institucionPedida.acronimo] : [])]
        .flatMap((x) => plano(x).trim().split(" "))
        .filter(Boolean),
    );
    const objeto = palabrasDeContenido(q).filter((w) => !/\d/.test(w) && !NO_ES_OBJETO.has(w) && !nombrado.has(w));
    const filtros: FiltrosCompras = {
      ...(Number.isFinite(anio) ? { anio } : {}),
      ...(institucionPedida ? { institucion: rutaInstitucion(institucionPedida) } : {}),
      ...(pide.abierta ? { estado: ["abierto" as const] } : {}),
      ...(objeto.length >= 1 && objeto.length <= 3 ? { texto: objeto.join(" ") } : {}),
      orden: pide.reciente && !pide.mayor ? "fecha" : "monto",
    };
    const r = await compras(filtros);
    const deducidos = [
      filtros.anio && `año ${filtros.anio}`,
      institucionPedida && `institución ${institucionPedida.nombre}`,
      filtros.estado && "abiertos a ofertas",
      filtros.texto && `carátula con «${filtros.texto}»`,
      `orden por ${filtros.orden === "fecha" ? "fecha" : "monto"}`,
    ]
      .filter(Boolean)
      .join(", ");
    compra = { filtros: argumentosDeCompras(filtros), deducidos, total: r.total, suma: r.suma, notas: r.notas };
    for (const x of r.procesos.slice(0, TOPE_RECUPERAR.compras)) {
      evidencias.push({
        id: x.id,
        clase: "Proceso de compra",
        titulo: x.title,
        texto: [
          x.modalidad,
          `${x.estado} (instantánea con publicaciones hasta el ${r.corte ?? "?"})`,
          x.institucion.nombre,
          `publicado el ${x.fecha}`,
          x.valorEstimado != null ? `valor estimado RD$ ${ENTERO.format(x.valorEstimado)}` : "sin valor en pesos",
          `código ${x.codigo}`,
        ].join(" · "),
        url: x.url,
        por: `procurement (${deducidos}): ${ENTERO.format(r.total)} cumplen, suma estimada RD$ ${ENTERO.format(r.suma)}`,
      });
    }
  }

  // El camino entre dos entidades, si la pregunta pregunta por su relación.
  if (pide.vinculo && nodos.length >= 2) {
    const c = await cadena(rutaDeNodo(nodos[0].n), rutaDeNodo(nodos[1].n)).catch(() => null);
    if (c) {
      evidencias.push({
        id: c.pasos[0]?.id ?? null,
        clase: "Camino en el grafo",
        titulo: c.encontrado ? `${c.saltos} saltos` : "Sin camino",
        texto: c.encontrado
          ? `${c.pasos.map((x, i) => (i === 0 ? x.nombre : `(${x.via}) → ${x.nombre}`)).join(" ")}. ${c.explicacion}`
          : c.explicacion,
        url: c.explorador,
        por: `path entre «${rutaDeNodo(nodos[0].n)}» y «${rutaDeNodo(nodos[1].n)}»`,
      });
    }
  }

  // Lo contratado desde 2015, si la pregunta lo pide (o pide las compras de un
  // proveedor, que la tabla de procesos no ata a quien ganó) y nombra a quién:
  // el par si nombra a los dos.
  const quiereHistoria = pide.contratado || (pide.compras && (proveedorNombrado != null || antesDeLaInstantanea));
  if (quiereHistoria && (proveedorNombrado || instFuerte)) {
    try {
      const pedido = {
        ...(proveedorNombrado ? { proveedor: enlace.proveedor(proveedorNombrado.rpe) } : {}),
        ...(instFuerte ? { institucion: rutaDeNodo(instFuerte) } : {}),
      };
      const r = await historial(pedido);
      if (r.par) {
        evidencias.push({
          id: r.proveedor?.id ?? null,
          clase: "Lo contratado desde 2015",
          titulo: `${r.institucion?.nombre} → ${r.proveedor?.nombre}`,
          texto: r.par.encontrado
            ? `RD$ ${ENTERO.format(r.par.monto ?? 0)} en ${ENTERO.format(r.par.contratos ?? 0)} contratos. ${r.par.explicacion} Valor contratado, no pagado; tablas de contratos de la DGCP, corte del ${r.corte}.`
            : r.par.explicacion,
          url: r.proveedor?.url ?? r.institucion?.url ?? SITIO,
          por: `contracting_history con supplier «${r.proveedor?.id}» e institution «${r.institucion?.id}»`,
        });
      }
      const lista = (xs: { nombre: string; monto: number }[]) => xs.slice(0, 5).map((x) => `${x.nombre} (RD$ ${ENTERO.format(x.monto)})`).join("; ");
      if (r.proveedor) {
        const p = r.proveedor;
        evidencias.push({
          id: p.id,
          clase: "Lo contratado desde 2015",
          titulo: p.nombre,
          texto: `RD$ ${ENTERO.format(p.monto)} en ${ENTERO.format(p.contratos)} contratos, del ${p.desde} al ${p.hasta}, con ${ENTERO.format(p.clientes)} instituciones; sus mayores clientes: ${lista(p.mayoresClientes)}. Valor contratado, no pagado; tablas de contratos de la DGCP, corte del ${r.corte}.`,
          url: p.url,
          por: `contracting_history con supplier «${p.id}»`,
        });
      } else if (r.institucion) {
        const i = r.institucion;
        evidencias.push({
          id: i.id,
          clase: "Lo contratado desde 2015",
          titulo: i.nombre,
          texto: i.sinAsignar
            ? i.sinAsignar
            : `RD$ ${ENTERO.format(i.monto)} en ${ENTERO.format(i.contratos)} contratos con ${ENTERO.format(i.proveedores)} proveedores; sus mayores: ${lista(i.mayoresProveedores)}. Valor contratado, no pagado; tablas de contratos de la DGCP, corte del ${r.corte}.`,
          url: i.url,
          por: `contracting_history con institution «${i.id}»`,
        });
      }
    } catch (err) {
      if (!(err instanceof Aviso)) throw err;
    }
  }

  const vistos = new Set(evidencias.map((e) => e.id));
  const delIndice = [...porNombre.flatMap((x) => x.indice?.resultados ?? []), ...h.resultados];
  for (const r of delIndice) {
    if (evidencias.length >= limite) break;
    if (!r.href) continue;
    const id = idDeHref(r.href);
    if (vistos.has(id)) continue;
    vistos.add(id);
    const corte = r.tipo === "institucion" ? FUENTES_DEL_CRUCE.dgcp.consultado : h.instantaneas[r.tipo]?.slice(0, 10);
    evidencias.push({
      id,
      clase: ETIQUETA_TIPO[r.tipo],
      titulo: tituloDe(r),
      texto: lineaResultado(r, corte),
      url: absoluta(r.href),
      por: r.via === "tema" ? "su tema se parece a la pregunta (Model2Vec)" : r.via === "ambas" ? "sus palabras y su tema" : "sus palabras",
    });
  }

  // Lo que conviene pedir después, con los argumentos exactos.
  const siguientes: z.infer<typeof Siguiente>[] = [];
  const primera = (tipo: TipoNodoRdf) => nodos.find((x) => x.n.tipo === tipo)?.n;
  const inst = primera("institucion");
  const empresa = primera("empresa");
  const persona = primera("funcionario");
  if (compra && compra.total > POR_PAGINA_COMPRAS) {
    siguientes.push({ herramienta: "procurement", argumentos: { ...compra.filtros, page: 2 }, para: "Las siguientes, o los mismos con otros filtros." });
  } else if (antesDeLaInstantanea) {
    siguientes.push({
      herramienta: "contracting_history",
      argumentos: inst ? { institution: rutaDeNodo(inst) } : {},
      para: `Lo contratado por año desde 2015, que incluye ${anio}.`,
    });
  } else if (pide.compras && !compra) {
    siguientes.push({
      herramienta: "procurement",
      argumentos: { ...(Number.isFinite(anio) ? { year: anio } : {}), ...(inst ? { institution: rutaDeNodo(inst) } : {}), sort: "monto" },
      para: "Los procesos de compra filtrados y ordenados por monto: search ordena por parecido.",
    });
  }
  if (pide.contratado || pide.compras) {
    if (empresa) siguientes.push({ herramienta: "contracting_history", argumentos: { supplier: rutaDeNodo(empresa) }, para: "Lo que el Estado le ha contratado desde 2015, y a qué instituciones." });
    if (inst) siguientes.push({ herramienta: "contracting_history", argumentos: { institution: rutaDeNodo(inst) }, para: "Lo que la institución ha contratado desde 2015, y a quién." });
  }
  if (pide.dirige && inst) siguientes.push({ herramienta: "fetch", argumentos: { id: rutaDeNodo(inst), group: "cargos" }, para: "Quién la dirige y quiénes tienen cargo en ella." });
  if (pide.decretos && persona) siguientes.push({ herramienta: "signed_decrees", argumentos: { person: rutaDeNodo(persona) }, para: "Los decretos que firmó, filtrables." });
  if (pide.vinculo && nodos.length >= 2) {
    siguientes.push({ herramienta: "path", argumentos: { from: rutaDeNodo(nodos[0].n), to: rutaDeNodo(nodos[1].n) }, para: "La cadena de relaciones registradas entre los dos." });
  }

  return {
    pregunta: q,
    entidades,
    evidencias: evidencias.slice(0, limite),
    compras: compra,
    pantallas: (pantallas ?? []).map((x) => ({ titulo: x.titulo, url: absoluta(x.href), texto: [x.tema, x.nota].filter(Boolean).join(" · ") })),
    siguientes,
    notas: [
      ...notasEnlace,
      ...notasRuta,
      "Es evidencia recuperada, no una respuesta: cada pieza trae su fuente y su fecha de corte; cita su url.",
      "Se recupera por palabras (índice BM25 propio), por tema (Model2Vec potion-multilingual-128M, de código abierto) y por las entidades del grafo que la pregunta nombra; que algo no salga no prueba que no exista.",
      ...(compra ? [`Los filtros de compras se dedujeron de la pregunta (${compra.deducidos}); si no son esos, pide procurement con los tuyos.`] : []),
    ],
    aviso: AVISO,
  };
}

/* ------------------------------------------------------------------- query */

/**
 * SQL de solo lectura sobre las tablas del grafo sin personas naturales
 * (`lib/grafo-tablas.ts`): instituciones, proveedores, empresas,
 * contrataciones, medidas, financieras, provincias, equivalencias y los
 * procesos de compra de los últimos doce meses. El motor (DuckDB) corre en su
 * propia función, `/api/sql`, para no cargar sus ~70 MB en esta: la
 * herramienta la llama por HTTP en el mismo despliegue que atiende el pedido
 * (`conOrigen`, que pone `app/mcp/route.ts`), y el GET se cachea en la CDN.
 */

const TOPE_FILAS_SQL = 200;

const ResultadoSql = z.object({
  columnas: z.array(z.string()),
  filas: z.array(z.array(z.unknown())).describe(`Hasta ${TOPE_FILAS_SQL} filas, en el orden de columnas.`),
  truncada: z.boolean().describe("Hay más filas que las devueltas: agrega, filtra o pon un LIMIT."),
  ms: z.number(),
  tablas: z.array(z.object({ tabla: z.string(), fuente: z.string(), corte: z.string().nullable() })).describe("Las tablas que la consulta nombra, con su fuente y su corte."),
  descarga: z.string().describe("Las tablas enteras, en Parquet, para abrirlas en DuckDB, pandas o Polars."),
  aviso: z.string(),
});

/** El despliegue que atiende el pedido (`app/mcp/route.ts` lo pone): la misma versión de las tablas y del motor. */
const origen = new AsyncLocalStorage<string>();
export const conOrigen = <T>(o: string, fn: () => T): T => origen.run(o, fn);

async function consultarTablas(sql: string): Promise<z.infer<typeof ResultadoSql>> {
  if (llevaCedula(sql)) throw new Aviso("Las tablas no guardan cédulas, y ninguna herramienta de Socrático busca por ella.");
  const base = origen.getStore() ?? SITIO;
  // Por GET, que la CDN guarda; una consulta larga (con tildes o saltos de línea se triplica al codificarla) va por POST.
  const q = encodeURIComponent(sql);
  const r =
    q.length <= 6_000
      ? await fetch(`${base}/api/sql?q=${q}`, { signal: AbortSignal.timeout(25_000) })
      : await fetch(`${base}/api/sql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: sql }),
          signal: AbortSignal.timeout(25_000),
        });
  const cuerpo = (await r.json().catch(() => null)) as { error?: string; columnas?: string[]; filas?: unknown[][]; truncada?: boolean; ms?: number } | null;
  if (r.status === 503) throw new Aviso(cuerpo?.error ?? "El motor está ocupado: vuelve a intentar en unos segundos.");
  if (r.status === 400) throw new Aviso(`La consulta no corrió: ${(cuerpo?.error ?? "error de SQL").replace(/[.!]+$/, "")}. Las tablas y columnas están en la descripción de query.`);
  if (!r.ok || !cuerpo?.columnas) throw new Error(`/api/sql respondió ${r.status}`);
  const nombradas = NOMBRES_TABLAS.filter((t) => new RegExp(`\\b${t}\\b`, "i").test(sql));
  return {
    columnas: cuerpo.columnas,
    filas: cuerpo.filas ?? [],
    truncada: Boolean(cuerpo.truncada),
    ms: cuerpo.ms ?? 0,
    tablas: nombradas.map((t) => ({ tabla: t, fuente: TABLAS_GRAFO[t].fuente, corte: TABLAS_GRAFO[t].corte })),
    descarga: `${SITIO}/tablas/`,
    aviso: AVISO,
  };
}

/* -------------------------------------------------------------- ontology */

const ESTADO_TERMINO = z
  .enum(["en-uso", "definido"])
  .describe("«en-uso»: el grafo ya tiene instancias. «definido»: el modelo de una fase que viene, todavía sin datos.");

const Ontologia = z.object({
  version: z.string(),
  publicada: z.string(),
  espacio: z.string().describe("El núcleo, neutral de país (soc:)."),
  espacioDominicano: z.string().describe("El módulo de la República Dominicana (do:): identificadores, clasificaciones y la regla PEP de la Ley 311-14."),
  clases: z.array(
    z.object({
      id: z.string(),
      etiqueta: z.string(),
      comentario: z.string(),
      estado: ESTADO_TERMINO,
      subClaseDe: z.array(z.string()),
      wikidata: z.array(z.string()),
      followTheMoney: z.string().nullable(),
    }),
  ),
  propiedades: z.array(
    z.object({
      id: z.string(),
      etiqueta: z.string(),
      comentario: z.string(),
      estado: ESTADO_TERMINO,
      dominio: z.array(z.string()),
      rango: z.array(z.string()),
      inversa: z.string().nullable(),
    }),
  ),
  esquemas: z.array(z.object({ id: z.string(), etiqueta: z.string(), conceptos: z.array(z.string()) })),
  descargas: z.object({
    turtle: z.string(),
    jsonld: z.string(),
    ntriples: z.string(),
    shacl: z.string().describe("Las formas SHACL que valida cada instancia del grafo (unido con la ontología)."),
    fabric: z.string().describe("El perfil para Microsoft Fabric IQ, para importar en un ítem de ontología vacío."),
    pagina: z.string(),
    grafo: z
      .object({ url: z.string(), triples: z.number(), generado: z.string(), excluye: z.string() })
      .nullable()
      .describe("El grafo entero sin personas naturales, en N-Triples comprimido, para cargarlo en un motor RDF propio (Oxigraph, QLever, Apache Jena)."),
    tablas: z
      .object({ url: z.string(), generadas: z.string(), tablas: z.array(z.object({ tabla: z.string(), filas: z.number(), descripcion: z.string() })) })
      .describe("El mismo grafo, más los procesos de compra, en tablas Parquet: lo que consulta query, para abrirlo en DuckDB, pandas o Polars."),
  }),
  aviso: z.string(),
});

async function ontologia(): Promise<z.infer<typeof Ontologia>> {
  const volcado = await volcadoDelGrafo();
  return {
    version: VERSION_ONTOLOGIA,
    publicada: PUBLICADA,
    espacio: PREFIJOS.soc,
    espacioDominicano: PREFIJOS.do,
    clases: CLASES.map((c) => ({
      id: curie(c),
      etiqueta: c.etiqueta,
      comentario: c.comentario,
      estado: c.estado,
      subClaseDe: [...(c.padre ? [c.padre] : []), ...c.subClaseDe],
      wikidata: (c.wikidata ?? []).map((w) => `wd:${w.qid} (${w.relacion}, ${w.nombre})`),
      followTheMoney: c.ftm ?? null,
    })),
    propiedades: PROPIEDADES.map((p) => ({
      id: curie(p),
      etiqueta: p.etiqueta,
      comentario: p.comentario,
      estado: p.estado,
      dominio: p.dominio,
      rango: p.rango,
      inversa: p.inversa ? `soc:${p.inversa}` : null,
    })),
    esquemas: esquemas().map((e) => ({ id: curie(e), etiqueta: e.etiqueta, conceptos: e.conceptos.map((c) => c.etiqueta) })),
    descargas: {
      turtle: `${SITIO}/ontologia.ttl`,
      jsonld: `${SITIO}/ontologia.jsonld`,
      ntriples: `${SITIO}/ontologia.nt`,
      shacl: `${SITIO}/ontologia.shacl.ttl`,
      fabric: `${SITIO}/ontologia.fabric.ttl`,
      pagina: `${SITIO}/ontologia`,
      grafo: volcado ? { url: volcado.url, triples: volcado.triples, generado: volcado.generado, excluye: volcado.excluye } : null,
      tablas: {
        url: `${SITIO}/tablas/`,
        generadas: TABLAS_GENERADAS,
        tablas: NOMBRES_TABLAS.map((t) => ({ tabla: `${SITIO}/tablas/${t}.parquet`, filas: TABLAS_GRAFO[t].filas, descripcion: TABLAS_GRAFO[t].descripcion })),
      },
    },
    aviso: AVISO,
  };
}

/* --------------------------------------------------------------- servidor */

/** Ninguna herramienta escribe, borra ni sale a una fuente en vivo: leen instantáneas. */
const SOLO_LECTURA = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const Id = z.string().min(1).max(500);

/**
 * Un servidor para un pedido: `createMcpHandler` lo pide en cada POST y lo
 * suelta al responder. Registrar diez herramientas cuesta microsegundos; los
 * datos que leen están en memoria de la instancia (cada `lib/` memoiza su
 * instantánea).
 */
export function servidorMcp(): McpServer {
  const s = new McpServer(
    {
      name: "socratico",
      title: "Socrático.do",
      version: VERSION_MCP,
      websiteUrl: SITIO,
      description: "Datos públicos del Estado dominicano, en un grafo con su fuente y su fecha. Herramienta independiente y no oficial.",
      icons: [{ src: `${SITIO}/icon.svg`, mimeType: "image/svg+xml" }],
    },
    {
      instructions: INSTRUCCIONES,
      // Las herramientas no cambian en vida del despliegue: nada que avisar, y su
      // lista y la presentación del servidor se pueden guardar una hora.
      capabilities: { tools: { listChanged: false } },
      cacheHints: { "tools/list": { ttlMs: 3_600_000, cacheScope: "public" }, "server/discover": { ttlMs: 3_600_000, cacheScope: "public" } },
    },
  );

  s.registerTool(
    "search",
    {
      title: tituloHerramienta("search"),
      description:
        "Busca en los datos públicos del Estado dominicano que ordena Socrático.do: personas con cargo público, instituciones, entidades financieras, empresas del padrón de la DGII (por nombre o RNC), provincias, decretos («Decreto 497-25»), proveedores y procesos de compra, normas, iniciativas del Congreso, sentencias, obras, cargos de la nómina, documentos institucionales y datos abiertos. Por palabras (todas deben estar, tolera una errata) y por tema, ordenado por parecido: para ordenar compras por monto o fecha, o contarlas, usa procurement o query. Devuelve hasta 30 resultados por página; abre cada uno con fetch usando su id.",
      inputSchema: z.strictObject({
        query: z.string().min(1).max(1000).describe("Lo que se busca, en español: un nombre, un RNC de nueve cifras, un número de decreto o un tema."),
        type: z.enum(TIPOS_ID).optional().describe(`Solo resultados de este tipo: ${TIPOS_RESULTADO.map((t) => `${t.clave} (${t.plural.toLocaleLowerCase("es")})`).join(", ")}.`),
        page: z.number().int().min(1).max(100).optional().describe("La página, desde 1."),
      }),
      outputSchema: Busqueda,
      annotations: SOLO_LECTURA,
    },
    async ({ query, type, page }) => resultado(await correr("search", () => buscar(query, { tipo: type, pagina: page }))),
  );

  s.registerTool(
    "fetch",
    {
      title: tituloHerramienta("fetch"),
      description: `Lee un registro de Socrático.do por el id que devolvió search (o la dirección de su ficha, un RNC o «Decreto 497-25»). Un nodo del grafo (persona, institución, entidad financiera, empresa, decreto o provincia) trae sus datos, sus compras y sus relaciones (hasta ${POR_GRUPO_FETCH} por grupo: cargos, decretos, compras, entidades, lugares, registros), con su fuente y fecha de corte; otro registro trae el resumen del índice y la dirección de su fuente. Con group y page recorre un grupo de relaciones de un nodo entero, de ${POR_PAGINA_RELACIONES} en ${POR_PAGINA_RELACIONES} (quién dirige una institución: group «cargos»; a quién le contrató: group «compras»).`,
      inputSchema: z.strictObject({
        id: Id.describe("El id de un resultado de search."),
        group: z.enum(GRUPOS_ID).optional().describe("Solo para un nodo del grafo: las relaciones de este grupo, todas, por páginas."),
        page: z.number().int().min(1).max(1000).optional().describe("Con group: la página, desde 1."),
      }),
      outputSchema: Documento,
      annotations: SOLO_LECTURA,
    },
    async ({ id, group, page }) =>
      resultado(await correr("fetch", () => (group || page ? leerRelaciones(id, group, page ?? 1) : leer(id)))),
  );

  s.registerTool(
    "retrieve",
    {
      title: tituloHerramienta("retrieve"),
      description:
        "Para contestar una pregunta en llano sobre el Estado dominicano: recupera en una llamada la evidencia (RAG sobre el grafo). Junta los registros del buscador híbrido (palabras y tema), las entidades del grafo que la pregunta nombra con sus datos, relaciones y compras, la consulta de compras que la pregunta pide si pide una («la compra más grande de 2026», «las licitaciones de mobiliario abiertas», «lo que publicó el MINERD»), la pantalla de la plataforma que la responde y las llamadas exactas para seguir. Cada pieza trae su fuente, su fecha y su dirección para citarla. No genera la respuesta: la da el asistente con esta evidencia.",
      inputSchema: z.strictObject({
        query: z.string().min(1).max(300).describe("La pregunta como la haría una persona, en español."),
        limit: z.number().int().min(1).max(20).optional().describe("Cuántas evidencias, como mucho (10 por omisión)."),
      }),
      outputSchema: Recuperado,
      annotations: SOLO_LECTURA,
    },
    async ({ query, limit }) => resultado(await correr("retrieve", () => recuperar(query, limit ?? TOPE_RECUPERAR.evidencias))),
  );

  s.registerTool(
    "procurement",
    {
      title: tituloHerramienta("procurement"),
      description:
        "Los procesos de compra pública del Estado dominicano de los últimos doce meses (tabla de la DGCP: todos los que traen carátula, no una muestra), filtrados y ordenados: por año o fechas, institución, estado (abierto, en evaluación, adjudicado…), modalidad, objeto (bienes, obras, servicios), monto y palabras de la carátula; de mayor a menor monto por omisión, o por fecha. Da cuántos cumplen, la suma de sus valores estimados, el desglose por estado y las instituciones que más suman, en páginas de 25. Para «la compra más grande de 2026», «las licitaciones de mobiliario abiertas» o «lo que publicó el MOPC este año». El valor es el estimado al publicar; quién ganó no está aquí (la ficha del proceso lo lee en vivo).",
      inputSchema: z.strictObject({
        text: z
          .string()
          .max(200)
          .optional()
          .describe("Palabras que deben estar todas en la carátula (sin importar tildes ni mayúsculas; «muebles» casa con «mueble»). Alternativas separadas por « | »: «mobiliario | muebles | sillas» trae las que dicen cualquiera."),
        institution: z.string().max(200).optional().describe("La unidad de compra: su id («/instituciones/5»), sus siglas («MOPC», «INABIE») o palabras de su nombre («hospital» son todos los hospitales)."),
        year: z.number().int().min(2015).max(2100).optional().describe("Solo los publicados ese año."),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Publicados desde esta fecha (AAAA-MM-DD)."),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Publicados hasta esta fecha (AAAA-MM-DD)."),
        status: z
          .array(z.enum(CLAVES_ETAPA))
          .max(CLAVES_ETAPA.length)
          .optional()
          .describe(`La etapa el día del corte, una o varias: ${CLAVES_ETAPA.map((k) => `${k} (${ETAPAS[k]})`).join(", ")}.`),
        method: z
          .array(z.enum(CLAVES_MODALIDAD))
          .max(CLAVES_MODALIDAD.length)
          .optional()
          .describe(`La modalidad, una o varias: ${CLAVES_MODALIDAD.map((k) => `${k} (${MODALIDADES[k]})`).join(", ")}.`),
        category: z.enum(CLAVES_OBJETO).optional().describe("El objeto: bienes, obras o servicios."),
        minAmount: z.number().min(0).optional().describe("Valor estimado mínimo, en pesos."),
        maxAmount: z.number().min(0).optional().describe("Valor estimado máximo, en pesos."),
        sort: z.enum(ORDENES_COMPRA).optional().describe("monto: de mayor a menor (por omisión); monto_asc; fecha: los más recientes primero; fecha_asc."),
        page: z.number().int().min(1).max(1000).optional().describe("La página, desde 1."),
      }),
      outputSchema: Compras,
      annotations: SOLO_LECTURA,
    },
    async (f) => resultado(await correr("procurement", () => compras(filtrosDeCompras(f)))),
  );

  s.registerTool(
    "contracting_history",
    {
      title: tituloHerramienta("contracting_history"),
      description:
        "Lo que el Estado dominicano ha contratado por el sistema de compras desde 2015 (tablas de contratos de la DGCP, agregadas): de un proveedor (por año, total y sus mayores clientes), de una institución (por año, total y sus mayores proveedores), lo que una institución le contrató a un proveedor si se piden los dos, o, sin ninguno, el país entero con los cien mayores proveedores y las instituciones que más contratan. Valor contratado, no pagado.",
      inputSchema: z.strictObject({
        supplier: z.string().max(200).optional().describe("El proveedor: su id («/proveedores/1211»), su RNC de nueve cifras, su RPE o su nombre."),
        institution: z.string().max(200).optional().describe("La institución: su id («/instituciones/237»), sus siglas («MINERD») o su nombre."),
        page: z.number().int().min(1).max(4).optional().describe("Sin proveedor ni institución: la página de los cien mayores proveedores, de 25 en 25."),
      }),
      outputSchema: Historial,
      annotations: SOLO_LECTURA,
    },
    async ({ supplier, institution, page }) =>
      resultado(await correr("contracting_history", () => historial({ proveedor: supplier, institucion: institution, pagina: page }))),
  );

  s.registerTool(
    "query",
    {
      title: tituloHerramienta("query"),
      description: `SQL de solo lectura (DuckDB) sobre el grafo entero sin personas naturales y los procesos de compra: para lo que las otras herramientas no ordenan, cuentan ni cruzan (empresas con medidas de la DGCP que siguen contratando, las instituciones que más procesos de excepción publicaron, proveedores activos desde tal año). Una sola consulta SELECT (o WITH … SELECT); devuelve hasta ${TOPE_FILAS_SQL} filas; cada una se corta a los 10 s. Las tablas, con sus columnas:
${esquemaCompacto()}
Notas: contrataciones son solo los pares mayores (12 proveedores por institución, 8 clientes por empresa): para totales usa instituciones.monto_contratado o proveedores.monto_contratado; un NULL ahí no es cero (instituciones.sin_asignar dice cuándo sus contratos existen pero no se le atribuyen, como los del MOPC). Montos en pesos, contratados (no pagados); procesos.valor_estimado es el estimado al publicar. procesos.unidad_compra es texto: cruza con instituciones por nombre o siglas con cuidado. Las personas naturales no están en estas tablas: se leen una a una con fetch.`,
      inputSchema: z.strictObject({
        sql: z
          .string()
          .min(1)
          .max(8000)
          .describe("La consulta, por ejemplo: SELECT e.nombre, p.monto_contratado FROM medidas m JOIN proveedores p ON p.rpe = m.proveedor_rpe JOIN empresas e ON e.rnc = p.rnc ORDER BY p.monto_contratado DESC NULLS LAST LIMIT 10"),
      }),
      outputSchema: ResultadoSql,
      annotations: SOLO_LECTURA,
    },
    async ({ sql }) => resultado(await correr("query", () => consultarTablas(sql))),
  );

  s.registerTool(
    "path",
    {
      title: tituloHerramienta("path"),
      description: `La cadena más corta de relaciones registradas por el Estado entre dos nodos del grafo (por ejemplo, una persona y una institución, o dos personas), buscando desde los dos extremos a la vez: hasta ${TOPE_CAMINO.saltos} saltos y ${TOPE_CAMINO.fichas} fichas abiertas. Si no la encuentra, dice por qué.`,
      inputSchema: z.strictObject({
        from: Id.describe("El id del primer nodo."),
        to: Id.describe("El id del segundo nodo."),
      }),
      outputSchema: Cadena,
      annotations: SOLO_LECTURA,
    },
    async ({ from, to }) => resultado(await correr("path", () => cadena(from, to))),
  );

  s.registerTool(
    "signed_decrees",
    {
      title: tituloHerramienta("signed_decrees"),
      description:
        "Los decretos del Poder Ejecutivo que el registro de la Consultoría Jurídica atribuye a la firma de una persona (un presidente, casi siempre), del más reciente al más viejo, filtrables por año, materia y palabras del título, en páginas de 25.",
      inputSchema: z.strictObject({
        person: z.string().min(1).max(200).describe("El id de la persona («/funcionarios/luis-rodolfo-abinader-corona») o su nombre."),
        year: z.number().int().min(1844).max(2100).optional().describe("Solo los de este año."),
        subject: z.enum(MATERIA_SLUGS).optional().describe(`Solo los de esta materia: ${MATERIAS.map((m) => `${m.slug} (${m.nombre})`).join(", ")}.`),
        text: z.string().max(120).optional().describe("Palabras que deben estar en el número, el título o la etiqueta de institución."),
        page: z.number().int().min(1).max(1000).optional().describe("La página, desde 1."),
      }),
      outputSchema: Firmados,
      annotations: SOLO_LECTURA,
    },
    async ({ person, year, subject, text, page }) =>
      resultado(await correr("signed_decrees", () => decretosFirmados(person, { anio: year, materia: subject, texto: text, pagina: page }))),
  );

  s.registerTool(
    "ontology",
    {
      title: tituloHerramienta("ontology"),
      description:
        "Las clases, relaciones y vocabularios controlados del grafo de Socrático.do (OWL, RDFS y SHACL; un núcleo neutral de país, soc:, y el módulo dominicano, do:; alineados con schema.org, W3C ORG, ELI, PROV-O, ePO, FollowTheMoney y Wikidata): qué es cada tipo de nodo, qué quiere decir cada relación y si el grafo ya tiene datos de ella; y dónde descargar la ontología (también en SHACL y para Fabric IQ), el grafo (N-Triples) y sus tablas (Parquet).",
      // Sin argumentos, y sin exigir que no lleguen: hay clientes que le ponen uno de relleno a una herramienta vacía.
      inputSchema: z.object({}),
      outputSchema: Ontologia,
      annotations: SOLO_LECTURA,
    },
    async () => resultado(await correr("ontology", ontologia)),
  );

  return s;
}
