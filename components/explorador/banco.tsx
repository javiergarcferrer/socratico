"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { keepPreviousData, useIsFetching, useQuery } from "@tanstack/react-query";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CampoBusqueda } from "@/components/campo-busqueda";
import { EstadoVacio } from "@/components/estado-vacio";
import { EsqueletoFilas } from "@/components/esqueleto";
import { BottomSheet } from "@/components/bottom-sheet";
import { Paginador } from "@/components/paginador";
import Antiguedad from "@/components/antiguedad";
import { IconExternal } from "@/components/icons";
import { useRebotado } from "@/components/rebotado";
import { claves, explorarGrafo } from "@/lib/consultas";
import { enlace } from "@/lib/grafo";
import { BUSQUEDAS } from "@/lib/secciones";
import { formatFecha, formatPesos } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { CLAVES_FACETA, type ClaveFacetaPedida, type Exploracion, type FilaExplorada } from "@/lib/explorar-tipos";
import { Inspector, type PasoRastro } from "./inspector";
import { Preguntar } from "./preguntar";
import { RedDelNodo } from "./red";
import { clicSimple } from "./clic";

const MODOS = ["buscar", "preguntar"] as const;

/** Lo que recorre «Buscar»: la misma frase que la paleta pone junto al destino (`BUSQUEDAS`). */
const ALCANCE = BUSQUEDAS.find((b) => b.href === "/explorar")?.alcance;

const ESTADO_URL = {
  q: parseAsString.withDefault(""),
  faceta: parseAsStringLiteral(CLAVES_FACETA),
  modo: parseAsStringLiteral(MODOS).withDefault("buscar"),
  nodo: parseAsString,
  pagina: parseAsInteger.withDefault(1),
  vista: parseAsStringLiteral(["red"] as const),
};

export interface Ejemplo {
  ruta: string;
  nombre: string;
  porque: string;
}

export interface PreguntaEjemplo {
  texto: string;
  modo: (typeof MODOS)[number];
  para: string;
}

/**
 * El banco de trabajo del grafo (`/explorar`): la plataforma entera como lo
 * que es, un grafo de registros del Estado ligados entre sí. Tres paneles,
 * como una mesa de análisis: las clases del grafo con su cuenta a la
 * izquierda, lo hallado en el centro y el nodo abierto a la derecha, que se
 * recorre de arista en arista sin perder la lista. En el teléfono, la lista
 * ocupa la pantalla y el nodo sube en una hoja.
 *
 * Todo el estado vive en la URL (`nuqs`): una búsqueda, una faceta, una
 * pregunta o un nodo abierto se comparten con un enlace y vuelven con
 * «atrás». Lo tecleado busca mientras se escribe (con rebote); una pregunta,
 * que junta más evidencia y cuesta más, solo al enviarla.
 */
