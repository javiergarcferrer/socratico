import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { agujas, palabrasDeContenido, plano } from "@/lib/raiz";
import { esRncDeEmpresa, soloCifras } from "@/lib/padron";

/**
 * Las empresas del padrón de contribuyentes de la DGII: todas las personas
 * jurídicas, por su RNC o por su razón social, sin base de datos.
 *
 * Mecánica verificada en docs/AUDITORIA.md §A.2 (el padrón es un ZIP estático
 * sin clave, Windows-1252, que cambia hacia el día 19 de cada mes) y §A.12
 * (la tabla entera del Registro de Proveedores, para el RPE).
 * `scripts/build-empresas.py` lo convierte en build, nunca por request, en
 * `public/data/empresas/`; este módulo solo lee esos archivos (`node:fs`, de
 * servidor) y memoiza cada uno por instancia.
 *
 * **Quién está.** 490,814 personas jurídicas del corte del 19 sep 2026, de
 * 791,384 contribuyentes. No está ninguna persona física: ni las 290,140
 * cédulas, ni los 1,794 RNC de 9 cifras que empiezan por 5, ni las ~8,600
 * personas y sucesiones que el padrón inscribe con RNC de empresa (el script
 * explica cómo se reconocen y cuenta cada grupo en `meta.json`).
 *
 * **Cómo se busca sin base de datos** (medido en esta máquina, node 22, con
 * el corte del 19 sep 2026):
 *
 *  · Por RNC: `meta.json` (8 KB) lleva el primer RNC de cada uno de los 480
 *    bloques de `filas/NNN.tsv.gz` (1,024 empresas por bloque, por orden de
 *    RNC, ~20 KB en gzip). Búsqueda binaria en esa lista, un bloque leído y
 *    descomprimido, y otra búsqueda binaria dentro: 5 ms en frío, 0.1 ms en
 *    caliente (más ~100 ms de cargar este módulo en un proceso nuevo).
 *  · Por nombre: el criterio de toda la casa (`lib/raiz.ts`: todas las
 *    palabras, en cualquier orden, sin tildes, por raíz y al comienzo de
 *    palabra; los números, enteros), resuelto con un índice invertido en vez
 *    de recorrer 490 mil nombres. `indice/<letra>.bin` guarda, para cada
 *    palabra que empieza por esa letra, las empresas que la llevan (deltas
 *    LEB128). Una raíz es un tramo de palabras ordenadas —«reserv» abarca
 *    «reserva», «reservas», «reservaciones»—: búsqueda binaria, unión de sus
 *    listas, y cruce entre las raíces de la consulta. Se lee solo el
 *    fragmento de la inicial de cada raíz (de 13 KB la «x» a 756 KB la «s»;
 *    6.4 MB los 27).
 *    «reservas»: 46 ms en frío y 0.5 ms en caliente; «banco popular», 17 ms;
 *    el peor caso, «srl» (300,704 coincidencias), 122 ms en frío y 90 en
 *    caliente. Con `next start`, la primera petición de una instancia recién
 *    arrancada tarda 0.75 s con todo el arranque de la ruta, y las demás
 *    ~60 ms. En 400 consultas al azar el total es idéntico al de recorrer los
 *    490 mil nombres con `contieneTodas`: el índice no cambia el criterio.
 *  · El orden no necesita leer ningún nombre: `rango.bin` (un byte por
 *    empresa) y las marcas del índice bastan. Primero las que llevan las
 *    palabras tal como se escribieron, después las que **empiezan** por una
 *    de ellas, las activas, las inscritas como proveedoras del Estado (el
 *    único dato público que dice cuál de cien «… RESERVAS SRL» le importa a
 *    esta plataforma: sin él, el Banco de Reservas quedaba fuera de la
 *    primera página de «reservas», detrás de nombres más cortos; con él sale
 *    en el puesto 15) y las de razón social más corta; a igualdad, por RNC.
 *    Solo se descomprimen los bloques de la página que se muestra.
 *
 * Se descartó una lista ordenada de nombres con búsqueda binaria por
 * prefijo: encuentra «banco de reservas» por «banco», no por «reservas», y el
 * criterio de la casa es «cualquier palabra, en cualquier orden». Y se
 * descartó cargar los 27 MB de filas y recorrer sus nombres: 1.3 s y 262 MB
 * por instancia en frío antes de la primera respuesta (474 ms para
 * descomprimirlos, 847 ms para pasarlos por `plano()`), y 40–150 ms por
 * consulta después, frente a leer un fragmento.
 *
 * Nada de esto entra al índice de `/buscar` (`lib/busqueda.ts`): 490 mil
 * nombres de empresa más que triplicarían sus ≈188 mil entradas, que ya
 * cargan en ~0.9 s por instancia.
 */

