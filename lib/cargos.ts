import type { Movimiento } from "@/lib/funcionarios";

/**
 * Lo que se dice de un cargo sin leer el registro de personas: el movimiento
 * en llano y las familias de la Ley 311-14. Aparte de `lib/funcionarios.ts`
 * para que la ontología, el grafo y el servidor MCP no lleven en su función
 * `funcionarios.json` (~5 MB), que el trazado de archivos mete con cualquier
 * importación de aquel módulo.
 */

/**
 * Los numerales del art. 2 de la Ley 311-14 agrupados en familias de cargo, para
 * filtrar a las personas expuestas políticamente por tipo. Cada familia dice sus
 * numerales; ninguno queda en dos.
 */
export const FAMILIAS_PEP: { clave: string; etiqueta: string; numerales: number[] }[] = [
  { clave: "presidencia", etiqueta: "Presidencia", numerales: [1] },
  { clave: "congreso", etiqueta: "Congreso", numerales: [2] },
  { clave: "justicia", etiqueta: "Jueces y Ministerio Público", numerales: [3, 4, 5, 6] },
  { clave: "gobierno", etiqueta: "Ministerios y direcciones", numerales: [7, 18, 19, 29, 32] },
  { clave: "control", etiqueta: "Órganos de control y electorales", numerales: [8, 10, 11, 12] },
  { clave: "autonomos", etiqueta: "Banca, empresas y entes autónomos", numerales: [9, 13, 20, 21, 30, 31] },
  { clave: "territorio", etiqueta: "Provincias y municipios", numerales: [14, 15, 22] },
  { clave: "exterior", etiqueta: "Servicio exterior", numerales: [17] },
  { clave: "seguridad", etiqueta: "Fuerzas Armadas y Policía", numerales: [23, 24, 26] },
];

/** Qué dice el movimiento, en llano, para la línea de un cargo. */
export const ETIQUETA_MOVIMIENTO: Record<Movimiento, string> = {
  vigente: "En el cargo",
  designa: "Designación",
  confirma: "Confirmación",
  cesa: "Deja el cargo",
  renuncia: "Renuncia aceptada",
  sustituido: "Sustitución",
  asciende: "Ascenso",
  electo: "Elección",
  anterior: "Gestión anterior",
};
