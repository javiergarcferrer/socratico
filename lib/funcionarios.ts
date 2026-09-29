import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { agujas, contieneTodas, plano } from "@/lib/raiz";

/**
 * Personas con cargo público — quién ocupa cada cargo y qué cargos ha ocupado
 * cada persona, según lo que el propio Estado publica (docs/AUDITORIA.md §H,
 * cuarta pasada, 2026-09-29). Es la capa de personas del grafo: la ficha
 * `/funcionarios/[slug]`, el directorio y el «¿Quién la dirige?» de cada
 * institución.
 *
 * `scripts/build-funcionarios.py` lee en build, con el User-Agent
 * identificable, y escribe `public/data/funcionarios.json`:
 *  · el **Directorio de Funcionarios del MAP** (observicios.gob.do), ~6,150
 *    servidores con cargo, unidad, institución y decreto;
 *  · **todos los decretos** de la Consultoría Jurídica: las designaciones y
 *    los ceses del título desde 1996, los de varias personas del PDF desde
 *    2012, y el firmante de cada decreto;
 *  · las **altas cortes y órganos**: Suprema Corte, Consejo del Poder
 *    Judicial, Tribunal Constitucional, Tribunal Superior Electoral (con sus
 *    gestiones anteriores), Junta Central Electoral y Defensor del Pueblo;
 *  · los **electos municipales de 2024** (JCE) y los **legisladores** del
 *    período (el SIL, sin red).
 *
 * **Una persona es su nombre** tal como lo escriben las fuentes, normalizado
 * (sin tildes ni mayúsculas): nunca la cédula, que el buscador de la
 * Consultoría trae y la instantánea descarta. Dos fuentes que escriben el
 * mismo nombre son la misma ficha; si lo escriben distinto, son dos, y la
 * ficha lo avisa. Nunca se publica un parentesco (docs/DECISIONES.md).
 *
 * **Persona expuesta políticamente.** La Ley 155-17 (art. 2, num. 19)
 * considera PEP a todo funcionario obligado a declarar patrimonio, y esos los
 * enumera la Ley 311-14 en su art. 2. La instantánea anota el numeral por el
 * texto del cargo (`pep`), con reglas conservadoras: sin numeral no se afirma
 * nada.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

export type Movimiento =
  | "vigente"
  | "designa"
  | "confirma"
  | "cesa"
  | "renuncia"
  | "sustituido"
  | "asciende"
  | "electo"
  | "anterior";

export type OrigenCargo =
  | "map"
  | "decreto"
  | "scj"
  | "cpj"
  | "tc"
  | "tse"
  | "jce"
  | "jce-suplentes"
  | "defensor"
  | "jce2024"
  | "congreso";

/** Un cargo, tal como lo registra su fuente (claves cortas en la instantánea). */
interface CargoCrudo {
  t: string;
  u?: string;
  i?: number;
  in?: string;
  pr?: string;
  d?: string;
  m: Movimiento;
  o: OrigenCargo;
  dec?: [string, string | null, number | null];
  g?: string;
  per?: string;
  par?: string;
  v?: number;
  pep?: number;
  n?: number;
  url?: string;
  por?: string;
}

interface PersonaCruda {
  id: string;
  n: string;
  a: string[] | null;
  c: CargoCrudo[];
  f: { como: string; decretos: number; desde: string; hasta: string } | null;
  leg: number | null;
  pep: number[] | null;
}

interface Instantanea {
  generado: string;
  fuentes: {
    map: { url: string; filas: number; corte: string; institucionesSinFicha: number };
    decretos: {
      url: string;
      total: number;
      desdeTitulos: string;
      desdePdf: string;
      designacionesTitulo: number;
      pdfLeidos: number;
      pdfSinTexto: number;
      designacionesPdf: number;
      firmantes: number;
    };
    organos: Record<string, { url: string; filas: number; modificado: string | null; error: string | null }>;
    electos2024: { url: string; filas: number; error: string | null };
    congreso: { filas: number; fuente: string };
  };
  ley311: Record<string, string>;
  personas: PersonaCruda[];
}

