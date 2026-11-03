"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EstadoVacio } from "@/components/estado-vacio";
import { Esqueleto, EsqueletoFilas } from "@/components/esqueleto";
import { Paginador } from "@/components/paginador";
import Plegable from "@/components/plegable";
import { claves, consultarSparql, ErrorSparql, leerTerminosSparql, urlSparql, type CeldaSparql, type RespuestaSparql } from "@/lib/consultas";
import { nodoDeRuta } from "@/lib/grafo";
import { compactar } from "@/lib/rdf";
import { SITIO } from "@/lib/sitio";
import { formatFecha } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { GRAFO_FORMAS, GRAFO_ONTOLOGIA, VOLCADO_SPARQL } from "@/lib/sparql-meta";
import { clicSimple } from "@/components/explorador/clic";
import type { PasoRastro } from "@/components/explorador/inspector";
import EJEMPLOS from "./ejemplos.json";

/**
 * La sección SPARQL del banco de trabajo (`/?seccion=sparql`): el editor, las
 * doce consultas de ejemplo con su resultado verificado y la tabla de lo que
 * responde `/sparql` (docs/INFRAESTRUCTURA.md §7.12). Cada IRI que es un nodo
 * de la plataforma abre su ficha en el inspector, como en Objetos.
 *
 * «Abrir en el lienzo» siembra en el lienzo del banco (`components/grafo/`)
 * los nodos del resultado: el banco pasa `onLienzo` desde `lg`, donde se
 * dibuja; sin él, el botón no se pinta.
 */

export interface EjemploSparql {
  id: string;
  pregunta: string;
  consulta: string;
  verificado: { fecha: string; filas?: number; triples?: number; primera?: Record<string, string> };
}

const LISTA = EJEMPLOS as EjemploSparql[];
const POR_PAGINA = 100;

const Editor = dynamic(() => import("./editor"), {
  ssr: false,
  loading: () => <Esqueleto className="h-48 w-full" />,
});

/** El parámetro de la URL con el ejemplo abierto: el banco y el panel lo comparten sin pasarse estado. */
export function useEjemploSparql() {
  return useQueryState("ejemplo", parseAsString.withOptions({ history: "push" }));
}

