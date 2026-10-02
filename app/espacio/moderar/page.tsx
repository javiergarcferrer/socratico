import type { Metadata } from "next";
import Moderar from "@/components/espacios/moderar";

export const metadata: Metadata = {
  title: "Moderación",
  description: "La cola de moderación de la conversación.",
  robots: { index: false, follow: false },
};

/** La cola de moderación (docs/INFRAESTRUCTURA.md §10): privada, se pinta en el navegador. */
export default function ModerarPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Moderar />
    </div>
  );
}