export function Banco({ ejemplos, preguntas }: { ejemplos: Ejemplo[]; preguntas: PreguntaEjemplo[] }) {
  const [url, setUrl] = useQueryStates(ESTADO_URL, { history: "replace" });
  const [texto, setTexto] = useState(url.q);
  // Las rutas por las que se llegó al nodo abierto, de la primera a la anterior.
  const [rastro, setRastro] = useState<string[]>([]);
  // El nombre de cada nodo visto: el del enlace pulsado, y el del nodo en cuanto el inspector lo lee.
  const titulos = useRef(new Map<string, string>());
  // Lo último que se escribió en `?q=`: el rebote no reescribe lo que llega de la URL (atrás, un enlace).
  const enviado = useRef(url.q);
  // Al cambiar de modo, lo tecleado se queda en el campo aunque `?q=` se vacíe.
  const conservar = useRef<string | null>(null);
  // El inspector toma el foco solo cuando el lector pivota, no al cargar la página.
  const [enfocar, setEnfocar] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const ancho = useEsAncho();
  const preguntar = url.modo === "preguntar";
  const preguntando = useIsFetching({ queryKey: ["preguntar"] }) > 0;

  useEffect(() => {
    enviado.current = url.q;
    if (conservar.current !== null) {
      setTexto(conservar.current);
      conservar.current = null;
    } else setTexto(url.q);
  }, [url.q]);

  // En «Buscar», lo tecleado busca solo, con rebote; en «Preguntar», al enviar.
  const rebotado = useRebotado(texto.trim(), texto.trim() === "" ? 0 : 280);
  useEffect(() => {
    if (preguntar || rebotado === enviado.current) return;
    enviado.current = rebotado;
    void setUrl({ q: rebotado || null, pagina: null });
  }, [rebotado, preguntar, setUrl]);

  /*
    El rastro sale solo de la URL, venga el cambio de un clic en el
    inspector, en el dibujo de la red, en el rastro mismo o de «atrás» y
    «adelante»: llegar a un nodo que está en el rastro lo corta ahí; llegar a
    otro apila el que se dejó; abrir desde la lista empieza de cero.
  */
  const previo = useRef(url.nodo);
  const reiniciar = useRef(false);
  useEffect(() => {
    const antes = previo.current;
    previo.current = url.nodo;
    const nodo = url.nodo;
    if (!nodo || reiniciar.current) {
      reiniciar.current = false;
      setRastro([]);
    } else {
      setRastro((r) => (r.includes(nodo) ? r.slice(0, r.indexOf(nodo)) : antes && antes !== nodo ? [...r, antes] : r));
    }
    if (panel.current) panel.current.scrollTop = 0;
  }, [url.nodo]);

  const q = url.q.trim();
  const busqueda = useQuery({
    queryKey: claves.explorar(q, url.faceta, url.pagina),
    queryFn: ({ signal }) => explorarGrafo<Exploracion>(q, url.faceta, url.pagina, signal),
    enabled: !preguntar && q.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 10 * 60 * 1000,
  });

  /** Pivota a un vecino: el nodo de donde se sale entra al rastro (lo apila el efecto de arriba). */
  const abrir = (paso: PasoRastro) => {
    titulos.current.set(paso.ruta, paso.titulo);
    setEnfocar(true);
    void setUrl({ nodo: paso.ruta }, { history: "push" });
  };
  /** Abre un nodo desde la lista: empieza un recorrido nuevo. */
  const abrirDesdeLista = (paso: PasoRastro) => {
    titulos.current.set(paso.ruta, paso.titulo);
    setEnfocar(true);
    if (paso.ruta === url.nodo) return setRastro([]);
    reiniciar.current = true;
    void setUrl({ nodo: paso.ruta }, { history: "push" });
  };
  const volverA = (i: number) => {
    setEnfocar(true);
    void setUrl({ nodo: rastro[i] }, { history: "push" });
  };
  // Cerrar no apila: «atrás» después de cerrar no vuelve a abrir la hoja.
  const cerrar = () => void setUrl({ nodo: null, vista: null });
  // La red se dibuja solo desde `lg`: por debajo, sus rótulos bajarían de 12 px.
  const enRed = ancho && !!url.nodo && url.vista === "red";
  const hacia = (ruta: string) =>
    enlace.explorar({ q: url.q || null, faceta: url.faceta, modo: preguntar ? "preguntar" : null, nodo: ruta, vista: "red" });

  const cambiarModo = (m: string) => {
    if (!m || m === url.modo) return;
    conservar.current = texto;
    enviado.current = "";
    // Una pregunta se corre al enviarla, no al cambiar de modo: `?q=` se vacía y lo tecleado se queda.
    void setUrl({ modo: m === "preguntar" ? "preguntar" : null, q: null, faceta: null, pagina: null });
  };

  const inspector = url.nodo ? (
    <Inspector
      key={url.nodo}
      ruta={url.nodo}
      rastro={rastro.map((ruta) => ({ ruta, titulo: titulos.current.get(ruta) ?? ruta }))}
      enfocar={enfocar}
      onCargado={(ruta, titulo) => titulos.current.set(ruta, titulo)}
      onAbrir={abrir}
      onVolverA={volverA}
      onCerrar={cerrar}
      enRed={ancho ? enRed : null}
      onRed={() => void setUrl({ vista: enRed ? null : "red" }, { history: "push" })}
    />
  ) : null;

  return (
    <div className="space-y-4">
      <Card as="section" aria-label="Qué buscar en el grafo" className="space-y-3 px-4 py-4 sm:px-5">
        <ToggleGroup type="single" value={url.modo} onValueChange={cambiarModo} aria-label="Cómo leer lo que escribes">
          <ToggleGroupItem value="buscar" className="min-h-11 sm:min-h-10">
            Buscar
          </ToggleGroupItem>
          <ToggleGroupItem value="preguntar" className="min-h-11 sm:min-h-10">
            Preguntar
          </ToggleGroupItem>
        </ToggleGroup>
        <CampoBusqueda
          valor={texto}
          onValor={setTexto}
          onEnviar={() => void setUrl({ q: texto.trim() || null, pagina: null }, { history: "push" })}
          onLimpiar={() => {
            setTexto("");
            void setUrl({ q: null, faceta: null, pagina: null });
          }}
          etiqueta={preguntar ? "Tu pregunta" : "Buscar en todo el grafo"}
          placeholder={preguntar ? "¿Qué compró el MINERD este año?" : "Una persona, una institución, un RNC, «Ley 87-01», un tema"}
          ayuda={
            preguntar
              ? "Se lee la pregunta, se atan al grafo las instituciones, personas y empresas que nombra, y se junta la evidencia: sus datos, sus aristas, la consulta de compras que pide. No se redacta una respuesta: la evidencia, con su fuente y su fecha, la da."
              : ALCANCE
          }
          pendiente={preguntar ? preguntando : busqueda.isFetching}
          textoBoton={preguntar ? "Preguntar" : "Buscar"}
        />
      </Card>

      {enRed && <RedDelNodo ruta={url.nodo!} hacia={hacia} onCerrar={() => void setUrl({ vista: null }, { history: "push" })} />}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start lg:gap-5">
        <div className="min-w-0">
          {preguntar ? (
            q.length >= 3 ? (
              <Preguntar pregunta={q} onAbrir={abrir} />
            ) : (
              <Inicio ejemplos={ejemplos} preguntas={preguntas} onAbrir={abrirDesdeLista} />
            )
          ) : q.length < 2 ? (
            <Inicio ejemplos={ejemplos} preguntas={preguntas} onAbrir={abrirDesdeLista} />
          ) : (
            <Resultados
              consulta={busqueda}
              faceta={url.faceta}
              nodo={url.nodo}
              onFaceta={(f) => void setUrl({ faceta: f, pagina: null })}
              onPagina={(p) => void setUrl({ pagina: p > 1 ? p : null })}
              onAbrir={abrirDesdeLista}
            />
          )}
        </div>

        <aside aria-label="El nodo abierto" className="hidden lg:block">
          <div ref={panel} className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto">
            {(ancho && inspector) || (
              <Card className="px-4 py-5 text-sm leading-relaxed text-ink-soft">
                <CardTitle as="h2">El inspector</CardTitle>
                <p className="mt-1">
                  Abre cualquier resultado que sea un nodo y aparece aquí: lo que dice de sí, con quién se liga y de qué fuente y
                  de qué fecha sale cada dato. Cada vecino se abre aquí mismo: así se recorre el grafo, de arista en arista.
                </p>
              </Card>
            )}
          </div>
        </aside>
      </div>

      {/* En el teléfono y la tableta, el nodo sube en una hoja sobre la lista. */}
      <BottomSheet open={!ancho && !!url.nodo} onClose={cerrar} title="El nodo abierto">
        {!ancho && inspector}
      </BottomSheet>
    </div>
  );
}

