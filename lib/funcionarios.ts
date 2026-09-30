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
 *  · la **Junta Monetaria**, de la página del Banco Central (el POST que hace
 *    esa misma página, docs/AUDITORIA.md §H.13): nombre y cargo, nada más;
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
  | "congreso"
  | "bcrd";

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
  f: { como: string; clave?: string; decretos: number; desde: string; hasta: string } | null;
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
    /** Por origen del cargo; `bcrd` (la Junta Monetaria) trae además el día de la lectura. */
    organos: Record<string, { url: string; filas: number; modificado: string | null; error: string | null; leido?: string }>;
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
  /**
   * Si firmó decretos del Poder Ejecutivo: cuántos y entre qué fechas. `clave`
   * es la firma tal como la escribe la Consultoría («LUIS ABINADER»): la que
   * busca el registro de decretos (`lib/decretos.ts`).
   */
  firma: { como: string; clave: string; decretos: number; desde: string; hasta: string } | null;
  legislador: number | null;
  /** Numerales de la Ley 311-14 de sus cargos, de hoy o de antes. */
  pep: number[];
  /**
   * PEP hoy según la Ley 155-17 (art. 2, num. 19: quien «desempeña o ha
   * desempeñado, durante los últimos tres (3) años» un cargo obligado a
   * declarar): un cargo así de hoy, o uno cuya fecha más reciente cae en los
   * últimos tres años. Solo esto se afirma, se marca y se indexa.
   */
  pepVigente: boolean;
  /** La fecha más reciente que las fuentes dan de un cargo obligado a declarar, si no es de hoy. */
  pepUltimaFecha: string | null;
}

export type Poder = "ejecutivo" | "congreso" | "justicia" | "organos" | "local";

export const PODERES: Record<Poder, { etiqueta: string; nota: string }> = {
  ejecutivo: { etiqueta: "Poder Ejecutivo", nota: "Ministerios, direcciones, embajadas y empresas del Estado" },
  congreso: { etiqueta: "Congreso", nota: "Diputados y senadores del período" },
  justicia: { etiqueta: "Altas cortes", nota: "Suprema Corte, Consejo del Poder Judicial, TC y TSE" },
  organos: { etiqueta: "Órganos constitucionales", nota: "Junta Central Electoral, Defensor del Pueblo y Junta Monetaria" },
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
  // La Junta Monetaria es órgano constitucional (Constitución, art. 223), no del Poder Ejecutivo.
  bcrd: "organos",
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
      const limite = haceTresAnios();
      const personas: Persona[] = d.personas.map((p) => {
        const cargos = p.c.map(aCargo);
        const { hoy, ultima } = estadoPep(cargos);
        return {
          id: p.id,
          nombre: p.n,
          alias: p.a ?? [],
          cargos,
          // Una instantánea anterior a la clave la deriva de «como» (misma firma en mayúsculas).
          firma: p.f ? { ...p.f, clave: p.f.clave ?? p.f.como.toLocaleUpperCase("es") } : null,
          legislador: p.leg,
          pep: p.pep ?? [],
          pepVigente: hoy || (ultima !== null && ultima >= limite),
          pepUltimaFecha: hoy ? null : ultima,
        };
      });
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

/** Quien firma los decretos con esta clave del registro («LUIS ABINADER»), si la instantánea lo ata a una persona. */
export async function personaPorFirma(clave: string): Promise<Persona | null> {
  const f = await getFuncionarios();
  return f?.personas.find((p) => p.firma?.clave === clave) ?? null;
}

/** La persona que es este legislador del SIL, si la instantánea la tiene. */
export async function personaDeLegislador(id: number): Promise<Persona | null> {
  const f = await getFuncionarios();
  return f?.personas.find((p) => p.legislador === id) ?? null;
}

/** La fecha (ISO) de hace tres años: el plazo del art. 2, num. 19 de la Ley 155-17. */
function haceTresAnios(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 3);
  return d.toISOString().slice(0, 10);
}

