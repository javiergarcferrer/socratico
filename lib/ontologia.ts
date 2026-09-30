import { MATERIAS } from "@/lib/materias-decreto";
import { ETIQUETA_MOVIMIENTO, FAMILIAS_PEP } from "@/lib/funcionarios";
import { SECTORES } from "@/lib/instituciones";
import { TIPOS_MEDIDA } from "@/lib/sanciones";
import { ONTOLOGIA, PREFIJOS, entero, expandir, iri, lit, t, type Triple } from "@/lib/rdf";

/**
 * La ontología de Socrático.do: qué clases de cosas hay en el grafo y cómo se
 * relacionan, en OWL 2 y RDFS, con su equivalencia en los vocabularios que el
 * mundo ya lee —schema.org para los buscadores, la Ontología de
 * Organizaciones (W3C ORG) para cargos e instituciones, ELI para las normas,
 * FOAF para personas y documentos, la de Organizaciones Registradas (ROV)
 * para empresas— y su correspondencia con Wikidata (SKOS).
 *
 * Es la fuente de verdad de tres salidas: la página `/ontologia` (en llano),
 * `/ontologia.ttl` y `/ontologia.jsonld` (para máquinas). Los esquemas de
 * conceptos no se escriben aquí: salen de las mismas tablas que usa la
 * interfaz (las materias de un decreto, los movimientos de un cargo, los
 * sectores del Estado, las familias PEP, los tipos de medida de la DGCP), así
 * que no pueden desalinearse.
 *
 * Reglas de alineación, para no afirmar de más: `rdfs:subClassOf` hacia fuera
 * (una Persona de aquí es una `schema:Person`, no al revés);
 * `rdfs:subPropertyOf` igual; `skos:closeMatch` o `skos:broadMatch` hacia
 * Wikidata, cuyos elementos no son clases OWL. Cada QID se verificó contra
 * Wikidata el 30-09-2026 (docs/AUDITORIA.md §H.14).
 */

export const VERSION = "1.0.0";
export const PUBLICADA = "2026-09-30";

export interface Clase {
  /** La parte local: `soc:Persona`. */
  id: string;
  etiqueta: string;
  etiquetaEn: string;
  comentario: string;
  subClaseDe: string[];
  /** Correspondencias con Wikidata (y su fuerza). */
  wikidata?: { qid: string; relacion: "closeMatch" | "broadMatch"; nombre: string }[];
}

export interface Propiedad {
  id: string;
  tipo: "objeto" | "dato";
  etiqueta: string;
  etiquetaEn: string;
  comentario: string;
  dominio: string[];
  rango: string[];
  subPropiedadDe?: string[];
  inversa?: string;
  funcional?: boolean;
}

export interface Esquema {
  id: string;
  etiqueta: string;
  comentario: string;
  conceptos: { id: string; etiqueta: string; definicion?: string }[];
}

