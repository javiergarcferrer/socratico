import { Cargando, EsqueletoFilas, EsqueletoLineas } from "@/components/esqueleto";

/** Mientras se busca el camino: la cabecera (pregunta de dos líneas y el conteo) y los pasos. */
export default function Loading() {
  return (
    <Cargando className="mx-auto max-w-3xl">
      <EsqueletoLineas n={1} className="w-24" />
      <EsqueletoLineas n={3} className="mt-4" />
      <EsqueletoFilas n={5} className="mt-6" />
    </Cargando>
  );
}