/** Una persona jurídica del padrón, como la publica la DGII. */
export interface Empresa {
  rnc: string;
  /** La razón social, sin espacios de más; la ñ de cp850 reparada (ver el script). */
  razonSocial: string;
  /** Actividad económica declarada; «» si no declara ninguna. */
  actividad: string;
  /** Inicio de operaciones declarado (ISO), si consta. */
  inicio: string | null;
  /** ACTIVO, SUSPENDIDO, DADO DE BAJA, CESE TEMPORAL, ANULADO o RECHAZADO. */
  estado: string;
  /** NORMAL, RST o PST, tal cual. */
  regimen: string;
  /** Sus inscripciones en el Registro de Proveedores del Estado, la vigente primero. */
  rpe: string[];
}

/** Lo que el script cuenta del corte: con qué se construyó y qué dejó fuera. */
export interface PadronEmpresas {
  generado: string;
  archivoDgii: string;
  /** Día del padrón (ISO), sacado del nombre del archivo de la DGII. */
  corteDgii: string | null;
  contribuyentes: number;
  empresas: number;
  /** Por qué no se publica el resto: cédulas, RNC de personas, sucesiones… */
  fuera: Record<string, number>;
  porEstado: Record<string, number>;
  conRpe: number;
}

interface Meta extends PadronEmpresas {
  porBloque: number;
  estados: string[];
  bloques: string[];
}

export interface ResultadoEmpresas {
  consulta: string;
  /** Las que casan en el padrón entero (un censo, no una muestra). */
  total: number;
  /** La página pedida, ya ordenada. */
  filas: Empresa[];
  pagina: number;
  /** Páginas que se dejan recorrer (hasta `alcance` resultados). */
  paginas: number;
  /** Cuántas coincidencias se dejan recorrer como máximo. */
  alcance: number;
  /** Hay más coincidencias que `alcance`: la lista está truncada. */
  truncado: boolean;
  /** Lo tecleado no dejó ninguna palabra ni cifra que buscar. */
  sinPalabras: boolean;
}

/** Hasta dónde se deja recorrer una búsqueda: veinte páginas de veinticinco. */
export const ALCANCE = 500;
const POR_PAGINA = 25;
/** Bloques descomprimidos que se guardan por instancia (~56 KB cada uno). */
const MAX_BLOQUES = 96;

/* ------------------------------------------------------------ lectura */

let meta: Promise<Meta | null> | null = null;
let actividades: Promise<string[] | null> | null = null;
let rango: Promise<Uint8Array | null> | null = null;

/*
  Cada ruta se escribe entera, con sus carpetas literales: el trazado de
  archivos de Next lee la expresión de `readFile` y, con el nombre en una
  variable, metería `public/data` entero en la función (docs/ARQUITECTURA.md
  §Búsqueda). Así solo viaja `public/data/empresas/`.
*/
function leerMeta(): Promise<Meta | null> {
  meta ??= readFile(join(process.cwd(), "public", "data", "empresas", "meta.json"), "utf8")
    .then((t) => JSON.parse(t) as Meta)
    .catch((err) => {
      console.error("[empresas] meta.json:", err);
      meta = null; // un fallo no se queda pegado en la instancia
      return null;
    });
  return meta;
}

function leerActividades(): Promise<string[] | null> {
  actividades ??= readFile(join(process.cwd(), "public", "data", "empresas", "actividades.json"), "utf8")
    .then((t) => JSON.parse(t) as string[])
    .catch((err) => {
      console.error("[empresas] actividades.json:", err);
      actividades = null;
      return null;
    });
  return actividades;
}

function leerRango(): Promise<Uint8Array | null> {
  rango ??= readFile(join(process.cwd(), "public", "data", "empresas", "rango.bin"))
    .then((b) => new Uint8Array(b.buffer, b.byteOffset, b.byteLength))
    .catch((err) => {
      console.error("[empresas] rango.bin:", err);
      rango = null;
      return null;
    });
  return rango;
}

const bloques = new Map<number, Promise<string[] | null>>();

