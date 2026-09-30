import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { agujas, contieneTodas, plano } from "@/lib/raiz";
import { siglasDe } from "@/lib/instituciones";
import { provinciaDeTexto } from "@/lib/provincias";
import type { Tono } from "./estados";

/**
 * Obra pública — la inversión del Estado proyecto a proyecto (MapaInversiones).
 *
 * Mecánica verificada en docs/AUDITORIA.md §A.4 (y su verificación de campo del
 * 2026-09-23): quince CSV abiertos, sin clave, en
 * `mapainversiones.gob.do/opendata/`. Son ~21 MB entre los cuatro que usamos,
 * así que **no se leen por request**: `scripts/build-obras.py` los consolida en
 * `public/data/obras.json` (el listado) y `public/data/obras-detalle.json`
 * (contratos y procesos por obra), y este módulo solo lee esas dos
 * instantáneas. La fecha de corte la declara la fuente (`FechaCorteFuente`) y
 * la interfaz la dice siempre.
 *
 * Módulo de servidor (`node:fs`): no se importa desde un componente de cliente.
 *
 * Lo que la interfaz no puede callar:
 *  · `AvanceFisico` y `AvanceFinanciero` traen el mismo número en los 3,611
 *    proyectos de la fuente. Se muestra uno, «avance declarado», y se dice por qué.
 *  · La entidad ejecutora se ata a la unidad de compra de la DGCP por nombre
 *    (más una tabla curada en el script). Lo que no casa queda sin institución.
 *  · Los contratos y procesos de cada obra van recortados a los 12 de mayor
 *    monto; los totales (`nContratos`, `montoContratado`) son de todos.
 */

export interface Obra {
  snip: string;
  /** Id del proyecto en MapaInversiones: su ficha es `/projectprofile/{id}`. */
  id: string;
  nombre: string;
  estado: string;
  /** Valor del proyecto en pesos. */
  valor: number;
  /** Avance declarado, 0–100. La fuente da el mismo valor como físico y financiero. */
  avance: number;
  sector: string;
  entidad: string;
  /** Unidad de compra de la DGCP de la entidad ejecutora, si casa. */
  uc: number | null;
  inicio: string | null;
  fin: string | null;
  /** Alcance nacional, sin provincia. */
  nacional: boolean;
  provincias: string[];
  nContratos: number;
  /** Suma de los contratos vigentes (activos, cerrados o modificados), en pesos. */
  montoContratado: number;
  proveedores: number;
  nProcesos: number;
}

export interface ContratoDeObra {
  codigo: string;
  proceso: string;
  descripcion: string;
  estado: string;
  monto: number;
  rpe: string;
  proveedor: string;
}

export interface ProcesoDeObra {
  codigo: string;
  descripcion: string;
  estado: string;
  modalidad: string;
  monto: number;
}

interface Instantanea {
  generado: string;
  corte: string;
  fuente: string;
  proyectos: Obra[];
  /** Código de proceso DGCP → SNIP de las obras a las que pertenece. */
  procesos: Record<string, string[]>;
}

interface Detalle {
  corte: string;
  obras: Record<string, { contratos: ContratoDeObra[]; procesos: ProcesoDeObra[] }>;
}

export const FUENTE_OBRAS = "https://mapainversiones.gob.do/DatosAbiertos";

export function urlFichaMapaInversiones(o: Obra): string {
  return `https://mapainversiones.gob.do/projectprofile/${encodeURIComponent(o.id)}`;
}

/* La instantánea solo cambia con un despliegue: se lee una vez por instancia. */
let listado: Promise<Instantanea | null> | null = null;
let detalle: Promise<Detalle | null> | null = null;

/*
  Cada ruta se escribe entera, sin variable: el trazado de archivos de Next
  lee la expresión de `readFile`, y con el nombre en una variable metía en la
  función de cada página que importa esto `public/data` entero —el índice
  del buscador incluido, ~100 MB que no usa—.
*/
async function leer<T>(nombre: string, texto: Promise<string>): Promise<T | null> {
  try {
    return JSON.parse(await texto) as T;
  } catch (err) {
    console.error(`[obras] ${nombre}:`, err);
    return null;
  }
}

export function getObras(): Promise<Instantanea | null> {
  listado ??= leer<Instantanea>("obras.json", readFile(join(process.cwd(), "public", "data", "obras.json"), "utf8")).then((d) => {
    if (!d) listado = null; // un fallo no se queda pegado en la instancia
    return d;
  });
  return listado;
}

async function getDetalle(): Promise<Detalle | null> {
  detalle ??= leer<Detalle>(
    "obras-detalle.json",
    readFile(join(process.cwd(), "public", "data", "obras-detalle.json"), "utf8"),
  ).then((d) => {
    if (!d) detalle = null;
    return d;
  });
  return detalle;
}

