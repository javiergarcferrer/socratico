"use client";

import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * Una fila de filtros demasiado larga para el teléfono, plegada: se ven los
 * primeros y el mando que abre el resto es un filtro más, al final de la misma
 * fila, que dice **cuántos hay** (la política de `Plegable`).
 *
 * No es `Plegable` porque ese es la barra ancha bajo un bloque con filete; aquí
 * el mando vive entre chips y tiene que parecer uno. Los plegados se quedan en
 * el marcado con `hidden`: fuera de la vista y del orden del tabulador hasta que
 * se abren, y siguen siendo enlaces que el buscador rastrea.
 */
export default function FiltrosPlegados({
  visibles,
  resto,
  total,
}: {
  /** Lo que se ve siempre: «Todas», los de más peso y el activo. */
  visibles: ReactNode;
  /** Los demás filtros, ya como enlaces. */
  resto: ReactNode;
  /** Cuántos hay en total, para el mando: «Ver todas · 23». */
  total: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  return (
    <>
      {visibles}
      <span id={id} hidden={!abierto} className="contents">
        {resto}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto((a) => !a)}
        className="h-10 font-semibold text-brand-700 hover:text-brand-800 sm:h-9"
      >
        {abierto ? "Ver menos" : `Ver todas · ${total}`}
      </Button>
    </>
  );
}
