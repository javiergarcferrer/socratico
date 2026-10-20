"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { keepPreviousData, useIsFetching, useQuery } from "@tanstack/react-query";
import { createSerializer, parseAsInteger, parseAsJson, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Plegable from "@/components/plegable";
import { EstadoVacio } from "@/components/estado-vacio";
import { EsqueletoFilas } from "@/components/esqueleto";
import { CampoBusqueda } from "@/components/campo-busqueda";
import { BottomSheet } from "@/components/bottom-sheet";
import { useRebotado } from "@/components/rebotado";
import { claves, explorarGrafo, leerFuentes, leerOntologia } from "@/lib/consultas";
import { enlace } from "@/lib/grafo";
import { BUSQUEDAS } from "@/lib/secciones";
import { formatFecha, formatHora } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { cn } from "@/lib/cn";
import { CLAVES_FACETA, type Exploracion, type FuentesVista, type OntologiaVista, type Pulso } from "@/lib/explorar-tipos";
import { TIPOS_OBJETO, tipoObjeto, type PedidoObjetos } from "@/lib/objetos";
import { Inspector, type PasoRastro } from "./inspector";
import { Preguntar } from "./preguntar";
import { RedDelNodo } from "./red";
import { Facetas, Resultados } from "./resultados";
import { Tablero, useAbiertos } from "./tablero";
import { ClasesDeObjeto, FiltrosDeObjeto, Objetos } from "./objetos";
import { ArbolDeClases, Ontologia } from "./ontologia";
import { Fuentes, ListaDeFuentes } from "./fuentes";
import { clicSimple } from "./clic";

const MODOS = ["buscar", "preguntar"] as const;

/** Lo que recorre «Buscar»: la misma frase que la paleta pone junto al destino (`BUSQUEDAS`). */
const ALCANCE = BUSQUEDAS.find((b) => b.href === "/")?.alcance;

const SECCIONES_BANCO = ["objetos", "fuentes", "ontologia"] as const;
type SeccionBanco = "tablero" | (typeof SECCIONES_BANCO)[number];

/** Los filtros de categoría del explorador de objetos en la URL: `{"estado":"Terminado"}`. */
function filtrosValidos(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const salida: Record<string, string> = {};
  for (const [k, x] of Object.entries(v)) if (/^[a-z_]+$/.test(k) && typeof x === "string") salida[k] = x;
  return salida;
}

const ESTADO_URL = {
  q: parseAsString.withDefault(""),
  faceta: parseAsStringLiteral(CLAVES_FACETA),
  modo: parseAsStringLiteral(MODOS).withDefault("buscar"),
  nodo: parseAsString,
  pagina: parseAsInteger.withDefault(1),
  vista: parseAsStringLiteral(["red"] as const),
  // La sección del centro cuando no se busca: el tablero (sin parámetro), los objetos o la ontología.
  seccion: parseAsStringLiteral(SECCIONES_BANCO),
  // El explorador de objetos: la clase, el filtro de texto, los de categoría, el orden y la página.
  tipo: parseAsString,
  filtro: parseAsString.withDefault(""),
  cat: parseAsJson(filtrosValidos),
  orden: parseAsString,
  dir: parseAsStringLiteral(["asc", "desc"] as const),
  hoja: parseAsInteger.withDefault(1),
  // El recorrido de la ontología: la clase abierta (`soc:Institucion`).
  clase: parseAsString,
  // Las fuentes: la abierta, por la clave de su grafo con nombre (`padron`).
  fuente: parseAsString,
};

/** La dirección del banco con un estado dado: los enlaces que se abren en otra pestaña llevan todo. */
const serializar = createSerializer(ESTADO_URL);

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
 * El banco de trabajo del grafo (la portada, `/`): la plataforma entera como lo
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
export function Banco({
  ejemplos,
  preguntas,
  pulso,
  cortes,
}: {
  ejemplos: Ejemplo[];
  preguntas: PreguntaEjemplo[];
  pulso: Pulso | null;
  /** La fecha de corte de cada tabla del grafo (`public/tablas/meta.json`). */
  cortes: Record<string, string | null>;
}) {
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
  const buscando = !preguntar && url.q.trim().length >= 2;

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
  const hacia = (ruta: string) => serializar("/", { ...url, nodo: ruta, vista: "red" });
  const hrefNodo = (ruta: string) => serializar("/", { ...url, nodo: ruta });
  const hrefClase = (curie: string) => serializar("/", { ...url, q: null, modo: null, seccion: "ontologia", clase: curie });
  const hrefFuente = (clave: string | null) => serializar("/", { ...url, q: null, modo: null, seccion: "fuentes", fuente: clave });

  /*
    Lo que ocupa el centro: una búsqueda o una pregunta mandan mientras haya
    algo escrito; si no, la sección elegida en la barra de secciones.
  */
  const seccion: SeccionBanco = url.seccion ?? "tablero";
  const enCentro: "pregunta" | "busqueda" | SeccionBanco = preguntar && q.length >= 3 ? "pregunta" : buscando ? "busqueda" : seccion;
  const sinInspector = !url.nodo && (enCentro === "objetos" || enCentro === "ontologia" || enCentro === "fuentes");
  // La ontología se pide al abrir su sección: no viaja con la portada.
  const ontologia = useQuery({
    queryKey: claves.ontologia,
    queryFn: ({ signal }) => leerOntologia<OntologiaVista>(signal),
    enabled: enCentro === "ontologia" || enCentro === "fuentes",
    staleTime: Infinity,
  });
  // Lo que aporta cada fuente: lo leen la sección «Fuentes» y la ficha de cada clase.
  const fuentes = useQuery({
    queryKey: claves.fuentes,
    queryFn: ({ signal }) => leerFuentes<FuentesVista>(signal),
    enabled: enCentro === "fuentes" || enCentro === "ontologia",
    staleTime: Infinity,
  });
  const irA = (s: SeccionBanco, extra: Partial<typeof url> = {}) => {
    setTexto("");
    enviado.current = "";
    void setUrl({ q: null, faceta: null, pagina: null, modo: null, seccion: s === "tablero" ? null : s, ...extra }, { history: "push" });
  };

  // El explorador de objetos: el pedido sale entero de la URL.
  const tipo = tipoObjeto(url.tipo) ?? TIPOS_OBJETO[0];
  const pedido: PedidoObjetos = {
    tipo,
    texto: url.filtro,
    filtros: Object.fromEntries(Object.entries(url.cat ?? {}).filter(([k]) => tipo.facetas.some((f) => f.col === k))),
    orden: url.orden ?? tipo.orden.col,
    dir: url.dir ?? tipo.orden.dir,
    pagina: url.hoja,
  };
  const onTexto = useCallback((t: string) => void setUrl({ filtro: t || null, hoja: null }), [setUrl]);
  const onTipo = (id: string) =>
    void setUrl({ seccion: "objetos", tipo: id === TIPOS_OBJETO[0].id ? null : id, filtro: null, cat: null, orden: null, dir: null, hoja: null }, { history: "push" });
  const onFiltro = (col: string, valor: string | null) => {
    const cat = { ...pedido.filtros };
    if (valor == null) delete cat[col];
    else cat[col] = valor;
    void setUrl({ cat: Object.keys(cat).length ? cat : null, hoja: null }, { history: "push" });
  };

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

      <BarraDeSecciones
        activa={enCentro === "pregunta" || enCentro === "busqueda" ? null : enCentro}
        busqueda={enCentro === "pregunta" ? "Tu pregunta" : enCentro === "busqueda" ? `Búsqueda: «${q}»` : null}
        href={(s) => serializar("/", { ...url, q: null, faceta: null, pagina: null, modo: null, seccion: s === "tablero" ? null : s })}
        onIr={(s) => irA(s)}
      />

      {/* En los objetos y la ontología, sin nodo abierto, la columna del inspector se pliega: la tabla gana el ancho. */}
      <div
        className={cn(
          "grid flex-1",
          sinInspector ? "lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)]" : "lg:grid-cols-[15rem_minmax(0,1fr)_25rem] xl:grid-cols-[16rem_minmax(0,1fr)_27rem]",
        )}
      >
        {/* El panel izquierdo: las clases de lo hallado y los puntos de partida. */}
        <aside aria-label={enCentro === "objetos" ? "Clase y filtros" : enCentro === "ontologia" ? "Clases de la ontología" : enCentro === "fuentes" ? "Fuentes del grafo" : "Clases y puntos de partida"} className="hidden border-r border-hairline bg-surface lg:block">
          <div className="sticky top-[var(--alto-cabecera)] max-h-[calc(100dvh-var(--alto-cabecera))] space-y-5 overflow-y-auto px-3 py-4">
            {enCentro === "objetos" ? (
              <>
                <nav aria-labelledby="lateral-objetos">
                  <p id="lateral-objetos" className="rotulo mb-2 px-1 text-ink-soft">
                    Clase de objeto
                  </p>
                  <ClasesDeObjeto tipo={tipo} onTipo={onTipo} vertical />
                </nav>
                <FiltrosDeObjeto pedido={pedido} onFiltro={onFiltro} idBase="faceta-panel" />
              </>
            ) : enCentro === "fuentes" ? (
              fuentes.data && <ListaDeFuentes datos={fuentes.data} activa={url.fuente} hrefFuente={hrefFuente} />
            ) : enCentro === "ontologia" ? (
              <div>
                <p className="rotulo mb-2 px-1 text-ink-soft">Clases de la ontología</p>
                {ontologia.data && <ArbolDeClases ontologia={ontologia.data} clase={url.clase} hrefClase={hrefClase} />}
              </div>
            ) : (
              <>
                {buscando && datos && !datos.cedula && datos.facetas.length > 0 && (
                  <nav aria-labelledby="lateral-clases">
                    <p id="lateral-clases" className="rotulo mb-2 px-1 text-ink-soft">
                      Clases
                    </p>
                    <Facetas datos={datos} faceta={url.faceta} onFaceta={(f) => void setUrl({ faceta: f, pagina: null })} vertical />
                  </nav>
                )}
                <PuntosDePartida ejemplos={ejemplos} preguntas={preguntas} onAbrir={abrirDesdeLista} />
              </>
            )}
          </div>
        </aside>

        {/* Una sección y no un `main`: el `main` es el de la página (`app/layout.tsx`). */}
        <section aria-label={ETIQUETA_CENTRO[enCentro]} className="min-w-0 space-y-3 p-3 lg:space-y-4 lg:p-4">
          {enRed && <RedDelNodo ruta={url.nodo!} hacia={hacia} onCerrar={() => void setUrl({ vista: null }, { history: "push" })} />}
          {enCentro === "pregunta" ? (
            <Preguntar pregunta={q} onAbrir={abrir} />
          ) : enCentro === "busqueda" ? (
            <Resultados
              consulta={busqueda}
              faceta={url.faceta}
              nodo={url.nodo}
              onFaceta={(f) => void setUrl({ faceta: f, pagina: null })}
              onPagina={(p) => void setUrl({ pagina: p > 1 ? p : null })}
              onAbrir={abrirDesdeLista}
            />
          ) : enCentro === "objetos" ? (
            <Objetos
              pedido={pedido}
              corte={cortes[tipo.tabla] ?? null}
              nodo={url.nodo}
              hrefNodo={hrefNodo}
              onTexto={onTexto}
              onOrden={(col, dir) => void setUrl({ orden: col, dir, hoja: null })}
              onFiltro={onFiltro}
              onHoja={(h) => void setUrl({ hoja: h > 1 ? h : null }, { history: "push" })}
              onTipo={onTipo}
              onAbrir={abrirDesdeLista}
            />
          ) : enCentro === "fuentes" ? (
            // Sin la ontología no se sabe qué es una clase: se espera a las dos, y si una no llega se dice.
            fuentes.data && ontologia.data ? (
              <Fuentes
                datos={fuentes.data}
                ontologia={ontologia.data}
                fuente={url.fuente}
                hrefFuente={hrefFuente}
                hrefClase={hrefClase}
                hrefNodo={hrefNodo}
                onAbrir={abrirDesdeLista}
              />
            ) : fuentes.isError || ontologia.isError ? (
              <EstadoVacio
                variante="caida"
                titulo={fuentes.isError ? "No se pudieron leer las fuentes del grafo." : "No se pudo leer la ontología, que nombra sus clases."}
                accion={
                  <Button variant="secondary" onClick={() => void (fuentes.isError ? fuentes.refetch() : ontologia.refetch())}>
                    Intentar de nuevo
                  </Button>
                }
              >
                La búsqueda, el tablero, los objetos y la ontología siguen en pie. Qué alimenta la plataforma, con sus límites, se lee en
                /fuentes.
              </EstadoVacio>
            ) : (
              <div role="status" aria-busy="true">
                <span className="sr-only">Leyendo las fuentes del grafo…</span>
                <EsqueletoFilas n={8} />
              </div>
            )
          ) : enCentro === "ontologia" ? (
            ontologia.data ? (
              <Ontologia ontologia={ontologia.data} fuentes={fuentes.data} clase={url.clase} hrefClase={hrefClase} hrefFuente={hrefFuente} onObjetos={onTipo} />
            ) : ontologia.isError ? (
              <EstadoVacio
                variante="caida"
                titulo="No se pudo leer la ontología."
                accion={
                  <Button variant="secondary" onClick={() => void ontologia.refetch()}>
                    Intentar de nuevo
                  </Button>
                }
              >
                La búsqueda, el tablero y los objetos siguen en pie. La ontología entera también se lee en /ontologia.
              </EstadoVacio>
            ) : (
              <div role="status" aria-busy="true">
                <span className="sr-only">Leyendo la ontología…</span>
                <EsqueletoFilas n={8} />
              </div>
            )
          ) : (
            <>
              {/*
                En el teléfono no hay panel izquierdo: los puntos de partida van
                encima del tablero, plegados, que es por donde se empieza.
              */}
              <Card as="section" aria-label="Por dónde empezar" className="overflow-hidden lg:hidden">
                <Plegable
                  etiqueta={`Por dónde empezar: ${preguntas.length + ejemplos.length} preguntas y nodos`}
                  etiquetaCerrar="Ocultar por dónde empezar"
                >
                  <div className="px-3 py-3">
                    <PuntosDePartida ejemplos={ejemplos} preguntas={preguntas} onAbrir={abrirDesdeLista} />
                  </div>
                </Plegable>
              </Card>
              <Tablero pulso={pulso} hrefClase={hrefClase} hrefFuente={hrefFuente} />
            </>
          )}
        </section>

        {/* El panel derecho: el nodo abierto. */}
        <aside aria-label="El nodo abierto" className={cn("hidden border-l border-hairline bg-surface", !sinInspector && "lg:block")}>
          <div ref={panel} className="sticky top-[var(--alto-cabecera)] max-h-[calc(100dvh-var(--alto-cabecera))] overflow-y-auto">
            {(ancho && inspector) || (
              <div className="px-4 py-5 text-sm leading-relaxed text-ink-soft">
                <p className="rotulo text-ink-soft">Inspector</p>
                <p className="mt-2">
                  Abre un resultado o un nodo de partida: aquí se lee, con la fuente y la fecha de cada dato, y cada vecino se abre
                  aquí mismo.
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

const ETIQUETA_CENTRO: Record<"pregunta" | "busqueda" | SeccionBanco, string> = {
  pregunta: "La evidencia de la pregunta",
  busqueda: "Resultados de la búsqueda",
  tablero: "Tablero",
  objetos: "Objetos",
  fuentes: "Fuentes",
  ontologia: "Ontología",
};

const SECCIONES_BARRA: { id: SeccionBanco; etiqueta: string; nota: string }[] = [
  { id: "tablero", etiqueta: "Tablero", nota: "Lo que hay en el grafo y lo abierto ahora" },
  { id: "objetos", etiqueta: "Objetos", nota: "Cada clase como tabla: filtra, ordena, suma" },
  { id: "fuentes", etiqueta: "Fuentes", nota: "Qué aporta cada fuente al grafo y dónde se cruzan" },
  { id: "ontologia", etiqueta: "Ontología", nota: "Las clases y cómo se ligan" },
];

/**
 * Las secciones de la mesa, como las pestañas de la barra de una aplicación
 * de Blueprint: el tablero, el explorador de objetos, las fuentes y el recorrido de la
 * ontología. Son enlaces (se abren en otra pestaña con todo su estado) que,
 * con un clic simple, cambian la sección sin recargar. Mientras se busca o se
 * pregunta, la pestaña encendida es la búsqueda, y tocar una sección la deja.
 */
function BarraDeSecciones({
  activa,
  busqueda,
  href,
  onIr,
}: {
  activa: SeccionBanco | null;
  busqueda: string | null;
  href: (s: SeccionBanco) => string;
  onIr: (s: SeccionBanco) => void;
}) {
  return (
    <nav aria-label="Secciones del banco" className="flex items-stretch gap-1 overflow-x-auto border-b border-hairline bg-surface px-2 [scrollbar-width:none] lg:px-3">
      {SECCIONES_BARRA.map((s) => (
        <Link
          key={s.id}
          href={href(s.id)}
          title={s.nota}
          aria-current={activa === s.id ? "page" : undefined}
          onClick={(e) => {
            if (!clicSimple(e)) return;
            e.preventDefault();
            onIr(s.id);
          }}
          className="relative inline-flex min-h-11 shrink-0 items-center px-3 text-sm font-medium text-ink-soft hover:text-ink aria-[current=page]:text-ink aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-2 aria-[current=page]:after:bottom-0 aria-[current=page]:after:h-0.5 aria-[current=page]:after:bg-brand-500 sm:min-h-10"
        >
          {s.etiqueta}
        </Link>
      ))}
      {busqueda && (
        <span aria-current="page" className="relative ml-1 inline-flex min-h-11 min-w-0 items-center border-l border-hairline px-3 text-sm font-medium text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-brand-500 sm:min-h-10">
          <span className="truncate">{busqueda}</span>
        </span>
      )}
    </nav>
  );
}

/**
 * La barra de estado de la mesa, como la de una aplicación de análisis: de
 * cuándo es el grafo y si la fuente en vivo contesta (cuánto tiene lo dice el
 * tablero, una vez). Comparte la consulta de lo abierto ahora con el tablero.
 */
function BarraDeEstado({ pulso }: { pulso: Pulso | null }) {
  const abiertos = useAbiertos();
  return (
    <footer aria-label="Estado del grafo" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline bg-surface px-3 py-1.5 font-mono text-xs text-ink-soft lg:px-4">
      {pulso?.compilado && <span>Grafo compilado el {formatFecha(pulso.compilado)}</span>}
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