export interface Cargo {
  titulo: string;
  unidad: string | null;
  institucionId: number | null;
  /** El nombre de la institución como lo escribe la fuente. */
  institucion: string | null;
  provincia: string | null;
  fecha: string | null;
  movimiento: Movimiento;
  origen: OrigenCargo;
  decreto: { numero: string; fecha: string | null; docId: number | null } | null;
  grado: string | null;
  periodo: string | null;
  partido: string | null;
  votos: number | null;
  /** Numeral del art. 2 de la Ley 311-14 que obliga a declarar patrimonio. */
  numeral311: number | null;
  /** Orden jerárquico del MAP (1 Presidente, 3 ministros…), si viene de ahí. */
  orden: number | null;
  url: string | null;
  /** Quién lo sustituyó, cuando el decreto lo dice. */
  sustituidoPor: string | null;
}

export interface Persona {
  id: string;
  nombre: string;
  /** Otras grafías del mismo nombre normalizado. */
  alias: string[];
  cargos: Cargo[];
  /** Si firmó decretos del Poder Ejecutivo: cuántos y entre qué fechas. */
  firma: { como: string; decretos: number; desde: string; hasta: string } | null;
  legislador: number | null;
  /** Numerales de la Ley 311-14 de sus cargos. */
  pep: number[];
}

export type Poder = "ejecutivo" | "congreso" | "justicia" | "organos" | "local";

export const PODERES: Record<Poder, { etiqueta: string; nota: string }> = {
  ejecutivo: { etiqueta: "Poder Ejecutivo", nota: "Ministerios, direcciones, embajadas y empresas del Estado" },
  congreso: { etiqueta: "Congreso", nota: "Diputados y senadores del período" },
  justicia: { etiqueta: "Altas cortes", nota: "Suprema Corte, Consejo del Poder Judicial, TC y TSE" },
  organos: { etiqueta: "Órganos constitucionales", nota: "Junta Central Electoral y Defensor del Pueblo" },
  local: { etiqueta: "Gobiernos locales", nota: "Alcaldes, regidores y juntas de distrito" },
};

const DE_ORIGEN: Record<OrigenCargo, Poder> = {
  map: "ejecutivo",
  decreto: "ejecutivo",
  scj: "justicia",
  cpj: "justicia",
  tc: "justicia",
  tse: "justicia",
  jce: "organos",
  "jce-suplentes": "organos",
  defensor: "organos",
  jce2024: "local",
  congreso: "congreso",
};

/** Los numerales de la Ley 311-14 que son de un gobierno local (alcaldes, regidores, juntas). */
const NUMERALES_LOCALES = new Set([14, 15]);

export interface Funcionarios {
  generado: string;
  fuentes: Instantanea["fuentes"];
  ley311: Record<number, string>;
  personas: Persona[];
  porId: Map<string, Persona>;
  /** Institución (id del cruce) → sus personas con el cargo que las ata. */
  porInstitucion: Map<number, { persona: Persona; cargo: Cargo }[]>;
  /** Número de decreto → las personas que nombra o cesa. */
  porDecreto: Map<string, { persona: Persona; cargo: Cargo }[]>;
}

function aCargo(c: CargoCrudo): Cargo {
  return {
    titulo: c.t,
    unidad: c.u ?? null,
    institucionId: c.i ?? null,
    institucion: c.in ?? null,
    provincia: c.pr ?? null,
    fecha: c.d ?? null,
    movimiento: c.m,
    origen: c.o,
    decreto: c.dec ? { numero: c.dec[0], fecha: c.dec[1], docId: c.dec[2] } : null,
    grado: c.g ?? null,
    periodo: c.per ?? null,
    partido: c.par ?? null,
    votos: c.v ?? null,
    numeral311: c.pep ?? null,
    orden: c.n ?? null,
    url: c.url ?? null,
    sustituidoPor: c.por ?? null,
  };
}

