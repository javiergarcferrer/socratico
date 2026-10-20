import { buscarEnTodo, EN_MAYUSCULAS, TIPOS_RESULTADO, type Resultado, type TipoResultado } from "@/lib/busqueda";
import { buscarEmpresas } from "@/lib/empresas";
import { desdeMayusculas } from "@/lib/congreso";
import { enlace, nodoDeRuta, rutaDeNodo, type TipoNodoRdf } from "@/lib/grafo";
import { CLASE_DE_TIPO, buscarNodos, type Candidato } from "@/lib/grafo-rdf";
import { llevaCedula } from "@/lib/padron";
import { CLAVES_FACETA, type Exploracion, type Faceta, type FilaExplorada } from "@/lib/explorar-tipos";

/**
 * La búsqueda del banco de trabajo del grafo (la portada, `/`,
 * docs/INFRAESTRUCTURA.md §7.7): una sola caja que busca a la vez en todas
 * las clases del grafo y en el índice de la plataforma, con las facetas
 * contadas. El inspector vive aparte (`lib/explorar-nodo.ts`) para que su
 * función no cargue el índice.
 *
 * No es otra copia ni otra búsqueda: junta las tres que ya existen —el
 * índice (`buscarEnTodo`), los nombres del grafo compilado (`buscarNodos`) y
 * el padrón de personas jurídicas (`buscarEmpresas`)—, las mismas que usan
 * las fichas, `/grafo` y el servidor MCP.
 */

/** Las facetas que no son un tipo del índice: clases del grafo que se buscan por su nombre. */
const FACETAS_DEL_GRAFO = [
  { clave: "empresa", etiqueta: "Empresas del padrón" },
  { clave: "provincia", etiqueta: "Provincias" },
] as const;

type FacetaGrafo = (typeof FACETAS_DEL_GRAFO)[number]["clave"];
export type ClaveFaceta = TipoResultado | FacetaGrafo;

const ETIQUETA_TIPO = new Map(TIPOS_RESULTADO.map((t) => [t.clave as string, t.etiqueta]));

// La lista que viaja al navegador y los tipos del servidor son la misma: si un tipo del índice cambia, esto no compila.
const _cubre: Record<ClaveFaceta, true> = Object.fromEntries(CLAVES_FACETA.map((c) => [c, true])) as Record<(typeof CLAVES_FACETA)[number], true>;
void _cubre;

export function esFaceta(v: string | null | undefined): v is ClaveFaceta {
  return !!v && (CLAVES_FACETA as readonly string[]).includes(v);
}

/** En qué faceta cuenta un nodo que sale por su nombre. */
const FACETA_DE_NODO: Record<TipoNodoRdf, ClaveFaceta> = {
  funcionario: "funcionario",
  institucion: "institucion",
  "entidad-financiera": "financiera",
  empresa: "empresa",
  decreto: "norma",
  ley: "norma",
  resolucion: "norma",
  provincia: "provincia",
  proveedor: "proveedor",
  proceso: "proceso",
  obra: "obra",
  iniciativa: "iniciativa",
  documento: "documento",
  conjunto: "dato",
  sentencia: "sentencia",
  votacion: "iniciativa",
};

/** Cuántas filas trae una página de una faceta, y cuántas de cada fuente en «Todo». */
const POR_PAGINA = 25;
/** La última página que `/api/explorar/buscar` sirve. */
export const MAX_PAGINAS = 50;
const EMPRESAS_EN_TODO = 3;
/** En «Todo», cuántas filas del índice van antes de las empresas del padrón. */
const EMPRESAS_TRAS = 8;

function filaDeCandidato(c: Candidato): FilaExplorada {
  const ruta = rutaDeNodo(c.nodo);
  return {
    clave: ruta,
    faceta: FACETA_DE_NODO[c.nodo.tipo],
    clase: c.clase,
    titulo: c.nombre,
    detalle: c.detalle,
    origen: null,
    fecha: null,
    valor: null,
    href: ruta,
    externo: false,
    ruta,
    via: "nombre",
  };
}

function filaDeResultado(r: Resultado): FilaExplorada {
  const nodo = r.href && !r.externo ? nodoDeRuta(r.href) : null;
  const ruta = nodo ? rutaDeNodo(nodo) : null;
  return {
    clave: ruta ?? r.href ?? `${r.tipo}:${r.titulo}`,
    faceta: r.tipo,
    clase: nodo ? CLASE_DE_TIPO[nodo.tipo] : (ETIQUETA_TIPO.get(r.tipo) ?? r.tipo),
    titulo: EN_MAYUSCULAS.has(r.tipo) ? desdeMayusculas(r.titulo) : r.titulo,
    detalle: r.detalle,
    origen: r.origen,
    fecha: r.fecha,
    valor: r.valor,
    href: r.href,
    externo: r.externo,
    ruta,
    via: r.via,
  };
}

/**
 * Busca `q` en todo el grafo. Sin faceta, «Todo»: primero los nodos que se
 * llaman así (un nombre, un RNC, «Ley 87-01», un código de proceso), luego
 * las primeras filas del índice, unas pocas empresas del padrón y el resto
 * del índice, sin repetir un nodo; las páginas siguientes recorren el índice. Con
 * faceta, la lista de esa sola clase, paginada. Las cuentas de las facetas se
 * dan siempre sin el filtro, para que cada una diga cuánto hay. `null` si el
 * índice no cargó: «no pudimos mirar» no es «no hay nada».
 */
