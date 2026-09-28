/**
 * Atajos de teclado de los formularios.
 *
 * En un `<textarea>` Enter es un salto de línea, así que enviar pide ⌘/Ctrl+Enter
 * —la convención de cualquier caja de comentarios—. Se usa `requestSubmit` y no
 * `submit` para que pase por el `onSubmit` del formulario (validación incluida).
 */
import type { KeyboardEvent } from "react";

export function enviarConModificador(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.nativeEvent.isComposing) return;
  e.preventDefault();
  e.currentTarget.form?.requestSubmit();
}
