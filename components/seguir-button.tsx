"use client";

import { useEffect, useState } from "react";
import {
  estaSeguido,
  onSeguimientoCambio,
  toggleSeguido,
  type TipoSeguido,
} from "@/lib/seguimiento";
import { IconStar } from "./icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { enlace } from "@/lib/grafo";

/**
 * Seguir o dejar de seguir cualquier cosa de la plataforma: un proceso, un
 * proyecto de ley, un expediente del Senado, un proveedor, una institución,
 * una norma. `chip` va en la cabecera de una ficha y `bar` en la barra de
 * acciones del teléfono. El estado vive en `localStorage` (`lib/seguimiento.ts`)
 * y se sincroniza entre todas las instancias de la página.
 *
 * `huella` es el estado de la pieza **en el momento de seguirla**: con ella,
 * `/seguimiento` puede decir qué cambió desde entonces aunque el visitante no
 * haya vuelto a mirarla. Sin huella, la primera visita a `/seguimiento` la
 * toma como punto de partida.
 *
 * Seguido y sin seguir son **dos vestidos distintos del mismo botón** —relleno
 * contra filete—, no el mismo con un icono cambiado: en una lista de veinte, el
 * icono solo no se ve.
 */
type Objetivo =
  | { codigo: string; titulo?: string; huella?: string; tipo?: undefined }
  | { tipo: TipoSeguido; id: string; titulo: string; href: string; huella?: string };

export default function SeguirButton({
  variant = "chip",
  ...objetivo
}: Objetivo & { variant?: "chip" | "bar" }) {
  const tipo: TipoSeguido = objetivo.tipo ?? "proceso";
  const id = objetivo.tipo ? objetivo.id : objetivo.codigo;
  const titulo = objetivo.titulo || id;
  const href = objetivo.tipo
    ? objetivo.href
    : enlace.proceso(objetivo.codigo);
  const huella = objetivo.huella;

  const [seguido, setSeguido] = useState(false);
  // La estampa cae solo cuando el lector acaba de seguir, nunca al cargar una
  // pieza que ya seguía (docs/INFRAESTRUCTURA.md §11).
  const [recien, setRecien] = useState(false);
  useEffect(() => {
    const sync = () => setSeguido(estaSeguido(tipo, id));
    sync();
    return onSeguimientoCambio(sync);
  }, [tipo, id]);

  const comun = {
    onClick: () => {
      setRecien(!seguido);
      toggleSeguido({
        tipo,
        id,
        titulo,
        href,
        ...(huella !== undefined ? { huella } : {}),
      });
    },
    "aria-pressed": seguido,
    title: seguido
      ? "Quitar de tu seguimiento"
      : "Guardar en tu seguimiento: te dirá qué cambió cuando vuelvas",
  };

  if (variant === "bar") {
    return (
      <Button
        {...comun}
        variant={seguido ? "default" : "secondary"}
        className="h-12 flex-1"
      >
        <IconStar className={cn("h-5 w-5", recien && seguido && "estampa")} filled={seguido} />
        {seguido ? "Siguiendo" : "Seguir"}
      </Button>
    );
  }

  return (
    <Button
      {...comun}
      variant="outline"
      size="sm"
      /*
        Seguido: relleno tenue y filete de la firma. El `hover` tiene que
        seguir cambiando algo —si repitiera el relleno que ya tiene, el botón
        parecería interactivo y no respondería, que es el «control mudo» que
        el gate persigue—, así que sube un escalón de la escala.
      */
      className={
        seguido
          ? "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 hover:text-brand-800"
          : undefined
      }
    >
      <IconStar className={cn("h-4 w-4", recien && seguido && "estampa")} filled={seguido} />
      {seguido ? "Siguiendo" : "Seguir"}
    </Button>
  );
}
