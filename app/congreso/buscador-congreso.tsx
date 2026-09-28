"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CampoBusqueda } from "@/components/campo-busqueda";
import { hrefCongreso, type FiltrosCongreso } from "./filtros";

/**
 * Búsqueda de iniciativas.
 *
 * El SIL hace match de subcadena sobre la descripción y soporta frases de
 * varias palabras, así que se envía el texto tal cual, sin trocearlo. La
 * consulta vive en la URL para que cualquier búsqueda sea compartible, y
 * buscar conserva el tema, el tipo y el estado elegidos: el listado filtrado
 * del SIL también acepta el texto.
 */
export default function BuscadorCongreso({
  initial = "",
  filtros,
}: {
  initial?: string;
  filtros: FiltrosCongreso;
}) {
  const router = useRouter();
  const [valor, setValor] = useState(initial);
  const [pendiente, startTransition] = useTransition();

  const ir = (q: string) => {
    startTransition(() =>
      router.push(hrefCongreso({ ...filtros, q })),
    );
  };

  return (
    <CampoBusqueda
      valor={valor}
      onValor={setValor}
      onEnviar={ir}
      onLimpiar={() => {
        setValor("");
        ir("");
      }}
      etiqueta="Buscar iniciativas"
      /*
        El marcador se escribe corto porque en un teléfono el campo mide unos
        250 px y el resto se corta a media frase: el alcance de la búsqueda lo
        dice entero la línea de ayuda, que sí cabe.
      */
      placeholder="Por ejemplo: medio ambiente…"
      ayuda={
        filtros.tema
          ? "Busca la frase dentro de la descripción, solo entre las iniciativas del tema, tipo y estado elegidos. Con o sin tildes."
          : "Busca todas las palabras dentro de la descripción de la iniciativa, en cualquier orden y con o sin tildes."
      }
      pendiente={pendiente}
    />
  );
}
