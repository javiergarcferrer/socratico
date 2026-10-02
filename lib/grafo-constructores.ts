import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SITIO } from "@/lib/sitio";
import { enlace, type NodoRdf } from "@/lib/grafo";
import { booleano, entero, fecha, iri, lit, t } from "@/lib/rdf";
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
import { FUENTES_DEL_CRUCE, INSTITUCIONES, institucionPorId } from "@/lib/instituciones";
import { decretoPorNumero, decretosDeFirmante, hrefDecreto, indiceDecretos, CONSULTORIA_PDF, type Decreto } from "@/lib/decretos";
import { declaracionesDe, declaracionesDeInstitucion, getDeclaraciones } from "@/lib/declaraciones";
import { entidadDeInstitucion, entidadPorRnc, entidadPorSlug, getFinancieras, institucionDe } from "@/lib/financieras";
import { empresaPorRnc, padronEmpresas } from "@/lib/empresas";
import { medidasDeRnc, ofacDeRnc, hrefFichaOfac, getSanciones } from "@/lib/sanciones";
import { PROVINCIAS, provinciaDeSlug, provinciaDeTexto } from "@/lib/provincias";
import { getWikidata, wikidataDe } from "@/lib/wikidata";
import { contarContrataciones, getResumenHistorico, historiaDeInstitucion, historiaDeProveedor, rncDeProveedor } from "@/lib/historico";
import { desdeMayusculas } from "@/lib/congreso";
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
    const pr = `${SITIO}${enlace.proveedor(rpe)}#id`;
    // Su nombre en el registro de proveedores si tiene contratos; si no, su número.
    const nombre = ligero ? null : ((await historiaDeProveedor(rpe))?.historia.nombre ?? null);
    x.de("proveedores", t(s, "soc:inscritaComo", iri(pr)), t(pr, "rdf:type", iri("soc:Proveedor")), t(pr, "do:rpe", lit(rpe)));
    x.de(nombre ? "contratos" : "plataforma", t(pr, "rdfs:label", lit(nombre ?? `RPE ${rpe}`)));
  }
  for (const p of ligero ? [] : await medidasDeRnc(e.rnc)) {
    const pr = `${SITIO}${enlace.proveedor(p.rpe)}#id`;
    x.de("medidas", t(pr, "rdf:type", iri("soc:Proveedor")), t(pr, "do:rpe", lit(p.rpe)));
    for (const m of p.eventos) {
      const mIri = `${SITIO}${enlace.proveedor(p.rpe)}#medida-${huella([m.fecha, m.tipo, m.resolucion ?? "", m.motivo].join("|"))}`;
      x.de(
        "medidas",
        t(pr, "soc:tieneMedida", iri(mIri)),
        t(mIri, "rdf:type", iri("do:MedidaDGCP")),
        t(mIri, "do:tipoDeMedida", iri(`do:medida-${m.tipo}`)),
        t(mIri, "soc:fecha", fecha(m.fecha)),
        t(mIri, "dct:description", lit(m.motivo, "es")),
      );
      if (m.resolucion) x.de("medidas", t(mIri, "rdfs:label", lit(m.resolucion, "es")));
    }
  }
  // Lo que el Estado le contrató desde 2015, por cada inscripción: sus ocho mayores clientes.
  for (const rpe of ligero ? [] : e.rpe) {
    const h = await historiaDeProveedor(rpe);
    for (const [uc, contratos, monto] of h?.historia.clientes ?? []) {
      const inst = institucionPorId(uc);
      if (!inst) continue;
      await triplesContratacion({ uc, rpe, proveedor: h!.historia.nombre, contratos, monto, institucion: inst.nombre, empresa: s }, x);
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
  return { triples: x.triples, grafos: x.grafos, titulo: e.razonSocial };
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
  const qid = await wikidataDe({ tipo: "provincia", id: prov.slug });
  if (qid) x.de("wikidata", t(s, "owl:sameAs", iri(`wd:${qid}`)));
  return { triples: x.triples, grafos: x.grafos, titulo: prov.nombre };
}

/* ------------------------------------------------------------ el conjunto */

/** Cuántos nodos de cada clase tiene el grafo hoy: para VoID y para `/grafo`. */
export async function inventarioEnVivo(): Promise<ClaseContada[]> {
  const [f, indice, fin, padron, dj, sanc, contrataciones, historico] = await Promise.all([
    getFuncionarios(),
    indiceDecretos(),
    getFinancieras(),
    padronEmpresas(),
    getDeclaraciones(),
    getSanciones(),
    contarContrataciones((uc) => institucionPorId(uc) != null),
    getResumenHistorico(),
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
      etiqueta: "Proveedores con contrataciones en el grafo",
      n: contrataciones?.proveedores ?? 0,
      fuente: "DGCP (contratos)",
      corte: historico?.corte ?? null,
    },
    {
      clase: "soc:Contratacion",
      etiqueta: "Contrataciones de institución a proveedor",
      n: contrataciones?.pares ?? 0,
      fuente: "DGCP (contratos)",
      corte: historico?.corte ?? null,
    },
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
