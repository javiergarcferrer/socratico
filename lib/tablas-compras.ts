import { readFile } from "node:fs/promises";
import path from "node:path";
import { plano } from "@/lib/raiz";
import { sinCedula } from "@/lib/padron";

/**
 * Las dos tablas enteras que ordena el servidor MCP (`procurement`,
 * `contracting_history`, `retrieve`): los procesos de compra de los últimos
 * doce meses y los proveedores del Estado desde 2015. Se leen de sus propias
 * instantáneas, tipadas, y no del índice del buscador: ordenar por monto o
 * fecha no necesita rankear texto, y cuando el índice cargaba su corpus de
 * 47 MB en JSON costaba en frío ~1,5 s y ~185 MB, contra ~0,1 s y ~45 MB por
 * la tabla.
 *
 *  - `public/data/procesos.json` (`scripts/build-procesos.py`): la tabla de
 *    procesos de la DGCP, con unidades, modalidades, estados y objetos
 *    tabulados una vez y cada fila por su posición.
 *  - `public/data/historico/proveedores/{0-9}.json` (`scripts/build-historico.py`)
 *    y `public/data/rnc/{0-9}.json` (`scripts/build-rnc.py`): cada proveedor
 *    con su serie de contratos y, si el cruce lo trae, su RNC.
 *
 * Las etapas y modalidades se dicen cortas, como en el buscador
 * (`scripts/busqueda_procesos.py`): la misma palabra en `search` y en
 * `procurement`. Si una de las dos tablas cambia, `scripts/eval-mcp.mjs` lo
 * nota: calcula sus respuestas de las mismas instantáneas.
 */

const DATOS = path.join(process.cwd(), "public", "data");

/** El literal de la DGCP, dicho corto (el mismo que `scripts/busqueda_procesos.py`). */
const ETAPA: Record<string, string> = {
  "Proceso publicado": "Abierto a ofertas",
  "Proceso con etapa cerrada": "Recepción cerrada",
  "Sobres estan abriendose": "En evaluación",
  "Sobres abiertos o aperturados": "En evaluación",
  "Proceso adjudicado y celebrado": "Adjudicado",
  "Proceso desierto": "Desierto",
  Cancelado: "Cancelado",
  Suspendido: "Suspendido",
};
const MODALIDAD: Record<string, string> = {
  "Compras por Debajo del Umbral": "Compra menor al umbral",
  "Procesos de Excepción": "Excepción",
};

/** Un proceso de compra de la DGCP, con sus campos por separado. */
export interface ProcesoIndexado {
  codigo: string;
  /** La carátula tal como la publica la unidad de compra (a menudo en MAYÚSCULAS), sin cédula. */
  titulo: string;
  /** La unidad de compra, como la nombra la DGCP. */
  unidad: string;
  /** Dicha corta: «Licitación Pública Nacional», «Excepción», «Compra menor al umbral». */
  modalidad: string;
  /** La etapa el día del corte, corta: «Abierto a ofertas», «En evaluación», «Adjudicado». */
  etapa: string;
  /** Bienes, Obras o Servicios. */
  objeto: string | null;
  fecha: string;
  /** Monto estimado en pesos; `null` si no lo trae o está en otra moneda. */
  valor: number | null;
}

/** Un proveedor del Estado: su RPE, su nombre y lo que el cruce con la DGII le añade. */
export interface ProveedorIndexado {
  rpe: string;
  nombre: string;
  /** RNC de nueve cifras, si el cruce con el padrón de la DGII lo trae. */
  rnc: string | null;
  /** Contratos desde 2015 en la instantánea. */
  contratos: number | null;
  desde: number | null;
  hasta: number | null;
}

interface ProcesosJson {
  hasta: string;
  unidades: string[];
  modalidades: string[];
  estados: string[];
  objetos: string[];
  filas: [string, number, number, number, number, string, string, number | null][];
}

interface ProveedoresJson {
  corte: string;
  filas: Record<string, { n: string | null; d?: string | null; h?: string | null; s: [unknown, number][] }>;
}

interface RncJson {
  filas: Record<string, [string, ...unknown[]]>;
}

const leer = async <T>(ruta: string): Promise<T> => JSON.parse(await readFile(path.join(DATOS, ruta), "utf8")) as T;

let procesosMemo: Promise<{ procesos: ProcesoIndexado[]; corte: string | null }> | null = null;

/**
 * Todos los procesos de compra de los últimos doce meses, en el orden de la
 * tabla (fecha y código, descendente), y la fecha de su corte. Se arman una
 * vez por instancia. Si la tabla no carga, lanza: «no pudimos mirar» no es
 * «no hay».
 */
export function todosLosProcesos(): Promise<{ procesos: ProcesoIndexado[]; corte: string | null }> {
  procesosMemo ??= leer<ProcesosJson>("procesos.json").then((t) => {
    const procesos = t.filas.map(([codigo, iu, im, ie, io, caratula, fecha, monto]): ProcesoIndexado => {
      const titulo = sinCedula(caratula);
      const modalidad = t.modalidades[im] ?? "";
      const estado = t.estados[ie] ?? "";
      return {
        codigo,
        titulo,
        unidad: t.unidades[iu] ?? "",
        modalidad: MODALIDAD[modalidad] ?? modalidad,
        etapa: ETAPA[estado] ?? estado,
        objeto: t.objetos[io] || null,
        fecha,
        valor: monto || null,
      };
    });
    return { procesos, corte: t.hasta ?? null };
  });
  procesosMemo.catch(() => {
    procesosMemo = null;
  });
  return procesosMemo;
}

let proveedoresMemo: Promise<{ proveedores: ProveedorIndexado[]; corte: string | null }> | null = null;

