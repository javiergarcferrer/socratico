"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CampoBusqueda } from "@/components/campo-busqueda";
import { hrefFuncionarios, type FiltrosFuncionarios } from "./href";

/**
 * La búsqueda por nombre dentro de la instantánea ya leída, no una consulta
 * nueva a ninguna fuente: por eso la ayuda dice exactamente dónde busca.
 */
export default function BuscadorFuncionarios({
  filtros,
  total,
}: {
  filtros: FiltrosFuncionarios;
  total: number;
}) {
  const router = useRouter();
  const [valor, setValor] = useState(filtros.q);
  const [pendiente, startTransition] = useTransition();

  const ir = (q: string) => startTransition(() => router.push(hrefFuncionarios({ ...filtros, q })));

  return (
    <CampoBusqueda
      valor={valor}
      onValor={setValor}
      onEnviar={ir}
      onLimpiar={() => {
        setValor("");
        ir("");
      }}
      etiqueta="Buscar una persona con cargo público por su nombre"
      placeholder="Nombre o apellido…"
      ayuda={`Busca por nombre, sin importar tildes ni el orden de las palabras, entre las ${total.toLocaleString("es-DO")} personas de la instantánea.`}
      pendiente={pendiente}
    />
  );
}
