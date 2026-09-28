/**
 * El índice de la plataforma: cada destino, una vez, con dos ejes.
 *
 *  - **Tema** — de qué trata (el grupo y la columna del menú, y su vertical).
 *    Es como se explora: el megamenú y la hoja «Más».
 *  - **Tarea** — qué viene a hacer el lector (`lib/tareas.ts`). Es como se
 *    llega con prisa: la paleta.
 *
 * No es una tabla nueva: se **deriva** de `lib/menu.ts`, donde cada enlace
 * declara su tarea. Antes había tres listas de destinos —las vistas de
 * `lib/secciones`, las páginas de plataforma y el menú— y no coincidían: la
 * paleta no conocía «El país en cifras» ni «Cortes de luz» aunque el menú sí.
 * Tres listas son la «segunda tabla» de docs/IDENTIDAD.md §7, y la forma
 * concreta en que un índice deja de decir la verdad.
 *
 * El gate (`.claude/hooks/indice.py`) exige que toda página estática de
 * `app/` esté en el menú o declarada aquí abajo con su motivo.
 */

import { MENU, puntoDe, type EnlaceMenu } from "@/lib/menu";
import type { SeccionId } from "@/lib/secciones";
import { ORDEN_TAREAS, TAREAS, type Tarea } from "@/lib/tareas";

export interface Destino extends EnlaceMenu {
  /** «Dinero público», «Leyes», «El Estado». */
  grupo: string;
  /** La columna del menú: «Compras públicas», «Congreso Nacional»… */
  tema: string;
  /** Su vertical, si la tiene. */
  seccion?: SeccionId;
  /** La clase del punto de color de su vertical (o tinta). */
  punto: string;
}

/**
 * Las páginas que existen y no son destinos: se llega a ellas desde otra, y
 * ofrecerlas en un índice sería un atajo a ninguna parte.
 */
export const FUERA_DEL_INDICE: Record<string, string> = {
  "/democracia/registro": "Trámite: se llega desde el voto, no se elige.",
  "/democracia/cuenta-unica/callback": "Retorno del inicio de sesión de Cuenta Única.",
  "/cuenta": "Trámite: se llega desde «Entrar» o «Guardar», no se elige.",
  "/espacio/proyecto": "Un proyecto concreto: se abre desde tu espacio, no desde el índice.",
  "/espacio/moderar": "Privada: la cola de quien modera la conversación.",
};

function construir(): Destino[] {
  const vistos = new Set<string>();
  const salida: Destino[] = [];
  for (const g of MENU) {
    for (const c of g.columnas) {
      for (const e of c.enlaces) {
        if (vistos.has(e.href)) continue;
        vistos.add(e.href);
        salida.push({ ...e, grupo: g.label, tema: c.titulo, seccion: c.seccion, punto: puntoDe(c) });
      }
    }
    // El destacado es la puerta de entrada del grupo; si su ruta ya está en
    // una columna, manda la columna (su tarea y su nota son las del sitio).
    if (!vistos.has(g.destacado.href)) {
      vistos.add(g.destacado.href);
      salida.push({ ...g.destacado, grupo: g.label, tema: g.label, punto: "bg-ink" });
    }
  }
  return salida;
}

/** Todos los destinos de la plataforma, en el orden del menú. */
export const INDICE: Destino[] = construir();

/** Los destinos agrupados por tarea, en el orden de `ORDEN_TAREAS`. */
export function porTarea(): { tarea: Tarea; etiqueta: string; destinos: Destino[] }[] {
  return ORDEN_TAREAS.map((tarea) => ({
    tarea,
    etiqueta: TAREAS[tarea].etiqueta,
    destinos: INDICE.filter((d) => d.tarea === tarea),
  }));
}
