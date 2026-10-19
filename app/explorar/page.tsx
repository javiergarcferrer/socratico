import { Suspense } from "react";
import type { Metadata } from "next";
import { Banco, type Ejemplo, type PreguntaEjemplo } from "@/components/explorador/banco";
import { EsqueletoFilas } from "@/components/esqueleto";
import { rutaDeNodo } from "@/lib/grafo";
import { pulsoDelGrafo } from "@/lib/explorar-nodo";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Explorar el grafo del Estado",
  description:
    "Busca a la vez en personas con cargo, instituciones, empresas, proveedores, compras, obras, normas, iniciativas, documentos y datos del Estado dominicano, y recorre cada registro por sus relaciones, con la fuente y la fecha de cada dato.",
  alternates: { canonical: "/explorar" },
};

/** Un punto de partida por cada cosa que se viene a buscar. */
const PREGUNTAS: PreguntaEjemplo[] = [
  { para: "Quien busca oportunidades de venderle al Estado", texto: "¿Qué licitaciones abiertas tiene el MINERD?", modo: "preguntar" },
  { para: "Quien vende al Estado y mira a la competencia", texto: "¿A quién le ha contratado más el INAPA?", modo: "preguntar" },
  { para: "Quien sigue a una institución", texto: "Ministerio de Hacienda", modo: "buscar" },
  { para: "Quien investiga a una persona con cargo", texto: "Abinader", modo: "buscar" },
  { para: "Quien estudia una ley y lo que la cambia", texto: "Ley 87-01", modo: "buscar" },
  { para: "Quien busca por tema, no por nombre", texto: "agua potable", modo: "buscar" },
];

/** Los nodos por donde empezar a recorrer: uno de cada clase, con aristas que enseñan algo. */
const EJEMPLOS: Ejemplo[] = [
  { ruta: rutaDeNodo({ tipo: "institucion", id: "4" }), nombre: "Ministerio de Hacienda", porque: "Quién la dirige, los cargos de hoy y a quién le contrata" },
  { ruta: rutaDeNodo({ tipo: "funcionario", id: "luis-rodolfo-abinader-corona" }), nombre: "Luis Rodolfo Abinader Corona", porque: "Su cargo, los decretos que firmó y su identificador en Wikidata" },
  { ruta: rutaDeNodo({ tipo: "obra", id: "3731" }), nombre: "Presa de Monte Grande", porque: "Quién la ejecuta, dónde, sus procesos de compra y a quién se le contrató" },
  { ruta: rutaDeNodo({ tipo: "entidad-financiera", id: "banreservas" }), nombre: "Banreservas", porque: "Quién lo supervisa y su misma ficha como empresa y como institución" },
  { ruta: rutaDeNodo({ tipo: "ley", id: "87-01" }), nombre: "Ley 87-01", porque: "Los proyectos que proponen cambiarla y las normas que la nombran" },
  { ruta: rutaDeNodo({ tipo: "provincia", id: "santiago" }), nombre: "Santiago", porque: "Su gobernación, sus alcaldías y las obras que se ejecutan allí" },
];

/**
 * El banco de trabajo del grafo (docs/INFRAESTRUCTURA.md §3.3, §7.7): toda la
 * plataforma en una mesa de análisis, sin separarla por vertical, con el tema
 * Blueprint. El servidor solo cuenta el compilado (`pulsoDelGrafo`: nodos,
 * triples, clases, fuentes con su corte) para el tablero y la barra de
 * estado; el banco (`components/explorador/`) vive en el navegador y lee las
 * rutas de `app/api/explorar/`.
 */
export default async function ExplorarPage() {
  const pulso = await pulsoDelGrafo().catch(() => null);
  return (
    /*
      La mesa ocupa el ancho entero de la ventana, fuera de la columna de
      lectura del resto del sitio, y se pega a la cabecera: es una aplicación
      de análisis, no una página. Dentro, el tema Blueprint (`app/globals.css`).
    */
    <div className="tema-blueprint -mb-6 -mt-6 mx-[calc(50%-50vw)] border-b border-hairline">
      <Suspense
        fallback={
          <div role="status" aria-busy="true" className="p-4">
            <span className="sr-only">Abriendo el banco de trabajo…</span>
            <EsqueletoFilas n={10} />
          </div>
        }
      >
        <Banco ejemplos={EJEMPLOS} preguntas={PREGUNTAS} pulso={pulso} />
      </Suspense>
    </div>
  );
}