/** Las líneas de un bloque de filas, sin la vacía del final. */
function leerBloque(n: number): Promise<string[] | null> {
  const hecho = bloques.get(n);
  if (hecho) {
    bloques.delete(n); // el más reciente, al final: se descarta el más viejo
    bloques.set(n, hecho);
    return hecho;
  }
  const p = readFile(
    join(process.cwd(), "public", "data", "empresas", "filas", `${String(n).padStart(3, "0")}.tsv.gz`),
  )
    .then((b) => {
      const lineas = gunzipSync(b).toString("utf8").split("\n");
      if (lineas.at(-1) === "") lineas.pop();
      return lineas;
    })
    .catch((err) => {
      console.error(`[empresas] bloque ${n}:`, err);
      bloques.delete(n);
      return null;
    });
  bloques.set(n, p);
  if (bloques.size > MAX_BLOQUES) bloques.delete(bloques.keys().next().value as number);
  return p;
}

/** Un fragmento del índice: sus palabras ordenadas y dónde empieza la lista de cada una. */
interface Fragmento {
  palabras: string[];
  buf: Buffer;
  /** Byte donde empiezan los n+1 desplazamientos (u32). */
  tabla: number;
  /** Byte donde empiezan las listas. */
  listas: number;
}

const fragmentos = new Map<string, Promise<Fragmento | null>>();

function leerFragmento(clave: string): Promise<Fragmento | null> {
  let p = fragmentos.get(clave);
  if (!p) {
    p = readFile(join(process.cwd(), "public", "data", "empresas", "indice", `${clave}.bin`))
      .then((buf) => {
        if (buf.toString("latin1", 0, 4) !== "EMP1") throw new Error("no es EMP1");
        const n = buf.readUInt32LE(4);
        const largo = buf.readUInt32LE(8);
        const palabras = n > 0 ? buf.toString("latin1", 12, 12 + largo).split("\n") : [];
        const tabla = 12 + largo + ((4 - ((12 + largo) % 4)) % 4);
        return { palabras, buf, tabla, listas: tabla + 4 * (n + 1) };
      })
      .catch((err) => {
        console.error(`[empresas] índice ${clave}:`, err);
        fragmentos.delete(clave);
        return null;
      });
    fragmentos.set(clave, p);
  }
  return p;
}

/* ---------------------------------------------------------- las filas */

function empresaDeLinea(linea: string, m: Meta, acts: string[]): Empresa {
  const [rnc, razonSocial, act, inicio, est, rpe] = linea.split("\t");
  const [estado = "", regimen = ""] = (m.estados[Number(est)] ?? "").split("|");
  return {
    rnc,
    razonSocial,
    actividad: acts[Number(act)] ?? "",
    inicio: /^\d{8}$/.test(inicio ?? "") ? `${inicio.slice(0, 4)}-${inicio.slice(4, 6)}-${inicio.slice(6, 8)}` : null,
    estado,
    regimen,
    rpe: rpe ? rpe.split(",") : [],
  };
}

/** El corte del padrón y lo que se dejó fuera. `null` si la instantánea no está. */
export async function padronEmpresas(): Promise<PadronEmpresas | null> {
  return leerMeta();
}

/**
 * La empresa con ese RNC (con o sin guiones). `null` si la instantánea no
 * está disponible; `undefined` si el número no es de una persona jurídica del
 * padrón (una cédula no se busca: devuelve `undefined` sin leer nada).
 */
export async function empresaPorRnc(texto: string): Promise<Empresa | null | undefined> {
  const rnc = soloCifras(texto);
  if (!esRncDeEmpresa(rnc)) return undefined;
  const [m, acts] = await Promise.all([leerMeta(), leerActividades()]);
  if (!m || !acts) return null;

  // El último bloque cuyo primer RNC no pasa de este.
  let lo = 0;
  let hi = m.bloques.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (m.bloques[mid] <= rnc) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return undefined;
  const lineas = await leerBloque(lo - 1);
  if (!lineas) return null;

  let i = 0;
  let j = lineas.length;
  while (i < j) {
    const mid = (i + j) >> 1;
    if (lineas[mid].slice(0, 9) < rnc) i = mid + 1;
    else j = mid;
  }
  return i < lineas.length && lineas[i].startsWith(`${rnc}\t`) ? empresaDeLinea(lineas[i], m, acts) : undefined;
}

/* ---------------------------------------------------- la búsqueda */

/** Las empresas que llevan una palabra: ids en orden y, por id, dos marcas. */
interface Conjunto {
  ids: Int32Array;
  /** Bit 0: la razón social empieza por esa palabra. Bit 1: la palabra es la tecleada. */
  marcas: Uint8Array;
}