/*
  De los cargos obligados a declarar: ¿alguno es de hoy? y, si no, ¿cuál es
  la fecha más reciente que las fuentes dan de ellos? La fecha de un cese o
  una sustitución es cuándo dejó el cargo; la de una designación, cuándo
  entró (las fuentes no dicen si sigue); la de un período electo o de una
  gestión anterior, el año en que terminó.
*/
function estadoPep(cargos: Cargo[]): { hoy: boolean; ultima: string | null } {
  let ultima: string | null = null;
  for (const c of cargos) {
    if (c.numeral311 == null) continue;
    if (esActual(c)) return { hoy: true, ultima: null };
    const fin = c.periodo?.match(/(\d{4})\D*$/)?.[1];
    const fecha = fin ? `${fin}-12-31` : c.fecha;
    if (fecha && (ultima === null || fecha > ultima)) ultima = fecha;
  }
  return { hoy: false, ultima };
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

/**
 * Los numerales del art. 2 de la Ley 311-14 agrupados en familias de cargo, para
 * filtrar a las personas expuestas políticamente por tipo. Cada familia dice sus
 * numerales; ninguno queda en dos.
 */
export const FAMILIAS_PEP: { clave: string; etiqueta: string; numerales: number[] }[] = [
  { clave: "presidencia", etiqueta: "Presidencia", numerales: [1] },
  { clave: "congreso", etiqueta: "Congreso", numerales: [2] },
  { clave: "justicia", etiqueta: "Jueces y Ministerio Público", numerales: [3, 4, 5, 6] },
  { clave: "gobierno", etiqueta: "Ministerios y direcciones", numerales: [7, 18, 19, 29, 32] },
  { clave: "control", etiqueta: "Órganos de control y electorales", numerales: [8, 10, 11, 12] },
  { clave: "autonomos", etiqueta: "Banca, empresas y entes autónomos", numerales: [9, 13, 20, 21, 30, 31] },
  { clave: "territorio", etiqueta: "Provincias y municipios", numerales: [14, 15, 22] },
  { clave: "exterior", etiqueta: "Servicio exterior", numerales: [17] },
  { clave: "seguridad", etiqueta: "Fuerzas Armadas y Policía", numerales: [23, 24, 26] },
];

export interface FiltroFuncionarios {
  q?: string;
  poder?: Poder | null;
  soloPep?: boolean;
  /** Solo quien es PEP hoy (`pepVigente`). */
  soloPepVigente?: boolean;
  /** Clave de `FAMILIAS_PEP`: solo quien tiene o tuvo un cargo de esa familia. */
  familiaPep?: string | null;
  /** Solo quienes han tenido cargo en esta institución; entonces el orden es el de la institución. */
  institucionId?: number | null;
}

/**
 * Las personas que cumplen el filtro. Sin consulta, primero quien ocupa hoy un
 * cargo de declaración obligatoria y más cerca de la cabeza del Estado; con
 * consulta, todas las palabras en cualquier orden sobre el nombre y sus
 * grafías (la regla de `/buscar`).
 */
const COLADOR = new Intl.Collator("es");

/** El filtro como predicado, sin ordenar: lo comparten la lista y las cuentas. */
function predicado(filtro: FiltroFuncionarios): (p: Persona) => boolean {
  const q = filtro.q?.trim() ? agujas(filtro.q) : null;
  const familia = filtro.familiaPep ? FAMILIAS_PEP.find((x) => x.clave === filtro.familiaPep) : null;
  return (p) => {
    if (filtro.soloPep && p.pep.length === 0) return false;
    if (filtro.soloPepVigente && !p.pepVigente) return false;
    if (familia && !p.pep.some((n) => familia.numerales.includes(n))) return false;
    if (filtro.poder && !poderesDe(p).has(filtro.poder)) return false;
    if (q && !contieneTodas(plano([p.nombre, ...p.alias].join(" ")), q)) return false;
    return true;
  };
}

export function filtrarPersonas(f: Funcionarios, filtro: FiltroFuncionarios): Persona[] {
  const pasa = predicado(filtro);
  if (filtro.institucionId != null) {
    // Una vez cada persona, en el orden de la institución: primero las de hoy.
    const vistas = new Set<string>();
    return personasDeInstitucion(f, filtro.institucionId)
      .map(({ persona }) => persona)
      .filter((p) => (vistas.has(p.id) ? false : (vistas.add(p.id), true)))
      .filter(pasa);
  }
  const salida = f.personas.filter(pasa);
  // El puntaje se calcula una vez por persona, no en cada comparación.
  const puntos = new Map(salida.map((p) => [p, puntaje(p)]));
  const familia = filtro.familiaPep ? FAMILIAS_PEP.find((x) => x.clave === filtro.familiaPep) : null;
  // Con un tipo elegido, primero quien ocupa hoy un cargo de ese tipo.
  const hoy = familia
    ? new Map(salida.map((p) => [p, Number(p.cargos.some((c) => esActual(c) && familia.numerales.includes(c.numeral311 ?? -1)))]))
    : null;
  return salida.sort(
    (a, b) =>
      (hoy ? hoy.get(b)! - hoy.get(a)! : 0) || puntos.get(b)! - puntos.get(a)! || COLADOR.compare(a.nombre, b.nombre),
  );
}

/** Cuántas personas cumplen el filtro, sin ordenarlas: para las cuentas de cada filtro. */
export function contarPersonas(f: Funcionarios, filtro: FiltroFuncionarios): number {
  if (filtro.institucionId != null) return filtrarPersonas(f, filtro).length;
  const pasa = predicado(filtro);
  let n = 0;
  for (const p of f.personas) if (pasa(p)) n++;
  return n;
}

/** El cargo de la persona que es de esa familia PEP: el de hoy si lo hay, si no el más reciente. */
export function cargoDeFamilia(p: Persona, clave: string): Cargo | null {
  const familia = FAMILIAS_PEP.find((x) => x.clave === clave);
  if (!familia) return null;
  const suyos = p.cargos.filter((c) => c.numeral311 != null && familia.numerales.includes(c.numeral311));
  return suyos.find(esActual) ?? [...suyos].sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))[0] ?? null;
}

