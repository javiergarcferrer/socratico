/**
 * Arquitectura de información de la plataforma — fuente única de verdad.
 *
 * Socrático cubre tres verticales (licitaciones, congreso, nómina) y un
 * panorama transversal. Todo el chrome —megamenú (vía `lib/menu.ts`), barra de sección, tab bar
 * móvil, agrupación del pie— se deriva de este módulo para que la separación
 * entre verticales sea estructural y no una convención repetida a mano.
 *
 * Reglas de ergonomía que este módulo hace cumplir:
 *  - Cada ruta pertenece a lo sumo a una vertical (`seccionDe` es determinista).
 *  - Cada vertical tiene un matiz propio (`--color-v-*` en globals.css), usado
 *    SOLO para orientación (estado activo del nav, acento de la barra de
 *    sección, chip del panorama) — nunca para el contenido, que conserva su
 *    color semántico (vigente, perimido…). Todos son tintas apagadas que
 *    conviven sobre el papel de la identidad.
 *  - Las etiquetas del nav son las mismas en global, sección, tab bar y pie:
 *    un solo vocabulario.
 *
 * Las clases de Tailwind viven aquí como literales para que el escáner las vea.
 */

export type SeccionId =
  | "licitaciones"
  | "finanzas"
  | "congreso"
  | "normativa"
  | "nomina"
  | "democracia";

export interface VistaSeccion {
  href: string;
  label: string;
  /** Activa solo con match exacto (si no, por prefijo). */
  exact?: boolean;
  /** La vista de seguimiento muestra el contador de procesos seguidos. */
  seguimiento?: boolean;
}

export interface Seccion {
  id: SeccionId;
  /** Sustantivo corto: barra de sección, tab bar, pie. Se reconoce de un vistazo. */
  nombre: string;
  /**
   * La vertical dicha como pregunta. Ya no se pinta en la cabecera —el dueño
   * la cambió por el megamenú de `lib/menu.ts` (docs/DECISIONES.md)—; queda
   * como palabra clave de la paleta, para que «qué compra» encuentre
   * Licitaciones.
   */
  pregunta: string;
  /** Ruta raíz de la vertical (a donde lleva el nav global). */
  href: string;
  /** Qué describe la vertical, para subtítulos y tarjetas. */
  descriptor: string;
  /** Prefijos de ruta que pertenecen a la vertical. */
  rutas: string[];
  /** Vistas internas (subnav). Una sola vista ⇒ la barra no pinta tabs. */
  vistas: VistaSeccion[];
  /**
   * Rutas que pertenecen a la vertical pero **a ninguna de sus vistas**: un
   * trámite, un retorno de OAuth, un formulario. Ahí la barra no enciende
   * nada.
   *
   * Existe porque la ruta sola no distingue dos casos opuestos. `/procesos/ABC`
   * es la **ficha** de lo que un listado lista: viene de «Buscar» y encender
   * «Buscar» dice la verdad. `/democracia/registro` es un **trámite** que no
   * cuelga de ninguna vista, y encender «Consenso» —que además es `exact`— le
   * dice al visitante que está en una página en la que no está. Como no se
   * puede deducir del camino, se declara.
   */
  sinVista?: string[];
  hue: {
    /** Texto/acento del estado activo sobre fondo claro. */
    activo: string;
    /** Subrayado / indicador del ítem activo. */
    barra: string;
    /** Punto identificador de la vertical. */
    punto: string;
    /** Chip de icono en el panorama. */
    chip: string;
  };
}