export async function getObra(snip: string): Promise<{
  obra: Obra;
  corte: string;
  generado: string;
  contratos: ContratoDeObra[];
  procesos: ProcesoDeObra[];
} | null> {
  const [datos, det] = await Promise.all([getObras(), getDetalle()]);
  const obra = datos?.proyectos.find((o) => o.snip === snip);
  if (!datos || !obra) return null;
  const d = det?.obras[snip];
  return {
    obra,
    corte: datos.corte,
    generado: datos.generado,
    contratos: d?.contratos ?? [],
    procesos: d?.procesos ?? [],
  };
}

/**
 * Las obras a las que pertenece un proceso de compra, con **quién lo dice**: el
 * SNIP que trae la DGCP en el proceso, el índice de MapaInversiones, o ambos.
 * Pueden no coincidir —se ha visto un proceso con un SNIP en la DGCP y otro en
 * MapaInversiones—, y entonces se muestran los dos con su origen.
 */
export async function obrasDeProceso(
  codigo: string,
  snipDgcp?: string | null,
): Promise<{ obra: Obra; segun: ("DGCP" | "MapaInversiones")[] }[]> {
  const datos = await getObras();
  if (!datos) return [];
  const mapa = new Set(datos.procesos[codigo] ?? []);
  const limpio = (snipDgcp ?? "").trim();
  const dgcp = /^\d+$/.test(limpio) ? limpio : null;
  return datos.proyectos
    .filter((o) => mapa.has(o.snip) || o.snip === dgcp)
    .map((obra) => ({
      obra,
      segun: [
        ...(obra.snip === dgcp ? (["DGCP"] as const) : []),
        ...(mapa.has(obra.snip) ? (["MapaInversiones"] as const) : []),
      ],
    }));
}

export async function obrasDeInstitucion(uc: number): Promise<{ obras: Obra[]; corte: string } | null> {
  const datos = await getObras();
  if (!datos) return null;
  return { obras: datos.proyectos.filter((o) => o.uc === uc), corte: datos.corte };
}

/* ------------------------------------------------------------- vocabulario */

/** Los cuatro estados de la fuente, traducidos a los oficios de `lib/estados`. */
export function tonoDeObra(estado: string): Tono {
  return /paraliz|reprogram/i.test(estado) ? "aviso" : "contexto";
}

export const ESTADOS_OBRA = ["En ejecución", "Paralizado", "En reevaluación", "Por reprogramar"] as const;

/**
 * El slug de la provincia como lo usa el resto del grafo (`lib/provincias.ts`):
 * MapaInversiones escribe «Baoruco» y la ficha es `/provincias/bahoruco`. Sin
 * esto, la ficha de Bahoruco contaba cero obras y su enlace a `/obras` no
 * filtraba. Lo que la tabla no reconoce cae al slug del nombre.
 */
export function slugProvincia(nombre: string): string {
  const conocida = provinciaDeTexto(nombre);
  if (conocida) return conocida.slug;
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Provincias con al menos una obra, con cuántas. */
export function provinciasDe(obras: Obra[]): { nombre: string; slug: string; n: number }[] {
  const cuenta = new Map<string, number>();
  for (const o of obras) for (const p of o.provincias) cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
  return [...cuenta.entries()]
    .map(([nombre, n]) => ({ nombre, slug: slugProvincia(nombre), n }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * ¿Ya pasó la fecha de fin prevista sin llegar al 100 %? Es un hecho del
 * calendario, no un juicio: la fuente puede no haber actualizado el avance.
 */
export function finVencido(o: Obra, hoy = new Date()): boolean {
  if (!o.fin || o.avance >= 100) return false;
  return new Date(`${o.fin}T12:00:00-04:00`) < hoy;
}

export interface FiltroObras {
  q?: string;
  estado?: string;
  provincia?: string;
  uc?: number;
}

/**
 * Nombre, entidad —con sus siglas, que la fuente no trae: «MOPC» encuentra
 * las 691 del Ministerio de Obras Públicas— y provincias, con la regla de
 * `lib/raiz.ts`: todas las palabras, en cualquier orden, por raíz. Un SNIP
 * tecleado entero va directo a su obra.
 */
export function filtrarObras(obras: Obra[], f: FiltroObras): Obra[] {
  const q = f.q?.trim() ?? "";
  const a = q ? agujas(q) : null;
  return obras.filter(
    (o) =>
      (!f.estado || o.estado === f.estado) &&
      (!f.provincia || o.provincias.some((p) => slugProvincia(p) === f.provincia)) &&
      (f.uc === undefined || o.uc === f.uc) &&
      (!a ||
        o.snip === q ||
        contieneTodas(plano(`${o.nombre} ${o.entidad} ${siglasDe(o.uc)} ${o.provincias.join(" ")}`), a)),
  );
}