let memo: Promise<Funcionarios | null> | null = null;

export function getFuncionarios(): Promise<Funcionarios | null> {
  memo ??= readFile(join(process.cwd(), "public", "data", "funcionarios.json"), "utf8")
    .then((t) => {
      const d = JSON.parse(t) as Instantanea;
      if (!Array.isArray(d?.personas) || d.personas.length === 0) return null;
      const personas: Persona[] = d.personas.map((p) => ({
        id: p.id,
        nombre: p.n,
        alias: p.a ?? [],
        cargos: p.c.map(aCargo),
        firma: p.f,
        legislador: p.leg,
        pep: p.pep ?? [],
      }));
      const porId = new Map(personas.map((p) => [p.id, p]));
      const porInstitucion = new Map<number, { persona: Persona; cargo: Cargo }[]>();
      const porDecreto = new Map<string, { persona: Persona; cargo: Cargo }[]>();
      for (const persona of personas) {
        for (const cargo of persona.cargos) {
          if (cargo.institucionId != null) {
            const lista = porInstitucion.get(cargo.institucionId) ?? [];
            lista.push({ persona, cargo });
            porInstitucion.set(cargo.institucionId, lista);
          }
          if (cargo.decreto?.numero) {
            const lista = porDecreto.get(cargo.decreto.numero) ?? [];
            lista.push({ persona, cargo });
            porDecreto.set(cargo.decreto.numero, lista);
          }
        }
      }
      const ley311: Record<number, string> = {};
      for (const [k, v] of Object.entries(d.ley311 ?? {})) ley311[Number(k)] = v;
      return { generado: d.generado, fuentes: d.fuentes, ley311, personas, porId, porInstitucion, porDecreto };
    })
    .catch((err) => {
      console.error("[funcionarios]", err);
      memo = null;
      return null;
    });
  return memo;
}

export async function personaPorId(id: string): Promise<Persona | null> {
  const f = await getFuncionarios();
  return f?.porId.get(id) ?? null;
}

/** La persona que es este legislador del SIL, si la instantánea la tiene. */
export async function personaDeLegislador(id: number): Promise<Persona | null> {
  const f = await getFuncionarios();
  return f?.personas.find((p) => p.legislador === id) ?? null;
}

/* ------------------------------------------------------------ lecturas */

/** ¿Lo dice su fuente como cargo de hoy? El MAP, un órgano, una elección vigente. */
export function esActual(c: Cargo): boolean {
  if (c.movimiento === "vigente") return true;
  if (c.movimiento === "electo") return c.periodo === "2024-2028";
  return false;
}

/** El cargo que encabeza la ficha: el de hoy si hay, si no el más reciente con fecha. */
export function cargoPrincipal(p: Persona): Cargo | null {
  const actuales = p.cargos.filter(esActual);
  if (actuales.length) {
    return [...actuales].sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99) || rango(b) - rango(a))[0];
  }
  return p.cargos.find((c) => c.movimiento !== "cesa" && c.movimiento !== "sustituido") ?? p.cargos[0] ?? null;
}

/** Cuánto pesa un cargo para ordenar: el numeral de la 311-14 lo acerca a la cabeza del Estado. */
function rango(c: Cargo): number {
  if (!c.numeral311) return 0;
  return 40 - Math.min(c.numeral311, 33);
}

export function poderesDe(p: Persona): Set<Poder> {
  const salida = new Set<Poder>();
  for (const c of p.cargos) {
    const poder =
      c.origen === "map" && c.numeral311 != null && NUMERALES_LOCALES.has(c.numeral311) ? "local" : DE_ORIGEN[c.origen];
    salida.add(poder);
  }
  return salida;
}

export interface FiltroFuncionarios {
  q?: string;
  poder?: Poder | null;
  soloPep?: boolean;
}

