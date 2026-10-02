/**
 * Capítulos institucionales del Presupuesto General del Estado.
 *
 * Es el catálogo que la API de datos abiertos del SIGEF (`lib/fiscal.ts`) usa
 * para consultar la ejecución: cada institución del presupuesto tiene un
 * código de capítulo y pertenece a una sección institucional. Se extrajo del
 * propio formulario del Portal de Transparencia Fiscal —la única forma en que
 * Hacienda publica esta taxonomía— y se verificó contra respuestas reales
 * (docs/INFRAESTRUCTURA.md §5.2).
 *
 * Los nombres se guardan **como los escribe el Estado** (mayúsculas incluidas)
 * para que el código sea reconciliable con la fuente; `titulizar` los pone en
 * caja de lectura para la interfaz sin tocar los acrónimos.
 */

export interface Capitulo {
  /** Código de capítulo presupuestario, p. ej. `0206`. */
  codigo: string;
  /** Sección institucional a la que pertenece (la API la exige). */
  seccion: string;
  /** Nombre oficial, en mayúsculas como lo publica Hacienda. */
  nombre: string;
}

/** Nombre de cada sección institucional. */
export const SECCIONES_INSTITUCIONALES: Record<string, string> = {
  "11111": "Administración Central",
  "11112": "Instituciones Públicas Descentralizadas y Autónomas No Financieras",
  "11113": "Instituciones Públicas de la Seguridad Social",
};

