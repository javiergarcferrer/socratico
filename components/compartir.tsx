"use client";

import { useState } from "react";
import type { TipoSeguido } from "@/lib/seguimiento";
import { IconCheck, IconShare } from "./icons";
import { Button } from "@/components/ui/button";

/**
 * Compartir y copiar el enlace de una ficha.
 *
 * El texto que acompaña al enlace dice **qué** se comparte. Antes decía «Mira
 * esta licitación» en todas partes, también bajo un proyecto de ley o un
 * decreto, y quien lo recibía en WhatsApp esperaba una compra.
 *
 * «Copiado» se dice en el propio botón durante dos segundos y no en un aviso
 * flotante: la confirmación tiene que aparecer donde estaba mirando el dedo.
 * La región `aria-live` la anuncia también a quien no la ve.
 */
export type TipoCompartido = TipoSeguido | "capitulo";

const ENTRADILLA: Record<TipoCompartido, string> = {
  proceso: "Mira esta compra del Estado",
  proyecto: "Mira este proyecto en el Congreso",
  "expediente-senado": "Mira este expediente del Senado",
  proveedor: "Mira lo que este proveedor le vende al Estado",
  institucion: "Mira esta institución del Estado",
  norma: "Mira esta norma del Poder Ejecutivo",
  capitulo: "Mira cómo gasta esta institución",
  funcionario: "Mira los cargos públicos de esta persona",
  "entidad-financiera": "Mira esta entidad financiera supervisada",
  empresa: "Mira esta empresa en el padrón de la DGII",
};

/** La línea que acompaña al enlace cuando no hay hoja de compartir nativa. */
export function textoCompartir(tipo: TipoCompartido, titulo: string, url: string): string {
  return `${ENTRADILLA[tipo]}: ${titulo}\n${url}`;
}

/** Hoja nativa si existe; si no, WhatsApp, que es por donde se comparte aquí. */
export async function compartirEnlace(tipo: TipoCompartido, titulo: string): Promise<void> {
  const url = window.location.href;
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title: titulo, text: `${ENTRADILLA[tipo]}: ${titulo}`, url });
      return;
    } catch (err) {
      // Cancelar la hoja no es un fallo: no se abre nada más.
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  window.open(
    `https://wa.me/?text=${encodeURIComponent(textoCompartir(tipo, titulo, url))}`,
    "_blank",
    "noopener,noreferrer",
  );
}

/**
 * Copia el enlace de la página. Suelto para que una fila compacta pueda
 * llevarlo dentro de «Más opciones» (`components/acciones-ficha.tsx`).
 */
export function CopiarEnlace({
  className,
  variant = "outline",
}: {
  className?: string;
  variant?: "outline" | "ghost";
}) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* clipboard no disponible */
    }
  };

  return (
    <Button variant={variant} size="sm" onClick={copiar} className={className}>
      {copiado && <IconCheck className="h-4 w-4 text-valido-600" />}
      <span aria-live="polite">{copiado ? "Copiado" : "Copiar enlace"}</span>
    </Button>
  );
}

export default function Compartir({
  titulo,
  tipo = "proceso",
  conCopiar = true,
}: {
  titulo: string;
  tipo?: TipoCompartido;
  /** Sin él, solo el botón de compartir: quien lo usa pone el de copiar aparte. */
  conCopiar?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => compartirEnlace(tipo, titulo)}>
        <IconShare className="h-3.5 w-3.5" />
        Compartir
      </Button>
      {conCopiar && <CopiarEnlace />}
    </span>
  );
}
