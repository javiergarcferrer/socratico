import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SITIO } from "@/lib/sitio";
import { enlace, type NodoRdf } from "@/lib/grafo";
import { booleano, decimal, entero, fecha, iri, lit, t } from "@/lib/rdf";
import {
  ETIQUETA_ORIGEN,
  gobiernoDeProvincia,
  getFuncionarios,
  personaPorFirma,
  personasDeInstitucion,
  personasDelDecreto,
  quienDirige,
  esActual,
  type Cargo,
  type OrigenCargo,
  type Persona,
} from "@/lib/funcionarios";
import { FUENTES_DEL_CRUCE, INSTITUCIONES, institucionDeUnidad, institucionPorId } from "@/lib/instituciones";
import { decretoPorNumero, decretosDeFirmante, hrefDecreto, indiceDecretos, CONSULTORIA_PDF, type Decreto } from "@/lib/decretos";
import { declaracionesDe, declaracionesDeInstitucion, getDeclaraciones } from "@/lib/declaraciones";
import { entidadDeInstitucion, entidadPorRnc, entidadPorSlug, getFinancieras, institucionDe } from "@/lib/financieras";
import { empresaPorRnc, padronEmpresas } from "@/lib/empresas";
import { medidasDeRnc, medidasDeRpe, ofacDeRnc, hrefFichaOfac, getSanciones, type ProveedorConMedidas } from "@/lib/sanciones";
import { PROVINCIAS, provinciaDeSlug, provinciaDeTexto } from "@/lib/provincias";
import { getWikidata, wikidataDe } from "@/lib/wikidata";
import { contarContrataciones, getResumenHistorico, historiaDeInstitucion, historiaDeProveedor, rncDeProveedor } from "@/lib/historico";
import { desdeMayusculas } from "@/lib/congreso";
import { formatFecha } from "@/lib/format";
import { getRegistroTributario } from "@/lib/rnc";
import { sinCedula } from "@/lib/padron";
import { coberturaDe, todosLosProcesos, type ProcesoIndexado } from "@/lib/tablas-compras";
import { getDetalleObras, getObras, urlFichaMapaInversiones, type Obra, type ProcesoDeObra } from "@/lib/obras";
import {
  ETAPAS,
  ETAPA_DE_LA_DGCP,
  MODALIDADES,
  MODALIDAD_DE_LA_DGCP,
  OBJETO_DE_LA_DGCP,
  claveSectorInversion,
  type ClaveEtapa,
  type ClaveModalidad,
} from "@/lib/vocabulario-compras";
import { Afirmaciones, describirEmpresaSola, iriDe, nombreDecreto, type ClaveGrafo, type Descripcion } from "@/lib/grafo-nodo";
import type { ClaseContada, MetaGrafo } from "@/lib/grafo-compilado";

/**
 * Los constructores del grafo: de las instantáneas a los triples de cada
 * nodo (lo que es, lo que dice y con quién se liga). Los corre **solo el
 * compilador** (`scripts/build-grafo.mjs`, docs/INFRAESTRUCTURA.md §7), que
 * guarda lo que afirman en `datos/grafo/`; el servidor lee eso
 * (`lib/grafo-compilado.ts`) y ninguna ruta importa este módulo: si una lo
 * hiciera, su función arrastraría todas las instantáneas que lee.
 *
 * La cosa es el IRI de su ficha con `#id` («la persona»); sin él, la página
 * que la describe. Un cargo es un nodo propio (`#cargo-…`, W3C ORG
 * `Membership`) porque tiene fecha, movimiento y decreto. Un decreto sin ficha
 * propia usa como IRI el de su PDF en la Consultoría. Cada vecino lleva su
 * `rdfs:label`, así la descripción se lee sola.
 *
 * Qué no entra, a propósito: la cédula (nunca está), los parentescos, las
 * biografías y los consejos de administración de la banca (particulares).
 */

const DE = (id: number) => iriDe({ tipo: "institucion", id: String(id) });

