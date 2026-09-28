"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * El tablero se carga aparte y solo en el navegador: React Flow mide el
 * lienzo y no tiene nada que pintar en el servidor, y quien no abre la
 * pestaña del tablero no lo descarga. La silueta mide lo mismo que el lienzo.
 */
const TableroDiferido = dynamic(() => import("./tablero"), {
  ssr: false,
  loading: () => <Skeleton className="h-[26rem] w-full sm:h-[34rem]" />,
});

export default TableroDiferido;
export type { LazoTablero, PropsTablero, Seleccion, TarjetaTablero } from "./tablero";
