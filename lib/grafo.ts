/**
 * El grafo de la plataforma: qué es un nodo, dónde vive su ficha y cómo se le
 * reconoce en un texto (docs/PLAN-ACCESO.md §6 ter, G1).
 *
 * La regla del horizonte es que todo lo que se ve se puede pulsar e
 * investigar. Para eso cada tipo de nodo tiene **una** dirección, escrita aquí
 * y en ningún otro sitio: antes cada página armaba su `href` a mano —ochenta y
 * siete veces— y bastaba un `encodeURIComponent` olvidado para que un código
 * con barra no abriera su ficha. El gate (`verificar.sh`) rechaza un `href` de
 * entidad armado fuera de este módulo.
 *
 * Nada aquí guarda datos ni los lee: el grafo se **compila** de las mismas
 * fuentes e instantáneas (`lib/grafo-compilado.ts`). El módulo no
 * importa nada pesado, así que lo pueden usar los componentes de cliente; el
 * reconocimiento que necesita datos (nombres de instituciones) vive en
 * `lib/grafo-servidor.ts`.
 */

export type TipoNodo =
  | "institucion"
  | "proveedor"
  | "proceso"
  | "norma"
  | "iniciativa"
  | "expediente-senado"
  | "legislador"
  | "votacion"
  | "obra"
  | "provincia"
  | "capitulo"
  | "cargo"
  | "funcionario"
  | "entidad-financiera"
  | "empresa";

