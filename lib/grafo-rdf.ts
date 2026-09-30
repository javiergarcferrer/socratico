import { SITIO } from "@/lib/sitio";
import { enlace, nodoDeRuta, rutaDeNodo, type NodoRdf } from "@/lib/grafo";
import { booleano, entero, fecha, iri, lit, t, type Termino, type Triple } from "@/lib/rdf";
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
  type Persona,
} from "@/lib/funcionarios";
import { INSTITUCIONES, institucionPorId, type Institucion } from "@/lib/instituciones";
import { decretoPorNumero, hrefDecreto, CONSULTORIA_PDF, type Decreto } from "@/lib/decretos";
import { declaracionesDe, declaracionesDeInstitucion } from "@/lib/declaraciones";
import { entidadDeInstitucion, entidadPorRnc, entidadPorSlug, institucionDe, type EntidadFinanciera } from "@/lib/financieras";
import { empresaPorRnc } from "@/lib/empresas";
import { medidasDeRnc, ofacDeRnc, hrefFichaOfac } from "@/lib/sanciones";
import { PROVINCIAS, provinciaDeSlug, provinciaDeTexto } from "@/lib/provincias";
import { wikidataDe } from "@/lib/wikidata";

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
}

export async function describir(n: NodoRdf): Promise<Descripcion | null> {
  switch (n.tipo) {
    case "funcionario":
      return describirPersona(n.id);
    case "institucion":
      return describirInstitucion(Number(n.id));
    case "entidad-financiera":
      return describirFinanciera(n.id);
    case "empresa":
      return describirEmpresa(n.id);
    case "decreto":
      return describirDecreto(n.id);
    case "provincia":
      return describirProvincia(n.id);
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

async function describirPersona(id: string): Promise<Descripcion | null> {
  const f = await getFuncionarios();
  const p = f?.porId.get(id);
  if (!p) return null;
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
  for (const c of p.cargos) await triplesCargo(p, c, x);
  if (p.firma) {
    x.push(
      t(s, "soc:decretosFirmados", entero(p.firma.decretos)),
      t(s, "rdfs:seeAlso", iri(`${SITIO}${enlace.decretosFirmados(id)}`)),
    );
  }
  if (p.legislador != null) {
    const l = `${SITIO}${enlace.legislador(p.legislador)}#id`;
    x.push(t(s, "owl:sameAs", iri(l)));
  }
  for (const d of await declaracionesDe(id)) {
    x.push(
      t(s, "soc:declaracion", iri(d.url)),
      t(d.url, "rdf:type", iri("soc:DeclaracionJurada")),
      t(d.url, "dct:title", lit(d.titulo, "es")),
    );
    if (d.institucionId != null) x.push(t(d.url, "soc:publicadaPor", iri(DE(d.institucionId))));
    if (d.fecha) x.push(t(d.url, "schema:uploadDate", fecha(d.fecha)));
  }
  const qid = await wikidataDe({ tipo: "funcionario", id });
  if (qid) x.push(t(s, "owl:sameAs", iri(`wd:${qid}`)));
  return { triples: x, titulo: p.nombre };
}

/* ------------------------------------------------------------- institución */

/** Hasta cuántos cargos de hoy se describen en la ficha de una institución. */
const TOPE_CARGOS = 200;

async function describirInstitucion(id: number): Promise<Descripcion | null> {
  const inst = institucionPorId(id);
  if (!inst) return null;
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
  const f = await getFuncionarios();
  if (f) {
    const cabeza = quienDirige(f, inst.id);
    if (cabeza) {
      const p = iriDe({ tipo: "funcionario", id: cabeza.persona.id });
      x.push(t(p, "soc:dirige", iri(s)), t(p, "org:headOf", iri(s)), t(p, "rdfs:label", lit(cabeza.persona.nombre)));
    }
    const hoy = personasDeInstitucion(f, inst.id).filter(({ cargo }) => esActual(cargo)).slice(0, TOPE_CARGOS);
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
  for (const d of await declaracionesDeInstitucion(inst.id)) {
    x.push(
      t(d.url, "rdf:type", iri("soc:DeclaracionJurada")),
      t(d.url, "dct:title", lit(d.titulo, "es")),
      t(d.url, "soc:publicadaPor", iri(s)),
    );
  }
  const qid = await wikidataDe({ tipo: "institucion", id: String(inst.id) });
  if (qid) x.push(t(s, "owl:sameAs", iri(`wd:${qid}`)));
  return { triples: x, titulo: inst.nombre };
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

async function describirEmpresa(rnc: string): Promise<Descripcion | null> {
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
  if (e.inicio) x.push(t(s, "schema:foundingDate", fecha(e.inicio)));
  if (e.actividad) x.push(t(s, "schema:description", lit(e.actividad, "es")));
  for (const rpe of e.rpe) {
    const pr = `${SITIO}${enlace.proveedor(rpe)}#id`;
    x.push(t(s, "soc:inscritaComo", iri(pr)), t(pr, "rdf:type", iri("soc:Proveedor")), t(pr, "soc:rpe", lit(rpe)), t(pr, "rdfs:label", lit(`RPE ${rpe}`)));
  }
  for (const p of await medidasDeRnc(e.rnc)) {
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

async function describirDecreto(numero: string): Promise<Descripcion | null> {
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
    t(s, "schema:name", lit(d.titulo, "es")),
    t(s, "soc:materia", iri(`soc:materia-${d.materia.slug}`)),
    t(s, "foaf:page", iri(`${SITIO}${enlace.norma("decreto", d.numero)}`)),
  ];
  if (d.fecha) x.push(t(s, "soc:fecha", fecha(d.fecha)), t(s, "eli:date_document", fecha(d.fecha)));
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
        t(pIri, "rdfs:label", lit(p.nombre)),
      );
    }
  }
  const f = await getFuncionarios();
  if (f) {
    const vistos = new Set<string>();
    for (const { persona } of personasDelDecreto(f, d.numero)) {
      if (vistos.has(persona.id)) continue;
      vistos.add(persona.id);
      const pIri = iriDe({ tipo: "funcionario", id: persona.id });
      x.push(t(s, "soc:designa", iri(pIri)), t(pIri, "rdfs:label", lit(persona.nombre)));
    }
  }
  return { triples: x, titulo: nombreDecreto(d.numero) };
}

/* ------------------------------------------------------------- provincia */

async function describirProvincia(slug: string): Promise<Descripcion | null> {
  const prov = provinciaDeSlug(slug);
  if (!prov) return null;
  const s = iriDe({ tipo: "provincia", id: prov.slug });
  const x: Triple[] = [
    t(s, "rdf:type", iri("soc:Provincia")),
    t(s, "rdf:type", iri("schema:AdministrativeArea")),
    t(s, "rdfs:label", lit(prov.nombre, "es")),
    t(s, "schema:name", lit(prov.nombre, "es")),
    t(s, "schema:containedInPlace", iri("wd:Q786")),
    t(s, "foaf:page", iri(`${SITIO}${enlace.provincia(prov.slug)}`)),
  ];
  const f = await getFuncionarios();
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

/** Cuántos nodos de cada clase tiene el grafo hoy: para VoID y para `/grafo`. */
export async function inventario(): Promise<{ clase: string; n: number }[]> {
  const f = await getFuncionarios();
  const personas = f?.personas.length ?? 0;
  const cargos = f?.personas.reduce((n, p) => n + p.cargos.length, 0) ?? 0;
  return [
    { clase: "soc:Persona", n: personas },
    { clase: "soc:Cargo", n: cargos },
    { clase: "soc:Institucion", n: INSTITUCIONES.length },
    { clase: "soc:Provincia", n: PROVINCIAS.length },
  ];
}

export type { Termino };
