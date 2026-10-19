"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { keepPreviousData, useIsFetching, useQuery } from "@tanstack/react-query";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CampoBusqueda } from "@/components/campo-busqueda";
import { BottomSheet } from "@/components/bottom-sheet";
import { useRebotado } from "@/components/rebotado";
import { claves, explorarGrafo } from "@/lib/consultas";
import { enlace } from "@/lib/grafo";
import { BUSQUEDAS } from "@/lib/secciones";
import { formatFecha, formatHora } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { cn } from "@/lib/cn";
import { CLAVES_FACETA, type Exploracion, type Pulso } from "@/lib/explorar-tipos";
import { Inspector, type PasoRastro } from "./inspector";
import { Preguntar } from "./preguntar";
import { RedDelNodo } from "./red";
import { Facetas, Resultados } from "./resultados";
import { Tablero, useAbiertos } from "./tablero";
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
 * que es, un grafo de registros del Estado ligados entre sí, en una mesa de
 * análisis con la forma de las de Blueprint (el tema `.tema-blueprint` de
 * `app/globals.css`): la barra con la caja arriba; a la izquierda, las clases
 * de lo hallado y los puntos de partida; al centro, el tablero, la tabla de
 * resultados o la evidencia de una pregunta; a la derecha, el nodo abierto,
 * que se recorre de arista en arista sin perder la lista; abajo, la barra de
 * estado. En el teléfono los paneles se apilan y el nodo sube en una hoja.
 *
 * Todo el estado vive en la URL (`nuqs`): una búsqueda, una faceta, una
 * pregunta o un nodo abierto se comparten con un enlace y vuelven con
 * «atrás». Lo tecleado busca mientras se escribe (con rebote); una pregunta,
 * que junta más evidencia y cuesta más, solo al enviarla.
 */
export function Banco({ ejemplos, preguntas, pulso }: { ejemplos: Ejemplo[]; preguntas: PreguntaEjemplo[]; pulso: Pulso | null }) {
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
  // La pestaña del inspector sigue abierta al pivotar: quien recorre por «Relaciones» no vuelve a «Resumen» en cada paso.
  const [pestana, setPestana] = useState("resumen");
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
      pestana={pestana}
      onPestana={setPestana}
      onRed={() => void setUrl({ vista: enRed ? null : "red" }, { history: "push" })}
    />
  ) : null;

  const datos = busqueda.data;
  const buscando = !preguntar && q.length >= 2;

  return (
    <div className="flex min-h-[calc(100dvh-var(--alto-cabecera))] flex-col">
      {/*
        La barra de Blueprint: el nombre de la mesa, el modo, la caja y el
        pulso del grafo. En el teléfono se apila; desde `lg` es una franja.
      */}
      <header className="border-b border-hairline bg-surface px-3 py-2.5 lg:px-4">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-start lg:gap-4">
          <div className="flex shrink-0 items-center gap-3 lg:h-10">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />
            <h1 className="font-sans text-sm font-semibold tracking-wide text-ink">¿Qué buscas en el Estado?</h1>
            <ToggleGroup type="single" value={url.modo} onValueChange={cambiarModo} aria-label="Cómo leer lo que escribes" className="ml-auto lg:ml-2">
              <ToggleGroupItem value="buscar" className="min-h-11 sm:min-h-9">
                Buscar
              </ToggleGroupItem>
              <ToggleGroupItem value="preguntar" className="min-h-11 sm:min-h-9">
                Preguntar
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <CampoBusqueda
            className="min-w-0 flex-1 [&_p]:text-xs"
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
                ? "Se atan al grafo las instituciones, personas y empresas que nombra la pregunta y se junta la evidencia: sus datos, sus aristas, la consulta de compras que pide. La evidencia, con su fuente y su fecha, es la respuesta."
                : ALCANCE
            }
            pendiente={preguntar ? preguntando : busqueda.isFetching}
            textoBoton={preguntar ? "Preguntar" : "Buscar"}
          />
        </div>
      </header>

      <div className="grid flex-1 lg:grid-cols-[15rem_minmax(0,1fr)_25rem] xl:grid-cols-[16rem_minmax(0,1fr)_27rem]">
        {/* El panel izquierdo: las clases de lo hallado y los puntos de partida. */}
        <aside aria-label="Clases y puntos de partida" className="hidden border-r border-hairline bg-surface lg:block">
          <div className="sticky top-[var(--alto-cabecera)] max-h-[calc(100dvh-var(--alto-cabecera))] space-y-5 overflow-y-auto px-3 py-4">
            {buscando && datos && !datos.cedula && datos.facetas.length > 0 && (
              <nav aria-labelledby="lateral-clases">
                <p id="lateral-clases" className="rotulo mb-2 px-1 text-ink-soft">
                  Clases
                </p>
                <Facetas datos={datos} faceta={url.faceta} onFaceta={(f) => void setUrl({ faceta: f, pagina: null })} vertical />
              </nav>
            )}
            <PuntosDePartida ejemplos={ejemplos} preguntas={preguntas} onAbrir={abrirDesdeLista} />
          </div>
        </aside>

        {/* Una sección y no un `main`: el `main` es el de la página (`app/layout.tsx`). */}
        <section aria-label="Tablero y resultados" className="min-w-0 space-y-3 p-3 lg:space-y-4 lg:p-4">
          {enRed && <RedDelNodo ruta={url.nodo!} hacia={hacia} onCerrar={() => void setUrl({ vista: null }, { history: "push" })} />}
          {preguntar && q.length >= 3 ? (
            <Preguntar pregunta={q} onAbrir={abrir} />
          ) : buscando ? (
            <Resultados
              consulta={busqueda}
              faceta={url.faceta}
              nodo={url.nodo}
              onFaceta={(f) => void setUrl({ faceta: f, pagina: null })}
              onPagina={(p) => void setUrl({ pagina: p > 1 ? p : null })}
              onAbrir={abrirDesdeLista}
            />
          ) : (
            <>
              <Tablero pulso={pulso} />
              {/* En el teléfono no hay panel izquierdo: los puntos de partida van debajo del tablero. */}
              <div className="lg:hidden">
                <PuntosDePartida ejemplos={ejemplos} preguntas={preguntas} onAbrir={abrirDesdeLista} />
              </div>
            </>
          )}
        </section>

        {/* El panel derecho: el nodo abierto. */}
        <aside aria-label="El nodo abierto" className="hidden border-l border-hairline bg-surface lg:block">
          <div ref={panel} className="sticky top-[var(--alto-cabecera)] max-h-[calc(100dvh-var(--alto-cabecera))] overflow-y-auto">
            {(ancho && inspector) || (
              <div className="px-4 py-5 text-sm leading-relaxed text-ink-soft">
                <p className="rotulo text-ink-soft">Inspector</p>
                <p className="mt-2">
                  Abre cualquier resultado que sea un nodo y aparece aquí: lo que dice de sí, lo que su fuente dice ahora, con
                  quién se liga y de qué fuente y de qué fecha sale cada dato. Cada vecino se abre aquí mismo: así se recorre el
                  grafo, de arista en arista.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>

      <BarraDeEstado pulso={pulso} />

      {/* En el teléfono y la tableta, el nodo sube en una hoja sobre la lista. */}
      <BottomSheet open={!ancho && !!url.nodo} onClose={cerrar} title="El nodo abierto" className="tema-blueprint">
        {!ancho && inspector}
      </BottomSheet>
    </div>
  );
}

