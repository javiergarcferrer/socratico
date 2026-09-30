import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { SITIO } from "@/lib/sitio";
import { enlace, nodoDeRuta, numeroCanonico, rutaDeNodo, type NodoRdf, type TipoNodoRdf } from "@/lib/grafo";
import {
  CLASE_DE_TIPO,
  GRUPOS,
  TOPE_CAMINO,
  camino,
  describir,
  inventario,
  iriDe,
  relacionesDesdeTriples,
  type GrupoRelacion,
  type Relacion,
} from "@/lib/grafo-rdf";
import { buscarEnTodo, EN_MAYUSCULAS, resultadoPorHref, TIPOS_RESULTADO, type Resultado, type TipoResultado } from "@/lib/busqueda";
import { buscarEmpresas, empresaPorRnc, padronEmpresas, type Empresa } from "@/lib/empresas";
import { AVISO_DECRETO, decretoPorNumero, decretosDeFirmante, hrefDecreto, indiceDecretos, type AvisoDecreto } from "@/lib/decretos";
import { MATERIAS } from "@/lib/materias-decreto";
import { filtrarPersonas, getFuncionarios, personaPorId, type Persona } from "@/lib/funcionarios";
import { PROVINCIAS } from "@/lib/provincias";
import { CLASES, PROPIEDADES, PUBLICADA, VERSION as VERSION_ONTOLOGIA, esquemas } from "@/lib/ontologia";
import { PREFIJOS, compactar, expandir, type Triple } from "@/lib/rdf";
import { desdeMayusculas } from "@/lib/congreso";
import { agujas, contieneTodas, plano } from "@/lib/raiz";
import { tituloHerramienta } from "@/lib/mcp-herramientas";
import { llevaCedula, sinCedula } from "@/lib/padron";

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
export const VERSION_MCP = "1.0.0";

const AVISO =
  "Socrático.do es una herramienta independiente y no oficial: ordena lo que publica el Estado dominicano, con su fuente y su fecha de corte.";

