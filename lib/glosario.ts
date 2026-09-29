/**
 * El vocabulario del Estado, traducido en el punto de uso.
 *
 * `docs/IDENTIDAD.md` obliga a explicar «perimió» antes de usarlo. Un glosario
 * aparte no cumple eso: nadie abre un glosario. La traducción tiene que estar
 * pegada a la palabra, y por eso cada entrada se lee a través de
 * `components/termino.tsx`: la palabra subrayada con puntos, y al tocarla, la
 * frase llana.
 *
 * Reglas de redacción:
 *  · **Primero lo que el término hace, después cómo se llama.** «Se archiva si
 *    no avanza (perime)», no «perime (se archiva)».
 *  · **Solo lo que se sabe.** Una definición aquí la lee alguien que no puede
 *    comprobarla; donde la ley fija un plazo que no está verificado, se dice
 *    que hay un plazo y no se inventa el número.
 *  · Un término entra si **aparece en la plataforma**. Un glosario de palabras
 *    que nadie ve es un diccionario, no una ayuda.
 */
export interface Glosa {
  /** Cómo se escribe el término cuando encabeza la explicación. */
  termino: string;
  /** Qué es, en una frase que se entienda sin haber estudiado derecho. */
  llano: string;
  /** Nombre corto para sustituir la jerga como etiqueta principal, si procede. */
  enLlano?: string;
  /** La guía que lo cuenta entero, si la hay. */
  guia?: { href: string; label: string };
}

const GUIA_LEY = { href: "/congreso/guia", label: "Cómo nace una ley" };
const GUIA_PRESUPUESTO = { href: "/finanzas/guia", label: "Cómo leer el presupuesto" };
const GUIA_DEUDA = { href: "/finanzas/guia/deuda", label: "Qué es la deuda pública" };
const GUIA_COMPRAS = { href: "/guia", label: "Cómo se le oferta al Estado" };