/** Un hash corto y estable para los nodos que no tienen identificador propio (un cargo, una medida). */
function huella(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** El IRI de un decreto: su ficha si la tiene; si no, su PDF en la Consultoría. */
function iriDecreto(d: Pick<Decreto, "numero" | "ficha" | "docId">): string | null {
  const href = hrefDecreto(d);
  if (!href) return null;
  return href.startsWith("/") ? `${SITIO}${href}#id` : href;
}


const SUPERVISOR_INSTITUCION: Record<string, number> = { sb: 639, sipen: 674, sis: 895, idecoop: 839 };
const BANCARIOS = new Set(["banco-multiple", "asociacion", "ahorro-credito", "corporacion-credito", "entidad-publica", "cooperativa"]);

/**
 * La descripción RDF de un nodo, armada de las instantáneas. `ligero` deja
 * solo el nodo y sus datos propios, sin los cargos, las designaciones ni las
 * medidas que lo rodean: de ahí sale el schema.org de cada ficha
 * (`lib/grafo-ld.ts`), donde el vecindario sobra.
 */
export async function describirEnVivo(n: NodoRdf, ligero = false): Promise<Descripcion | null> {
  switch (n.tipo) {
    case "funcionario":
      return describirPersona(n.id, ligero);
    case "institucion":
      return describirInstitucion(Number(n.id), ligero);
    case "entidad-financiera":
      return describirFinanciera(n.id);
    case "empresa":
      return describirEmpresa(n.id, ligero);
    case "decreto":
      return describirDecreto(n.id, ligero);
    case "provincia":
      return describirProvincia(n.id, ligero);
    case "proveedor":
      return describirProveedor(n.id, ligero);
    case "proceso":
      return describirProceso(n.id, ligero);
    case "obra":
      return describirObra(n.id, ligero);
  }
}

/* ------------------------------------------------------ los grafos con nombre */

/** Un grafo con nombre: qué es, de qué fuente y de qué corte, o de qué regla (`ClaveGrafo`). */
export interface DefinicionGrafo {
  clave: ClaveGrafo;
  etiqueta: string;
  descripcion: string;
  /** Lo que se leyó: `prov:wasDerivedFrom`. */
  fuentes: string[];
  /** La fecha de la instantánea (ISO), si la tiene. */
  corte: string | null;
  /** Si lo afirma una regla de Socrático, de qué grafos lo deriva. */
  derivado?: { de: ClaveGrafo[] };
}

/** El padrón de la DGII que lee `scripts/build-empresas.py`. */
const PADRON_DGII = "https://dgii.gov.do/app/WebApps/Consultas/RNC/RNC_CONTRIBUYENTES.zip";
/** La API del SIL que lee `scripts/build-funcionarios.py` para los legisladores (`lib/congreso.ts`). */
const SIL = "https://www.diputadosrd.gob.do/sil/api";

const leerInstantanea = async <T>(ruta: string): Promise<T> => JSON.parse(await readFile(join(process.cwd(), "public", "data", ruta), "utf8")) as T;
const dia = (x: string | null | undefined) => x?.slice(0, 10) ?? null;

/**
 * Los grafos con nombre del compilado, en un orden fijo: cada uno con su
 * fuente y su corte, leídos de las mismas instantáneas que los constructores.
 * Un triple sale de una fuente (lo que dice el Estado, tal cual) o de una
 * regla de Socrático (lo que la plataforma infiere o cruza): las dos cosas no
 * se mezclan nunca en un mismo grafo (docs/INFRAESTRUCTURA.md §7).
 */
export async function grafosEnVivo(): Promise<DefinicionGrafo[]> {
  type Organo = { url: string };
  const [f, ind, fin, dj, sanc, padron, historico, w] = await Promise.all([
    leerInstantanea<{ generado: string; fuentes: { map: { url: string; corte: string }; decretos: { url: string }; organos: Record<string, Organo>; electos2024: { url: string } } }>(
      "funcionarios.json",
    ),
    indiceDecretos(),
    getFinancieras(),
    leerInstantanea<{ generado: string; camara: string; fuentes: { base: string }[] }>("declaraciones.json"),
    leerInstantanea<{ fuentes: { dgcp: { url: string; urlRegistro: string; corte: string }; ofac: { url: string; fecha: string } } }>("sanciones.json"),
    padronEmpresas(),
    getResumenHistorico(),
    leerInstantanea<{ fuente: string; generado: string }>("wikidata.json"),
  ]);
  if (!ind || !fin || !padron || !historico) throw new Error("falta una instantánea: decretos, banca, padrón o histórico");
  const fuentesBanca = await leerInstantanea<{ fuentes: Record<string, string> }>("banca.json");
  const [procesos, obras] = await Promise.all([
    leerInstantanea<{ fuente: string; hasta: string }>("procesos.json"),
    leerInstantanea<{ corte: string; fuente: string; archivos: Record<string, { nombre: string }> }>("obras.json"),
  ]);
  const cargo = (origen: OrigenCargo, url: string | null): DefinicionGrafo => ({
    clave: `cargos-${origen}`,
    etiqueta: `Cargos: ${ETIQUETA_ORIGEN[origen]}`,
    descripcion: `Los cargos que registra ${ETIQUETA_ORIGEN[origen]}, con su titular, su institución, su provincia, su movimiento y su decreto.`,
    fuentes: url ? [url] : [],
    corte: dia(f.generado),
  });
  const organo = (k: string) => f.fuentes.organos[k]?.url ?? null;
  const cargos: ClaveGrafo[] = (Object.keys(ETIQUETA_ORIGEN) as OrigenCargo[]).map((o) => `cargos-${o}` as const);
  return [
    {
      clave: "instituciones",
      etiqueta: "Instituciones del Estado",
      descripcion: "El Clasificador Institucional de DIGEPRES cruzado con las unidades de compra de la DGCP: nombre, siglas y sector de cada institución.",
      fuentes: [FUENTES_DEL_CRUCE.clasificador.url, FUENTES_DEL_CRUCE.dgcp.url],
      corte: dia(FUENTES_DEL_CRUCE.clasificador.consultado),
    },
    cargo("map", f.fuentes.map.url),
    cargo("decreto", f.fuentes.decretos.url),
    cargo("scj", organo("scj")),
    cargo("cpj", organo("cpj")),
    cargo("tc", organo("tc")),
    cargo("tse", organo("tse")),
    cargo("jce", organo("jce")),
    cargo("jce-suplentes", organo("jce-suplentes")),
    cargo("defensor", organo("defensor")),
    cargo("jce2024", f.fuentes.electos2024.url),
    cargo("congreso", SIL),
    cargo("bcrd", organo("bcrd")),
    {
      clave: "decretos",
      etiqueta: "Registro de decretos de la Consultoría Jurídica",
      descripcion: "Cada decreto con su número, su fecha, su título, la etiqueta que le pone la Consultoría y su PDF.",
      fuentes: [ind.fuente.url],
      corte: dia(ind.generado),
    },
    {
      clave: "declaraciones",
      etiqueta: "Declaraciones juradas publicadas",
      descripcion: "Las declaraciones juradas de patrimonio que publican las instituciones en sus portales de transparencia: título, fecha y quién las publica.",
      fuentes: [dj.camara, ...dj.fuentes.map((x) => `https://${x.base}/`)],
      corte: dia(dj.generado),
    },
    {
      clave: "banca",
      etiqueta: "Entidades financieras supervisadas",
      descripcion: "Bancos, asociaciones, cooperativas, AFP y aseguradoras, según la SB, la SIPEN, la SIS y el IDECOOP: nombre, razón social, tipo, estado, RNC y quién las supervisa.",
      fuentes: Object.values(fuentesBanca.fuentes),
      corte: dia(fin.generado),
    },
    {
      clave: "padron",
      etiqueta: "Padrón de contribuyentes de la DGII",
      descripcion: "Las personas jurídicas del padrón: RNC, razón social, estado, actividad e inicio de operaciones.",
      fuentes: [PADRON_DGII],
      corte: dia(padron.corteDgii ?? padron.generado),
    },
    {
      clave: "proveedores",
      etiqueta: "Registro de Proveedores del Estado (DGCP)",
      descripcion: "El RPE que el registro de la DGCP da a cada RNC: qué empresa está inscrita como qué proveedor.",
      fuentes: [sanc.fuentes.dgcp.urlRegistro],
      corte: dia(padron.generado),
    },
    {
      clave: "contratos",
      etiqueta: "Contratos de la DGCP desde 2015",
      descripcion: "Lo que cada institución le contrató a cada proveedor desde 2015, agregado: contratos y monto (contratado, no pagado).",
      fuentes: historico.fuentes.slice(0, 1),
      corte: dia(historico.corte),
    },
    {
      clave: "medidas",
      etiqueta: "Medidas de la DGCP sobre proveedores",
      descripcion: "Inhabilitaciones, suspensiones, penalidades y levantamientos sobre inscripciones de proveedor.",
      fuentes: [sanc.fuentes.dgcp.url],
      corte: dia(sanc.fuentes.dgcp.corte),
    },
    {
      clave: "procesos",
      etiqueta: "Procesos de compra de la DGCP",
      descripcion:
        "Los procesos de compra publicados en los últimos doce meses: código, carátula, unidad de compra, modalidad, etapa el día del corte, objeto, fecha de publicación y valor estimado.",
      fuentes: [procesos.fuente],
      corte: dia(procesos.hasta),
    },
    {
      clave: "obras",
      etiqueta: "Proyectos de inversión pública (MapaInversiones)",
      descripcion:
        "Los proyectos del Sistema Nacional de Inversión Pública que publica MapaInversiones: nombre, estado, valor, avance, sector, entidad ejecutora, provincias y fechas, con sus procesos de compra y sus contratos (contratista, monto y estado).",
      // Los CSV abiertos que lee `scripts/build-obras.py`, en `…/opendata/`.
      fuentes: Object.values(obras.archivos).map((a) => `https://mapainversiones.gob.do/opendata/${a.nombre}`),
      corte: dia(obras.corte),
    },
    {
      clave: "ofac",
      etiqueta: "Lista SDN de la OFAC",
      descripcion: "Las entradas de la lista de sanciones del Tesoro de los Estados Unidos atadas a un RNC dominicano.",
      fuentes: [sanc.fuentes.ofac.url],
      corte: dia(sanc.fuentes.ofac.fecha),
    },
    {
      clave: "wikidata",
      etiqueta: "Correspondencias con Wikidata",
      descripcion: "El QID de provincias, instituciones, entidades financieras y personas con cargo, buscado en la réplica de QLever y revisado por su etiqueta.",
      fuentes: [w.fuente],
      corte: dia(w.generado),
    },
    {
      clave: "provincias",
      etiqueta: "Provincias",
      descripcion: "Las 31 provincias y el Distrito Nacional, con su nombre, en la República Dominicana.",
      fuentes: [],
      corte: null,
    },
    {
      clave: "personas",
      etiqueta: "Personas con cargo público (regla de identidad)",
      descripcion:
        "Quién es cada persona: los registros de cargo de todas las fuentes que llevan el mismo nombre normalizado son una persona, y un nombre repetido con historias que no casan se separa. Nunca se unen homónimos sin prueba; nunca la cédula.",
      fuentes: [],
      corte: dia(f.generado),
      derivado: { de: cargos },
    },
    {
      clave: "pep",
      etiqueta: "Personas expuestas políticamente (regla PEP)",
      descripcion:
        "Ley 155-17, art. 2, num. 19, y Ley 311-14: es PEP quien ocupa un cargo obligado a declarar patrimonio, o lo dejó en los tres años antes del corte de las personas. El numeral de la Ley 311-14 de cada cargo lo asigna Socrático por su título.",
      fuentes: [],
      corte: dia(f.generado),
      derivado: { de: [...cargos, "personas"] },
    },
    {
      clave: "vigente",
      etiqueta: "Cargos de hoy y quién encabeza (regla)",
      descripcion:
        "El cargo de hoy es el que su fuente da como vigente o electo para 2024-2028. Encabeza una institución el cargo de más arriba que el MAP da hoy en ella o, si no hay, la designación más reciente de una cabeza por decreto del Presidente en funciones, si ningún decreto posterior la sacó.",
      fuentes: [],
      corte: dia(f.generado),
      derivado: { de: [...cargos, "personas"] },
    },
    {
      clave: "identidad",
      etiqueta: "Un mismo ente en dos registros (regla)",
      descripcion:
        "Una institución que es también una entidad financiera, una entidad financiera con RNC en el padrón, una persona que es legisladora en el SIL, y a quién se atribuye una declaración jurada: por identificador o por nombre normalizado, nunca entre homónimos.",
      fuentes: [],
      corte: dia(f.generado),
      derivado: { de: ["instituciones", "banca", "padron", "personas", "cargos-congreso", "declaraciones"] },
    },
    {
      clave: "firma",
      etiqueta: "Decretos y personas: firma y designación (regla)",
      descripcion:
        "Quién firma cada decreto (la firma del registro, atada a una persona), qué decretos firmó y cuántos, a quién designa un decreto (el que cita su cargo), y el aviso cuando la fecha de la fila cae fuera de los períodos de su firmante.",
      fuentes: [],
      corte: dia(ind.generado),
      derivado: { de: ["decretos", "personas", ...cargos] },
    },
    {
      clave: "materia",
      etiqueta: "Materia de cada decreto (regla)",
      descripcion: "La materia de un decreto (designaciones, pensiones, ascensos…), deducida de su título y de la etiqueta de la Consultoría.",
      fuentes: [],
      corte: dia(ind.generado),
      derivado: { de: ["decretos"] },
    },
    {
      clave: "plataforma",
      etiqueta: "Socrático.do",
      descripcion: "La ficha de cada nodo en la plataforma (foaf:page, rdfs:seeAlso) y el nombre provisional («RPE 123») de lo que no tiene nombre en su fuente.",
      fuentes: [],
      corte: null,
      derivado: { de: [] },
    },
  ];
}

/* ---------------------------------------------------------------- persona */

/** Los triples de un cargo, con el vecindario que hace falta para leerlo. Lo dice la fuente del cargo. */
async function triplesCargo(persona: Persona, c: Cargo, x: Afirmaciones): Promise<string> {
  const g: ClaveGrafo = `cargos-${c.origen}`;
  const pIri = iriDe({ tipo: "funcionario", id: persona.id });
  const cIri = `${SITIO}${enlace.funcionario(persona.id)}#cargo-${huella(
    [c.titulo, c.fecha, c.movimiento, c.decreto?.numero ?? "", c.origen].join("|"),
  )}`;
  x.de(
    g,
    t(cIri, "rdf:type", iri("soc:Cargo")),
    t(cIri, "rdf:type", iri("org:Membership")),
    t(cIri, "rdfs:label", lit(c.titulo, "es")),
    t(cIri, "schema:roleName", lit(c.titulo, "es")),
    t(cIri, "soc:titular", iri(pIri)),
    t(cIri, "org:member", iri(pIri)),
    t(cIri, "soc:movimiento", iri(`do:movimiento-${c.movimiento}`)),
    t(cIri, "dct:source", lit(ETIQUETA_ORIGEN[c.origen], "es")),
    t(pIri, "soc:ocupa", iri(cIri)),
  );
  if (c.fecha) x.de(g, t(cIri, "soc:fecha", fecha(c.fecha)));
  if (c.periodo) x.de(g, t(cIri, "schema:description", lit(`Período ${c.periodo}`, "es")));
  // El numeral de la Ley 311-14 lo asigna Socrático al título del cargo: es de la regla PEP.
  if (c.numeral311 != null) x.de("pep", t(cIri, "do:numeralLey311", entero(c.numeral311)));
  if (c.url) x.de(g, t(cIri, "dct:source", iri(c.url)));
  if (c.institucionId != null) {
    const inst = institucionPorId(c.institucionId);
    if (inst) {
      x.de(g, t(cIri, "soc:enInstitucion", iri(DE(inst.id))), t(cIri, "org:organization", iri(DE(inst.id))));
      x.de("instituciones", t(DE(inst.id), "rdfs:label", lit(inst.nombre, "es")));
    }
  }
  const prov = provinciaDeTexto(c.provincia);
  if (prov) {
    const pr = iriDe({ tipo: "provincia", id: prov.slug });
    x.de(g, t(cIri, "soc:enProvincia", iri(pr)));
    x.de("provincias", t(pr, "rdfs:label", lit(prov.nombre, "es")));
  }
  if (c.decreto?.numero) {
    const d = await decretoPorNumero(c.decreto.numero);
    const ficha = d != null && (c.decreto.docId == null || d.docId === c.decreto.docId);
    const dIri = iriDecreto({ numero: c.decreto.numero, ficha, docId: c.decreto.docId ?? d?.docId ?? null });
    if (dIri) {
      x.de(g, t(cIri, "soc:segunDecreto", iri(dIri)));
      x.de("decretos", t(dIri, "rdf:type", iri("soc:Decreto")), t(dIri, "rdfs:label", lit(nombreDecreto(c.decreto.numero), "es")));
    }
  }
  return cIri;
}

/** Cuántos decretos firmados, los más recientes, entran en la descripción de quien firma. */
const TOPE_FIRMADOS = 20;

async function describirPersona(id: string, ligero = false): Promise<Descripcion | null> {
  const f = await getFuncionarios();
  const p = f?.porId.get(id);
  if (!p) return null;
  let nota: string | undefined;
  const s = iriDe({ tipo: "funcionario", id });
  const x = new Afirmaciones();
  x.de(
    "personas",
    t(s, "rdf:type", iri("soc:Persona")),
    t(s, "rdf:type", iri("schema:Person")),
    t(s, "rdf:type", iri("foaf:Person")),
    t(s, "rdfs:label", lit(p.nombre)),
    t(s, "schema:name", lit(p.nombre)),
  );
  x.de("plataforma", t(s, "foaf:page", iri(`${SITIO}${enlace.funcionario(id)}`)));
  x.de("pep", t(s, "soc:pepVigente", booleano(p.pepVigente)));
  if (p.pepVigente) x.de("pep", t(s, "rdf:type", iri("soc:PersonaExpuestaPoliticamente")));
  for (const a of p.alias) x.de("personas", t(s, "skos:altLabel", lit(a)));
  for (const c of p.cargos) {
    if (!ligero) await triplesCargo(p, c, x);
    // Lo que schema.org lee de una persona: el cargo de hoy y dónde.
    if (esActual(c)) {
      x.de("vigente", t(s, "schema:jobTitle", lit(c.titulo, "es")));
      if (c.institucionId != null && institucionPorId(c.institucionId)) x.de("vigente", t(s, "schema:worksFor", iri(DE(c.institucionId))));
    }
  }
  if (p.firma) {
    x.de("firma", t(s, "soc:decretosFirmados", entero(p.firma.decretos)));
    x.de("plataforma", t(s, "rdfs:seeAlso", iri(`${SITIO}${enlace.decretosFirmados(id)}`)));
    // Los más recientes, como aristas: los demás están en su lista de decretos.
    // Una fila fechada fuera de sus períodos de firma no se le atribuye.
    if (!ligero) {
      const suyos = (await decretosDeFirmante(p.firma.clave)).filter((d) => d.ficha && d.numero && d.aviso !== "fuera");
      const recientes = [...suyos].sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "")).slice(0, TOPE_FIRMADOS);
      for (const d of recientes) {
        const dIri = iriDe({ tipo: "decreto", id: d.numero! });
        x.de("firma", t(s, "soc:firmo", iri(dIri)));
        x.de(
          "decretos",
          t(dIri, "rdf:type", iri("soc:Decreto")),
          t(dIri, "rdfs:label", lit(nombreDecreto(d.numero), "es")),
          t(dIri, "dct:title", lit(d.titulo, "es")),
        );
        if (d.fecha) x.de("decretos", t(dIri, "soc:fecha", fecha(d.fecha)));
      }
      if (suyos.length > recientes.length) {
        nota = `Se describen los ${recientes.length} decretos más recientes de los ${p.firma.decretos.toLocaleString("es-DO")} que firmó; la lista entera está en su ficha.`;
      }
    }
  }
  if (p.legislador != null) {
    const l = `${SITIO}${enlace.legislador(p.legislador)}#id`;
    x.de("identidad", t(s, "owl:sameAs", iri(l)));
  }
  for (const d of ligero ? [] : await declaracionesDe(id)) {
    // A quién es la declaración lo decide Socrático por el nombre; el documento, lo publica la institución.
    x.de("identidad", t(s, "soc:declaracion", iri(d.url)));
    x.de("declaraciones", t(d.url, "rdf:type", iri("soc:DeclaracionJurada")), t(d.url, "dct:title", lit(d.titulo, "es")));
    if (d.institucionId != null) x.de("declaraciones", t(d.url, "soc:publicadaPor", iri(DE(d.institucionId))));
    if (d.fecha) x.de("declaraciones", t(d.url, "schema:uploadDate", fecha(d.fecha)));
  }
  // Su QID de Wikidata, solo si es PEP hoy o firmó decretos como jefe de
  // Estado: la regla de proporcionalidad de su ficha (solo esas se ofrecen a
  // los buscadores). La página de Wikidata trae biografía y familia, que la
  // plataforma no publica; de quien dejó un cargo hace años no se enlaza.
  const qid = p.pepVigente || p.firma ? await wikidataDe({ tipo: "funcionario", id }) : null;
  if (qid) x.de("wikidata", t(s, "owl:sameAs", iri(`wd:${qid}`)));
  return { triples: x.triples, grafos: x.grafos, titulo: p.nombre, nota };
}

