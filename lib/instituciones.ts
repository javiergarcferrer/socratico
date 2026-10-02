/**
 * La institución — el nodo que une las verticales.
 *
 * El mismo ministerio es una unidad de compra en la DGCP, un capítulo en el
 * SIGEF y en el Clasificador Institucional de DIGEPRES, un código en la nómina
 * y una etiqueta en la Consultoría Jurídica. `public/data/instituciones.json`
 * (generado por `scripts/build-instituciones.py`) es el cruce versionado entre
 * todos: un archivo, no una base de datos.
 *
 * El universo son dos catálogos del Estado. Cada **unidad de compra** de la
 * DGCP —la unidad más fina con código estable— es una institución, y su
 * presupuesto es el del capítulo al que la DGCP la adscribe. Cada capítulo del
 * **Clasificador Institucional** que no tiene unidad de compra —el Congreso,
 * el Poder Judicial, el Banco Central, la mayoría de las juntas de distrito—
 * es una institución más, con id `900000 + capítulo` y `dgcp: false`: su ficha
 * no consulta la DGCP, porque no hay nada suyo que consultar. El clasificador
 * da a todas su sector (`SECTORES`). Mecánica verificada en docs/INFRAESTRUCTURA.md §5.7
 * (DIGEPRES, 2026-09-29) y en la cabecera del script.
 *
 * Este módulo solo lee el cruce y compone; cada dato sigue viniendo de su
 * capa (`lib/dgcp.ts`, `lib/fiscal.ts`, `lib/nomina-server.ts`,
 * `lib/normativa.ts`). Ver docs/INFRAESTRUCTURA.md §5.7.
 */

import datos from "@/public/data/instituciones.json";
import { unstable_cache } from "next/cache";
import { dgcpFetch, normalize, type Contrato, type Proceso } from "@/lib/dgcp";
import { enlace } from "@/lib/grafo";
import { agujas, contieneTodas, plano } from "@/lib/raiz";

/**
 * El sector del Estado, tal como lo ordena el Clasificador Institucional:
 * sector, subsector, área, subárea y sección, y en la Administración General
 * la columna de poderes. `fideicomiso` es la única clave que no sale del
 * clasificador —no los trae—: la DGCP los registra con la serie 62.
 */
export type Sector =
  | "ejecutivo"
  | "poderes"
  | "descentralizada"
  | "seguridad-social"
  | "local"
  | "empresa"
  | "financiera"
  | "fideicomiso";

/** Lo que el Gobierno central presupuesta transferirle en un año. */
export interface Transferencia {
  anio: number;
  /** En pesos. */
  monto: number;
  /** El cuadro de DIGEPRES del que sale: clave de `FUENTES_DEL_CRUCE.transferencias`. */
  fuente: string;
}

export interface Institucion {
  /** Código de unidad de compra de la DGCP; `900000 + capítulo` si no tiene. */
  id: number;
  nombre: string;
  acronimo: string;
  /** «Institución», «Gobierno local», «Hospital»… (tipo de la DGCP, o del clasificador si no tiene unidad de compra). */
  tipo: string;
  /**
   * Capítulo presupuestario con ejecución en la instantánea del SIGEF: el que
   * declara la DGCP para su unidad de compra, o el del clasificador para las
   * que no tienen. `null` si el SIGEF no lo trae (ayuntamientos, empresas…).
   */
  capitulo: string | null;
  /** Código en `public/data/nomina.json`, si su nómina está en la foto. */
  nomina: string | null;
  /** Etiquetas de la Consultoría Jurídica que la nombran. */
  consultoria: string[];
  /** Capítulo del Clasificador Institucional de DIGEPRES; `null` si el vigente no lo trae. */
  clasificador: string | null;
  sector: Sector;
  /** ¿Tiene unidad de compra propia en el catálogo de la DGCP? */
  dgcp: boolean;
  /** Transferencia del Gobierno central en la Ley de Presupuesto vigente (solo si el capítulo es suyo y de nadie más). */
  transferencia?: Transferencia;
  /** La del proyecto de presupuesto del año siguiente, si ya se depositó. */
  transferenciaProyecto?: Transferencia;
}

