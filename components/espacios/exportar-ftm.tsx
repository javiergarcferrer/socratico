"use client";

import { useState } from "react";
import { archivoFtm, casoAFtm, type EnlaceFtm, type EntradaFtm } from "@/lib/ftm";
import { Button } from "@/components/ui/button";
import { IconDownload } from "@/components/icons";

/**
 * Descarga el caso en FollowTheMoney (`lib/ftm.ts`): para seguirlo en Aleph o
 * cruzarlo con OpenSanctions. Se arma en el navegador con lo que ya está en la
 * página; no pide nada a ningún servidor.
 */
export default function ExportarFtm({
  titulo,
  entradas,
  enlaces,
  variant = "outline",
}: {
  titulo: string;
  entradas: EntradaFtm[];
  enlaces: EnlaceFtm[];
  variant?: "outline" | "secondary";
}) {
  const [hecho, setHecho] = useState(false);
  function descargar() {
    const texto = casoAFtm({ titulo, entradas, enlaces }, window.location.origin);
    const url = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = archivoFtm(titulo);
    a.click();
    // El navegador ya tomó el archivo: la dirección temporal se suelta después.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setHecho(true);
  }
  return (
    <>
      <Button type="button" variant={variant} onClick={descargar} disabled={entradas.length === 0}>
        <IconDownload className="h-4 w-4" />
        Descargar el caso (FollowTheMoney)
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {hecho ? `Se descargó ${archivoFtm(titulo)}.` : ""}
      </span>
    </>
  );
}
