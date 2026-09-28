import type { Metadata } from "next";
import MiEspacio from "@/components/espacios/mi-espacio";

export const metadata: Metadata = {
  title: "Tu espacio",
  description: "Lo que sigues, tus investigaciones y lo que guardaste.",
  robots: { index: false, follow: false },
};

/** El espacio del lector (docs/PLAN-ESPACIOS.md): privado, se pinta en el navegador. */
export default function EspacioPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <MiEspacio />
    </div>
  );
}
