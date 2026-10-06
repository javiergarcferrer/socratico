import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { enlace } from "@/lib/grafo";
import { INSTITUCIONES, type Institucion } from "@/lib/instituciones";
import { plano } from "@/lib/raiz";

/**
 * Catálogo de datos abiertos del Estado — los conjuntos públicos de
 * datos.gob.do, con su organización, formatos y grupo temático.
 *
 * Mecánica verificada en docs/INFRAESTRUCTURA.md §5.10: su `/api/` la veta el propio
 * robots, pero la búsqueda HTML `/dataset/?q=*:*&sort=name+asc&page=N` es
 * server-rendered y recorre el catálogo entero. `scripts/build-catalogo.py` la
 * lee con los diez segundos de espera que pide el robots (~55 peticiones) y
 * deja `public/data/catalogo.json`. El rótulo del portal («1199 resultados»)
 * no cambia con la búsqueda y no se usa: el total es el que se contó.
 *
 * Cada conjunto es un nodo del grafo con ficha propia (`/datos/<nombre>`), que
 * enlaza a su página en datos.gob.do, donde están los archivos: la plataforma
 * no los copia. Quién lo publica sale de `institucionDeOrganizacion`.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

export interface Conjunto {
  slug: string;
  titulo: string;
  org: string;
  formatos: string[];
  grupos: string[];
}

export interface Catalogo {
  generado: string;
  fuente: string;
  total: number;
  organizaciones: number;
  conjuntos: Conjunto[];
}

let memo: Promise<Catalogo | null> | null = null;

export function getCatalogo(): Promise<Catalogo | null> {
  memo ??= readFile(join(process.cwd(), "public", "data", "catalogo.json"), "utf8")
    .then((t) => JSON.parse(t) as Catalogo)
    .catch((err) => {
      console.error("[catalogo]", err);
      memo = null;
      return null;
    });
  return memo;
}

/**
 * Los conjuntos que publica una institución del cruce, por cada organización
 * del portal que `institucionDeOrganizacion` ata a ella (hoy, una sola por
 * institución), en el orden del catálogo.
 */
export async function conjuntosDeInstitucion(id: number): Promise<{ org: string; conjuntos: Conjunto[] }[]> {
  const c = await getCatalogo();
  const porOrg = new Map<string, Conjunto[]>();
  for (const x of c?.conjuntos ?? []) {
    if (institucionDeOrganizacion(x.org)?.id !== id) continue;
    porOrg.set(x.org, [...(porOrg.get(x.org) ?? []), x]);
  }
  return [...porOrg].map(([org, conjuntos]) => ({ org, conjuntos }));
}

/** La página del conjunto en datos.gob.do (`enlace.conjuntoOrigen`). */
export function hrefConjunto(slug: string): string {
  return enlace.conjuntoOrigen(slug);
}

/** Un conjunto por su nombre en datos.gob.do, o `null`. */
export async function conjuntoPorSlug(slug: string): Promise<Conjunto | null> {
  const c = await getCatalogo();
  return c?.conjuntos.find((x) => x.slug === slug) ?? null;
}

/**
 * La misma institución con otro nombre en datos.gob.do, comprobada a mano
 * contra el cruce (2026-10-05): un nombre nuevo (la SIV es hoy la SIMV;
 * Hacienda, Hacienda y Economía), la versión larga («…de la República
 * Dominicana») o una abreviatura. Una organización que el cruce no tiene
 * (el CONDEI, la CDEEE, el INVI, la DIGECAC, cuyo parecido con la Dirección
 * de Embellecimiento del cruce no es seguro) no está: un publicador adivinado
 * es peor que ninguno.
 */