/** Un cuadro «Clasificación institucional según entidad receptora» de DIGEPRES. */
export interface CuadroTransferencias {
  tipo: "ley" | "proyecto";
  anio: number;
  /** El título del cuadro tal cual (el de la ley 2026 conserva «Proyecto de Ley»). */
  titulo: string;
  /** La página de DIGEPRES que lo publica. */
  pagina: string;
  /** El XLSX. */
  url: string;
  /** Todo lo que el Gobierno central transfiere en el cuadro. */
  total: number;
  /** Lo que va a gobiernos locales, con la bolsa sin repartir. */
  totalLocales: number;
  /** La bolsa «AYUNTAMIENTOS» (7199), sin repartir por municipio. */
  sinRepartir: number;
}

export interface FuentesDelCruce {
  dgcp: { url: string; consultado: string; unidades: number };
  clasificador: {
    url: string;
    titulo: string;
    /** «Actualizado al» del documento (ISO). */
    actualizado: string;
    consultado: string;
    capitulos: number;
    locales: number;
  };
  transferencias: Record<string, CuadroTransferencias>;
}

const CRUCE = datos as unknown as { generado: string; fuentes: FuentesDelCruce; instituciones: Institucion[] };

export const INSTITUCIONES: Institucion[] = CRUCE.instituciones;

/** De dónde sale el universo: el catálogo de la DGCP, el clasificador y los cuadros de transferencias. */
export const FUENTES_DEL_CRUCE: FuentesDelCruce = CRUCE.fuentes;

/**
 * Los sectores en el orden del clasificador. `nombre` es el del filtro y el de
 * la ficha (colectivo); `que`, la línea que dice qué hay dentro.
 */
export const SECTORES: readonly { clave: Sector; nombre: string; que: string }[] = [
  {
    clave: "ejecutivo",
    nombre: "Poder Ejecutivo",
    que: "La Presidencia, los ministerios, la Procuraduría y lo que depende de ellos.",
  },
  {
    // El nombre va en un filtro de altura fija y sin salto de línea: «Legislativo,
    // Judicial y órganos constitucionales (9)» no cabía a 390 px. Va justo
    // después de «Poder Ejecutivo», y por eso «otros».
    clave: "poderes",
    nombre: "Otros poderes y órganos constitucionales",
    que: "El Senado, la Cámara de Diputados, el Poder Judicial, la JCE, la Cámara de Cuentas, el Tribunal Constitucional, el Defensor del Pueblo, el TSE y la Defensa Pública.",
  },
  {
    clave: "descentralizada",
    nombre: "Descentralizadas y autónomas",
    que: "Organismos no financieros con patrimonio propio: la UASD, la DGII, Aduanas, el INDRHI, el Servicio Nacional de Salud y sus hospitales…",
  },
  {
    clave: "seguridad-social",
    nombre: "Seguridad social",
    que: "El Consejo Nacional de Seguridad Social, la Tesorería, SENASA, las superintendencias de pensiones y de salud…",
  },
  {
    clave: "local",
    nombre: "Gobiernos locales",
    que: "El Ayuntamiento del Distrito Nacional, los ayuntamientos de cada municipio y las juntas de distrito municipal.",
  },
  {
    clave: "empresa",
    nombre: "Empresas públicas",
    que: "No financieras: acueductos, distribuidoras de electricidad, la Lotería Nacional, la OMSA…",
  },
  {
    clave: "financiera",
    nombre: "Instituciones financieras",
    que: "El Banco Central, Banreservas, el Banco Agrícola y las superintendencias de bancos, de seguros y del mercado de valores.",
  },
  {
    clave: "fideicomiso",
    nombre: "Fideicomisos",
    que: "No están en el Clasificador Institucional: la DGCP los registra con la serie 62.",
  },
];

export function esSector(v: string | null | undefined): v is Sector {
  return SECTORES.some((s) => s.clave === v);
}

export function sectorDe(clave: Sector): (typeof SECTORES)[number] {
  return SECTORES.find((s) => s.clave === clave)!;
}

/** El directorio con lo que el lector puso: búsqueda, sector y página. */
export function hrefDirectorio({ q, sector, pagina }: { q?: string; sector?: Sector | null; pagina?: number }): string {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (sector) p.set("sector", sector);
  if (pagina && pagina > 1) p.set("pagina", String(pagina));
  const s = p.toString();
  return s ? `/instituciones?${s}` : "/instituciones";
}

