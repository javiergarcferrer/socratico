import Link from "next/link";

import { Card, CardTitle } from "@/components/ui/card";
import { IconArrowRight } from "@/components/icons";

/**
 * Las guías de la plataforma, una vez. Cada guía cierra con las demás para
 * que quien llegó a entender cómo nace una ley pueda seguir con el
 * presupuesto sin volver a buscar. Una guía nueva se añade aquí y aparece al
 * pie de todas.
 */
export const GUIAS = [
  {
    href: "/guia",
    titulo: "¿Cómo se le oferta al Estado?",
    descriptor: "Registro de proveedor, modalidades y documentos de una compra pública.",
  },
  {
    href: "/congreso/guia",
    titulo: "¿Cómo nace una ley?",
    descriptor: "Del depósito en una cámara a la Gaceta Oficial, y por qué una pieza perime.",
  },
  {
    href: "/finanzas/guia",
    titulo: "¿Cómo se lee el presupuesto?",
    descriptor: "Vigente, comprometido, devengado y pagado; capítulos y deuda administrativa.",
  },
  {
    href: "/finanzas/guia/deuda",
    titulo: "¿Qué es la deuda pública?",
    descriptor: "Qué cubre la cifra del sector público no financiero, y qué es interna y externa.",
  },
  {
    href: "/dinero/guia",
    titulo: "¿Cómo funciona el dinero en el país?",
    descriptor: "El Banco Central y su tasa, lo que cobran y pagan los bancos, y quién compra los bonos del Estado.",
  },
] as const;

export function OtrasGuias({ actual }: { actual: string }) {
  const otras = GUIAS.filter((g) => g.href !== actual);
  return (
    <Card as="section" className="p-5 sm:p-6">
      <CardTitle>Otras guías</CardTitle>
      <ul className="mt-3 divide-y divide-hairline">
        {otras.map((g) => (
          <li key={g.href} className="relative flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <Link
                href={g.href}
                className="font-medium text-ink estira hover:text-brand-700"
              >
                {g.titulo}
              </Link>
              <p className="mt-0.5 text-xs text-ink-soft">{g.descriptor}</p>
            </div>
            <IconArrowRight className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
          </li>
        ))}
      </ul>
    </Card>
  );
}