/** Todos los proveedores con contratos desde 2015, por RPE, y la fecha de su corte; lanza si no cargan. */
export function todosLosProveedores(): Promise<{ proveedores: ProveedorIndexado[]; corte: string | null }> {
  proveedoresMemo ??= Promise.all(
    Array.from({ length: 10 }, (_, n) =>
      Promise.all([leer<ProveedoresJson>(`historico/proveedores/${n}.json`), leer<RncJson>(`rnc/${n}.json`)]),
    ),
  ).then((partes) => {
    const proveedores: ProveedorIndexado[] = [];
    let corte: string | null = null;
    for (const [p, r] of partes) {
      corte = p.corte;
      for (const [rpe, f] of Object.entries(p.filas)) {
        const nombre = sinCedula((f.n ?? "").replace(/\s+/g, " ").trim());
        if (!nombre) continue;
        const doc = r.filas[rpe]?.[0];
        proveedores.push({
          rpe,
          nombre,
          rnc: typeof doc === "string" && /^\d{9}$/.test(doc) ? doc : null,
          contratos: f.s.reduce((s, a) => s + a[1], 0),
          desde: f.d && f.h ? Number(f.d.slice(0, 4)) : null,
          hasta: f.d && f.h ? Number(f.h.slice(0, 4)) : null,
        });
      }
    }
    proveedores.sort((a, b) => Number(a.rpe) - Number(b.rpe));
    return { proveedores, corte };
  });
  proveedoresMemo.catch(() => {
    proveedoresMemo = null;
  });
  return proveedoresMemo;
}

/*
 * El texto en `plano()` de `lib/raiz.ts`, para `contieneTodas`, se calcula la
 * primera vez que una consulta filtra por palabras y no al cargar: son 78 mil
 * carátulas y 32 mil nombres, y normalizarlos todos costaba ~0,3 s en cada
 * arranque en frío aunque nadie buscara por texto.
 */
const planos = new WeakMap<object, string>();

/** La carátula de un proceso en `plano()`. */
export function planoTitulo(p: ProcesoIndexado): string {
  let v = planos.get(p);
  if (v === undefined) planos.set(p, (v = plano(p.titulo)));
  return v;
}

/** El nombre de un proveedor en `plano()`. */
export function planoNombre(p: ProveedorIndexado): string {
  let v = planos.get(p);
  if (v === undefined) planos.set(p, (v = plano(p.nombre)));
  return v;
}

/* ------------------------------------------------------- lo publicado */

/** La primera y la última publicación de la instantánea. */
let coberturaMemo: { procesos: ProcesoIndexado[]; desde: string; hasta: string } | null = null;

export function coberturaDe(procesos: ProcesoIndexado[]): { desde: string; hasta: string } {
  if (coberturaMemo?.procesos !== procesos) {
    let desde = procesos[0].fecha;
    let hasta = procesos[0].fecha;
    for (const p of procesos) {
      if (p.fecha < desde) desde = p.fecha;
      if (p.fecha > hasta) hasta = p.fecha;
    }
    coberturaMemo = { procesos, desde, hasta };
  }
  return coberturaMemo;
}

/** Cuántos procesos publicó cada unidad de compra en la instantánea, y por cuánto, por su nombre plano. */
let porUnidadMemo: { procesos: ProcesoIndexado[]; mapa: Map<string, { procesos: number; suma: number }> } | null = null;

export function publicadoPorUnidad(procesos: ProcesoIndexado[]): Map<string, { procesos: number; suma: number }> {
  if (porUnidadMemo?.procesos !== procesos) {
    const mapa = new Map<string, { procesos: number; suma: number }>();
    const planos = new Map<string, string>();
    for (const p of procesos) {
      let k = planos.get(p.unidad);
      if (k === undefined) planos.set(p.unidad, (k = plano(p.unidad)));
      const g = mapa.get(k) ?? { procesos: 0, suma: 0 };
      g.procesos++;
      g.suma += p.valor ?? 0;
      mapa.set(k, g);
    }
    porUnidadMemo = { procesos, mapa };
  }
  return porUnidadMemo.mapa;
}

/** Lo que compra una institución: lo contratado desde 2015 y lo publicado en el último año, con las herramientas que lo abren. */

/** Lo publicado por cada institución en la tabla de procesos: lo que `fetch` dice de ella; lo compila `scripts/build-grafo.mjs`. */
export interface ComprasPublicadas {
  /** El corte de la tabla de procesos. */
  corte: string | null;
  /** La primera y la última publicación; `null` si la tabla está vacía. */
  cobertura: { desde: string; hasta: string } | null;
  /** Por id de institución: `[procesos, suma estimada]`; las que no publicaron, no están. */
  porInstitucion: Record<string, [number, number]>;
}

/**
 * Cuántos procesos publicó cada institución en la ventana de la tabla, y por
 * cuánto: su unidad de compra por su nombre plano. Una sola definición para
 * el compilador, que lo guarda, y para quien lo compara.
 */
export async function publicadoPorInstitucion(instituciones: { id: number; nombre: string; dgcp?: unknown }[]): Promise<ComprasPublicadas> {
  const { procesos, corte } = await todosLosProcesos();
  const porUnidad = publicadoPorUnidad(procesos);
  const porInstitucion: Record<string, [number, number]> = {};
  for (const i of instituciones) {
    if (!i.dgcp) continue;
    const p = porUnidad.get(plano(i.nombre));
    if (p) porInstitucion[String(i.id)] = [p.procesos, p.suma];
  }
  const c = procesos.length ? coberturaDe(procesos) : null;
  return { corte, cobertura: c ? { desde: c.desde, hasta: c.hasta } : null, porInstitucion };
}