export const CLASES: Clase[] = [
  {
    id: "Persona",
    etiqueta: "Persona con cargo público",
    etiquetaEn: "Person holding public office",
    comentario:
      "Una persona que las fuentes del Estado nombran en un cargo público o como firmante de decretos. Se identifica por su nombre normalizado, nunca por su cédula; dos grafías distintas son dos personas del grafo.",
    subClaseDe: ["foaf:Person", "schema:Person"],
    wikidata: [{ qid: "Q5", relacion: "broadMatch", nombre: "ser humano" }],
  },
  {
    id: "PersonaExpuestaPoliticamente",
    etiqueta: "Persona expuesta políticamente",
    etiquetaEn: "Politically exposed person",
    comentario:
      "Quien ocupa, o ocupó en los últimos tres años, un cargo obligado a declarar patrimonio (Ley 155-17, art. 2, num. 19, que remite al art. 2 de la Ley 311-14). Es una categoría legal, no una acusación.",
    subClaseDe: ["soc:Persona"],
    wikidata: [{ qid: "Q106155", relacion: "closeMatch", nombre: "persona expuesta políticamente" }],
  },
  {
    id: "Cargo",
    etiqueta: "Cargo",
    etiquetaEn: "Post held",
    comentario:
      "Un cargo que una persona ocupa u ocupó en una institución, tal como lo registra su fuente: el Directorio de Funcionarios del MAP, un decreto, una alta corte, la JCE o el SIL. Lleva su movimiento (designación, cese, elección…), su fecha y, si lo hay, el decreto.",
    subClaseDe: ["org:Membership", "schema:OrganizationRole"],
    wikidata: [{ qid: "Q294414", relacion: "closeMatch", nombre: "cargo público" }],
  },
  {
    id: "Institucion",
    etiqueta: "Institución del Estado",
    etiquetaEn: "State institution",
    comentario:
      "Una de las entidades del sector público dominicano: el Clasificador Institucional de DIGEPRES cruzado con las unidades de compra de la DGCP, la ejecución del SIGEF, la nómina y la Consultoría Jurídica.",
    subClaseDe: ["org:FormalOrganization", "schema:GovernmentOrganization"],
    wikidata: [{ qid: "Q327333", relacion: "closeMatch", nombre: "organismo público" }],
  },
  {
    id: "EntidadFinanciera",
    etiqueta: "Entidad financiera supervisada",
    etiquetaEn: "Supervised financial entity",
    comentario:
      "Un banco, asociación, corporación de crédito, cooperativa, AFP, aseguradora o agente de cambio que registra su supervisor: la Superintendencia de Bancos, SIPEN, la Superintendencia de Seguros o IDECOOP.",
    subClaseDe: ["org:FormalOrganization", "schema:FinancialService"],
    wikidata: [{ qid: "Q650241", relacion: "closeMatch", nombre: "institución financiera" }],
  },
  {
    id: "Empresa",
    etiqueta: "Persona jurídica",
    etiquetaEn: "Legal entity",
    comentario:
      "Una persona jurídica del padrón de contribuyentes de la DGII, por su RNC de nueve cifras: empresas, asociaciones y fundaciones. Las personas físicas del padrón no están en el grafo.",
    subClaseDe: ["rov:RegisteredOrganization", "schema:Organization"],
    wikidata: [{ qid: "Q43229", relacion: "broadMatch", nombre: "organización" }],
  },
  {
    id: "Proveedor",
    etiqueta: "Proveedor del Estado",
    etiquetaEn: "State supplier",
    comentario:
      "Una inscripción en el Registro de Proveedores del Estado de la DGCP (RPE): puede ser una empresa o una persona física.",
    subClaseDe: ["foaf:Agent"],
  },
  {
    id: "Norma",
    etiqueta: "Norma",
    etiquetaEn: "Legal act",
    comentario: "Una ley, un decreto, un reglamento o una resolución del Estado dominicano.",
    subClaseDe: ["eli:LegalResource", "schema:Legislation"],
  },
  {
    id: "Decreto",
    etiqueta: "Decreto",
    etiquetaEn: "Decree",
    comentario:
      "Un decreto del Poder Ejecutivo, del registro completo que publica la Consultoría Jurídica desde 1844, con quien lo firma.",
    subClaseDe: ["soc:Norma"],
    wikidata: [{ qid: "Q2571972", relacion: "closeMatch", nombre: "decreto" }],
  },
  {
    id: "Ley",
    etiqueta: "Ley",
    etiquetaEn: "Statute",
    comentario: "Una ley del Congreso Nacional, promulgada por el Poder Ejecutivo.",
    subClaseDe: ["soc:Norma"],
    wikidata: [{ qid: "Q820655", relacion: "closeMatch", nombre: "ley" }],
  },
  {
    id: "Provincia",
    etiqueta: "Provincia",
    etiquetaEn: "Province",
    comentario:
      "Una de las 31 provincias de la República Dominicana o el Distrito Nacional, que la plataforma trata como una más.",
    subClaseDe: ["schema:AdministrativeArea"],
    wikidata: [{ qid: "Q913337", relacion: "closeMatch", nombre: "provincia de la República Dominicana" }],
  },
  {
    id: "DeclaracionJurada",
    etiqueta: "Declaración jurada de patrimonio",
    etiquetaEn: "Sworn asset declaration",
    comentario:
      "El PDF de una declaración jurada de patrimonio (Ley 311-14) que una institución publica en su portal. El grafo guarda su título, quién la publica y su dirección, nunca su contenido.",
    subClaseDe: ["foaf:Document", "schema:DigitalDocument"],
    wikidata: [{ qid: "Q454263", relacion: "broadMatch", nombre: "declaración jurada" }],
  },
  {
    id: "MedidaDGCP",
    etiqueta: "Medida de la DGCP sobre un proveedor",
    etiquetaEn: "Supplier measure by the procurement authority",
    comentario:
      "Una suspensión, cancelación, inhabilitación o prohibición que la Dirección General de Contrataciones Públicas registra sobre un proveedor. Su tipo se lee del texto del Estado.",
    subClaseDe: [],
  },
];