export const SECCIONES: Seccion[] = [
  {
    id: "licitaciones",
    nombre: "Licitaciones",
    pregunta: "¿Qué compra?",
    href: "/licitaciones",
    descriptor: "Compras públicas · DGCP",
    rutas: [
      "/licitaciones",
      "/procesos",
      "/proveedores",
      "/estadisticas",
      "/contratos",
      "/planes",
      "/historico",
      "/guia",
    ],
    vistas: [
      { href: "/licitaciones", label: "Buscar" },
      { href: "/estadisticas", label: "Mercado" },
      { href: "/contratos", label: "Contratado" },
      { href: "/proveedores", label: "Proveedores" },
      { href: "/planes", label: "Planes" },
      { href: "/historico", label: "Desde 2015" },
      { href: "/guia", label: "Guía" },
    ],
    hue: {
      activo: "text-v-compras",
      barra: "bg-v-compras",
      punto: "bg-v-compras",
      chip: "bg-v-compras-tenue text-v-compras",
    },
  },
  {
    id: "finanzas",
    nombre: "Finanzas",
    pregunta: "¿En qué gasta?",
    href: "/finanzas",
    descriptor: "Ejecución del presupuesto · SIGEF",
    rutas: ["/finanzas", "/deuda"],
    vistas: [
      { href: "/finanzas", label: "Ejecución" },
      { href: "/deuda", label: "Deuda" },
      { href: "/finanzas/guia", label: "Guías" },
    ],
    hue: {
      activo: "text-v-finanzas",
      barra: "bg-v-finanzas",
      punto: "bg-v-finanzas",
      chip: "bg-v-finanzas-tenue text-v-finanzas",
    },
  },
  {
    id: "congreso",
    nombre: "Congreso",
    pregunta: "¿Qué legisla?",
    href: "/congreso",
    descriptor: "Iniciativas · Diputados y Senado",
    rutas: ["/congreso"],
    vistas: [
      { href: "/congreso", label: "Diputados" },
      { href: "/congreso/senado", label: "Senado" },
      { href: "/congreso/legisladores", label: "Legisladores" },
      { href: "/congreso/perencion", label: "Perención", exact: true },
      { href: "/congreso/guia", label: "Guía" },
    ],
    hue: {
      activo: "text-v-congreso",
      barra: "bg-v-congreso",
      punto: "bg-v-congreso",
      chip: "bg-v-congreso-tenue text-v-congreso",
    },
  },
  {
    id: "normativa",
    nombre: "Normativa",
    pregunta: "¿Qué decreta?",
    href: "/normativa",
    descriptor: "Decretos, leyes y sentencias de los altos tribunales",
    rutas: ["/normativa", "/constitucional", "/tse"],
    vistas: [
      { href: "/normativa", label: "Decretos y leyes" },
      { href: "/constitucional", label: "Tribunal Constitucional" },
      { href: "/tse", label: "Tribunal Electoral" },
    ],
    hue: {
      activo: "text-v-normativa",
      barra: "bg-v-normativa",
      punto: "bg-v-normativa",
      chip: "bg-v-normativa-tenue text-v-normativa",
    },
  },
  {
    id: "nomina",
    nombre: "Nómina",
    pregunta: "¿A quién paga?",
    href: "/nomina",
    descriptor: "Plazas y sueldos · por institución",
    rutas: ["/nomina"],
    vistas: [
      { href: "/nomina", label: "Por institución", exact: true },
      { href: "/nomina/general", label: "Todo el Estado" },
    ],
    hue: {
      activo: "text-v-nomina",
      barra: "bg-v-nomina",
      punto: "bg-v-nomina",
      chip: "bg-v-nomina-tenue text-v-nomina",
    },
  },
  {
    id: "democracia",
    nombre: "Democracia",
    pregunta: "¿Qué opinas?",
    href: "/democracia",
    descriptor: "Voto ciudadano · piloto",
    rutas: ["/democracia"],
    vistas: [
      { href: "/democracia", label: "Consenso", exact: true },
      { href: "/democracia/seguridad", label: "Seguridad" },
    ],
    // El registro por cédula y la vuelta de Cuenta Única son trámites: se
    // llega a ellos desde cualquier ficha y no son ninguna de las dos vistas.
    sinVista: ["/democracia/registro", "/democracia/cuenta-unica"],
    hue: {
      activo: "text-v-democracia",
      barra: "bg-v-democracia",
      punto: "bg-v-democracia",
      chip: "bg-v-democracia-tenue text-v-democracia",
    },
  },
];

