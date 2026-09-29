import Link from "next/link";
import { IconArrowLeft } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { EstadoVacio } from "@/components/estado-vacio";

/**
 * Un número sin ficha. Sirve igual para un RNC que no está en el padrón que
 * para una cédula, que nunca se busca: la página no sabe cuál de los dos
 * llegó, y las dos respuestas se dicen en la misma frase.
 */
export default function NotFound() {
  return (
    <EstadoVacio
      como="h1"
      titulo="¿Y esta empresa?"
      accion={
        <Button asChild>
          <Link href="/empresas">
            <IconArrowLeft className="h-4 w-4" />
            Buscar otra empresa
          </Link>
        </Button>
      }
    >
      Ninguna persona jurídica del padrón de contribuyentes de la DGII tiene ese
      número. Aquí se publican solo las personas jurídicas, por su RNC de nueve
      cifras; las personas físicas, que el padrón identifica por su cédula, no se
      publican. Si la empresa es nueva, puede que aún no esté en el último corte.
    </EstadoVacio>
  );
}