/** El cargo que ata a la persona con la institución: el de hoy si lo hay, si no el más reciente. */
export function cargoEnInstitucion(p: Persona, institucionId: number): Cargo | null {
  const aqui = p.cargos.filter((c) => c.institucionId === institucionId);
  return (
    aqui.find(esActual) ??
    [...aqui].sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))[0] ??
    null
  );
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
  director ejecutivo, 25 alcalde…) o, en una alta corte, quien la preside;
  si no, la designación más reciente de un cargo de cabeza en los decretos.
  Un «vice», un «sub», un «adjunto» o el presidente de una sala no encabezan.
*/
const CABEZA = /^(ministr[oa]|director[a]?( general| ejecutiv[oa]| nacional)?|administrador[a]?( general)?|superintendente|gerente general|presidente|presidenta|rector[a]?|alcalde|alcaldesa|alcaldia|contralor[a]? general|procurador[a]? general|tesorer[oa] nacional|defensor[a]? del pueblo|gobernador[a]?|juez[a]? president[ae] (de la suprema corte|del tribunal))\b/;

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
  // Sin cabeza de hoy, un decreto solo cuenta si lo firmó el Presidente en
  // funciones, si nombra la cabeza de verdad («director general», no «director
  // de inteligencia») y si ningún decreto posterior sacó a esa persona de ahí.
  const desde = presidenteEnFunciones(f)?.firma?.desde ?? null;
  if (!desde) return null;
  const decretos = lista
    .filter(
      ({ persona, cargo }) =>
        cargo.origen === "decreto" &&
        (cargo.movimiento === "designa" || cargo.movimiento === "confirma") &&
        (cargo.fecha ?? "") >= desde &&
        CABEZA_POR_DECRETO.test(plano(cargo.titulo).trim()) &&
        esCabeza(cargo) &&
        !persona.cargos.some(
          (c) =>
            c.institucionId === institucionId &&
            (c.movimiento === "cesa" || c.movimiento === "renuncia" || c.movimiento === "sustituido") &&
            (c.fecha ?? "") >= (cargo.fecha ?? ""),
        ),
    )
    .sort((a, b) => (b.cargo.fecha ?? "").localeCompare(a.cargo.fecha ?? ""));
  return decretos[0] ? { ...decretos[0], segun: "decreto" } : null;
}

/** Los cargos de cabeza que un decreto puede nombrar: sin «director de…» a secas. */
const CABEZA_POR_DECRETO = /^(ministr[oa]|director[a]? (general|ejecutiv[oa]|nacional)|administrador[a]? general|superintendente|gerente general|presidente|presidenta|rector[a]?|contralor[a]? general|procurador[a]? general|tesorer[oa] nacional|defensor[a]? del pueblo|gobernador[a]?)\b/;

/** Quien el MAP pone hoy como Presidente de la República, con sus firmas. */
function presidenteEnFunciones(f: Funcionarios): Persona | null {
  return cabezasDelEstado(f).find(({ cargo }) => /^presidente de la republica/.test(plano(cargo.titulo).trim()))?.persona ?? null;
}