/** La vertical a la que pertenece una ruta, o `null` (panorama, fuentes…). */
export function seccionDe(pathname: string): Seccion | null {
  for (const seccion of SECCIONES) {
    if (
      seccion.rutas.some(
        (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`),
      )
    ) {
      return seccion;
    }
  }
  return null;
}

/** ¿Está activa esta vista para la ruta actual? */
export function vistaActiva(vista: VistaSeccion, pathname: string): boolean {
  if (vista.exact) return pathname === vista.href;
  return pathname === vista.href || pathname.startsWith(`${vista.href}/`);
}

/**
 * La vista activa de una sección: la más específica que matchee. Así
 * `/congreso/perencion` enciende «Perención» y `/congreso/155693` enciende
 * «Iniciativas», sin que ambas compitan.
 */
export function vistaActivaDe(seccion: Seccion, pathname: string): VistaSeccion | null {
  // Un trámite declarado no enciende ninguna vista: ver `sinVista`.
  if (
    seccion.sinVista?.some(
      (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`),
    )
  ) {
    return null;
  }
  const candidatas = seccion.vistas.filter((v) => vistaActiva(v, pathname));
  if (candidatas.length === 0) {
    // Rutas de detalle que sí cuelgan de una vista (/procesos/x) → la raíz.
    return seccion.vistas[0] ?? null;
  }
  return candidatas.sort((a, b) => b.href.length - a.href.length)[0];
}

/**
 * Dónde se puede buscar por texto, y **con qué alcance**.
 *
 * La paleta (`components/paleta.tsx`) ofrece «Buscar “x” en…» una fila por
 * destino, y cada fila dice debajo qué recorre esa búsqueda. Es la misma
 * frase que el campo de cada superficie pone bajo sí mismo: los alcances de
 * esta plataforma son muy distintos —el Senado distingue tildes, un nombre de
 * proveedor solo se busca entre quienes ganaron algo hace poco— y quien elige
 * a dónde mandar su texto necesita saberlo antes, no después de leer «sin
 * resultados». Un destino nuevo con `?q=` se declara aquí y aparece solo.
 */
export interface DestinoBusqueda {
  /** La vertical del destino; sin ella, es transversal (todo, instituciones). */
  seccion?: SeccionId;
  /** Nombre corto del destino: «Diputados», «Proveedores». */
  etiqueta: string;
  /** La ruta que recibe `?q=`. */
  href: string;
  /** Qué recorre la búsqueda, en llano. */
  alcance: string;
}

export const BUSQUEDAS: DestinoBusqueda[] = [
  {
    etiqueta: "Toda la plataforma",
    href: "/buscar",
    alcance:
      "Reconoce un RNC, una cita como «Ley 47-20» o un código de proceso y lleva directo; si no, ordena por palabra y por tema instituciones, compras del último año, leyes desde 1844 y normativa reciente, iniciativas de Diputados, sentencias del TC y del TSE, obras, cargos de nómina con su sueldo, documentos y datos abiertos. Por palabra encuentra también legisladores, personas con cargo público y proveedores con contratos desde 2015, y ofrece seguir en cada vertical.",
  },
  {
    etiqueta: "Instituciones",
    href: "/instituciones",
    alcance: "Nombre o siglas de las 739 unidades de compra activas, cada una con su ficha de presupuesto, compras, nómina y decretos.",
  },
  {
    etiqueta: "Funcionarios",
    href: "/funcionarios",
    alcance:
      "Nombre de las personas con cargo público, sin importar tildes ni el orden: el Directorio de Funcionarios del MAP, los decretos, las altas cortes, la JCE y el Congreso (instantánea).",
  },
  {
    seccion: "licitaciones",
    etiqueta: "Licitaciones",
    href: "/licitaciones",
    alcance:
      "Título, descripción, institución, área o código de los procesos de la DGCP, leyendo hasta 6,000 por consulta (el buscador dice cuántos leyó); abre con los abiertos a ofertar.",
  },
  {
    seccion: "licitaciones",
    etiqueta: "Proveedores",
    href: "/proveedores",
    alcance:
      "Un RNC, cédula o RPE busca en el registro completo; un nombre, entre todos los que contrataron desde 2015 y los que ganaron algo este último mes.",
  },
  {
    seccion: "congreso",
    etiqueta: "Diputados",
    href: "/congreso",
    alcance: "Todas las palabras, en cualquier orden y con o sin tildes, dentro de la descripción de las iniciativas de la Cámara.",
  },
  {
    etiqueta: "Obras públicas",
    href: "/obras",
    alcance: "Nombre, entidad o código SNIP de los proyectos de inversión de MapaInversiones (instantánea).",
  },
  {
    seccion: "normativa",
    etiqueta: "Normativa",
    href: "/normativa",
    alcance: "Títulos de leyes, decretos, reglamentos y resoluciones de la Consultoría Jurídica, del año elegido.",
  },
  {
    seccion: "normativa",
    etiqueta: "Tribunal Constitucional",
    href: "/constitucional",
    alcance: "Número, expediente y asunto de las sentencias del año elegido; el texto está en el PDF de cada una.",
  },
  {
    seccion: "normativa",
    etiqueta: "Tribunal Superior Electoral",
    href: "/tse",
    alcance: "Número, expediente y asunto de las sentencias del año elegido, desde 2021; el texto está en la ficha de cada una.",
  },
  {
    etiqueta: "Documentos",
    href: "/documentos",
    alcance: "Títulos y nombres de archivo de los documentos que publican las instituciones con biblioteca WordPress abierta; no busca dentro del documento.",
  },
  {
    etiqueta: "Datos abiertos",
    href: "/datos",
    alcance: "Título y organización de los conjuntos del catálogo de datos.gob.do; lleva a su ficha en el portal.",
  },
  {
    seccion: "nomina",
    etiqueta: "Nómina",
    href: "/nomina",
    alcance: "Cargo, área o institución dentro de la foto de nómina de las instituciones que publican en formato procesable.",
  },
  {
    seccion: "congreso",
    etiqueta: "Senado",
    href: "/congreso/senado",
    alcance: "Expedientes del Senado del cuatrienio vigente. Literal: distingue tildes.",
  },
];
