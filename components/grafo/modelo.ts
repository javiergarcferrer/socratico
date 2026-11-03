/**
 * El modelo del lienzo: qué nodos y qué aristas hay, como **función pura** de
 * su estado (las semillas, los nodos expandidos en el orden en que se
 * expandieron, lo que el índice de vecinos dijo de cada uno). Nada de React
 * ni de WebGL: el mismo estado da siempre la misma red, que es lo que hace que
 * un enlace (`nuqs`) reproduzca la vista.
 *
 * Las posiciones de partida también son puras: cada semilla en su sitio de un
 * círculo, cada vecino junto al nodo que lo trajo, a un ángulo y una distancia
 * que salen de su ruta. ForceAtlas2 parte de ahí con un número fijo de
 * iteraciones (`disposicion.worker.ts`), así que el dibujo final también se
 * reproduce.
 */
import type { TipoNodoRdf } from "@/lib/grafo";
import { repartir } from "./repartir";
import { tipoDeRuta } from "./familias";

/** Un vecino tal como lo trae el índice de vecinos del inspector (`claves.nodo`). */
export interface VecinoExpansion {
  ruta: string;
  nombre: string;
  verbo: string;
  detalle: string | null;
  /**
   * La clave del grafo con nombre de donde sale la arista (`lib/grafo-compilado.ts`),
   * si la relación la trae: es lo que pinta macizo (de una fuente) o punteado
   * (derivado por una regla). Hasta que el índice la traiga, `null`.
   */
  grafo: string | null;
  /** El día de la relación (`AristaVista.fecha`, `AAAA-MM-DD`): el cargo, el contrato, el decreto, la votación. */
  fecha: string | null;
}

/** Lo que se sabe de un nodo expandido: su nombre, su tipo y sus vecinos por grupo, en orden. */
export interface Expansion {
  ruta: string;
  titulo: string;
  tipo: TipoNodoRdf | null;
  grupos: { etiqueta: string; total: number; vecinos: VecinoExpansion[] }[];
}

export interface Semilla {
  ruta: string;
  titulo?: string;
  tipo?: TipoNodoRdf | null;
}

/** Una arista que alguien sembró sin expandir (un resultado de SPARQL, un camino). */
export interface AristaSembrada {
  de: string;
  a: string;
  verbo: string;
  grafo?: string | null;
  fecha?: string | null;
}

export type EstiloArista = "macizo" | "punteado";

export interface NodoLienzo {
  ruta: string;
  titulo: string;
  tipo: TipoNodoRdf | null;
  /** El nodo que lo trajo al lienzo, o `null` si es una semilla. */
  padre: string | null;
  expandido: boolean;
  /** De un nodo expandido: cuántos vecinos suyos no entraron por el tope (el inspector los trae todos). */
  restantes: number;
  /** Cuántos vecinos tiene en total, de un nodo expandido. */
  vecinos: number;
  /** La posición de partida para la disposición (pura). */
  sx: number;
  sy: number;
}

export interface AristaLienzo {
  clave: string;
  de: string;
  a: string;
  verbo: string;
  detalle: string | null;
  grafo: string | null;
  fecha: string | null;
  estilo: EstiloArista;
}

export interface Red {
  nodos: Map<string, NodoLienzo>;
  aristas: AristaLienzo[];
  /** Los expandidos que esperan su índice de vecinos. */
  pendientes: string[];
}

/** Cuántos vecinos nuevos trae una expansión, repartidos entre sus grupos. */
export const TOPE_POR_EXPANSION = 24;

/** Un número en [0, 1) que sale de un texto (FNV-1a): la misma ruta, siempre el mismo. */
export function azarDe(texto: string, sal = 0): number {
  let h = (0x811c9dc5 ^ sal) >>> 0;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000;
}

