/**
 * Atajos de teclado de los formularios.
 *
 * En un `<textarea>` Enter es un salto de línea, así que enviar pide ⌘/Ctrl+Enter
 * —la convención de cualquier caja de comentarios—. Se usa `requestSubmit` para
 * que pase por el `onSubmit` del formulario (validación incluida); pero
 * `requestSubmit` no mira si el botón de enviar está apagado, así que eso se
 * comprueba aquí: con el envío en curso (o nada que guardar) el atajo no hace
 * nada, y una tecla mantenida (`repeat`) no manda dos veces.
 */
import type { KeyboardEvent } from "react";

function enviar(e: KeyboardEvent<HTMLTextAreaElement>) {
  e.preventDefault();
  if (e.repeat) return;
  const form = e.currentTarget.form;
  const boton = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!form || boton?.disabled) return;
  form.requestSubmit(boton ?? undefined);
}

/** ⌘/Ctrl+Enter envía; Enter solo, salto de línea. */
export function enviarConModificador(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.nativeEvent.isComposing) return;
  enviar(e);
}

/**
 * Enter envía (Mayús+Enter no): para un área de texto que en realidad es un
 * campo de una línea, como el código del correo o la dirección pegada.
 */
export function enviarConEnter(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
  enviar(e);
}