/* ------------------------------------------------------------- institución */

/** Hasta cuántos cargos de hoy se describen en la ficha de una institución. */
const TOPE_CARGOS = 200;

async function describirInstitucion(id: number, ligero = false): Promise<Descripcion | null> {
  const inst = institucionPorId(id);
  if (!inst) return null;
  let nota: string | undefined;
  const s = DE(inst.id);
  const x = new Afirmaciones();
  x.de(
    "instituciones",
    t(s, "rdf:type", iri("soc:Institucion")),
    t(s, "rdf:type", iri("schema:GovernmentOrganization")),
    t(s, "rdf:type", iri("org:FormalOrganization")),
    t(s, "rdfs:label", lit(inst.nombre, "es")),
    t(s, "schema:name", lit(inst.nombre, "es")),
    t(s, "soc:sector", iri(`do:sector-${inst.sector}`)),
  );
  x.de("plataforma", t(s, "foaf:page", iri(`${SITIO}${enlace.institucion(inst.id, inst.acronimo || inst.nombre)}`)));
  if (inst.acronimo) x.de("instituciones", t(s, "schema:alternateName", lit(inst.acronimo)), t(s, "skos:altLabel", lit(inst.acronimo)));
  const f = ligero ? null : await getFuncionarios();
  if (f) {
    const cabeza = quienDirige(f, inst.id);
    if (cabeza) {
      const p = iriDe({ tipo: "funcionario", id: cabeza.persona.id });
      x.de("vigente", t(p, "soc:dirige", iri(s)), t(p, "org:headOf", iri(s)));
      x.de("personas", t(p, "rdfs:label", lit(cabeza.persona.nombre)));
    }
    const vigentes = personasDeInstitucion(f, inst.id).filter(({ cargo }) => esActual(cargo));
    const hoy = vigentes.slice(0, TOPE_CARGOS);
    if (vigentes.length > hoy.length) nota = `Se describen ${hoy.length} de sus ${vigentes.length} cargos vigentes, en el orden de la institución.`;
    for (const { persona, cargo } of hoy) {
      await triplesCargo(persona, cargo, x);
      x.de("personas", t(iriDe({ tipo: "funcionario", id: persona.id }), "rdfs:label", lit(persona.nombre)));
    }
  }
  const banco = await entidadDeInstitucion(inst.id);
  if (banco) {
    const b = iriDe({ tipo: "entidad-financiera", id: banco.slug });
    x.de("identidad", t(s, "owl:sameAs", iri(b)));
    x.de("banca", t(b, "rdfs:label", lit(banco.nombre)));
  }
  for (const d of ligero ? [] : await declaracionesDeInstitucion(inst.id)) {
    x.de(
      "declaraciones",
      t(d.url, "rdf:type", iri("soc:DeclaracionJurada")),
      t(d.url, "dct:title", lit(d.titulo, "es")),
      t(d.url, "soc:publicadaPor", iri(s)),
    );
  }
  // Lo que contrató desde 2015: sus doce mayores proveedores (`lib/historico.ts`).
  const historia = ligero ? null : (await historiaDeInstitucion(inst.id))?.historia;
  for (const [rpe, nombre, contratos, monto] of historia?.top ?? []) {
    await triplesContratacion({ uc: inst.id, rpe, proveedor: nombre, contratos, monto }, x);
  }
  if (historia && historia.proveedores > historia.top.length) {
    const compras = `Se describen sus ${historia.top.length} mayores proveedores de los ${historia.proveedores.toLocaleString("es-DO")} a los que contrató desde 2015.`;
    nota = nota ? `${nota} ${compras}` : compras;
  }
  // Lo que publicó en el último año y lo que ejecuta: los de mayor valor.
  if (!ligero) {
    const [p, o] = await Promise.all([indiceProcesos(), indiceObras()]);
    const procesos = p.porInstitucion.get(inst.id) ?? [];
    for (const q of procesos.slice(0, TOPE_COMPRAS)) {
      x.de("procesos", t(PROCESO(q.codigo), "soc:comprador", iri(s)));
      vecinoProceso(q.codigo, x, p, o);
    }
    if (procesos.length > TOPE_COMPRAS) {
      const mas = `Se describen sus ${TOPE_COMPRAS} procesos de compra de mayor valor estimado de los ${procesos.length.toLocaleString("es-DO")} que publicó del ${formatFecha(p.desde ?? undefined)} al ${formatFecha(p.hasta ?? undefined)}.`;
      nota = nota ? `${nota} ${mas}` : mas;
    }
    const obras = o.porInstitucion.get(inst.id) ?? [];
    for (const obra of obras.slice(0, TOPE_COMPRAS)) {
      x.de("obras", t(OBRA(obra.snip), "soc:ejecutadoPor", iri(s)));
      vecinaObra(obra, x);
    }
    if (obras.length > TOPE_COMPRAS) {
      const mas = `Se describen sus ${TOPE_COMPRAS} obras de mayor valor de las ${obras.length.toLocaleString("es-DO")} que ejecuta según MapaInversiones.`;
      nota = nota ? `${nota} ${mas}` : mas;
    }
  }
  const qid = await wikidataDe({ tipo: "institucion", id: String(inst.id) });
  if (qid) x.de("wikidata", t(s, "owl:sameAs", iri(`wd:${qid}`)));
  return { triples: x.triples, grafos: x.grafos, titulo: inst.nombre, nota };
}

