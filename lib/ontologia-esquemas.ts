import { z } from "zod";
import { CLASES, PROPIEDADES, curie, type Clase, type Propiedad } from "@/lib/ontologia";

/**
 * Lo que sale de la ontología para los datos (docs/INFRAESTRUCTURA.md §7): las
 * tablas Parquet del grafo y los esquemas zod que validan sus filas y cada
 * nodo, de la **misma definición** que da el OWL, el SHACL y el perfil de
 * Fabric IQ (`lib/ontologia.ts`).
 *
 *  · `TABLAS`: cada tabla de `public/tablas/` es una clase, y cada columna
 *    dice qué propiedad guarda. Su tipo sale del rango de la propiedad (un
 *    `xsd:date` es `DATE`; una referencia a otra clase, el tipo de la clave
 *    de la tabla de esa clase); una columna que no es una propiedad —un
 *    total, una ficha— lo declara. `scripts/build-grafo-tablas.mjs` escribe
 *    las tablas con estos tipos y valida cada fila con `esquemaFila`.
 *  · `esquemaClase`: el nodo de una clase en JSON —sus propiedades de aquí,
 *    con su tipo, una o varias, obligatorias o no—, como las formas SHACL
 *    pero en zod: `scripts/build-grafo.mjs` lo pasa por cada nodo que
 *    compila (el SHACL del gate valida el volcado y una muestra; esto, todo).
 *
 * Las comprobaciones de coherencia —una columna que nombra una propiedad que
 * no existe, o de un dominio que no es su clase, o un tipo que no cabe en su
 * rango— lanzan al cargar el módulo: el build falla antes de escribir una
 * tabla que diga otra cosa que la ontología.
 */

/** Un tipo de columna de Parquet, como lo escribe DuckDB. */
export type TipoColumna = "VARCHAR" | "INTEGER" | "BIGINT" | "DOUBLE" | "BOOLEAN" | "DATE";

export interface Columna {
  nombre: string;
  /** La propiedad de la ontología que guarda (`soc:fecha`, `do:rnc`): de ella sale su tipo. */
  propiedad?: string;
  /** El tipo, si no es una propiedad, o uno más estrecho que su rango (un monto en pesos enteros). */
  tipo?: TipoColumna;
  descripcion: string;
  /** La clave de la fila: nunca NULL. */
  clave?: boolean;
}

export interface Tabla {
  nombre: string;
  /** La clase cuyas instancias son las filas, si la hay. */
  clase?: string;
  /** Lo que el asistente lee de la tabla; `{desde}` y `{hasta}`, la ventana que cubre, los pone quien la escribe. */
  descripcion: string;
  fuente: string;
  columnas: Columna[];
}

/* ---------------------------------------------------------------- tablas */

const FICHA: Columna = { nombre: "url", tipo: "VARCHAR", descripcion: "Su ficha en Socrático." };