/** Las consultas de ejemplo, cada una una pregunta: en el panel izquierdo desde `lg`, arriba de la consulta por debajo. */
export function EjemplosSparql({ vertical = false }: { vertical?: boolean }) {
  const [id, setId] = useEjemploSparql();
  const elegido = LISTA.find((e) => e.id === id)?.id ?? LISTA[0].id;
  const item = "min-h-11 w-full justify-start whitespace-normal text-left sm:min-h-10";
  return (
    <ToggleGroup
      type="single"
      value={elegido}
      onValueChange={(v) => v && void setId(v === LISTA[0].id ? null : v)}
      aria-label="Consultas de ejemplo"
      className={vertical ? "flex flex-col items-stretch border-0 bg-transparent p-0 shadow-none" : "flex flex-col items-stretch"}
    >
      {LISTA.map((e) => (
        <ToggleGroupItem key={e.id} value={e.id} className={item}>
          {e.pregunta}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function Sparql({
  nodo,
  hrefNodo,
  onAbrir,
  onLienzo,
  topeLienzo = 150,
}: {
  nodo: string | null;
  hrefNodo: (ruta: string) => string;
  onAbrir: (p: PasoRastro) => void;
  /** El gancho del lienzo: recibe las rutas de los nodos del resultado. */
  onLienzo?: (rutas: string[]) => void;
  /** Cuántos nodos recibe el lienzo de una vez. */
  topeLienzo?: number;
}) {
  const [id] = useEjemploSparql();
  const ejemplo = LISTA.find((e) => e.id === id) ?? LISTA[0];
  const [texto, setTexto] = useState(ejemplo.consulta);
  // Un ejemplo elegido se carga y se corre: su resultado está verificado y la CDN lo guarda.
  const [enviada, setEnviada] = useState<string>(ejemplo.consulta);
  const [pagina, setPagina] = useState(1);
  useEffect(() => {
    setTexto(ejemplo.consulta);
    setEnviada(ejemplo.consulta);
    setPagina(1);
  }, [ejemplo.consulta]);

  const terminos = useQuery({ queryKey: claves.terminosSparql, queryFn: ({ signal }) => leerTerminosSparql(signal), staleTime: Infinity });
  const consulta = useQuery({
    queryKey: claves.sparql(enviada),
    queryFn: ({ signal }) => consultarSparql(enviada, signal),
    staleTime: Infinity,
    retry: (n, err) => err instanceof ErrorSparql && err.estado === 503 && n < 2,
    retryDelay: 5_000,
  });
  const correr = () => {
    setPagina(1);
    if (texto.trim() === enviada.trim()) void consulta.refetch();
    else setEnviada(texto);
  };
  const esEjemplo = enviada === ejemplo.consulta;
  const tabla = consulta.data ? comoTabla(consulta.data) : null;
  const rutas = tabla ? rutasDe(tabla.filas) : [];

  return (
    <div className="space-y-3">
      <Card as="section" aria-labelledby="sparql-titulo">
        <div className="border-b border-hairline px-4 py-3">
          <CardTitle id="sparql-titulo">Consulta SPARQL</CardTitle>
          <p id="sparql-alcance" className="mt-0.5 text-xs leading-relaxed text-ink-soft">
            SPARQL 1.1 de solo lectura sobre el grafo sin personas naturales: {formatInt(VOLCADO_SPARQL.cuadruplos)} cuádruplos del
            volcado del {formatFecha(VOLCADO_SPARQL.generado)}, cada triple en el grafo con nombre de su fuente y su corte; la
            ontología en <span className="font-mono">&lt;{GRAFO_ONTOLOGIA}&gt;</span> y sus formas SHACL en{" "}
            <span className="font-mono">&lt;{GRAFO_FORMAS}&gt;</span>. Sin personas, normas, Congreso, sentencias ni documentos: esos
            se abren uno a uno. Los prefijos de la ontología ya están declarados. Hasta 10 000 filas y 10 s por consulta.
          </p>
        </div>

        {/* En el teléfono no hay panel izquierdo: las preguntas van aquí, plegadas en su lista. */}
        <div className="border-b border-hairline px-4 py-3 lg:hidden">
          <Plegable etiqueta={`Ver las ${LISTA.length} consultas de ejemplo`} etiquetaCerrar="Plegar los ejemplos">
            <div className="mt-2">
              <EjemplosSparql />
            </div>
          </Plegable>
        </div>

        <div className="space-y-2 px-4 py-3">
          <Label htmlFor="sparql-consulta" className="text-sm font-semibold text-ink">
            {esEjemplo ? ejemplo.pregunta : "Tu consulta"}
          </Label>
          <Editor
            id="sparql-consulta"
            describidoPor="sparql-alcance sparql-atajo"
            valor={texto}
            onCambio={setTexto}
            onCorrer={correr}
            terminos={terminos.data}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={correr} disabled={!texto.trim() || consulta.isFetching}>
              {consulta.isFetching ? "Consultando…" : "Correr la consulta"}
            </Button>
            {texto !== ejemplo.consulta && (
              <Button variant="secondary" onClick={() => setTexto(ejemplo.consulta)}>
                Volver al ejemplo
              </Button>
            )}
            <p id="sparql-atajo" className="text-xs text-ink-soft">
              ⌘↵ o Ctrl+↵ corre la consulta; Ctrl+Espacio sugiere clases y relaciones.
            </p>
          </div>
        </div>
      </Card>

      <Card as="section" aria-labelledby="sparql-resultado" className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-hairline px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0" aria-live="polite">
            <CardTitle id="sparql-resultado">Resultado</CardTitle>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
              {consulta.isFetching
                ? "El motor está leyendo. La primera consulta de una instancia carga el grafo entero: unos segundos más."
                : consulta.data
                  ? resumen(consulta.data)
                  : consulta.isError
                    ? "La consulta no dio resultado."
                    : ""}
              {consulta.data && esEjemplo && ` Resultado verificado el ${formatFecha(ejemplo.verificado.fecha)}.`}
            </p>
          </div>
          {consulta.data && (
            <div className="flex flex-wrap gap-2">
              {onLienzo && rutas.length > 0 && (
                <Button variant="secondary" onClick={() => onLienzo(rutas)}>
                  {rutas.length > topeLienzo
                    ? `Abrir en el lienzo los primeros ${formatInt(topeLienzo)} de ${formatInt(rutas.length)} nodos`
                    : `Abrir los ${formatInt(rutas.length)} nodos en el lienzo`}
                </Button>
              )}
              {consulta.data.tipo === "triples" ? (
                <Button variant="secondary" asChild>
                  <a href={urlSparql(enviada, "ttl")} download="consulta.ttl">
                    Descargar Turtle
                  </a>
                </Button>
              ) : (
                <>
                  <Button variant="secondary" asChild>
                    <a href={urlSparql(enviada, "csv")} download="consulta.csv">
                      Descargar CSV
                    </a>
                  </Button>
                  <Button variant="secondary" asChild>
                    <a href={urlSparql(enviada, "json")} download="consulta.json">
                      JSON
                    </a>
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {consulta.isError ? (
          consulta.error instanceof ErrorSparql && consulta.error.estado === 400 ? (
            <div className="p-4">
              <Alert variant="aviso">
                <AlertTitle>La consulta no corrió</AlertTitle>
                <AlertDescription>{consulta.error.message}</AlertDescription>
              </Alert>
            </div>
          ) : (
            <EstadoVacio
              variante="caida"
              titulo={consulta.error instanceof ErrorSparql && consulta.error.estado === 503 ? "El motor está ocupado con otras consultas." : "El motor SPARQL no contestó."}
              accion={
                <Button variant="secondary" onClick={() => void consulta.refetch()}>
                  Intentar de nuevo
                </Button>
              }
              className="m-4"
            >
              La consulta sigue en el editor. El grafo entero también{" "}
              <a href="/data/grafo/grafo.trig.gz" download className="underline">
                se descarga en TriG
              </a>{" "}
              para consultarlo en un motor propio.
            </EstadoVacio>
          )
        ) : !consulta.data ? (
          <div role="status" aria-busy="true" className="p-4">
            <span className="sr-only">Consultando el grafo…</span>
            <EsqueletoFilas n={8} />
          </div>
        ) : consulta.data.tipo === "booleano" ? (
          <p className="px-4 py-6 text-2xl font-bold text-ink">{consulta.data.valor ? "Sí" : "No"}</p>
        ) : tabla && tabla.filas.length === 0 ? (
          <EstadoVacio titulo="Ninguna fila cumple la consulta." className="m-4">
            El grafo no tiene personas naturales, normas ni el Congreso: si la pregunta es de ellos, se abren uno a uno en el banco.
          </EstadoVacio>
        ) : (
          tabla && (
            <TablaResultado
              tabla={tabla}
              pagina={pagina}
              onPagina={setPagina}
              nodo={nodo}
              hrefNodo={hrefNodo}
              onAbrir={onAbrir}
            />
          )
        )}
        <p className="border-t border-hairline px-4 py-2 text-xs text-ink-soft">
          Fuente: el volcado del grafo sin personas naturales del {formatFecha(VOLCADO_SPARQL.generado)} (
          <Link href="/fuentes" className="underline">
            fuentes y cortes
          </Link>
          ). Herramienta independiente y no oficial.
        </p>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------- la tabla */

interface Tabla {
  variables: string[];
  filas: Record<string, CeldaSparql>[];
}

function resumen(r: RespuestaSparql): string {
  if (r.tipo === "booleano") return `Respuesta de sí o no, en ${formatInt(r.ms)} ms.`;
  const n = r.tipo === "filas" ? r.filas.length : comoTabla(r).filas.length;
  const que = r.tipo === "filas" ? (n === 1 ? "fila" : "filas") : n === 1 ? "triple" : "triples";
  const corte = r.truncada ? " Hay más: el punto da hasta 10 000; agrega, filtra o pon un LIMIT." : "";
  return `${formatInt(n)} ${que} en ${formatInt(r.ms)} ms.${corte}`;
}

/** Un término de N-Triples en celda: `<iri>`, `_:b` o un literal con su idioma o su tipo. */
function terminoNt(x: string): CeldaSparql {
  if (x.startsWith("<")) return { type: "uri", value: x.slice(1, -1) };
  if (x.startsWith("_:")) return { type: "bnode", value: x.slice(2) };
  const m = /^"((?:[^"\\]|\\.)*)"(?:@([\w-]+)|\^\^<([^>]+)>)?$/.exec(x);
  if (!m) return { type: "literal", value: x };
  const valor = m[1].replace(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/g, (_, e: string) =>
    e.length > 1 ? String.fromCodePoint(parseInt(e.slice(1), 16)) : ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[e] ?? e,
  );
  return { type: "literal", value: valor, ...(m[2] ? { "xml:lang": m[2] } : {}), ...(m[3] ? { datatype: m[3] } : {}) };
}

function comoTabla(r: RespuestaSparql): Tabla {
  if (r.tipo === "filas") return { variables: r.variables, filas: r.filas };
  if (r.tipo === "booleano") return { variables: [], filas: [] };
  const filas: Record<string, CeldaSparql>[] = [];
  for (const linea of r.ntriples.split("\n")) {
    const m = /^(<[^>]*>|_:\S+)\s+(<[^>]*>)\s+(.+?)\s*\.\s*$/.exec(linea.trim());
    if (m) filas.push({ sujeto: terminoNt(m[1]), predicado: terminoNt(m[2]), objeto: terminoNt(m[3]) });
  }
  return { variables: ["sujeto", "predicado", "objeto"], filas };
}

/** La ruta de la ficha de un IRI de la plataforma, si es un nodo que el banco abre. */
function rutaDe(c: CeldaSparql | undefined): string | null {
  if (c?.type !== "uri" || !c.value.startsWith(`${SITIO}/`)) return null;
  const ruta = c.value.slice(SITIO.length).split("#")[0];
  return nodoDeRuta(ruta) ? ruta : null;
}

function rutasDe(filas: Record<string, CeldaSparql>[]): string[] {
  const vistas = new Set<string>();
  for (const f of filas) for (const c of Object.values(f)) {
    const r = rutaDe(c);
    if (r) vistas.add(r);
  }
  return [...vistas];
}

const NUMERICOS = new Set(["integer", "decimal", "double", "float", "long", "int"].map((t) => `http://www.w3.org/2001/XMLSchema#${t}`));
const decimal = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 2 });

function TablaResultado({
  tabla,
  pagina,
  onPagina,
  nodo,
  hrefNodo,
  onAbrir,
}: {
  tabla: Tabla;
  pagina: number;
  onPagina: (p: number) => void;
  nodo: string | null;
  hrefNodo: (ruta: string) => string;
  onAbrir: (p: PasoRastro) => void;
}) {
  const paginas = Math.max(1, Math.ceil(tabla.filas.length / POR_PAGINA));
  const desde = (Math.min(pagina, paginas) - 1) * POR_PAGINA;
  const filas = tabla.filas.slice(desde, desde + POR_PAGINA);
  // La etiqueta de la fila, para nombrar el nodo que abre: el primer literal de la fila.
  const tituloDeFila = (f: Record<string, CeldaSparql>) => Object.values(f).find((c) => c.type === "literal")?.value;

  const celda = (c: CeldaSparql | undefined, f: Record<string, CeldaSparql>) => {
    if (!c) return <span className="text-ink-soft">—</span>;
    if (c.type === "bnode") return <span className="font-mono text-xs">_:{c.value}</span>;
    if (c.type === "literal") {
      if (c.datatype && NUMERICOS.has(c.datatype) && Number.isFinite(Number(c.value))) {
        return <span className="font-mono tabular-nums">{decimal.format(Number(c.value))}</span>;
      }
      return <span className="break-words">{c.value}</span>;
    }
    const ruta = rutaDe(c);
    const corto = compactar(c.value) ?? (c.value.startsWith(`${SITIO}/`) ? c.value.slice(SITIO.length) : c.value);
    if (!ruta) return <span className="break-all font-mono text-xs" title={c.value}>{corto}</span>;
    const titulo = tituloDeFila(f) ?? ruta;
    return (
      <Link
        href={hrefNodo(ruta)}
        aria-current={ruta === nodo ? "true" : undefined}
        title={c.value}
        className="break-all font-mono text-xs text-brand-500 underline-offset-2 hover:underline"
        onClick={(e) => {
          if (!clicSimple(e)) return;
          e.preventDefault();
          onAbrir({ ruta, titulo });
        }}
      >
        {corto}
      </Link>
    );
  };

  return (
    <>
      {/* Desde `sm`, la tabla; por debajo, cada fila es una tarjeta con sus variables. */}
      <div className="hidden overflow-x-auto sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              {tabla.variables.map((v) => (
                <TableHead key={v} className="font-mono text-xs">
                  ?{v}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f, i) => (
              <TableRow key={desde + i}>
                {tabla.variables.map((v) => (
                  <TableCell key={v} className="align-top text-sm">
                    {celda(f[v], f)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ol className="divide-y divide-hairline sm:hidden">
        {filas.map((f, i) => (
          <li key={desde + i} className="px-4 py-3">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              {tabla.variables.map((v) => (
                <div key={v} className="contents">
                  <dt className="font-mono text-xs text-ink-soft">?{v}</dt>
                  <dd className="min-w-0">{celda(f[v], f)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
      {paginas > 1 && <Paginador pagina={Math.min(pagina, paginas)} paginas={paginas} onPage={onPagina} etiqueta="Páginas del resultado" className="border-t border-hairline px-4 py-3" />}
    </>
  );
}