/** Desde `lg` el inspector es la columna de la derecha; por debajo, una hoja. Al pintar en el servidor, la hoja. */
const ANCHO = "(min-width: 1024px)";
function suscribirAncho(avisar: () => void) {
  const m = window.matchMedia(ANCHO);
  m.addEventListener("change", avisar);
  return () => m.removeEventListener("change", avisar);
}
function useEsAncho(): boolean {
  return useSyncExternalStore(suscribirAncho, () => window.matchMedia(ANCHO).matches, () => false);
}

/* ------------------------------------------------------------- resultados */

/**
 * Una faceta: el nombre de la clase y su cuenta en los dos extremos. En la
 * columna de `xl` el nombre largo («Iniciativas del Congreso») parte en dos
 * renglones en vez de empujar la cuenta fuera del botón.
 */
const FACETA = "min-h-11 justify-between gap-3 whitespace-normal text-left sm:min-h-10 xl:w-full";

function Resultados({
  consulta,
  faceta,
  nodo,
  onFaceta,
  onPagina,
  onAbrir,
}: {
  consulta: ReturnType<typeof useQuery<Exploracion>>;
  faceta: ClaveFacetaPedida | null;
  nodo: string | null;
  onFaceta: (f: ClaveFacetaPedida | null) => void;
  onPagina: (p: number) => void;
  onAbrir: (p: PasoRastro) => void;
}) {
  if (consulta.isPending) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Buscando en el grafo…</span>
        <EsqueletoFilas n={8} />
      </div>
    );
  }
  if (consulta.isError) {
    return (
      <EstadoVacio
        variante="caida"
        titulo="No pudimos buscar en el grafo."
        accion={
          <Button variant="secondary" onClick={() => void consulta.refetch()}>
            Intentar de nuevo
          </Button>
        }
      >
        {consulta.error.message} Cada vertical sigue en pie con su propio buscador; el menú lleva a todas.
      </EstadoVacio>
    );
  }
  const r = consulta.data;
  if (r.cedula) {
    return (
      <EstadoVacio titulo="A una persona no se la busca por su número">
        Lo tecleado lleva una cédula. El banco no busca por ella, y la plataforma no la enseña aunque un título oficial la
        traiga: busca por el nombre, la institución o el tema.
      </EstadoVacio>
    );
  }
  const elegida = r.facetas.find((f) => f.clave === faceta);
  const total = r.facetas.reduce((s, f) => s + f.total, 0);

  return (
    <div className="space-y-3 xl:grid xl:grid-cols-[13rem_minmax(0,1fr)] xl:items-start xl:gap-4 xl:space-y-0">
      <nav aria-label="Clases del grafo" className="xl:sticky xl:top-20">
        <ToggleGroup
          type="single"
          value={faceta ?? "todo"}
          onValueChange={(v) => v && onFaceta(v === "todo" ? null : (v as ClaveFacetaPedida))}
          aria-label="Filtrar por clase"
          className="flex w-full flex-wrap xl:flex-col xl:items-stretch"
        >
          <ToggleGroupItem value="todo" className={FACETA}>
            Todo <span className="font-mono text-xs tabular-nums">{formatInt(total)}</span>
          </ToggleGroupItem>
          {r.facetas.map((f) => (
            <ToggleGroupItem key={f.clave} value={f.clave} className={FACETA}>
              <span className="min-w-0">{f.etiqueta}</span>
              <span className="font-mono text-xs tabular-nums">{formatInt(f.total)}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </nav>

      <div className="min-w-0 space-y-3">
        {/* La cuenta se anuncia cuando cambia la búsqueda, no mientras se actualiza. */}
        <p className="text-xs leading-relaxed text-ink-soft" aria-live="polite">
          {r.filas.length > 0 &&
            [
              elegida
                ? `${formatInt(r.total)} en ${elegida.etiqueta.toLocaleLowerCase("es")} para «${r.consulta}»`
                : `${formatInt(total)} registros para «${r.consulta}» en ${r.facetas.length === 1 ? "una clase" : `${r.facetas.length} clases`}: la lista mezcla primero los nodos que se llaman así y lo más pertinente de cada una; cada clase entera, en su filtro`,
              r.truncado ? "las cuentas son del índice; la lista recorre las más pertinentes" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
        </p>

        {r.filas.length === 0 ? (
          <EstadoVacio titulo={`Nada en el grafo para «${r.consulta}»${elegida ? ` entre ${elegida.etiqueta.toLocaleLowerCase("es")}` : ""}.`}>
            Prueba con menos palabras, con el nombre como lo escribe el Estado, con unas siglas (INAPA) o con un número: un RNC,
            «Ley 87-01», un código de proceso.
          </EstadoVacio>
        ) : (
          <Card as="section" aria-label={`Resultados para «${r.consulta}»`}>
            <ul>
              {r.filas.map((f) => (
                <Fila key={f.clave} f={f} abierta={f.ruta != null && f.ruta === nodo} onAbrir={onAbrir} />
              ))}
            </ul>
          </Card>
        )}

        {r.paginas > 1 && (
          <Paginador pagina={r.pagina} paginas={r.paginas} onPage={onPagina} pendiente={consulta.isFetching} />
        )}

        <Cortes cortes={r.cortes} />
      </div>
    </div>
  );
}

function Fila({ f, abierta, onAbrir }: { f: FilaExplorada; abierta: boolean; onAbrir: (p: PasoRastro) => void }) {
  const clase = "estira text-[15px] font-medium leading-snug text-ink hover:text-brand-700";
  const titulo = f.ruta ? (
    <Link
      href={enlace.explorar({ nodo: f.ruta })}
      aria-current={abierta ? "true" : undefined}
      className={clase}
      onClick={(e) => {
        if (!clicSimple(e)) return;
        e.preventDefault();
        onAbrir({ ruta: f.ruta!, titulo: f.titulo });
      }}
    >
      {f.titulo}
    </Link>
  ) : f.href && f.externo ? (
    <a href={f.href} target="_blank" rel="noopener noreferrer" className={`${clase} inline-flex items-center gap-1`}>
      {f.titulo}
      <IconExternal className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
    </a>
  ) : f.href ? (
    <Link href={f.href} className={clase}>
      {f.titulo}
    </Link>
  ) : (
    <span className="text-[15px] font-medium leading-snug text-ink">{f.titulo}</span>
  );

  return (
    <li className="relative border-b border-hairline last:border-0">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge forma="sello" variant={f.ruta ? "firma" : "neutro"}>
              {f.clase}
            </Badge>
            {f.via === "tema" && <span className="text-xs text-ink-soft">por su tema</span>}
          </div>
          <div className="mt-1 break-words">{titulo}</div>
          {(f.detalle || f.origen || f.fecha) && (
            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
              {[f.detalle, f.origen].filter(Boolean).join(" · ")}
              {(f.detalle || f.origen) && f.fecha ? " · " : ""}
              <Antiguedad iso={f.fecha} />
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {f.valor != null && (
            <span className="text-right">
              <span className="block font-mono text-sm tabular-nums text-ink">{formatPesos(f.valor)}</span>
              {/* Lo que vale un proceso es lo estimado al publicarlo; una obra, lo que declara MapaInversiones. Nunca lo pagado. */}
              <span className="block text-xs text-ink-soft">{f.faceta === "proceso" ? "estimado" : "declarado"}</span>
            </span>
          )}
          {f.ruta && (
            <Link href={f.ruta} className="relative z-10 inline-flex min-h-11 items-center text-xs text-brand-700 underline sm:min-h-0">
              Ficha
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

/** Las fechas de corte de lo que alimenta el índice: los registros son instantáneas, no tiempo real. */
function Cortes({ cortes }: { cortes: Record<string, string> }) {
  const lista = Object.entries(cortes);
  if (lista.length === 0) return null;
  const fechas = lista.map(([, f]) => f).sort();
  const desde = formatFecha(fechas[0]);
  const hasta = formatFecha(fechas[fechas.length - 1]);
  return (
    <p className="text-xs leading-relaxed text-ink-soft">
      Instantáneas de las fuentes del Estado, con cortes {desde === hasta ? `del ${desde}` : `entre el ${desde} y el ${hasta}`}: lo
      publicado después no está aquí todavía.{" "}
      <Link href="/fuentes" className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-0">
        Qué alimenta el grafo
      </Link>
    </p>
  );
}

/* ----------------------------------------------------------------- inicio */

function Inicio({
  ejemplos,
  preguntas,
  onAbrir,
}: {
  ejemplos: Ejemplo[];
  preguntas: PreguntaEjemplo[];
  onAbrir: (p: PasoRastro) => void;
}) {
  return (
    <div className="space-y-4">
      <Card as="section" aria-labelledby="inicio-preguntas">
        <div className="px-4 pb-2 pt-3">
          <h2 id="inicio-preguntas" className="font-sans text-sm font-bold text-ink">
            Cada quien viene por algo distinto
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">Un punto de partida para cada búsqueda; todas recorren el mismo grafo.</p>
        </div>
        <ul className="border-t border-hairline">
          {preguntas.map((p) => (
            <li key={p.texto} className="relative border-b border-hairline px-4 py-3 last:border-0">
              <p className="text-xs text-ink-soft">{p.para}</p>
              <Link
                href={enlace.explorar({ q: p.texto, modo: p.modo === "preguntar" ? "preguntar" : null })}
                className="estira mt-0.5 block text-[15px] font-medium leading-snug text-ink hover:text-brand-700"
              >
                {p.texto}
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card as="section" aria-labelledby="inicio-nodos">
        <div className="px-4 pb-2 pt-3">
          <h2 id="inicio-nodos" className="font-sans text-sm font-bold text-ink">
            O abre un nodo y recórrelo
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">Uno de cada clase, con aristas que enseñan algo.</p>
        </div>
        <ul className="border-t border-hairline">
          {ejemplos.map((e) => (
            <li key={e.ruta} className="relative border-b border-hairline px-4 py-3 last:border-0">
              <Link
                href={enlace.explorar({ nodo: e.ruta })}
                className="estira text-[15px] font-medium leading-snug text-ink hover:text-brand-700"
                onClick={(ev) => {
                  if (!clicSimple(ev)) return;
                  ev.preventDefault();
                  onAbrir({ ruta: e.ruta, titulo: e.nombre });
                }}
              >
                {e.nombre}
              </Link>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{e.porque}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