export async function explorar(q: string, faceta: ClaveFaceta | null, pagina = 1): Promise<Exploracion | null> {
  const consulta = q.trim().slice(0, 120);
  // A una persona no se la busca por su número (`lib/padron.ts`).
  if (!consulta || llevaCedula(consulta)) {
    return { consulta, cedula: llevaCedula(consulta), filas: [], facetas: [], total: 0, pagina: 1, paginas: 1, truncado: false, cortes: {} };
  }
  const tipoIndice = faceta && ETIQUETA_TIPO.has(faceta) ? (faceta as TipoResultado) : undefined;
  const soloGrafo = faceta === "empresa" || faceta === "provincia";
  const [h, nodos, empresas] = await Promise.all([
    buscarEnTodo(consulta, { tipo: tipoIndice, pagina, porPagina: POR_PAGINA }),
    // Los nombres del grafo y el padrón se leen en toda página y con toda
    // faceta: sus cuentas son las de las facetas, que no cambian al filtrar.
    buscarNodos(consulta).catch(() => null),
    buscarEmpresas(consulta, { limite: faceta === "empresa" ? POR_PAGINA : EMPRESAS_EN_TODO, pagina: faceta === "empresa" ? pagina : 1 }).catch(() => null),
  ]);
  if (!h) return null;

  // Los nodos por nombre y las empresas de «Todo» van en la primera página; las siguientes recorren el índice.
  const candidatos = pagina > 1 ? [] : (nodos?.candidatos ?? []).filter((c) => !faceta || FACETA_DE_NODO[c.nodo.tipo] === faceta);
  const filas: FilaExplorada[] = [];
  const vistas = new Set<string>();
  const sumar = (f: FilaExplorada) => {
    if (vistas.has(f.clave)) return;
    vistas.add(f.clave);
    filas.push(f);
  };
  candidatos.forEach((c) => sumar(filaDeCandidato(c)));
  const filasEmpresas = faceta === "empresa" || (!faceta && pagina === 1) ? (empresas?.filas ?? []) : [];
  const deEmpresas = filasEmpresas.map(
    (e): FilaExplorada => ({
      clave: enlace.empresa(e.rnc),
      faceta: "empresa",
      clase: CLASE_DE_TIPO.empresa,
      titulo: e.razonSocial,
      detalle: [`RNC ${e.rnc}`, e.estado ? e.estado.toLocaleLowerCase("es") : null, e.rpe.length ? "inscrita como proveedora del Estado" : null, e.actividad || null]
        .filter(Boolean)
        .join(" · "),
      origen: null,
      fecha: null,
      valor: null,
      href: enlace.empresa(e.rnc),
      externo: false,
      ruta: enlace.empresa(e.rnc),
      via: "nombre",
    }),
  );
  const delIndice = soloGrafo ? [] : h.resultados.map(filaDeResultado);
  // En «Todo», las empresas del padrón van después de los primeros del índice:
  // casan por nombre, y una razón social que repite palabras («Ministerio
  // Haciendo Huellas») no debe tapar lo que el índice ordena por pertinencia.
  const corte = faceta ? 0 : EMPRESAS_TRAS;
  [...delIndice.slice(0, corte), ...deEmpresas, ...delIndice.slice(corte)].forEach(sumar);

  const cuentaCandidatos = (clave: ClaveFaceta) => (nodos?.candidatos ?? []).filter((c) => FACETA_DE_NODO[c.nodo.tipo] === clave).length;
  const facetas: Faceta[] = [
    ...TIPOS_RESULTADO.map((t) => ({ clave: t.clave as string, etiqueta: t.plural, total: Math.max(h.porTipo[t.clave] ?? 0, cuentaCandidatos(t.clave)) })),
    { clave: "empresa", etiqueta: FACETAS_DEL_GRAFO[0].etiqueta, total: empresas?.total ?? cuentaCandidatos("empresa") },
    { clave: "provincia", etiqueta: FACETAS_DEL_GRAFO[1].etiqueta, total: cuentaCandidatos("provincia") },
  ].filter((f) => f.total > 0 || f.clave === faceta);

  const total =
    faceta === "empresa"
      ? (empresas?.total ?? candidatos.length)
      : faceta === "provincia"
        ? candidatos.length
        : faceta
          ? Math.max(h.total, candidatos.length)
          : facetas.reduce((s, f) => s + f.total, 0);
  const paginas = faceta === "empresa" ? Math.max(1, empresas?.paginas ?? 1) : faceta === "provincia" ? 1 : h.paginas;
  return {
    consulta,
    cedula: false,
    filas,
    facetas,
    total,
    pagina: Math.min(pagina, paginas),
    paginas: Math.min(paginas, MAX_PAGINAS),
    truncado: h.truncado || (faceta === "empresa" && !!empresas?.truncado),
    cortes: Object.fromEntries(Object.entries(h.instantaneas).filter((e): e is [string, string] => !!e[1])),
  };
}
