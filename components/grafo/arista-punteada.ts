/**
 * La arista punteada del lienzo y del mapa de la ontología: el rectángulo de
 * `sigma` (`EdgeRectangleProgram`) con un trazo cortado en el fragmento. Lo
 * que deriva una regla de Socrático (y, en el mapa, la relación que la
 * ontología define y el grafo todavía no usa) se dibuja así, y la leyenda lo
 * dice; el grosor no es la única lectura.
 *
 * El largo de cada tramo va en píxeles de pantalla: la posición a lo largo de
 * la arista se interpola entre sus dos extremos (`a_positionCoef`) y se pasa a
 * píxeles con la razón de corrección y la del zoom, las mismas con que sigma
 * pasa el grosor. En el modo de selección (`PICKING_MODE`) la arista va
 * entera, para que el puntero la encuentre también en los huecos.
 */
import type { Attributes } from "graphology-types";
import { EdgeRectangleProgram } from "sigma/rendering";

/** Píxeles de trazo y de hueco. */
const TRAZO = 5;
const HUECO = 4;

export class EdgePunteadaProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> extends EdgeRectangleProgram<N, E, G> {
  getDefinition() {
    const d = super.getDefinition();
    const vertice = d.VERTEX_SHADER_SOURCE.replace("varying float v_feather;", "varying float v_feather;\nvarying float v_largo;").replace(
      "v_normal = unitNormal;",
      "v_normal = unitNormal;\n  v_largo = a_positionCoef * length(a_positionEnd - a_positionStart) / (u_correctionRatio * u_zoomRatio);",
    );
    const fragmento = d.FRAGMENT_SHADER_SOURCE.replace("varying float v_feather;", "varying float v_feather;\nvarying float v_largo;").replace(
      "#else",
      `#else\n  if (mod(v_largo, ${(TRAZO + HUECO).toFixed(1)}) > ${TRAZO.toFixed(1)}) discard;`,
    );
    // Si sigma cambia sus sombreadores y el reemplazo no prende, mejor macizo que roto: se queda el original.
    if (!vertice.includes("v_largo =") || !fragmento.includes("discard")) return d;
    return { ...d, VERTEX_SHADER_SOURCE: vertice, FRAGMENT_SHADER_SOURCE: fragmento };
  }
}