export interface GobiernoProvincial {
  /** Quien gobierna la provincia: el MAP hoy o, si no la lista, el último decreto de este Presidente. */
  gobernador: Dirigente | null;
  /** Las alcaldías de la elección de 2024, una por municipio. */
  alcaldes: { persona: Persona; cargo: Cargo }[];
  /** Las direcciones de distrito municipal de la elección de 2024. */
  directores: { persona: Persona; cargo: Cargo }[];
  /** Cuántas regidurías de la elección de 2024 tiene la provincia. */
  regidores: number;
}

/*
  ¿Quién gobierna la provincia? Su gobernador: el que el MAP pone hoy en la
  «Oficina de Gobernación Provincial» y, si el MAP no la lista, la designación
  más reciente en los decretos, solo si la firmó el Presidente en funciones
  (una de 2002 no dice quién gobierna hoy). Debajo, las autoridades locales
  que la JCE dio por electas en 2024. `esDeAqui` casa la provincia como la
  escribe la fuente con la de la ficha (lib/provincias.ts, con sus alias).
*/
export function gobiernoDeProvincia(f: Funcionarios, esDeAqui: (texto: string) => boolean): GobiernoProvincial {
  let hoy: { persona: Persona; cargo: Cargo } | null = null;
  let decreto: { persona: Persona; cargo: Cargo } | null = null;
  const alcaldes: { persona: Persona; cargo: Cargo }[] = [];
  const directores: { persona: Persona; cargo: Cargo }[] = [];
  let regidores = 0;
  for (const persona of f.personas) {
    for (const cargo of persona.cargos) {
      if (!cargo.provincia || !esDeAqui(cargo.provincia)) continue;
      const t = plano(cargo.titulo).trim();
      if (/^gobernador/.test(t)) {
        if (cargo.origen === "map" && esActual(cargo)) hoy ??= { persona, cargo };
        else if (
          cargo.origen === "decreto" &&
          (cargo.movimiento === "designa" || cargo.movimiento === "confirma") &&
          (cargo.fecha ?? "") > (decreto?.cargo.fecha ?? "")
        ) {
          decreto = { persona, cargo };
        }
      } else if (cargo.origen === "jce2024" && esActual(cargo)) {
        // El puesto como lo escribe la instantánea («Alcaldía de…»), o la persona si otra fuente lo dice así.
        if (/^alcald(e|esa|ia)\b/.test(t)) alcaldes.push({ persona, cargo });
        else if (/^(direccion|director[a]?) del distrito municipal/.test(t)) directores.push({ persona, cargo });
        else if (/^(regiduria|regidor[a]?)\b/.test(t)) regidores++;
      }
    }
  }
  const desde = presidenteEnFunciones(f)?.firma?.desde ?? null;
  const gobernador: Dirigente | null = hoy
    ? { ...hoy, segun: "map" }
    : decreto && desde && (decreto.cargo.fecha ?? "") >= desde
      ? { ...decreto, segun: "decreto" }
      : null;
  const porTitulo = (a: { cargo: Cargo }, b: { cargo: Cargo }) => a.cargo.titulo.localeCompare(b.cargo.titulo, "es");
  return { gobernador, alcaldes: alcaldes.sort(porTitulo), directores: directores.sort(porTitulo), regidores };
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

/**
 * La persona que se llama exactamente así (sin tildes ni mayúsculas), si hay
 * una sola y el nombre tiene al menos tres palabras. Es la regla de la
 * plataforma, «una persona es su nombre», aplicada a un nombre de otra fuente
 * (el consejo de un banco): con dos palabras o dos personas iguales, nada.
 */
export function personaPorNombre(f: Funcionarios, nombre: string): Persona | null {
  const k = plano(nombre).trim();
  if (k.split(" ").length < 3) return null;
  let indice = POR_NOMBRE.get(f);
  if (!indice) {
    indice = new Map();
    for (const p of f.personas) {
      for (const n of new Set([p.nombre, ...p.alias].map((x) => plano(x).trim()))) {
        indice.set(n, indice.has(n) ? null : p);
      }
    }
    POR_NOMBRE.set(f, indice);
  }
  return indice.get(k) ?? null;
}
const POR_NOMBRE = new WeakMap<Funcionarios, Map<string, Persona | null>>();

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
  sustituido: "Sustitución",
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
  bcrd: "Banco Central (Junta Monetaria)",
};
