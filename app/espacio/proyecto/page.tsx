import type { Metadata } from "next";
import MesaProyecto from "@/components/espacios/mesa-proyecto";

export const metadata: Metadata = {
  title: "Proyecto",
  description: "La mesa de un proyecto: sus registros, sus enlaces, su tablero y su texto.",
  robots: { index: false, follow: false },
};

/**
 * La mesa de una investigación. El id va en `?id=` y no en la ruta: es una
 * página privada que se pinta en el navegador, y así ningún id de proyecto
 * queda en HTML cacheado ni en el mapa del sitio (docs/INFRAESTRUCTURA.md §10).
 */
export default async function ProyectoPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const valido = id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  return (
    <div className="mx-auto max-w-6xl">
      <MesaProyecto id={valido} />
    </div>
  );
}