export const PROPIEDADES: Propiedad[] = [
  {
    id: "ocupa",
    tipo: "objeto",
    etiqueta: "ocupa u ocupó",
    etiquetaEn: "holds or held",
    comentario: "De una persona a cada cargo que las fuentes le registran.",
    dominio: ["soc:Persona"],
    rango: ["soc:Cargo"],
    subPropiedadDe: ["org:hasMembership"],
    inversa: "titular",
  },
  {
    id: "titular",
    tipo: "objeto",
    etiqueta: "titular",
    etiquetaEn: "holder",
    comentario: "La persona que ocupa u ocupó el cargo.",
    dominio: ["soc:Cargo"],
    rango: ["soc:Persona"],
    subPropiedadDe: ["org:member"],
    funcional: true,
  },
  {
    id: "enInstitucion",
    tipo: "objeto",
    etiqueta: "en la institución",
    etiquetaEn: "in institution",
    comentario: "La institución del cargo, cuando la fuente la nombra y el cruce la reconoce.",
    dominio: ["soc:Cargo"],
    rango: ["soc:Institucion"],
    subPropiedadDe: ["org:organization"],
  },
  {
    id: "segunDecreto",
    tipo: "objeto",
    etiqueta: "según el decreto",
    etiquetaEn: "according to decree",
    comentario: "El decreto que registra el movimiento del cargo: su designación, su cese, su confirmación.",
    dominio: ["soc:Cargo"],
    rango: ["soc:Decreto"],
  },
  {
    id: "enProvincia",
    tipo: "objeto",
    etiqueta: "en la provincia",
    etiquetaEn: "in province",
    comentario: "El ámbito territorial del cargo: una gobernación, una alcaldía, una regiduría.",
    dominio: ["soc:Cargo"],
    rango: ["soc:Provincia"],
  },
  {
    id: "movimiento",
    tipo: "objeto",
    etiqueta: "movimiento",
    etiquetaEn: "movement",
    comentario: "Qué registra la fuente del cargo: en el cargo, designación, cese, elección…",
    dominio: ["soc:Cargo"],
    rango: ["skos:Concept"],
  },
  {
    id: "firmadoPor",
    tipo: "objeto",
    etiqueta: "firmado por",
    etiquetaEn: "signed by",
    comentario:
      "Quien firma el decreto, según el registro de la Consultoría Jurídica. Una fila fechada fuera de los períodos de firma de su firmante no lo afirma.",
    dominio: ["soc:Decreto"],
    rango: ["soc:Persona"],
    subPropiedadDe: ["eli:passed_by", "schema:legislationPassedBy"],
    inversa: "firmo",
  },
  {
    id: "firmo",
    tipo: "objeto",
    etiqueta: "firmó",
    etiquetaEn: "signed",
    comentario: "Los decretos que el registro atribuye a una persona.",
    dominio: ["soc:Persona"],
    rango: ["soc:Decreto"],
  },
  {
    id: "designa",
    tipo: "objeto",
    etiqueta: "designa o cesa a",
    etiquetaEn: "appoints or removes",
    comentario: "Las personas que el decreto nombra, confirma o cesa, leídas de su título o de su texto.",
    dominio: ["soc:Decreto"],
    rango: ["soc:Persona"],
  },
  {
    id: "materia",
    tipo: "objeto",
    etiqueta: "materia",
    etiquetaEn: "subject",
    comentario: "De qué trata un decreto, leído de su título y de su etiqueta con reglas fijas.",
    dominio: ["soc:Decreto"],
    rango: ["skos:Concept"],
    subPropiedadDe: ["dct:subject"],
  },
  {
    id: "dirige",
    tipo: "objeto",
    etiqueta: "dirige",
    etiquetaEn: "heads",
    comentario:
      "Quien encabeza hoy la institución: el cargo más alto que el MAP le da hoy o, si no, el último decreto de jefatura del Presidente en funciones.",
    dominio: ["soc:Persona"],
    rango: ["soc:Institucion"],
    subPropiedadDe: ["org:headOf"],
  },
  {
    id: "sector",
    tipo: "objeto",
    etiqueta: "sector",
    etiquetaEn: "sector",
    comentario: "El sector del Estado al que pertenece la institución, según el Clasificador Institucional.",
    dominio: ["soc:Institucion"],
    rango: ["skos:Concept"],
    subPropiedadDe: ["org:classification"],
  },
  {
    id: "supervisadaPor",
    tipo: "objeto",
    etiqueta: "supervisada por",
    etiquetaEn: "supervised by",
    comentario: "La superintendencia o el instituto que la registra y la supervisa.",
    dominio: ["soc:EntidadFinanciera"],
    rango: ["soc:Institucion"],
  },
  {
    id: "declaracion",
    tipo: "objeto",
    etiqueta: "declaración publicada",
    etiquetaEn: "published declaration",
    comentario: "Una declaración jurada de patrimonio de la persona que publica una institución, atada sin dudas.",
    dominio: ["soc:Persona"],
    rango: ["soc:DeclaracionJurada"],
  },
  {
    id: "publicadaPor",
    tipo: "objeto",
    etiqueta: "publicada por",
    etiquetaEn: "published by",
    comentario: "La institución en cuyo portal está el documento.",
    dominio: ["soc:DeclaracionJurada"],
    rango: ["soc:Institucion"],
    subPropiedadDe: ["dct:publisher"],
  },
  {
    id: "tieneMedida",
    tipo: "objeto",
    etiqueta: "tiene la medida",
    etiquetaEn: "has measure",
    comentario: "Una medida que la DGCP registra sobre el proveedor.",
    dominio: ["soc:Proveedor"],
    rango: ["soc:MedidaDGCP"],
  },
  {
    id: "tipoDeMedida",
    tipo: "objeto",
    etiqueta: "tipo de medida",
    etiquetaEn: "measure type",
    comentario: "Qué es la medida, leído del texto de la DGCP con reglas fijas.",
    dominio: ["soc:MedidaDGCP"],
    rango: ["skos:Concept"],
  },
  {
    id: "inscritaComo",
    tipo: "objeto",
    etiqueta: "inscrita como proveedora",
    etiquetaEn: "registered as supplier",
    comentario: "La inscripción en el Registro de Proveedores del Estado con el mismo RNC.",
    dominio: ["soc:Empresa"],
    rango: ["soc:Proveedor"],
  },
  {
    id: "numero",
    tipo: "dato",
    etiqueta: "número",
    etiquetaEn: "number",
    comentario: "El número de la norma como lo escribe la Consultoría: «641-26».",
    dominio: ["soc:Norma"],
    rango: ["xsd:string"],
    subPropiedadDe: ["eli:id_local", "schema:legislationIdentifier"],
  },
  {
    id: "fecha",
    tipo: "dato",
    etiqueta: "fecha",
    etiquetaEn: "date",
    comentario:
      "La fecha que registra la fuente: la de una norma según la Consultoría Jurídica, la del movimiento de un cargo (su designación, su cese), la de una medida de la DGCP.",
    dominio: ["soc:Norma", "soc:Cargo", "soc:MedidaDGCP"],
    rango: ["xsd:date"],
  },
  {
    id: "numeralLey311",
    tipo: "dato",
    etiqueta: "numeral de la Ley 311-14",
    etiquetaEn: "Law 311-14 numeral",
    comentario: "El numeral del artículo 2 de la Ley 311-14 que obliga al cargo a declarar patrimonio.",
    dominio: ["soc:Cargo"],
    rango: ["xsd:integer"],
  },
  {
    id: "pepVigente",
    tipo: "dato",
    etiqueta: "PEP hoy",
    etiquetaEn: "PEP today",
    comentario: "Si hoy es persona expuesta políticamente: un cargo obligado de hoy o de los últimos tres años.",
    dominio: ["soc:Persona"],
    rango: ["xsd:boolean"],
    funcional: true,
  },
  {
    id: "decretosFirmados",
    tipo: "dato",
    etiqueta: "decretos con su firma",
    etiquetaEn: "decrees signed",
    comentario: "Cuántas filas del registro de la Consultoría llevan su firma.",
    dominio: ["soc:Persona"],
    rango: ["xsd:integer"],
    funcional: true,
  },
  {
    id: "rnc",
    tipo: "dato",
    etiqueta: "RNC",
    etiquetaEn: "tax ID (RNC)",
    comentario: "El Registro Nacional de Contribuyentes de nueve cifras de una persona jurídica.",
    dominio: ["soc:Empresa", "soc:EntidadFinanciera"],
    rango: ["xsd:string"],
    subPropiedadDe: ["schema:taxID"],
  },
  {
    id: "inicioOperaciones",
    tipo: "dato",
    etiqueta: "inicio de operaciones declarado",
    etiquetaEn: "declared start of operations",
    comentario:
      "La fecha en que la persona jurídica declaró a la DGII que empezó a operar. No es su fecha de constitución, que el padrón no trae.",
    dominio: ["soc:Empresa"],
    rango: ["xsd:date"],
  },
  {
    id: "rpe",
    tipo: "dato",
    etiqueta: "RPE",
    etiquetaEn: "supplier registry number",
    comentario: "El número del Registro de Proveedores del Estado.",
    dominio: ["soc:Proveedor"],
    rango: ["xsd:string"],
    funcional: true,
  },
  {
    id: "estado",
    tipo: "dato",
    etiqueta: "estado según su fuente",
    etiquetaEn: "status per source",
    comentario:
      "El estado que publica la fuente, tal cual: el de la DGII para una empresa («ACTIVO», «DADO DE BAJA»), el de su supervisor para una entidad financiera («Operando», «Cancelado»).",
    dominio: ["soc:Empresa", "soc:EntidadFinanciera"],
    rango: ["xsd:string"],
  },
  {
    id: "etiquetaConsultoria",
    tipo: "dato",
    etiqueta: "etiqueta de institución",
    etiquetaEn: "Consultoría label",
    comentario: "La etiqueta de institución que la Consultoría Jurídica pone al decreto, tal cual.",
    dominio: ["soc:Decreto"],
    rango: ["xsd:string"],
  },
  {
    id: "aviso",
    tipo: "dato",
    etiqueta: "aviso sobre la fecha",
    etiquetaEn: "date warning",
    comentario:
      "«fuera» si la fecha cae fuera de los períodos de firma de su firmante; «fecha» si no casa con el año del número. Errores de captura probables del origen: se marcan, no se corrigen.",
    dominio: ["soc:Decreto"],
    rango: ["xsd:string"],
  },
];