export const GLOSARIO = {
  /* ------------------------------------------------------------ Congreso */
  iniciativa: {
    termino: "Iniciativa",
    llano:
      "Cualquier pieza que entra al Congreso para ser discutida: un proyecto de ley, una resolución, un contrato que el Congreso debe aprobar. Todavía no obliga a nadie.",
    guia: GUIA_LEY,
  },
  comision: {
    termino: "Comisión",
    llano:
      "El grupo pequeño de legisladores que estudia una pieza antes de que se vote en el pleno. Ahí se hacen la mayoría de los cambios, y ahí se quedan muchas piezas.",
    guia: GUIA_LEY,
  },
  perencion: {
    termino: "Perención",
    llano:
      "Si una pieza no completa su trámite en el plazo que fija la Constitución, que se cuenta por legislaturas, se da por no iniciada y hay que volver a depositarla desde cero. El Congreso lo llama perención.",
    enLlano: "Se archivan al cerrar",
    guia: GUIA_LEY,
  },
  perime: {
    termino: "Perime",
    llano:
      "Se archiva si no avanza antes de que cierre la legislatura. Para revivirla habría que depositarla otra vez desde cero.",
    enLlano: "Se archiva en",
    guia: GUIA_LEY,
  },
  legislatura: {
    termino: "Legislatura",
    llano:
      "Cada uno de los dos períodos de sesiones que el Congreso abre al año: 150 días desde el 27 de febrero y desde el 16 de agosto.",
    guia: GUIA_LEY,
  },
  cuatrienio: {
    termino: "Cuatrienio",
    llano:
      "El período de cuatro años de un Congreso, entre elección y elección. Cada cuatrienio guarda sus expedientes por separado.",
  },
  condicion: {
    termino: "Condición",
    llano:
      "Los sistemas del Congreso llevan dos clasificaciones a la vez, «condición» y «estado», y no siempre coinciden. La condición dice a grandes rasgos si la pieza sigue viva, se aprobó o perimió; el estado, en qué trámite va.",
  },
  promulgacion: {
    termino: "Promulgación",
    llano:
      "La firma del Presidente que convierte en ley lo que aprobaron las dos cámaras. Sin ella, la pieza no obliga a nadie.",
    guia: GUIA_LEY,
  },
  observacion: {
    termino: "Observación",
    llano:
      "El Presidente devolvió la ley al Congreso con reparos en vez de promulgarla. El Congreso puede acogerlos o insistir en su texto con una mayoría de dos tercios.",
    guia: GUIA_LEY,
  },
  gacetaOficial: {
    termino: "Gaceta Oficial",
    llano:
      "La publicación del Estado donde salen las leyes y los decretos. Una ley promulgada se publica ahí para que todo el mundo pueda conocerla.",
    guia: GUIA_LEY,
  },

  /* ----------------------------------------------------------- Normativa */
  decreto: {
    termino: "Decreto",
    llano:
      "Una orden firmada por el Presidente de la República: nombra y destituye funcionarios, crea comisiones, reglamenta leyes. No pasa por el Congreso.",
  },
  reglamento: {
    termino: "Reglamento",
    llano:
      "El texto que baja una ley al detalle: cómo se aplica, con qué formularios y plazos. Lo dicta el Ejecutivo y no puede contradecir la ley que desarrolla.",
  },
  resolucion: {
    termino: "Resolución",
    llano:
      "Una decisión formal de un órgano del Estado sobre un asunto concreto. En el Congreso aprueba, por ejemplo, contratos y acuerdos; en un ministerio, una disposición interna.",
  },

  /* ------------------------------------------------------------- Compras */
  rpe: {
    termino: "RPE",
    llano:
      "Registro de Proveedores del Estado: el número con el que una empresa o persona queda habilitada para venderle al Estado.",
    guia: GUIA_COMPRAS,
  },
  rnc: {
    termino: "RNC",
    llano:
      "Registro Nacional de Contribuyentes: el número con el que la DGII identifica a una empresa para los impuestos. Una persona usa su cédula.",
  },
  unidadCompra: {
    termino: "Unidad de compra",
    llano:
      "La oficina de una institución que publica y lleva sus compras. Un ministerio grande puede tener varias.",
  },
  modalidad: {
    termino: "Modalidad",
    llano:
      "El procedimiento por el que se compra: cada uno tiene sus umbrales de monto y sus reglas de publicidad. Cuanto más grande la compra, más abierto tiene que ser.",
    guia: GUIA_COMPRAS,
  },
  procesoExcepcion: {
    termino: "Proceso de excepción",
    llano:
      "Una compra que la ley permite hacer sin la competencia abierta normal, por un motivo que tiene que declararse: una emergencia, un proveedor único, la seguridad nacional.",
    guia: GUIA_COMPRAS,
  },
  emergencia: {
    termino: "Emergencia",
    llano:
      "Un tipo de excepción para atender un desastre o una urgencia que no da tiempo a licitar. La institución compra directo, pero tiene que dejar escrito por qué no podía esperar.",
  },
  proveedorUnico: {
    termino: "Proveedor único",
    llano:
      "Excepción que se usa cuando solo una empresa puede dar el bien o el servicio, por ejemplo por una patente o una exclusividad. Por eso no compite nadie más.",
  },
  oferenteUnico: {
    termino: "Oferente único",
    llano:
      "Se presentó una sola oferta. No es ilegal, pero significa que no hubo competencia de precio.",
  },
  desierto: {
    termino: "Desierto",
    llano:
      "El proceso terminó sin ganador: no llegaron ofertas o ninguna cumplió. Suele volver a publicarse.",
    guia: GUIA_COMPRAS,
  },
  adjudicado: {
    termino: "Adjudicado",
    llano:
      "La institución ya eligió a quién le compra y por cuánto. Después viene el contrato.",
  },
  montoEstimado: {
    termino: "Monto estimado",
    llano:
      "Lo que la institución calcula que costará, antes de recibir ofertas. El monto finalmente adjudicado suele ser distinto.",
  },
  pacc: {
    termino: "PACC",
    llano:
      "Plan Anual de Compras y Contrataciones: la lista de lo que cada institución dice, a principio de año, que va a comprar. Una compra fuera del plan no es ilegal, pero no estaba prevista.",
  },
  mipyme: {
    termino: "MIPYME",
    llano:
      "Micro, pequeña o mediana empresa. Algunas compras se reservan solo para ellas, y algunas solo para las lideradas por mujeres.",
  },
  pliego: {
    termino: "Pliego de condiciones",
    llano:
      "El documento que dice exactamente qué se compra, qué hay que presentar y cómo se va a elegir al ganador. Es lo primero que hay que leer.",
    guia: GUIA_COMPRAS,
  },

  /* ------------------------------------------------------------ Finanzas */
  presupuestoInicial: {
    termino: "Presupuesto inicial",
    llano:
      "Lo que el Congreso aprobó en la Ley de Presupuesto para el año, antes de cualquier cambio.",
    guia: GUIA_PRESUPUESTO,
  },
  vigente: {
    termino: "Presupuesto vigente",
    llano:
      "El aprobado al abrir el año más las modificaciones hechas después. Sube y baja durante el año: por eso no coincide con el inicial.",
    guia: GUIA_PRESUPUESTO,
  },
  comprometido: {
    termino: "Comprometido",
    llano:
      "El Estado firmó algo que lo obliga, como un contrato o una orden de compra, pero todavía no ha recibido el bien o el servicio.",
    guia: GUIA_PRESUPUESTO,
  },
  devengado: {
    termino: "Devengado",
    llano:
      "El Estado ya recibió lo que compró y nació la obligación de pagar, aunque el dinero no haya salido. Es la medida honesta de «cuánto gastó».",
    guia: GUIA_PRESUPUESTO,
  },
  pagado: {
    termino: "Pagado",
    llano:
      "El dinero salió de la cuenta del Tesoro. Puede ir por detrás del devengado: esa distancia es lo que se debe a proveedores y contratistas.",
    guia: GUIA_PRESUPUESTO,
  },
  ejecucion: {
    termino: "Ejecución",
    llano:
      "Qué parte del presupuesto vigente ya se gastó, medida con lo devengado. Un porcentaje bajo cerca de fin de año indica que la institución gastó menos de lo que tenía asignado.",
    guia: GUIA_PRESUPUESTO,
  },
  capitulo: {
    termino: "Capítulo presupuestario",
    llano:
      "El código con que el presupuesto identifica a cada institución: 0206 es el Ministerio de Educación, por ejemplo. Es el número que une sus cifras en todos los informes de Hacienda.",
    guia: GUIA_PRESUPUESTO,
  },
  deudaAdministrativa: {
    termino: "Deuda administrativa",
    llano:
      "Lo que el Estado ya recibió y todavía no ha pagado: bienes entregados, obras hechas, servicios prestados. No es deuda con bancos ni bonos; es con sus propios proveedores.",
    guia: GUIA_PRESUPUESTO,
  },
  sigef: {
    termino: "SIGEF",
    llano:
      "Sistema de Información de la Gestión Financiera: el sistema de Hacienda donde cada institución registra su presupuesto y cada paso de su gasto.",
  },

  /* --------------------------------------------------------------- Deuda */
  spnf: {
    termino: "SPNF",
    llano:
      "Sector Público No Financiero: el gobierno central, las instituciones descentralizadas, la seguridad social, los ayuntamientos y las empresas públicas que no son bancos. Deja fuera al Banco Central y a la banca pública.",
    guia: GUIA_DEUDA,
  },
  deudaExterna: {
    termino: "Deuda externa",
    llano:
      "La que se debe a acreedores de fuera del país: organismos como el BID o el Banco Mundial, otros gobiernos, y quienes compraron bonos dominicanos en el mercado internacional.",
    guia: GUIA_DEUDA,
  },
  deudaInterna: {
    termino: "Deuda interna",
    llano:
      "La que se debe a acreedores del país: bancos locales, fondos de pensiones y quienes compraron bonos de Hacienda aquí.",
    guia: GUIA_DEUDA,
  },

  /* -------------------------------------------------------------- Nómina */
  masaSalarial: {
    termino: "Masa salarial",
    llano:
      "Lo que suman todos los sueldos brutos de un mes. No incluye pensiones, contratistas ni incentivos fuera de nómina.",
  },
  plaza: {
    termino: "Plaza",
    llano: "Un puesto de trabajo con su sueldo, tal como lo publica la institución.",
  },
  sueldoBruto: {
    termino: "Sueldo bruto",
    llano:
      "El sueldo antes de descontar impuestos y seguridad social. Lo que la persona recibe en la mano es menos.",
  },

  /* -------------------------------------------------------- Funcionarios */
  pep: {
    termino: "Persona expuesta políticamente (PEP)",
    llano:
      "Quien ocupa, o ocupó en los últimos tres años, un cargo obligado a declarar su patrimonio. La Ley 155-17 la llama así para que bancos y notarios revisen sus operaciones con más cuidado. Es una categoría legal, no una acusación.",
    enLlano: "Cargo obligado a declarar patrimonio",
  },
  declaracionJurada: {
    termino: "Declaración jurada de patrimonio",
    llano:
      "Lo que ciertos funcionarios deben declarar de sus bienes ante la Cámara de Cuentas al entrar al cargo y al salir. La Ley 311-14 dice en su artículo 2 quiénes.",
  },
} satisfies Record<string, Glosa>;

export type ClaveGlosario = keyof typeof GLOSARIO;

export function glosa(clave: ClaveGlosario | string): string | null {
  return (GLOSARIO as Record<string, Glosa>)[clave]?.llano ?? null;
}

export function entradaGlosario(clave: ClaveGlosario | string): Glosa | null {
  return (GLOSARIO as Record<string, Glosa>)[clave] ?? null;
}