/** Cuántas instituciones hay en cada sector (de la lista dada o del cruce entero). */
export function contarPorSector(lista: readonly Institucion[] = INSTITUCIONES): Record<Sector, number> {
  const cuenta = Object.fromEntries(SECTORES.map((s) => [s.clave, 0])) as Record<Sector, number>;
  for (const i of lista) cuenta[i.sector] += 1;
  return cuenta;
}

const POR_ID = new Map(INSTITUCIONES.map((i) => [i.id, i]));

/** Tramo legible de la URL: `/instituciones/5-mopc`. El número manda. */
export function slugInstitucion(i: Institucion): string {
  const base = normalize(i.acronimo || i.nombre)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base ? `${i.id}-${base}` : String(i.id);
}

export function hrefInstitucion(i: Institucion): string {
  return enlace.institucion(i.id, i.acronimo || i.nombre);
}

/** La institución de un tramo de URL (`5-mopc` o `5`), o `null`. */
export function institucionDeSlug(slug: string): Institucion | null {
  const m = /^(\d{1,6})(?:-|$)/.exec(slug);
  return m ? (POR_ID.get(Number(m[1])) ?? null) : null;
}

export function institucionPorId(id: number | string): Institucion | null {
  return POR_ID.get(Number(id)) ?? null;
}

/**
 * Las unidades de compra adscritas a un capítulo presupuestario. Solo las de
 * la DGCP: la institución del clasificador que es el capítulo entero (el
 * Senado, el Poder Judicial) no es una unidad de compra, y quien llama lo dice.
 */
export function institucionesDelCapitulo(capitulo: string): Institucion[] {
  return INSTITUCIONES.filter((i) => i.dgcp && i.capitulo === capitulo);
}

/** La ficha que el Clasificador da a un capítulo sin unidad de compra (el Senado es 0101), si la hay. */
export function fichaDelCapitulo(capitulo: string): Institucion | null {
  return INSTITUCIONES.find((i) => !i.dgcp && i.capitulo === capitulo) ?? null;
}

const VACIAS = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "para", "a", "al", "en", "rep", "dom"]);

/** Las palabras con contenido de un nombre, sin siglas entre paréntesis y sin plural. */
function palabrasDeNombre(v: string): Set<string> {
  return new Set(
    normalize(v.replace(/\([^)]*\)/g, " "))
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1 && !VACIAS.has(w))
      .map((w) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w)),
  );
}

/**
 * La unidad de compra que **encabeza** un capítulo: la que lleva su nombre
 * —el Ministerio de Educación en el capítulo «Ministerio de Educación»—, no
 * el INABIE ni la ARS de los maestros que la DGCP adscribe al mismo capítulo.
 *
 * El cruce no trae ese dato, así que se deduce del nombre: la unidad cuyo
 * nombre comparte con el del capítulo al menos la mitad de sus palabras con
 * contenido, contadas sobre las de los dos (así «Dirección de Proyectos
 * Estratégicos de la Presidencia» no encabeza «Presidencia de la República»
 * por contener sus dos palabras). Si ninguna llega, no hay cabeza —el
 * capítulo «Administración de obligaciones del Tesoro» no es la DGII aunque
 * sea su única unidad— y quien llama no enlaza el capítulo a ninguna ficha:
 * un enlace adivinado es peor que ninguno.
 */
export function cabezaDelCapitulo(nombreCapitulo: string, unidades: Institucion[]): Institucion | null {
  const buscadas = palabrasDeNombre(nombreCapitulo);
  if (buscadas.size === 0) return null;
  let mejor: { i: Institucion; puntos: number } | null = null;
  for (const i of unidades) {
    const suyas = palabrasDeNombre(i.nombre);
    const comunes = [...buscadas].filter((w) => suyas.has(w)).length;
    const puntos = comunes / (buscadas.size + suyas.size - comunes);
    // A igualdad, la de tipo «Institución» y luego la de nombre más corto.
    const gana =
      !mejor ||
      puntos > mejor.puntos ||
      (puntos === mejor.puntos &&
        (Number(i.tipo === "Institución") - Number(mejor.i.tipo === "Institución") ||
          mejor.i.nombre.length - i.nombre.length) > 0);
    if (gana) mejor = { i, puntos };
  }
  return mejor && mejor.puntos >= 0.5 ? mejor.i : null;
}