/**
 * La barra de estado de la mesa, como la de una aplicación de análisis: de
 * cuándo es el grafo, cuánto tiene y si la fuente en vivo contesta. Comparte
 * la consulta de lo abierto ahora con el tablero.
 */
function BarraDeEstado({ pulso }: { pulso: Pulso | null }) {
  const abiertos = useAbiertos();
  return (
    <footer aria-label="Estado del grafo" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline bg-surface px-3 py-1.5 font-mono text-xs text-ink-soft lg:px-4">
      {pulso?.compilado && <span>Grafo compilado el {formatFecha(pulso.compilado)}</span>}
      {pulso && (
        <span>
          {formatInt(pulso.nodos)} nodos · {formatInt(pulso.triples)} triples · {formatInt(pulso.fuentes.filter((f) => !f.derivado).length)} fuentes y{" "}
          {formatInt(pulso.fuentes.filter((f) => f.derivado).length)} reglas
        </span>
      )}
      <span className="inline-flex items-center gap-1.5" aria-live="polite">
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 rounded-full", abiertos.isError ? "bg-sello-600" : abiertos.data ? "bg-valido-500" : "bg-ink-soft")}
        />
        {abiertos.isError
          ? "DGCP en vivo: no contestó"
          : abiertos.data
            ? `DGCP en vivo: leída a las ${formatHora(abiertos.data.leido)}, con caché de hasta 5 min`
            : "DGCP en vivo: leyendo…"}
      </span>
      <Link href="/fuentes" className="ml-auto inline-flex min-h-11 items-center underline sm:min-h-0">
        Fuentes y límites
      </Link>
    </footer>
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

/* --------------------------------------------------------- puntos de partida */

/** Lo que el panel izquierdo ofrece antes y durante una búsqueda: una pregunta por cada quien, y nodos para recorrer. */
function PuntosDePartida({
  ejemplos,
  preguntas,
  onAbrir,
}: {
  ejemplos: Ejemplo[];
  preguntas: PreguntaEjemplo[];
  onAbrir: (p: PasoRastro) => void;
}) {
  return (
    <div className="space-y-5">
      <section aria-labelledby="partida-preguntas">
        <h2 id="partida-preguntas" className="rotulo mb-1 px-1 font-mono text-ink-soft">
          Cada quien busca algo
        </h2>
        <ul>
          {preguntas.map((p) => (
            <li key={p.texto} className="relative rounded-md px-1 py-1.5">
              <span className="block text-xs text-ink-soft">{p.para}</span>
              <Link
                href={enlace.explorar({ q: p.texto, modo: p.modo === "preguntar" ? "preguntar" : null })}
                className="estira text-[13px] font-medium leading-snug text-brand-700 hover:underline"
              >
                {p.texto}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="partida-nodos">
        <h2 id="partida-nodos" className="rotulo mb-1 px-1 font-mono text-ink-soft">
          Nodos para recorrer
        </h2>
        <ul>
          {ejemplos.map((e) => (
            <li key={e.ruta} className="relative rounded-md px-1 py-1.5">
              <Link
                href={enlace.explorar({ nodo: e.ruta })}
                className="estira text-[13px] font-medium leading-snug text-ink hover:text-brand-700"
                onClick={(ev) => {
                  if (!clicSimple(ev)) return;
                  ev.preventDefault();
                  onAbrir({ ruta: e.ruta, titulo: e.nombre });
                }}
              >
                {e.nombre}
              </Link>
              <span className="block text-xs leading-relaxed text-ink-soft">{e.porque}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