/** La clave de una arista sin dirección: dos nodos, una arista (la primera que se vio manda). */
export function claveArista(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/** Por omisión, una arista es maciza; la ola que traiga `grafo` decide cuáles son derivadas. */
export const estiloPorOmision = (): EstiloArista => "macizo";

export function armarRed({
  semillas,
  expandidos,
  expansiones,
  aristasSembradas = [],
  tope = TOPE_POR_EXPANSION,
  estilo = estiloPorOmision,
}: {
  semillas: Semilla[];
  /** En el orden en que se expandieron: el padre antes que el hijo. */
  expandidos: string[];
  expansiones: ReadonlyMap<string, Expansion>;
  aristasSembradas?: AristaSembrada[];
  tope?: number;
  estilo?: (a: { verbo: string; grafo: string | null; de: string; a: string }) => EstiloArista;
}): Red {
  const nodos = new Map<string, NodoLienzo>();
  const aristas = new Map<string, AristaLienzo>();
  const pendientes: string[] = [];

  const radio = 6 * Math.sqrt(Math.max(1, semillas.length));
  semillas.forEach((s, i) => {
    if (nodos.has(s.ruta)) return;
    const angulo = (2 * Math.PI * i) / Math.max(1, semillas.length) + azarDe(s.ruta) * 0.2;
    const exp = expansiones.get(s.ruta);
    nodos.set(s.ruta, {
      ruta: s.ruta,
      titulo: exp?.titulo ?? s.titulo ?? s.ruta,
      tipo: exp?.tipo ?? s.tipo ?? tipoDeRuta(s.ruta),
      padre: null,
      expandido: false,
      restantes: 0,
      vecinos: 0,
      sx: semillas.length === 1 ? 0 : Math.cos(angulo) * radio,
      sy: semillas.length === 1 ? 0 : Math.sin(angulo) * radio,
    });
  });

  const unir = (de: string, a: string, verbo: string, detalle: string | null, grafo: string | null, fecha: string | null) => {
    if (de === a) return;
    const clave = claveArista(de, a);
    if (aristas.has(clave)) return;
    aristas.set(clave, { clave, de, a, verbo, detalle, grafo, fecha, estilo: estilo({ verbo, grafo, de, a }) });
  };

  for (const ruta of expandidos) {
    const nodo = nodos.get(ruta);
    // Un expandido cuyo padre se contrajo ya no está: no vuelve solo. Si su padre aún se lee, espera con él.
    if (!nodo) {
      if (pendientes.length) pendientes.push(ruta);
      continue;
    }
    const exp = expansiones.get(ruta);
    if (!exp) {
      pendientes.push(ruta);
      continue;
    }
    nodo.titulo = exp.titulo;
    nodo.tipo = exp.tipo ?? nodo.tipo;
    nodo.expandido = true;
    // Los nuevos entran con el tope, repartido por grupo; las aristas con los que ya están, en la segunda pasada.
    const nuevos: VecinoExpansion[][] = [];
    for (const g of exp.grupos) {
      const del: VecinoExpansion[] = [];
      for (const v of g.vecinos) {
        if (v.ruta === ruta || nodos.has(v.ruta)) continue;
        if (!del.some((x) => x.ruta === v.ruta) && !nuevos.some((n) => n.some((x) => x.ruta === v.ruta))) del.push(v);
      }
      if (del.length) nuevos.push(del);
    }
    const entran = repartir(nuevos, tope);
    for (const v of entran) {
      const angulo = azarDe(v.ruta, 1) * 2 * Math.PI;
      const distancia = 2 + azarDe(v.ruta, 2) * 2;
      nodos.set(v.ruta, {
        ruta: v.ruta,
        titulo: expansiones.get(v.ruta)?.titulo ?? v.nombre,
        tipo: expansiones.get(v.ruta)?.tipo ?? tipoDeRuta(v.ruta),
        padre: ruta,
        expandido: false,
        restantes: 0,
        vecinos: 0,
        sx: nodo.sx + Math.cos(angulo) * distancia,
        sy: nodo.sy + Math.sin(angulo) * distancia,
      });
      unir(ruta, v.ruta, v.verbo, v.detalle, v.grafo, v.fecha);
    }
  }

  /*
    Segunda pasada, con la red ya entera: cada expandido se une con todos sus
    vecinos que están, aunque hayan llegado después por otro nodo (un proveedor
    que el tope del ministerio dejó fuera y trajo otro expandido sigue ligado al
    ministerio), y su cuenta de lo que falta se hace sobre lo que quedó.
  */
  for (const ruta of expandidos) {
    const nodo = nodos.get(ruta);
    const exp = expansiones.get(ruta);
    if (!nodo || !exp) continue;
    let total = 0;
    let presentes = 0;
    for (const g of exp.grupos) {
      total += Math.max(g.total, g.vecinos.length);
      for (const v of g.vecinos) {
        if (v.ruta === ruta || !nodos.has(v.ruta)) continue;
        presentes++;
        unir(ruta, v.ruta, v.verbo, v.detalle, v.grafo, v.fecha);
      }
    }
    nodo.vecinos = total;
    nodo.restantes = Math.max(0, total - presentes);
  }

  for (const s of aristasSembradas) {
    if (nodos.has(s.de) && nodos.has(s.a)) unir(s.de, s.a, s.verbo, null, s.grafo ?? null, s.fecha ?? null);
  }

  return { nodos, aristas: [...aristas.values()], pendientes };
}

/**
 * Los expandidos que siguen en pie tras contraer uno: el contraído sale, y
 * con él los que solo estaban por él (se recalcula la red sin él y se quedan
 * los que aún aparecen).
 */
export function contraer(ruta: string, entrada: Parameters<typeof armarRed>[0]): string[] {
  // Lo que hoy no está (su padre aún se lee o falló) no se toca: no depende del nodo que se cierra.
  const antes = armarRed(entrada).nodos;
  let expandidos = entrada.expandidos.filter((r) => r !== ruta);
  // Iterar hasta el punto fijo: quitar un expandido puede dejar sin padre a otro.
  for (;;) {
    const red = armarRed({ ...entrada, expandidos });
    const siguen = expandidos.filter((r) => red.nodos.has(r) || !antes.has(r));
    if (siguen.length === expandidos.length) return siguen;
    expandidos = siguen;
  }
}

/* --------------------------------------------- procedencia y período */

/**
 * De dónde sale una arista: de una fuente del Estado (`fuente`), de una regla
 * de Socrático que la deriva (`regla`), de nadie que el compilado nombre
 * (`sin-dato`: sin grafo, o el de la plataforma, que no es fuente ni regla)
 * o de un grafo que el lienzo todavía no sabe nombrar (`pendiente`: una
 * arista sembrada con su clave cuyos extremos aún no se leyeron). El lienzo
 * la escribe siempre; ninguna arista se dibuja sin decirlo.
 */
export type Procedencia = "fuente" | "regla" | "sin-dato" | "pendiente";

export function procedenciaDe(grafo: string | null, fuentes: ReadonlyMap<string, { derivado: boolean }>): Procedencia {
  if (!grafo || grafo === "plataforma") return "sin-dato";
  const f = fuentes.get(grafo);
  return !f ? "pendiente" : f.derivado ? "regla" : "fuente";
}

/** Una ventana de años, los dos inclusive. */
export type Periodo = readonly [desde: number, hasta: number];

/** El año de una fecha `AAAA-MM-DD` (o `AAAA`); `null` si no trae. */
export function anioDe(fecha: string | null | undefined): number | null {
  const m = fecha ? /^(\d{4})/.exec(fecha) : null;
  return m ? Number(m[1]) : null;
}

/** Los años que cubren las aristas fechadas de la red; `null` si ninguna trae fecha. */
export function aniosDe(aristas: readonly { fecha: string | null }[]): Periodo | null {
  let desde = Infinity;
  let hasta = -Infinity;
  for (const a of aristas) {
    const y = anioDe(a.fecha);
    if (y == null) continue;
    if (y < desde) desde = y;
    if (y > hasta) hasta = y;
  }
  return Number.isFinite(desde) ? [desde, hasta] : null;
}

/** Dónde cae una arista respecto de la ventana: sin ventana, todo está dentro; sin fecha, se queda y se dice. */
export function enPeriodo(fecha: string | null, periodo: Periodo | null): "dentro" | "fuera" | "sin-fecha" {
  const y = anioDe(fecha);
  if (y == null) return "sin-fecha";
  if (!periodo) return "dentro";
  return y >= periodo[0] && y <= periodo[1] ? "dentro" : "fuera";
}

/** Por qué una arista no está en el dibujo, o `null` si está. */
export type Apartada = "periodo" | "procedencia" | null;

/**
 * Qué aristas quedan fuera del dibujo: las de fuera de la ventana de años y,
 * con «solo lo que publica una fuente», las que deriva una regla o no dicen de
 * dónde salen. Pura: el mismo estado de la URL aparta siempre las mismas.
 */
export function apartar(
  aristas: readonly AristaLienzo[],
  { periodo, soloFuente, fuentes }: { periodo: Periodo | null; soloFuente: boolean; fuentes: ReadonlyMap<string, { derivado: boolean }> },
): Map<string, Exclude<Apartada, null>> {
  const salida = new Map<string, Exclude<Apartada, null>>();
  for (const a of aristas) {
    // Lo pendiente no se aparta: no se sabe aún si lo publica una fuente.
    const p = procedenciaDe(a.grafo, fuentes);
    if (soloFuente && (p === "regla" || p === "sin-dato")) salida.set(a.clave, "procedencia");
    else if (enPeriodo(a.fecha, periodo) === "fuera") salida.set(a.clave, "periodo");
  }
  return salida;
}