/** Primera posición con palabra ≥ `x` (las palabras van en orden ASCII). */
function desde(palabras: string[], x: string): number {
  let lo = 0;
  let hi = palabras.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (palabras[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** La unión de las listas de varias palabras de un fragmento. */
function unir(f: Fragmento, indices: number[], exacta: (palabra: string) => boolean): Conjunto {
  const valores: number[] = [];
  for (const i of indices) {
    const marca = exacta(f.palabras[i]) ? 2 : 0;
    let p = f.listas + f.buf.readUInt32LE(f.tabla + 4 * i);
    const fin = f.listas + f.buf.readUInt32LE(f.tabla + 4 * i + 4);
    let v = 0;
    while (p < fin) {
      let b = f.buf[p++];
      let d = b & 0x7f;
      let s = 7;
      while (b & 0x80) {
        b = f.buf[p++];
        d |= (b & 0x7f) << s;
        s += 7;
      }
      v += d;
      // id·4 + marcas: el id sale del valor guardado (id·2 + empieza).
      valores.push((v >>> 1) * 4 + (v & 1) + marca);
    }
  }
  const orden = Uint32Array.from(valores);
  if (indices.length > 1) orden.sort();
  const ids = new Int32Array(orden.length);
  const marcas = new Uint8Array(orden.length);
  let k = -1;
  for (const w of orden) {
    const id = w >>> 2;
    if (k >= 0 && ids[k] === id) marcas[k] |= w & 3;
    else {
      k++;
      ids[k] = id;
      marcas[k] = w & 3;
    }
  }
  return { ids: ids.subarray(0, k + 1), marcas: marcas.subarray(0, k + 1) };
}

/** Una raíz: todas las palabras que empiezan por ella. */
function porRaiz(f: Fragmento, raiz: string, tecleadas: Set<string>): Conjunto {
  const ini = desde(f.palabras, raiz);
  const fin = desde(f.palabras, `${raiz}￿`);
  const indices = Array.from({ length: fin - ini }, (_, k) => ini + k);
  return unir(f, indices, (p) => tecleadas.has(p));
}

/**
 * Una cifra, entera: la misma regla que la expresión de `agujas` —ni letra ni
 * cifra pegada a cada lado—. Dentro de una palabra solo puede tocarla un
 * guion («20-30» lleva «30»), y las palabras con guion están todas en `num`.
 */
function porCifra(f: Fragmento, cifra: string): Conjunto {
  const indices: number[] = [];
  if (/^[0-9]/.test(cifra)) {
    f.palabras.forEach((p, i) => {
      for (let at = p.indexOf(cifra); at >= 0; at = p.indexOf(cifra, at + 1)) {
        const antes = at === 0 || p[at - 1] === "-";
        const despues = at + cifra.length === p.length || p[at + cifra.length] === "-";
        if (antes && despues) {
          indices.push(i);
          break;
        }
      }
    });
  } else {
    const fin = desde(f.palabras, `${cifra}￿`);
    for (let i = desde(f.palabras, cifra); i < fin; i++) {
      const p = f.palabras[i];
      if (p === cifra || p.startsWith(`${cifra}-`)) indices.push(i);
    }
  }
  return unir(f, indices, (p) => p === cifra);
}

/** Los ids que están en todos los conjuntos, con cuántas palabras exactas y si empieza por alguna. */
function cruzar(conjuntos: Conjunto[]): { ids: Int32Array; exactas: Uint8Array; empieza: Uint8Array } {
  const [primero, ...resto] = [...conjuntos].sort((a, b) => a.ids.length - b.ids.length);
  let ids = primero.ids;
  let exactas = primero.marcas.map((m) => m >> 1);
  let empieza = primero.marcas.map((m) => m & 1);
  for (const c of resto) {
    const nIds = new Int32Array(ids.length);
    const nEx = new Uint8Array(ids.length);
    const nEm = new Uint8Array(ids.length);
    let k = 0;
    let j = 0;
    for (let i = 0; i < ids.length && j < c.ids.length; i++) {
      // Búsqueda binaria desde donde iba: el conjunto grande puede tener
      // cientos de miles («srl») y el pequeño, diez.
      let lo = j;
      let hi = c.ids.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (c.ids[mid] < ids[i]) lo = mid + 1;
        else hi = mid;
      }
      j = lo;
      if (j < c.ids.length && c.ids[j] === ids[i]) {
        nIds[k] = ids[i];
        nEx[k] = exactas[i] + (c.marcas[j] >> 1);
        nEm[k] = empieza[i] | (c.marcas[j] & 1);
        k++;
      }
    }
    ids = nIds.subarray(0, k);
    exactas = nEx.subarray(0, k);
    empieza = nEm.subarray(0, k);
  }
  return { ids, exactas, empieza };
}

/** Las cifras de la consulta como las deja `agujas`: enteras, sin guiones en los bordes. */
function cifrasDe(consulta: string): string[] {
  return plano(consulta)
    .trim()
    .split(" ")
    .filter((f) => /\d/.test(f))
    .map((f) => f.replace(/^-+|-+$/g, ""))
    .filter(Boolean);
}

/**
 * Las personas jurídicas cuya razón social lleva todas las palabras de la
 * consulta (`lib/raiz.ts`), ordenadas y paginadas. `total` es el censo de
 * coincidencias en el padrón entero; se dejan recorrer las primeras
 * `ALCANCE`, y `truncado` lo dice. `null` si la instantánea no está.
 */
export async function buscarEmpresas(
  consulta: string,
  { limite = POR_PAGINA, pagina = 1 }: { limite?: number; pagina?: number } = {},
): Promise<ResultadoEmpresas | null> {
  const vacio: ResultadoEmpresas = {
    consulta,
    total: 0,
    filas: [],
    pagina: 1,
    paginas: 0,
    alcance: ALCANCE,
    truncado: false,
    sinPalabras: false,
  };
  const a = agujas(consulta);
  const raices = [...new Set(a.raices)];
  const cifras = a.numeros.length > 0 ? [...new Set(cifrasDe(consulta))] : [];
  if (raices.length === 0 && cifras.length === 0) return { ...vacio, sinPalabras: true };

  const tecleadas = new Set(palabrasDeContenido(consulta));
  const [m, acts, r] = await Promise.all([leerMeta(), leerActividades(), leerRango()]);
  if (!m || !acts || !r) return null;

  const pedidos = [
    ...raices.map((x) => ({ clave: /^[a-z]/.test(x) ? x[0] : "num", x, cifra: false })),
    ...cifras.map((x) => ({ clave: /^[a-z]/.test(x) ? x[0] : "num", x, cifra: true })),
  ];
  const leidos = await Promise.all(pedidos.map((p) => leerFragmento(p.clave)));
  if (leidos.some((f) => !f)) return null;
  const conjuntos = pedidos.map((p, i) =>
    p.cifra ? porCifra(leidos[i]!, p.x) : porRaiz(leidos[i]!, p.x, tecleadas),
  );
  const { ids, exactas, empieza } = cruzar(conjuntos);

  // Una clave numérica por coincidencia: menos es antes. El id (orden de
  // RNC; el script no escribe más de 2²¹) va en los 21 bits bajos y el orden
  // encima; en un Float64 caben de sobra (2⁵³).
  const n = Math.min(pedidos.length, 30);
  const claves = new Float64Array(ids.length);
  for (let i = 0; i < ids.length; i++) {
    const byte = r[ids[i]];
    const activa = (byte >> 4) & 1;
    const proveedora = (byte >> 5) & 1;
    const orden =
      ((((n - Math.min(exactas[i], n)) * 2 + (1 - empieza[i])) * 2 + (1 - activa)) * 2 + (1 - proveedora)) * 16 +
      (byte & 15);
    claves[i] = orden * 2 ** 21 + ids[i];
  }
  claves.sort();

  const total = ids.length;
  const porPagina = Math.min(100, Math.max(1, Math.floor(limite) || POR_PAGINA));
  const recorrible = Math.min(total, ALCANCE);
  const paginas = Math.ceil(recorrible / porPagina);
  const actual = Math.min(Math.max(1, Math.floor(pagina) || 1), Math.max(1, paginas));
  const elegidos = Array.from(
    claves.subarray((actual - 1) * porPagina, Math.min(actual * porPagina, recorrible)),
    (c) => c % 2 ** 21,
  );

  const porBloque = new Map<number, number[]>();
  for (const id of elegidos) {
    const b = Math.floor(id / m.porBloque);
    porBloque.set(b, [...(porBloque.get(b) ?? []), id]);
  }
  const leidas = new Map<number, string[] | null>();
  await Promise.all([...porBloque.keys()].map(async (b) => leidas.set(b, await leerBloque(b))));
  if ([...leidas.values()].some((l) => !l)) return null;

  const filas = elegidos.map((id) =>
    empresaDeLinea(leidas.get(Math.floor(id / m.porBloque))![id % m.porBloque], m, acts),
  );
  return {
    ...vacio,
    total,
    filas,
    pagina: actual,
    paginas,
    truncado: total > ALCANCE,
  };
}
