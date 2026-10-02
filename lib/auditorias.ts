import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { agujas, contieneTodas, plano } from "@/lib/raiz";
import { institucionPorId } from "@/lib/instituciones";

/**
 * Auditorías y declaraciones juradas — lo que publican los dos órganos de
 * control del Estado: la **Contraloría General** (control interno, dentro del
 * Ejecutivo) y la **Cámara de Cuentas** (control externo, rinde al Congreso).
 *
 * Mecánica verificada en docs/INFRAESTRUCTURA.md §5.10
 * (2026-09-24). `scripts/build-auditorias.py` lee, con robots primero y a lo
 * sumo 8 peticiones por host, y escribe `public/data/auditorias.json`:
 *  · Contraloría (WordPress): las 38 fichas de `/informes-de-auditorias/`
 *    —siglas y período, fecha de **subida**, PDF— y los resultados
 *    trimestrales del Índice de Control Interno (ICI), un PDF por trimestre.
 *  · Cámara de Cuentas (Joomla + K2): los 10 informes más recientes de su RSS
 *    (el listado pagina de 3 en 3, unas 72 páginas; se declara como muestra),
 *    y el índice de las listas de declaración jurada de Phoca Download: a
 *    tiempo, tarde (extemporáneas) y omisos (último año, último mes).
 *
 * **Privacidad.** Las listas nombran funcionarios. Ni la instantánea ni esta
 * capa guardan un nombre de persona: solo el título de cada lista, su grupo
 * institucional, su fecha de corte y el enlace. Las listas son PDF y este
 * entorno no las cuenta (`contado: false`), así que `total`, `porEstado` y
 * `porInstitucion` llegan en `null`; la interfaz lo dice en vez de inventar.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

export type FuenteAuditoria = "contraloria" | "camara";
export type EstadoDeclaracion = "a_tiempo" | "tarde" | "omiso";

export interface InformeContraloria {
  titulo: string;
  tipo: "informe" | "replica";
  /** Lo que queda del título sin «Informe General» ni el período: siglas o nombre. */
  institucion: string | null;
  periodo: string | null;
  /** Fecha de subida al sitio, no del informe. */
  fecha: string | null;
  /** Unidad de compra de la ficha, solo con coincidencia exacta. */
  uc: number | null;
  url: string;
}

export interface TrimestreIci {
  titulo: string;
  anio: number;
  trimestre: number | null;
  fecha: string | null;
  url: string;
}

export interface InformeCamara {
  titulo: string;
  /** Fecha de publicación en el RSS. */
  fecha: string | null;
  institucion: string | null;
  siglas: string | null;
  periodo: string | null;
  uc: number | null;
  /** La ficha del informe en el sitio de la Cámara (lleva al PDF). */
  url: string;
}

export interface ListaDeclaracion {
  /** Título de la lista tal como lo publica la Cámara. Nunca un nombre de persona. */
  lista: string;
  estado: EstadoDeclaracion;
  /** Fecha de corte que dice el título (`AAAA-MM-DD`), si la dice. */
  periodo: string | null;
  publicado: string | null;
  /** Grupo institucional de una lista de omisos (Senado, UASD…). */
  grupo: string | null;
  uc: number | null;
  url: string;
  formato: "pdf" | null;
  /** Sin contar mientras las listas sean PDF: siempre `null` en este corte. */
  total: number | null;
  porEstado: Partial<Record<EstadoDeclaracion, number>> | null;
  porInstitucion: [string, number, number, number][] | null;
}

export interface Auditorias {
  generado: string;
  contraloria: {
    informes: InformeContraloria[];
    ici: TrimestreIci[] | null;
    pagina: string;
    paginaIci: string;
  };
  camara: {
    informes: InformeCamara[];
    listado: string;
    paginasListado: number | null;
    porPagina: number | null;
    declaraciones: ListaDeclaracion[];
    categorias: {
      a_tiempo?: { url: string; listas: number };
      tarde?: { url: string; listas: number };
      omiso?: {
        url: string;
        anios: string[];
        leido: string | null;
        listas: number;
        meses?: { mes: string; listas: number }[];
      };
    };
    contado: boolean;
    notaConteo: string;
  };
  fuentes: Record<string, Record<string, string>>;
}

let memo: Promise<Auditorias | null> | null = null;

export function getAuditorias(): Promise<Auditorias | null> {
  memo ??= readFile(join(process.cwd(), "public", "data", "auditorias.json"), "utf8")
    .then((t) => {
      const d = JSON.parse(t) as Auditorias;
      return d?.contraloria?.informes?.length && Array.isArray(d?.camara?.declaraciones) ? d : null;
    })
    .catch((err) => {
      console.error("[auditorias]", err);
      memo = null;
      return null;
    });
  return memo;
}

/** Un informe de cualquiera de los dos órganos, en la forma que lista la página. */
export interface InformeAuditoria {
  fuente: FuenteAuditoria;
  titulo: string;
  institucion: string | null;
  periodo: string | null;
  fecha: string | null;
  uc: number | null;
  url: string;
  replica: boolean;
}

/** Los informes de ambos órganos, del más reciente al más antiguo. */
export function informesDe(d: Auditorias): InformeAuditoria[] {
  const cgr: InformeAuditoria[] = d.contraloria.informes.map((i) => ({
    fuente: "contraloria",
    titulo: i.titulo,
    institucion: i.institucion,
    periodo: i.periodo,
    fecha: i.fecha,
    uc: i.uc,
    url: i.url,
    replica: i.tipo === "replica",
  }));
  const ccrd: InformeAuditoria[] = d.camara.informes.map((i) => ({
    fuente: "camara",
    titulo: i.titulo,
    institucion: i.institucion,
    periodo: i.periodo,
    fecha: i.fecha,
    uc: i.uc,
    url: i.url,
    replica: false,
  }));
  return [...cgr, ...ccrd].sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
}

/**
 * Filtra por órgano y por todas las palabras —en cualquier orden, por raíz—
 * en título, institución, período y el nombre completo de la institución
 * auditada: 31 de los 48 informes de la Contraloría traen solo las siglas, y
 * «turismo» tiene que encontrar al MITUR.
 */
export function filtrarInformes(
  informes: InformeAuditoria[],
  { q, fuente }: { q?: string; fuente?: FuenteAuditoria },
): InformeAuditoria[] {
  const aguja = q?.trim() ? agujas(q) : null;
  return informes.filter((i) => {
    if (fuente && i.fuente !== fuente) return false;
    if (!aguja) return true;
    const completa = i.uc != null ? institucionPorId(i.uc) : null;
    const h = plano(
      `${i.titulo} ${i.institucion ?? ""} ${i.periodo ?? ""} ${completa ? `${completa.nombre} ${completa.acronimo}` : ""}`,
    );
    return contieneTodas(h, aguja);
  });
}
