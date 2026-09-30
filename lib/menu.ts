/**
 * El megamenú de la cabecera y la hoja «Más» del teléfono: toda la plataforma
 * agrupada por lo que el ciudadano viene a mirar, no por quién publica el dato.
 *
 * Tres puertas —el dinero, las leyes, el Estado— y en cada una sus columnas.
 * Cada enlace lleva una línea en llano que dice qué va a encontrar: el
 * sustantivo solo («Mercado», «Perención») obliga a saberlo antes de entrar.
 * Las verticales y sus rutas siguen saliendo de `lib/secciones.ts`, que es la
 * fuente única; aquí solo se ordenan y se explican. Un enlace nuevo en una
 * vertical se añade allí y se describe aquí.
 */

import { SECCIONES, type SeccionId } from "@/lib/secciones";
import type { Tarea } from "@/lib/tareas";

export interface EnlaceMenu {
  href: string;
  label: string;
  /** Qué hay detrás, en una línea. */
  nota: string;
  /**
   * Qué viene a **hacer** el lector ahí (`lib/indice.ts`). Obligatoria: un
   * destino sin tarea no entra en la plataforma.
   */
  tarea: Tarea;
}

export interface ColumnaMenu {
  titulo: string;
  /** La vertical, para su punto de color; sin ella, punto de tinta. */
  seccion?: SeccionId;
  enlaces: EnlaceMenu[];
}

export interface GrupoMenu {
  id: "dinero" | "leyes" | "estado";
  label: string;
  /** Una frase bajo la cabecera del panel. */
  resumen: string;
  columnas: ColumnaMenu[];
  /** La tarjeta destacada del panel: la entrada que más resuelve. */
  destacado: EnlaceMenu;
}

