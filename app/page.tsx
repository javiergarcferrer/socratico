import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatFecha } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import type { Metadata } from "next";
import { Banco, type Ejemplo, type PreguntaEjemplo } from "@/components/explorador/banco";
import { EsqueletoFilas } from "@/components/esqueleto";
import { rutaDeNodo } from "@/lib/grafo";
import { pulsoDelGrafo } from "@/lib/explorar-nodo";
import { TABLAS_GRAFO } from "@/lib/grafo-tablas";

export const revalidate = 86400;

export const metadata: Metadata = {
  description:
    "Busca a la vez en personas con cargo, instituciones, empresas, proveedores, compras, obras, normas, iniciativas, documentos y datos del Estado dominicano, y recorre cada registro por sus relaciones, con la fuente y la fecha de cada dato. Herramienta independiente y no oficial.",
  alternates: { canonical: "/" },
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
/**
 * Lo que la portada pinta en el servidor mientras el banco carga —y lo único
 * que ve quien no tiene JavaScript—: la pregunta, una caja que busca en toda
 * la plataforma con un formulario GET a `/buscar`, lo que hay en el grafo y
 * la puerta a lo de hoy. El banco la reemplaza en cuanto hidrata.
 */
function Antesala({ pulso }: { pulso: Awaited<ReturnType<typeof pulsoDelGrafo>> }) {
  return (
    <div className="min-h-[calc(100dvh-var(--alto-cabecera))] px-3 py-3 lg:px-4">
      <h1 className="font-sans text-sm font-semibold tracking-wide text-ink">¿Qué buscas en el Estado?</h1>
      <form action="/buscar" method="get" role="search" className="mt-2.5 flex max-w-3xl gap-2">
        <label htmlFor="buscar-antesala" className="sr-only">
          Buscar en toda la plataforma
        </label>
        <Input id="buscar-antesala" name="q" type="search" placeholder="Una persona, una institución, un RNC, «Ley 87-01», un tema" autoComplete="off" />
        <Button type="submit">Buscar</Button>
      </form>
      {pulso && (
        <p className="mt-3 font-mono text-xs text-ink-soft">
          {formatInt(pulso.nodos)} nodos · {formatInt(pulso.triples)} triples
          {pulso.compilado ? ` · grafo compilado el ${formatFecha(pulso.compilado)}` : ""}
        </p>
      )}
      <p className="mt-2 text-sm text-ink-soft">
        <Link href="/hoy" className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-0">
          Lo que pasa hoy en el Estado
        </Link>
      </p>
      <div role="status" aria-busy="true" className="mt-4">
        <span className="sr-only">Abriendo el banco de trabajo…</span>
        <EsqueletoFilas n={8} />
      </div>
    </div>
  );
}

export default async function Inicio() {
  const pulso = await pulsoDelGrafo().catch(() => null);
  // La fecha de corte de cada tabla, para las cifras del explorador de objetos.
  const cortes = Object.fromEntries(Object.entries(TABLAS_GRAFO).map(([t, x]) => [t, x.corte ?? null]));
  return (
    /*
      La mesa ocupa el ancho entero, fuera de la columna de lectura del resto
      del sitio, y se pega a la cabecera: es una aplicación de análisis, no una
      página. `mesa-completa` hace que el `main` del layout suelte su columna
      y su relleno (`app/globals.css`); dentro, el tema Blueprint.
    */
    <div className="mesa-completa tema-blueprint border-b border-hairline">
      <Suspense
        fallback={<Antesala pulso={pulso} />}
      >
        <Banco ejemplos={EJEMPLOS} preguntas={PREGUNTAS} pulso={pulso} cortes={cortes} />
      </Suspense>
    </div>
  );
}
