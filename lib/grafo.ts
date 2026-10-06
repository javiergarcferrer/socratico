/**
 * El grafo de la plataforma: qué es un nodo, dónde vive su ficha y cómo se le
 * reconoce en un texto (docs/INFRAESTRUCTURA.md §7).
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
   * Un documento de la biblioteca de una institución, por la dirección de su
   * archivo sin el `https://` (`claveDocumento`):
   * `/documentos/ogtic.gob.do/wp-content/uploads/2023/06/Decreto-403-2026.pdf`.
   * Cada tramo va codificado: hay nombres de archivo con tildes y rayas. El
   * archivo está en el sitio de la institución; la ficha lo describe y lo enlaza.
   */
  documento(clave: string): string {
    return `/documentos/${clave.split("/").map(encodeURIComponent).join("/")}`;
  },
  /** La ficha de un documento por la dirección de su archivo; `null` si la dirección no es la de un documento (`claveDocumento`). */
  documentoDeArchivo(url: string): string | null {
    const clave = claveDocumento(url);
    return clave ? enlace.documento(clave) : null;
  },
  /** Un conjunto de datos abiertos, por su nombre en datos.gob.do: `/datos/edesur-abastecimiento-de-la-demanda`. */
  conjunto(slug: string): string {
    return `/datos/${encodeURIComponent(slug.trim())}`;
  },
  /** El mismo conjunto en datos.gob.do, donde están sus archivos. */
  conjuntoOrigen(slug: string): string {
    return `https://datos.gob.do/dataset/${encodeURIComponent(slug.trim())}`;
  },
  /** La ficha de un conjunto por su dirección en datos.gob.do; `null` si la dirección no es la de un conjunto. */
  conjuntoDeOrigen(url: string): string | null {
    const slug = slugDeConjunto(url);
    return slug ? enlace.conjunto(slug) : null;
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
 * el slug de la entidad financiera, el RNC, el número «NNN-AA» del decreto,
 * de la ley o de la resolución, el slug de la provincia, el RPE del
 * proveedor, el código del proceso de compra (tal cual, con sus espacios si
 * los trae), el SNIP de la obra, el número del SIL de la iniciativa, la
 * dirección del archivo sin `https://` del documento (`claveDocumento`) o el
 * nombre en datos.gob.do del conjunto de datos.
 */
export type TipoNodoRdf =
  | "funcionario"
  | "institucion"
  | "entidad-financiera"
  | "empresa"
  | "decreto"
  | "provincia"
  | "proveedor"
  | "proceso"
  | "obra"
  | "ley"
  | "resolucion"
  | "iniciativa"
  | "documento"
  | "conjunto";

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
    case "proveedor":
      return enlace.proveedor(n.id);
    case "proceso":
      return enlace.proceso(n.id);
    case "obra":
      return enlace.obra(n.id);
    case "ley":
    case "resolucion":
      return enlace.norma(n.tipo, n.id) ?? `/normativa?q=${encodeURIComponent(n.id)}`;
    case "iniciativa":
      return enlace.iniciativa(n.id);
    case "documento":
      return enlace.documento(n.id);
    case "conjunto":
      return enlace.conjunto(n.id);
  }
}

/**
 * La clave de documento de un archivo: su dirección sin `https://`, en NFC.
 * `null` si no es https o trae consulta, o un `%`: la ruta de la ficha se
 * descodifica (`nodoDeRuta`) y Next.js puede haberla descodificado ya, así
 * que un `%` del nombre del archivo se leería como un escape (WordPress no
 * los deja en el nombre de lo que se sube). En NFC porque un IRI va en NFC
 * (RFC 3987) y un nombre con tildes puede llegar descompuesto: 145 archivos
 * de la biblioteca se subieron así («Dirección» como «o» más el acento). La
 * dirección tal como la publicó la institución la guarda la biblioteca
 * (`documentoPorClave` de `lib/biblioteca.ts`): el servidor de la
 * institución no iguala las dos formas.
 */