const MISMA_INSTITUCION: Record<string, number> = {
  "Superintendencia del Mercado de Valores (SIMV)": 809,
  "Superintendencia de Bancos de la República Dominicana": 639,
  "Ministerio de Medio Ambiente y Recursos Naturales (MMARN)": 260,
  "Fuerza Aérea de República Dominicana (FARD)": 173,
  "Instituto Nacional del Cáncer Rosa Emilia Sánchez Pérez de Tavares (INCART)": 876,
  "Operadora Metropolitana de Servicios de Autobuses (OMSA)": 1414,
  "Gabinete de Políticas Sociales (GPS)": 178,
  "Corporación de Fomento de la Industria Hotelera y Desarrollo del Turismo (CORPHOTELS)": 733,
  "Ayuntamiento Municipal de San Francisco de Macorís": 867,
  "Acuario Nacional de la República Dominicana": 840,
  "Administradora De Riesgos De Salud Para Maestros (ARS SEMMA)": 711,
  "Ministerio de Hacienda y Economía (MHE)": 4,
  "Suprema Corte de Justicia y Consejo del Poder Judicial (PJ)": 900301,
  "Comisión Presidencial de Apoyo al Desarrollo Provincial (CPADP)": 209,
  "Cámara de Cuentas de la República Dominicana (CCRD)": 182,
  "Hospital Engombe": 1117,
  "Hospital Pediátrico Dr. Hugo Mendoza (HPDHM)": 928,
  "Sistema Único de Beneficiarios": 195,
  'Instituto Geográfico Nacional "José Joaquín Hungría Morell" (IGN-JJHM)': 981,
  "Ayuntamiento Municipal de Santiago de los Caballeros": 731,
  // No el 907185, «Ayuntamiento Municipal de Cristóbal», que es otro municipio.
  "Ayuntamiento Municipal de San Cristóbal": 992,
  "Oficina Gubernamental de Tecnologías de la Información y Comunicación": 703,
  "Defensa Civil de la República Dominicana": 904,
  "Ministerio de Cultura de la República Dominicana": 259,
  "Cuerpo Especializado para la Seguridad del Metro (CESMET)": 551,
  "Consejo De Coordinación Zona Especial De Desarrollo Fronterizo (CCDF)": 1020,
  "Hospital Regional Traumatológico Y Quirúrgico Profesor Juan Bosch (HTQPJB)": 945,
  "Ayuntamiento Municipal de San Pedro de Macorís": 682,
  "Hospital Central de las Fuerzas Armadas": 157,
  // La maternidad de Santo Domingo, no el 1007 (el hospital general de Higüey).
  "Hospital Maternidad Nuestra Señora de la Altagracia": 1139,
  "Hospital General Regional Dr. Marcelino Vélez Santana (HMVS)": 881,
  "Contraloría General De La República Dominicana": 139,
  "Comedores Económicos del Estado Dominicano (CEED)": 200,
  "Instituto de Seguridad Social de las Fuerzas Armadas (ISSFFAA)": 156,
  "Caja de Ahorros para Obreros & Monte de Piedad": 997,
  "Centro de Gastroenterología Dr. Luis E Aybar": 989,
  "Comisión Presidencial para la Modernización y Seguridad Portuaria (CPP)": 859,
  "Programa de Medicamentos Esenciales/Central de Apoyo Logístico (PROMESE/CAL)": 582,
  "Dirección General de Aduanas (DGA)": 223,
  "Cámara de Diputados de la República Dominicana (CDRD)": 900102,
  "Senado de la República Dominicana": 900101,
  "Tesorería Nacional de la República Dominicana": 222,
  "Unidad Ejecutora ECO5RD (ECO5RD)": 1387,
  "Dirección General de Dragas, Presas y Balizamiento": 183,
  "Ayuntamiento Municipal de Santo Domingo Norte": 614,
};

const llano = (x: string) => plano(x).trim();
let indiceOrganizaciones: { porNombre: Map<string, Institucion[]>; porSiglas: Map<string, Institucion[]>; porId: Map<number, Institucion> } | null = null;

/**
 * La institución del cruce que publica un conjunto, por el nombre que
 * datos.gob.do le da a su organización: el mismo nombre (sin tildes,
 * mayúsculas ni signos), entero o sin las siglas que lo acompañan («… (ONE)»,
 * «… | CORAAMOCA», «… MIVHED»); las siglas, si una sola institución las
 * lleva; o `MISMA_INSTITUCION`. Un nombre o unas siglas que llevan dos
 * instituciones no atan ninguna. `null` si nada de eso: el conjunto conserva
 * el nombre de su organización (`do:organizacionPublicadora`) sin atarse.
 */
export function institucionDeOrganizacion(org: string): Institucion | null {
  if (!indiceOrganizaciones) {
    const agrupar = (clave: (i: Institucion) => string | null) => {
      const m = new Map<string, Institucion[]>();
      for (const i of INSTITUCIONES) {
        const k = clave(i);
        if (k) m.set(k, [...(m.get(k) ?? []), i]);
      }
      return m;
    };
    indiceOrganizaciones = {
      porNombre: agrupar((i) => llano(i.nombre)),
      porSiglas: agrupar((i) => (i.acronimo ? llano(i.acronimo) : null)),
      porId: new Map(INSTITUCIONES.map((i) => [i.id, i])),
    };
  }
  const { porNombre, porSiglas, porId } = indiceOrganizaciones;
  const fija = MISMA_INSTITUCION[org.trim()];
  if (fija != null) return porId.get(fija) ?? null;
  const m = /^(.*?)\s*[(|]\s*([^)]+?)\s*\)?\s*$/.exec(org) ?? /^(.*?)\s+([A-ZÁÉÍÓÚÑ0-9-]{2,})$/.exec(org);
  const [nombre, siglas] = m ? [m[1], m[2]] : [org, null];
  for (const candidatas of [porNombre.get(llano(org)), porNombre.get(llano(nombre)), siglas ? porSiglas.get(llano(siglas)) : undefined]) {
    if (candidatas?.length === 1) return candidatas[0];
    if (candidatas && candidatas.length > 1) return null;
  }
  return null;
}
