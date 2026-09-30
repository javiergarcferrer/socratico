"use client";

import { parseAsString, useQueryStates } from "nuqs";
import { useEffect, useState, useTransition } from "react";
import { CampoBusqueda } from "@/components/campo-busqueda";

/**
 * Un campo de búsqueda cuyo estado es `?q=` en la página actual.
 *
 * Es el patrón de `app/proveedores/buscador.tsx` sin su ruta cableada: la
 * búsqueda se comparte, se marca y vuelve con «atrás», y los demás parámetros
 * de la URL (un año, un tipo) se conservan. Lo usan las superficies que filtran
 * en el servidor —instituciones, normativa, finanzas—.
 *
 * La URL la escribe `nuqs`: cada búsqueda enviada **apila** una entrada en el
 * historial (`history: "push"`, para que «atrás» vuelva a la anterior) y va al
 * servidor (`shallow: false`), porque es el servidor el que filtra. La
 * transición es la nuestra, y por eso el campo sabe decir que está pendiente
 * mientras llega la página nueva.
 */
export function BuscadorUrl({
  etiqueta,
  placeholder,
  ayuda,
  error,
}: {
  etiqueta: string;
  placeholder?: string;
  ayuda?: string;
  /**
   * Por qué el `?q=` actual no vale, dicho por el servidor que lo validó
   * (`null` si vale). Se calla en cuanto el lector cambia lo escrito.
   */
  error?: string | null;
}) {
  const [pendiente, iniciar] = useTransition();
  const [url, setUrl] = useQueryStates(
    // Las superficies nombran su página de tres maneras; se limpian las tres.
    { q: parseAsString, pagina: parseAsString, p: parseAsString, page: parseAsString },
    { history: "push", shallow: false, startTransition: iniciar },
  );
  const inicial = url.q ?? "";
  const [valor, setValor] = useState(inicial);

  useEffect(() => setValor(inicial), [inicial]);

  const ir = (texto: string) => {
    const q = texto.trim();
    // Una búsqueda nueva es una lista nueva: empieza en su primera página, no
    // en la página por la que iba la anterior.
    void setUrl({ q: q || null, pagina: null, p: null, page: null });
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
      etiqueta={etiqueta}
      placeholder={placeholder}
      ayuda={ayuda}
      pendiente={pendiente}
      error={error === undefined ? undefined : valor.trim() === inicial.trim() ? error : null}
    />
  );
}