/* ------------------------------------------------------ entidad financiera */

async function describirFinanciera(slug: string): Promise<Descripcion | null> {
  const e = await entidadPorSlug(slug);
  if (!e) return null;
  const s = iriDe({ tipo: "entidad-financiera", id: slug });
  const x = new Afirmaciones();
  x.de(
    "banca",
    t(s, "rdf:type", iri("soc:EntidadFinanciera")),
    t(s, "rdf:type", iri(BANCARIOS.has(e.sector) ? "schema:BankOrCreditUnion" : "schema:FinancialService")),
    t(s, "rdf:type", iri("org:FormalOrganization")),
    t(s, "rdfs:label", lit(e.nombre)),
    t(s, "schema:name", lit(e.nombre)),
  );
  x.de("plataforma", t(s, "foaf:page", iri(`${SITIO}${enlace.entidadFinanciera(slug)}`)));
  if (e.razonSocial) x.de("banca", t(s, "schema:legalName", lit(e.razonSocial)));
  if (e.siglas) x.de("banca", t(s, "schema:alternateName", lit(e.siglas)));
  if (e.tipo) x.de("banca", t(s, "schema:description", lit(e.tipo, "es")));
  if (e.estatus) x.de("banca", t(s, "soc:estado", lit(e.estatus, "es")));
  if (e.web) x.de("banca", t(s, "foaf:homepage", iri(e.web)));
  const sup = SUPERVISOR_INSTITUCION[e.supervisor];
  if (sup) {
    const inst = institucionPorId(sup);
    x.de("banca", t(s, "soc:supervisadaPor", iri(DE(sup))));
    if (inst) x.de("instituciones", t(DE(sup), "rdfs:label", lit(inst.nombre, "es")));
  }
  if (e.rnc) {
    x.de("banca", t(s, "do:rnc", lit(e.rnc)), t(s, "schema:taxID", lit(e.rnc)));
    const emp = await empresaPorRnc(e.rnc);
    if (emp) {
      const em = iriDe({ tipo: "empresa", id: e.rnc });
      x.de("identidad", t(s, "owl:sameAs", iri(em)));
      x.de("padron", t(em, "rdfs:label", lit(emp.razonSocial)));
    }
  }
  const inst = institucionDe(e);
  if (inst) {
    x.de("identidad", t(s, "owl:sameAs", iri(DE(inst.id))));
    x.de("instituciones", t(DE(inst.id), "rdfs:label", lit(inst.nombre, "es")));
  }
  const qid = await wikidataDe({ tipo: "entidad-financiera", id: slug });
  if (qid) x.de("wikidata", t(s, "owl:sameAs", iri(`wd:${qid}`)));
  return { triples: x.triples, grafos: x.grafos, titulo: e.nombre };
}

/* --------------------------------------------------------------- empresa */

async function describirEmpresa(rnc: string, ligero = false): Promise<Descripcion | null> {
  const e = await empresaPorRnc(rnc);
  if (!e) return null;
  const s = iriDe({ tipo: "empresa", id: e.rnc });
  // Lo que dice su fila del padrón: la plantilla con que se describe también la empresa que el compilado no trae.
  const x = new Afirmaciones();
  describirEmpresaSola(e, x);
  for (const rpe of e.rpe) {
    const pr = PROVEEDOR(rpe);
    // Su nombre, el mismo que dice su propia descripción (`nombreDeProveedor`).
    const n = await nombreDeProveedor(rpe);
    x.de("proveedores", t(s, "soc:inscritaComo", iri(pr)), t(pr, "rdf:type", iri("soc:Proveedor")), t(pr, "do:rpe", lit(rpe)));
    x.de(n.grafo, t(pr, "rdfs:label", lit(n.nombre)));
  }
  for (const p of ligero ? [] : await medidasDeRnc(e.rnc)) triplesMedidas(p, x);
  // Lo que el Estado le contrató desde 2015, por cada inscripción: sus ocho mayores clientes.
  for (const rpe of ligero ? [] : e.rpe) {
    const h = await historiaDeProveedor(rpe);
    for (const [uc, contratos, monto] of h?.historia.clientes ?? []) {
      const inst = institucionPorId(uc);
      if (!inst) continue;
      await triplesContratacion({ uc, rpe, proveedor: h!.historia.nombre, contratos, monto, institucion: inst.nombre, empresa: s }, x);
    }
  }
  // Sus contratos de obra, por todas sus inscripciones: los de mayor monto.
  let nota: string | undefined;
  if (!ligero && e.rpe.length) {
    const [p, o] = await Promise.all([indiceProcesos(), indiceObras()]);
    const suyos = e.rpe.flatMap((rpe) => o.contratosDeProveedor.get(String(Number(rpe))) ?? []).sort(porMonto);
    for (const k of suyos.slice(0, TOPE_COMPRAS)) await triplesContrato(k, x, p, o);
    if (suyos.length > TOPE_COMPRAS) {
      nota = `Se describen sus ${TOPE_COMPRAS} contratos de obra de mayor monto de los ${suyos.length.toLocaleString("es-DO")} que lista MapaInversiones.`;
    }
  }
  const ofac = await ofacDeRnc(e.rnc);
  if (ofac) x.de("ofac", t(s, "rdfs:seeAlso", iri(hrefFichaOfac(ofac.ent))));
  const banco = await entidadPorRnc(e.rnc);
  if (banco) {
    const b = iriDe({ tipo: "entidad-financiera", id: banco.slug });
    x.de("identidad", t(s, "owl:sameAs", iri(b)));
    x.de("banca", t(b, "rdfs:label", lit(banco.nombre)));
  }
  return { triples: x.triples, grafos: x.grafos, titulo: e.razonSocial, nota };
}

/* --------------------------------------------------------- contrataciones */

/** La tabla de contratos de la DGCP, de donde salen las contrataciones (`scripts/build-historico.py`). */
const FUENTE_CONTRATOS = "https://datosabiertos.dgcp.gob.do/api-dgcp/v1/tablas/contratos?Type=csv";

/**
 * Una contratación (lo que una institución le contrató a un proveedor desde
 * 2015, agregado) con el mismo IRI la describa quien la describa: la
 * institución o la empresa. Si el RNC del proveedor es de una persona
 * jurídica (`rncDeProveedor`), la empresa queda inscrita como él y el camino
 * institución → empresa se recorre; una persona física queda como proveedor,
 * con su ficha, sin nodo propio.
 */
async function triplesContratacion(
  c: { uc: number; rpe: string; proveedor: string; contratos: number; monto: number; institucion?: string; empresa?: string },
  x: Afirmaciones,
): Promise<void> {
  const pr = `${SITIO}${enlace.proveedor(c.rpe)}#id`;
  const k = `${SITIO}${enlace.proveedor(c.rpe)}#contratacion-${c.uc}`;
  x.de(
    "contratos",
    t(k, "rdf:type", iri("soc:Contratacion")),
    t(k, "soc:contratante", iri(DE(c.uc))),
    t(k, "soc:contratista", iri(pr)),
    t(k, "soc:montoContratado", entero(c.monto)),
    t(k, "soc:numeroDeContratos", entero(c.contratos)),
    t(k, "dct:source", iri(FUENTE_CONTRATOS)),
    t(pr, "rdf:type", iri("soc:Proveedor")),
    t(pr, "do:rpe", lit(c.rpe)),
    t(pr, "rdfs:label", lit(c.proveedor)),
  );
  if (c.institucion) x.de("instituciones", t(DE(c.uc), "rdfs:label", lit(c.institucion, "es")));
  if (c.empresa) return;
  const rnc = await rncDeProveedor(c.rpe);
  if (rnc) {
    // La empresa con su nombre del padrón, no el del registro de proveedores:
    // un centenar de cruces cambió de nombre entre uno y otro.
    const e = iriDe({ tipo: "empresa", id: rnc });
    const padron = await empresaPorRnc(rnc);
    x.de("proveedores", t(e, "soc:inscritaComo", iri(pr)));
    if (padron) x.de("padron", t(e, "rdfs:label", lit(padron.razonSocial)));
  }
}

