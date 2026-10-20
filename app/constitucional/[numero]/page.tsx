import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { nodoDeRuta } from "@/lib/grafo";
import { FichaSentencia, cargarSentencia, metadatosSentencia } from "@/components/ficha-sentencia";

export const revalidate = 86400;

interface Props {
  params: Promise<{ numero: string }>;
}

const cargar = async (p: Props["params"]) => cargarSentencia(nodoDeRuta(`/constitucional/${(await p).numero}`));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadatosSentencia(await cargar(params));
}

/** Ficha de una sentencia del Tribunal Constitucional: `/constitucional/TC-0986-26` (`components/ficha-sentencia.tsx`). */
export default async function SentenciaTcPage({ params }: Props) {
  const x = await cargar(params);
  if (!x) notFound();
  return <FichaSentencia x={x} />;
}