const INSTRUCCIONES = `Socrático.do ordena lo que publica el Estado dominicano. Es una herramienta independiente y no oficial.

Qué hay: un grafo de personas con cargo público, instituciones del Estado, decretos, entidades financieras supervisadas, personas jurídicas del padrón de la DGII y provincias, con sus relaciones (cargos, firmas, supervisión, declaraciones juradas publicadas, medidas de la DGCP, la lista SDN de la OFAC, Wikidata); y un índice de búsqueda de compras públicas, proveedores, normas, iniciativas del Congreso, sentencias, obras, documentos institucionales y datos abiertos. Todo sale de instantáneas de fuentes públicas (del Estado dominicano, más la lista SDN de la OFAC y los identificadores de Wikidata): cada respuesta dice su fuente y su fecha de corte.

Cómo se usa:
1. search con palabras: un nombre, un RNC de nueve cifras, «Decreto 497-25», un tema. Cada resultado trae un id.
2. fetch con ese id: el registro, con su fuente, su fecha y, si es un nodo del grafo, sus relaciones.
3. neighbors recorre todas las relaciones de un nodo por páginas; path busca la cadena más corta de relaciones entre dos nodos; signed_decrees lista y filtra los decretos que firmó una persona; ontology explica las clases y relaciones del grafo.

Reglas al usar estos datos:
- Cita la fuente y la fecha de corte de cada dato; son instantáneas, no tiempo real.
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
      "Lo pedido lleva una cédula. Socrático no la enseña ni busca por ella, aunque un título oficial la traiga: busca por el nombre, la institución o el tema.",
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
    return { id: null, url: absoluta(r.href), pista: `signed_decrees con persona «${persona}»` };
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

const ETIQUETA_PROPIEDAD = new Map(PROPIEDADES.map((p) => [`soc:${p.id}`, mayuscula(p.etiqueta)]));

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
  conceptos ??= new Map(esquemas().flatMap((e) => e.conceptos.map((c) => [expandir(`soc:${c.id}`), c.etiqueta] as const)));
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
      else if (p === "dct:title" || p === "schema:description" || p === "soc:etiquetaConsultoria") valor = desdeMayusculas(x.o.valor);
      else if (p === "soc:aviso") valor = AVISO_DECRETO[x.o.valor as AvisoDecreto]?.llano ?? x.o.valor;
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
    const tipo = de(m, "soc:tipoDeMedida");
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
  id: z.string().describe("Lo que se le pasa a fetch (y a neighbors o path si es un nodo del grafo)."),
  title: z.string(),
  url: z.string().describe("La ficha en Socrático.do o el archivo en el sitio de la institución: la dirección para citar."),
  text: z.string().describe("Qué es, en una línea: tipo, detalle, quién lo publica, fecha y la instantánea de donde sale."),
});
type Hallado = z.infer<typeof Hallado>;

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

async function buscar(query: string): Promise<{ results: Hallado[] }> {
  const q = query.trim().slice(0, 200);
  if (!q) throw new Aviso("La búsqueda está vacía: escribe un nombre, un RNC, un número de decreto o un tema.");
  sinBuscarPorCedula(q);
  const padron = await cortePadron();
  const salida: Hallado[] = [];
  const vistos = new Set<string>();
  const sumar = (h: Hallado) => {
    if (vistos.has(h.id)) return;
    vistos.add(h.id);
    salida.push(h);
  };

  // Lo que se nombra exacto va primero: un decreto por su número, una empresa por su RNC.
  const decreto = (DECRETO.exec(q) ?? /^(\d{1,4}-\d{2})$/.exec(q))?.[1];
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
  if (/^\d{9}$/.test(cifras)) {
    const e = await empresaPorRnc(cifras);
    if (e) sumar({ id: enlace.empresa(e.rnc), title: e.razonSocial, url: absoluta(enlace.empresa(e.rnc)), text: lineaEmpresa(e, padron) });
  }

  // Las provincias no están en el índice: se nombran.
  const a = agujas(q);
  if (a.raices.length > 0) {
    for (const p of PROVINCIAS.filter((x) => contieneTodas(plano(x.nombre), a)).slice(0, TOPE.provincias)) {
      const ruta = rutaDeNodo({ tipo: "provincia", id: p.slug });
      sumar({ id: ruta, title: p.nombre, url: absoluta(ruta), text: `Provincia · cabecera: ${p.cabecera} · límites de la ONE` });
    }
  }

  const [h, empresas] = await Promise.all([
    buscarEnTodo(q, { porPagina: TOPE.indice }),
    a.raices.length > 0 ? buscarEmpresas(q, { limite: TOPE.empresas }) : Promise.resolve(null),
  ]);
  if (!h) throw new Aviso("El índice de búsqueda no cargó. Intenta de nuevo en un momento.");
  for (const r of h.resultados) {
    if (!r.href) continue;
    // Todo lo del índice es de su instantánea; el estado de un proceso o una
    // iniciativa, también: el de ese día.
    const corte = h.instantaneas[r.tipo]?.slice(0, 10);
    sumar({
      id: idDeHref(r.href),
      title: tituloDe(r),
      url: absoluta(r.href),
      text: [
        ETIQUETA_TIPO[r.tipo],
        r.detalle,
        r.origen,
        r.fecha && `fecha ${r.fecha.slice(0, 10)}`,
        r.sueldo && `mediana del sueldo mensual bruto RD$ ${ENTERO.format(r.sueldo.mediana)}`,
        r.valor != null && `${r.tipo === "proceso" ? "valor estimado" : "valor"} RD$ ${ENTERO.format(r.valor)}`,
        r.via === "tema" && "coincide por tema, no por sus palabras",
        corte && `instantánea del ${corte}`,
      ]
        .filter(
          (x, i, todas): x is string =>
            typeof x === "string" && x !== "" && (i === 0 || x.toLocaleLowerCase("es") !== String(todas[0]).toLocaleLowerCase("es")),
        )
        .join(" · "),
    });
  }
  for (const e of empresas?.filas ?? []) {
    const ruta = enlace.empresa(e.rnc);
    sumar({ id: ruta, title: e.razonSocial, url: absoluta(ruta), text: lineaEmpresa(e, padron) });
  }
  return { results: salida.slice(0, TOPE.total) };
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

/** Las relaciones que trae `fetch` y cada página de `neighbors`. */
const POR_PAGINA_RELACIONES = 50;

function lineaRelacion(r: Relacion): string {
  const partes = [r.detalle, r.movimiento, r.fecha?.slice(0, 10)].filter(Boolean);
  const d = destinoDe(r);
  const destino = d.id ? ` → ${d.id}` : d.pista ? ` → ${d.pista}` : d.url ? ` → ${d.url} (fuera de Socrático)` : "";
  return `- ${r.verbo}: ${r.nombre}${partes.length ? ` (${partes.join(" · ")})` : ""}${destino}`;
}

/** Las relaciones agrupadas, cada grupo con su título. */
function bloqueRelaciones(relaciones: Relacion[]): string[] {
  const lineas: string[] = [];
  let grupo: GrupoRelacion | null = null;
  for (const r of relaciones) {
    if (r.grupo !== grupo) {
      grupo = r.grupo;
      lineas.push("", `### ${GRUPOS.find((g) => g.id === grupo)?.etiqueta ?? grupo}`);
    }
    lineas.push(lineaRelacion(r));
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
  const vista = relaciones.slice(0, POR_PAGINA_RELACIONES);
  const paginas = Math.max(1, Math.ceil(relaciones.length / POR_PAGINA_RELACIONES));
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
  lineas.push("", `## Relaciones: ${relaciones.length}${paginas > 1 ? ` (página 1 de ${paginas})` : ""}`);
  if (relaciones.length === 0) lineas.push("Las fuentes no le registran relaciones con otros nodos.");
  lineas.push(...bloqueRelaciones(vista));
  if (relaciones.length > vista.length) {
    lineas.push("", `Siguen ${relaciones.length - vista.length}: pide neighbors con el id «${ruta}» y pagina 2.`);
  }
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
      aviso: AVISO,
    },
  };
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
    metadata: { tipo: "registro", clase: ETIQUETA_TIPO[r.tipo], fuente: "Índice de búsqueda de Socrático.do", corte: dia, externo: r.externo, aviso: AVISO },
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