/* ------------------------------------------------------ compras y obras */

const PROCESO = (codigo: string) => iriDe({ tipo: "proceso", id: codigo });
const PROVEEDOR = (rpe: string) => iriDe({ tipo: "proveedor", id: rpe });
const OBRA = (snip: string) => iriDe({ tipo: "obra", id: snip });
const PROVINCIA = (slug: string) => iriDe({ tipo: "provincia", id: slug });

/** Cuántos procesos, obras y contratos de obra se describen, como mucho, en la ficha de quien los tiene. */
const TOPE_COMPRAS = 12;

/** La tabla de procesos de los últimos doce meses, por código y por institución compradora. */
interface IndiceProcesos {
  porCodigo: Map<string, ProcesoIndexado>;
  /** Por institución, del mayor valor estimado al menor (a igual valor, el más reciente; luego el código). */
  porInstitucion: Map<number, ProcesoIndexado[]>;
  desde: string | null;
  hasta: string | null;
}

let procesosMemo: Promise<IndiceProcesos> | null = null;

function indiceProcesos(): Promise<IndiceProcesos> {
  procesosMemo ??= todosLosProcesos().then(({ procesos }) => {
    const porCodigo = new Map(procesos.map((p) => [p.codigo, p]));
    const porInstitucion = new Map<number, ProcesoIndexado[]>();
    for (const p of procesos) {
      const i = institucionDeUnidad(p.unidad);
      if (!i) continue;
      const lista = porInstitucion.get(i.id) ?? [];
      lista.push(p);
      porInstitucion.set(i.id, lista);
    }
    const orden = (a: ProcesoIndexado, b: ProcesoIndexado) =>
      (b.valor ?? -1) - (a.valor ?? -1) || b.fecha.localeCompare(a.fecha) || (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0);
    for (const lista of porInstitucion.values()) lista.sort(orden);
    const c = procesos.length ? coberturaDe(procesos) : null;
    return { porCodigo, porInstitucion, desde: c?.desde ?? null, hasta: c?.hasta ?? null };
  });
  return procesosMemo;
}

/**
 * Un contrato de obra con un solo IRI, lo describa quien lo describa: el de
 * su contratista con el código del contrato (`/proveedores/<rpe>#contrato-…`).
 * MapaInversiones repite un contrato en cada proyecto que paga (uno llega a
 * cien) y, si se modificó, con el monto original y el modificado: aquí es uno,
 * con todos sus proyectos y el mayor de sus montos.
 */
interface ContratoUnico {
  codigo: string;
  rpe: string;
  /** El nombre del contratista como lo escribe MapaInversiones. */
  proveedor: string;
  proceso: string | null;
  descripcion: string;
  estado: string;
  monto: number;
  /** Los SNIP de los proyectos que lo listan, en orden. */
  obras: string[];
}

/** Las obras de MapaInversiones con sus procesos y contratos, indexadas para describir cada nodo sin recorrerlas. */
interface IndiceObras {
  porSnip: Map<string, Obra>;
  /** Por institución ejecutora y por provincia, de la de mayor valor a la de menor (luego el SNIP). */
  porInstitucion: Map<number, Obra[]>;
  porProvincia: Map<string, Obra[]>;
  /** Proceso → SNIP de sus obras, y al revés, en orden. */
  obrasDeProceso: Map<string, string[]>;
  procesosDeObra: Map<string, string[]>;
  /** Lo que MapaInversiones dice de un proceso (la primera vez que lo lista). */
  procesoDeObras: Map<string, ProcesoDeObra>;
  contratosDeProveedor: Map<string, ContratoUnico[]>;
  contratosDeProceso: Map<string, ContratoUnico[]>;
  contratosDeObra: Map<string, ContratoUnico[]>;
  contratos: number;
}

let obrasMemo: Promise<IndiceObras> | null = null;

const porSnip = (a: string, b: string) => Number(a) - Number(b);
const porMonto = (a: ContratoUnico, b: ContratoUnico) => b.monto - a.monto || (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0) || Number(a.rpe) - Number(b.rpe);

function indiceObras(): Promise<IndiceObras> {
  obrasMemo ??= Promise.all([getObras(), getDetalleObras()]).then(([o, d]) => {
    if (!o || !d) throw new Error("falta una instantánea: obras.json u obras-detalle.json");
    const porSnipMapa = new Map(o.proyectos.map((x) => [x.snip, x]));
    const orden = (a: Obra, b: Obra) => b.valor - a.valor || porSnip(a.snip, b.snip);
    const porInstitucion = new Map<number, Obra[]>();
    const porProvincia = new Map<string, Obra[]>();
    for (const x of o.proyectos) {
      if (x.uc != null && institucionPorId(x.uc)) porInstitucion.set(x.uc, [...(porInstitucion.get(x.uc) ?? []), x]);
      for (const slug of new Set(x.provincias.map((n) => provinciaDeTexto(n)?.slug).filter((v): v is string => v != null))) {
        porProvincia.set(slug, [...(porProvincia.get(slug) ?? []), x]);
      }
    }
    for (const lista of [...porInstitucion.values(), ...porProvincia.values()]) lista.sort(orden);

    const obrasDeProceso = new Map<string, Set<string>>();
    const ligar = (codigo: string, snip: string) => {
      if (!porSnipMapa.has(snip)) return;
      const k = codigo.trim();
      obrasDeProceso.set(k, (obrasDeProceso.get(k) ?? new Set()).add(snip));
    };
    for (const [codigo, snips] of Object.entries(o.procesos)) for (const snip of snips) ligar(codigo, snip);
    const procesoDeObras = new Map<string, ProcesoDeObra>();
    const unicos = new Map<string, ContratoUnico>();
    for (const snip of Object.keys(d.obras).sort(porSnip)) {
      if (!porSnipMapa.has(snip)) continue;
      for (const q of d.obras[snip].procesos) {
        ligar(q.codigo, snip);
        if (!procesoDeObras.has(q.codigo.trim())) procesoDeObras.set(q.codigo.trim(), q);
      }
      for (const c of d.obras[snip].contratos) {
        if (c.proceso) ligar(c.proceso, snip);
        // La clave es la del IRI: el RPE sin ceros a la izquierda y el código sin espacios a los lados.
        const rpe = String(Number(c.rpe));
        const codigo = c.codigo.trim();
        const k = `${rpe}|${codigo}`;
        const ya = unicos.get(k);
        if (!ya) {
          unicos.set(k, {
            codigo,
            rpe,
            proveedor: sinCedula(c.proveedor ?? "").trim(),
            proceso: c.proceso?.trim() || null,
            descripcion: sinCedula(c.descripcion ?? "").trim(),
            estado: c.estado,
            monto: c.monto,
            obras: [snip],
          });
          continue;
        }
        if (!ya.obras.includes(snip)) ya.obras.push(snip);
        if (c.monto > ya.monto) {
          ya.monto = c.monto;
          ya.estado = c.estado;
        }
      }
    }
    const agrupar = (clave: (k: ContratoUnico) => string[]) => {
      const m = new Map<string, ContratoUnico[]>();
      for (const k of unicos.values()) for (const g of clave(k)) m.set(g, [...(m.get(g) ?? []), k]);
      for (const lista of m.values()) lista.sort(porMonto);
      return m;
    };
    const ordenado = (m: Map<string, Set<string>>) => new Map([...m].map(([k, v]) => [k, [...v].sort(porSnip)]));
    const procesosDeObra = new Map<string, string[]>();
    for (const [codigo, snips] of obrasDeProceso) for (const snip of snips) procesosDeObra.set(snip, [...(procesosDeObra.get(snip) ?? []), codigo]);
    for (const lista of procesosDeObra.values()) lista.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return {
      porSnip: porSnipMapa,
      porInstitucion,
      porProvincia,
      obrasDeProceso: ordenado(obrasDeProceso),
      procesosDeObra,
      procesoDeObras,
      contratosDeProveedor: agrupar((k) => [k.rpe]),
      contratosDeProceso: agrupar((k) => (k.proceso ? [k.proceso] : [])),
      contratosDeObra: agrupar((k) => k.obras),
      contratos: unicos.size,
    };
  });
  return obrasMemo;
}

/**
 * Todos los nodos de compras y obras, por tipo y en orden de clave: los
 * proveedores del registro (con RNC en el padrón), de la historia de
 * contratos, de las medidas y de los contratos de obra; los procesos de la
 * tabla y los que nombran las obras; las obras. Es el conjunto exacto que los
 * constructores saben describir: lo recorren el compilador y el inventario.
 */