/** Los esquemas de conceptos, de las mismas tablas que usa la interfaz. */
export function esquemas(): Esquema[] {
  return [
    {
      id: "materias",
      etiqueta: "Materias de un decreto",
      comentario: "De qué trata un decreto, leído de su título y de su etiqueta de institución con reglas fijas.",
      conceptos: MATERIAS.map((m) => ({ id: `materia-${m.slug}`, etiqueta: m.nombre })),
    },
    {
      id: "movimientos",
      etiqueta: "Movimientos de un cargo",
      comentario: "Qué registra la fuente de un cargo.",
      conceptos: Object.entries(ETIQUETA_MOVIMIENTO).map(([k, v]) => ({ id: `movimiento-${k}`, etiqueta: v })),
    },
    {
      id: "sectores",
      etiqueta: "Sectores del Estado",
      comentario: "Los sectores del Clasificador Institucional de DIGEPRES que usa la plataforma.",
      conceptos: SECTORES.map((s) => ({ id: `sector-${s.clave}`, etiqueta: s.nombre, definicion: s.que })),
    },
    {
      id: "familiasPep",
      etiqueta: "Familias de cargos obligados a declarar",
      comentario: "Los numerales del artículo 2 de la Ley 311-14, agrupados como los filtra la plataforma.",
      conceptos: FAMILIAS_PEP.map((f) => ({
        id: `familia-${f.clave}`,
        etiqueta: f.etiqueta,
        definicion: `Numerales ${f.numerales.join(", ")} del art. 2 de la Ley 311-14.`,
      })),
    },
    {
      id: "tiposDeMedida",
      etiqueta: "Tipos de medida de la DGCP",
      comentario: "Lo que la plataforma lee del texto de cada medida, en una lista cerrada.",
      conceptos: Object.entries(TIPOS_MEDIDA).map(([k, v]) => ({ id: `medida-${k}`, etiqueta: v.etiqueta, definicion: v.llano })),
    },
  ];
}

