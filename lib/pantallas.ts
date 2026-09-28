/**
 * Qué responde cada pantalla, en llano (docs/PLAN-ACCESO.md §6 ter, G4).
 *
 * El menú (`lib/menu.ts`) dice dónde vive cada destino y su nota de una
 * línea; aquí se dice **qué se puede preguntar** en él, con las palabras de
 * quien no sabe cómo se llama la pantalla: «¿cuánto debe el país?» no dice
 * «deuda pública», y «¿a cómo está el dólar?» no dice «panorama». El índice
 * de `lib/busqueda.ts` pone estas frases junto al nombre y la nota de cada
 * destino de `lib/indice.ts`, las pasa por el mismo modelo que el resto del
 * corpus y lleva a la pantalla por lo que significa.
 *
 * Las fichas (una institución, un proveedor, una norma) no están aquí: a
 * esas se llega por su nombre, y el índice ya las tiene una por una. Aquí va
 * lo que ofrece la pantalla que las reúne.
 *
 * La batería que prueba que esto funciona —sesenta preguntas en llano que
 * tienen que llegar a su pantalla entre las tres primeras— está en
 * `scripts/bateria-pantallas.json`. Una pantalla nueva entra aquí con sus
 * preguntas y, si trae una necesidad nueva, con una pregunta en la batería.
 */

export interface Pantalla {
  /** Qué hay, en una o dos frases. */
  que: string;
  /** Preguntas que la pantalla contesta, como las haría alguien. */
  preguntas: string[];
}