/* ------------------------------------------------------------- neighbors */

const GRUPOS_ID = GRUPOS.map((g) => g.id) as [GrupoRelacion, ...GrupoRelacion[]];

const Vecino = z.object({
  grupo: z.enum(GRUPOS_ID),
  verbo: z.string().describe("Cómo se lee la relación desde el nodo: «Cargo en», «Firmó», «La supervisa»."),
  nombre: z.string(),
  detalle: z.string().nullable(),
  movimiento: z.string().nullable(),
  fecha: z.string().nullable(),
  id: z
    .string()
    .nullable()
    .describe("El otro extremo, si fetch lo abre: un nodo del grafo o una ficha de la plataforma. null si solo tiene dirección de fuera (url) o lo abre otra herramienta (pista)."),
  url: z.string().nullable().describe("La dirección del otro extremo, para citarlo."),
  pista: z.string().nullable().describe("La herramienta que lo abre, cuando no es fetch: la lista de decretos firmados se pide a signed_decrees."),
  esNodo: z.boolean().describe("Si el otro extremo es un nodo del grafo (se recorre con neighbors o path)."),
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
  const n = nodoDe(id, "neighbors");
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
      ...destinoDe(r),
      esNodo: r.nodo != null,
    })),
    fuente: origen.fuente,
    corte: origen.corte,
    cortes: origen.cortes,
    aviso: AVISO,
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

/* -------------------------------------------------------------- ontology */

const Ontologia = z.object({
  version: z.string(),
  publicada: z.string(),
  espacio: z.string(),
  clases: z.array(
    z.object({ id: z.string(), etiqueta: z.string(), comentario: z.string(), subClaseDe: z.array(z.string()), wikidata: z.array(z.string()) }),
  ),
  propiedades: z.array(
    z.object({
      id: z.string(),
      etiqueta: z.string(),
      comentario: z.string(),
      dominio: z.array(z.string()),
      rango: z.array(z.string()),
      inversa: z.string().nullable(),
    }),
  ),
  esquemas: z.array(z.object({ id: z.string(), etiqueta: z.string(), conceptos: z.array(z.string()) })),
  descargas: z.object({ turtle: z.string(), jsonld: z.string(), ntriples: z.string(), pagina: z.string() }),
  aviso: z.string(),
});