export const TABLAS: Tabla[] = [
  {
    nombre: "instituciones",
    clase: "soc:Institucion",
    descripcion: "Las instituciones del Estado (clasificador de DIGEPRES), con lo que contrataron desde 2015 según la DGCP.",
    fuente: "DIGEPRES; DGCP, tabla de contratos",
    columnas: [
      { nombre: "id", tipo: "INTEGER", clave: true, descripcion: "Identificador de la institución; es también su código de unidad de compra en la DGCP." },
      { nombre: "nombre", tipo: "VARCHAR", descripcion: "Nombre oficial." },
      { nombre: "siglas", tipo: "VARCHAR", descripcion: "Siglas, si las tiene (MINERD, MOPC)." },
      {
        nombre: "sector",
        propiedad: "soc:sector",
        descripcion: "ejecutivo, descentralizada, local (ayuntamientos y juntas de distrito), empresa, financiera, poderes, seguridad-social, fideicomiso.",
      },
      { nombre: "capitulo", tipo: "VARCHAR", descripcion: "Capítulo del presupuesto (DIGEPRES)." },
      {
        nombre: "contratos",
        tipo: "INTEGER",
        descripcion:
          "Contratos registrados desde 2015. NULL si no hay ninguno que se le pueda atribuir: no compra por la DGCP, o sus contratos no se atribuyen (sin_asignar). NULL no es cero.",
      },
      {
        nombre: "monto_contratado",
        tipo: "BIGINT",
        descripcion: "Pesos contratados desde 2015 (contratado, no pagado; sin cancelados, otras monedas ni contratos de RD$10 mil millones o más). NULL como contratos.",
      },
      {
        nombre: "sin_asignar",
        tipo: "VARCHAR",
        descripcion: "Si sus contratos comparten prefijo de código con otra unidad y no se le atribuyen, ese prefijo (MOPC, MEPYD): lo contratado existe pero no está en esta fila.",
      },
      FICHA,
    ],
  },
  {
    nombre: "empresas",
    clase: "soc:Empresa",
    descripcion:
      "Personas jurídicas del padrón de la DGII que el grafo liga a algo: proveedoras del Estado, con medidas de la DGCP, en la lista de la OFAC o supervisadas. Ninguna persona física.",
    fuente: "DGII, padrón de contribuyentes (RNC)",
    columnas: [
      { nombre: "rnc", propiedad: "do:rnc", clave: true, descripcion: "RNC de nueve cifras." },
      { nombre: "nombre", tipo: "VARCHAR", descripcion: "Razón social." },
      { nombre: "estado", propiedad: "soc:estado", descripcion: "Estado en el padrón: ACTIVO, SUSPENDIDO, CESE TEMPORAL, DADO DE BAJA, ANULADO." },
      { nombre: "inicio_operaciones", propiedad: "soc:inicioOperaciones", descripcion: "Fecha de inicio de operaciones declarada." },
      { nombre: "actividad", tipo: "VARCHAR", descripcion: "Actividad económica declarada." },
      FICHA,
    ],
  },
  {
    nombre: "proveedores",
    clase: "soc:Proveedor",
    descripcion:
      "Proveedores del Estado inscritos en la DGCP y atados a una empresa por su RNC, con lo que contrataron desde 2015. No incluye a los proveedores personas físicas.",
    fuente: "DGCP, registro de proveedores y tabla de contratos",
    columnas: [
      { nombre: "rpe", propiedad: "do:rpe", clave: true, descripcion: "Registro de Proveedores del Estado." },
      { nombre: "nombre", tipo: "VARCHAR", descripcion: "Nombre como lo registra la DGCP." },
      { nombre: "rnc", tipo: "VARCHAR", descripcion: "RNC de la empresa (empresas.rnc)." },
      { nombre: "contratos", tipo: "INTEGER", descripcion: "Contratos desde 2015 (total, con todos sus clientes)." },
      {
        nombre: "monto_contratado",
        tipo: "BIGINT",
        descripcion: "Pesos contratados desde 2015 (total; contratado, no pagado; sin cancelados, otras monedas ni contratos de RD$10 mil millones o más).",
      },
      { nombre: "primer_contrato", tipo: "DATE", descripcion: "Fecha del primer contrato registrado." },
      { nombre: "ultimo_contrato", tipo: "DATE", descripcion: "Fecha del último contrato registrado." },
      FICHA,
    ],
  },
  {
    nombre: "contrataciones",
    clase: "soc:Contratacion",
    descripcion:
      "Pares institución → proveedor con lo contratado entre ellos desde 2015. Son solo los pares mayores (los 12 mayores proveedores de cada institución y los 8 mayores clientes de cada empresa), no todos: para el total de una institución o de un proveedor usa instituciones.monto_contratado o proveedores.monto_contratado, nunca la suma de esta tabla.",
    fuente: "DGCP, tabla de contratos",
    columnas: [
      { nombre: "institucion_id", propiedad: "soc:contratante", clave: true, descripcion: "La institución que contrata (instituciones.id)." },
      { nombre: "proveedor_rpe", propiedad: "soc:contratista", clave: true, descripcion: "El proveedor contratado (proveedores.rpe)." },
      // Un conteo cabe en INTEGER, más estrecho que el xsd:integer de la propiedad.
      { nombre: "contratos", propiedad: "soc:numeroDeContratos", tipo: "INTEGER", descripcion: "Contratos entre los dos desde 2015." },
      { nombre: "monto", propiedad: "soc:montoContratado", descripcion: "Pesos contratados entre los dos desde 2015." },
    ],
  },
  {
    nombre: "medidas",
    clase: "do:MedidaDGCP",
    descripcion: "Medidas de la DGCP sobre proveedores atados a una empresa: inhabilitaciones, suspensiones, penalidades.",
    fuente: "DGCP, proveedores con medidas",
    columnas: [
      { nombre: "proveedor_rpe", tipo: "VARCHAR", clave: true, descripcion: "El proveedor (proveedores.rpe)." },
      {
        nombre: "tipo",
        propiedad: "do:tipoDeMedida",
        descripcion: "prohibicion, inhabilitacion-permanente, inhabilitacion-temporal, cancelacion, penal, suspension, incumplimiento, condena, levantamiento…",
      },
      // Una medida tiene día: de los dos rangos de soc:fecha (día o año), el día.
      { nombre: "fecha", propiedad: "soc:fecha", tipo: "DATE", descripcion: "Fecha de la medida." },
      { nombre: "titulo", tipo: "VARCHAR", descripcion: "Título del acto." },
      { nombre: "descripcion", tipo: "VARCHAR", descripcion: "Lo que dispone." },
    ],
  },
  {
    nombre: "financieras",
    clase: "soc:EntidadFinanciera",
    descripcion: "Entidades financieras supervisadas: bancos, asociaciones, cooperativas, AFP, aseguradoras.",
    fuente: "Superintendencias de Bancos, Pensiones y Seguros; IDECOOP",
    columnas: [
      { nombre: "slug", tipo: "VARCHAR", clave: true, descripcion: "Identificador en Socrático." },
      { nombre: "nombre", tipo: "VARCHAR", descripcion: "Nombre comercial." },
      { nombre: "razon_social", tipo: "VARCHAR", descripcion: "Razón social." },
      { nombre: "supervisor_id", propiedad: "soc:supervisadaPor", descripcion: "La institución que la supervisa (instituciones.id)." },
      FICHA,
    ],
  },
  {
    nombre: "provincias",
    clase: "soc:Provincia",
    descripcion: "Las provincias y el Distrito Nacional.",
    fuente: "ONE",
    columnas: [
      { nombre: "slug", tipo: "VARCHAR", clave: true, descripcion: "Identificador en Socrático." },
      { nombre: "nombre", tipo: "VARCHAR", descripcion: "Nombre." },
    ],
  },
  {
    nombre: "equivalencias",
    descripcion: "Un mismo ente en dos registros: una institución que es también una entidad financiera, o su entrada en Wikidata.",
    fuente: "Socrático; Wikidata",
    columnas: [
      { nombre: "nodo", tipo: "VARCHAR", clave: true, descripcion: "La ruta del registro en Socrático (/instituciones/1, /banca/banreservas)." },
      { nombre: "equivale_a", tipo: "VARCHAR", clave: true, descripcion: "La otra ruta en Socrático, o la dirección de Wikidata." },
    ],
  },
  {
    nombre: "procesos",
    clase: "soc:ProcesoDeContratacion",
    descripcion:
      "Todos los procesos de compra publicados en la DGCP del {desde} al {hasta}, con su valor estimado (no adjudicado: el ganador y el monto final no están en esta tabla).",
    fuente: "DGCP, tabla de procesos",
    columnas: [
      { nombre: "codigo", tipo: "VARCHAR", clave: true, descripcion: "Código del proceso." },
      { nombre: "titulo", tipo: "VARCHAR", descripcion: "Carátula, como la publica la unidad de compra." },
      { nombre: "unidad_compra", tipo: "VARCHAR", descripcion: "Unidad de compra que lo publica." },
      {
        nombre: "modalidad",
        tipo: "VARCHAR",
        descripcion:
          "Modalidad, como la dice la DGCP: Compras por Debajo del Umbral, Contratación Menor, Procesos de Excepción, Comparación de Precios, Licitación Pública Nacional, Subasta Inversa, Licitación Pública Abreviada, Sorteo de Obras, Licitación Pública Internacional, Licitación Restringida.",
      },
      {
        nombre: "estado",
        tipo: "VARCHAR",
        descripcion:
          "Estado el día del corte, como lo dice la DGCP: Proceso publicado (abierto a ofertas), Proceso con etapa cerrada, Sobres estan abriendose, Sobres abiertos o aperturados, Proceso adjudicado y celebrado, Proceso desierto, Cancelado, Suspendido.",
      },
      { nombre: "objeto", tipo: "VARCHAR", descripcion: "Bienes, Obras o Servicios." },
      { nombre: "fecha", tipo: "DATE", descripcion: "Fecha de publicación." },
      // En pesos enteros, como los publica la DGCP: más estrecho que el xsd:decimal de la propiedad.
      { nombre: "valor_estimado", propiedad: "soc:valorEstimado", tipo: "BIGINT", descripcion: "Valor estimado en pesos; NULL si no lo trae." },
      FICHA,
    ],
  },
  {
    nombre: "obras",
    clase: "soc:ProyectoDeInversion",
    descripcion: "Los proyectos de inversión pública que publica MapaInversiones: quién los ejecuta, su sector, su estado, su costo y su avance.",
    fuente: "MapaInversiones (MEPyD)",
    columnas: [
      { nombre: "snip", propiedad: "do:snip", clave: true, descripcion: "Código SNIP del proyecto." },
      { nombre: "nombre", tipo: "VARCHAR", descripcion: "Nombre del proyecto." },
      { nombre: "ejecutora_id", propiedad: "soc:ejecutadoPor", descripcion: "La institución que lo ejecuta (instituciones.id); NULL si el cruce no la ata." },
      { nombre: "sector", propiedad: "soc:sectorDeInversion", descripcion: "Sector de inversión: transporte, educacion, salud, agua…" },
      { nombre: "estado", propiedad: "soc:estado", descripcion: "Estado en MapaInversiones: En ejecución, Paralizado, Terminado…" },
      { nombre: "valor_estimado", propiedad: "soc:valorEstimado", descripcion: "Costo del proyecto en pesos, como lo publica MapaInversiones." },
      { nombre: "avance", propiedad: "soc:avance", descripcion: "Avance físico en por ciento (0 a 100); NULL si no lo publica." },
      { nombre: "desde", propiedad: "soc:desde", descripcion: "Fecha de inicio." },
      { nombre: "hasta", propiedad: "soc:hasta", descripcion: "Fecha de fin prevista." },
      FICHA,
    ],
  },
  {
    nombre: "obras_provincias",
    descripcion: "Dónde está cada obra: una fila por obra y provincia (una obra puede estar en varias, y una nacional en ninguna).",
    fuente: "MapaInversiones (MEPyD)",
    columnas: [
      { nombre: "obra_snip", tipo: "VARCHAR", clave: true, descripcion: "La obra (obras.snip)." },
      { nombre: "provincia_slug", tipo: "VARCHAR", clave: true, descripcion: "La provincia (provincias.slug)." },
    ],
  },
  {
    nombre: "procesos_obra",
    clase: "soc:ProcesoDeContratacion",
    descripcion:
      "Los procesos de compra que MapaInversiones asocia a alguna obra, de cualquier año: una fila por proceso (sus obras, en obras_procesos). Los de los doce meses de la tabla procesos están también allí, con su modalidad y su estado.",
    fuente: "MapaInversiones (MEPyD)",
    columnas: [
      { nombre: "codigo", propiedad: "soc:codigo", clave: true, descripcion: "Código del proceso (procesos.codigo, si es de los doce meses de esa tabla)." },
      { nombre: "titulo", tipo: "VARCHAR", descripcion: "Carátula del proceso; NULL si MapaInversiones no la trae." },
      { nombre: "valor_estimado", propiedad: "soc:valorEstimado", descripcion: "Valor estimado del proceso en pesos, una vez aunque sea de varias obras." },
      FICHA,
    ],
  },
  {
    nombre: "obras_procesos",
    descripcion: "Qué procesos tiene cada obra: una fila por obra y proceso (un proceso puede ser de varias obras; su valor está una sola vez, en procesos_obra).",
    fuente: "MapaInversiones (MEPyD)",
    columnas: [
      { nombre: "obra_snip", tipo: "VARCHAR", clave: true, descripcion: "La obra (obras.snip)." },
      { nombre: "proceso_codigo", tipo: "VARCHAR", clave: true, descripcion: "El proceso (procesos_obra.codigo)." },
    ],
  },
  {
    nombre: "contratos_obra",
    clase: "soc:Contrato",
    descripcion:
      "Los contratos que MapaInversiones asocia a alguna obra, con su contratista, su proceso y su monto: una fila por contrato (sus obras, en obras_contratos). Sin los de contratistas que no están atados a una empresa (pueden ser personas físicas).",
    fuente: "MapaInversiones (MEPyD)",
    columnas: [
      { nombre: "codigo", propiedad: "soc:codigo", clave: true, descripcion: "Código del contrato." },
      { nombre: "proveedor_rpe", propiedad: "soc:contratista", clave: true, descripcion: "El contratista (proveedores.rpe)." },
      { nombre: "proceso_codigo", propiedad: "soc:delProceso", descripcion: "El proceso del que sale (procesos_obra.codigo)." },
      { nombre: "monto", propiedad: "soc:monto", descripcion: "Monto del contrato en pesos, una vez aunque sea de varias obras." },
      { nombre: "estado", propiedad: "soc:estado", descripcion: "Estado del contrato en MapaInversiones." },
      { nombre: "descripcion", tipo: "VARCHAR", descripcion: "Objeto del contrato." },
    ],
  },
  {
    nombre: "obras_contratos",
    descripcion:
      "Qué contratos tiene cada obra: una fila por obra y contrato (un contrato puede ser de varias obras; su monto está una sola vez, en contratos_obra, y lo que le toca a cada obra no se publica).",
    fuente: "MapaInversiones (MEPyD)",
    columnas: [
      { nombre: "obra_snip", tipo: "VARCHAR", clave: true, descripcion: "La obra (obras.snip)." },
      { nombre: "contrato_codigo", tipo: "VARCHAR", clave: true, descripcion: "El contrato (contratos_obra.codigo)." },
      { nombre: "proveedor_rpe", tipo: "VARCHAR", clave: true, descripcion: "Su contratista (contratos_obra.proveedor_rpe): con el código, la clave del contrato." },
    ],
  },
  {
    nombre: "normas",
    clase: "soc:Norma",
    descripcion:
      "Los decretos, las leyes y las resoluciones que son nodo del grafo (número con año y ficha propia), sin su título: los títulos nombran a quien designan, pensionan o reconocen, y se leen uno a uno con fetch.",
    fuente: "Consultoría Jurídica del Poder Ejecutivo: registros de decretos y de leyes, normativa reciente",
    columnas: [
      { nombre: "id", tipo: "VARCHAR", clave: true, descripcion: "La ruta de su ficha (/normativa/ley/87-01), que es su id en fetch." },
      { nombre: "tipo", tipo: "VARCHAR", descripcion: "decreto, ley o resolucion." },
      { nombre: "numero", propiedad: "soc:numero", descripcion: "Número como lo escribe la Consultoría (87-01, 15-2000)." },
      { nombre: "fecha", propiedad: "soc:fecha", tipo: "DATE", descripcion: "Fecha de la norma: de firma o de promulgación." },
      { nombre: "gaceta", propiedad: "do:gaceta", descripcion: "La Gaceta Oficial que la publica, si la Consultoría lo dice." },
      { nombre: "etiqueta", propiedad: "do:etiquetaConsultoria", descripcion: "La etiqueta de institución que le pone la Consultoría, tal cual." },
      { nombre: "materia", tipo: "VARCHAR", descripcion: "Solo decretos: su materia por la regla del grafo (nombramientos, pensiones, exequatur…)." },
      {
        nombre: "aviso",
        tipo: "VARCHAR",
        descripcion: "Solo decretos: «fecha» si la fecha no casa con el año del número (1900-01-01, por ejemplo), «fuera» si cae fuera de los períodos de su firmante. Errores de captura del registro: se marcan, no se corrigen.",
      },
    ],
  },
  {
    nombre: "iniciativas",
    clase: "soc:Iniciativa",
    descripcion:
      "Las iniciativas del SIL de la Cámara de Diputados de los períodos 2020-2024 y 2024-2028, sin su título (nombran a quien pensionan o reconocen; se leen una a una con fetch): su tipo, su condición el día del corte, su tema, su fecha de depósito y la norma en que se convirtió.",
    fuente: "SIL de la Cámara de Diputados",
    columnas: [
      { nombre: "id", tipo: "VARCHAR", clave: true, descripcion: "La ruta de su ficha (/congreso/158590), que es su id en fetch." },
      { nombre: "expediente", propiedad: "soc:codigo", descripcion: "Número de expediente en el SIL (00101-2020-2024-CD)." },
      { nombre: "tipo", propiedad: "do:tipoDeIniciativa", descripcion: "proyecto-de-ley, resolucion-interna o resolucion-bicameral." },
      { nombre: "condicion", propiedad: "do:condicionLegislativa", descripcion: "depositada, en-tramite, aprobada, retirada, perimida, fusionada u observada (por el Poder Ejecutivo), el día del corte." },
      { nombre: "tema", propiedad: "do:temaLegislativo", descripcion: "Tema del SIL: economia, justicia, seguridad-social, agricultura…" },
      { nombre: "fecha", propiedad: "soc:fecha", tipo: "DATE", descripcion: "Fecha de depósito." },
      { nombre: "promulgada_como", propiedad: "soc:promulgadaComo", descripcion: "La norma en que se convirtió (normas.id), si el SIL guarda su número y esa norma es nodo." },
    ],
  },
  {
    nombre: "citas",
    descripcion:
      "Qué ley o qué decreto con ficha nombra el título de cada norma o iniciativa, y qué le hace según el verbo que lo antecede. Solo cambia una norma quien puede: una ley a una ley o a un decreto, un decreto a otro decreto, un proyecto de ley a cualquiera de los dos; lo demás es cita. En una iniciativa, deroga y modifica son lo que propone.",
    fuente: "Socrático: regla sobre los títulos de la Consultoría Jurídica y del SIL",
    columnas: [
      { nombre: "de", tipo: "VARCHAR", clave: true, descripcion: "Quien la nombra: una norma (normas.id) o una iniciativa (iniciativas.id)." },
      { nombre: "a", tipo: "VARCHAR", clave: true, descripcion: "La norma nombrada (normas.id)." },
      { nombre: "relacion", tipo: "VARCHAR", descripcion: "deroga, modifica (modifica, reforma, sustituye o adiciona) o cita." },
    ],
  },
];

