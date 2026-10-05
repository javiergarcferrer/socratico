import { MATERIAS } from "@/lib/materias-decreto";
import { ETIQUETA_MOVIMIENTO, FAMILIAS_PEP } from "@/lib/cargos";
import { SECTORES } from "@/lib/instituciones";
import { TIPOS_MEDIDA } from "@/lib/medidas";
import { ETAPAS, ETAPA_DE_LA_DGCP, MODALIDADES, MODALIDAD_DE_LA_DGCP, OBJETOS, SECTORES_INVERSION } from "@/lib/vocabulario-compras";
import {
  ESPACIO_V1,
  ONTOLOGIA,
  ONTOLOGIA_DO,
  PAGINA_ONTOLOGIA,
  PREFIJOS,
  W3ID,
  entero,
  expandir,
  iri,
  lit,
  t,
  type Termino,
  type Triple,
} from "@/lib/rdf";

/**
 * La ontología de Socrático.do: qué clases de cosas hay en el grafo, cómo se
 * relacionan y qué forma tiene cada una, en **una sola definición** de la que
 * salen todas sus formas (docs/INFRAESTRUCTURA.md §7):
 *
 *  · OWL 2 y RDFS (`/ontologia.ttl`, `.jsonld`, `.nt`), con su equivalencia en
 *    los vocabularios que el mundo ya lee —schema.org, W3C ORG, ELI, FOAF,
 *    ROV, PROV-O, Web Annotation, ADMS, la ontología de contratación pública
 *    de la UE (ePO)— y su correspondencia con Wikidata (SKOS);
 *  · las formas SHACL (`/ontologia.shacl.ttl`), que validan cada instancia
 *    del grafo (`scripts/validar-grafo.mjs`);
 *  · el perfil para Microsoft Fabric IQ (`/ontologia.fabric.ttl`), que solo
 *    lleva lo que su importador representa;
 *  · la página `/ontologia` y la herramienta `ontology` del servidor MCP.
 *
 * Dos módulos. El **núcleo** (`soc:`, `https://w3id.org/socratico/def/core#`)
 * es neutral de país: persona, organización, puesto, ocupación, evento,
 * norma, contratación, mención, identificador. El **módulo dominicano**
 * (`do:`, `…/def/do#`) lleva lo que solo existe aquí: los identificadores del
 * Estado (RNC, RPE), las clasificaciones (DIGEPRES, movimientos del MAP,
 * materias de la Consultoría, medidas de la DGCP) y la regla PEP de la Ley
 * 311-14. Otro país es otro módulo sobre el mismo núcleo.
 *
 * Cada término dice su **estado**: «en uso» si el grafo ya tiene instancias,
 * «definido» si es el modelo al que van las fases siguientes y todavía no
 * tiene datos (`vs:term_status` «stable» o «testing»).
 *
 * Reglas de alineación, para no afirmar de más: `rdfs:subClassOf` hacia fuera
 * (una Persona de aquí es una `schema:Person`, no al revés);
 * `rdfs:subPropertyOf` igual; `skos:closeMatch` o `skos:broadMatch` hacia
 * Wikidata, cuyos elementos no son clases OWL. Cada QID se verificó contra
 * Wikidata el 30-09-2026 (docs/INFRAESTRUCTURA.md §5.7); los términos nuevos no
 * llevan QID hasta verificarlo. Los nombres de FollowTheMoney se comprobaron
 * en followthemoney.tech el 01-10-2026; los de ePO, en su documentación.
 */

export const VERSION = "2.1.0";
export const PUBLICADA = "2026-10-05";
/** La versión anterior de los dos módulos (`owl:priorVersion`). */
export const ANTERIOR = "2.0.0";

/** El núcleo, neutral de país, o el módulo de la República Dominicana. */
export type Modulo = "soc" | "do";
/** «en-uso»: el grafo tiene instancias. «definido»: es el modelo de una fase que viene. */
export type Estado = "en-uso" | "definido";

export interface Clase {
  /** La parte local: `Persona`. */
  id: string;
  /** Por omisión, el núcleo. */
  modulo?: Modulo;
  etiqueta: string;
  etiquetaEn: string;
  /** Otros nombres con que se busca (en Fabric IQ, sinónimos). */
  sinonimos?: string[];
  comentario: string;
  /** La clase de aquí de la que es un caso: una sola, la herencia que Fabric IQ conserva. */
  padre?: string;
  /** Las clases de fuera de las que es un caso (`rdfs:subClassOf`). */
  subClaseDe: string[];
  /** Correspondencias con Wikidata (y su fuerza). */
  wikidata?: { qid: string; relacion: "closeMatch" | "broadMatch"; nombre: string }[];
  /** El esquema de FollowTheMoney (OpenSanctions, Aleph) al que corresponde. */
  ftm?: string;
  /**
   * Las propiedades que identifican a una instancia sin dudas (`owl:hasKey`).
   * Las de hoy son del módulo dominicano (RNC, RPE): ese axioma es de `do:`
   * aunque hable de una clase del núcleo, y va a su documento cuando los
   * módulos se sirvan por separado (F8).
   */
  clave?: string[];
  /** Un nombre corto para el perfil de Fabric IQ, si el `id` no cabe en sus 26 caracteres o en un nombre compuesto. */
  corto?: string;
  estado: Estado;
  /**
   * ¿Existía en la versión 1? Su IRI de entonces se declara caso del de ahora
   * (`rdfs:subClassOf`, `rdfs:subPropertyOf`) y obsoleto: lo dicho con la v1
   * se lee con la v2, sin que los dominios más estrechos de la v1 pasen a la
   * v2, como pasaría con una equivalencia.
   */
  v1?: boolean;
}

export interface Propiedad {
  id: string;
  modulo?: Modulo;
  tipo: "objeto" | "dato";
  etiqueta: string;
  etiquetaEn: string;
  comentario: string;
  dominio: string[];
  rango: string[];
  subPropiedadDe?: string[];
  inversa?: string;
  /** Un valor como mucho por instancia. */
  funcional?: boolean;
  /** Las clases cuyas instancias tienen que llevarla (SHACL `sh:minCount 1`). */
  obligatoriaEn?: string[];
  estado: Estado;
  v1?: boolean;
}

export interface Esquema {
  id: string;
  modulo?: Modulo;
  etiqueta: string;
  comentario: string;
  conceptos: { id: string; etiqueta: string; definicion?: string }[];
  v1?: boolean;
}

/** El nombre corto de un término: `soc:Persona`, `do:rnc`. */
export const curie = (x: { id: string; modulo?: Modulo }) => `${x.modulo ?? "soc"}:${x.id}`;

