/**
 * El atajo del buscador de toda la plataforma (`/buscar`): **reconocer la
 * forma** de lo tecleado y llevar directo. Un RNC es una empresa y una
 * cédula, un proveedor; «Ley 47-20» es una norma; `MOPC-CCC-LPN-2025-0010` es un
 * proceso; unas siglas exactas son una institución.
 *
 * Lo que no tiene forma lo ordena el índice de `lib/busqueda.ts` (por palabra
 * y por tema, sobre las instantáneas); lo que exige barrer una API entera
 * (licitaciones, Senado) se ofrece como enlace con su alcance, no se finge.
 */

/*
  Módulo ligero a propósito: lo corre el middleware (`middleware.ts`) para que
  el atajo sea una redirección HTTP de verdad —un 307 con `Location`— y no la
  del flujo que ya empezó a enviar `app/loading.tsx`, que curl, los buscadores
  y el formulario sin JavaScript no seguían. Por eso lee el cruce de
  instituciones del JSON y no de `lib/instituciones.ts`, que arrastra la capa
  de la DGCP y la caché de Next.
*/
import datos from "@/public/data/instituciones.json";
import { enlace } from "@/lib/grafo";

const INSTITUCIONES = (datos as { instituciones: { id: number; nombre: string; acronimo: string }[] })
  .instituciones;

const normalize = (s: string) => (s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const hrefInstitucion = (i: (typeof INSTITUCIONES)[number]) => enlace.institucion(i.id, i.acronimo || i.nombre);

const RUTA_NORMA: Record<string, string> = {
  ley: "ley",
  decreto: "decreto",
  reglamento: "reglamento",
  resolucion: "resolucion",
};

/** Si lo tecleado tiene una forma inequívoca, la ruta a la que lleva. */
export function rutaDirecta(consulta: string): string | null {
  const q = consulta.trim();
  const digitos = q.replace(/[\s-]/g, "");

  // Un RNC de nueve cifras es la ficha de la empresa en el padrón de la DGII,
  // que lleva a su registro de proveedor si lo tiene; una cédula (11) solo se
  // busca entre los proveedores del Estado: las personas físicas no tienen ficha.
  if (/^\d{9}$/.test(digitos)) return enlace.empresa(digitos);
  if (/^\d{11}$/.test(digitos)) return `/proveedores?q=${digitos}`;

  // «Ley 47-20», «decreto núm. 606-26», «Resolución No. 12-2025», y también
  // «ley 47 20», como se teclea en el teléfono sin buscar el guion.
  const cita = /^(ley|decreto|reglamento|resoluci[oó]n)\s*(?:n[uú]m(?:ero)?\.?|no\.?|n\.?\s*[oº°]\.?)?\s*(\d{1,4})\s*[-\s]\s*(\d{2,4})$/i.exec(
    q,
  );
  if (cita) return enlace.norma(RUTA_NORMA[normalize(cita[1])], `${cita[2]}-${cita[3]}`);

  // Código de proceso de la DGCP: SIGLAS-XXX-MOD-AAAA-NNNN.
  if (/^[A-Z0-9]{2,15}(-[A-Z0-9]{1,10}){2,4}-\d{4}-\d{3,5}$/i.test(q)) {
    return enlace.proceso(q.toUpperCase());
  }

  // Siglas exactas de una sola institución, solo si son siglas de verdad.
  // Varias unidades de compra usan una palabra como «acrónimo» —TRABAJO,
  // CULTURA, PASAPORTES—: quien teclea «trabajo» busca leyes o plazas, no
  // necesariamente el ministerio. Si las «siglas» son una palabra de su propio
  // nombre, no se salta: la institución sale primera en los resultados.
  const siglas = INSTITUCIONES.filter(
    (i) => i.acronimo && normalize(i.acronimo) === normalize(q),
  );
  const esPalabraDelNombre = (i: (typeof siglas)[number]) =>
    normalize(i.nombre).split(/[^a-z0-9]+/).includes(normalize(i.acronimo));
  if (siglas.length === 1 && q.length >= 2 && !esPalabraDelNombre(siglas[0])) {
    return hrefInstitucion(siglas[0]);
  }

  return null;
}
