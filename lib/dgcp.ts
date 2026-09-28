import { z } from "zod";
import { etapaPorClave } from "@/lib/estados";
import { pedirJsonOLanzar } from "@/lib/pedir";
import { agujas, contieneTodas, plano } from "@/lib/raiz";
import { SIN_DATO } from "@/lib/format";

const BASE = "https://datosabiertos.dgcp.gob.do/api-dgcp/v1";
const USER_AGENT = "Socratico-Inteligencia/1.0 (compras publicas; herramienta independiente)";

export interface Proceso {
  codigo_proceso: string;
  codigo_unidad_compra: number;
  unidad_compra: string;
  modalidad: string;
  tipo_excepcion: string;
  titulo: string;
  descripcion: string;
  estado_proceso: string;
  divisa: string;
  monto_estimado: number;
  fecha_publicacion: string;
  fecha_enmienda: string;
  fecha_fin_recepcion_ofertas: string;
  fecha_apertura_ofertas: string;
  fecha_estimada_adjudicacion: string;
  fecha_suscripcion: string;
  fecha_habilitacion_oferente: string;
  dirigido_mipymes: string;
  dirigido_mipymes_mujeres: string;
  proceso_lotificado: string;
  es_snip: string;
  codigo_snip: string;
  numero_proveedores_notificados: string;
  area_requiriente: string;
  url: string;
  adquisicion_planeada: string;
  justificacion_no_pacc: string;
  objeto_proceso: string;
  subobjeto_proceso: string;
  decreto_presidencial: string;
  resolucion_maxima_autoridad: string;
  organismo_financiero_externo: string;
  marco_decreto_3122: string;
  compra_verde: string;
  compra_conjunta: string;
  duracion_contrato: string;
}

export interface Articulo {
  codigo_proceso: string;
  fecha_publicacion: string;
  familia_unspsc: string;
  clase_unspsc: string;
  subclase_unspsc: string;
  descripcion_articulo: string;
  cuenta_presupuestaria: string;
  descripcion_usuario: string;
  cantidad: number;
  unidad_medida: string;
  precio_unitario_estimado: number;
  precio_total_estimado: number;
}

export interface Documento {
  nombre_documento: string;
  codigo_proceso: string;
  tipo_documento: string;
  fecha_carga_archivo: string;
  url_documento: string;
}

export interface Contrato {
  codigo_contrato: string;
  codigo_proceso: string;
  estado_contrato: string;
  estado_adjudicacion: string;
  fecha_adjudicacion: string;
  divisa: string;
  valor_contratado: number;
  metodo_pago: string;
  plazo_pago_factura: string;
  descripcion: string;
  fecha_creacion_contrato: string;
  url_contrato: string;
  unidad_compra: string;
  codigo_unidad_compra: string;
  rpe: string;
  razon_social: string;
}

export interface ContratoArticulo {
  codigo_contrato: string;
  codigo_proceso: string;
  familia: string;
  clase: string;
  subclase: string;
  cuenta_presupuestaria: string;
  descripcion_articulo: string;
  descripcion_usuario: string;
  unidad_medida: string;
  cantidad: number;
  precio_unitario: number;
  itbis: number;
  otros_impuestos: number;
  descuentos: number;
  costo_total: number;
  fecha_creacion_contrato: string;
}

export interface DgcpResponse<T> {
  code: number;
  hasError: boolean;
  payload: { content: T[] };
  page?: number;
  limit?: number;
  totalResults?: number;
  pages?: number;
}

export type Params = Record<string, string | number | boolean | undefined | null>;

/**
 * La envoltura de toda respuesta de la API de la DGCP. El contenido de cada
 * ruta tiene su propia forma (y sus propias lecturas defensivas); lo que no
 * puede cambiar sin que la plataforma cuente mal es esto: `payload.content`
 * como lista (o `null` cuando no hay resultados) y los totales.
 */
const ENVOLTURA = z.looseObject({
  hasError: z.unknown(),
  payload: z.looseObject({ content: z.array(z.unknown()).nullish() }).nullish(),
  totalResults: z.number().nullish(),
  pages: z.number().nullish(),
});