/** La institución cuya nómina lleva ese código, si está en el cruce. */
export function institucionDeNomina(codigo: string): Institucion | null {
  return INSTITUCIONES.find((i) => i.nomina === codigo) ?? null;
}

/**
 * Coincidencia por nombre o acrónimo con la regla de `lib/raiz.ts`: todas las
 * palabras, en cualquier orden, sin tildes y por raíz («ministerio salud»,
 * «hospitales»). Los ministerios y las instituciones centrales van antes que
 * hospitales y ayuntamientos, que son muchos y rara vez lo que se busca por
 * un nombre corto.
 */
export function buscarInstituciones(q: string, limite = 30): Institucion[] {
  const needle = normalize(q.trim());
  if (!needle) return [];
  const a = agujas(q);
  const peso = (i: Institucion) =>
    (normalize(i.acronimo) === needle ? 0 : 10) +
    (i.tipo === "Institución" && i.sector !== "local" ? 0 : i.sector === "local" ? 2 : 1);
  return INSTITUCIONES.filter((i) => contieneTodas(plano(`${i.nombre} ${i.acronimo}`), a))
    .sort((a, b) => peso(a) - peso(b) || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, limite);
}

/**
 * ¿Se la puede reconocer por su nombre en un texto libre? Hospitales y
 * gobiernos locales no: se repiten entre sí («El Limón» son tres juntas de
 * distrito), y un enlace adivinado es peor que ninguno. El sector cubre al
 * gobierno local que la DGCP rotula «Institución» y a los del clasificador.
 */
export function seReconocePorNombre(i: Institucion): boolean {
  return i.tipo !== "Hospital" && i.tipo !== "Gobierno local" && i.sector !== "local";
}

/** Las siglas de quien ejecuta, para buscar por ellas donde la fuente solo trae el nombre. */
export function siglasDe(id: number | null | undefined): string {
  return id == null ? "" : (POR_ID.get(id)?.acronimo ?? "");
}

/**
 * Instituciones nombradas **por su nombre completo** en un texto oficial —el
 * enunciado de un proyecto de ley—. Solo nombres largos (de 18 letras o más)
 * y sin hospitales ni ayuntamientos, que se repiten entre sí: un puente
 * adivinado es peor que ninguno, así que «Ministerio de Salud Pública y
 * Asistencia Social» entra y «Salud» no.
 */
export function institucionesNombradasEn(texto: string, limite = 5): Institucion[] {
  const plano = (v: string) => ` ${normalize(v).replace(/[^a-z0-9]+/g, " ").trim()} `;
  const heno = plano(texto);
  return INSTITUCIONES.filter((i) => {
    if (!seReconocePorNombre(i)) return false;
    const aguja = plano(i.nombre.replace(/\([^)]*\)/g, " "));
    return aguja.trim().length >= 18 && heno.includes(aguja);
  }).slice(0, limite);
}

/* --------------------------------------------------------------- compras */

export interface ProveedorDeInstitucion {
  rpe: string;
  nombre: string;
  n: number;
  monto: number;
}

export interface ComprasDeInstitucion {
  /** Contratos en todo el registro (censo del origen). */
  totalContratos: number;
  /** Contratos leídos: los más recientes, hasta 1.000. */
  leidos: number;
  desde: string | null;
  hasta: string | null;
  /** Monto vigente en pesos de los contratos leídos. */
  montoDop: number;
  proveedores: ProveedorDeInstitucion[];
  /** Cuota del primer proveedor sobre el monto leído (0–1). */
  concentracion: number | null;
  recientes: Contrato[];
  senales: SenalesDeCompra | null;
}

/**
 * Señales de los procesos de los últimos doce meses, contadas sobre lo que el
 * origen publica. No son acusaciones: son las preguntas que un ciudadano
 * haría primero. La ley permite la excepción; lo que se mira es cuánta.
 */
export interface SenalesDeCompra {
  procesos: number;
  /** Censo del año que declara el origen. */
  universo: number;
  /** El censo del origen superó lo leído (más de 1.000 en el año). */
  truncado: boolean;
  excepcion: number;
  emergencia: number;
  proveedorUnico: number;
  noPlaneada: number;
  desiertos: number;
  abiertos: number;
}

const ESTADOS_VIGENTES = new Set(["Activo", "Modificado", "Cerrado"]);
const ABIERTOS = /publicado|sobres/i;