export const CAPITULOS: Capitulo[] = [
  { codigo: "0101", seccion: "11111", nombre: "SENADO DE LA REPÚBLICA" },
  { codigo: "0102", seccion: "11111", nombre: "CÁMARA DE DIPUTADOS" },
  { codigo: "0201", seccion: "11111", nombre: "PRESIDENCIA DE LA REPÚBLICA" },
  { codigo: "0202", seccion: "11111", nombre: "MINISTERIO DE INTERIOR Y POLICÍA" },
  { codigo: "0203", seccion: "11111", nombre: "MINISTERIO DE DEFENSA" },
  { codigo: "0204", seccion: "11111", nombre: "MINISTERIO DE RELACIONES EXTERIORES" },
  { codigo: "0205", seccion: "11111", nombre: "MINISTERIO DE HACIENDA" },
  { codigo: "0206", seccion: "11111", nombre: "MINISTERIO DE EDUCACIÓN" },
  { codigo: "0207", seccion: "11111", nombre: "MINISTERIO DE SALUD PÚBLICA Y ASISTENCIA SOCIAL" },
  { codigo: "0208", seccion: "11111", nombre: "MINISTERIO DE DEPORTES Y RECREACIÓN" },
  { codigo: "0209", seccion: "11111", nombre: "MINISTERIO DE TRABAJO" },
  { codigo: "0210", seccion: "11111", nombre: "MINISTERIO DE AGRICULTURA" },
  { codigo: "0211", seccion: "11111", nombre: "MINISTERIO DE OBRAS PÚBLICAS Y COMUNICACIONES" },
  { codigo: "0212", seccion: "11111", nombre: "MINISTERIO DE INDUSTRIA, COMERCIO Y MIPYMES (MICM)" },
  { codigo: "0213", seccion: "11111", nombre: "MINISTERIO DE TURISMO" },
  { codigo: "0214", seccion: "11111", nombre: "PROCURADURÍA GENERAL DE LA REPÚBLICA" },
  { codigo: "0215", seccion: "11111", nombre: "MINISTERIO DE LA MUJER" },
  { codigo: "0216", seccion: "11111", nombre: "MINISTERIO DE CULTURA" },
  { codigo: "0217", seccion: "11111", nombre: "MINISTERIO DE LA JUVENTUD" },
  { codigo: "0218", seccion: "11111", nombre: "MINISTERIO DE MEDIO AMBIENTE Y RECURSOS NATURALES" },
  { codigo: "0219", seccion: "11111", nombre: "MINISTERIO DE EDUCACIÓN SUPERIOR CIENCIA Y TECNOLOGÍA" },
  { codigo: "0220", seccion: "11111", nombre: "MINISTERIO DE ECONOMÍA, PLANIFICACIÓN Y DESARROLLO" },
  { codigo: "0221", seccion: "11111", nombre: "MINISTERIO DE ADMINISTRACIÓN PÚBLICA" },
  { codigo: "0222", seccion: "11111", nombre: "MINISTERIO DE ENERGIA Y MINAS" },
  { codigo: "0223", seccion: "11111", nombre: "MINISTERIO DE LA VIVIENDA, HABITAT Y EDIFICACIONES (MIVHED)" },
  { codigo: "0301", seccion: "11111", nombre: "PODER JUDICIAL" },
  { codigo: "0401", seccion: "11111", nombre: "JUNTA CENTRAL ELECTORAL" },
  { codigo: "0402", seccion: "11111", nombre: "CÁMARA DE CUENTAS" },
  { codigo: "0403", seccion: "11111", nombre: "TRIBUNAL CONSTITUCIONAL" },
  { codigo: "0404", seccion: "11111", nombre: "DEFENSOR DEL PUEBLO" },
  { codigo: "0405", seccion: "11111", nombre: "TRIBUNAL SUPERIOR ELECTORAL ( TSE)" },
  { codigo: "0406", seccion: "11111", nombre: "OFICINA NACIONAL DE DEFENSA PUBLICA" },
  { codigo: "0998", seccion: "11111", nombre: "ADMINISTRACION DE DEUDA PUBLICA Y ACTIVOS FINANCIEROS" },
  { codigo: "0999", seccion: "11111", nombre: "ADMINISTRACION DE OBLIGACIONES DEL TESORO NACIONAL" },
  { codigo: "5102", seccion: "11112", nombre: "CENTRO DE EXPORTACIONES E INVERSIONES DE LA REP. DOM." },
  { codigo: "5103", seccion: "11112", nombre: "CONSEJO NACIONAL DE POBLACIÓN Y FAMILIA" },
  { codigo: "5104", seccion: "11112", nombre: "DEPARTAMENTO AEROPORTUARIO" },
  { codigo: "5108", seccion: "11112", nombre: "CRUZ ROJA DOMINICANA" },
  { codigo: "5109", seccion: "11112", nombre: "DEFENSA CIVIL" },
  { codigo: "5111", seccion: "11112", nombre: "INSTITUTO AGRARIO DOMINICANO" },
  { codigo: "5112", seccion: "11112", nombre: "INSTITUTO AZUCARERO DOMINICANO" },
  { codigo: "5114", seccion: "11112", nombre: "INSTITUTO PARA EL DESARROLLO DEL NOROESTE" },
  { codigo: "5118", seccion: "11112", nombre: "INSTITUTO NACIONAL DE RECURSOS HIDRAÚLICOS (INDRHI)" },
  { codigo: "5119", seccion: "11112", nombre: "INSTITUTO PARA EL DESARROLLO DEL SUROESTE" },
  { codigo: "5120", seccion: "11112", nombre: "JARDÍN BOTÁNICO" },
  { codigo: "5121", seccion: "11112", nombre: "LIGA MUNICIPAL DOMINICANA" },
  { codigo: "5126", seccion: "11112", nombre: "SUPERINTENDENCIA DE BANCOS" },
  { codigo: "5127", seccion: "11112", nombre: "SUPERINTENDENCIA DE SEGUROS" },
  { codigo: "5128", seccion: "11112", nombre: "UNIVERSIDAD AUTÓNOMA DE SANTO DOMINGO" },
  { codigo: "5130", seccion: "11112", nombre: "PARQUE ZOOLÓGICO NACIONAL" },
  { codigo: "5131", seccion: "11112", nombre: "INSTITUTO DOMINICANO DE LAS TELECOMUNICACIONES" },
  { codigo: "5132", seccion: "11112", nombre: "INSTITUTO DOMINICANO DE INVESTIGACIONES AGROPECUARIAS Y FORESTALES" },
  { codigo: "5133", seccion: "11112", nombre: "MUSEO DE HISTORIA NATURAL" },
  { codigo: "5134", seccion: "11112", nombre: "ACUARIO NACIONAL" },
  { codigo: "5135", seccion: "11112", nombre: "OFICINA NACIONAL DE PROPIEDAD INDUSTRIAL" },
  { codigo: "5136", seccion: "11112", nombre: "INSTITUTO DOMINICANO DEL CAFÉ" },
  { codigo: "5137", seccion: "11112", nombre: "INSTITUTO DUARTIANO" },
  { codigo: "5138", seccion: "11112", nombre: "COMISIÓN NACIONAL DE ENERGÍA" },
  { codigo: "5139", seccion: "11112", nombre: "SUPERINTENDENCIA DE ELECTRICIDAD" },
  { codigo: "5140", seccion: "11112", nombre: "INSTITUTO DEL TABACO DE LA REPÚBLICA DOMINICANA" },
  { codigo: "5142", seccion: "11112", nombre: "FONDO PATRIMONIAL DE LAS EMPRESAS REFORMADAS" },
  { codigo: "5143", seccion: "11112", nombre: "INSTITUTO DE DESARROLLO Y CRÉDITO COOPERATIVO" },
  { codigo: "5144", seccion: "11112", nombre: "FONDO ESPECIAL PARA EL DESARROLLO AGROPECUARIO" },
  { codigo: "5145", seccion: "11112", nombre: "SUPERINTENDENCIA DE VALORES" },
  { codigo: "5147", seccion: "11112", nombre: "INSTITUTO NACIONAL DE LA UVA" },
  { codigo: "5150", seccion: "11112", nombre: "CONSEJO NACIONAL DE ZONAS FRANCAS" },
  { codigo: "5151", seccion: "11112", nombre: "CONSEJO NACIONAL PARA LA NIÑEZ Y LA ADOLESCENCIA" },
  { codigo: "5154", seccion: "11112", nombre: "INSTITUTO DE INNOVACION EN BIOTECNOLOGIA E INDUSTRIAL (IIBI)" },
  { codigo: "5155", seccion: "11112", nombre: "INSTITUTO DE FORMACIÓN TÉCNICO PROFESIONAL (INFOTEP)" },
  { codigo: "5157", seccion: "11112", nombre: "CORPORACION DOMICANA DE EMPRESAS ESTATALES (CORDE" },
  { codigo: "5158", seccion: "11112", nombre: "DIRECCION GENERAL DE ADUANAS" },
  { codigo: "5159", seccion: "11112", nombre: "DIRECCION GENERAL DE IMPUESTOS INTERNOS" },
  { codigo: "5161", seccion: "11112", nombre: "INSTITUTO DE PROTECCION DE LOS DERECHOS AL CONSUMIDOR" },
  { codigo: "5162", seccion: "11112", nombre: "INSTITUTO DOMINICANO DE AVIACION CIVIL" },
  { codigo: "5163", seccion: "11112", nombre: "CONSEJO DOMINICANO DE PESCA Y ACUICULTURA" },
  { codigo: "5164", seccion: "11112", nombre: "CONSEJO NAC. PARA LAS COMUNIDADES DOMINICANAS EN EL EXTERIOR (CONDEX)" },
  { codigo: "5165", seccion: "11112", nombre: "COMISION REGULADORA DE PRACTICAS DESLEALES" },
  { codigo: "5166", seccion: "11112", nombre: "COMISION NACIONAL DE DEFENSA DE LA COMPETENCIA" },
  { codigo: "5167", seccion: "11112", nombre: "OFICINA NACIONAL DE DEFENSA PUBLICA" },
  { codigo: "5168", seccion: "11112", nombre: "ARCHIVO GENERAL DE LA NACIÓN" },
  { codigo: "5169", seccion: "11112", nombre: "DIRECCIÓN GENERAL DE CINE (DGCINE)" },
  { codigo: "5170", seccion: "11112", nombre: "INSTITUTO NACIONAL DE BIENESTAR ESTUDIANTIL" },
  { codigo: "5171", seccion: "11112", nombre: "INSTITUTO DOMINICANO PARA LA CALIDAD (INDOCAL)" },
  { codigo: "5172", seccion: "11112", nombre: "ORGANISMO DOMINICANO DE ACREDITACION (ODAC)" },
  { codigo: "5174", seccion: "11112", nombre: "MERCADOS DOMINICANOS DE ABASTO AGROPECUARIO" },
  { codigo: "5175", seccion: "11112", nombre: "CONSEJO NACIONAL DE COMPETITIVIDAD" },
  { codigo: "5176", seccion: "11112", nombre: "CONSEJO NACIONAL DE DISCAPACIDAD (CONADIS)" },
  { codigo: "5177", seccion: "11112", nombre: "CONSEJO NAC. DE INVESTIGACIONES AGROPECUARIAS Y FORESTALES (CONIAF)" },
  { codigo: "5178", seccion: "11112", nombre: "FONDO NACIONAL PARA EL MEDIO AMBIENTE Y RECURSOS NATURALES" },
  { codigo: "5179", seccion: "11112", nombre: "SERVICIO GEOLOGICO NACIONAL" },
  { codigo: "5180", seccion: "11112", nombre: "DIRECCION CENTRAL DEL SERVICIO NACIONAL DE SALUD" },
  { codigo: "5181", seccion: "11112", nombre: "INSTITUTO GEOGRÁFICO NACIONAL JOSÉ JOAQUÍN HUNGRÍA MORELL" },
  { codigo: "5182", seccion: "11112", nombre: "INSTITUTO NACIONAL DE TRÁNSITO Y TRANSPORTE TERRESTRE" },
  { codigo: "5183", seccion: "11112", nombre: "UNIDAD DE ANÁLISIS FINANCIERO (UAF)" },
  { codigo: "5184", seccion: "11112", nombre: "DIRECCIÓN GENERAL DE ALIANZAS PÚBLICO-PRIVADAS" },
  { codigo: "5201", seccion: "11113", nombre: "INSTITUTO DOMINICANO DE SEGUROS SOCIALES" },
  { codigo: "5202", seccion: "11113", nombre: "INSTITUTO DE AUXILIOS Y VIVIENDAS" },
  { codigo: "5205", seccion: "11113", nombre: "SUPERINTENDENCIA DE PENSIONES" },
  { codigo: "5206", seccion: "11113", nombre: "SUPERINTENDENCIA DE SALUD Y RIESGO LABORAL" },
  { codigo: "5207", seccion: "11113", nombre: "CONSEJO NACIONAL DE SEGURIDAD SOCIAL" },
  { codigo: "5208", seccion: "11113", nombre: "SEGURO NACIONAL DE SALUD" },
  { codigo: "5209", seccion: "11113", nombre: "DIRECCIÓN GENERAL DE INFORMACIÓN Y DEFENSA DE LOS AFILIADOS" },
  { codigo: "5210", seccion: "11113", nombre: "INSTITUTO DOMINICANO DE PREVENCIÓN Y PROTECCIÓN DE RIESGOS LABORALES" },
  { codigo: "5211", seccion: "11113", nombre: "TESORERÍA DE LA SEGURIDAD SOCIAL" },
];