export const MENU: GrupoMenu[] = [
  {
    id: "dinero",
    label: "Dinero público",
    resumen: "Qué compra el Estado, cuánto gasta, cuánto debe y a quién le paga.",
    columnas: [
      {
        titulo: "Compras públicas",
        seccion: "licitaciones",
        enlaces: [
          { href: "/licitaciones", label: "Licitaciones", nota: "Lo que el Estado está comprando ahora", tarea: "vigilar" },
          { href: "/contratos", label: "Contratado", nota: "Quién ganó y por cuánto", tarea: "comparar" },
          { href: "/proveedores", label: "Proveedores", nota: "Quién le vende al Estado", tarea: "buscar" },
          { href: "/proveedores/inhabilitados", label: "Proveedores con medidas", nota: "Suspendidos, inhabilitados o dados de baja por la DGCP, y por qué", tarea: "buscar" },
          { href: "/estadisticas", label: "Mercado", nota: "Cómo compró en los últimos 30 días", tarea: "comparar" },
          { href: "/planes", label: "Planes de compra", nota: "Lo que cada institución dijo que compraría", tarea: "comparar" },
          { href: "/historico", label: "Desde 2015", nota: "Todo lo contratado, año por año, y a quién", tarea: "comparar" },
          { href: "/guia", label: "Cómo licitar", nota: "Guía para venderle al Estado", tarea: "entender" },
        ],
      },
      {
        titulo: "Presupuesto y deuda",
        seccion: "finanzas",
        enlaces: [
          { href: "/finanzas", label: "Ejecución del presupuesto", nota: "Cuánto ha gastado cada institución", tarea: "comparar" },
          { href: "/deuda", label: "Deuda pública", nota: "Cuánto debe el Estado, desde el año 2000", tarea: "comparar" },
          { href: "/finanzas/guia", label: "Cómo leer el presupuesto", nota: "Vigente, devengado y pagado, en llano", tarea: "entender" },
          { href: "/finanzas/guia/deuda", label: "Qué es la deuda pública", nota: "Bonos, préstamos y a quién se le debe, en llano", tarea: "entender" },
        ],
      },
      {
        titulo: "Sueldos y obras",
        seccion: "nomina",
        enlaces: [
          { href: "/nomina", label: "Nómina pública", nota: "Plazas y sueldos por institución y cargo", tarea: "comparar" },
          { href: "/nomina/general", label: "Nómina de todo el Estado", nota: "Casi medio millón de plazas, institución por institución", tarea: "comparar" },
          { href: "/obras", label: "Obras públicas", nota: "Si la obra existe y cuánto avanza", tarea: "vigilar" },
        ],
      },
    ],
    destacado: {
      href: "/instituciones",
      label: "El presupuesto, las compras y la nómina de una institución",
      nota: "Con sus obras y sus normas, todo en una sola página.",
      tarea: "buscar",
    },
  },
  {
    id: "leyes",
    label: "Leyes",
    resumen: "Qué se legisla, qué decreta el Ejecutivo y quién te representa.",
    columnas: [
      {
        titulo: "Congreso Nacional",
        seccion: "congreso",
        enlaces: [
          { href: "/congreso", label: "Diputados", nota: "Iniciativas y en qué punto van", tarea: "vigilar" },
          { href: "/congreso/senado", label: "Senado", nota: "Expedientes del cuatrienio", tarea: "vigilar" },
          { href: "/congreso/legisladores", label: "Legisladores", nota: "Quién te representa y cómo vota", tarea: "buscar" },
          { href: "/congreso/perencion", label: "Por archivarse", nota: "Lo que perime si no avanza", tarea: "vigilar" },
          { href: "/congreso/guia", label: "Cómo nace una ley", nota: "Del depósito a la Gaceta", tarea: "entender" },
        ],
      },
      {
        titulo: "Ejecutivo y altos tribunales",
        seccion: "normativa",
        enlaces: [
          { href: "/normativa", label: "Decretos y leyes", nota: "Lo que se promulga y se firma, por año", tarea: "leer" },
          { href: "/constitucional", label: "Tribunal Constitucional", nota: "Sus sentencias, año por año", tarea: "leer" },
          { href: "/tse", label: "Tribunal Superior Electoral", nota: "Sus sentencias desde 2021", tarea: "leer" },
        ],
      },
      {
        titulo: "Tu voto",
        seccion: "democracia",
        enlaces: [
          { href: "/democracia", label: "Consenso ciudadano", nota: "Qué opinaron los votantes de cada iniciativa", tarea: "participar" },
          { href: "/democracia/seguridad", label: "Cómo se protege tu voto", nota: "Cédula, privacidad y verificación", tarea: "entender" },
        ],
      },
    ],
    destacado: {
      href: "/congreso",
      label: "Elige una iniciativa y vota",
      nota: "Lee qué dice, en qué va y di si estás a favor o en contra.",
      tarea: "participar",
    },
  },
  {
    id: "estado",
    label: "El Estado",
    resumen: "Cada institución, cada provincia y cómo se gestiona.",
    columnas: [
      /*
        Eran ocho enlaces en una columna «Quién es quién» que mezclaba a
        quién se mira (instituciones, provincias, su gestión, sus auditorías)
        con lo que el país produce (cifras, cortes de luz, documentos, datos).
        Revisado con la batería de G4 (scripts/bateria-pantallas.json): nadie
        busca los cortes de luz ni los datos abiertos como «quién es quién».
      */
      {
        titulo: "Quién es quién",
        enlaces: [
          { href: "/instituciones", label: "Instituciones", nota: "Cada ministerio, dirección y ayuntamiento", tarea: "buscar" },
          { href: "/funcionarios", label: "Funcionarios", nota: "Quién ocupa cada cargo público y qué decreto lo nombró", tarea: "buscar" },
          { href: "/empresas", label: "Empresas", nota: "Cualquier empresa del padrón de la DGII, por RNC o por nombre", tarea: "buscar" },
          { href: "/banca", label: "Bancos y financieras", nota: "Quién guarda el dinero: bancos, cooperativas, AFP y aseguradoras", tarea: "buscar" },
          { href: "/provincias", label: "Provincias", nota: "El Estado visto desde tu provincia", tarea: "buscar" },
          { href: "/gestion", label: "Gestión pública", nota: "El ranking SISMAP de instituciones y municipios", tarea: "comparar" },
          { href: "/auditorias", label: "Auditorías y declaraciones", nota: "Quién audita a quién y quién rinde cuentas", tarea: "leer" },
        ],
      },
      {
        titulo: "El país y sus datos",
        enlaces: [
          { href: "/indicadores", label: "Indicadores del país", nota: "Deuda, dólar, combustibles, economía, tribunales y la calle, al día", tarea: "vigilar" },
          { href: "/pais", label: "El país en cifras", nota: "Seguridad, escuela y vivienda, provincia por provincia", tarea: "comparar" },
          { href: "/luz", label: "Cortes de luz programados", nota: "Los mantenimientos anunciados para esta semana", tarea: "vigilar" },
          { href: "/documentos", label: "Biblioteca del Estado", nota: "Informes, memorias y estadísticas que publica cada institución", tarea: "leer" },
          { href: "/datos", label: "Datos abiertos", nota: "Todo el catálogo de datos.gob.do en un buscador", tarea: "buscar" },
        ],
      },
      {
        titulo: "La plataforma",
        enlaces: [
          { href: "/", label: "Inicio", nota: "Qué es Socrático, qué pasa hoy y todo lo que hay", tarea: "vigilar" },
          { href: "/comunidad", label: "Comunidad", nota: "De qué habla la gente: votos y conversación sobre cada registro", tarea: "participar" },
          { href: "/comunidad/normas", label: "Normas de la conversación", nota: "Quién comenta, qué no se permite y cómo se modera", tarea: "entender" },
          { href: "/espacio", label: "Tu espacio", nota: "Tus proyectos, lo que guardaste y lo que sigues", tarea: "participar" },
          { href: "/seguimiento", label: "Mi seguimiento", nota: "Lo que sigues y qué cambió", tarea: "participar" },
          { href: "/fuentes", label: "Estado de las fuentes", nota: "Qué leemos, con qué límites y qué está bloqueado", tarea: "entender" },
          { href: "/seguridad", label: "Seguridad y cumplimiento", nota: "Cómo tratamos los datos", tarea: "entender" },
        ],
      },
    ],
    destacado: {
      href: "/buscar",
      label: "Buscar en todo",
      nota: "Una institución, una ley, un RNC o un tema: una sola caja.",
      tarea: "buscar",
    },
  },
];

/** El punto de color de una columna: el de su vertical, o tinta. */
export function puntoDe(columna: ColumnaMenu): string {
  return SECCIONES.find((s) => s.id === columna.seccion)?.hue.punto ?? "bg-ink";
}

/** ¿Cae la ruta actual dentro de este grupo? Enciende su disparador. */
export function grupoActivo(grupo: GrupoMenu, pathname: string): boolean {
  const rutas = grupo.columnas.flatMap((c) => {
    const seccion = SECCIONES.find((s) => s.id === c.seccion);
    return [...(seccion?.rutas ?? []), ...c.enlaces.map((e) => e.href)];
  });
  return rutas.some(
    (r) => r !== "/" && (pathname === r || pathname.startsWith(`${r}/`)),
  );
}