export async function dgcpFetch<T>(
  path: string,
  params: Params = {},
  revalidate = 300
): Promise<DgcpResponse<T>> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  // La API pública a veces tarda o falla de forma transitoria: el contrato de
  // la casa (25 s por intento y un único reintento) en `lib/pedir.ts`.
  let crudo: z.infer<typeof ENVOLTURA>;
  try {
    crudo = await pedirJsonOLanzar(url.toString(), {
      fuente: "dgcp",
      ua: USER_AGENT,
      tipo: /json/i,
      cabeceras: { Accept: "application/json" },
      revalidate,
      esquema: ENVOLTURA,
      // `hasError` suele ser un tropiezo del origen: se reintenta una vez.
      comprobar: (d) => (d.hasError === true ? "la API marcó hasError" : null),
    });
  } catch (err) {
    throw new Error(`DGCP ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const data = crudo as unknown as DgcpResponse<T>;
  // Cuando no hay resultados la API devuelve payload.content = null.
  if (!data.payload) data.payload = { content: [] };
  if (!Array.isArray(data.payload.content)) data.payload.content = [];
  return data;
}

export function normalize(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** Máximo de páginas de 1000 registros a barrer cuando hay que filtrar aquí. */
const MAX_PAGINAS_BARRIDO = 6;

export type OrdenProceso = "recientes" | "cierre" | "monto_desc" | "monto_asc";

export const ORDENES: OrdenProceso[] = [
  "recientes",
  "cierre",
  "monto_desc",
  "monto_asc",
];

/** El día calendario dominicano de hoy, `YYYY-MM-DD`. */
const DIA_RD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santo_Domingo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Ordena **en sitio** la lista ya filtrada.
 *
 * Dos trampas, las dos del mismo sitio: la fecha de cierre.
 *
 * La primera es aritmética. Antes se comparaba con `new Date(...).getTime()`,
 * y una fecha vacía o corrupta —que el registro tiene— produce `NaN`: un
 * comparador que devuelve `NaN` deja el orden indefinido y mueve filas al azar
 * entre dos renders de la misma consulta. Por eso pasa por `fechaValida`.
 *
 * La segunda es de sentido, y es la que muerde. «Cierre más próximo»
 * ascendente a secas encabeza con los plazos **ya vencidos**, que son los más
 * antiguos. Y un proceso «Proceso publicado» con la recepción vencida no es
 * una rareza: la institución tarda en mover el estado, y por eso `cierreMeta`
 * tiene una rama «Recepción cerrada» para un estado abierto. Mientras esto
 * ordenaba las 24 filas de una página apenas se notaba; ordenando la ventana
 * entera, la primera página se llenaba de lo que ya no se puede ofertar —justo
 * lo contrario de lo que pide quien toca «Cierran pronto»—. Así que se
 * particiona: primero lo que todavía cierra, del más próximo al más lejano;
 * después lo vencido, de lo más reciente a lo más antiguo; al final lo que no
 * tiene fecha legible. Para una etapa ya cerrada la primera partición viene
 * vacía y se lee como «lo que cerró más recientemente», que es lo correcto ahí.
 */
function ordenar(lista: Proceso[], orden: OrdenProceso): Proceso[] {
  switch (orden) {
    case "cierre": {
      const hoy = DIA_RD.format(Date.now());
      const fecha = (p: Proceso) => fechaValida(p.fecha_fin_recepcion_ofertas);
      // 0 = todavía cierra · 1 = ya venció · 2 = sin fecha legible.
      const grupo = (f: string | null) => (f === null ? 2 : f >= hoy ? 0 : 1);
      return lista.sort((a, b) => {
        const fa = fecha(a);
        const fb = fecha(b);
        const ga = grupo(fa);
        const gb = grupo(fb);
        if (ga !== gb) return ga - gb;
        if (fa === null || fb === null) return 0;
        return ga === 0 ? fa.localeCompare(fb) : fb.localeCompare(fa);
      });
    }
    case "monto_desc":
      return ordenarPorMonto(lista, "desc");
    case "monto_asc":
      return ordenarPorMonto(lista, "asc");
    default:
      return lista;
  }
}

/**
 * Ordena por monto **dentro del peso dominicano**.
 *
 * `monto_estimado` viene sin escala común: el registro publica también procesos
 * en dólares y en euros, y por eso cada fila lleva su `divisa` y `formatMonto`
 * la respeta. Restarlos en crudo pone US$500.000 por debajo de RD$1.000.000,
 * y esconde justamente las obras y la infraestructura, que son las grandes.
 * Convertir no es opción: la plataforma no tiene tasa de cambio y fabricarla
 * sería inventar el ancla de una cifra, que es lo que la identidad prohíbe.
 *
 * Así que el ranking se declara acotado —el control dice «(RD$)»— y lo que no
 * está en pesos va al final con su divisa a la vista, sin fingir que compite
 * en la misma escala.
 */
function ordenarPorMonto(lista: Proceso[], sentido: "asc" | "desc"): Proceso[] {
  const esPeso = (p: Proceso) => !p.divisa || /^(dop|rd\$?)$/i.test(p.divisa.trim());
  return lista.sort((a, b) => {
    const pa = esPeso(a);
    const pb = esPeso(b);
    if (pa !== pb) return pa ? -1 : 1;
    const ma = a.monto_estimado ?? 0;
    const mb = b.monto_estimado ?? 0;
    return sentido === "desc" ? mb - ma : ma - mb;
  });
}

export interface SearchResult {
  content: Proceso[];
  totalResults: number;
  pages: number;
  page: number;
  /** Registros recorridos upstream (solo cuando hubo que barrer). */
  scanned?: number;
  /** true si el barrido no alcanzó todos los registros del rango. */
  truncated?: boolean;
  /** true si el conteo sale del barrido y no del censo que declara la API. */
  muestra?: boolean;
}

export interface FiltrosProcesos {
  q?: string;
  proceso?: string;
  etapa?: string;
  modalidad?: string;
  unidad_compra?: number;
  startdate?: string;
  enddate?: string;
  mipyme?: string;
  mipyme_mujer?: string;
  orden?: OrdenProceso;
}

/** Código de proceso de la DGCP: `SIGLAS-XXX-MOD-AAAA-NNNN`, en cualquier caja. */
const FORMA_CODIGO = /^[A-Z0-9]{2,15}(?:-[A-Z0-9]{1,10}){2,4}-\d{4}-\d{3,5}$/i;

/**
 * Un texto con forma de código de proceso es una búsqueda exacta, no de
 * texto: va al filtro `proceso` que la API honra sobre el registro entero y
 * deja fuera la etapa y las fechas. Antes se buscaba como texto dentro de las
 * seis mil filas del barrido y un proceso de hace un mes no aparecía nunca.
 */
export function filtrosEfectivos<T extends FiltrosProcesos>(opts: T): T {
  const q = opts.q?.trim();
  if (!q || opts.proceso || !FORMA_CODIGO.test(q)) return opts;
  return { ...opts, q: undefined, proceso: q.toUpperCase(), etapa: undefined, startdate: undefined, enddate: undefined };
}

function paramsComunes(opts: FiltrosProcesos): Params {
  const etapa = etapaPorClave(opts.etapa);
  return {
    proceso: opts.proceso,
    estado: etapa?.estadoUnico,
    modalidad: opts.modalidad,
    unidad_compra: opts.unidad_compra,
    startdate: opts.startdate,
    enddate: opts.enddate,
    mipyme: opts.mipyme,
    mipyme_mujer: opts.mipyme_mujer,
  };
}

interface Barrido {
  filtrados: Proceso[];
  scanned: number;
  truncated: boolean;
  /** Censo que declara el origen para los filtros que él entiende. */
  censo: number;
}

/**
 * Hasta `MAX_PAGINAS_BARRIDO` páginas de 1000 dentro de los filtros que la API
 * entiende; aquí se filtra por texto y por etapa y se ordena. Lo comparten el
 * listado paginado y la descarga del barrido entero, así que las dos leen las
 * mismas URLs y el mismo caché de `fetch`.
 */
async function barrerProcesos(opts: FiltrosProcesos): Promise<Barrido> {
  const etapa = etapaPorClave(opts.etapa);
  const filtrarAqui = Boolean(etapa && !etapa.estadoUnico);
  const common = paramsComunes(opts);
  const q = opts.q?.trim();
  const orden = opts.orden ?? "recientes";

  const first = await dgcpFetch<Proceso>("/procesos", { ...common, page: 1, limit: 1000 });
  /*
    `pages` es lo que declara el origen, pero no siempre viene. Cayendo a 1 se
    barre una sola página y se informa `truncated: false`: se afirmaría haber
    contado todo el rango tras mirar mil registros de los que hubiera. Si falta
    `pages`, el censo dice cuántas páginas son.
  */
  const censo = first.totalResults ?? first.payload.content.length;
  const upstreamPages = first.pages ?? Math.max(1, Math.ceil(censo / 1000));
  const aBarrer = Math.min(upstreamPages, MAX_PAGINAS_BARRIDO);
  let all = first.payload.content;
  let fallos = 0;
  if (aBarrer > 1) {
    const rest = await Promise.all(
      Array.from({ length: aBarrer - 1 }, (_, i) =>
        dgcpFetch<Proceso>("/procesos", { ...common, page: i + 2, limit: 1000 }).catch(
          () => null,
        ),
      ),
    );
    for (const r of rest) {
      if (r) all = all.concat(r.payload.content);
      else fallos += 1;
    }
  }

  let filtrados = all;
  if (etapa && filtrarAqui) {
    filtrados = filtrados.filter((p) => etapa.coincide(p.estado_proceso));
  }
  if (q) {
    // Todas las palabras, en cualquier orden y por raíz (`lib/raiz.ts`):
    // «reparacion porton» encuentra «Reparación del Portón». Antes se buscaba
    // la frase entera y dos espacios seguidos ya no encontraban nada.
    const a = agujas(q);
    filtrados = filtrados.filter((p) =>
      contieneTodas(
        plano(`${p.titulo} ${p.descripcion} ${p.unidad_compra} ${p.codigo_proceso} ${p.area_requiriente}`),
        a,
      ),
    );
  }

  ordenar(filtrados, orden);

  return {
    filtrados,
    scanned: all.length,
    // Una página caída deja el rango incompleto igual que quedarse corto de
    // páginas: las dos cosas son lo mismo para quien lee el conteo.
    truncated: upstreamPages > aBarrer || fallos > 0,
    censo,
  };
}

/** Tope de filas de la descarga: el mismo barrido que el listado declara. */
export const MAX_FILAS_DESCARGA = MAX_PAGINAS_BARRIDO * 1000;

export interface DescargaProcesos {
  filas: Proceso[];
  /** Registros recorridos upstream. */
  scanned: number;
  /** El rango tenía más registros que el barrido. */
  truncated: boolean;
  censo: number;
}

/**
 * Todo el conjunto que el buscador declara haber leído con esos filtros, no
 * solo la página de 24: la descarga «del barrido». Siempre barre (aunque no
 * haya texto ni etapa), acotado a `MAX_FILAS_DESCARGA`, y devuelve
 * `scanned`/`truncated` para que el archivo diga su alcance.
 */
export async function descargarProcesos(pedidos: FiltrosProcesos): Promise<DescargaProcesos> {
  const opts = filtrosEfectivos(pedidos);
  const b = await barrerProcesos(opts);
  return { filas: b.filtrados, scanned: b.scanned, truncated: b.truncated, censo: b.censo };
}

/**
 * Lista procesos.
 *
 * Dos caminos, y la diferencia se declara en la respuesta:
 *
 *  - **Passthrough** — sin texto, sin etapa que la API no sepa filtrar y sin
 *    orden distinto del natural. Una petición; `totalResults` es el censo del
 *    origen.
 *  - **Barrido** — `barrerProcesos`: hasta `MAX_PAGINAS_BARRIDO` páginas de
 *    1000, y aquí se filtra, se ordena y se pagina. `totalResults` es entonces
 *    lo hallado **en la muestra**, y `scanned`/`truncated`/`muestra` obligan a
 *    la interfaz a decirlo.
 *
 * Que un orden distinto de «recientes» fuerce el barrido no es un capricho de
 * coste: ordenar es rankear, y rankear las 24 filas de una página mientras el
 * control dice «Mayor monto» es afirmar algo falso sobre miles de procesos.
 * O se ordena todo lo que se declaró leer, o no se ofrece el orden.
 */
export async function listProcesos(
  pedidos: FiltrosProcesos & { page?: number; limit?: number },
): Promise<SearchResult> {
  const opts = filtrosEfectivos(pedidos);
  const etapa = etapaPorClave(opts.etapa);
  // Una etapa de un solo estado la filtra la API; las demás hay que barrerlas.
  const filtrarAqui = Boolean(etapa && !etapa.estadoUnico);
  const q = opts.q?.trim();
  const orden = opts.orden ?? "recientes";
  // Un número que no es número («?page=abc») no llega a la DGCP como NaN.
  const entero = (v: number | undefined, d: number) => (Number.isFinite(v) ? Math.trunc(v!) : d);
  const limit = Math.min(1000, Math.max(1, entero(opts.limit, 24)));
  const page = Math.max(1, entero(opts.page, 1));

  if (!q && !filtrarAqui && orden === "recientes") {
    const data = await dgcpFetch<Proceso>("/procesos", { ...paramsComunes(opts), page, limit });
    return {
      content: data.payload.content,
      totalResults: data.totalResults ?? data.payload.content.length,
      pages: data.pages ?? 1,
      page: data.page ?? page,
    };
  }

  const { filtrados, scanned, truncated } = await barrerProcesos(opts);
  const inicio = (page - 1) * limit;
  return {
    content: filtrados.slice(inicio, inicio + limit),
    totalResults: filtrados.length,
    pages: Math.max(1, Math.ceil(filtrados.length / limit)),
    page,
    scanned,
    truncated,
    muestra: true,
  };
}

export async function getProceso(codigo: string): Promise<{
  proceso: Proceso | null;
  articulos: Articulo[];
  documentos: Documento[];
  contratos: Contrato[];
}> {
  const [proc, arts, docs, ctos] = await Promise.all([
    dgcpFetch<Proceso>("/procesos", { proceso: codigo, limit: 5 }).catch(() => null),
    dgcpFetch<Articulo>("/procesos/articulos", { proceso: codigo, limit: 200 }).catch(
      () => null
    ),
    dgcpFetch<Documento>("/procesos/documentos", { proceso: codigo }).catch(() => null),
    dgcpFetch<Contrato>("/contratos", { proceso: codigo, limit: 50 }).catch(() => null),
  ]);
  return {
    proceso: proc?.payload.content[0] ?? null,
    articulos: arts?.payload.content ?? [],
    documentos: docs?.payload.content ?? [],
    contratos: ctos?.payload.content ?? [],
  };
}

export interface UnidadCompra {
  codigo: number;
  nombre: string;
  acronimo: string;
}

interface UnidadCompraRaw {
  codigo_unidad_compra: number;
  unidad_compra: string;
  acronimo: string;
  estado: string;
}

export async function getUnidadesCompra(): Promise<UnidadCompra[]> {
  const data = await dgcpFetch<UnidadCompraRaw>(
    "/unidades_compra",
    { limit: 1000 },
    86400
  );
  return data.payload.content
    .filter((u) => u.estado === "ACTIVA")
    .map((u) => ({
      codigo: u.codigo_unidad_compra,
      nombre: u.unidad_compra,
      acronimo: u.acronimo,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export interface PreciosStats {
  subclase: string;
  muestras: number;
  min: number;
  mediana: number;
  max: number;
  ejemplos: ContratoArticulo[];
}

/**
 * Estadísticas de precios unitarios realmente contratados para una subclase
 * UNSPSC, sobre los últimos ~1000 artículos de contrato registrados.
 */
export async function getPreciosSubclase(subclase: string): Promise<PreciosStats> {
  const data = await dgcpFetch<ContratoArticulo>(
    "/contratos/articulos",
    { subclase, limit: 1000 },
    3600
  );
  const items = data.payload.content;
  const precios = items
    .map((a) => a.precio_unitario)
    .filter((v) => typeof v === "number" && v > 0)
    .sort((a, b) => a - b);
  const mediana =
    precios.length === 0
      ? 0
      : precios.length % 2
        ? precios[(precios.length - 1) / 2]
        : (precios[precios.length / 2 - 1] + precios[precios.length / 2]) / 2;
  const ejemplos = [...items]
    .filter((a) => a.precio_unitario > 0)
    .sort(
      (a, b) =>
        new Date(b.fecha_creacion_contrato).getTime() -
        new Date(a.fecha_creacion_contrato).getTime()
    )
    .slice(0, 8);
  return {
    subclase,
    muestras: precios.length,
    min: precios[0] ?? 0,
    mediana,
    max: precios[precios.length - 1] ?? 0,
    ejemplos,
  };
}

/* --------------------------------------------------- histórico de contratos */

/**
 * El endpoint `/contratos` **ignora los filtros de fecha**: sirve siempre los
 * contratos de más reciente a más antiguo (1000 por página, ~8 días por
 * página). Solo `proceso` y `rpe` filtran de verdad. Así que el análisis del
 * histórico se hace, como la búsqueda de procesos, escaneando un número
 * acotado de páginas recientes y agregando del lado del servidor, declarando
 * siempre que es una muestra y no el corpus completo (714k+ contratos).
 */
const MAX_CONTRATOS_PAGES = 6;

/** Estados de contrato que cuentan como adjudicación en firme. */
const ESTADOS_VIGENTES = new Set(["Activo", "Modificado", "Cerrado"]);

export interface AgregadoContrato {
  clave: string;
  n: number;
  monto: number;
  /** Datos extra según el agregado (rpe del proveedor, etc.). */
  rpe?: string;
  /** Código de unidad de compra, cuando el agregado es una institución. */
  codigo?: string;
}

export interface PuntoMensual {
  /** `YYYY-MM`. */
  mes: string;
  n: number;
  monto: number;
}

export interface ResumenContratos {
  /** Contratos realmente recorridos upstream. */
  escaneados: number;
  /** Censo declarado por la API (todo el registro, no la muestra). */
  totalRegistro: number;
  /** true si el registro es mayor que lo escaneado (siempre, en la práctica). */
  truncado: boolean;
  /** Ventana temporal cubierta por la muestra. */
  desde: string | null;
  hasta: string | null;
  montoTotal: number;
  conMonto: number;
  topAdjudicatarios: AgregadoContrato[];
  topInstituciones: AgregadoContrato[];
  porMes: PuntoMensual[];
  porEstado: AgregadoContrato[];
  /** Los más recientes, ya ordenados, para una tabla de detalle. */
  recientes: Contrato[];
}

/**
 * `YYYY-MM-DD` con mes 01-12 y día 01-31, o `null`. El registro de la DGCP
 * trae fechas corruptas (mes `00`, días fuera de rango) que envenenarían la
 * ventana temporal y la tendencia mensual si se colaran.
 */
function fechaValida(iso: string | null | undefined): string | null {
  const f = (iso ?? "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f);
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  // El año también viene corrupto (`2202-…`), y uno solo estira la ventana
  // temporal a siglos: la nota «en los últimos N días» pasaría a decir 64,000.
  // El registro no tiene contrataciones anteriores a los noventa ni puede
  // fechar una adjudicación más allá del año que viene.
  if (anio < 1990 || anio > new Date().getFullYear() + 1) return null;
  return f;
}

function acumular(mapa: Map<string, AgregadoContrato>, clave: string, monto: number, rpe?: string) {
  const k = clave || SIN_DATO;
  const a = mapa.get(k) ?? { clave: k, n: 0, monto: 0, rpe };
  a.n += 1;
  a.monto += monto;
  mapa.set(k, a);
}

/**
 * Como `acumular`, pero la llave es el código de unidad de compra: dos
 * grafías del mismo nombre no parten a una institución en dos, y el código
 * es lo que enlaza con su ficha (`lib/instituciones.ts`).
 */
function acumularInstitucion(
  mapa: Map<string, AgregadoContrato>,
  codigo: string | number | null | undefined,
  nombre: string,
  monto: number,
) {
  const cod = codigo === null || codigo === undefined ? "" : String(codigo).trim();
  const k = cod || `n:${nombre || SIN_DATO}`;
  const a = mapa.get(k) ?? { clave: nombre || SIN_DATO, n: 0, monto: 0, codigo: cod || undefined };
  a.n += 1;
  a.monto += monto;
  mapa.set(k, a);
}

/**
 * Muestra agregada de los contratos adjudicados más recientes. `paginas`
 * controla la profundidad (cada una son 1000 contratos, ~8 días).
 */
interface VentanaContratos {
  contratos: Contrato[];
  /** Censo que declara la API para todo el registro. */
  totalRegistro: number;
  /** true si el registro es mayor que lo escaneado (siempre, en la práctica). */
  truncado: boolean;
}

/**
 * Las `paginas` más recientes del registro de contratos, de 1000 en 1000.
 *
 * Es el barrido que comparten el histórico (`muestrearContratos`) y el mercado
 * por proveedor (`muestrearProveedores`): mismas URLs, misma ventana de caché,
 * así que la segunda vista no vuelve a pagar el viaje a la DGCP. Que ambas
 * pidan el mismo número de páginas no es cosmético — es lo que hace que
 * compartan el caché de `fetch`.
 */
async function paginasDeContratos(paginas: number): Promise<VentanaContratos> {
  const first = await dgcpFetch<Contrato>("/contratos", { page: 1, limit: 1000 }, 1800);
  const totalRegistro = first.totalResults ?? first.payload.content.length;
  const upstreamPages = first.pages ?? 1;
  const aEscanear = Math.min(upstreamPages, Math.max(1, paginas));

  let contratos = first.payload.content;
  if (aEscanear > 1) {
    const rest = await Promise.all(
      Array.from({ length: aEscanear - 1 }, (_, i) =>
        dgcpFetch<Contrato>("/contratos", { page: i + 2, limit: 1000 }, 1800).catch(
          () => null,
        ),
      ),
    );
    for (const r of rest) if (r) contratos = contratos.concat(r.payload.content);
  }

  return { contratos, totalRegistro, truncado: upstreamPages > aEscanear };
}

/**
 * La misma ventana que `muestrearContratos`, fila por fila, para descargarla:
 * mismas URLs, mismo caché. `truncado` y `totalRegistro` dicen su alcance.
 */
export async function contratosRecientes(
  paginas = MAX_CONTRATOS_PAGES,
): Promise<{ contratos: Contrato[]; totalRegistro: number; truncado: boolean }> {
  return paginasDeContratos(paginas);
}

export async function muestrearContratos(
  paginas = MAX_CONTRATOS_PAGES,
): Promise<ResumenContratos> {
  const {
    contratos: todos,
    totalRegistro,
    truncado,
  } = await paginasDeContratos(paginas);

  const adjudicatarios = new Map<string, AgregadoContrato>();
  const instituciones = new Map<string, AgregadoContrato>();
  const meses = new Map<string, PuntoMensual>();
  const estados = new Map<string, AgregadoContrato>();

  let montoTotal = 0;
  let conMonto = 0;
  let desde: string | null = null;
  let hasta: string | null = null;

  for (const c of todos) {
    const monto = c.valor_contratado || 0;
    // Solo montos de adjudicaciones vigentes entran en los totales; los
    // cancelados/rescindidos se cuentan aparte y no inflan el gasto.
    const cuenta = ESTADOS_VIGENTES.has(c.estado_contrato);
    if (cuenta && monto > 0) {
      montoTotal += monto;
      conMonto += 1;
      acumular(adjudicatarios, c.razon_social, monto, c.rpe);
      acumularInstitucion(instituciones, c.codigo_unidad_compra, c.unidad_compra, monto);
    }
    acumular(estados, c.estado_contrato || SIN_DATO, monto);

    const fecha = fechaValida(c.fecha_adjudicacion);
    if (fecha) {
      if (!desde || fecha < desde) desde = fecha;
      if (!hasta || fecha > hasta) hasta = fecha;
      const mes = fecha.slice(0, 7);
      const p = meses.get(mes) ?? { mes, n: 0, monto: 0 };
      p.n += 1;
      if (cuenta && monto > 0) p.monto += monto;
      meses.set(mes, p);
    }
  }

  // Solo meses con presencia real: un puñado de contratos mal fechados no debe
  // pintar una barra fantasma en la tendencia.
  const minMes = Math.max(3, Math.round(todos.length * 0.002));
  const porMes = [...meses.values()]
    .filter((m) => m.n >= minMes)
    .sort((a, b) => a.mes.localeCompare(b.mes));

  const top = (m: Map<string, AgregadoContrato>, n: number) =>
    [...m.values()].sort((a, b) => b.monto - a.monto).slice(0, n);

  const recientes = [...todos]
    .sort(
      (a, b) =>
        new Date(b.fecha_adjudicacion).getTime() -
        new Date(a.fecha_adjudicacion).getTime(),
    )
    .slice(0, 40);

  return {
    escaneados: todos.length,
    totalRegistro,
    truncado,
    desde,
    hasta,
    montoTotal,
    conMonto,
    topAdjudicatarios: top(adjudicatarios, 12),
    topInstituciones: top(instituciones, 12),
    porMes,
    porEstado: [...estados.values()].sort((a, b) => b.n - a.n),
    recientes,
  };
}

/* ----------------------------------------- el mercado, visto por proveedor */

export interface ProveedorEnMercado {
  rpe: string;
  razonSocial: string;
  /** Adjudicaciones vigentes con monto dentro de la ventana. */
  contratos: number;
  monto: number;
  /** Instituciones distintas que le adjudicaron en la ventana. */
  instituciones: number;
  /** Su adjudicación más reciente dentro de la ventana. */
  ultima: string | null;
}

export interface MercadoProveedores {
  /** Contratos realmente recorridos upstream. */
  escaneados: number;
  /** Censo de contratos que declara la API (todo el registro, no la muestra). */
  totalRegistro: number;
  truncado: boolean;
  /** Ventana temporal cubierta por la muestra. */
  desde: string | null;
  hasta: string | null;
  /** Suma de las adjudicaciones vigentes de la ventana. */
  montoTotal: number;
  /** Los proveedores de la ventana, de mayor a menor monto. */
  proveedores: ProveedorEnMercado[];
}

/**
 * Quién le vende al Estado ahora mismo, agregado **por RPE** sobre la misma
 * ventana de contratos que alimenta `/contratos`.
 *
 * Por qué por RPE y no por razón social, como hace `muestrearContratos`: ahí
 * el nombre es la etiqueta que se lee; aquí el proveedor es una entidad con
 * ficha propia, y su identidad es el RPE —el registro escribe el mismo nombre
 * de varias formas y la API responde por número—. Un contrato sin RPE queda
 * fuera: no hay ficha a la que enlazar.
 *
 * Es una **muestra**, nunca el censo. El Registro de Proveedores del Estado
 * tiene ~128 mil inscritos; esta ventana solo ve a los que ganaron algo en las
 * últimas semanas, que es una pregunta distinta y más útil.
 */
export async function muestrearProveedores(
  paginas = MAX_CONTRATOS_PAGES,
): Promise<MercadoProveedores> {
  const { contratos, totalRegistro, truncado } = await paginasDeContratos(paginas);

  interface Acumulado {
    rpe: string;
    razonSocial: string;
    contratos: number;
    monto: number;
    instituciones: Set<string>;
    ultima: string | null;
  }
  const porRpe = new Map<string, Acumulado>();

  let montoTotal = 0;
  let desde: string | null = null;
  let hasta: string | null = null;

  for (const c of contratos) {
    const fecha = fechaValida(c.fecha_adjudicacion);
    if (fecha) {
      if (!desde || fecha < desde) desde = fecha;
      if (!hasta || fecha > hasta) hasta = fecha;
    }

    // Mismo criterio que el histórico: solo adjudicaciones en firme y con
    // monto entran en el dinero. Canceladas y rescindidas no inflan a nadie.
    const monto = c.valor_contratado || 0;
    if (!ESTADOS_VIGENTES.has(c.estado_contrato) || monto <= 0) continue;

    const rpe = String(c.rpe ?? "").trim();
    if (!rpe) continue;

    montoTotal += monto;
    const a: Acumulado = porRpe.get(rpe) ?? {
      rpe,
      razonSocial: c.razon_social || `Proveedor RPE ${rpe}`,
      contratos: 0,
      monto: 0,
      instituciones: new Set<string>(),
      ultima: null,
    };
    a.contratos += 1;
    a.monto += monto;
    if (c.unidad_compra) a.instituciones.add(c.unidad_compra);
    if (fecha && (!a.ultima || fecha > a.ultima)) a.ultima = fecha;
    porRpe.set(rpe, a);
  }

  const proveedores = [...porRpe.values()]
    .map((a) => ({
      rpe: a.rpe,
      razonSocial: a.razonSocial,
      contratos: a.contratos,
      monto: a.monto,
      instituciones: a.instituciones.size,
      ultima: a.ultima,
    }))
    .sort((x, y) => y.monto - x.monto);

  return {
    escaneados: contratos.length,
    totalRegistro,
    truncado,
    desde,
    hasta,
    montoTotal,
    proveedores,
  };
}

export interface HistorialProveedor {
  rpe: string;
  razonSocial: string | null;
  totalRegistro: number;
  contratos: Contrato[];
  montoTotal: number;
  /** Adjudicaciones vigentes (sin canceladas/rescindidas). */
  montoVigente: number;
  instituciones: number;
  porAnio: { anio: string; n: number; monto: number }[];
}

/**
 * Historial de contratos de un proveedor. A diferencia del histórico general,
 * `rpe` **sí filtra** en la API, así que esto es el registro completo del
 * proveedor (hasta 1000 contratos), no una muestra.
 */
export async function getHistorialProveedor(rpe: string): Promise<HistorialProveedor | null> {
  const data = await dgcpFetch<Contrato>("/contratos", { rpe, limit: 1000 }, 3600);
  const contratos = data.payload.content;
  if (contratos.length === 0) return null;

  let montoTotal = 0;
  let montoVigente = 0;
  const insts = new Set<string>();
  const anios = new Map<string, { anio: string; n: number; monto: number }>();

  for (const c of contratos) {
    const monto = c.valor_contratado || 0;
    montoTotal += monto;
    if (ESTADOS_VIGENTES.has(c.estado_contrato)) montoVigente += monto;
    if (c.unidad_compra) insts.add(c.unidad_compra);
    const anio = fechaValida(c.fecha_adjudicacion)?.slice(0, 4) ?? "Sin fecha";
    const a = anios.get(anio) ?? { anio, n: 0, monto: 0 };
    a.n += 1;
    a.monto += monto;
    anios.set(anio, a);
  }

  return {
    rpe,
    razonSocial: contratos[0].razon_social ?? null,
    totalRegistro: data.totalResults ?? contratos.length,
    contratos,
    montoTotal,
    montoVigente,
    instituciones: insts.size,
    porAnio: [...anios.values()].sort((a, b) => b.anio.localeCompare(a.anio)),
  };
}

/* --------------------------------------------------- ofertas: la competencia */

/**
 * Una oferta presentada a un proceso. El endpoint `/ofertas` (1.46 M de
 * registros) responde a `proceso`, igual que `/contratos`, así que la
 * competencia de un proceso concreto **no es una muestra**: es el registro.
 *
 * Advertencia de campo (docs/AUDITORIA.md §A.3): `estado_evaluacion` viene
 * mayoritariamente en «Pendiente» o vacío incluso en procesos ya adjudicados.
 * Esta capa expone quién ofertó y por cuánto; **quién ganó lo dicen los
 * contratos**, no la evaluación.
 */
export interface Oferta {
  id_oferta: string;
  codigo_proceso: string;
  codigo_unidad_compra: string;
  unidad_compra: string;
  rpe: string;
  razon_social: string;
  nombre_oferta: string;
  valor_oferta: string;
  estado_oferta: string;
  estado_evaluacion: string | null;
  tipo_oferta: string;
  fecha_creacion: string;
  fecha_entrega_oferta: string;
  fecha_evaluacion: string | null;
}

export interface Oferente {
  rpe: string;
  razonSocial: string;
  /** Suma de las ofertas de ese oferente en el proceso (puede ofertar por lote). */
  monto: number;
  ofertas: number;
  digital: boolean;
}

export interface Competencia {
  /** Oferentes distintos, de menor a mayor monto ofertado. */
  oferentes: Oferente[];
  /** Ofertas individuales registradas (un oferente puede presentar varias). */
  totalOfertas: number;
  /** Nadie más se presentó: la señal que hay que mirar. */
  oferenteUnico: boolean;
  /** Menor y mayor oferta con monto declarado, para dar rango. */
  menor: number | null;
  mayor: number | null;
  /** Cuántas ofertas llegaron sin monto legible en el registro. */
  sinMonto: number;
}

/**
 * Quién compitió por un proceso. Devuelve `null` cuando el registro no tiene
 * ofertas cargadas — que no es lo mismo que «no hubo competencia»: hay
 * modalidades que no publican ofertas, y la UI debe decirlo así.
 */
export async function getCompetencia(codigoProceso: string): Promise<Competencia | null> {
  const data = await dgcpFetch<Oferta>(
    "/ofertas",
    { proceso: codigoProceso, limit: 1000 },
    1800
  ).catch(() => null);
  const ofertas = data?.payload.content ?? [];
  if (ofertas.length === 0) return null;

  const porOferente = new Map<string, Oferente>();
  let sinMonto = 0;
  const montos: number[] = [];

  for (const o of ofertas) {
    const monto = Number(o.valor_oferta);
    const valido = Number.isFinite(monto) && monto > 0;
    if (valido) montos.push(monto);
    else sinMonto += 1;

    const rpe = String(o.rpe ?? "").trim();
    const clave = rpe || o.razon_social || o.id_oferta;
    const acc = porOferente.get(clave) ?? {
      rpe,
      razonSocial: o.razon_social || "Oferente sin nombre en el registro",
      monto: 0,
      ofertas: 0,
      digital: false,
    };
    acc.ofertas += 1;
    if (valido) acc.monto += monto;
    if (/digital/i.test(o.tipo_oferta || "")) acc.digital = true;
    porOferente.set(clave, acc);
  }

  montos.sort((a, b) => a - b);
  const oferentes = [...porOferente.values()].sort((a, b) => {
    if (a.monto && b.monto) return a.monto - b.monto;
    return b.monto - a.monto;
  });

  return {
    oferentes,
    totalOfertas: ofertas.length,
    oferenteUnico: oferentes.length === 1,
    menor: montos[0] ?? null,
    mayor: montos[montos.length - 1] ?? null,
    sinMonto,
  };
}

/* ------------------------------------------ registro de proveedores del Estado */

/**
 * Ficha del Registro de Proveedores del Estado (RPE).
 *
 * El endpoint `/proveedores` trae 35 campos, entre ellos teléfonos, correos y
 * nombre del contacto comercial. **Este tipo los omite a propósito**: son
 * públicos por registro, pero replicarlos convertiría la plataforma en un
 * directorio de contactos, que no es lo que hace falta para vigilar al Estado
 * (docs/AUDITORIA.md §A.3). Lo que sí importa es la identidad institucional: quién
 * es, desde cuándo existe y en qué condición está inscrito.
 */
export interface ProveedorRegistro {
  rpe: string;
  razonSocial: string;
  /** «RNC» o «Cédula». */
  tipoDocumento: string;
  /** El RNC: la llave con el registro tributario de la DGII. */
  numeroDocumento: string;
  /** «Activo» · «Inactivo» · «Desactualizado». */
  estado: string;
  tipoPersona: string;
  formaJuridica: string;
  /** Constitución de la empresa (no su inscripción como proveedor). */
  fechaCreacion: string | null;
  /** Alta en el registro de proveedores del Estado. */
  fechaRegistroRpe: string | null;
  registroMercantil: string | null;
  esMipyme: boolean;
  certificacionMicm: boolean;
  productorNacional: boolean;
  /** «Gran empresa», «Mediana empresa», «No clasificada»… */
  clasificacion: string | null;
  /** «Bienes», «Servicios», «Obras». */
  provee: string | null;
  provincia: string | null;
  municipio: string | null;
}

interface ProveedorRaw {
  rpe: number | string;
  razon_social: string;
  tipo_documento: string;
  numero_documento: string;
  estado: string;
  tipo_persona: string;
  forma_juridica: string;
  fecha_creacion_empresa: string | null;
  fecha_registro_rpe: string | null;
  numero_registro_mercantil: string | null;
  es_mipyme: string | null;
  certificacion_micm: string | null;
  productor_nacional: string | null;
  clasificacion: string | null;
  provee: string | null;
  provincia: string | null;
  municipio: string | null;
}

const esSi = (v: string | null | undefined) => /^s[ií]$/i.test((v ?? "").trim());

/** Fecha ISO del registro, o `null` si viene vacía o corrupta. */
function fechaRegistro(iso: string | null | undefined): string | null {
  return fechaValida(iso) ? iso!.slice(0, 10) : null;
}

/** Del sobre crudo del registro a la ficha institucional que sí mostramos. */
function mapearProveedor(p: ProveedorRaw): ProveedorRegistro {
  return {
    rpe: String(p.rpe),
    razonSocial: p.razon_social,
    tipoDocumento: p.tipo_documento,
    numeroDocumento: p.numero_documento,
    estado: p.estado,
    tipoPersona: p.tipo_persona,
    formaJuridica: p.forma_juridica,
    fechaCreacion: fechaRegistro(p.fecha_creacion_empresa),
    fechaRegistroRpe: fechaRegistro(p.fecha_registro_rpe),
    registroMercantil: p.numero_registro_mercantil || null,
    esMipyme: esSi(p.es_mipyme),
    certificacionMicm: esSi(p.certificacion_micm),
    productorNacional: esSi(p.productor_nacional),
    clasificacion: p.clasificacion || null,
    provee: p.provee || null,
    provincia: p.provincia || null,
    municipio: p.municipio || null,
  };
}

/*
  Las dos consultas al registro existen en dos versiones a propósito.

  Las internas **propagan el fallo**; las exportadas lo tragan en `null`. La
  distinción no es estilística: para la ficha de un proveedor da igual —la
  página vive de su historial de contratos y el registro solo la enriquece—,
  pero para el buscador es la diferencia entre «no está inscrito» y «el
  registro no contestó». Afirmar lo primero cuando pasa lo segundo es decir una
  falsedad sobre un registro del Estado, y justo en el camino que la interfaz
  vende como el autoritativo.
*/

async function fichaPorRpe(rpe: string): Promise<ProveedorRegistro | null> {
  const data = await dgcpFetch<ProveedorRaw>("/proveedores", { rpe, limit: 5 }, 86400);
  const p = data.payload.content.find((x) => String(x.rpe) === String(rpe));
  return p ? mapearProveedor(p) : null;
}

/**
 * Ficha por número de documento — el RNC de una empresa o la cédula de una
 * persona física. `numero_documento` es, junto a `rpe`, el **único** otro
 * filtro que la API honra (docs/AUDITORIA.md §A.12), y es exacto: no admite
 * prefijos.
 *
 * Por eso se normaliza lo que teclea el usuario. Un RNC se escribe con guiones
 * («1-01-87008-7»), y una cédula —que el registro guarda a 11 dígitos con sus
 * ceros a la izquierda— suele copiarse sin ellos. Solo en ese caso, entre 8 y
 * 10 dígitos, se gasta una segunda consulta rellenando con ceros; para un
 * número corto, que es antes un RPE que un documento, no se gasta.
 */
async function fichaPorDocumento(documento: string): Promise<ProveedorRegistro | null> {
  const doc = documento.replace(/\D/g, "");
  if (!doc || doc.length > 11) return null;

  const consultar = async (numero: string) => {
    const data = await dgcpFetch<ProveedorRaw>(
      "/proveedores",
      { numero_documento: numero, limit: 5 },
      86400,
    );
    const p = data.payload.content.find(
      (x) => String(x.numero_documento ?? "") === numero,
    );
    return p ? mapearProveedor(p) : null;
  };

  const directo = await consultar(doc);
  if (directo || doc.length < 8 || doc.length >= 11) return directo;
  return consultar(doc.padStart(11, "0"));
}

/**
 * Ficha de registro de un proveedor. `rpe` filtra de verdad en la API, así que
 * es una consulta directa. Degrada a `null` si el proveedor no está en el
 * registro (o si la API falla): la página del proveedor sigue funcionando con
 * su historial de contratos.
 */
export async function getProveedorRegistro(rpe: string): Promise<ProveedorRegistro | null> {
  return fichaPorRpe(rpe).catch(() => null);
}

/** Como `fichaPorDocumento`, degradando a `null` cuando el registro falla. */
export async function getProveedorPorDocumento(
  documento: string,
): Promise<ProveedorRegistro | null> {
  return fichaPorDocumento(documento).catch(() => null);
}

/**
 * Cuántos proveedores hay inscritos en el RPE. Es un **censo** declarado por
 * el origen —a diferencia de casi todo lo que se lee de `/contratos`—, así que
 * sí puede ser el denominador de algo. Una sola consulta de un registro.
 */
export async function contarProveedoresRegistrados(): Promise<number | null> {
  const data = await dgcpFetch<ProveedorRaw>("/proveedores", { limit: 1 }, 86400).catch(
    () => null,
  );
  return data?.totalResults ?? null;
}

/**
 * Fichas de registro de varios proveedores, en oleadas de `lote` para no abrir
 * una docena de conexiones a la vez contra la DGCP (misma disciplina de
 * concurrencia conservadora que el resto de la casa). Cada consulta se cachea
 * 24 h, así que a partir del primer render el enriquecimiento sale gratis.
 */
export async function registrosDeProveedores(
  rpes: string[],
  lote = 4,
): Promise<Map<string, ProveedorRegistro>> {
  const fichas = new Map<string, ProveedorRegistro>();
  for (let i = 0; i < rpes.length; i += lote) {
    const tanda = await Promise.all(
      rpes.slice(i, i + lote).map((rpe) => getProveedorRegistro(rpe).catch(() => null)),
    );
    for (const f of tanda) if (f) fichas.set(f.rpe, f);
  }
  return fichas;
}

/* --------------------------------------------- buscar a un proveedor */

/** Por cuál de los dos caminos se resolvió la consulta. */
export type ViaProveedor = "rpe" | "documento" | "nombre";

export interface ResultadoProveedores {
  /** Lo que se buscó, ya recortado. */
  consulta: string;
  via: ViaProveedor;
  /** Coincidencia exacta en el registro completo (solo por RPE o documento). */
  registro: ProveedorRegistro | null;
  /** Su posición en la ventana de contratos, si aparece en ella. */
  enVentana: ProveedorEnMercado | null;
  /** Coincidencias por nombre **dentro de la ventana**, de mayor a menor monto. */
  coincidencias: ProveedorEnMercado[];
  /** Cuántas había antes de recortar la lista. */
  totalCoincidencias: number;
  /** Base declarada de la búsqueda por nombre. */
  contratosEscaneados: number;
  contratosEnRegistro: number;
  proveedoresEnVentana: number;
  desde: string | null;
  hasta: string | null;
  /** El registro de proveedores no contestó: distinto de «no está inscrito». */
  registroCaido: boolean;
  /** La ventana de contratos no contestó: distinto de «no hay coincidencias». */
  ventanaCaida: boolean;
  /** No se buscó por nombre porque la consulta era demasiado corta. */
  consultaCorta: boolean;
}

/** Cuántas coincidencias por nombre se devuelven como máximo. */
const MAX_COINCIDENCIAS = 60;

/** Por debajo de esto, buscar por nombre devuelve media plataforma. */
const MIN_LETRAS_NOMBRE = 3;

/**
 * Buscar un proveedor. Los dos caminos que ofrece esta función no son
 * equivalentes, y la interfaz está obligada a decir cuál usó:
 *
 *  - **RPE o documento (RNC/cédula)** — exacto y sobre el **registro completo**
 *    (~128 mil inscritos). `rpe` y `numero_documento` son los dos únicos
 *    filtros que la API honra.
 *  - **Nombre** — la API no busca por razón social, y el registro **no se
 *    puede barrer**: hay páginas que devuelven 500 de forma permanente
 *    (docs/AUDITORIA.md §A.12). Así que un nombre solo se puede buscar dentro
 *    de la ventana de contratos recientes: quien no haya ganado nada
 *    últimamente no aparece, y `contratosEscaneados` obliga a declararlo.
 *
 * `mercadoPendiente` deja que la página pase el barrido que ya está leyendo,
 * para no recorrer y agregar seis mil contratos dos veces en el mismo render.
 */
export async function buscarProveedores(
  q: string,
  mercadoPendiente?: Promise<MercadoProveedores | null>,
): Promise<ResultadoProveedores> {
  const consulta = q.trim();
  // «RNC 101-87008-7», «RPE: 1234», «#1234», «cédula 001-…»: la etiqueta no es
  // parte del número.
  const sinEtiqueta = consulta
    .replace(/^(?:rnc|rpe|c[eé]dula|ced\.?|documento|n[uú]m(?:ero)?\.?|no\.?|#)\s*[:#.]?\s*/i, "")
    .trim();
  const soloDigitos = sinEtiqueta.replace(/\D/g, "");
  // «1-01-87008-7», «101 87008 7» y «101870087» son el mismo RNC. Un texto con
  // letras nunca es un número de documento, por mucho dígito que lleve.
  const esNumero =
    soloDigitos.length > 0 &&
    soloDigitos.length <= 11 &&
    /^[\d\s.-]+$/.test(sinEtiqueta);

  // Un RNC tiene 9 dígitos y una cédula 11: a esa longitud la consulta es antes
  // un documento que un RPE. Con menos dígitos, al revés. La corazonada decide
  // el **orden**, no el ganador: se consulta la probable y solo si falla la
  // otra, que es una petición al registro en vez de dos.
  const pareceDocumento = soloDigitos.length === 9 || soloDigitos.length === 11;

  const buscarEnRegistro = async (): Promise<{
    registro: ProveedorRegistro | null;
    via: ViaProveedor;
    caido: boolean;
  }> => {
    const intentos: { via: ViaProveedor; leer: () => Promise<ProveedorRegistro | null> }[] =
      pareceDocumento
        ? [
            { via: "documento", leer: () => fichaPorDocumento(soloDigitos) },
            { via: "rpe", leer: () => fichaPorRpe(soloDigitos) },
          ]
        : [
            { via: "rpe", leer: () => fichaPorRpe(soloDigitos) },
            { via: "documento", leer: () => fichaPorDocumento(soloDigitos) },
          ];

    let algunaRespondio = false;
    for (const intento of intentos) {
      try {
        const registro = await intento.leer();
        algunaRespondio = true;
        // La vía que devuelve la ficha es la que se declara: nada de deducirla
        // comparando números, que se equivoca con un RPE tecleado con ceros.
        if (registro) return { registro, via: intento.via, caido: false };
      } catch {
        // Se prueba la otra vía; si ninguna responde, el registro está caído.
      }
    }
    return {
      registro: null,
      via: intentos[0].via,
      caido: !algunaRespondio,
    };
  };

  const [enRegistro, mercado] = await Promise.all([
    esNumero
      ? buscarEnRegistro()
      : Promise.resolve({ registro: null, via: "nombre" as ViaProveedor, caido: false }),
    mercadoPendiente ?? muestrearProveedores().catch(() => null),
  ]);

  const via: ViaProveedor = esNumero ? enRegistro.via : "nombre";
  const proveedores = mercado?.proveedores ?? [];
  const clave = enRegistro.registro?.rpe ?? (esNumero ? soloDigitos : null);
  const enVentana = clave ? (proveedores.find((p) => p.rpe === clave) ?? null) : null;

  const aguja = normalize(consulta);
  const consultaCorta = !esNumero && aguja.length < MIN_LETRAS_NOMBRE;
  const todas =
    !esNumero && !consultaCorta
      ? proveedores.filter((p) => normalize(p.razonSocial).includes(aguja))
      : [];

  return {
    consulta,
    via,
    registro: enRegistro.registro,
    enVentana,
    coincidencias: todas.slice(0, MAX_COINCIDENCIAS),
    totalCoincidencias: todas.length,
    contratosEscaneados: mercado?.escaneados ?? 0,
    contratosEnRegistro: mercado?.totalRegistro ?? 0,
    proveedoresEnVentana: proveedores.length,
    desde: mercado?.desde ?? null,
    hasta: mercado?.hasta ?? null,
    registroCaido: enRegistro.caido,
    ventanaCaida: mercado === null,
    consultaCorta,
  };
}

/* ------------------------------------------------------------ catálogo UNSPSC */

export interface Subclase {
  subclase: string;
  descripcion: string;
  clase: string;
  descripcionClase: string;
  familia: string;
  descripcionFamilia: string;
  definicion: string | null;
}

interface SubclaseRaw {
  segmento: string;
  descripcion_segmento: string;
  familia: string;
  descripcion_familia: string;
  clase: string;
  descripcion_clase: string;
  subclase: string;
  descripcion_subclase: string;
  definicion_subclase: string | null;
}

/** Nombre y árbol de una subclase UNSPSC: da lenguaje llano a un código. */
export async function getSubclase(subclase: string): Promise<Subclase | null> {
  const data = await dgcpFetch<SubclaseRaw>("/catalogo", { subclase, limit: 5 }, 86400).catch(
    () => null
  );
  const s = data?.payload.content.find((x) => x.subclase === subclase);
  if (!s) return null;
  const limpiar = (t: string) => t.replace(/\s+/g, " ").trim();
  return {
    subclase: s.subclase,
    descripcion: limpiar(s.descripcion_subclase),
    clase: s.clase,
    descripcionClase: limpiar(s.descripcion_clase),
    familia: s.familia,
    descripcionFamilia: limpiar(s.descripcion_familia),
    definicion: s.definicion_subclase ? limpiar(s.definicion_subclase) : null,
  };
}

/* -------------------------------------- PACC: lo que el Estado planea comprar */

/**
 * Plan Anual de Compras y Contrataciones de una unidad de compra. Es la
 * intención declarada **antes** de que exista un proceso: la señal más
 * temprana que publica el Estado.
 *
 * Límite verificado: `/pacc` **ignora el filtro `periodo`** (devuelve 2026
 * aunque se pida 2025); `unidad_compra` sí filtra. Por eso el filtrado por
 * período se hace aquí, del lado del servidor.
 */
export interface Pacc {
  uid: string;
  codigoUnidadCompra: string;
  unidadCompra: string;
  periodo: number;
  fechaPublicacion: string | null;
  /** Cada revisión del plan sube la versión: 55 versiones es un plan movido. */
  version: string;
  url: string;
}

interface PaccRaw {
  uid_pacc: string;
  codigo_unidad_compra: string;
  unidad_compra: string;
  periodo: number | string;
  fecha_publicacion: string | null;
  version: string;
  responsable: string;
  correo_responsable: string;
  url: string;
}

export async function listPacc(opts: {
  periodo?: number;
  unidad_compra?: number | string;
  limit?: number;
} = {}): Promise<Pacc[]> {
  const data = await dgcpFetch<PaccRaw>(
    "/pacc",
    { unidad_compra: opts.unidad_compra, limit: opts.limit ?? 1000 },
    3600
  ).catch(() => null);
  const planes = (data?.payload.content ?? []).map((p) => ({
    uid: p.uid_pacc,
    codigoUnidadCompra: String(p.codigo_unidad_compra),
    unidadCompra: p.unidad_compra,
    periodo: Number(p.periodo),
    fechaPublicacion: fechaRegistro(p.fecha_publicacion),
    version: String(p.version ?? ""),
    url: p.url,
  }));
  const filtrados = opts.periodo
    ? planes.filter((p) => p.periodo === opts.periodo)
    : planes;
  return filtrados.sort((a, b) =>
    (b.fechaPublicacion ?? "").localeCompare(a.fechaPublicacion ?? "")
  );
}
