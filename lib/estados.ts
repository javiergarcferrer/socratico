import { SIN_DATO } from "@/lib/format";
/**
 * El lenguaje de color del estado — **de toda la plataforma**, no solo de la
 * DGCP.
 *
 * Los tonos no son una paleta decorativa: son los oficios de color de
 * `docs/INFRAESTRUCTURA.md` §11 («un color = un significado, en toda la plataforma»), y
 * por eso se nombran por **lo que significan** y nunca por el estado concreto
 * de una fuente. Un estado del origen se traduce a uno de estos cinco; los
 * nombres del Estado no entran aquí.
 *
 * Esta regla se había roto en silencio. `components/iniciativa-card.tsx`
 * mantenía una segunda tabla —que en su comentario decía estar «alineada con
 * lib/estados.ts»— con los dos colores que más pesan invertidos respecto a
 * esta: el verde de archivo, que aquí significa *ya se cumplió*, marcaba en el
 * Congreso una pieza recién **depositada**, y el azul de la firma, que en toda
 * la plataforma significa *se puede actuar*, marcaba una ley ya **promulgada**.
 * A dos clics de distancia el mismo verde decía «terminado» y «acaba de
 * empezar», y un listado del Senado entero en verde se leía como un archivo
 * cerrado. Ahora la tabla vive una sola vez y las dos cámaras la importan.
 */

export interface Tone {
  /** Clases de la marca de estado: fondo + texto + filete. */
  badge: string;
  /** Clases del punto macizo. */
  dot: string;
}

/**
 * Los cinco oficios. Clases literales: el escáner de Tailwind lee el fuente.
 */
export const TONOS = {
  /** Sigue abierto a que alguien haga algo: admite ofertas, admite trámite. La firma. */
  accionable: {
    badge: "bg-brand-50 text-brand-700 ring-brand-600/20",
    dot: "bg-brand-500",
  },
  /** Informa y no pide nada: en curso, ya pasó, o el origen no lo dice. Grafito. */
  contexto: {
    badge: "bg-canvas text-ink-soft ring-hairline",
    dot: "bg-ink-soft",
  },
  /** Llegó al final de su trámite: adjudicado, promulgado. Verde de archivo. */
  cumplido: {
    badge: "bg-valido-50 text-valido-700 ring-valido-600/20",
    dot: "bg-valido-500",
  },
  /** Corre un plazo y todavía se puede perder. Ocre de anotación al margen. */
  aviso: {
    badge: "bg-alerta-50 text-alerta-700 ring-alerta-600/20",
    dot: "bg-alerta-500",
  },
  /** Se cayó sin llegar a nada: desierto, cancelado, perimido. El sello. */
  anulado: {
    badge: "bg-sello-50 text-sello-700 ring-sello-600/20",
    dot: "bg-sello-600",
  },
} satisfies Record<string, Tone>;

/**
 * El nombre de un oficio de color. Es el tipo que cruza la plataforma: una
 * fuente traduce su vocabulario a esto y la interfaz solo conoce esto.
 */
export type Tono = keyof typeof TONOS;

/* ------------------------------------------ etapas: el estado, en llano */

/**
 * En qué punto de su vida está un proceso de compras, dicho en el idioma del
 * que pregunta.
 *
 * La DGCP publica siete `estado_proceso` y el buscador los ofrecía tal cual,
 * con «Proceso publicado» puesto por defecto. Así, **«¿qué ya cerró?» no se
 * podía preguntar**: había que saber de antemano que la respuesta se reparte
 * entre «Sobres estan abriendose», «Sobres abiertos o aperturados», «Proceso
 * con etapa cerrada», «Proceso adjudicado y celebrado», «Proceso desierto» y
 * «Cancelado», y elegirlos de uno en uno. Justo lo contrario de la regla de la
 * casa —llano primero, el término técnico después—, y es la mitad que más
 * enseña: en un proceso cerrado están el ganador, el precio y con quién se
 * compitió.
 *
 * Vive aquí, con los oficios de color, porque es la **otra** traducción del
 * mismo campo, y este archivo existe precisamente para que esa traducción se
 * escriba una sola vez. Dos tablas del mismo estado en dos archivos es el error
 * que ya se pagó una vez arriba.
 *
 * Cada etapa es un **predicado sobre el estado normalizado**, no una lista de
 * literales. No es estilo: el vocabulario del origen no está versionado, ya
 * costó caro confiar en valores tecleados a mano (docs/INFRAESTRUCTURA.md §5.1), y
 * un literal mal transcrito no falla — devuelve cero, que se lee como «no
 * hay». Con predicados, un estado que la DGCP añada mañana cae en `cerrados`
 * —definida por negación de `abiertos`— en vez de desaparecer sin que nadie se
 * entere, y su color es el gris que no afirma nada.
 */
export type EtapaClave =
  | "abiertos"
  | "cerrados"
  | "evaluacion"
  | "adjudicados"
  | "sin_efecto";