/**
 * Las personas que cumplen el filtro. Sin consulta, primero quien ocupa hoy un
 * cargo de declaración obligatoria y más cerca de la cabeza del Estado; con
 * consulta, todas las palabras en cualquier orden sobre el nombre y sus
 * grafías (la regla de `/buscar`).
 */
export function filtrarPersonas(f: Funcionarios, filtro: FiltroFuncionarios): Persona[] {
  const q = filtro.q?.trim() ? agujas(filtro.q) : null;
  const salida = f.personas.filter((p) => {
    if (filtro.soloPep && p.pep.length === 0) return false;
    if (filtro.poder && !poderesDe(p).has(filtro.poder)) return false;
    if (q && !contieneTodas(plano([p.nombre, ...p.alias].join(" ")), q)) return false;
    return true;
  });
  return salida.sort((a, b) => puntaje(b) - puntaje(a) || a.nombre.localeCompare(b.nombre, "es"));
}

function puntaje(p: Persona): number {
  const c = cargoPrincipal(p);
  let s = 0;
  if (c && esActual(c)) s += 100;
  if (c?.orden != null) s += Math.max(0, 50 - c.orden);
  if (c) s += rango(c);
  // Haber firmado decretos no pone a nadie delante de quien ocupa hoy un
  // cargo: el Presidente en funciones ya encabeza por su cargo del MAP.
  if (p.firma) s += 10;
  return s;
}

/** Quién encabeza hoy cada poder y órgano, en el orden en que la Constitución los nombra. */
export function cabezasDelEstado(f: Funcionarios): { persona: Persona; cargo: Cargo }[] {
  const buscados: RegExp[] = [
    /^presidente de la republica/,
    /^vicepresident[ae] de la republica/,
    /^juez presidente de la suprema corte/,
    /^juez presidente del tribunal constitucional/,
    /^juez presidente del tribunal superior electoral/,
    /^presidente de la junta central electoral/,
    /^defensor del pueblo/,
  ];
  const salida: { persona: Persona; cargo: Cargo }[] = [];
  for (const re of buscados) {
    let hallado: { persona: Persona; cargo: Cargo } | null = null;
    for (const persona of f.personas) {
      const cargo = persona.cargos.find((c) => esActual(c) && re.test(plano(c.titulo).trim()));
      if (cargo) {
        hallado = { persona, cargo };
        break;
      }
    }
    if (hallado) salida.push(hallado);
  }
  return salida;
}

/** El gabinete: los ministros que el MAP pone hoy en el primer nivel (orden 3). */
export function gabinete(f: Funcionarios): { persona: Persona; cargo: Cargo }[] {
  const salida: { persona: Persona; cargo: Cargo }[] = [];
  for (const persona of f.personas) {
    const cargo = persona.cargos.find((c) => c.origen === "map" && c.orden === 3 && esActual(c));
    if (cargo) salida.push({ persona, cargo });
  }
  return salida.sort((a, b) => (a.cargo.institucion ?? "").localeCompare(b.cargo.institucion ?? "", "es"));
}

/*
  ¿Quién la dirige? El cargo de más arriba que el MAP da hoy en la
  institución (su orden jerárquico: 3 ministro, 13 director general, 15
  director ejecutivo, 25 alcalde…), y si el MAP no la tiene, la designación
  más reciente de un cargo de cabeza en los decretos. Un «vice», un «sub» o un
  «adjunto» no encabezan.
*/
const CABEZA = /^(ministr[oa]|director[a]?( general| ejecutiv[oa]| nacional)?|administrador[a]?( general)?|superintendente|gerente general|presidente|presidenta|rector[a]?|alcalde|alcaldesa|contralor[a]? general|procurador[a]? general|tesorer[oa] nacional|defensor[a]? del pueblo|gobernador[a]?)\b/;