export const CLASES: Clase[] = [
  /* ------------------------------------------------- personas y organizaciones */
  {
    id: "Persona",
    etiqueta: "Persona con cargo público",
    etiquetaEn: "Person holding public office",
    comentario:
      "Una persona que las fuentes del Estado nombran en un cargo público o como firmante de decretos. Se identifica por su nombre normalizado, nunca por su cédula; dos grafías distintas son dos personas del grafo.",
    subClaseDe: ["foaf:Person", "schema:Person"],
    wikidata: [{ qid: "Q5", relacion: "broadMatch", nombre: "ser humano" }],
    ftm: "Person",
    estado: "en-uso",
    v1: true,
  },
  {
    id: "PersonaExpuestaPoliticamente",
    etiqueta: "Persona expuesta políticamente",
    etiquetaEn: "Politically exposed person",
    sinonimos: ["PEP"],
    comentario:
      "Quien ocupa, o ocupó en los últimos tres años, un puesto obligado a declarar patrimonio. Qué puestos lo son lo dice la ley de cada país (en la República Dominicana, la Ley 155-17, art. 2, num. 19, que remite al art. 2 de la Ley 311-14: `do:numeralLey311`). Es una categoría legal, no una acusación.",
    padre: "soc:Persona",
    subClaseDe: [],
    corto: "PEP",
    wikidata: [{ qid: "Q106155", relacion: "closeMatch", nombre: "persona expuesta políticamente" }],
    ftm: "Person",
    estado: "en-uso",
    v1: true,
  },
  {
    id: "Organizacion",
    etiqueta: "Organización",
    etiquetaEn: "Organization",
    comentario:
      "Cualquier organización del grafo: una institución del Estado, una entidad financiera, una persona jurídica, un partido. Una organización puede contener a otras (`soc:subOrganizacionDe`): un ministerio y sus viceministerios son un subgrafo.",
    subClaseDe: ["org:Organization", "schema:Organization"],
    corto: "Org",
    ftm: "Organization",
    estado: "en-uso",
  },
  {
    id: "Institucion",
    etiqueta: "Institución del Estado",
    etiquetaEn: "State institution",
    comentario:
      "Una de las entidades del sector público dominicano: el Clasificador Institucional de DIGEPRES cruzado con las unidades de compra de la DGCP, la ejecución del SIGEF, la nómina y la Consultoría Jurídica.",
    padre: "soc:Organizacion",
    subClaseDe: ["org:FormalOrganization", "schema:GovernmentOrganization"],
    wikidata: [{ qid: "Q327333", relacion: "closeMatch", nombre: "organismo público" }],
    ftm: "PublicBody",
    estado: "en-uso",
    v1: true,
  },
  {
    id: "EntidadFinanciera",
    etiqueta: "Entidad financiera supervisada",
    etiquetaEn: "Supervised financial entity",
    comentario:
      "Un banco, asociación, corporación de crédito, cooperativa, AFP, aseguradora o agente de cambio que registra su supervisor: la Superintendencia de Bancos, SIPEN, la Superintendencia de Seguros o IDECOOP.",
    padre: "soc:Organizacion",
    subClaseDe: ["org:FormalOrganization", "schema:FinancialService"],
    wikidata: [{ qid: "Q650241", relacion: "closeMatch", nombre: "institución financiera" }],
    ftm: "Organization",
    estado: "en-uso",
    v1: true,
  },
  {
    id: "Empresa",
    etiqueta: "Persona jurídica",
    etiquetaEn: "Legal entity",
    sinonimos: ["empresa"],
    comentario:
      "Una persona jurídica del padrón de contribuyentes de la DGII, por su RNC de nueve cifras: empresas, asociaciones y fundaciones. Las personas físicas del padrón no están en el grafo.",
    padre: "soc:Organizacion",
    subClaseDe: ["rov:RegisteredOrganization", "schema:Organization"],
    wikidata: [{ qid: "Q43229", relacion: "broadMatch", nombre: "organización" }],
    ftm: "Organization",
    clave: ["do:rnc"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "Partido",
    etiqueta: "Partido político",
    etiquetaEn: "Political party",
    comentario: "Un partido, agrupación o movimiento político reconocido por la autoridad electoral.",
    padre: "soc:Organizacion",
    subClaseDe: [],
    ftm: "Organization",
    estado: "definido",
  },
  {
    id: "Proveedor",
    etiqueta: "Proveedor del Estado",
    etiquetaEn: "State supplier",
    comentario:
      "Una inscripción en el registro de proveedores del Estado (en la República Dominicana, el RPE de la DGCP): puede ser una empresa o una persona física.",
    subClaseDe: ["foaf:Agent"],
    ftm: "LegalEntity",
    clave: ["do:rpe"],
    estado: "en-uso",
    v1: true,
  },

  /* ------------------------------------------------ puestos, cargos y tiempo */
  {
    id: "Puesto",
    etiqueta: "Puesto",
    etiquetaEn: "Post",
    comentario:
      "Un puesto de una organización, exista o no quien lo ocupe: «Ministro de Educación», «Senador por Santiago». Es lo que una ley obliga a declarar patrimonio, no la persona.",
    subClaseDe: ["org:Post"],
    ftm: "Position",
    estado: "definido",
  },
  {
    id: "Ocupacion",
    etiqueta: "Ocupación de un puesto",
    etiquetaEn: "Occupancy",
    comentario:
      "Una persona en un puesto durante un intervalo: desde el evento que la abre (un nombramiento, una elección) hasta el que la cierra (un cese, una renuncia, la muerte, otro nombramiento en el mismo puesto). Un intervalo sin cierre conocido queda abierto y lo dice: no es lo mismo que vigente. Es la arista con tiempo del grafo.",
    subClaseDe: ["org:Membership"],
    ftm: "Occupancy",
    estado: "definido",
  },
  {
    id: "Cargo",
    etiqueta: "Cargo (registro de un movimiento)",
    etiquetaEn: "Post record",
    comentario:
      "Lo que una fuente registra de una persona en un cargo: el Directorio de Funcionarios del MAP, un decreto, una alta corte, la JCE o el SIL. Lleva su movimiento (designación, cese, elección…), su fecha y, si lo hay, el decreto. De estos registros se derivan las ocupaciones con intervalo (`soc:Ocupacion`).",
    subClaseDe: ["org:Membership", "schema:OrganizationRole"],
    wikidata: [{ qid: "Q294414", relacion: "closeMatch", nombre: "cargo público" }],
    ftm: "Occupancy",
    estado: "en-uso",
    v1: true,
  },
  {
    id: "Membresia",
    etiqueta: "Membresía",
    etiquetaEn: "Membership",
    comentario: "La pertenencia de una persona a una organización durante un intervalo: un partido, un bloque, una junta.",
    subClaseDe: ["org:Membership"],
    ftm: "Membership",
    estado: "definido",
  },
  {
    id: "Evento",
    etiqueta: "Evento",
    etiquetaEn: "Event",
    comentario:
      "Lo que cambia el estado del grafo, con su fecha y su prueba: un nombramiento, un cese, una renuncia, una elección, una muerte, un cambio de partido, una adjudicación, una promulgación, una derogación. Abre o cierra ocupaciones, membresías y vigencias.",
    subClaseDe: ["prov:Activity", "schema:Event"],
    ftm: "Event",
    estado: "definido",
  },

  /* ------------------------------------------------- normas, Congreso, documentos */
  {
    id: "Norma",
    etiqueta: "Norma",
    etiquetaEn: "Legal act",
    comentario: "Una ley, un decreto, un reglamento o una resolución del Estado.",
    subClaseDe: ["eli:LegalResource", "schema:Legislation"],
    ftm: "Document",
    estado: "en-uso",
    v1: true,
  },
  {
    id: "Decreto",
    etiqueta: "Decreto",
    etiquetaEn: "Decree",
    comentario:
      "Un decreto del Poder Ejecutivo, del registro completo que publica la Consultoría Jurídica desde 1844, con quien lo firma.",
    padre: "soc:Norma",
    subClaseDe: [],
    wikidata: [{ qid: "Q2571972", relacion: "closeMatch", nombre: "decreto" }],
    ftm: "Document",
    estado: "en-uso",
    v1: true,
  },
  {
    id: "Ley",
    etiqueta: "Ley",
    etiquetaEn: "Statute",
    comentario: "Una ley del Congreso Nacional, promulgada por el Poder Ejecutivo.",
    padre: "soc:Norma",
    subClaseDe: [],
    wikidata: [{ qid: "Q820655", relacion: "closeMatch", nombre: "ley" }],
    ftm: "Document",
    estado: "definido",
    v1: true,
  },
  {
    id: "Iniciativa",
    etiqueta: "Iniciativa legislativa",
    etiquetaEn: "Bill",
    sinonimos: ["proyecto de ley"],
    comentario: "Un proyecto de ley, de resolución o de otra norma depositado en una cámara del Congreso, con su trámite.",
    subClaseDe: [],
    ftm: "Document",
    estado: "definido",
  },
  {
    id: "Votacion",
    etiqueta: "Votación",
    etiquetaEn: "Vote event",
    comentario: "Una votación de una cámara sobre una iniciativa: un evento, con su resultado.",
    padre: "soc:Evento",
    subClaseDe: [],
    ftm: "Event",
    estado: "definido",
  },
  {
    id: "Documento",
    etiqueta: "Documento",
    etiquetaEn: "Document",
    comentario: "Un documento que publica el Estado: un informe, una sentencia, una declaración jurada, un acta. El texto del que salen las menciones.",
    subClaseDe: ["foaf:Document", "schema:DigitalDocument"],
    ftm: "Document",
    estado: "en-uso",
  },
  {
    id: "DeclaracionJurada",
    etiqueta: "Declaración jurada de patrimonio",
    etiquetaEn: "Sworn asset declaration",
    comentario:
      "El PDF de una declaración jurada de patrimonio (Ley 311-14) que una institución publica en su portal. El grafo guarda su título, quién la publica y su dirección, nunca su contenido.",
    padre: "soc:Documento",
    subClaseDe: ["foaf:Document", "schema:DigitalDocument"],
    wikidata: [{ qid: "Q454263", relacion: "broadMatch", nombre: "declaración jurada" }],
    ftm: "Document",
    estado: "en-uso",
    v1: true,
  },
  {
    id: "Sentencia",
    etiqueta: "Sentencia",
    etiquetaEn: "Court ruling",
    comentario: "Una sentencia de una alta corte (el Tribunal Constitucional, el Tribunal Superior Electoral).",
    padre: "soc:Documento",
    subClaseDe: [],
    ftm: "Document",
    estado: "definido",
  },
  {
    id: "Mencion",
    etiqueta: "Mención",
    etiquetaEn: "Mention",
    comentario:
      "Un nombre escrito en un documento: dónde, cómo se escribió y a quién se refiere. Se ata a una persona u organización solo si queda un candidato y el contexto lo corrobora (`soc:refiereA`); si no, queda con sus candidatos (`soc:posibleReferencia`). Nunca une homónimos.",
    subClaseDe: ["oa:Annotation"],
    ftm: "Mention",
    estado: "definido",
  },

  /* ---------------------------------------------------------- dinero */
  {
    id: "ProcesoDeContratacion",
    etiqueta: "Proceso de contratación",
    etiquetaEn: "Procurement procedure",
    sinonimos: ["licitación", "proceso de compra"],
    comentario:
      "Un proceso de compra de una institución, desde su convocatoria: su código, su objeto, su modalidad, su valor estimado y la etapa en que estaba el día del corte. Uno que el grafo conoce solo por un proyecto de inversión, fuera de la tabla de procesos de su fuente, puede no traer comprador.",
    subClaseDe: ["epo:Procedure"],
    corto: "Proceso",
    ftm: "Contract",
    estado: "en-uso",
  },
  {
    id: "Adjudicacion",
    etiqueta: "Adjudicación",
    etiquetaEn: "Award decision",
    comentario: "La decisión de la institución sobre a quién se le adjudica un proceso, y por cuánto.",
    subClaseDe: ["epo:AwardDecision"],
    ftm: "ContractAward",
    estado: "definido",
  },
  {
    id: "Contrato",
    etiqueta: "Contrato",
    etiquetaEn: "Contract",
    comentario:
      "El contrato que resulta de una adjudicación: su código, su contratista, su monto y su estado; el proceso del que sale y los proyectos de inversión para los que se firmó, si la fuente los dice.",
    subClaseDe: ["epo:Contract"],
    ftm: "Contract",
    estado: "en-uso",
  },
  {
    id: "Contratacion",
    etiqueta: "Contratación",
    etiquetaEn: "Contracting",
    comentario:
      "Lo que una institución le ha contratado a un proveedor por el sistema de compras desde 2015, agregado: cuántos contratos y por cuánto (valor contratado en pesos, no pagado; sin cancelados, en otras monedas ni atípicos de RD$10 mil millones o más). Solo los pares de las listas de mayores: los doce proveedores de cada institución y los ocho clientes de cada proveedor con RNC de persona jurídica.",
    subClaseDe: [],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "Sancion",
    etiqueta: "Sanción o medida",
    etiquetaEn: "Sanction",
    comentario: "Una medida que una autoridad registra sobre una persona o una organización: una inhabilitación, una suspensión, una designación en una lista.",
    subClaseDe: [],
    ftm: "Sanction",
    estado: "en-uso",
  },
  {
    id: "MedidaDGCP",
    modulo: "do",
    etiqueta: "Medida de la DGCP sobre un proveedor",
    etiquetaEn: "Supplier measure by the procurement authority",
    comentario:
      "Una suspensión, cancelación, inhabilitación o prohibición que la Dirección General de Contrataciones Públicas registra sobre un proveedor. Su tipo se lee del texto del Estado.",
    padre: "soc:Sancion",
    subClaseDe: [],
    ftm: "Sanction",
    estado: "en-uso",
    v1: true,
  },
  {
    id: "ProyectoDeInversion",
    etiqueta: "Proyecto de inversión pública",
    etiquetaEn: "Public investment project",
    sinonimos: ["obra pública"],
    corto: "Proyecto",
    comentario:
      "Una obra o proyecto de inversión pública con su código (en la República Dominicana, el SNIP), quien lo ejecuta, dónde, su sector, su valor, su avance, sus fechas, sus procesos de compra y sus contratos.",
    subClaseDe: [],
    ftm: "Project",
    estado: "en-uso",
  },
  {
    id: "PartidaPresupuestaria",
    etiqueta: "Partida presupuestaria",
    etiquetaEn: "Budget line",
    comentario: "Una partida del presupuesto de una institución (capítulo, programa), con lo aprobado y lo ejecutado.",
    subClaseDe: [],
    estado: "definido",
  },

  /* ------------------------------------------------------ lugares e identidad */
  {
    id: "Lugar",
    etiqueta: "Lugar",
    etiquetaEn: "Place",
    comentario: "Un ámbito territorial: una provincia, un municipio.",
    subClaseDe: ["schema:Place"],
    estado: "en-uso",
  },
  {
    id: "Provincia",
    etiqueta: "Provincia",
    etiquetaEn: "Province",
    comentario:
      "Una de las 31 provincias de la República Dominicana o el Distrito Nacional, que la plataforma trata como una más.",
    padre: "soc:Lugar",
    subClaseDe: ["schema:AdministrativeArea"],
    wikidata: [{ qid: "Q913337", relacion: "closeMatch", nombre: "provincia de la República Dominicana" }],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "Municipio",
    etiqueta: "Municipio",
    etiquetaEn: "Municipality",
    comentario: "Un municipio o distrito municipal, dentro de su provincia.",
    padre: "soc:Lugar",
    subClaseDe: ["schema:AdministrativeArea"],
    estado: "definido",
  },
  {
    id: "Identificador",
    etiqueta: "Identificador",
    etiquetaEn: "Identifier",
    comentario:
      "Un número que un registro del Estado le da a algo, con el esquema que lo emite (`soc:esquemaDeIdentificador`): un RNC, un RPE, un número de decreto, un SNIP. Nunca una cédula.",
    subClaseDe: ["adms:Identifier"],
    estado: "definido",
  },
  {
    id: "Instantanea",
    etiqueta: "Instantánea de una fuente",
    etiquetaEn: "Source snapshot",
    comentario:
      "Una lectura de una fuente del Estado con su corte: de dónde, cuándo y con qué script. Cada afirmación del grafo sale de una, y el grafo de una instantánea es un subgrafo con nombre.",
    subClaseDe: ["prov:Entity"],
    estado: "definido",
  },
];

export const PROPIEDADES: Propiedad[] = [
  /* ---------------------------------------------------------- personas y cargos */
  {
    id: "ocupa",
    tipo: "objeto",
    etiqueta: "ocupa u ocupó",
    etiquetaEn: "holds or held",
    comentario:
      "De una persona a cada cargo que las fuentes le registran, a cada ocupación de un puesto y a cada membresía. Inversa de `soc:titular`, así que su rango es el dominio de aquella: si no, una ocupación con titular se inferiría `soc:Cargo`.",
    dominio: ["soc:Persona"],
    rango: ["soc:Cargo", "soc:Ocupacion", "soc:Membresia"],
    subPropiedadDe: ["org:hasMembership"],
    inversa: "titular",
    estado: "en-uso",
    v1: true,
  },
  {
    id: "titular",
    tipo: "objeto",
    etiqueta: "titular",
    etiquetaEn: "holder",
    comentario: "La persona del cargo, de la ocupación o de la membresía.",
    dominio: ["soc:Cargo", "soc:Ocupacion", "soc:Membresia"],
    rango: ["soc:Persona"],
    subPropiedadDe: ["org:member"],
    funcional: true,
    obligatoriaEn: ["soc:Cargo", "soc:Ocupacion", "soc:Membresia"],
    estado: "en-uso",
    v1: true,
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
    estado: "en-uso",
    v1: true,
  },
  {
    id: "segunDecreto",
    tipo: "objeto",
    etiqueta: "según el decreto",
    etiquetaEn: "according to decree",
    comentario: "El decreto que registra el movimiento del cargo: su designación, su cese, su confirmación.",
    dominio: ["soc:Cargo"],
    rango: ["soc:Decreto"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "enProvincia",
    tipo: "objeto",
    etiqueta: "en la provincia",
    etiquetaEn: "in province",
    comentario: "El ámbito territorial del cargo (una gobernación, una alcaldía, una regiduría) o la provincia donde está un proyecto de inversión.",
    dominio: ["soc:Cargo", "soc:ProyectoDeInversion"],
    rango: ["soc:Provincia"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "movimiento",
    tipo: "objeto",
    etiqueta: "movimiento",
    etiquetaEn: "movement",
    comentario: "Qué registra la fuente del cargo: en el cargo, designación, cese, elección… (`do:movimientos`).",
    dominio: ["soc:Cargo"],
    rango: ["skos:Concept"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "puestoEn",
    tipo: "objeto",
    etiqueta: "puesto en",
    etiquetaEn: "post in",
    comentario: "La organización del puesto.",
    dominio: ["soc:Puesto"],
    rango: ["soc:Organizacion"],
    subPropiedadDe: ["org:postIn"],
    funcional: true,
    obligatoriaEn: ["soc:Puesto"],
    estado: "definido",
  },
  {
    id: "puesto",
    tipo: "objeto",
    etiqueta: "puesto",
    etiquetaEn: "post",
    comentario: "El puesto que la ocupación ocupa.",
    dominio: ["soc:Ocupacion"],
    rango: ["soc:Puesto"],
    funcional: true,
    obligatoriaEn: ["soc:Ocupacion"],
    estado: "definido",
  },
  {
    id: "enOrganizacion",
    tipo: "objeto",
    etiqueta: "en la organización",
    etiquetaEn: "in organization",
    comentario: "La organización de la membresía: el partido, el bloque, la junta.",
    dominio: ["soc:Membresia"],
    rango: ["soc:Organizacion"],
    subPropiedadDe: ["org:organization"],
    funcional: true,
    obligatoriaEn: ["soc:Membresia"],
    estado: "definido",
  },
  {
    id: "desde",
    tipo: "dato",
    etiqueta: "desde",
    etiquetaEn: "from",
    comentario: "El primer día del intervalo: de la ocupación, la membresía, el contrato, la vigencia de una norma o el proyecto de inversión.",
    dominio: ["soc:Ocupacion", "soc:Membresia", "soc:Contrato", "soc:Norma", "soc:ProyectoDeInversion"],
    rango: ["xsd:date"],
    subPropiedadDe: ["schema:startDate"],
    funcional: true,
    estado: "en-uso",
  },
  {
    id: "hasta",
    tipo: "dato",
    etiqueta: "hasta",
    etiquetaEn: "until",
    comentario:
      "El último día del intervalo. Sin este dato el intervalo está abierto, que no es lo mismo que vigente: puede que la fuente no registre el cierre. En un proyecto de inversión, el fin que declara, que puede haber pasado sin que el proyecto termine.",
    dominio: ["soc:Ocupacion", "soc:Membresia", "soc:Contrato", "soc:Norma", "soc:ProyectoDeInversion"],
    rango: ["xsd:date"],
    subPropiedadDe: ["schema:endDate"],
    funcional: true,
    estado: "en-uso",
  },
  {
    id: "abiertaPor",
    tipo: "objeto",
    etiqueta: "abierta por",
    etiquetaEn: "opened by",
    comentario: "El evento que abre la ocupación: un nombramiento, una elección.",
    dominio: ["soc:Ocupacion"],
    rango: ["soc:Evento"],
    estado: "definido",
  },
  {
    id: "cerradaPor",
    tipo: "objeto",
    etiqueta: "cerrada por",
    etiquetaEn: "closed by",
    comentario: "El evento que la cierra: un cese, una renuncia, la muerte, otro nombramiento en el mismo puesto.",
    dominio: ["soc:Ocupacion"],
    rango: ["soc:Evento"],
    estado: "definido",
  },
  {
    id: "tipoDeEvento",
    tipo: "objeto",
    etiqueta: "tipo de evento",
    etiquetaEn: "event type",
    comentario: "Qué pasó (`soc:tiposDeEvento`).",
    dominio: ["soc:Evento"],
    rango: ["skos:Concept"],
    funcional: true,
    obligatoriaEn: ["soc:Evento"],
    estado: "definido",
  },
  {
    id: "prueba",
    tipo: "objeto",
    etiqueta: "prueba",
    etiquetaEn: "evidence",
    comentario: "El documento o la norma que registra el evento: el decreto de nombramiento, el acta de la JCE.",
    dominio: ["soc:Evento"],
    rango: ["soc:Documento", "soc:Norma"],
    subPropiedadDe: ["dct:source"],
    estado: "definido",
  },
  {
    id: "afectaA",
    tipo: "objeto",
    etiqueta: "afecta a",
    etiquetaEn: "affects",
    comentario: "La persona u organización a la que le pasa el evento.",
    dominio: ["soc:Evento"],
    rango: ["soc:Persona", "soc:Organizacion"],
    estado: "definido",
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
    estado: "en-uso",
    v1: true,
  },
  {
    id: "pepVigente",
    tipo: "dato",
    etiqueta: "PEP hoy",
    etiquetaEn: "PEP today",
    comentario:
      "Si es persona expuesta políticamente: un cargo obligado vigente o de los últimos tres años. Se calcula a la fecha en que se lee; la fase de tiempo (F4) lo hará «a tal fecha».",
    dominio: ["soc:Persona"],
    rango: ["xsd:boolean"],
    funcional: true,
    estado: "en-uso",
    v1: true,
  },
  {
    id: "declaracion",
    tipo: "objeto",
    etiqueta: "declaración publicada",
    etiquetaEn: "published declaration",
    comentario: "Una declaración jurada de patrimonio de la persona que publica una institución, atada sin dudas.",
    dominio: ["soc:Persona"],
    rango: ["soc:DeclaracionJurada"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "publicadaPor",
    tipo: "objeto",
    etiqueta: "publicada por",
    etiquetaEn: "published by",
    comentario: "La institución en cuyo portal está el documento.",
    dominio: ["soc:Documento"],
    rango: ["soc:Institucion"],
    subPropiedadDe: ["dct:publisher"],
    estado: "en-uso",
    v1: true,
  },

  /* ------------------------------------------------------------- decretos */
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
    estado: "en-uso",
    v1: true,
  },
  {
    id: "firmo",
    tipo: "objeto",
    etiqueta: "firmó",
    etiquetaEn: "signed",
    comentario: "Los decretos que el registro atribuye a una persona.",
    dominio: ["soc:Persona"],
    rango: ["soc:Decreto"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "designa",
    tipo: "objeto",
    etiqueta: "designa o cesa a",
    etiquetaEn: "appoints or removes",
    comentario: "Las personas que el decreto nombra, confirma o cesa, leídas de su título o de su texto.",
    dominio: ["soc:Decreto"],
    rango: ["soc:Persona"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "materia",
    tipo: "objeto",
    etiqueta: "materia",
    etiquetaEn: "subject",
    comentario: "De qué trata un decreto, leído de su título y de su etiqueta con reglas fijas (`do:materias`).",
    dominio: ["soc:Decreto"],
    rango: ["skos:Concept"],
    subPropiedadDe: ["dct:subject"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "numero",
    tipo: "dato",
    etiqueta: "número",
    etiquetaEn: "number",
    comentario: "El número de la norma como lo escribe la Consultoría: «641-26». No la identifica sola: el origen da a veces el mismo número a dos normas.",
    dominio: ["soc:Norma"],
    rango: ["xsd:string"],
    subPropiedadDe: ["eli:id_local", "schema:legislationIdentifier"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "fecha",
    tipo: "dato",
    etiqueta: "fecha",
    etiquetaEn: "date",
    comentario:
      "La fecha que registra la fuente: la de una norma según la Consultoría Jurídica, la del movimiento de un cargo (su designación, su cese), la de una medida, la de un evento, la de publicación de un proceso de compra. Un año solo, si la fuente no da el día.",
    dominio: ["soc:Norma", "soc:Cargo", "soc:Sancion", "soc:Evento", "soc:ProcesoDeContratacion"],
    rango: ["xsd:date", "xsd:gYear"],
    estado: "en-uso",
    v1: true,
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
    estado: "en-uso",
    v1: true,
  },

  /* --------------------------------------------------- organizaciones */
  {
    id: "subOrganizacionDe",
    tipo: "objeto",
    etiqueta: "parte de",
    etiquetaEn: "sub-organization of",
    comentario: "La organización que la contiene: un viceministerio de su ministerio, una dirección de su viceministerio. La clausura es el subgrafo de la organización.",
    dominio: ["soc:Organizacion"],
    rango: ["soc:Organizacion"],
    subPropiedadDe: ["org:subOrganizationOf"],
    estado: "definido",
  },
  {
    id: "sector",
    tipo: "objeto",
    etiqueta: "sector",
    etiquetaEn: "sector",
    comentario: "El sector del Estado al que pertenece la institución, según el Clasificador Institucional (`do:sectores`).",
    dominio: ["soc:Institucion"],
    rango: ["skos:Concept"],
    subPropiedadDe: ["org:classification"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "supervisadaPor",
    tipo: "objeto",
    etiqueta: "supervisada por",
    etiquetaEn: "supervised by",
    comentario: "La superintendencia o el instituto que la registra y la supervisa.",
    dominio: ["soc:EntidadFinanciera"],
    rango: ["soc:Institucion"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "inscritaComo",
    tipo: "objeto",
    etiqueta: "inscrita como proveedora",
    etiquetaEn: "registered as supplier",
    comentario: "La inscripción en el registro de proveedores del Estado con el mismo RNC.",
    dominio: ["soc:Empresa"],
    rango: ["soc:Proveedor"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "estado",
    tipo: "dato",
    etiqueta: "estado según su fuente",
    etiquetaEn: "status per source",
    comentario:
      "El estado que publica la fuente, tal cual y en español: el de la DGII para una empresa («ACTIVO», «DADO DE BAJA»), el de su supervisor para una entidad financiera («Operando», «Cancelado»), el del sistema de inversión para un proyecto («En ejecución», «Paralizado»), el de la DGCP para un contrato («Activo», «Cerrado»).",
    dominio: ["soc:Empresa", "soc:EntidadFinanciera", "soc:ProyectoDeInversion", "soc:Contrato"],
    rango: ["rdf:langString"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "inicioOperaciones",
    tipo: "dato",
    etiqueta: "inicio de operaciones declarado",
    etiquetaEn: "declared start of operations",
    comentario:
      "La fecha en que la persona jurídica declaró al fisco que empezó a operar. No es su fecha de constitución, que el padrón no trae.",
    dominio: ["soc:Empresa"],
    rango: ["xsd:date"],
    estado: "en-uso",
    v1: true,
  },

  /* ------------------------------------------------------------ dinero */
  {
    id: "contratante",
    tipo: "objeto",
    etiqueta: "contratante",
    etiquetaEn: "contracting authority",
    comentario: "La institución que contrató: la unidad de compra deducida del prefijo del código de sus contratos.",
    dominio: ["soc:Contratacion"],
    rango: ["soc:Institucion"],
    funcional: true,
    obligatoriaEn: ["soc:Contratacion"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "contratista",
    tipo: "objeto",
    etiqueta: "contratista",
    etiquetaEn: "contractor",
    comentario: "La inscripción de proveedor a la que se contrató. Si su RNC es de una persona jurídica, esa empresa está inscrita como ella (soc:inscritaComo).",
    dominio: ["soc:Contratacion", "soc:Contrato"],
    rango: ["soc:Proveedor"],
    funcional: true,
    obligatoriaEn: ["soc:Contratacion", "soc:Contrato"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "montoContratado",
    tipo: "dato",
    etiqueta: "monto contratado",
    etiquetaEn: "contracted amount",
    comentario: "La suma de los contratos en pesos dominicanos (DOP): valor adjudicado, no pagado.",
    dominio: ["soc:Contratacion"],
    rango: ["xsd:integer"],
    funcional: true,
    obligatoriaEn: ["soc:Contratacion"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "numeroDeContratos",
    tipo: "dato",
    etiqueta: "número de contratos",
    etiquetaEn: "number of contracts",
    comentario: "Cuántos contratos suma la contratación.",
    dominio: ["soc:Contratacion"],
    rango: ["xsd:integer"],
    funcional: true,
    obligatoriaEn: ["soc:Contratacion"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "comprador",
    tipo: "objeto",
    etiqueta: "comprador",
    etiquetaEn: "buyer",
    comentario: "La institución que convoca el proceso: la de su unidad de compra, por el nombre con que la tabla de procesos la registra.",
    dominio: ["soc:ProcesoDeContratacion"],
    rango: ["soc:Institucion"],
    funcional: true,
    estado: "en-uso",
  },
  {
    id: "valorEstimado",
    tipo: "dato",
    etiqueta: "valor estimado",
    etiquetaEn: "estimated value",
    comentario:
      "El valor que la institución estimó al publicar el proceso, o el valor que declara un proyecto de inversión, en pesos: no es lo adjudicado ni lo pagado.",
    dominio: ["soc:ProcesoDeContratacion", "soc:ProyectoDeInversion"],
    rango: ["xsd:decimal"],
    funcional: true,
    estado: "en-uso",
  },
  {
    id: "codigo",
    tipo: "dato",
    etiqueta: "código",
    etiquetaEn: "code",
    comentario: "El código que el sistema de compras da al proceso o al contrato: «MOPC-CCC-LPN-2026-0013», «INDRHI-2023-00444».",
    dominio: ["soc:ProcesoDeContratacion", "soc:Contrato"],
    rango: ["xsd:string"],
    subPropiedadDe: ["dct:identifier"],
    funcional: true,
    obligatoriaEn: ["soc:ProcesoDeContratacion", "soc:Contrato"],
    estado: "en-uso",
  },
  {
    id: "modalidad",
    tipo: "objeto",
    etiqueta: "modalidad",
    etiquetaEn: "procedure type",
    comentario: "Cómo se compra, según la ley de compras del país (`do:modalidades`).",
    dominio: ["soc:ProcesoDeContratacion"],
    rango: ["skos:Concept"],
    funcional: true,
    estado: "en-uso",
  },
  {
    id: "etapa",
    tipo: "objeto",
    etiqueta: "etapa",
    etiquetaEn: "stage",
    comentario: "Dónde estaba el proceso el día del corte de su fuente (`do:etapas`): no es su estado de hoy.",
    dominio: ["soc:ProcesoDeContratacion"],
    rango: ["skos:Concept"],
    funcional: true,
    estado: "en-uso",
  },
  {
    id: "objetoDeCompra",
    tipo: "objeto",
    etiqueta: "objeto de la compra",
    etiquetaEn: "contract nature",
    comentario: "Qué se compra: bienes, obras o servicios (`soc:objetosDeCompra`).",
    dominio: ["soc:ProcesoDeContratacion"],
    rango: ["skos:Concept"],
    funcional: true,
    estado: "en-uso",
  },
  {
    id: "paraProyecto",
    tipo: "objeto",
    etiqueta: "para el proyecto",
    etiquetaEn: "for project",
    comentario: "El proyecto de inversión para el que se convoca el proceso o se firma el contrato, según el sistema de inversión.",
    dominio: ["soc:ProcesoDeContratacion", "soc:Contrato"],
    rango: ["soc:ProyectoDeInversion"],
    estado: "en-uso",
  },
  {
    id: "delProceso",
    tipo: "objeto",
    etiqueta: "del proceso",
    etiquetaEn: "of procedure",
    comentario: "El proceso que la adjudicación resuelve, o del que sale el contrato.",
    dominio: ["soc:Adjudicacion", "soc:Contrato"],
    rango: ["soc:ProcesoDeContratacion"],
    funcional: true,
    obligatoriaEn: ["soc:Adjudicacion"],
    estado: "en-uso",
  },
  {
    id: "adjudicadaA",
    tipo: "objeto",
    etiqueta: "adjudicada a",
    etiquetaEn: "awarded to",
    comentario: "El proveedor que gana.",
    dominio: ["soc:Adjudicacion"],
    rango: ["soc:Proveedor"],
    estado: "definido",
  },
  {
    id: "resultaEn",
    tipo: "objeto",
    etiqueta: "resulta en",
    etiquetaEn: "results in",
    comentario: "El contrato que se firma por la adjudicación.",
    dominio: ["soc:Adjudicacion"],
    rango: ["soc:Contrato"],
    estado: "definido",
  },
  {
    id: "monto",
    tipo: "dato",
    etiqueta: "monto",
    etiquetaEn: "amount",
    comentario: "El monto en pesos de la adjudicación o del contrato, como lo registra la fuente: no es lo pagado.",
    dominio: ["soc:Adjudicacion", "soc:Contrato"],
    rango: ["xsd:decimal"],
    funcional: true,
    estado: "en-uso",
  },
  {
    id: "tieneMedida",
    tipo: "objeto",
    etiqueta: "tiene la medida",
    etiquetaEn: "has measure",
    comentario: "Una medida que una autoridad registra sobre el proveedor.",
    dominio: ["soc:Proveedor"],
    rango: ["soc:Sancion"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "ejecutadoPor",
    tipo: "objeto",
    etiqueta: "ejecutado por",
    etiquetaEn: "executed by",
    comentario: "La institución que ejecuta el proyecto de inversión: la entidad ejecutora del sistema de inversión, atada a su unidad de compra.",
    dominio: ["soc:ProyectoDeInversion"],
    rango: ["soc:Institucion"],
    funcional: true,
    estado: "en-uso",
  },
  {
    id: "avance",
    tipo: "dato",
    etiqueta: "avance",
    etiquetaEn: "progress",
    comentario:
      "El avance que declara el proyecto de inversión, en por ciento, tal como lo publica su fuente: casi siempre de 0 a 100, pero la fuente publica también valores mayores, que no se corrigen. Da el mismo valor como físico y como financiero.",
    dominio: ["soc:ProyectoDeInversion"],
    rango: ["xsd:decimal"],
    funcional: true,
    estado: "en-uso",
  },
  {
    id: "sectorDeInversion",
    tipo: "objeto",
    etiqueta: "sector de la inversión",
    etiquetaEn: "investment sector",
    comentario: "El sector del proyecto en el sistema de inversión: la clasificación funcional del gasto (`do:sectoresDeInversion`).",
    dominio: ["soc:ProyectoDeInversion"],
    rango: ["skos:Concept"],
    funcional: true,
    estado: "en-uso",
  },
  {
    id: "partidaDe",
    tipo: "objeto",
    etiqueta: "partida de",
    etiquetaEn: "budget line of",
    comentario: "La institución dueña de la partida.",
    dominio: ["soc:PartidaPresupuestaria"],
    rango: ["soc:Institucion"],
    funcional: true,
    estado: "definido",
  },

  /* ------------------------------------------------------------- Congreso */
  {
    id: "proponente",
    tipo: "objeto",
    etiqueta: "proponente",
    etiquetaEn: "sponsor",
    comentario: "Quien deposita la iniciativa: un legislador o una institución.",
    dominio: ["soc:Iniciativa"],
    rango: ["soc:Persona", "soc:Institucion"],
    estado: "definido",
  },
  {
    id: "sobre",
    tipo: "objeto",
    etiqueta: "sobre",
    etiquetaEn: "on",
    comentario: "La iniciativa que se vota.",
    dominio: ["soc:Votacion"],
    rango: ["soc:Iniciativa"],
    estado: "definido",
  },

  /* ------------------------------------------------------------ menciones */
  {
    id: "enDocumento",
    tipo: "objeto",
    etiqueta: "en el documento",
    etiquetaEn: "in document",
    comentario: "El documento o la norma donde está escrita la mención.",
    dominio: ["soc:Mencion"],
    rango: ["soc:Documento", "soc:Norma"],
    subPropiedadDe: ["oa:hasTarget"],
    funcional: true,
    obligatoriaEn: ["soc:Mencion"],
    estado: "definido",
  },
  {
    id: "formaEscrita",
    tipo: "dato",
    etiqueta: "forma escrita",
    etiquetaEn: "surface form",
    comentario: "El nombre como lo escribe el documento.",
    dominio: ["soc:Mencion"],
    rango: ["xsd:string"],
    funcional: true,
    obligatoriaEn: ["soc:Mencion"],
    estado: "definido",
  },
  {
    id: "posicion",
    tipo: "dato",
    etiqueta: "posición",
    etiquetaEn: "offset",
    comentario: "Dónde empieza la mención en el texto del documento, en caracteres.",
    dominio: ["soc:Mencion"],
    rango: ["xsd:integer"],
    funcional: true,
    estado: "definido",
  },
  {
    id: "refiereA",
    tipo: "objeto",
    etiqueta: "se refiere a",
    etiquetaEn: "refers to",
    comentario: "A quién se refiere la mención, cuando queda un solo candidato y el contexto lo corrobora (la institución que publica, el cargo que el texto nombra, la fecha).",
    dominio: ["soc:Mencion"],
    rango: ["soc:Persona", "soc:Organizacion"],
    subPropiedadDe: ["oa:hasBody"],
    funcional: true,
    estado: "definido",
  },
  {
    id: "posibleReferencia",
    tipo: "objeto",
    etiqueta: "podría referirse a",
    etiquetaEn: "candidate referent",
    comentario: "Un candidato que la mención no permite descartar. Varios candidatos no se unen: se dicen.",
    dominio: ["soc:Mencion"],
    rango: ["soc:Persona", "soc:Organizacion"],
    estado: "definido",
  },

  /* ------------------------------------------------- lugares e identidad */
  {
    id: "enLugar",
    tipo: "objeto",
    etiqueta: "en el lugar",
    etiquetaEn: "contained in place",
    comentario: "El lugar que lo contiene: la provincia de un municipio.",
    dominio: ["soc:Lugar"],
    rango: ["soc:Lugar"],
    subPropiedadDe: ["schema:containedInPlace"],
    estado: "definido",
  },
  {
    id: "identificador",
    tipo: "objeto",
    etiqueta: "identificador",
    etiquetaEn: "identifier",
    comentario: "Un identificador que un registro del Estado le da.",
    dominio: ["soc:Organizacion", "soc:Proveedor", "soc:Norma", "soc:ProcesoDeContratacion", "soc:ProyectoDeInversion"],
    rango: ["soc:Identificador"],
    subPropiedadDe: ["adms:identifier"],
    estado: "definido",
  },
  {
    id: "esquemaDeIdentificador",
    tipo: "objeto",
    etiqueta: "esquema",
    etiquetaEn: "identifier scheme",
    comentario: "El registro que emite el identificador (`do:esquemasDeIdentificador`).",
    dominio: ["soc:Identificador"],
    rango: ["skos:Concept"],
    funcional: true,
    obligatoriaEn: ["soc:Identificador"],
    estado: "definido",
  },
  {
    id: "valor",
    tipo: "dato",
    etiqueta: "valor",
    etiquetaEn: "value",
    comentario: "El identificador tal como lo escribe su registro.",
    dominio: ["soc:Identificador"],
    rango: ["xsd:string"],
    subPropiedadDe: ["skos:notation"],
    funcional: true,
    obligatoriaEn: ["soc:Identificador"],
    estado: "definido",
  },
  {
    id: "corte",
    tipo: "dato",
    etiqueta: "corte",
    etiquetaEn: "cut-off date",
    comentario: "Hasta qué día llegan los datos de la instantánea.",
    dominio: ["soc:Instantanea"],
    rango: ["xsd:date"],
    funcional: true,
    estado: "definido",
  },

  /* ------------------------------------------- módulo de la República Dominicana */
  {
    id: "rnc",
    modulo: "do",
    tipo: "dato",
    etiqueta: "RNC",
    etiquetaEn: "tax ID (RNC)",
    comentario: "El Registro Nacional de Contribuyentes de nueve cifras de una persona jurídica.",
    dominio: ["soc:Empresa", "soc:EntidadFinanciera"],
    rango: ["xsd:string"],
    subPropiedadDe: ["schema:taxID"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "rpe",
    modulo: "do",
    tipo: "dato",
    etiqueta: "RPE",
    etiquetaEn: "supplier registry number",
    comentario: "El número del Registro de Proveedores del Estado de la DGCP.",
    dominio: ["soc:Proveedor"],
    rango: ["xsd:string"],
    funcional: true,
    obligatoriaEn: ["soc:Proveedor"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "numeralLey311",
    modulo: "do",
    tipo: "dato",
    etiqueta: "numeral de la Ley 311-14",
    etiquetaEn: "Law 311-14 numeral",
    comentario: "El numeral del artículo 2 de la Ley 311-14 que obliga al cargo, o al puesto, a declarar patrimonio: lo que hace PEP a quien lo ocupa.",
    dominio: ["soc:Cargo", "soc:Puesto"],
    rango: ["xsd:integer"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "snip",
    modulo: "do",
    tipo: "dato",
    etiqueta: "código SNIP",
    etiquetaEn: "SNIP code",
    comentario: "El código del proyecto en el Sistema Nacional de Inversión Pública.",
    dominio: ["soc:ProyectoDeInversion"],
    rango: ["xsd:string"],
    funcional: true,
    obligatoriaEn: ["soc:ProyectoDeInversion"],
    estado: "en-uso",
  },
  {
    id: "tipoDeMedida",
    modulo: "do",
    tipo: "objeto",
    etiqueta: "tipo de medida",
    etiquetaEn: "measure type",
    comentario: "Qué es la medida, leído del texto de la DGCP con reglas fijas (`do:tiposDeMedida`).",
    dominio: ["do:MedidaDGCP"],
    rango: ["skos:Concept"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "etiquetaConsultoria",
    modulo: "do",
    tipo: "dato",
    etiqueta: "etiqueta de institución",
    etiquetaEn: "Consultoría label",
    comentario: "La etiqueta de institución que la Consultoría Jurídica pone al decreto, tal cual y en español.",
    dominio: ["soc:Decreto"],
    rango: ["rdf:langString"],
    estado: "en-uso",
    v1: true,
  },
  {
    id: "aviso",
    modulo: "do",
    tipo: "dato",
    etiqueta: "aviso sobre la fecha",
    etiquetaEn: "date warning",
    comentario:
      "«fuera» si la fecha cae fuera de los períodos de firma de su firmante; «fecha» si no casa con el año del número. Errores de captura probables del registro de la Consultoría: se marcan, no se corrigen.",
    dominio: ["soc:Decreto"],
    rango: ["xsd:string"],
    estado: "en-uso",
    v1: true,
  },
];

/** Los tipos de evento del núcleo. */
const TIPOS_DE_EVENTO: [string, string][] = [
  ["nombramiento", "Nombramiento o designación"],
  ["cese", "Cese o destitución"],
  ["renuncia", "Renuncia"],
  ["eleccion", "Elección"],
  ["fallecimiento", "Fallecimiento"],
  ["cambio-de-partido", "Cambio de partido"],
  ["adjudicacion", "Adjudicación"],
  ["promulgacion", "Promulgación"],
  ["derogacion", "Derogación"],
];

/** Los registros del Estado dominicano que emiten identificadores. */
const ESQUEMAS_DE_IDENTIFICADOR: [string, string, string][] = [
  ["rnc", "RNC", "Registro Nacional de Contribuyentes (DGII)."],
  ["rpe", "RPE", "Registro de Proveedores del Estado (DGCP)."],
  ["unidad-de-compra", "Unidad de compra", "Código de la unidad de compra de una institución en la DGCP."],
  ["codigo-de-proceso", "Código de proceso", "Código de un proceso de compra en la DGCP."],
  ["numero-de-decreto", "Número de decreto", "Número de un decreto según la Consultoría Jurídica."],
  ["snip", "SNIP", "Sistema Nacional de Inversión Pública."],
  ["capitulo", "Capítulo presupuestario", "Capítulo del Clasificador Institucional de DIGEPRES."],
];

/** Cómo escribe la DGCP un concepto: sus literales en la tabla de procesos. */
function literalesDgcp(tabla: Readonly<Record<string, string>>, clave: string): string {
  const xs = Object.entries(tabla)
    .filter(([, k]) => k === clave)
    .map(([literal]) => `«${literal}»`);
  return `En la tabla de procesos de la DGCP: ${xs.join(" y ")}.`;
}

/** Los esquemas de conceptos, de las mismas tablas que usa la interfaz. */
export function esquemas(): Esquema[] {
  return [
    {
      id: "tiposDeEvento",
      etiqueta: "Tipos de evento",
      comentario: "Lo que cambia el estado del grafo: abre o cierra ocupaciones, membresías y vigencias.",
      conceptos: TIPOS_DE_EVENTO.map(([id, etiqueta]) => ({ id: `evento-${id}`, etiqueta })),
    },
    {
      id: "materias",
      modulo: "do",
      etiqueta: "Materias de un decreto",
      comentario: "De qué trata un decreto, leído de su título y de su etiqueta de institución con reglas fijas.",
      conceptos: MATERIAS.map((m) => ({ id: `materia-${m.slug}`, etiqueta: m.nombre })),
      v1: true,
    },
    {
      id: "movimientos",
      modulo: "do",
      etiqueta: "Movimientos de un cargo",
      comentario: "Qué registra la fuente de un cargo.",
      conceptos: Object.entries(ETIQUETA_MOVIMIENTO).map(([k, v]) => ({ id: `movimiento-${k}`, etiqueta: v })),
      v1: true,
    },
    {
      id: "sectores",
      modulo: "do",
      etiqueta: "Sectores del Estado",
      comentario: "Los sectores del Clasificador Institucional de DIGEPRES que usa la plataforma.",
      conceptos: SECTORES.map((s) => ({ id: `sector-${s.clave}`, etiqueta: s.nombre, definicion: s.que })),
      v1: true,
    },
    {
      id: "familiasPep",
      modulo: "do",
      etiqueta: "Familias de cargos obligados a declarar",
      comentario: "Los numerales del artículo 2 de la Ley 311-14, agrupados como los filtra la plataforma: la regla PEP dominicana.",
      conceptos: FAMILIAS_PEP.map((f) => ({
        id: `familia-${f.clave}`,
        etiqueta: f.etiqueta,
        definicion: `Numerales ${f.numerales.join(", ")} del art. 2 de la Ley 311-14.`,
      })),
      v1: true,
    },
    {
      id: "tiposDeMedida",
      modulo: "do",
      etiqueta: "Tipos de medida de la DGCP",
      comentario: "Lo que la plataforma lee del texto de cada medida, en una lista cerrada.",
      conceptos: Object.entries(TIPOS_MEDIDA).map(([k, v]) => ({ id: `medida-${k}`, etiqueta: v.etiqueta, definicion: v.llano })),
      v1: true,
    },
    {
      id: "objetosDeCompra",
      etiqueta: "Objeto de la compra",
      comentario: "Lo que se compra: la naturaleza del contrato.",
      conceptos: Object.entries(OBJETOS).map(([k, v]) => ({ id: `objeto-${k}`, etiqueta: v })),
    },
    {
      id: "modalidades",
      modulo: "do",
      etiqueta: "Modalidades de compra",
      comentario: "Las modalidades de la Ley 340-06 como las registra la DGCP, dichas como las dice la plataforma.",
      conceptos: Object.entries(MODALIDADES).map(([k, v]) => ({ id: `modalidad-${k}`, etiqueta: v, definicion: literalesDgcp(MODALIDAD_DE_LA_DGCP, k) })),
    },
    {
      id: "etapas",
      modulo: "do",
      etiqueta: "Etapas de un proceso de compra",
      comentario: "Dónde está un proceso en la tabla de procesos de la DGCP el día del corte. Dos de sus literales son una misma etapa.",
      conceptos: Object.entries(ETAPAS).map(([k, v]) => ({ id: `etapa-${k}`, etiqueta: v, definicion: literalesDgcp(ETAPA_DE_LA_DGCP, k) })),
    },
    {
      id: "sectoresDeInversion",
      modulo: "do",
      etiqueta: "Sectores de la inversión pública",
      comentario: "El sector de un proyecto en el Sistema Nacional de Inversión Pública, como lo publica MapaInversiones: la clasificación funcional del gasto.",
      conceptos: SECTORES_INVERSION.map((x) => ({ id: `inversion-${x.clave}`, etiqueta: x.nombre })),
    },
    {
      id: "esquemasDeIdentificador",
      modulo: "do",
      etiqueta: "Registros que emiten identificadores",
      comentario: "Qué registro del Estado dominicano da cada número. La cédula no está: el grafo no la guarda.",
      conceptos: ESQUEMAS_DE_IDENTIFICADOR.map(([id, etiqueta, definicion]) => ({ id: `id-${id}`, etiqueta, definicion })),
    },
  ];
}

/*
  Los nombres locales son únicos entre los dos módulos: la página `/ontologia`
  pone un ancla por término, y los dos espacios de nombres llevan a ella.
*/
{
  const vistos = new Set<string>();
  for (const id of [
    ...CLASES.map((c) => c.id),
    ...PROPIEDADES.map((p) => p.id),
    ...esquemas().flatMap((e) => [e.id, ...e.conceptos.map((c) => c.id)]),
  ]) {
    if (vistos.has(id)) throw new Error(`la ontología repite el nombre local «${id}»`);
    vistos.add(id);
  }
}

/** El módulo de un concepto, por el de su esquema. */
let moduloDeConcepto: Map<string, Modulo> | null = null;
/** El nombre corto de un concepto de un esquema: `do:materia-salud`. */
export function concepto(id: string): string {
  moduloDeConcepto ??= new Map(esquemas().flatMap((e) => e.conceptos.map((c) => [c.id, e.modulo ?? "soc"] as const)));
  return `${moduloDeConcepto.get(id) ?? "soc"}:${id}`;
}

/* -------------------------------------------------------------- OWL y RDFS */

const ESTADO_VS: Record<Estado, string> = { "en-uso": "stable", definido: "testing" };
/** Un rango que es un tipo de dato: los de XML Schema, un texto con idioma (`rdf:langString`) o cualquier literal. */
const esDato = (x: string) => x.startsWith("xsd:") || x === "rdf:langString" || x === "rdfs:Literal";

/** Las cabeceras de las dos ontologías: el núcleo y el módulo dominicano, que lo importa. */
function cabeceras(): Triple[] {
  const fecha = { tipo: "literal" as const, valor: PUBLICADA, datatype: PREFIJOS.xsd + "date" };
  const comun = (o: string, prefijo: Modulo): Triple[] => [
    t(o, "rdf:type", iri("owl:Ontology")),
    t(o, "owl:versionInfo", lit(VERSION)),
    t(o, "owl:versionIRI", iri(`${o}/${VERSION}`)),
    t(o, "dct:modified", fecha),
    t(o, "vann:preferredNamespacePrefix", lit(prefijo)),
    t(o, "vann:preferredNamespaceUri", lit(PREFIJOS[prefijo])),
    t(o, "rdfs:seeAlso", iri(PAGINA_ONTOLOGIA)),
    t(o, "rdfs:seeAlso", iri(`${PAGINA_ONTOLOGIA}.ttl`)),
    t(o, "dct:license", iri("https://creativecommons.org/licenses/by/4.0/")),
    t(o, "owl:priorVersion", iri(`${o}/${ANTERIOR}`)),
  ];
  return [
    ...comun(ONTOLOGIA, "soc"),
    t(ONTOLOGIA, "dct:title", lit("Ontología de Socrático.do — núcleo", "es")),
    t(ONTOLOGIA, "dct:title", lit("Socrático.do ontology — core", "en")),
    t(
      ONTOLOGIA,
      "dct:description",
      lit(
        "El núcleo, neutral de país, del grafo de Socrático.do, una herramienta independiente y no oficial sobre datos del Estado: personas con cargo público, organizaciones y su jerarquía, puestos y ocupaciones con intervalo, eventos, normas, contratación pública, documentos y menciones, lugares, identificadores y la procedencia de cada dato.",
        "es",
      ),
    ),
    t(ONTOLOGIA, "owl:priorVersion", iri(ESPACIO_V1.slice(0, -1))),
    ...comun(ONTOLOGIA_DO, "do"),
    t(ONTOLOGIA_DO, "dct:title", lit("Ontología de Socrático.do — República Dominicana", "es")),
    t(ONTOLOGIA_DO, "dct:title", lit("Socrático.do ontology — Dominican Republic module", "en")),
    t(
      ONTOLOGIA_DO,
      "dct:description",
      lit(
        "Lo que solo existe en la República Dominicana, sobre el núcleo: los identificadores del Estado (RNC, RPE, SNIP), las clasificaciones (DIGEPRES, movimientos del MAP, materias de la Consultoría Jurídica, medidas de la DGCP) y la regla de persona expuesta políticamente de la Ley 311-14.",
        "es",
      ),
    ),
    // Usa el núcleo; no lo importa (`owl:imports`): los dos van en el mismo
    // documento, y un editor OWL lo cargaría dos veces.
    t(ONTOLOGIA_DO, "dct:requires", iri(ONTOLOGIA)),
  ];
}

const ontologiaDe = (m?: Modulo) => (m === "do" ? ONTOLOGIA_DO : ONTOLOGIA);

/** Todos los triples de la ontología: cabeceras, clases, propiedades y esquemas. */
export function triplesOntologia(): Triple[] {
  const x: Triple[] = cabeceras();
  for (const c of CLASES) {
    const s = curie(c);
    x.push(
      t(s, "rdf:type", iri("owl:Class")),
      t(s, "rdfs:label", lit(c.etiqueta, "es")),
      t(s, "rdfs:label", lit(c.etiquetaEn, "en")),
      t(s, "rdfs:comment", lit(c.comentario, "es")),
      t(s, "rdfs:isDefinedBy", iri(ontologiaDe(c.modulo))),
      t(s, "vs:term_status", lit(ESTADO_VS[c.estado])),
    );
    for (const sin of c.sinonimos ?? []) x.push(t(s, "skos:altLabel", lit(sin, "es")));
    if (c.padre) x.push(t(s, "rdfs:subClassOf", iri(c.padre)));
    for (const sup of c.subClaseDe) x.push(t(s, "rdfs:subClassOf", iri(sup)));
    for (const w of c.wikidata ?? []) x.push(t(s, `skos:${w.relacion}`, iri(`wd:${w.qid}`)));
    if (c.clave?.length) x.push(...lista(s, "owl:hasKey", c.clave.map((k) => iri(k)), `clave-${c.id}`));
    if (c.v1) x.push(...anterior(ESPACIO_V1 + c.id, "owl:Class", "rdfs:subClassOf", s));
  }
  for (const p of PROPIEDADES) {
    const s = curie(p);
    x.push(
      t(s, "rdf:type", iri(p.tipo === "objeto" ? "owl:ObjectProperty" : "owl:DatatypeProperty")),
      t(s, "rdfs:label", lit(p.etiqueta, "es")),
      t(s, "rdfs:label", lit(p.etiquetaEn, "en")),
      t(s, "rdfs:comment", lit(p.comentario, "es")),
      t(s, "rdfs:isDefinedBy", iri(ontologiaDe(p.modulo))),
      t(s, "vs:term_status", lit(ESTADO_VS[p.estado])),
    );
    if (p.funcional) x.push(t(s, "rdf:type", iri("owl:FunctionalProperty")));
    // Con varios dominios o rangos, RDFS los intersecta: se declara la unión en OWL.
    for (const [pred, terminos] of [
      ["rdfs:domain", p.dominio],
      ["rdfs:range", p.rango],
    ] as const) {
      if (terminos.length === 1) x.push(t(s, pred, iri(terminos[0])));
      else if (terminos.length > 1) x.push(...union(s, pred, terminos));
    }
    for (const sup of p.subPropiedadDe ?? []) x.push(t(s, "rdfs:subPropertyOf", iri(sup)));
    if (p.inversa) x.push(t(s, "owl:inverseOf", iri(`soc:${p.inversa}`)));
    if (p.v1) x.push(...anterior(ESPACIO_V1 + p.id, p.tipo === "objeto" ? "owl:ObjectProperty" : "owl:DatatypeProperty", "rdfs:subPropertyOf", s));
  }
  for (const e of esquemas()) {
    const s = curie(e);
    x.push(
      t(s, "rdf:type", iri("skos:ConceptScheme")),
      t(s, "skos:prefLabel", lit(e.etiqueta, "es")),
      t(s, "rdfs:comment", lit(e.comentario, "es")),
      t(s, "rdfs:isDefinedBy", iri(ontologiaDe(e.modulo))),
    );
    for (const c of e.conceptos) {
      const cs = `${e.modulo ?? "soc"}:${c.id}`;
      x.push(
        t(cs, "rdf:type", iri("skos:Concept")),
        t(cs, "skos:prefLabel", lit(c.etiqueta, "es")),
        t(cs, "skos:inScheme", iri(s)),
        t(cs, "skos:topConceptOf", iri(s)),
      );
      if (c.definicion) x.push(t(cs, "skos:definition", lit(c.definicion, "es")));
      if (e.v1) x.push(t(cs, "skos:exactMatch", iri(ESPACIO_V1 + c.id)));
    }
  }
  return x;
}

/** El término de la v1: declarado con su tipo (OWL 2 DL lo exige), caso del de ahora y obsoleto. */
function anterior(v1: string, tipo: string, pred: string, ahora: string): Triple[] {
  return [
    t(v1, "rdf:type", iri(tipo)),
    t(v1, pred, iri(ahora)),
    t(v1, "owl:deprecated", { tipo: "literal", valor: "true", datatype: PREFIJOS.xsd + "boolean" }),
  ];
}

/** Una lista RDF (`rdf:first`/`rdf:rest`) colgada de `s` por `pred`, con nodos en blanco de nombre estable. */
function lista(s: string | Termino, pred: string, elementos: Termino[], base: string): Triple[] {
  const x: Triple[] = [];
  let anterior: Termino | null = null;
  elementos.forEach((el, i) => {
    const celda: Termino = { tipo: "blanco", valor: `${base}-${i}` };
    if (anterior) x.push({ s: anterior, p: expandir("rdf:rest"), o: celda });
    else x.push(t(s, pred, celda));
    x.push({ s: celda, p: expandir("rdf:first"), o: el });
    anterior = celda;
  });
  if (anterior) x.push({ s: anterior, p: expandir("rdf:rest"), o: iri("rdf:nil") });
  return x;
}

/**
 * `rdfs:domain [ owl:unionOf (A B) ]`. La unión de clases es una
 * `owl:Class`; la de tipos de dato (`xsd:date` o `xsd:gYear`), un
 * `rdfs:Datatype`.
 */
function union(s: string, pred: string, terminos: string[]): Triple[] {
  const base = `u-${expandir(s).split("#").pop()}-${pred.split(":").pop()}`;
  const nodo: Termino = { tipo: "blanco", valor: base };
  const tipo = terminos.every(esDato) ? "rdfs:Datatype" : "owl:Class";
  return [
    t(s, pred, nodo),
    { s: nodo, p: expandir("rdf:type"), o: iri(tipo) },
    ...lista(nodo, "owl:unionOf", terminos.map((x) => iri(x)), base),
  ];
}

/* ------------------------------------------------------------------ SHACL */

/** El espacio de las formas SHACL: una por clase, con el nombre local de su clase. */
export const FORMAS = `${W3ID}/def/formas#`;

/**
 * Las formas SHACL: una `sh:NodeShape` por clase, con una forma de propiedad
 * por cada propiedad cuyo dominio la incluye —su tipo de dato o su clase de
 * llegada, `sh:maxCount 1` si es funcional, `sh:minCount 1` si la clase la
 * exige—. Abiertas: una instancia puede llevar más (schema.org, ORG, ELI).
 * Para validar, el grafo de datos tiene que llevar la ontología: SHACL lee
 * las subclases (`rdfs:subClassOf`) del grafo de datos.
 */
export function triplesFormas(): Triple[] {
  const x: Triple[] = [];
  const blanco = (v: string): Termino => ({ tipo: "blanco", valor: v });
  const valor = (rango: string): [string, Termino][] =>
    esDato(rango)
      ? [["sh:datatype", iri(rango)]]
      : [
          ["sh:nodeKind", iri("sh:BlankNodeOrIRI")],
          ["sh:class", iri(rango)],
        ];
  for (const c of CLASES) {
    const forma = FORMAS + c.id;
    x.push(
      t(forma, "rdf:type", iri("sh:NodeShape")),
      t(forma, "sh:targetClass", iri(curie(c))),
      t(forma, "rdfs:label", lit(`Forma de ${c.etiqueta.toLowerCase()}`, "es")),
    );
    for (const p of PROPIEDADES) {
      if (!p.dominio.includes(curie(c))) continue;
      const base = `f-${c.id}-${p.id}`;
      const ps = blanco(base);
      x.push(t(forma, "sh:property", ps), { s: ps, p: expandir("sh:path"), o: iri(curie(p)) });
      if (p.rango.length === 1) {
        for (const [pred, o] of valor(p.rango[0])) x.push({ s: ps, p: expandir(pred), o });
      } else {
        // Vale cualquiera de los rangos: `sh:or` de una forma por rango.
        const alternativas = p.rango.map((r, i) => {
          const alt = blanco(`${base}-o${i}`);
          for (const [pred, o] of valor(r)) x.push({ s: alt, p: expandir(pred), o });
          return alt;
        });
        x.push(...lista(ps, "sh:or", alternativas, `${base}-or`));
      }
      if (p.funcional) x.push({ s: ps, p: expandir("sh:maxCount"), o: entero(1) });
      if (p.obligatoriaEn?.includes(curie(c))) x.push({ s: ps, p: expandir("sh:minCount"), o: entero(1) });
    }
  }
  return x;
}

/* ------------------------------------------------------------- Fabric IQ */

/** Un nombre que Fabric IQ admite para un tipo de entidad: de 1 a 26 caracteres, letras, cifras, `-` o `_`. */
const NOMBRE_FABRIC = /^[A-Za-z0-9_-]{1,26}$/;

/**
 * El perfil para Microsoft Fabric IQ: lo que su importador de RDF/OWL
 * representa, según su documentación (learn.microsoft.com, «Import and export
 * ontologies», «Create entity types», «Create relationship types», revisada
 * el 2026-10-01). Va en **su propio espacio** (`fabric:`,
 * `https://w3id.org/socratico/def/fabric#`): sus términos no son los del
 * núcleo —una relación partida o un concepto vuelto texto no son la propiedad
 * de `soc:`— y cada uno remite al suyo con `rdfs:seeAlso`.
 *
 *  · Cada clase es un tipo de entidad con **un solo padre** de aquí —Fabric
 *    conserva solo el primero—.
 *  · El **nombre** (`rdfs:label`, que Fabric toma como nombre visible) es el
 *    mismo que la parte local del IRI, por si el importador toma uno u otro:
 *    letras, cifras y `_`, hasta 26 caracteres, único (Fabric pide nombres de
 *    relación únicos). El nombre en llano va de sinónimo (`skos:altLabel`) y
 *    de descripción (`rdfs:comment`).
 *  · Una propiedad con varios dominios o rangos se parte en una por par
 *    (`fecha_Norma`, `posibleReferencia_Org`); una que apunta a un concepto
 *    SKOS pasa a ser un dato de texto (Fabric no tiene listas cerradas); una
 *    unión de tipos de dato o un texto con idioma, texto.
 *  · Lo de fuera (schema.org, ORG, Wikidata) no viaja: Fabric no lo importa.
 *
 * Lanza si un nombre no cabe: el build falla antes de publicar un perfil que
 * Fabric rechazaría. ⚠️ Sin una importación real verificada
 * (docs/INFRAESTRUCTURA.md §7).
 */
export function triplesFabric(): Triple[] {
  const o = PREFIJOS.fabric.slice(0, -1);
  const x: Triple[] = [
    t(o, "rdf:type", iri("owl:Ontology")),
    t(o, "rdfs:label", lit("Socratico", "es")),
    t(o, "rdfs:comment", lit("Perfil de la ontología de Socrático.do para Microsoft Fabric IQ: tipos de entidad, propiedades y relaciones.", "es")),
    t(o, "owl:versionInfo", lit(VERSION)),
    t(o, "rdfs:seeAlso", iri(ONTOLOGIA)),
  ];
  const porCurie = new Map(CLASES.map((c) => [curie(c), c]));
  const nombreDe = (c: Clase) => (c.id.length <= 26 ? c.id : (c.corto ?? c.id));
  const cortoDe = (cur: string) => {
    const c = porCurie.get(cur);
    return c ? (c.corto ?? c.id) : cur.split(":")[1];
  };
  const usados = new Set<string>();
  const nombre = (n: string) => {
    if (!NOMBRE_FABRIC.test(n)) throw new Error(`«${n}» no es un nombre que Fabric IQ admita (1–26 caracteres, letras, cifras, - o _)`);
    if (usados.has(n)) throw new Error(`el perfil de Fabric repite el nombre «${n}»`);
    usados.add(n);
    return `fabric:${n}`;
  };
  const enFabric = new Map<string, string>();
  for (const c of CLASES) enFabric.set(curie(c), nombre(nombreDe(c)));
  for (const c of CLASES) {
    const s = enFabric.get(curie(c))!;
    x.push(
      t(s, "rdf:type", iri("owl:Class")),
      t(s, "rdfs:label", lit(s.slice("fabric:".length))),
      t(s, "rdfs:comment", lit(c.comentario, "es")),
      t(s, "skos:altLabel", lit(c.etiqueta, "es")),
      t(s, "skos:altLabel", lit(c.etiquetaEn, "en")),
      t(s, "rdfs:seeAlso", iri(curie(c))),
    );
    for (const sin of c.sinonimos ?? []) x.push(t(s, "skos:altLabel", lit(sin, "es")));
    if (c.padre) x.push(t(s, "rdfs:subClassOf", iri(enFabric.get(c.padre)!)));
  }
  for (const p of PROPIEDADES) {
    const aConcepto = p.tipo === "objeto" && p.rango.every((r) => !porCurie.has(r));
    const esDeDato = p.tipo === "dato" || aConcepto;
    // Fabric no tiene textos con idioma: uno de una sola clase de XML Schema pasa tal cual; lo demás, texto.
    const rangos = esDeDato ? [p.rango.length === 1 && p.rango[0].startsWith("xsd:") ? p.rango[0] : "xsd:string"] : p.rango;
    for (const d of p.dominio) {
      for (const r of rangos) {
        const n = `${p.id}${p.dominio.length > 1 ? `_${cortoDe(d)}` : ""}${rangos.length > 1 ? `_${cortoDe(r)}` : ""}`;
        const s = nombre(n);
        x.push(
          t(s, "rdf:type", iri(esDeDato ? "owl:DatatypeProperty" : "owl:ObjectProperty")),
          t(s, "rdfs:label", lit(n)),
          t(s, "rdfs:comment", lit(p.comentario, "es")),
          t(s, "skos:altLabel", lit(p.etiqueta, "es")),
          t(s, "skos:altLabel", lit(p.etiquetaEn, "en")),
          t(s, "rdfs:seeAlso", iri(curie(p))),
          t(s, "rdfs:domain", iri(enFabric.get(d)!)),
          t(s, "rdfs:range", iri(esDeDato ? r : enFabric.get(r)!)),
        );
      }
    }
  }
  return x;
}

/** Cuántas clases, propiedades y conceptos tiene, y cuántos están en uso: para la página y VoID. */
export function resumenOntologia() {
  const e = esquemas();
  return {
    clases: CLASES.length,
    clasesEnUso: CLASES.filter((c) => c.estado === "en-uso").length,
    propiedades: PROPIEDADES.length,
    propiedadesEnUso: PROPIEDADES.filter((p) => p.estado === "en-uso").length,
    esquemas: e.length,
    conceptos: e.reduce((n, x) => n + x.conceptos.length, 0),
  };
}

/** `entero` re-exportado para las rutas que escriben VoID. */
export { entero };