/** El IRI de un concepto de un esquema. */
export const concepto = (id: string) => `soc:${id}`;

/** Todos los triples de la ontología: cabecera, clases, propiedades y esquemas. */
export function triplesOntologia(): Triple[] {
  const o = ONTOLOGIA;
  const x: Triple[] = [
    t(o, "rdf:type", iri("owl:Ontology")),
    t(o, "dct:title", lit("Ontología de Socrático.do", "es")),
    t(o, "dct:title", lit("Socrático.do ontology", "en")),
    t(
      o,
      "dct:description",
      lit(
        "Las clases y relaciones del grafo de Socrático.do, una herramienta independiente y no oficial sobre datos del Estado dominicano: personas con cargo público, instituciones, decretos, entidades financieras, empresas, provincias, declaraciones juradas y medidas sobre proveedores.",
        "es",
      ),
    ),
    t(o, "owl:versionInfo", lit(VERSION)),
    t(o, "dct:modified", { tipo: "literal", valor: PUBLICADA, datatype: PREFIJOS.xsd + "date" }),
    t(o, "vann:preferredNamespacePrefix", lit("soc")),
    t(o, "vann:preferredNamespaceUri", lit(PREFIJOS.soc)),
    t(o, "rdfs:seeAlso", iri(`${o}.ttl`)),
  ];
  for (const c of CLASES) {
    const s = `soc:${c.id}`;
    x.push(
      t(s, "rdf:type", iri("owl:Class")),
      t(s, "rdfs:label", lit(c.etiqueta, "es")),
      t(s, "rdfs:label", lit(c.etiquetaEn, "en")),
      t(s, "rdfs:comment", lit(c.comentario, "es")),
      t(s, "rdfs:isDefinedBy", iri(o)),
    );
    for (const sup of c.subClaseDe) x.push(t(s, "rdfs:subClassOf", iri(sup)));
    for (const w of c.wikidata ?? []) x.push(t(s, `skos:${w.relacion}`, iri(`wd:${w.qid}`)));
  }
  for (const p of PROPIEDADES) {
    const s = `soc:${p.id}`;
    x.push(
      t(s, "rdf:type", iri(p.tipo === "objeto" ? "owl:ObjectProperty" : "owl:DatatypeProperty")),
      t(s, "rdfs:label", lit(p.etiqueta, "es")),
      t(s, "rdfs:label", lit(p.etiquetaEn, "en")),
      t(s, "rdfs:comment", lit(p.comentario, "es")),
      t(s, "rdfs:isDefinedBy", iri(o)),
    );
    if (p.funcional) x.push(t(s, "rdf:type", iri("owl:FunctionalProperty")));
    // Con varios dominios o rangos, RDFS los intersecta: se declara la unión en OWL.
    for (const [pred, lista] of [
      ["rdfs:domain", p.dominio],
      ["rdfs:range", p.rango],
    ] as const) {
      if (lista.length === 1) x.push(t(s, pred, iri(lista[0])));
      else if (lista.length > 1) x.push(...union(s, pred, lista));
    }
    for (const sup of p.subPropiedadDe ?? []) x.push(t(s, "rdfs:subPropertyOf", iri(sup)));
    if (p.inversa) x.push(t(s, "owl:inverseOf", iri(`soc:${p.inversa}`)));
  }
  for (const e of esquemas()) {
    const s = `soc:${e.id}`;
    x.push(
      t(s, "rdf:type", iri("skos:ConceptScheme")),
      t(s, "skos:prefLabel", lit(e.etiqueta, "es")),
      t(s, "rdfs:comment", lit(e.comentario, "es")),
      t(s, "rdfs:isDefinedBy", iri(o)),
    );
    for (const c of e.conceptos) {
      const cs = concepto(c.id);
      x.push(
        t(cs, "rdf:type", iri("skos:Concept")),
        t(cs, "skos:prefLabel", lit(c.etiqueta, "es")),
        t(cs, "skos:inScheme", iri(s)),
        t(cs, "skos:topConceptOf", iri(s)),
      );
      if (c.definicion) x.push(t(cs, "skos:definition", lit(c.definicion, "es")));
    }
  }
  return x;
}

