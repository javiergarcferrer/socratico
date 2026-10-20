import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { nodoDeRuta } from "@/lib/grafo";
import { FichaSentencia, cargarSentencia, metadatosSentencia } from "@/components/ficha-sentencia";

export const revalidate = 86400;

interface Props {
  params: Promise<{ ficha: string }>;
}

const cargar = async (p: Props["params"]) => cargarSentencia(nodoDeRuta(`/tse/${(await p).ficha}`));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadatosSentencia(await cargar(params));
}

/**
 * Ficha de una sentencia del Tribunal Superior Electoral, por su ficha en el
 * visor del tribunal (`/tse/QTNYYm5E…`): su número se repite y la ficha no
 * (`components/ficha-sentencia.tsx`).
 */
export default async function SentenciaTsePage({ params }: Props) {
  const x = await cargar(params);
  if (!x) notFound();
  return <FichaSentencia x={x} />;
}