/* --------------------------------------------------------------- tipos */

const POR_CURIE_P = new Map(PROPIEDADES.map((p) => [curie(p), p]));
const POR_CURIE_C = new Map(CLASES.map((c) => [curie(c), c]));

/** La clase y las de las que es un caso, de abajo arriba (por `padre`). */
function linaje(clase: string): string[] {
  const salida: string[] = [];
  for (let c: Clase | undefined = POR_CURIE_C.get(clase); c; c = c.padre ? POR_CURIE_C.get(c.padre) : undefined) salida.push(curie(c));
  return salida;
}

/** Los tipos de columna que caben en cada rango de dato. */
const CABE: Record<string, TipoColumna[]> = {
  "xsd:string": ["VARCHAR"],
  "rdf:langString": ["VARCHAR"],
  "xsd:integer": ["BIGINT", "INTEGER"],
  "xsd:decimal": ["DOUBLE", "BIGINT", "INTEGER"],
  "xsd:boolean": ["BOOLEAN"],
  "xsd:date": ["DATE"],
  "xsd:gYear": ["VARCHAR"],
};

/** Lo que cabe para una propiedad: el primero es el tipo que se deriva si la columna no lo dice. */
function tiposDePropiedad(p: Propiedad): TipoColumna[] {
  if (p.tipo === "objeto") {
    // Una referencia: el tipo de la clave de la tabla de su clase; un concepto, su nombre corto.
    const tablas = TABLAS.filter((t) => t.clase && p.rango.includes(t.clase));
    const claves = tablas.map((t) => tipoDeColumna(t.columnas.find((c) => c.clave)!));
    return claves.length ? [...new Set(claves)] : ["VARCHAR"];
  }
  if (p.rango.length === 1) return CABE[p.rango[0]] ?? ["VARCHAR"];
  // Varios rangos (día o año): lo que cabe en alguno; por omisión, texto, que los lleva todos.
  return ["VARCHAR", ...new Set(p.rango.flatMap((r) => CABE[r] ?? []))];
}