export async function clavesDeCompras(): Promise<{ proveedor: string[]; proceso: string[]; obra: string[] }> {
  const [p, o, sanc] = await Promise.all([indiceProcesos(), indiceObras(), getSanciones()]);
  const rpes = new Set<string>();
  for (let n = 0; n < 10; n++) {
    const [r, h] = await Promise.all([
      leerInstantanea<{ filas: Record<string, unknown> }>(`rnc/${n}.json`),
      leerInstantanea<{ filas: Record<string, unknown> }>(`historico/proveedores/${n}.json`),
    ]);
    for (const rpe of [...Object.keys(r.filas), ...Object.keys(h.filas)]) rpes.add(String(Number(rpe)));
  }
  for (const x of sanc?.proveedores ?? []) rpes.add(String(Number(x.rpe)));
  for (const rpe of o.contratosDeProveedor.keys()) rpes.add(rpe);
  const procesos = new Set<string>([...p.porCodigo.keys(), ...o.obrasDeProceso.keys(), ...o.procesoDeObras.keys(), ...o.contratosDeProceso.keys()]);
  const texto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return {
    proveedor: [...rpes].sort(texto),
    proceso: [...procesos].sort(texto),
    obra: [...o.porSnip.keys()].sort(texto),
  };
}

/** La modalidad y la etapa de un proceso de la tabla, como conceptos: la tabla las da cortas (`lib/tablas-compras.ts`). */
const CLAVE_MODALIDAD = new Map(Object.entries(MODALIDADES).map(([k, v]) => [v as string, k as ClaveModalidad]));
const CLAVE_ETAPA = new Map(Object.entries(ETAPAS).map(([k, v]) => [v as string, k as ClaveEtapa]));

/**
 * El nombre de un proveedor, el mismo lo diga quien lo diga: el de su
 * historia de contratos; si no tiene, el de sus medidas; el que escribe
 * MapaInversiones en sus contratos; la razón social de su RNC en el padrón;
 * y si nada de eso, «RPE 123», con el grafo de cada caso.
 */
async function nombreDeProveedor(rpe: string): Promise<{ nombre: string; grafo: ClaveGrafo }> {
  const h = await historiaDeProveedor(rpe);
  if (h?.historia.nombre) return { nombre: h.historia.nombre, grafo: "contratos" };
  const m = await medidasDeRpe(rpe);
  if (m?.razonSocial) return { nombre: m.razonSocial, grafo: "medidas" };
  const k = (await indiceObras()).contratosDeProveedor.get(rpe)?.[0];
  if (k?.proveedor) return { nombre: k.proveedor, grafo: "obras" };
  const r = await getRegistroTributario(rpe);
  const e = r ? await empresaPorRnc(r.rnc) : null;
  if (e) return { nombre: e.razonSocial, grafo: "padron" };
  return { nombre: `RPE ${rpe}`, grafo: "plataforma" };
}

/** Un proveedor como vecino: su tipo y su RPE, como los da quien lo nombra (`grafo`), y su nombre. */
async function vecinoProveedor(rpe: string, x: Afirmaciones, grafo: ClaveGrafo): Promise<void> {
  const pr = PROVEEDOR(rpe);
  const n = await nombreDeProveedor(rpe);
  x.de(grafo, t(pr, "rdf:type", iri("soc:Proveedor")), t(pr, "do:rpe", lit(rpe)));
  x.de(n.grafo, t(pr, "rdfs:label", lit(n.nombre)));
}

/** Una obra como vecina: su tipo, su SNIP, su nombre, su valor y su estado (los mismos que dice su descripción). */
function vecinaObra(o: Obra, x: Afirmaciones): void {
  const s = OBRA(o.snip);
  x.de(
    "obras",
    t(s, "rdf:type", iri("soc:ProyectoDeInversion")),
    t(s, "do:snip", lit(o.snip)),
    t(s, "rdfs:label", lit(desdeMayusculas(sinCedula(o.nombre)), "es")),
    t(s, "soc:valorEstimado", decimal(o.valor)),
    t(s, "soc:estado", lit(o.estado, "es")),
  );
}

/** El nombre de un proceso: su carátula en la tabla; si no está, la de MapaInversiones; si tampoco, su código. */
function tituloDeProceso(codigo: string, p: IndiceProcesos, o: IndiceObras): { titulo: string | null; grafo: ClaveGrafo } {
  const t0 = p.porCodigo.get(codigo);
  if (t0) return { titulo: t0.titulo, grafo: "procesos" };
  const q = o.procesoDeObras.get(codigo);
  if (q?.descripcion) return { titulo: sinCedula(q.descripcion).trim(), grafo: "obras" };
  return { titulo: null, grafo: "plataforma" };
}

const etiquetaProceso = (codigo: string, titulo: string | null) => (titulo ? desdeMayusculas(titulo) : `Proceso ${codigo}`);

/** Un proceso como vecino: su tipo, su código, su nombre, su fecha y su valor estimado (los mismos que dice su descripción). */
function vecinoProceso(codigo: string, x: Afirmaciones, p: IndiceProcesos, o: IndiceObras): void {
  const s = PROCESO(codigo);
  const fila = p.porCodigo.get(codigo);
  const { titulo, grafo } = tituloDeProceso(codigo, p, o);
  x.de(fila ? "procesos" : "obras", t(s, "rdf:type", iri("soc:ProcesoDeContratacion")), t(s, "soc:codigo", lit(codigo)));
  x.de(grafo, t(s, "rdfs:label", lit(etiquetaProceso(codigo, titulo), titulo ? "es" : undefined)));
  if (fila) {
    x.de("procesos", t(s, "soc:fecha", fecha(fila.fecha)));
    if (fila.valor != null) x.de("procesos", t(s, "soc:valorEstimado", decimal(fila.valor)));
    return;
  }
  const q = o.procesoDeObras.get(codigo);
  if (q?.monto) x.de("obras", t(s, "soc:valorEstimado", decimal(q.monto)));
}

/**
 * Un contrato de obra: su código, su contratista, su monto, su estado, su
 * proceso y sus proyectos. `soloObra` lo deja con el proyecto de quien lo
 * describe (un contrato llega a pagar cien obras).
 */
async function triplesContrato(k: ContratoUnico, x: Afirmaciones, p: IndiceProcesos, o: IndiceObras, soloObra?: string): Promise<void> {
  const ki = `${SITIO}${enlace.proveedor(k.rpe)}#contrato-${encodeURIComponent(k.codigo)}`;
  x.de(
    "obras",
    t(ki, "rdf:type", iri("soc:Contrato")),
    t(ki, "rdf:type", iri("epo:Contract")),
    t(ki, "rdfs:label", lit(`Contrato ${k.codigo}`)),
    t(ki, "soc:codigo", lit(k.codigo)),
    t(ki, "soc:contratista", iri(PROVEEDOR(k.rpe))),
    t(ki, "soc:monto", decimal(k.monto)),
    t(ki, "soc:estado", lit(k.estado, "es")),
  );
  if (k.descripcion) x.de("obras", t(ki, "dct:description", lit(k.descripcion, "es")));
  if (k.proceso) {
    x.de("obras", t(ki, "soc:delProceso", iri(PROCESO(k.proceso))));
    vecinoProceso(k.proceso, x, p, o);
  }
  for (const snip of soloObra ? [soloObra] : k.obras) {
    const obra = o.porSnip.get(snip);
    if (!obra) continue;
    x.de("obras", t(ki, "soc:paraProyecto", iri(OBRA(snip))));
    vecinaObra(obra, x);
  }
  await vecinoProveedor(k.rpe, x, "obras");
}

/** Las medidas de la DGCP sobre una inscripción de proveedor, con el mismo IRI la describa quien la describa. */
function triplesMedidas(m: ProveedorConMedidas, x: Afirmaciones): void {
  const pr = `${SITIO}${enlace.proveedor(m.rpe)}#id`;
  x.de("medidas", t(pr, "rdf:type", iri("soc:Proveedor")), t(pr, "do:rpe", lit(m.rpe)));
  for (const e of m.eventos) {
    const mIri = `${SITIO}${enlace.proveedor(m.rpe)}#medida-${huella([e.fecha, e.tipo, e.resolucion ?? "", e.motivo].join("|"))}`;
    x.de(
      "medidas",
      t(pr, "soc:tieneMedida", iri(mIri)),
      t(mIri, "rdf:type", iri("do:MedidaDGCP")),
      t(mIri, "do:tipoDeMedida", iri(`do:medida-${e.tipo}`)),
      t(mIri, "soc:fecha", fecha(e.fecha)),
      t(mIri, "dct:description", lit(e.motivo, "es")),
    );
    if (e.resolucion) x.de("medidas", t(mIri, "rdfs:label", lit(e.resolucion, "es")));
  }
}

/* ------------------------------------------------------------- proveedor */

async function describirProveedor(rpe: string, ligero = false): Promise<Descripcion | null> {
  if (!/^\d{1,10}$/.test(rpe) || String(Number(rpe)) !== rpe) return null;
  const [h, registro, medidas, p, o] = await Promise.all([historiaDeProveedor(rpe), getRegistroTributario(rpe), medidasDeRpe(rpe), indiceProcesos(), indiceObras()]);
  const contratos = o.contratosDeProveedor.get(rpe) ?? [];
  if (!h && !registro && !medidas && !contratos.length) return null;
  const s = PROVEEDOR(rpe);
  const x = new Afirmaciones();
  const n = await nombreDeProveedor(rpe);
  // Quién dice que es un proveedor: el registro, si lo cruza con el padrón; si no, sus contratos, sus medidas o sus obras.
  const g: ClaveGrafo = registro ? "proveedores" : h ? "contratos" : medidas ? "medidas" : "obras";
  x.de(g, t(s, "rdf:type", iri("soc:Proveedor")), t(s, "do:rpe", lit(rpe)));
  x.de(n.grafo, t(s, "rdfs:label", lit(n.nombre)));
  x.de("plataforma", t(s, "foaf:page", iri(`${SITIO}${enlace.proveedor(rpe)}`)));
  // La persona jurídica inscrita con él: su RNC en el cruce del registro con el padrón.
  const empresa = registro ? await empresaPorRnc(registro.rnc) : null;
  const e = empresa ? iriDe({ tipo: "empresa", id: empresa.rnc }) : undefined;
  if (empresa && e) {
    x.de("proveedores", t(e, "soc:inscritaComo", iri(s)));
    x.de("padron", t(e, "rdfs:label", lit(empresa.razonSocial)));
  }
  let nota: string | undefined;
  if (!ligero) {
    // Lo que el Estado le contrató desde 2015: sus ocho mayores clientes.
    for (const [uc, cuantos, monto] of h?.historia.clientes ?? []) {
      const inst = institucionPorId(uc);
      if (!inst) continue;
      await triplesContratacion({ uc, rpe, proveedor: h!.historia.nombre, contratos: cuantos, monto, institucion: inst.nombre, empresa: e }, x);
    }
    if (medidas) triplesMedidas(medidas, x);
    for (const k of contratos.slice(0, TOPE_COMPRAS)) await triplesContrato(k, x, p, o);
    if (contratos.length > TOPE_COMPRAS) {
      nota = `Se describen sus ${TOPE_COMPRAS} contratos de obra de mayor monto de los ${contratos.length.toLocaleString("es-DO")} que lista MapaInversiones.`;
    }
  }
  return { triples: x.triples, grafos: x.grafos, titulo: n.nombre, nota };
}

