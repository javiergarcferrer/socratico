"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CampoBusqueda } from "@/components/campo-busqueda";

/**
 * El campo de búsqueda de proveedores.
 *
 * El estado vive en la URL (`?q=`), como en el resto de la plataforma: una
 * búsqueda se comparte, se marca y se vuelve a ella con el botón atrás. El
 * componente solo traduce lo que se teclea en una navegación, y obedece a la
 * URL cuando esta cambia por fuera.
 *
 * La ayuda bajo el campo no es decorativa: los dos caminos de búsqueda tienen
 * alcances muy distintos —el número busca en el registro entero, el nombre
 * solo entre quienes ganaron algo hace poco— y quien va a teclear necesita
 * saberlo antes, no después de ver «sin resultados». La primitiva
 * `CampoBusqueda` le reserva el sitio.
 */
export default function BuscadorProveedores({
  inicial,
  ayuda,
}: {
  inicial: string;
  ayuda: string;
}) {
  const router = useRouter();
  const [valor, setValor] = useState(inicial);
  const [pendiente, iniciar] = useTransition();

  useEffect(() => setValor(inicial), [inicial]);

  const ir = (texto: string) => {
    const q = texto.trim();
    iniciar(() =>
      router.push(q ? `/proveedores?q=${encodeURIComponent(q)}` : "/proveedores"),
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
      etiqueta="Buscar un proveedor del Estado"
      placeholder="Nombre, RNC, cédula o número de RPE…"
      ayuda={ayuda}
      pendiente={pendiente}
    />
  );
}