const POR_CODIGO = new Map(CAPITULOS.map((c) => [c.codigo, c]));

export function capitulo(codigo: string): Capitulo | null {
  return POR_CODIGO.get(codigo) ?? null;
}

/** Palabras que en español no se capitalizan dentro de un nombre. */
const MENUDAS = new Set([
  "de", "del", "la", "las", "los", "y", "e", "en", "para", "por", "a", "al",
  "con", "sin", "el",
]);

/**
 * Pone un nombre oficial en caja de lectura conservando los acrónimos.
 *
 * Regla: lo que va entre paréntesis se respeta tal cual —ahí es donde el
 * Estado pone las siglas (MICM, INDRHI, CONADIS)—, las palabras menudas van en
 * minúscula y el resto se capitaliza. Las abreviaturas con punto («REP. DOM.»)
 * conservan su forma.
 */
export function titulizar(nombre: string): string {
  return nombre
    .toLocaleLowerCase("es-DO")
    .split(/(\s+)/)
    .map((token, i) => {
      if (/^\s+$/.test(token) || token === "") return token;
      // Siglas entre paréntesis: se devuelven en mayúscula.
      const parentesis = /^\((.+)\)([.,]?)$/.exec(token);
      if (parentesis) {
        return `(${parentesis[1].toLocaleUpperCase("es-DO")})${parentesis[2]}`;
      }
      const limpio = token.replace(/[^\p{L}]/gu, "");
      if (i > 0 && MENUDAS.has(limpio)) return token;
      return token.charAt(0).toLocaleUpperCase("es-DO") + token.slice(1);
    })
    .join("");
}