export function claveDocumento(url: string): string | null {
  const m = /^https:\/\/([a-z0-9.-]+\.[a-z]{2,}\/[^?#%]+)$/i.exec(url.trim());
  return m ? m[1].normalize("NFC") : null;
}

/** Las direcciones de los conjuntos en datos.gob.do (`enlace.conjuntoOrigen`). */
const EN_DATOS_GOB = /^https?:\/\/datos\.gob\.do\/dataset\/([^/?#]+)\/?$/;

/** El nombre de un conjunto, de su dirección en datos.gob.do; `null` si no es la de un conjunto. */
export function slugDeConjunto(url: string): string | null {
  const m = EN_DATOS_GOB.exec(url.trim());
  const n = m ? nodoDeRuta(`/datos/${m[1]}`) : null;
  return n?.tipo === "conjunto" ? n.id : null;
}

/**
 * Un código de proceso de la DGCP como lo escribe su tabla: casi siempre
 * `SIGLAS-XXX-MOD-AAAA-NNNN`, pero una unidad de compra puede escribir sus
 * siglas con espacios, puntos o minúsculas («Inst. Nac. de Cancer-DAF-CM-2026-0247»).
 */
const CODIGO_DE_PROCESO = /^[\p{L}\p{N}][\p{L}\p{N} .,&()/_-]{2,79}$/u;

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
  if ((m = /^\/normativa\/(decreto|ley|resolucion)\/(\d{1,4}-\d{2,4})$/.exec(d(r)))) {
    return { tipo: m[1] as "decreto" | "ley" | "resolucion", id: numeroCanonico(m[1], m[2]) };
  }
  // El número del SIL, sin ceros a la izquierda: «/congreso/0158590» es la 158590.
  if ((m = /^\/congreso\/(\d{1,8})$/.exec(r))) return { tipo: "iniciativa", id: String(Number(m[1])) };
  if ((m = /^\/provincias\/([a-z0-9-]{3,60})$/.exec(r))) return { tipo: "provincia", id: m[1] };
  // Sin ceros a la izquierda: «/proveedores/007» es el RPE 7, con un solo IRI.
  if ((m = /^\/proveedores\/(\d{1,8})$/.exec(r))) return { tipo: "proveedor", id: String(Number(m[1])) };
  if ((m = /^\/obras\/(\d{1,8})$/.exec(r))) return { tipo: "obra", id: String(Number(m[1])) };
  if ((m = /^\/procesos\/([^/]+)$/.exec(r))) {
    const codigo = d(m[1]).trim();
    return CODIGO_DE_PROCESO.test(codigo) ? { tipo: "proceso", id: codigo } : null;
  }
  // Un documento: el sitio y la ruta de su archivo, cada tramo descodificado, en NFC (`claveDocumento`).
  if ((m = /^\/documentos\/([a-z0-9.-]+\.[a-z]{2,}(?:\/[^/]+)+)$/i.exec(r))) {
    return { tipo: "documento", id: m[1].split("/").map(d).join("/").normalize("NFC") };
  }
  if ((m = /^\/datos\/([^/]{1,200})$/.exec(r))) {
    const slug = d(m[1]);
    return /^[a-z0-9_-]+$/.test(slug) ? { tipo: "conjunto", id: slug } : null;
  }
  return null;
}

/**
 * El nodo que alguien pide por una dirección: la ruta de una ficha, su IRI
 * entero, la de un conjunto en datos.gob.do o la del archivo de un documento.
 * Solo para lo que se pide (el `id` de `fetch`, `?nodo=` del explorador):
 * cualquier dirección https puede ser un documento, y si lo es lo dice el
 * grafo compilado, no esta función. Para clasificar los IRIs de una
 * descripción, `nodoDeRuta`.
 */
export function nodoDeDireccion(texto: string, sitio: string): NodoRdf | null {
  const x = texto.trim();
  if (x.startsWith("/")) return nodoDeRuta(x);
  if (x.startsWith(`${sitio}/`)) return nodoDeRuta(x.slice(sitio.length));
  if (EN_DATOS_GOB.test(x)) {
    const slug = slugDeConjunto(x);
    return slug ? { tipo: "conjunto", id: slug } : null;
  }
  const clave = claveDocumento(x);
  return clave ? { tipo: "documento", id: clave } : null;
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