/* --------------------------------------------------------------- proceso */

async function describirProceso(codigo: string, ligero = false): Promise<Descripcion | null> {
  const [p, o] = await Promise.all([indiceProcesos(), indiceObras()]);
  const fila = p.porCodigo.get(codigo);
  const deObras = o.procesoDeObras.get(codigo);
  const obras = o.obrasDeProceso.get(codigo) ?? [];
  const contratos = o.contratosDeProceso.get(codigo) ?? [];
  if (!fila && !deObras && !obras.length && !contratos.length) return null;
  const s = PROCESO(codigo);
  const x = new Afirmaciones();
  const { titulo, grafo } = tituloDeProceso(codigo, p, o);
  // De la tabla de la DGCP si está en ella; si no, de lo que MapaInversiones dice de él.
  const g: ClaveGrafo = fila ? "procesos" : "obras";
  x.de(g, t(s, "rdf:type", iri("soc:ProcesoDeContratacion")), t(s, "rdf:type", iri("epo:Procedure")), t(s, "soc:codigo", lit(codigo)));
  x.de(grafo, t(s, "rdfs:label", lit(etiquetaProceso(codigo, titulo), titulo ? "es" : undefined)));
  if (titulo) x.de(grafo, t(s, "dct:title", lit(titulo, "es")));
  x.de("plataforma", t(s, "foaf:page", iri(`${SITIO}${enlace.proceso(codigo)}`)));
  if (fila) {
    const modalidad = CLAVE_MODALIDAD.get(fila.modalidad);
    const etapa = CLAVE_ETAPA.get(fila.etapa);
    if (!modalidad || !etapa) {
      throw new Error(`proceso ${codigo}: «${fila.modalidad}» o «${fila.etapa}» no está en lib/vocabulario-compras.ts`);
    }
    x.de("procesos", t(s, "soc:modalidad", iri(`do:modalidad-${modalidad}`)), t(s, "soc:etapa", iri(`do:etapa-${etapa}`)));
    if (fila.objeto) {
      const objeto = OBJETO_DE_LA_DGCP[fila.objeto];
      if (!objeto) throw new Error(`proceso ${codigo}: el objeto «${fila.objeto}» no está en lib/vocabulario-compras.ts`);
      x.de("procesos", t(s, "soc:objetoDeCompra", iri(`soc:objeto-${objeto}`)));
    }
    x.de("procesos", t(s, "soc:fecha", fecha(fila.fecha)));
    if (fila.valor != null) x.de("procesos", t(s, "soc:valorEstimado", decimal(fila.valor)));
    const inst = institucionDeUnidad(fila.unidad);
    if (inst) {
      x.de("procesos", t(s, "soc:comprador", iri(DE(inst.id))));
      x.de("instituciones", t(DE(inst.id), "rdfs:label", lit(inst.nombre, "es")));
    }
  } else if (deObras) {
    // MapaInversiones escribe modalidades y etapas que la tabla de la DGCP ya
    // no usa («Compras Menores», «No Definido»): sin concepto, no se dicen.
    const modalidad = MODALIDAD_DE_LA_DGCP[deObras.modalidad];
    const etapa = ETAPA_DE_LA_DGCP[deObras.estado];
    if (modalidad) x.de("obras", t(s, "soc:modalidad", iri(`do:modalidad-${modalidad}`)));
    if (etapa) x.de("obras", t(s, "soc:etapa", iri(`do:etapa-${etapa}`)));
    if (deObras.monto) x.de("obras", t(s, "soc:valorEstimado", decimal(deObras.monto)));
  }
  for (const snip of obras) {
    const obra = o.porSnip.get(snip);
    if (!obra) continue;
    x.de("obras", t(s, "soc:paraProyecto", iri(OBRA(snip))));
    vecinaObra(obra, x);
  }
  if (!ligero) for (const k of contratos) await triplesContrato(k, x, p, o);
  return { triples: x.triples, grafos: x.grafos, titulo: etiquetaProceso(codigo, titulo) };
}

/* ------------------------------------------------------------------ obra */

async function describirObra(snip: string, ligero = false): Promise<Descripcion | null> {
  const [p, o] = await Promise.all([indiceProcesos(), indiceObras()]);
  const obra = o.porSnip.get(snip);
  if (!obra) return null;
  const s = OBRA(snip);
  const x = new Afirmaciones();
  const nombre = sinCedula(obra.nombre);
  const sector = claveSectorInversion(obra.sector);
  if (!sector) throw new Error(`obra ${snip}: el sector «${obra.sector}» no está en SECTORES_INVERSION (lib/vocabulario-compras.ts)`);
  x.de(
    "obras",
    t(s, "rdf:type", iri("soc:ProyectoDeInversion")),
    t(s, "do:snip", lit(snip)),
    t(s, "rdfs:label", lit(desdeMayusculas(nombre), "es")),
    t(s, "dct:title", lit(nombre, "es")),
    t(s, "soc:estado", lit(obra.estado, "es")),
    t(s, "soc:valorEstimado", decimal(obra.valor)),
    t(s, "soc:avance", decimal(obra.avance)),
    t(s, "soc:sectorDeInversion", iri(`do:inversion-${sector}`)),
  );
  if (obra.inicio) x.de("obras", t(s, "soc:desde", fecha(obra.inicio)));
  if (obra.fin) x.de("obras", t(s, "soc:hasta", fecha(obra.fin)));
  x.de("plataforma", t(s, "foaf:page", iri(`${SITIO}${enlace.obra(snip)}`)));
  x.de("obras", t(s, "rdfs:seeAlso", iri(urlFichaMapaInversiones(obra))));
  const inst = obra.uc != null ? institucionPorId(obra.uc) : null;
  if (inst) {
    x.de("obras", t(s, "soc:ejecutadoPor", iri(DE(inst.id))));
    x.de("instituciones", t(DE(inst.id), "rdfs:label", lit(inst.nombre, "es")));
  }
  for (const slug of new Set(obra.provincias.map((n) => provinciaDeTexto(n)?.slug).filter((v): v is string => v != null))) {
    const prov = provinciaDeSlug(slug)!;
    x.de("obras", t(s, "soc:enProvincia", iri(PROVINCIA(slug))));
    x.de("provincias", t(PROVINCIA(slug), "rdfs:label", lit(prov.nombre, "es")));
  }
  if (!ligero) {
    for (const codigo of o.procesosDeObra.get(snip) ?? []) {
      x.de("obras", t(PROCESO(codigo), "soc:paraProyecto", iri(s)));
      vecinoProceso(codigo, x, p, o);
    }
    for (const k of o.contratosDeObra.get(snip) ?? []) await triplesContrato(k, x, p, o, snip);
  }
  return { triples: x.triples, grafos: x.grafos, titulo: desdeMayusculas(nombre) };
}

/* --------------------------------------------------------------- decreto */