/** El tipo de una columna: el que declara, o el de su propiedad. */
export function tipoDeColumna(c: Columna): TipoColumna {
  if (c.tipo) return c.tipo;
  const p = c.propiedad ? POR_CURIE_P.get(c.propiedad) : undefined;
  if (!p) throw new Error(`la columna ${c.nombre} no dice ni su tipo ni su propiedad`);
  return tiposDePropiedad(p)[0];
}

/* Coherencia con la ontología: lanza al cargar el módulo. */
for (const t of TABLAS) {
  if (t.clase && !POR_CURIE_C.has(t.clase)) throw new Error(`tabla ${t.nombre}: la clase ${t.clase} no está en la ontología`);
  if (!t.columnas.some((c) => c.clave)) throw new Error(`tabla ${t.nombre}: sin clave`);
  const clases = t.clase ? linaje(t.clase) : [];
  for (const c of t.columnas) {
    if (!c.propiedad) continue;
    const p = POR_CURIE_P.get(c.propiedad);
    if (!p) throw new Error(`${t.nombre}.${c.nombre}: la propiedad ${c.propiedad} no está en la ontología`);
    if (!p.dominio.some((d) => clases.includes(d))) throw new Error(`${t.nombre}.${c.nombre}: ${c.propiedad} no es de ${t.clase}`);
    if (c.tipo && !tiposDePropiedad(p).includes(c.tipo)) throw new Error(`${t.nombre}.${c.nombre}: ${c.tipo} no cabe en el rango de ${c.propiedad}`);
  }
}

