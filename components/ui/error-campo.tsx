/**
 * Error de campo — lo que falta, dicho junto al campo que lo pide.
 *
 * El campo lo nombra con `aria-describedby` y marca `aria-invalid`. La región
 * viva existe siempre y solo cambia su texto: un lector de pantalla no anuncia
 * una región que aparece ya llena. Vacía se aparta con `sr-only` (no con
 * `display: none`) para no abrir hueco en el formulario. En alerta y no en
 * sello: el sello es escaso y no se gasta en validar (.claude/rules/identidad.md).
 */

import * as React from "react";

import { cn } from "@/lib/cn";

function ErrorCampo({ id, className, children }: { id: string; className?: string; children?: React.ReactNode }) {
  return (
    <p id={id} aria-live="polite" data-slot="error-campo" className={cn("text-xs text-alerta-700 empty:sr-only", className)}>
      {children}
    </p>
  );
}

export { ErrorCampo };
