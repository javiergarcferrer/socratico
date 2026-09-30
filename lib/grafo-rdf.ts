import { stat } from "node:fs/promises";
import { join } from "node:path";
import { unstable_cache } from "next/cache";
import { SITIO } from "@/lib/sitio";
import { enlace, nodoDeRuta, numeroCanonico, rutaDeNodo, type NodoRdf, type TipoNodoRdf } from "@/lib/grafo";
import { PREFIJOS, booleano, entero, expandir, fecha, iri, lit, t, type Termino, type Triple } from "@/lib/rdf";
import {
  ETIQUETA_MOVIMIENTO,
  ETIQUETA_ORIGEN,
  cargoPrincipal,
  filtrarPersonas,
  gobiernoDeProvincia,
  getFuncionarios,
  personaPorFirma,
  personasDeInstitucion,
  personasDelDecreto,
  quienDirige,
  esActual,
  type Cargo,
  type Movimiento,
  type Persona,
} from "@/lib/funcionarios";
import { FUENTES_DEL_CRUCE, INSTITUCIONES, buscarInstituciones, institucionPorId } from "@/lib/instituciones";
import { decretoPorNumero, decretosDeFirmante, hrefDecreto, indiceDecretos, CONSULTORIA_PDF, type Decreto } from "@/lib/decretos";
import { declaracionesDe, declaracionesDeInstitucion, getDeclaraciones } from "@/lib/declaraciones";
import {
  entidadDeInstitucion,
  entidadPorRnc,
  entidadPorSlug,
  filtrarEntidades,
  getFinancieras,
  institucionDe,
} from "@/lib/financieras";
import { empresaPorRnc, padronEmpresas } from "@/lib/empresas";
import { medidasDeRnc, ofacDeRnc, hrefFichaOfac, getSanciones } from "@/lib/sanciones";
import { PROVINCIAS, provinciaDeSlug, provinciaDeTexto } from "@/lib/provincias";
import { getWikidata, hrefWikidata, wikidataDe } from "@/lib/wikidata";
import { agujas, contieneTodas, plano } from "@/lib/raiz";
import { desdeMayusculas } from "@/lib/congreso";

/**
 * El grafo semántico de la plataforma, nodo a nodo: la descripción RDF de una
 * ficha (lo que es, lo que dice y con quién se liga), derivada en cada lectura
 * de las mismas instantáneas que pinta la ficha. No hay almacén de triples: la
 * invariante lo prohíbe y no hace falta (docs/ARQUITECTURA.md).
 *
 * La cosa es el IRI de su ficha con `#id` («la persona»); sin él, la página
 * que la describe. Un cargo es un nodo propio (`#cargo-…`, W3C ORG
 * `Membership`) porque tiene fecha, movimiento y decreto. Un decreto sin ficha
 * propia usa como IRI el de su PDF en la Consultoría. Cada vecino lleva su
 * `rdfs:label`, así la descripción se lee sola.
 *
 * Qué no entra, a propósito: la cédula (nunca está), los parentescos, las
 * biografías y los consejos de administración de la banca (particulares).
 *
 * Módulo de servidor: lee las instantáneas con `node:fs`.
 */

/** El IRI de la cosa que describe una ficha. */
export function iriDe(n: NodoRdf): string {
  return `${SITIO}${rutaDeNodo(n)}#id`;
}

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

/** Un texto largo cortado en una palabra, con puntos suspensivos. */
function recortar(texto: string, n: number): string {
  if (texto.length <= n) return texto;
  const corte = texto.slice(0, n);
  return `${corte.slice(0, Math.max(corte.lastIndexOf(" "), n - 20)).trimEnd()}…`;
}

/** El nombre de un decreto para `rdfs:label`. */
function nombreDecreto(numero: string | null): string {
  return numero ? `Decreto ${numero}` : "Decreto sin número";
}