function ontologia(): z.infer<typeof Ontologia> {
  return {
    version: VERSION_ONTOLOGIA,
    publicada: PUBLICADA,
    espacio: PREFIJOS.soc,
    clases: CLASES.map((c) => ({
      id: `soc:${c.id}`,
      etiqueta: c.etiqueta,
      comentario: c.comentario,
      subClaseDe: c.subClaseDe,
      wikidata: (c.wikidata ?? []).map((w) => `wd:${w.qid} (${w.relacion}, ${w.nombre})`),
    })),
    propiedades: PROPIEDADES.map((p) => ({
      id: `soc:${p.id}`,
      etiqueta: p.etiqueta,
      comentario: p.comentario,
      dominio: p.dominio,
      rango: p.rango,
      inversa: p.inversa ? `soc:${p.inversa}` : null,
    })),
    esquemas: esquemas().map((e) => ({ id: `soc:${e.id}`, etiqueta: e.etiqueta, conceptos: e.conceptos.map((c) => c.etiqueta) })),
    descargas: {
      turtle: `${SITIO}/ontologia.ttl`,
      jsonld: `${SITIO}/ontologia.jsonld`,
      ntriples: `${SITIO}/ontologia.nt`,
      pagina: `${SITIO}/ontologia`,
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
 * suelta al responder. Registrar seis herramientas cuesta microsegundos; los
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
        "Busca en los datos públicos del Estado dominicano que ordena Socrático.do: personas con cargo público, instituciones, entidades financieras, empresas del padrón de la DGII (por nombre o RNC), provincias, decretos («Decreto 497-25»), proveedores y procesos de compra, normas, iniciativas del Congreso, sentencias, obras, cargos de la nómina, documentos institucionales y datos abiertos. Por palabras (todas deben estar, tolera una errata) y por tema. Devuelve hasta 30 resultados; abre cada uno con fetch usando su id.",
      inputSchema: z.object({
        query: z.string().min(1).max(1000).describe("Lo que se busca, en español: un nombre, un RNC de nueve cifras, un número de decreto o un tema."),
      }),
      outputSchema: z.object({ results: z.array(Hallado) }),
      annotations: SOLO_LECTURA,
    },
    async ({ query }) => resultado(await correr("search", () => buscar(query))),
  );

  s.registerTool(
    "fetch",
    {
      title: tituloHerramienta("fetch"),
      description:
        "Lee un registro de Socrático.do por el id que devolvió search (o la dirección de su ficha, un RNC o «Decreto 497-25»). Un nodo del grafo trae sus datos, sus relaciones (cargos, decretos, supervisión, declaraciones juradas, medidas de la DGCP, la OFAC, Wikidata) y su fuente con fecha de corte; otro registro trae el resumen del índice y la dirección de su fuente.",
      inputSchema: z.object({ id: Id.describe("El id de un resultado de search.") }),
      outputSchema: Documento,
      annotations: SOLO_LECTURA,
    },
    async ({ id }) => resultado(await correr("fetch", () => leer(id))),
  );

  s.registerTool(
    "neighbors",
    {
      title: tituloHerramienta("neighbors"),
      description:
        "Todas las relaciones de un nodo del grafo (persona, institución, entidad financiera, empresa, decreto o provincia), por páginas de 50 y, si se quiere, de un solo grupo: cargos, decretos, entidades (la misma entidad en otro registro y quien la supervisa), lugares o registros (declaraciones juradas, inscripciones, OFAC, Wikidata).",
      inputSchema: z.object({
        id: Id.describe("El id del nodo, como lo da search o fetch."),
        grupo: z.enum(GRUPOS_ID).optional().describe("Solo las relaciones de este grupo."),
        pagina: z.number().int().min(1).max(1000).optional().describe("La página, desde 1."),
      }),
      outputSchema: Vecinos,
      annotations: SOLO_LECTURA,
    },
    async ({ id, grupo, pagina }) => resultado(await correr("neighbors", () => vecinos(id, grupo, pagina ?? 1))),
  );

  s.registerTool(
    "path",
    {
      title: tituloHerramienta("path"),
      description: `La cadena más corta de relaciones registradas por el Estado entre dos nodos del grafo (por ejemplo, una persona y una institución, o dos personas), buscando desde los dos extremos a la vez: hasta ${TOPE_CAMINO.saltos} saltos y ${TOPE_CAMINO.fichas} fichas abiertas. Si no la encuentra, dice por qué.`,
      inputSchema: z.object({
        desde: Id.describe("El id del primer nodo."),
        hasta: Id.describe("El id del segundo nodo."),
      }),
      outputSchema: Cadena,
      annotations: SOLO_LECTURA,
    },
    async ({ desde, hasta }) => resultado(await correr("path", () => cadena(desde, hasta))),
  );

  s.registerTool(
    "signed_decrees",
    {
      title: tituloHerramienta("signed_decrees"),
      description:
        "Los decretos del Poder Ejecutivo que el registro de la Consultoría Jurídica atribuye a la firma de una persona (un presidente, casi siempre), del más reciente al más viejo, filtrables por año, materia y palabras del título, en páginas de 25.",
      inputSchema: z.object({
        persona: z.string().min(1).max(200).describe("El id de la persona («/funcionarios/luis-rodolfo-abinader-corona») o su nombre."),
        anio: z.number().int().min(1844).max(2100).optional().describe("Solo los de este año."),
        materia: z.enum(MATERIA_SLUGS).optional().describe(`Solo los de esta materia: ${MATERIAS.map((m) => `${m.slug} (${m.nombre})`).join(", ")}.`),
        texto: z.string().max(120).optional().describe("Palabras que deben estar en el número, el título o la etiqueta de institución."),
        pagina: z.number().int().min(1).max(1000).optional().describe("La página, desde 1."),
      }),
      outputSchema: Firmados,
      annotations: SOLO_LECTURA,
    },
    async ({ persona, ...filtros }) => resultado(await correr("signed_decrees", () => decretosFirmados(persona, filtros))),
  );

  s.registerTool(
    "ontology",
    {
      title: tituloHerramienta("ontology"),
      description:
        "Las clases, relaciones y vocabularios controlados del grafo de Socrático.do (OWL y RDFS, alineados con schema.org, W3C ORG, ELI, FOAF y Wikidata): qué es cada tipo de nodo y qué quiere decir cada relación.",
      inputSchema: z.object({}),
      outputSchema: Ontologia,
      annotations: SOLO_LECTURA,
    },
    async () => resultado(ontologia()),
  );

  return s;
}