function isoDia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * El resumen de compras de una institución, cacheado una hora **ya calculado**.
 * Las respuestas crudas de un ministerio grande pasan de 2 MB (MINERD:
 * 1.000 procesos del año ≈ 2,2 MB) y el caché de datos de Next no guarda
 * nada por encima de eso: sin este envoltorio, cada visita volvía a pedir a
 * la DGCP. El resumen pesa unos kilobytes. Un fallo no se cachea.
 */
const comprasCacheadas = unstable_cache(
  async (id: number) => {
    const r = await calcularCompras(id);
    if (!r) throw new Error("la DGCP no respondió");
    return r;
  },
  ["compras-de-institucion"],
  { revalidate: 3600 },
);

export async function getComprasDeInstitucion(id: number): Promise<ComprasDeInstitucion | null> {
  try {
    return await comprasCacheadas(id);
  } catch (err) {
    console.error(`[instituciones] compras ${id}: ${String(err)}`);
    return null;
  }
}

async function calcularCompras(id: number): Promise<ComprasDeInstitucion | null> {
  const hoy = new Date();
  const haceUnAnio = new Date(hoy);
  haceUnAnio.setFullYear(hoy.getFullYear() - 1);

  const [contratos, procesos] = await Promise.all([
    dgcpFetch<Contrato>("/contratos", { unidad_compra: id, page: 1, limit: 1000 }, 0).catch(
      () => null,
    ),
    dgcpFetch<Proceso>(
      "/procesos",
      { unidad_compra: id, startdate: isoDia(haceUnAnio), enddate: isoDia(hoy), limit: 1000 },
      0,
    ).catch(() => null),
  ]);
  // Las dos lecturas o ninguna: con una sola, la ficha diría «0 contratos»
  // de un ministerio cuya consulta de contratos simplemente falló, y ese
  // resumen quedaría cacheado una hora.
  if (!contratos || !procesos) return null;

  const lista = contratos?.payload.content ?? [];
  const porProveedor = new Map<string, ProveedorDeInstitucion>();
  let montoDop = 0;
  let desde: string | null = null;
  let hasta: string | null = null;
  for (const c of lista) {
    const f = (c.fecha_adjudicacion ?? "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(f)) {
      if (!desde || f < desde) desde = f;
      if (!hasta || f > hasta) hasta = f;
    }
    if (!ESTADOS_VIGENTES.has(c.estado_contrato) || c.divisa !== "DOP") continue;
    const monto = c.valor_contratado || 0;
    if (monto <= 0) continue;
    montoDop += monto;
    const clave = c.rpe || c.razon_social;
    const p = porProveedor.get(clave) ?? { rpe: c.rpe, nombre: c.razon_social, n: 0, monto: 0 };
    p.n += 1;
    p.monto += monto;
    porProveedor.set(clave, p);
  }
  const proveedores = [...porProveedor.values()].sort((a, b) => b.monto - a.monto);

  let senales: SenalesDeCompra | null = null;
  if (procesos) {
    const ps = procesos.payload.content;
    const cuenta = (f: (p: Proceso) => boolean) => ps.filter(f).length;
    senales = {
      procesos: ps.length,
      universo: procesos.totalResults ?? ps.length,
      truncado: (procesos.totalResults ?? ps.length) > ps.length,
      excepcion: cuenta((p) => /excepci/i.test(p.modalidad)),
      emergencia: cuenta((p) => /emergencia|urgencia/i.test(p.tipo_excepcion ?? "")),
      proveedorUnico: cuenta((p) => /proveedor .nico|exclusividad/i.test(p.tipo_excepcion ?? "")),
      noPlaneada: cuenta((p) => p.adquisicion_planeada === "No"),
      desiertos: cuenta((p) => /desierto/i.test(p.estado_proceso)),
      abiertos: cuenta((p) => ABIERTOS.test(p.estado_proceso)),
    };
  }

  return {
    totalContratos: contratos?.totalResults ?? lista.length,
    leidos: lista.length,
    desde,
    hasta,
    montoDop,
    proveedores: proveedores.slice(0, 8),
    concentracion: montoDop > 0 && proveedores[0] ? proveedores[0].monto / montoDop : null,
    recientes: lista.slice(0, 8),
    senales,
  };
}