const SUPERVISOR_INSTITUCION: Record<string, number> = { sb: 639, sipen: 674, sis: 895, idecoop: 839 };
const BANCARIOS = new Set(["banco-multiple", "asociacion", "ahorro-credito", "corporacion-credito", "entidad-publica", "cooperativa"]);

/** El resultado de describir un nodo: sus triples y cómo se llama. */
export interface Descripcion {
  triples: Triple[];
  titulo: string;
  /** Lo que la descripción deja fuera y lo dice: «Se describen 200 de sus 312 cargos vigentes». */
  nota?: string;
}

/**
 * La descripción RDF de un nodo. `ligero` deja solo el nodo y sus datos
 * propios, sin los cargos, las designaciones ni las medidas que lo rodean: es
 * lo que se incrusta en schema.org en cada ficha, donde el vecindario sobra y
 * costaría leerlo en cada render.
 */
export async function describir(n: NodoRdf, ligero = false): Promise<Descripcion | null> {
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

/** Describe la ficha de una ruta de la plataforma, si es un nodo del grafo. */
export async function describirRuta(ruta: string): Promise<Descripcion | null> {
  const n = nodoDeRuta(ruta);
  return n ? describir(n) : null;
}

/* ---------------------------------------------------------------- persona */

/** Los triples de un cargo, con el vecindario que hace falta para leerlo. */
async function triplesCargo(persona: Persona, c: Cargo, x: Triple[]): Promise<string> {
  const pIri = iriDe({ tipo: "funcionario", id: persona.id });
  const cIri = `${SITIO}${enlace.funcionario(persona.id)}#cargo-${huella(
    [c.titulo, c.fecha, c.movimiento, c.decreto?.numero ?? "", c.origen].join("|"),
  )}`;
  x.push(
    t(cIri, "rdf:type", iri("soc:Cargo")),
    t(cIri, "rdf:type", iri("org:Membership")),
    t(cIri, "rdfs:label", lit(c.titulo, "es")),
    t(cIri, "schema:roleName", lit(c.titulo, "es")),
    t(cIri, "soc:titular", iri(pIri)),
    t(cIri, "org:member", iri(pIri)),
    t(cIri, "soc:movimiento", iri(`soc:movimiento-${c.movimiento}`)),
    t(cIri, "dct:source", lit(ETIQUETA_ORIGEN[c.origen], "es")),
    t(pIri, "soc:ocupa", iri(cIri)),
  );
  if (c.fecha) x.push(t(cIri, "soc:fecha", fecha(c.fecha)));
  if (c.periodo) x.push(t(cIri, "schema:description", lit(`Período ${c.periodo}`, "es")));
  if (c.numeral311 != null) x.push(t(cIri, "soc:numeralLey311", entero(c.numeral311)));
  if (c.url) x.push(t(cIri, "dct:source", iri(c.url)));
  if (c.institucionId != null) {
    const inst = institucionPorId(c.institucionId);
    if (inst) {
      x.push(
        t(cIri, "soc:enInstitucion", iri(DE(inst.id))),
        t(cIri, "org:organization", iri(DE(inst.id))),
        t(DE(inst.id), "rdfs:label", lit(inst.nombre, "es")),
      );
    }
  }
  const prov = provinciaDeTexto(c.provincia);
  if (prov) {
    const pr = iriDe({ tipo: "provincia", id: prov.slug });
    x.push(t(cIri, "soc:enProvincia", iri(pr)), t(pr, "rdfs:label", lit(prov.nombre, "es")));
  }
  if (c.decreto?.numero) {
    const d = await decretoPorNumero(c.decreto.numero);
    const ficha = d != null && (c.decreto.docId == null || d.docId === c.decreto.docId);
    const dIri = iriDecreto({ numero: c.decreto.numero, ficha, docId: c.decreto.docId ?? d?.docId ?? null });
    if (dIri) {
      x.push(
        t(cIri, "soc:segunDecreto", iri(dIri)),
        t(dIri, "rdf:type", iri("soc:Decreto")),
        t(dIri, "rdfs:label", lit(nombreDecreto(c.decreto.numero), "es")),
      );
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
  const x: Triple[] = [
    t(s, "rdf:type", iri("soc:Persona")),
    t(s, "rdf:type", iri("schema:Person")),
    t(s, "rdf:type", iri("foaf:Person")),
    t(s, "rdfs:label", lit(p.nombre)),
    t(s, "schema:name", lit(p.nombre)),
    t(s, "foaf:page", iri(`${SITIO}${enlace.funcionario(id)}`)),
    t(s, "soc:pepVigente", booleano(p.pepVigente)),
  ];
  if (p.pepVigente) x.push(t(s, "rdf:type", iri("soc:PersonaExpuestaPoliticamente")));
  for (const a of p.alias) x.push(t(s, "skos:altLabel", lit(a)));
  for (const c of p.cargos) {
    if (!ligero) await triplesCargo(p, c, x);
    // Lo que schema.org lee de una persona: el cargo de hoy y dónde.
    if (esActual(c)) {
      x.push(t(s, "schema:jobTitle", lit(c.titulo, "es")));
      if (c.institucionId != null && institucionPorId(c.institucionId)) x.push(t(s, "schema:worksFor", iri(DE(c.institucionId))));
    }
  }
  if (p.firma) {
    x.push(
      t(s, "soc:decretosFirmados", entero(p.firma.decretos)),
      t(s, "rdfs:seeAlso", iri(`${SITIO}${enlace.decretosFirmados(id)}`)),
    );
    // Los más recientes, como aristas: los demás están en su lista de decretos.
    // Una fila fechada fuera de sus períodos de firma no se le atribuye.
    if (!ligero) {
      const suyos = (await decretosDeFirmante(p.firma.clave)).filter((d) => d.ficha && d.numero && d.aviso !== "fuera");
      const recientes = [...suyos].sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "")).slice(0, TOPE_FIRMADOS);
      for (const d of recientes) {
        const dIri = iriDe({ tipo: "decreto", id: d.numero! });
        x.push(
          t(s, "soc:firmo", iri(dIri)),
          t(dIri, "rdf:type", iri("soc:Decreto")),
          t(dIri, "rdfs:label", lit(nombreDecreto(d.numero), "es")),
          t(dIri, "dct:title", lit(d.titulo, "es")),
        );
        if (d.fecha) x.push(t(dIri, "soc:fecha", fecha(d.fecha)));
      }
      if (suyos.length > recientes.length) {
        nota = `Se describen los ${recientes.length} decretos más recientes de los ${p.firma.decretos.toLocaleString("es-DO")} que firmó; la lista entera está en su ficha.`;
      }
    }
  }
  if (p.legislador != null) {
    const l = `${SITIO}${enlace.legislador(p.legislador)}#id`;
    x.push(t(s, "owl:sameAs", iri(l)));
  }
  for (const d of ligero ? [] : await declaracionesDe(id)) {
    x.push(
      t(s, "soc:declaracion", iri(d.url)),
      t(d.url, "rdf:type", iri("soc:DeclaracionJurada")),
      t(d.url, "dct:title", lit(d.titulo, "es")),
    );
    if (d.institucionId != null) x.push(t(d.url, "soc:publicadaPor", iri(DE(d.institucionId))));
    if (d.fecha) x.push(t(d.url, "schema:uploadDate", fecha(d.fecha)));
  }
  // Su QID de Wikidata, solo si es PEP hoy o firmó decretos como jefe de
  // Estado: la regla de proporcionalidad de su ficha (solo esas se ofrecen a
  // los buscadores). La página de Wikidata trae biografía y familia, que la
  // plataforma no publica; de quien dejó un cargo hace años no se enlaza.
  const qid = p.pepVigente || p.firma ? await wikidataDe({ tipo: "funcionario", id }) : null;
  if (qid) x.push(t(s, "owl:sameAs", iri(`wd:${qid}`)));
  return { triples: x, titulo: p.nombre, nota };
}

/* ------------------------------------------------------------- institución */

/** Hasta cuántos cargos de hoy se describen en la ficha de una institución. */
const TOPE_CARGOS = 200;

async function describirInstitucion(id: number, ligero = false): Promise<Descripcion | null> {
  const inst = institucionPorId(id);
  if (!inst) return null;
  let nota: string | undefined;
  const s = DE(inst.id);
  const x: Triple[] = [
    t(s, "rdf:type", iri("soc:Institucion")),
    t(s, "rdf:type", iri("schema:GovernmentOrganization")),
    t(s, "rdf:type", iri("org:FormalOrganization")),
    t(s, "rdfs:label", lit(inst.nombre, "es")),
    t(s, "schema:name", lit(inst.nombre, "es")),
    t(s, "soc:sector", iri(`soc:sector-${inst.sector}`)),
    t(s, "foaf:page", iri(`${SITIO}${enlace.institucion(inst.id, inst.acronimo || inst.nombre)}`)),
  ];
  if (inst.acronimo) x.push(t(s, "schema:alternateName", lit(inst.acronimo)), t(s, "skos:altLabel", lit(inst.acronimo)));
  const f = ligero ? null : await getFuncionarios();
  if (f) {
    const cabeza = quienDirige(f, inst.id);
    if (cabeza) {
      const p = iriDe({ tipo: "funcionario", id: cabeza.persona.id });
      x.push(t(p, "soc:dirige", iri(s)), t(p, "org:headOf", iri(s)), t(p, "rdfs:label", lit(cabeza.persona.nombre)));
    }
    const vigentes = personasDeInstitucion(f, inst.id).filter(({ cargo }) => esActual(cargo));
    const hoy = vigentes.slice(0, TOPE_CARGOS);
    if (vigentes.length > hoy.length) nota = `Se describen ${hoy.length} de sus ${vigentes.length} cargos vigentes, en el orden de la institución.`;
    for (const { persona, cargo } of hoy) {
      await triplesCargo(persona, cargo, x);
      x.push(t(iriDe({ tipo: "funcionario", id: persona.id }), "rdfs:label", lit(persona.nombre)));
    }
  }
  const banco = await entidadDeInstitucion(inst.id);
  if (banco) {
    const b = iriDe({ tipo: "entidad-financiera", id: banco.slug });
    x.push(t(s, "owl:sameAs", iri(b)), t(b, "rdfs:label", lit(banco.nombre)));
  }
  for (const d of ligero ? [] : await declaracionesDeInstitucion(inst.id)) {
    x.push(
      t(d.url, "rdf:type", iri("soc:DeclaracionJurada")),
      t(d.url, "dct:title", lit(d.titulo, "es")),
      t(d.url, "soc:publicadaPor", iri(s)),
    );
  }
  const qid = await wikidataDe({ tipo: "institucion", id: String(inst.id) });
  if (qid) x.push(t(s, "owl:sameAs", iri(`wd:${qid}`)));
  return { triples: x, titulo: inst.nombre, nota };
}

/* ------------------------------------------------------ entidad financiera */

async function describirFinanciera(slug: string): Promise<Descripcion | null> {
  const e = await entidadPorSlug(slug);
  if (!e) return null;
  const s = iriDe({ tipo: "entidad-financiera", id: slug });
  const x: Triple[] = [
    t(s, "rdf:type", iri("soc:EntidadFinanciera")),
    t(s, "rdf:type", iri(BANCARIOS.has(e.sector) ? "schema:BankOrCreditUnion" : "schema:FinancialService")),
    t(s, "rdf:type", iri("org:FormalOrganization")),
    t(s, "rdfs:label", lit(e.nombre)),
    t(s, "schema:name", lit(e.nombre)),
    t(s, "foaf:page", iri(`${SITIO}${enlace.entidadFinanciera(slug)}`)),
  ];
  if (e.razonSocial) x.push(t(s, "schema:legalName", lit(e.razonSocial)));
  if (e.siglas) x.push(t(s, "schema:alternateName", lit(e.siglas)));
  if (e.tipo) x.push(t(s, "schema:description", lit(e.tipo, "es")));
  if (e.estatus) x.push(t(s, "soc:estado", lit(e.estatus, "es")));
  if (e.web) x.push(t(s, "foaf:homepage", iri(e.web)));
  const sup = SUPERVISOR_INSTITUCION[e.supervisor];
  if (sup) {
    const inst = institucionPorId(sup);
    x.push(t(s, "soc:supervisadaPor", iri(DE(sup))));
    if (inst) x.push(t(DE(sup), "rdfs:label", lit(inst.nombre, "es")));
  }
  if (e.rnc) {
    x.push(t(s, "soc:rnc", lit(e.rnc)), t(s, "schema:taxID", lit(e.rnc)));
    const emp = await empresaPorRnc(e.rnc);
    if (emp) {
      const em = iriDe({ tipo: "empresa", id: e.rnc });
      x.push(t(s, "owl:sameAs", iri(em)), t(em, "rdfs:label", lit(emp.razonSocial)));
    }
  }
  const inst = institucionDe(e);
  if (inst) x.push(t(s, "owl:sameAs", iri(DE(inst.id))), t(DE(inst.id), "rdfs:label", lit(inst.nombre, "es")));
  const qid = await wikidataDe({ tipo: "entidad-financiera", id: slug });
  if (qid) x.push(t(s, "owl:sameAs", iri(`wd:${qid}`)));
  return { triples: x, titulo: e.nombre };
}

/* --------------------------------------------------------------- empresa */

async function describirEmpresa(rnc: string, ligero = false): Promise<Descripcion | null> {
  const e = await empresaPorRnc(rnc);
  if (!e) return null;
  const s = iriDe({ tipo: "empresa", id: e.rnc });
  const x: Triple[] = [
    t(s, "rdf:type", iri("soc:Empresa")),
    t(s, "rdf:type", iri("schema:Organization")),
    t(s, "rdf:type", iri("rov:RegisteredOrganization")),
    t(s, "rdfs:label", lit(e.razonSocial)),
    t(s, "schema:legalName", lit(e.razonSocial)),
    t(s, "soc:rnc", lit(e.rnc)),
    t(s, "schema:taxID", lit(e.rnc)),
    t(s, "soc:estado", lit(e.estado, "es")),
    t(s, "foaf:page", iri(`${SITIO}${enlace.empresa(e.rnc)}`)),
  ];
  // El inicio de operaciones que declaró a la DGII, no su constitución: no es `schema:foundingDate`.
  if (e.inicio) x.push(t(s, "soc:inicioOperaciones", fecha(e.inicio)));
  if (e.actividad) x.push(t(s, "schema:description", lit(e.actividad, "es")));
  for (const rpe of e.rpe) {
    const pr = `${SITIO}${enlace.proveedor(rpe)}#id`;
    x.push(t(s, "soc:inscritaComo", iri(pr)), t(pr, "rdf:type", iri("soc:Proveedor")), t(pr, "soc:rpe", lit(rpe)), t(pr, "rdfs:label", lit(`RPE ${rpe}`)));
  }
  for (const p of ligero ? [] : await medidasDeRnc(e.rnc)) {
    const pr = `${SITIO}${enlace.proveedor(p.rpe)}#id`;
    x.push(t(pr, "rdf:type", iri("soc:Proveedor")), t(pr, "soc:rpe", lit(p.rpe)));
    for (const m of p.eventos) {
      const mIri = `${SITIO}${enlace.proveedor(p.rpe)}#medida-${huella([m.fecha, m.tipo, m.resolucion ?? "", m.motivo].join("|"))}`;
      x.push(
        t(pr, "soc:tieneMedida", iri(mIri)),
        t(mIri, "rdf:type", iri("soc:MedidaDGCP")),
        t(mIri, "soc:tipoDeMedida", iri(`soc:medida-${m.tipo}`)),
        t(mIri, "soc:fecha", fecha(m.fecha)),
        t(mIri, "dct:description", lit(m.motivo, "es")),
      );
      if (m.resolucion) x.push(t(mIri, "rdfs:label", lit(m.resolucion, "es")));
    }
  }
  const ofac = await ofacDeRnc(e.rnc);
  if (ofac) x.push(t(s, "rdfs:seeAlso", iri(hrefFichaOfac(ofac.ent))));
  const banco = await entidadPorRnc(e.rnc);
  if (banco) {
    const b = iriDe({ tipo: "entidad-financiera", id: banco.slug });
    x.push(t(s, "owl:sameAs", iri(b)), t(b, "rdfs:label", lit(banco.nombre)));
  }
  return { triples: x, titulo: e.razonSocial };
}

/* --------------------------------------------------------------- decreto */

async function describirDecreto(numero: string, ligero = false): Promise<Descripcion | null> {
  const d = await decretoPorNumero(numero);
  if (!d || !d.numero) return null;
  const s = iriDe({ tipo: "decreto", id: d.numero });
  const x: Triple[] = [
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
    t(s, "soc:materia", iri(`soc:materia-${d.materia.slug}`)),
    t(s, "foaf:page", iri(`${SITIO}${enlace.norma("decreto", d.numero)}`)),
  ];
  if (d.fecha) {
    x.push(t(s, "soc:fecha", fecha(d.fecha)), t(s, "eli:date_document", fecha(d.fecha)), t(s, "schema:legislationDate", fecha(d.fecha)));
  }
  if (d.aviso) x.push(t(s, "soc:aviso", lit(d.aviso)));
  if (d.institucion) x.push(t(s, "soc:etiquetaConsultoria", lit(d.institucion, "es")));
  if (d.docId != null) {
    const pdf = `${CONSULTORIA_PDF}${d.docId}`;
    x.push(t(s, "schema:encoding", iri(pdf)), t(s, "eli:is_realized_by", iri(pdf)));
  }
  // «Lo firma» solo si la fila no está fechada fuera de los períodos de su firmante.
  if (d.firmante && d.aviso !== "fuera") {
    const p = await personaPorFirma(d.firmante);
    if (p) {
      const pIri = iriDe({ tipo: "funcionario", id: p.id });
      x.push(
        t(s, "soc:firmadoPor", iri(pIri)),
        t(s, "eli:passed_by", iri(pIri)),
        t(s, "schema:legislationPassedBy", iri(pIri)),
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
      x.push(t(s, "soc:designa", iri(pIri)), t(pIri, "rdfs:label", lit(persona.nombre)));
    }
  }
  return { triples: x, titulo: nombreDecreto(d.numero) };
}

/* ------------------------------------------------------------- provincia */

async function describirProvincia(slug: string, ligero = false): Promise<Descripcion | null> {
  const prov = provinciaDeSlug(slug);
  if (!prov) return null;
  const s = iriDe({ tipo: "provincia", id: prov.slug });
  const x: Triple[] = [
    t(s, "rdf:type", iri("soc:Provincia")),
    t(s, "rdf:type", iri("schema:AdministrativeArea")),
    t(s, "rdfs:label", lit(prov.nombre, "es")),
    t(s, "schema:name", lit(prov.nombre, "es")),
    t(s, "schema:containedInPlace", iri("wd:Q786")),
    t("wd:Q786", "rdf:type", iri("schema:Country")),
    t("wd:Q786", "rdfs:label", lit("República Dominicana", "es")),
    t(s, "foaf:page", iri(`${SITIO}${enlace.provincia(prov.slug)}`)),
  ];
  const f = ligero ? null : await getFuncionarios();
  if (f) {
    const g = gobiernoDeProvincia(f, (texto) => provinciaDeTexto(texto)?.slug === prov.slug);
    const cargos = [...(g.gobernador ? [g.gobernador] : []), ...g.alcaldes, ...g.directores];
    for (const { persona, cargo } of cargos) {
      const cIri = await triplesCargo(persona, cargo, x);
      x.push(t(cIri, "soc:enProvincia", iri(s)), t(iriDe({ tipo: "funcionario", id: persona.id }), "rdfs:label", lit(persona.nombre)));
    }
  }
  const qid = await wikidataDe({ tipo: "provincia", id: prov.slug });
  if (qid) x.push(t(s, "owl:sameAs", iri(`wd:${qid}`)));
  return { triples: x, titulo: prov.nombre };
}

/* ------------------------------------------------------------ el conjunto */

/** Una clase del grafo con cuántos nodos tiene hoy y de qué fuente salen. */
export interface ClaseContada {
  clase: string;
  etiqueta: string;
  n: number;
  fuente: string;
  /** La fecha de la instantánea (ISO), si la tiene. */
  corte: string | null;
}

/** Cuántos nodos de cada clase tiene el grafo hoy: para VoID y para `/grafo`. */
export async function inventario(): Promise<ClaseContada[]> {
  const [f, indice, fin, padron, dj, sanc] = await Promise.all([
    getFuncionarios(),
    indiceDecretos(),
    getFinancieras(),
    padronEmpresas(),
    getDeclaraciones(),
    getSanciones(),
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
    { clase: "soc:MedidaDGCP", etiqueta: "Medidas sobre proveedores", n: medidas, fuente: "DGCP", corte: sanc?.generado ?? null },
  ];
  return filas.filter((c) => c.n > 0);
}

/** Cuántos nodos están atados a Wikidata, por tipo. */
export async function enlacesWikidata(): Promise<{ total: number; generado: string | null; porTipo: Record<string, number> }> {
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
export type GrupoRelacion = "cargos" | "decretos" | "entidades" | "lugares" | "registros";

export const GRUPOS: readonly { id: GrupoRelacion; etiqueta: string }[] = [
  { id: "cargos", etiqueta: "Cargos" },
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
  const agregar = (r: Omit<Relacion, "detalle" | "movimiento" | "fecha"> & Partial<Relacion>) => {
    const completa: Relacion = { detalle: null, movimiento: null, fecha: null, ...r };
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
      const v = await vecindario(nodos.get(k)!);
      exploradas++;
      if (!v) continue;
      nombres.set(k, v.titulo);
      for (const r of v.relaciones) {
        if (!r.nodo) continue;
        const kv = claveNodo(r.nodo);
        if (!nombres.has(kv)) nombres.set(kv, r.nombre);
        if (padre[lado].has(kv)) continue;
        padre[lado].set(kv, { desde: k, via: r.neutro });
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
const VERSION_CAMINO = "2";

/** Las instantáneas que lee una descripción: su tamaño en bytes cambia con casi cualquier cambio de datos. */
const INSTANTANEAS = [
  "funcionarios.json",
  "decretos/indice.json",
  "banca.json",
  "declaraciones.json",
  "sanciones.json",
  "wikidata.json",
  "empresas/meta.json",
];

let huellaMemo: Promise<string> | null = null;

/**
 * La huella de los datos para la clave de la caché: el tamaño de cada
 * instantánea que lee `describir` (no su fecha: un despliegue puede
 * normalizarla). Un corte nuevo, o un cambio de datos con la misma fecha de
 * corte (la separación de un tocayo), cambia la huella y deja atrás los
 * caminos calculados con los viejos.
 */
function huellaDatos(): Promise<string> {
  huellaMemo ??= Promise.all(
    INSTANTANEAS.map((n) =>
      stat(join(process.cwd(), "public", "data", n)).then(
        (e) => `${e.size}`,
        () => "-",
      ),
    ),
  ).then((partes) => partes.join("."));
  return huellaMemo;
}

/**
 * El camino, cacheado por par **sin orden** (de A a B es el de B a A, al
 * revés) y por la huella de los datos: un despliegue con datos nuevos no lee
 * caminos de los viejos.
 */
export async function camino(de: NodoRdf, a: NodoRdf): Promise<Camino> {
  const [x, y] = [claveNodo(de), claveNodo(a)];
  const alReves = x > y;
  const [primero, segundo] = alReves ? [a, de] : [de, a];
  const huella = await huellaDatos();
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

/* ------------------------------------------------------------ schema.org */

const SCHEMA = PREFIJOS.schema;
const local = (v: string) => v.slice(v.lastIndexOf("/") + 1);

/**
 * La descripción de un nodo en schema.org, para incrustarla en su ficha
 * (JSON-LD en la página: lo que leen los buscadores). Sale de los mismos
 * triples, filtrados al sujeto: sus tipos y propiedades de schema.org, su
 * `owl:sameAs` como `sameAs` y su página como `url`; cada vecino, con su
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
      else if (x.o.tipo === "iri") sumar(k, x.p === SCHEMA + "encoding" ? { "@type": "MediaObject", contentUrl: x.o.valor, encodingFormat: "application/pdf" } : ref(x.o.valor));
    } else if (x.p === V.mismo && x.o.tipo === "iri") {
      sumar("sameAs", url(x.o.valor));
    } else if (x.p === expandir("foaf:page") && x.o.tipo === "iri") {
      obj.url = x.o.valor;
    }
  }
  if (!obj.name && nombres.has(sujeto)) obj.name = nombres.get(sujeto);
  return obj;
}

/** El JSON-LD de schema.org de una ficha, o `null` si no es un nodo. */
export async function schemaOrgDe(n: NodoRdf): Promise<Record<string, unknown> | null> {
  const d = await describir(n, true);
  return d ? aSchemaOrg(d.triples, iriDe(n)) : null;
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
    const d = await decretoPorNumero(numeroCanonico("decreto", numero));
    if (d?.numero && d.ficha) {
      salida.push({ nodo: { tipo: "decreto", id: d.numero }, nombre: nombreDecreto(d.numero), clase: CLASE_DE_TIPO.decreto, detalle: desdeMayusculas(d.titulo) });
    }
  }
  const cifras = texto.replace(/[\s.\-]/g, "");
  if (/^\d{9}$/.test(cifras)) {
    const e = await empresaPorRnc(cifras);
    if (e) salida.push({ nodo: { tipo: "empresa", id: e.rnc }, nombre: e.razonSocial, clase: CLASE_DE_TIPO.empresa, detalle: `RNC ${e.rnc}` });
  }
  if (salida.length) return { candidatos: salida, truncado: false };

  let truncado = false;
  const a = agujas(texto);
  const f = await getFuncionarios();
  if (f) {
    const personas = filtrarPersonas(f, { q: texto });
    truncado ||= personas.length > TOPE_CANDIDATOS.personas;
    for (const p of personas.slice(0, TOPE_CANDIDATOS.personas)) {
      salida.push({ nodo: { tipo: "funcionario", id: p.id }, nombre: p.nombre, clase: CLASE_DE_TIPO.funcionario, detalle: cargoPrincipal(p)?.titulo ?? null });
    }
  }
  const instituciones = buscarInstituciones(texto, TOPE_CANDIDATOS.instituciones + 1);
  truncado ||= instituciones.length > TOPE_CANDIDATOS.instituciones;
  for (const i of instituciones.slice(0, TOPE_CANDIDATOS.instituciones)) {
    salida.push({ nodo: { tipo: "institucion", id: String(i.id) }, nombre: i.nombre, clase: CLASE_DE_TIPO.institucion, detalle: i.acronimo || null });
  }
  const fin = await getFinancieras();
  if (fin) {
    const entidades = filtrarEntidades(fin, { q: texto });
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