export interface Etapa {
  clave: EtapaClave;
  label: string;
  /** Qué significa, en es-DO llano: se muestra junto al control. */
  ayuda: string;
  /** El oficio de color de los procesos de esta etapa. */
  tono: Tono;
  /** Recibe el estado **crudo** del origen y normaliza por dentro. */
  coincide: (estado: string) => boolean;
  /**
   * El valor exacto que la API honra, cuando la etapa es un solo estado. Deja
   * que el caso por defecto siga costando **una** petición en vez de seis.
   *
   * Riesgo residual, escrito porque no se puede eliminar sin pagarlo: esto es
   * un literal tecleado, exactamente lo que el resto de la tabla evita. Si la
   * DGCP renombrara «Proceso publicado», la vista inicial de la vertical
   * devolvería cero y se leería como «no hay nada abierto». Se acepta a
   * sabiendas: barrer seis páginas para la consulta más frecuente de la casa
   * cuesta más que ese riesgo, y el fallo es ruidoso —una vertical vacía se
   * nota— y no silencioso. Quien lo vea así, que mire aquí primero.
   */
  estadoUnico?: string;
}

const sinTildes = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

const contiene =
  (...claves: string[]) =>
  (estado: string) => {
    const e = sinTildes(estado);
    return claves.some((c) => e.includes(c));
  };

const esAbierto = contiene("publicado");

export const ETAPAS: Etapa[] = [
  {
    clave: "abiertos",
    label: "Abiertos a ofertar",
    ayuda: "Todavía reciben ofertas.",
    tono: "accionable",
    coincide: esAbierto,
    estadoUnico: "Proceso publicado",
  },
  {
    clave: "cerrados",
    label: "Ya cerró la recepción",
    ayuda:
      "Todo lo que ya no admite ofertas: en evaluación, adjudicado, desierto o cancelado.",
    tono: "contexto",
    coincide: (e) => !esAbierto(e),
  },
  {
    clave: "evaluacion",
    label: "Cerrados, en evaluación",
    ayuda: "Cerró la recepción y la institución abre sobres y compara.",
    tono: "contexto",
    coincide: contiene("sobre", "etapa cerrada", "evaluac"),
  },
  {
    clave: "adjudicados",
    label: "Adjudicados",
    ayuda: "Ya hay ganador y contrato: aquí están el precio y la competencia.",
    tono: "cumplido",
    coincide: contiene("adjudicad"),
  },
  {
    clave: "sin_efecto",
    label: "Desiertos o cancelados",
    ayuda: "Se cayeron sin llegar a contrato.",
    tono: "anulado",
    coincide: contiene("desierto", "cancelad", "anulad"),
  },
];

export function etapaPorClave(clave: string | undefined | null): Etapa | null {
  return ETAPAS.find((e) => e.clave === clave) ?? null;
}

/**
 * La etapa de un estado del origen. Las específicas se prueban primero;
 * `cerrados` es el cajón por negación y recoge lo que no reconocemos, que es
 * exactamente donde tiene que caer: un estado desconocido no es «publicado».
 */
export function etapaDe(estado: string): Etapa {
  const especificas = ETAPAS.filter((x) => x.clave !== "cerrados");
  return (
    especificas.find((x) => x.coincide(estado)) ??
    ETAPAS.find((x) => x.clave === "cerrados")!
  );
}

export interface EstadoMeta extends Tone {
  /** La etiqueta que se lee: la etapa, en llano. */
  label: string;
  /** El literal crudo del origen, para el `title` de la marca. */
  original: string;
  abierto: boolean;
}

/**
 * Color, nombre y condición de un estado de la DGCP. Los tres salen de su
 * etapa, y no de una tabla de literales aparte: si «abierto» y «etapa
 * abierta» se calcularan por caminos distintos podrían discrepar, y
 * discreparían justo en lo que decide si una tarjeta anuncia un plazo o la
 * fecha en que cerró.
 *
 * `label` es la etapa y no el literal del origen. La marca de una tarjeta
 * decía «Sobres estan abriendose» —sin tilde, tal cual lo escribe la DGCP—, y
 * eso obliga al lector a traducir jerga administrativa para saber si puede
 * ofertar. Mientras la mitad cerrada no era navegable casi no se veía; ahora
 * es el caso común. El literal no se pierde: va en el `title` de la marca y
 * la ficha del proceso lo sigue mostrando entero.
 */
export function estadoMeta(estado: string): EstadoMeta {
  const etapa = etapaDe(estado);
  return {
    ...TONOS[etapa.tono],
    label: etapa.label,
    original: estado || SIN_DATO,
    abierto: etapa.clave === "abiertos",
  };
}

export interface CierreMeta extends Tone {
  texto: string;
  urgente: boolean;
}

/**
 * Marca del plazo de cierre a partir de los días que quedan (negativo = ya
 * cerró). Un plazo **avisa**: es ocre mientras corre y grafito cuando ya no
 * hay nada que hacer. Antes un cierre a dos días salía en rojo —que en esta
 * identidad significa «derogado»— y uno a veinte en verde, que significa «ya
 * cumplido»: justo lo contrario de lo que pasaba.
 */
export function cierreMeta(dias: number | null): CierreMeta | null {
  if (dias === null) return null;
  if (dias < 0) return { ...TONOS.contexto, texto: "Recepción cerrada", urgente: false };
  if (dias === 0) return { ...TONOS.aviso, texto: "Cierra hoy", urgente: true };
  if (dias === 1) return { ...TONOS.aviso, texto: "Cierra mañana", urgente: true };
  if (dias <= 7) return { ...TONOS.aviso, texto: `Cierra en ${dias} días`, urgente: true };
  return { ...TONOS.contexto, texto: `Cierra en ${dias} días`, urgente: false };
}