/** `rdfs:domain [ owl:unionOf (A B) ]`, con nodos en blanco con nombre estable por propiedad. */
function union(s: string, pred: string, lista: string[]): Triple[] {
  const base = `${expandir(s).split("#").pop()}-${pred.split(":").pop()}`;
  const nodo = { tipo: "blanco" as const, valor: `u-${base}` };
  const x: Triple[] = [t(s, pred, nodo), { s: nodo, p: expandir("rdf:type"), o: iri("owl:Class") }];
  // La lista RDF: rdf:first / rdf:rest hasta rdf:nil.
  let anterior: typeof nodo | null = null;
  lista.forEach((clase, i) => {
    const celda = { tipo: "blanco" as const, valor: `u-${base}-${i}` };
    if (anterior) x.push({ s: anterior, p: expandir("rdf:rest"), o: celda });
    else x.push({ s: nodo, p: expandir("owl:unionOf"), o: celda });
    x.push({ s: celda, p: expandir("rdf:first"), o: iri(clase) });
    anterior = celda;
  });
  if (anterior) x.push({ s: anterior, p: expandir("rdf:rest"), o: iri("rdf:nil") });
  return x;
}

/** Cuántas clases, propiedades y conceptos tiene: para la página y VoID. */
export function resumenOntologia() {
  const e = esquemas();
  return {
    clases: CLASES.length,
    propiedades: PROPIEDADES.length,
    esquemas: e.length,
    conceptos: e.reduce((n, x) => n + x.conceptos.length, 0),
  };
}

/** `entero` re-exportado para las rutas que escriben VoID. */
export { entero };