function esCabeza(c: Cargo): boolean {
  const t = plano(c.titulo).trim();
  return CABEZA.test(t) && !/\b(vice|sub|adjunt|suplente|consejer)/.test(t);
}

export interface Dirigente {
  persona: Persona;
  cargo: Cargo;
  /** «el MAP hoy» o «el último decreto que la nombra». */
  segun: "map" | "decreto" | "organo" | "eleccion";
}

export function quienDirige(f: Funcionarios, institucionId: number): Dirigente | null {
  const lista = f.porInstitucion.get(institucionId) ?? [];
  const hoy = lista
    .filter(({ cargo }) => esActual(cargo) && esCabeza(cargo))
    .sort((a, b) => (a.cargo.orden ?? 99) - (b.cargo.orden ?? 99));
  if (hoy.length) {
    const d = hoy[0];
    const segun = d.cargo.origen === "map" ? "map" : d.cargo.origen === "jce2024" ? "eleccion" : "organo";
    return { ...d, segun };
  }
  const decretos = lista
    .filter(({ cargo }) => cargo.origen === "decreto" && (cargo.movimiento === "designa" || cargo.movimiento === "confirma") && esCabeza(cargo))
    .sort((a, b) => (b.cargo.fecha ?? "").localeCompare(a.cargo.fecha ?? ""));
  return decretos[0] ? { ...decretos[0], segun: "decreto" } : null;
}

/** Las personas con cargo en una institución: primero las de hoy, luego la historia. */
export function personasDeInstitucion(f: Funcionarios, institucionId: number): { persona: Persona; cargo: Cargo }[] {
  const lista = f.porInstitucion.get(institucionId) ?? [];
  return [...lista].sort(
    (a, b) =>
      Number(esActual(b.cargo)) - Number(esActual(a.cargo)) ||
      (a.cargo.orden ?? 99) - (b.cargo.orden ?? 99) ||
      (b.cargo.fecha ?? "").localeCompare(a.cargo.fecha ?? ""),
  );
}

/** Las personas que nombra, confirma o cesa un decreto. */
export function personasDelDecreto(f: Funcionarios, numero: string): { persona: Persona; cargo: Cargo }[] {
  return f.porDecreto.get(numero) ?? [];
}

/** Nombres con todas las palabras de este (otra grafía posible de la misma persona o un homónimo). */
export function parecidos(f: Funcionarios, p: Persona, limite = 5): Persona[] {
  const palabras = plano(p.nombre).trim().split(" ").filter((w) => w.length > 2);
  if (palabras.length < 2) return [];
  return f.personas
    .filter((o) => o.id !== p.id)
    .filter((o) => {
      const suyo = ` ${plano(o.nombre).trim()} `;
      return palabras.every((w) => suyo.includes(` ${w} `));
    })
    .slice(0, limite);
}

/** Qué dice el movimiento, en llano, para la línea de un cargo. */
export const ETIQUETA_MOVIMIENTO: Record<Movimiento, string> = {
  vigente: "En el cargo",
  designa: "Designación",
  confirma: "Confirmación",
  cesa: "Deja el cargo",
  renuncia: "Renuncia aceptada",
  sustituido: "Sustituido",
  asciende: "Ascenso",
  electo: "Elección",
  anterior: "Gestión anterior",
};

/** De dónde sale cada cargo, en llano. */
export const ETIQUETA_ORIGEN: Record<OrigenCargo, string> = {
  map: "Directorio de Funcionarios del MAP",
  decreto: "Decreto del Poder Ejecutivo",
  scj: "Suprema Corte de Justicia",
  cpj: "Consejo del Poder Judicial",
  tc: "Tribunal Constitucional",
  tse: "Tribunal Superior Electoral",
  jce: "Junta Central Electoral",
  "jce-suplentes": "Junta Central Electoral",
  defensor: "Defensor del Pueblo",
  jce2024: "JCE, elecciones municipales de 2024",
  congreso: "SIL de la Cámara de Diputados",
};