/** El tipo de norma, tal como lo nombra la Consultoría, y su tramo de URL. */
export const RUTA_NORMA: Record<string, string> = {
  ley: "ley",
  decreto: "decreto",
  reglamento: "reglamento",
  resolucion: "resolucion",
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Un número de norma con ficha propia: «47-20», «137-11», «12-2025». */
const NUMERO_NORMA = /^\d{1,4}-\d{2,4}$/;

/**
 * El número como lo escribe la Consultoría. Leyes y decretos llevan el año en
 * dos cifras («Ley 47-25»); un texto que cita «Ley 47-2025» apunta a la misma
 * norma. Las resoluciones conservan el año como venga: las hay con cuatro.
 */
export function numeroCanonico(ruta: string, numero: string): string {
  const n = numero.trim().replace(/\s+/g, "");
  if (ruta !== "ley" && ruta !== "decreto") return n;
  return n.replace(/^(\d{1,4})-(?:19|20)(\d{2})$/, "$1-$2");
}

/** La dirección de cada tipo de nodo. */
export const enlace = {
  /** `/instituciones/5-mopc`; con solo el código, `/instituciones/5` (la ficha lo acepta). */
  institucion(id: number, siglasONombre?: string | null): string {
    const base = sinTildes(siglasONombre ?? "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    return base ? `/instituciones/${id}-${base}` : `/instituciones/${id}`;
  },
  proveedor(rpe: string | number): string {
    return `/proveedores/${encodeURIComponent(String(rpe).trim())}`;
  },
  /** Un RNC o una cédula: la búsqueda del registro, que los resuelve exactos. */
  documentoProveedor(numero: string): string {
    return `/proveedores?q=${encodeURIComponent(numero.replace(/\D/g, ""))}`;
  },
  proceso(codigo: string): string {
    return `/procesos/${encodeURIComponent(codigo.trim())}`;
  },
  /** `null` si el tipo o el número no tienen ficha propia (se enlaza al listado). */
  norma(tipo: string, numero: string): string | null {
    const ruta = RUTA_NORMA[sinTildes(tipo).replace(/^resoluci[oó]n$/, "resolucion")];
    const n = numeroCanonico(ruta ?? "", numero);
    return ruta && NUMERO_NORMA.test(n) ? `/normativa/${ruta}/${n}` : null;
  },
  iniciativa(id: number | string): string {
    return `/congreso/${encodeURIComponent(String(id))}`;
  },
  expedienteSenado(cuatrienio: string, id: number | string): string {
    return `/congreso/senado/${encodeURIComponent(cuatrienio)}/${encodeURIComponent(String(id))}`;
  },
  legislador(id: number | string): string {
    return `/congreso/legisladores/${encodeURIComponent(String(id))}`;
  },
  votacion(id: number | string): string {
    return `/congreso/votaciones/${encodeURIComponent(String(id))}`;
  },
  obra(snip: string | number): string {
    return `/obras/${encodeURIComponent(String(snip).trim())}`;
  },
  provincia(slug: string): string {
    return `/provincias/${encodeURIComponent(slug)}`;
  },
  capitulo(codigo: string): string {
    return `/finanzas/${encodeURIComponent(codigo)}`;
  },
  /** Un cargo no tiene ficha: es la nómina filtrada por él. */
  cargo(nombre: string): string {
    return `/nomina?cargo=${encodeURIComponent(nombre)}`;
  },
  /**
   * Una persona con cargo público: `/funcionarios/luis-rodolfo-abinader-corona`.
   * La clave es su nombre normalizado, nunca la cédula.
   */
  funcionario(slug: string): string {
    return `/funcionarios/${encodeURIComponent(slug.trim())}`;
  },
  /** Los decretos que firmó una persona (el registro de la Consultoría): `/funcionarios/luis-rodolfo-abinader-corona/decretos`. */
  decretosFirmados(slug: string): string {
    return `/funcionarios/${encodeURIComponent(slug.trim())}/decretos`;
  },
  /** Una entidad supervisada (banco, AFP, aseguradora, cooperativa): `/banca/banreservas`. */
  entidadFinanciera(slug: string): string {
    return `/banca/${encodeURIComponent(slug.trim())}`;
  },
  /** Una persona jurídica del padrón de la DGII, por su RNC de nueve cifras: `/empresas/401010062`. */
  empresa(rnc: string | number): string {
    return `/empresas/${String(rnc).replace(/\D/g, "")}`;
  },
  /**
   * Un nodo en el explorador del grafo, por la ruta de su ficha:
   * `/grafo?nodo=/funcionarios/luis-rodolfo-abinader-corona`. Sin ruta, la
   * portada del explorador.
   */
  grafo(ruta?: string | null): string {
    return ruta ? `/grafo?nodo=${enRuta(ruta)}` : "/grafo";
  },
  /** El camino más corto entre dos fichas, en el explorador. */
  caminoGrafo(de: string, a: string): string {
    return `/grafo/camino?de=${enRuta(de)}&a=${enRuta(a)}`;
  },
  /** La descripción RDF de una ficha: Turtle, JSON-LD o N-Triples; TriG o N-Quads, con el grafo de cada triple. */
  rdf(ruta: string, formato: "ttl" | "jsonld" | "nt" | "trig" | "nq" = "ttl"): string {
    return `/api/grafo?nodo=${enRuta(ruta)}&formato=${formato}`;
  },
} as const;

/** Una ruta como valor de consulta, con sus barras legibles (se admiten en la consulta). */
function enRuta(ruta: string): string {
  return encodeURIComponent(ruta).replace(/%2F/gi, "/");
}

/* ------------------------------------------------- nodos del grafo RDF */

/**
 * Los nodos que el grafo semántico describe en RDF (`lib/grafo-rdf.ts`,
 * `/api/grafo`): los que tienen ficha y se leen de una instantánea. El `id`
 * es el de su dirección: el slug de la persona, el código de la institución,
 * el slug de la entidad financiera, el RNC, el número «NNN-AA» del decreto o
 * el slug de la provincia.
 */
export type TipoNodoRdf = "funcionario" | "institucion" | "entidad-financiera" | "empresa" | "decreto" | "provincia";

export interface NodoRdf {
  tipo: TipoNodoRdf;
  id: string;
}

/**
 * La dirección estable de un nodo: la de su ficha, sin el sufijo de nombre de
 * la institución (`/instituciones/5`, que la ficha acepta), para que su IRI no
 * cambie si cambia el nombre.
 */
export function rutaDeNodo(n: NodoRdf): string {
  switch (n.tipo) {
    case "funcionario":
      return enlace.funcionario(n.id);
    case "institucion":
      return enlace.institucion(Number(n.id));
    case "entidad-financiera":
      return enlace.entidadFinanciera(n.id);
    case "empresa":
      return enlace.empresa(n.id);
    case "decreto":
      return enlace.norma("decreto", n.id) ?? `/normativa?q=${encodeURIComponent(n.id)}`;
    case "provincia":
      return enlace.provincia(n.id);
  }
}

/** El nodo que describe una ruta de la plataforma, o `null`. Acepta la ruta con o sin `#id`. */
export function nodoDeRuta(ruta: string): NodoRdf | null {
  const r = ruta.split(/[?#]/)[0].replace(/\/+$/, "");
  let m: RegExpExecArray | null;
  const d = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  if ((m = /^\/funcionarios\/([a-z0-9-]{3,120})$/.exec(r))) return { tipo: "funcionario", id: m[1] };
  if ((m = /^\/instituciones\/(\d{1,7})(?:-[a-z0-9-]*)?$/.exec(r))) return { tipo: "institucion", id: m[1] };
  if ((m = /^\/banca\/([a-z0-9-]{1,120})$/.exec(r))) return { tipo: "entidad-financiera", id: m[1] };
  if ((m = /^\/empresas\/(\d{9})$/.exec(r))) return { tipo: "empresa", id: m[1] };
  if ((m = /^\/normativa\/decreto\/(\d{1,4}-\d{2,4})$/.exec(d(r)))) {
    return { tipo: "decreto", id: numeroCanonico("decreto", m[1]) };
  }
  if ((m = /^\/provincias\/([a-z0-9-]{3,60})$/.exec(r))) return { tipo: "provincia", id: m[1] };
  return null;
}

/* -------------------------------------------------------- reconocimiento */

/** Una mención de un nodo dentro de un texto: dónde está y adónde lleva. */
export interface Mencion {
  inicio: number;
  fin: number;
  tipo: TipoNodo;
  href: string;
}

/*
  «Ley núm. 137-11», «Decreto No. 606-26», «Ley Orgánica 1-12», «Resolución
  núm. 12-2025», «Leyes núms. 506-19 y 68-20». El tipo manda; «núm.», «No.»,
  «número» y «orgánica» son relleno opcional. En «Leyes … y 68-20» cada número
  es su propia mención.
*/
const CITA_NORMA =
  /\b(ley(?:es)?|decretos?|reglamentos?|resoluci(?:o|ó)n(?:es)?)\b((?:\s+(?:org[aá]nica|general|n[uú]m(?:ero)?s?\.?|nos?\.?|n\.\s*[oº°]\.?|[nN][oº°]\.?))*\s*)(\d{1,4}-\d{2,4})((?:\s*(?:,|\by\b)\s*(?:n[uú]m\.?\s*)?\d{1,4}-\d{2,4})*)/giu;

/** Código de proceso de la DGCP: `SIGLAS-XXX-MOD-AAAA-NNNN`. */
const CODIGO_PROCESO = /\b[A-Z0-9]{2,15}(?:-[A-Z0-9]{1,10}){2,4}-\d{4}-\d{3,5}\b/g;

/** «SNIP 12416», «Código SNIP: 12416». */
const SNIP = /\bSNIP\s*(?:n[uú]m\.?\s*|no\.?\s*|:\s*)?(\d{3,7})\b/gi;

function tipoNormaDe(palabra: string): string {
  const t = sinTildes(palabra);
  if (t.startsWith("ley")) return "ley";
  if (t.startsWith("decreto")) return "decreto";
  if (t.startsWith("reglamento")) return "reglamento";
  return "resolucion";
}

/**
 * Las menciones que se reconocen **por su forma**, sin datos: citas de
 * normas, códigos de proceso y números SNIP. Ordenadas y sin solaparse.
 */
export function reconocerPorForma(texto: string): Mencion[] {
  const salida: Mencion[] = [];
  for (const m of texto.matchAll(CITA_NORMA)) {
    const tipo = tipoNormaDe(m[1]);
    const inicio = m.index ?? 0;
    const primero = enlace.norma(tipo, m[3]);
    const finPrimero = inicio + m[1].length + m[2].length + m[3].length;
    if (primero) salida.push({ inicio, fin: finPrimero, tipo: "norma", href: primero });
    // Los números que siguen («y 68-20»): cada uno enlaza a su propia norma.
    if (m[4]) {
      for (const n of m[4].matchAll(/\d{1,4}-\d{2,4}/g)) {
        const href = enlace.norma(tipo, n[0]);
        const i = finPrimero + (n.index ?? 0);
        if (href) salida.push({ inicio: i, fin: i + n[0].length, tipo: "norma", href });
      }
    }
  }
  for (const m of texto.matchAll(CODIGO_PROCESO)) {
    const i = m.index ?? 0;
    salida.push({ inicio: i, fin: i + m[0].length, tipo: "proceso", href: enlace.proceso(m[0]) });
  }
  for (const m of texto.matchAll(SNIP)) {
    const i = m.index ?? 0;
    salida.push({ inicio: i, fin: i + m[0].length, tipo: "obra", href: enlace.obra(m[1]) });
  }
  return sinSolapes(salida);
}

/** Ordena y descarta la mención que pisa a una anterior (gana la más larga). */
export function sinSolapes(menciones: Mencion[]): Mencion[] {
  const orden = [...menciones].sort((a, b) => a.inicio - b.inicio || b.fin - b.inicio - (a.fin - a.inicio));
  const salida: Mencion[] = [];
  for (const m of orden) {
    const ultima = salida.at(-1);
    if (ultima && m.inicio < ultima.fin) continue;
    salida.push(m);
  }
  return salida;
}