export const PANTALLAS: Record<string, Pantalla> = {
  "/": {
    que: "Qué es Socrático: la plataforma independiente para explorar lo que publica el Estado dominicano (compras, presupuesto, deuda, nómina, leyes, Congreso, tribunales), con lo que pasa hoy, todo lo que hay organizado por tema y para qué sirve tener una cuenta.",
    preguntas: ["¿Qué es Socrático?", "¿Qué puedo hacer en esta plataforma?", "¿Para qué sirve crear una cuenta?"],
  },
  "/buscar": {
    que: "Una sola caja para buscar en toda la plataforma: instituciones, legisladores, proveedores, compras, leyes, iniciativas, sentencias, obras, documentos, datos abiertos y cargos.",
    preguntas: ["¿Dónde busco cualquier cosa?", "Buscar un nombre en todo el Estado"],
  },
  "/licitaciones": {
    que: "Las compras que el Estado tiene abiertas ahora en el portal de la DGCP: qué se licita, quién compra, cuánto y hasta cuándo se puede ofertar.",
    preguntas: [
      "¿Qué está comprando el gobierno ahora?",
      "¿Qué licitaciones están abiertas?",
      "¿Dónde veo concursos para venderle al Estado?",
      "¿Qué compras cierran esta semana?",
    ],
  },
  "/contratos": {
    que: "Los contratos adjudicados: quién ganó cada compra del Estado y por cuánto, con las empresas que más contratan.",
    preguntas: [
      "¿Quién ganó los contratos del gobierno?",
      "¿Qué empresas le venden más al Estado?",
      "¿A quién le adjudicaron la compra?",
    ],
  },
  "/proveedores": {
    que: "El registro de proveedores del Estado: busca una empresa o persona por nombre, RNC, cédula o RPE y ve qué le ha vendido al Estado.",
    preguntas: [
      "¿Esta empresa le vende al gobierno?",
      "¿Cuántos contratos tiene una compañía con el Estado?",
      "Buscar una empresa por su RNC",
    ],
  },
  "/estadisticas": {
    que: "El mercado de compras públicas de los últimos treinta días: cuánto se compró, por qué modalidad, cuántas compras fueron directas y cuánta competencia hubo.",
    preguntas: [
      "¿Cuántas compras se hacen sin licitación?",
      "¿Cuánto compró el Estado este mes?",
      "¿Hay competencia en las compras públicas?",
    ],
  },
  "/planes": {
    que: "Los planes anuales de compras (PACC): lo que cada institución anunció que compraría en el año.",
    preguntas: [
      "¿Qué piensa comprar el ministerio este año?",
      "¿Dónde está el plan de compras de una institución?",
    ],
  },
  "/historico": {
    que: "Todo lo contratado por el Estado desde 2015, año por año: cuánto, por quién y a qué proveedores.",
    preguntas: [
      "¿Cuánto ha contratado el Estado desde 2015?",
      "¿Cómo han cambiado las compras públicas por año?",
      "¿Quién le vendió más al gobierno en años pasados?",
    ],
  },
  "/guia": {
    que: "Guía en llano para venderle al Estado: cómo registrarse como proveedor, cómo se licita y qué modalidades hay.",
    preguntas: [
      "¿Cómo le vendo al gobierno?",
      "¿Cómo me registro como proveedor del Estado?",
      "¿Qué es una licitación pública?",
    ],
  },
  "/finanzas": {
    que: "La ejecución del presupuesto: cuánto tiene asignado y cuánto ha gastado cada institución, mes a mes, con el subsidio eléctrico y lo que se debe a suplidores.",
    preguntas: [
      "¿En qué gasta el gobierno?",
      "¿Cuánto presupuesto tiene el Ministerio de Educación?",
      "¿Qué institución gasta menos de lo asignado?",
      "¿Cuánto cuesta el subsidio eléctrico?",
    ],
  },
  "/deuda": {
    que: "La deuda pública del Estado desde el año 2000: cuánto se debe, cómo ha crecido, cuánto es interna y externa, y las subastas de bonos.",
    preguntas: [
      "¿Cuánto debe el país?",
      "¿Cuánta deuda tiene la República Dominicana?",
      "¿Ha crecido la deuda pública?",
      "¿Cuánto se paga en bonos del gobierno?",
    ],
  },
  "/finanzas/guia": {
    que: "Cómo leer el presupuesto en llano: qué son lo vigente, lo devengado y lo pagado, y cómo se ejecuta el gasto.",
    preguntas: ["¿Qué significa devengado?", "¿Cómo se lee el presupuesto del Estado?"],
  },
  "/finanzas/guia/deuda": {
    que: "Qué es la deuda pública, en llano: bonos, préstamos, a quién se le debe y por qué importa.",
    preguntas: ["¿Qué es la deuda pública?", "¿Qué es un bono soberano?"],
  },
  "/nomina": {
    que: "La nómina pública detallada de 86 instituciones: plazas, cargos y sueldos (cuánto se le paga a un maestro, un médico, una enfermera, un chofer o un director), con el mismo cargo comparado entre instituciones.",
    preguntas: [
      "¿Cuánto gana un chofer del gobierno?",
      "¿Cuánto cobra un director en el ministerio?",
      "¿Qué sueldo tiene un médico del Estado?",
      "¿Cuántos empleados tiene una institución?",
    ],
  },
  "/nomina/general": {
    que: "La nómina de todo el Estado según el MAP: casi medio millón de plazas, la masa salarial y los sueldos por institución y por cargo.",
    preguntas: [
      "¿Cuántos empleados públicos hay?",
      "¿Cuánto paga el Estado en sueldos al mes?",
      "¿Quién gana más en el gobierno?",
    ],
  },
  "/obras": {
    que: "Las obras y los proyectos de inversión pública del SNIP, provincia por provincia: si la obra existe, dónde está, quién la ejecuta, cuánto cuesta, cuánto avanza y cuáles están atrasadas.",
    preguntas: [
      "¿Cómo va la construcción de la carretera?",
      "¿Qué obras hace el gobierno en mi provincia?",
      "¿Qué obras están atrasadas?",
      "¿Cuánto cuesta la obra del hospital?",
    ],
  },
  "/instituciones": {
    que: "El listado de las instituciones del gobierno (ministerios, direcciones, hospitales y ayuntamientos) y cada una en una sola página: su presupuesto, sus compras, su nómina, sus obras, sus normas y sus documentos.",
    preguntas: [
      "¿Qué hace este ministerio con su dinero?",
      "¿Qué instituciones tiene el Estado?",
      "Todo sobre una institución pública",
    ],
  },
  "/congreso": {
    que: "Las iniciativas de la Cámara de Diputados en vivo: proyectos de ley y resoluciones, en qué punto van, quién los propuso, y dónde votar a favor o en contra.",
    preguntas: [
      "¿Qué leyes se están discutiendo?",
      "¿En qué va el proyecto de ley?",
      "¿Qué aprobaron los diputados?",
      "¿Qué proyectos de ley hay sobre educación?",
    ],
  },
  "/congreso/senado": {
    que: "Los expedientes del Senado de la República del cuatrienio: proyectos, resoluciones y su estado.",
    preguntas: ["¿Qué está conociendo el Senado?", "¿Qué aprobó el Senado?"],
  },
  "/congreso/legisladores": {
    que: "Los diputados y senadores: quién representa a cada provincia, de qué partido son, qué han propuesto y cómo votan.",
    preguntas: [
      "¿Quién es el diputado de mi provincia?",
      "¿Cómo votó mi senador?",
      "¿Qué leyes ha propuesto un diputado?",
    ],
  },
  "/congreso/perencion": {
    que: "Las iniciativas que perimen, se archivan sin decidirse, si no avanzan antes de que cierre la legislatura.",
    preguntas: ["¿Qué proyectos se van a archivar?", "¿Qué leyes pierden vigencia al cerrar la legislatura?"],
  },
  "/congreso/guia": {
    que: "Cómo nace una ley, en llano: del depósito en una cámara a la promulgación y la Gaceta Oficial.",
    preguntas: ["¿Cómo se aprueba una ley?", "¿Cuántas lecturas necesita un proyecto?"],
  },
  "/normativa": {
    que: "Los decretos, leyes, reglamentos y resoluciones que firma y promulga el Poder Ejecutivo, año por año, con los nombramientos y la Gaceta Oficial.",
    preguntas: [
      "¿A quién nombró el presidente?",
      "¿Qué decretos salieron esta semana?",
      "¿Dónde leo el texto de una ley?",
      "¿Quién fue designado embajador?",
    ],
  },
  "/constitucional": {
    que: "Las sentencias del Tribunal Constitucional, año por año, con lo que resolvió cada una.",
    preguntas: ["¿Qué decidió el Tribunal Constitucional?", "¿Es constitucional esta ley?"],
  },
  "/tse": {
    que: "Las sentencias del Tribunal Superior Electoral desde 2021: conflictos de partidos, candidaturas y elecciones.",
    preguntas: ["¿Qué resolvió el tribunal electoral?", "¿Quién impugnó una candidatura?"],
  },
  "/democracia": {
    que: "El consenso ciudadano: vota a favor o en contra de las iniciativas del Congreso y mira qué opinaron los demás votantes.",
    preguntas: ["¿Puedo votar sobre un proyecto de ley?", "¿Qué opina la gente de esta ley?"],
  },
  "/democracia/seguridad": {
    que: "Cómo se protege tu voto: la cédula, la privacidad y la verificación con Cuenta Única.",
    preguntas: ["¿Es seguro dar mi cédula para votar?", "¿Quién ve mi voto?"],
  },
  "/provincias": {
    que: "El Estado visto desde cada provincia: sus obras, sus instituciones, sus legisladores y sus cifras.",
    preguntas: [
      "¿Qué hace el gobierno en Santiago?",
      "¿Qué hay del Estado en mi provincia?",
    ],
  },
  "/pais": {
    que: "El país en cifras, provincia por provincia: robos denunciados y armas incautadas, estudiantes matriculados en las escuelas y licencias de construcción de viviendas.",
    preguntas: [
      "¿Cuántos robos hay en mi provincia?",
      "¿Cuántos estudiantes hay en las escuelas públicas?",
      "¿Cuántas viviendas se están construyendo?",
      "¿Cuántas armas se han incautado?",
    ],
  },
  "/luz": {
    que: "Los cortes de luz programados por Edenorte y Edesur para mantenimiento esta semana, por sector, municipio y circuito.",
    preguntas: [
      "¿Van a quitar la luz en mi sector?",
      "¿Cuándo hay mantenimiento eléctrico?",
      "¿Qué circuitos tendrán apagón programado?",
    ],
  },
  "/gestion": {
    que: "El ranking SISMAP del Ministerio de Administración Pública: qué tan bien cumple cada institución, ayuntamiento y distrito municipal los indicadores de gestión.",
    preguntas: [
      "¿Qué institución se gestiona mejor?",
      "¿Cómo está mi ayuntamiento en el ranking?",
      "¿Qué municipio cumple menos?",
    ],
  },
  "/auditorias": {
    que: "Los informes de auditoría de la Contraloría y la Cámara de Cuentas, y quién presentó su declaración jurada de patrimonio.",
    preguntas: [
      "¿Auditaron a este ministerio?",
      "¿Qué encontró la Cámara de Cuentas?",
      "¿Dónde está la declaración jurada de un funcionario?",
    ],
  },
  "/documentos": {
    que: "La biblioteca del Estado: informes, memorias, estadísticas, nóminas y documentos de transparencia que publican las instituciones en sus portales.",
    preguntas: [
      "¿Dónde está la memoria anual del ministerio?",
      "¿Dónde encuentro un informe de una institución?",
      "Documentos de transparencia de una entidad",
    ],
  },
  "/datos": {
    que: "Todo el catálogo de datos abiertos de datos.gob.do en un buscador: conjuntos de datos por tema, institución y formato.",
    preguntas: [
      "¿Dónde descargo datos abiertos del gobierno?",
      "¿Hay un archivo con estadísticas en Excel?",
    ],
  },
  "/indicadores": {
    que: "El panorama del país en una página: la deuda pública, la tasa del dólar, los precios de los combustibles, la inflación, las remesas, las reservas, el turismo, la banca, el comercio exterior, los tribunales, la electricidad del día, las alertas del tiempo y los accidentes de tránsito.",
    preguntas: [
      "¿A cómo está el dólar hoy?",
      "¿Cuánto cuesta la gasolina?",
      "¿Cuál es la inflación?",
      "¿Cuántas remesas llegaron?",
      "¿Cuántos turistas vienen al país?",
      "¿Hay apagones hoy?",
      "¿Hay alerta por tormenta o ciclón?",
      "¿Cuántos muertos hay en accidentes de tránsito?",
      "¿Cuánto exporta e importa el país?",
      "¿A qué tasa prestan los bancos?",
    ],
  },
  "/espacio": {
    que: "Tu espacio con cuenta: investigaciones que juntan compras, leyes, proveedores y documentos, con notas, enlaces entre ellos, colaboradores y publicación.",
    preguntas: [
      "¿Dónde guardo lo que encuentro?",
      "¿Cómo armo una investigación con varios registros?",
      "¿Cómo comparto una investigación con otro periodista?",
    ],
  },
  "/seguimiento": {
    que: "Lo que sigues en la plataforma (licitaciones, iniciativas, instituciones) y qué cambió desde la última vez.",
    preguntas: ["¿Qué cambió en lo que sigo?", "¿Cómo recibo avisos de una licitación?"],
  },
  "/fuentes": {
    que: "Qué fuentes del Estado lee la plataforma, con qué límites de cobertura, cuándo se actualizaron y cuáles están bloqueadas.",
    preguntas: ["¿De dónde salen estos datos?", "¿Qué tan actualizados están los datos?"],
  },
  "/seguridad": {
    que: "Cómo trata la plataforma los datos: qué se guarda, qué no, y el cumplimiento de la ley de datos personales.",
    preguntas: ["¿Guardan mis datos?", "¿Qué hacen con mi información?"],
  },
};
