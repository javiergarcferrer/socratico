import type { MouseEvent } from "react";

/**
 * ¿Es un clic simple, sin tecla que pida otra pestaña? Un enlace del banco
 * de trabajo abre el nodo en el inspector solo con el clic simple; con
 * ⌘, Ctrl, Mayús o la rueda, el navegador hace lo suyo y lo abre aparte.
 */
export function clicSimple(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