async function describirDecreto(numero: string, ligero = false): Promise<Descripcion | null> {
  const d = await decretoPorNumero(numero);
  if (!d || !d.numero) return null;
  const s = iriDe({ tipo: "decreto", id: d.numero });
  const x = new Afirmaciones();
  x.de(
    "decretos",
    t(s, "rdf:type", iri("soc:Decreto")),
    t(s, "rdf:type", iri("eli:LegalResource")),
    t(s, "rdf:type", iri("schema:Legislation")),
    t(s, "rdfs:label", lit(nombreDecreto(d.numero), "es")),
    t(s, "soc:numero", lit(d.numero)),
    t(s, "eli:id_local", lit(d.numero)),
    t(s, "dct:title", lit(d.titulo, "es")),
    t(s, "schema:name", lit(desdeMayusculas(d.titulo), "es")),
    t(s, "schema:legislationIdentifier", lit(nombreDecreto(d.numero), "es")),
    t(s, "schema:legislationType", lit("Decreto", "es")),
    t(s, "schema:inLanguage", lit("es")),
  );
  // La materia la deduce Socrático del título y de la etiqueta de la Consultoría.
  x.de("materia", t(s, "soc:materia", iri(`do:materia-${d.materia.slug}`)));
  x.de("plataforma", t(s, "foaf:page", iri(`${SITIO}${enlace.norma("decreto", d.numero)}`)));
  if (d.fecha) {
    x.de("decretos", t(s, "soc:fecha", fecha(d.fecha)), t(s, "eli:date_document", fecha(d.fecha)), t(s, "schema:legislationDate", fecha(d.fecha)));
  }
  // El aviso lo pone Socrático: la fecha de la fila cae fuera de los períodos de su firmante.
  if (d.aviso) x.de("firma", t(s, "do:aviso", lit(d.aviso)));
  if (d.institucion) x.de("decretos", t(s, "do:etiquetaConsultoria", lit(d.institucion, "es")));
  if (d.docId != null) {
    const pdf = `${CONSULTORIA_PDF}${d.docId}`;
    x.de("decretos", t(s, "schema:encoding", iri(pdf)), t(s, "eli:is_realized_by", iri(pdf)));
  }
  // «Lo firma» solo si la fila no está fechada fuera de los períodos de su firmante.
  if (d.firmante && d.aviso !== "fuera") {
    const p = await personaPorFirma(d.firmante);
    if (p) {
      const pIri = iriDe({ tipo: "funcionario", id: p.id });
      x.de(
        "firma",
        t(s, "soc:firmadoPor", iri(pIri)),
        t(s, "eli:passed_by", iri(pIri)),
        t(s, "schema:legislationPassedBy", iri(pIri)),
      );
      x.de(
        "personas",
        // Tipada también en el núcleo: un decreto leído solo dice qué es su firmante (SHACL, `soc:firmadoPor`).
        t(pIri, "rdf:type", iri("soc:Persona")),
        t(pIri, "rdf:type", iri("schema:Person")),
        t(pIri, "rdfs:label", lit(p.nombre)),
      );
    }
  }
  const f = ligero ? null : await getFuncionarios();
  if (f) {
    // Cada cargo que registra, con su titular: qué puesto, qué movimiento.
    for (const { persona, cargo } of personasDelDecreto(f, d.numero)) {
      const pIri = iriDe({ tipo: "funcionario", id: persona.id });
      await triplesCargo(persona, cargo, x);
      x.de("firma", t(s, "soc:designa", iri(pIri)));
      x.de("personas", t(pIri, "rdf:type", iri("soc:Persona")), t(pIri, "rdfs:label", lit(persona.nombre)));
    }
  }
  return { triples: x.triples, grafos: x.grafos, titulo: nombreDecreto(d.numero) };
}

/* ------------------------------------------------------------- provincia */

async function describirProvincia(slug: string, ligero = false): Promise<Descripcion | null> {
  const prov = provinciaDeSlug(slug);
  if (!prov) return null;
  const s = iriDe({ tipo: "provincia", id: prov.slug });
  const x = new Afirmaciones();
  x.de(
    "provincias",
    t(s, "rdf:type", iri("soc:Provincia")),
    t(s, "rdf:type", iri("schema:AdministrativeArea")),
    t(s, "rdfs:label", lit(prov.nombre, "es")),
    t(s, "schema:name", lit(prov.nombre, "es")),
    t(s, "schema:containedInPlace", iri("wd:Q786")),
    t("wd:Q786", "rdf:type", iri("schema:Country")),
    t("wd:Q786", "rdfs:label", lit("República Dominicana", "es")),
  );
  x.de("plataforma", t(s, "foaf:page", iri(`${SITIO}${enlace.provincia(prov.slug)}`)));
  const f = ligero ? null : await getFuncionarios();
  if (f) {
    const g = gobiernoDeProvincia(f, (texto) => provinciaDeTexto(texto)?.slug === prov.slug);
    const cargos = [...(g.gobernador ? [g.gobernador] : []), ...g.alcaldes, ...g.directores];
    for (const { persona, cargo } of cargos) {
      const cIri = await triplesCargo(persona, cargo, x);
      x.de(`cargos-${cargo.origen}`, t(cIri, "soc:enProvincia", iri(s)));
      x.de("personas", t(iriDe({ tipo: "funcionario", id: persona.id }), "rdfs:label", lit(persona.nombre)));
    }
  }
  // Las obras en la provincia, de la de mayor valor a la de menor.
  let nota: string | undefined;
  if (!ligero) {
    const obras = (await indiceObras()).porProvincia.get(prov.slug) ?? [];
    for (const obra of obras.slice(0, TOPE_COMPRAS)) {
      x.de("obras", t(OBRA(obra.snip), "soc:enProvincia", iri(s)));
      vecinaObra(obra, x);
    }
    if (obras.length > TOPE_COMPRAS) nota = `Se describen sus ${TOPE_COMPRAS} obras de mayor valor de las ${obras.length.toLocaleString("es-DO")} que MapaInversiones ubica en ella.`;
  }
  const qid = await wikidataDe({ tipo: "provincia", id: prov.slug });
  if (qid) x.de("wikidata", t(s, "owl:sameAs", iri(`wd:${qid}`)));
  return { triples: x.triples, grafos: x.grafos, titulo: prov.nombre, nota };
}

/* ------------------------------------------------------------ el conjunto */

/** Cuántos nodos de cada clase tiene el grafo hoy: para VoID y para `/grafo`. */
export async function inventarioEnVivo(): Promise<ClaseContada[]> {
  const [f, indice, fin, padron, dj, sanc, contrataciones, historico, compras, procesos, obras, cabeceraObras] = await Promise.all([
    getFuncionarios(),
    indiceDecretos(),
    getFinancieras(),
    padronEmpresas(),
    getDeclaraciones(),
    getSanciones(),
    contarContrataciones((uc) => institucionPorId(uc) != null),
    getResumenHistorico(),
    clavesDeCompras(),
    indiceProcesos(),
    indiceObras(),
    leerInstantanea<{ corte: string }>("obras.json"),
  ]);
  const cargos = f?.personas.reduce((n, p) => n + p.cargos.length, 0) ?? 0;
  const decretos = indice ? Object.values(indice.anios).reduce((a, b) => a + b, 0) + indice.sinFecha : 0;
  const medidas = sanc ? sanc.proveedores.reduce((n, p) => n + p.eventos.length, 0) : 0;
  const personas = "MAP, decretos, cortes, JCE, Junta Monetaria y SIL";
  const filas: ClaseContada[] = [
    { clase: "soc:Persona", etiqueta: "Personas con cargo público", n: f?.personas.length ?? 0, fuente: personas, corte: f?.generado ?? null },
    { clase: "soc:Cargo", etiqueta: "Cargos", n: cargos, fuente: personas, corte: f?.generado ?? null },
    {
      clase: "soc:Institucion",
      etiqueta: "Instituciones del Estado",
      n: INSTITUCIONES.length,
      fuente: "Clasificador de DIGEPRES",
      corte: FUENTES_DEL_CRUCE.clasificador.actualizado ?? null,
    },
    { clase: "soc:Decreto", etiqueta: "Decretos", n: decretos, fuente: "Consultoría Jurídica", corte: indice?.generado ?? null },
    { clase: "soc:EntidadFinanciera", etiqueta: "Entidades financieras", n: fin?.entidades.length ?? 0, fuente: "SB, SIPEN, SIS e IDECOOP", corte: fin?.generado ?? null },
    { clase: "soc:Empresa", etiqueta: "Personas jurídicas", n: padron?.empresas ?? 0, fuente: "Padrón de la DGII", corte: padron?.corteDgii ?? padron?.generado ?? null },
    { clase: "soc:Provincia", etiqueta: "Provincias", n: PROVINCIAS.length, fuente: "ONE", corte: null },
    { clase: "soc:DeclaracionJurada", etiqueta: "Declaraciones juradas publicadas", n: dj?.declaraciones.length ?? 0, fuente: "Portales de transparencia", corte: dj?.generado ?? null },
    { clase: "do:MedidaDGCP", etiqueta: "Medidas sobre proveedores", n: medidas, fuente: "DGCP", corte: sanc?.generado ?? null },
    {
      clase: "soc:Proveedor",
      etiqueta: "Proveedores del Estado",
      n: compras.proveedor.length,
      fuente: "DGCP (registro de proveedores, contratos y medidas) y MapaInversiones",
      corte: historico?.corte ?? null,
    },
    {
      clase: "soc:Contratacion",
      etiqueta: "Contrataciones de institución a proveedor",
      n: contrataciones?.pares ?? 0,
      fuente: "DGCP (contratos)",
      corte: historico?.corte ?? null,
    },
    {
      clase: "soc:ProcesoDeContratacion",
      etiqueta: "Procesos de compra",
      n: compras.proceso.length,
      fuente: "DGCP (procesos de los últimos doce meses) y MapaInversiones",
      corte: procesos.hasta,
    },
    { clase: "soc:ProyectoDeInversion", etiqueta: "Obras y proyectos de inversión", n: compras.obra.length, fuente: "MapaInversiones", corte: dia(cabeceraObras.corte) },
    { clase: "soc:Contrato", etiqueta: "Contratos de obra", n: obras.contratos, fuente: "MapaInversiones", corte: dia(cabeceraObras.corte) },
  ];
  return filas.filter((c) => c.n > 0);
}


/** Cuántos nodos están atados a Wikidata, por tipo. */
export async function enlacesWikidataEnVivo(): Promise<MetaGrafo["wikidata"]> {
  const [w, f] = await Promise.all([getWikidata(), getFuncionarios()]);
  if (!w) return { total: 0, generado: null, porTipo: {} };
  const porTipo = {
    // Las que se enlazan: PEP hoy o firmantes (la regla de `describirPersona`).
    personas: Object.keys(w.personas).filter((id) => {
      const p = f?.porId.get(id);
      return p != null && (p.pepVigente || p.firma != null);
    }).length,
    instituciones: Object.keys(w.instituciones).length,
    financieras: Object.keys(w.financieras).length,
    provincias: Object.keys(w.provincias).length,
  };
  return { total: Object.values(porTipo).reduce((a, b) => a + b, 0), generado: w.generado, porTipo };
}