/* ----------------------------------------------------------------- zod */

const ENTERO_32 = 2 ** 31;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

function zodDeTipo(tipo: TipoColumna): z.ZodType {
  switch (tipo) {
    case "VARCHAR":
      return z.string();
    case "INTEGER":
      return z.number().int().gte(-ENTERO_32).lt(ENTERO_32);
    case "BIGINT":
      return z.number().int().refine(Number.isSafeInteger, "entero fuera del rango seguro");
    case "DOUBLE":
      return z.number();
    case "BOOLEAN":
      return z.boolean();
    case "DATE":
      return z.string().regex(DIA, "no es una fecha AAAA-MM-DD");
  }
}

/** El esquema zod de una fila de la tabla: cada columna con su tipo; NULL solo fuera de la clave. */
export function esquemaFila(t: Tabla) {
  return z.strictObject(Object.fromEntries(t.columnas.map((c) => [c.nombre, c.clave ? zodDeTipo(tipoDeColumna(c)) : zodDeTipo(tipoDeColumna(c)).nullable()])));
}

/**
 * Un valor de una propiedad en el JSON de un nodo, por su rango: un texto, un
 * número, un sí o un no, un día o un año; un IRI si apunta a otro nodo o a
 * un concepto.
 */
function zodDeRango(p: Propiedad): z.ZodType {
  if (p.tipo === "objeto") return z.url();
  const uno = (r: string): z.ZodType => {
    switch (r) {
      case "xsd:integer":
        return z.number().int();
      case "xsd:decimal":
        return z.number();
      case "xsd:boolean":
        return z.boolean();
      case "xsd:date":
        return z.string().regex(DIA);
      case "xsd:gYear":
        return z.string().regex(/^\d{4}$/);
      default:
        return z.string();
    }
  };
  return p.rango.length === 1 ? uno(p.rango[0]) : z.union(p.rango.map(uno) as [z.ZodType, z.ZodType, ...z.ZodType[]]);
}

/**
 * El esquema zod del nodo de una clase en JSON: sus propiedades de la
 * ontología —las de su dominio y las de las clases de las que es un caso—
 * por su nombre corto (`soc:fecha`), una sola si es funcional, una lista si
 * no; las que la clase exige, obligatorias. Abierto: un nodo lleva además lo
 * de fuera (schema.org, ORG), como en SHACL.
 */
export function esquemaClase(clase: string) {
  const clases = linaje(clase);
  const forma: Record<string, z.ZodType> = {};
  for (const p of PROPIEDADES) {
    if (!p.dominio.some((d) => clases.includes(d))) continue;
    const valor = zodDeRango(p);
    const campo = p.funcional ? valor : z.array(valor).min(1);
    forma[curie(p)] = p.obligatoriaEn?.some((o) => clases.includes(o)) ? campo : campo.optional();
  }
  return z.looseObject(forma);
}
