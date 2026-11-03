"use client";

/**
 * El lienzo: la red de varios saltos del banco de trabajo (`/`), en WebGL
 * (`sigma` sobre `graphology`, disposición de ForceAtlas2 en un Web Worker;
 * `motor.ts`). Se monta con `next/dynamic({ ssr: false })` desde
 * `components/explorador/red.tsx`, donde antes iba `RedVecinos`, que sigue
 * siendo la versión de servidor sin JavaScript en `/grafo`.
 *
 * Qué hace (docs/INFRAESTRUCTURA.md §7.7 y §11.11):
 *  - **expandir al clic** (o con Enter): los vecinos del nodo salen del mismo
 *    índice que lee el inspector (`claves.nodo`, `inspeccionarNodo`), con un
 *    tope por expansión repartido por grupo (`repartir`); el resto lo dice el
 *    nodo («N más en el inspector») y lo trae el inspector, que es la lista
 *    completa. Contraer, fijar (o arrastrar), ocultar y «solo esta clase»;
 *  - los dieciséis tipos en cinco familias (`familias.ts`), con la paleta
 *    `CATEGORICA` y el tipo escrito en el rótulo y en la leyenda;
 *  - **el estado en la URL** (`nuqs`): semillas `ls`, expandidos en orden
 *    `lx`, ocultos `lo`, clase `lc`, fijados `lf`, cámara `lv`. Como la red y
 *    su disposición son funciones puras de ese estado (`modelo.ts`), el
 *    enlace reproduce la vista;
 *  - **teclado**: Tab entra al lienzo, las flechas van al nodo más cercano en
 *    esa dirección, Enter expande, Esc cierra; `+`/`-` acercan y alejan, `0`
 *    recentra. Lo que se expandió se anuncia en una región `aria-live`;
 *  - por debajo de `lg` no se monta: la lista del inspector lo reemplaza.
 *
 * La API para lo que se monte encima (la ola 2: «Abrir en el lienzo» desde
 * SPARQL, los caminos, la procedencia por arista) es `LienzoApi`, por `ref`,
 * y los mismos verbos como eventos del DOM sobre el elemento `[data-lienzo]`
 * (`lienzo:sembrar`, `lienzo:camino`), para quien no tenga la referencia.
 */
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { useQueries } from "@tanstack/react-query";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { IconEncuadrar, IconExternal, IconMinus, IconPlus } from "@/components/icons";
import { EstadoVacio } from "@/components/estado-vacio";
import { Leyenda, VerComoTabla, type EntradaLeyenda } from "@/components/graficos";
import { CATEGORICA, OTROS } from "@/components/graficos/paleta";
import { claves, inspeccionarNodo } from "@/lib/consultas";
import { formatFecha, formatPesos } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { cn } from "@/lib/cn";
import type { FuenteVista, Inspeccion } from "@/lib/explorar-tipos";
import type { TipoNodoRdf } from "@/lib/grafo";
import { FAMILIAS, TIPO, TIPOS, esTipo } from "./familias";
import { ESTADO_LIENZO, SEP, SIN_LIENZO } from "./estado";
import {
  TOPE_POR_EXPANSION,
  aniosDe,
  apartar,
  armarRed,
  contraer,
  enPeriodo,
  estiloPorOmision,
  procedenciaDe,
  type AristaLienzo,
  type AristaSembrada,
  type EstiloArista,
  type Expansion,
  type NodoLienzo,
  type Semilla,
} from "./modelo";
import { Motor } from "./motor";

/** Lo que el lienzo deja hacer a quien lo monta. */
export interface LienzoApi {
  /**
   * Pone nodos en el lienzo sin expandirlos (un resultado de SPARQL, los
   * pasos de un camino), con las aristas que se sepan entre ellos. Con
   * `reemplazar`, la vista empieza de cero con esas semillas.
   */
  sembrar(nodos: Semilla[], opciones?: { aristas?: AristaSembrada[]; reemplazar?: boolean }): void;
  /** Resalta un camino (las rutas en orden) y apaga lo demás; `null` lo quita. Los pasos que falten se siembran. */
  resaltarCamino(pasos: readonly string[] | null): void;
  /**
   * Decide el trazo de cada arista: `macizo` (de una fuente) o `punteado`
   * (derivada por una regla), por su `grafo` con nombre. `null` vuelve al
   * macizo para todas.
   */
  aristasConEstilo(fn: ((a: { verbo: string; grafo: string | null; de: string; a: string }) => EstiloArista) | null): void;
  expandir(ruta: string): void;
  enfocar(ruta: string): void;
}

/** El detalle de los eventos del DOM equivalentes (`lienzo:sembrar`, `lienzo:camino`). */
export interface DetalleSembrar {
  nodos: Semilla[];
  aristas?: AristaSembrada[];
  reemplazar?: boolean;
}

/** Cuántas semillas caben en un enlace: más alargarían la dirección sin servir a nadie. */
export const SEMILLAS_EN_ENLACE = 150;
/** Cuántas semillas sin nombre se leen del índice para nombrarlas. */
const NOMBRAR_MAX = 60;

function leerCamara(v: string | null): { x: number; y: number; ratio: number } | null {
  const p = v?.split(",").map(Number);
  return p && p.length === 3 && p.every(Number.isFinite) && p[2] > 0 ? { x: p[0], y: p[1], ratio: p[2] } : null;
}

const redondear = (n: number) => Math.round(n * 1000) / 1000;

/** El índice de vecinos del inspector, como lo lee el modelo. */
function expansionDe(n: Inspeccion): Expansion {
  return {
    ruta: n.ruta,
    titulo: n.titulo,
    tipo: esTipo(n.tipo) ? n.tipo : null,
    grupos: n.grupos.map((g) => ({
      etiqueta: g.etiqueta,
      total: g.total,
      vecinos: g.aristas
        .filter((a): a is typeof a & { ruta: string } => !!a.ruta)
        .map((a) => ({
          ruta: a.ruta,
          nombre: a.nombre,
          // El grupo ya dice «Cargos»: el cargo va solo; los demás verbos sí dicen algo.
          verbo: a.verbo === "Cargo" && a.detalle ? a.detalle : [a.verbo, a.monto != null ? formatPesos(a.monto) : null].filter(Boolean).join(" · "),
          detalle: a.verbo === "Cargo" ? null : a.detalle,
          // La clave del grafo con nombre de donde sale la arista (`Inspeccion.fuentes`).
          grafo: a.grafo,
          fecha: a.fecha,
        })),
    })),
  };
}

function reducido(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const FLECHAS: Record<string, [number, number]> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export function Lienzo({
  raiz,
  onInspeccionar,
  onCerrar,
  ref,
}: {
  /** El nodo abierto en el banco: la semilla cuando el enlace no trae otras. */
  raiz: string;
  /** Abre un nodo en el inspector (sin robarle el foco al lienzo). */
  onInspeccionar: (ruta: string, titulo: string) => void;
  onCerrar: () => void;
  ref?: Ref<LienzoApi>;
}) {
  const [url, setUrl] = useQueryStates(ESTADO_LIENZO, { history: "push" });
  const contenedor = useRef<HTMLDivElement>(null);
  const raizDom = useRef<HTMLDivElement>(null);
  const motor = useRef<Motor | null>(null);
  const [dispuesto, setDispuesto] = useState(false);
  const [foco, setFoco] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [enFoco, setEnFoco] = useState("");
  const [camino, setCamino] = useState<readonly string[] | null>(null);
  const [estilo, setEstilo] = useState<{ fn: Parameters<LienzoApi["aristasConEstilo"]>[0] }>({ fn: null });
  // La arista enfocada (tecla A desde un nodo, o la tabla) y la que está bajo el puntero: las dos dicen de dónde salen.
  const [aristaFoco, setAristaFoco] = useState<string | null>(null);
  const [aristaSobre, setAristaSobre] = useState<string | null>(null);
  // Mientras se arrastra el deslizador, la ventana vive aquí; al soltar, va a la URL.
  const [arrastre, setArrastre] = useState<readonly [number, number] | null>(null);
  // Lo sembrado de más para un enlace, y lo que se sabe de cada semilla (nombre, tipo, aristas): en memoria.
  const [semillasGrandes, setSemillasGrandes] = useState<string[] | null>(null);
  const [sembradas, setSembradas] = useState<AristaSembrada[]>([]);
  const conocidos = useRef(new Map<string, Semilla>());
  // Lo último que se sembró, antes de que la red se rehaga: un resalte pedido en el mismo turno no lo vuelve a sembrar.
  const recienSembradas = useRef(new Set<string>());
  const porAnunciar = useRef<string | null>(null);

  /*
    Sin claves en la dirección (el banco las quita al salir de la red), el
    lienzo parte del nodo abierto al montarse, expandido. Con claves, la vista
    es la del enlace tal cual, aunque el nodo abierto en el inspector no esté
    en ella (se contrajo después de abrirlo).
  */
  const inicio = useRef(raiz);
  const semillasCrudas = semillasGrandes ?? url.ls ?? [inicio.current];
  const expandidosCrudos = url.lx ?? (url.ls ? [] : [inicio.current]);
  // Estables mientras no cambie su contenido: la red y su disposición solo se rehacen cuando cambia el estado.
  const claveSemillas = semillasCrudas.join(SEP);
  const claveExpandidos = expandidosCrudos.join(SEP);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const semillas = useMemo(() => semillasCrudas, [claveSemillas]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const expandidos = useMemo(() => expandidosCrudos, [claveExpandidos]);
  const ocultos = useMemo(() => new Set(url.lo ?? []), [url.lo]);
  const fijados = useMemo(() => url.lf ?? {}, [url.lf]);

  // Las lecturas: cada expandido, y las semillas sin nombre (hasta `NOMBRAR_MAX`).
  const objetivos = useMemo(() => {
    const sinNombre = semillas.filter((s) => !conocidos.current.get(s)?.titulo).slice(0, NOMBRAR_MAX);
    return [...new Set([...expandidos, ...sinNombre])];
  }, [semillas, expandidos]);
  const consultas = useQueries({
    queries: objetivos.map((ruta) => ({
      queryKey: claves.nodo(ruta),
      queryFn: ({ signal }: { signal: AbortSignal }) => inspeccionarNodo<Inspeccion>(ruta, signal),
      staleTime: 60 * 60 * 1000,
    })),
  });
  const listas = consultas.map((c, i) => (c.data ? `${objetivos[i]}@${c.dataUpdatedAt}` : "")).join(SEP);
  const fallidas = objetivos.filter((_, i) => consultas[i].isError);

  const expansiones = useMemo(() => {
    const m = new Map<string, Expansion>();
    consultas.forEach((c) => {
      if (c.data) m.set(c.data.ruta, expansionDe(c.data));
    });
    // Un nodo puede pedirse por una ruta y responder con su forma canónica: se guarda también por la pedida.
    objetivos.forEach((r, i) => {
      const d = consultas[i].data;
      if (d && !m.has(r)) m.set(r, { ...expansionDe(d), ruta: r });
    });
    return m;
    // `listas` resume qué consultas llegaron y cuándo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listas]);
  // Cada grafo con nombre que nombran las aristas leídas: su fuente y su corte, o la regla que lo deriva.
  const fuentes = useMemo(() => {
    const m = new Map<string, FuenteVista>();
    for (const c of consultas) for (const [k, f] of Object.entries(c.data?.fuentes ?? {})) m.set(k, f);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listas]);
  /** De dónde sale una arista, en palabras: en el dibujo, junto a su rótulo; en la tabla y en los anuncios, entera. */
  const fuenteDe = (grafo: string | null) => {
    const f = grafo ? fuentes.get(grafo) : null;
    if (!f) return procedenciaDe(grafo, fuentes) === "pendiente" ? "fuente aún no leída" : "el grafo compilado no dice de qué fuente sale";
    return f.derivado ? `regla de Socrático: ${f.etiqueta}` : f.corte ? `${f.etiqueta}, corte del ${formatFecha(f.corte)}` : f.etiqueta;
  };

  const entrada = useMemo(
    () => ({
      semillas: semillas.map((r) => conocidos.current.get(r) ?? { ruta: r }),
      expandidos,
      expansiones,
      aristasSembradas: sembradas,
      // Por omisión, maciza la arista que publica una fuente y punteada la que deriva una regla de Socrático.
      estilo: estilo.fn ?? ((a: { grafo: string | null }) => (a.grafo && fuentes.get(a.grafo)?.derivado ? "punteado" : estiloPorOmision())),
    }),
    [semillas, expandidos, expansiones, sembradas, estilo, fuentes],
  );
  const red = useMemo(() => armarRed(entrada), [entrada]);

  /* ------------------------------------------ procedencia y período */

  const soloFuente = url.lp === "fuente";
  const anios = useMemo(() => aniosDe(red.aristas), [red]);
  const periodo = arrastre ?? url.lt;
  const apartadas = useMemo(() => apartar(red.aristas, { periodo, soloFuente, fuentes }), [red, periodo, soloFuente, fuentes]);
  const cuentas = useMemo(() => {
    let regla = 0;
    let sinDato = 0;
    let pendiente = 0;
    let sinFecha = 0;
    let fuera = 0;
    let porProcedencia = 0;
    for (const a of red.aristas) {
      const p = procedenciaDe(a.grafo, fuentes);
      if (p === "regla") regla++;
      else if (p === "sin-dato") sinDato++;
      else if (p === "pendiente") pendiente++;
      if (enPeriodo(a.fecha, null) === "sin-fecha") sinFecha++;
      const por = apartadas.get(a.clave);
      if (por === "periodo") fuera++;
      else if (por === "procedencia") porProcedencia++;
    }
    return { regla, sinDato, pendiente, fuente: red.aristas.length - regla - sinDato - pendiente, sinFecha, fuera, porProcedencia };
  }, [red, fuentes, apartadas]);

  /* ------------------------------------------------------- el motor */

  const [nodosDibujados, setNodosDibujados] = useState(0);
  const camaraInicial = useRef(leerCamara(url.lv));
  const reloj = useRef<number | null>(null);
  const activarRef = useRef<(ruta: string) => void>(() => {});
  const soltarRef = useRef<(ruta: string, x: number, y: number) => void>(() => {});

  const [falla, setFalla] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!contenedor.current) return;
    let m: Motor;
    try {
      m = crearMotor(contenedor.current);
    } catch (e) {
      // Sin WebGL (aceleración apagada, GPU vetada): el lienzo no se dibuja, la lista sí.
      setFalla(e instanceof Error ? e.message : String(e));
      return;
    }
    motor.current = m;
    return () => {
      if (reloj.current) window.clearTimeout(reloj.current);
      m.matar();
      motor.current = null;
    };
    // `crearMotor` lee las referencias del momento; el motor vive lo que vive el componente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setUrl]);

  function crearMotor(el: HTMLDivElement): Motor {
    const m = new Motor(el, {
      onClic: (ruta) => activarRef.current(ruta),
      onSoltar: (ruta, x, y) => soltarRef.current(ruta, x, y),
      onCamara: (c) => {
        if (reloj.current) window.clearTimeout(reloj.current);
        reloj.current = window.setTimeout(() => {
          void setUrl({ lv: `${redondear(c.x)},${redondear(c.y)},${redondear(c.ratio)}` }, { history: "replace" });
        }, 400);
      },
      onDispuesto: () => {
        if (camaraInicial.current) m.camara(camaraInicial.current);
        setDispuesto(true);
      },
      onSinDisposicion: () => setAviso("La disposición no pudo calcularse en este navegador: los nodos quedan en su posición de partida."),
      onArista: (clave) => setAristaSobre(clave),
      onClicArista: (clave) => setAristaFoco(clave),
      reducido,
    });
    return m;
  }

  useEffect(() => {
    const m = motor.current;
    if (!m) return;
    m.pintar(red, fijados, (a) => fuenteDe(a.grafo));
    setNodosDibujados(m.nodos);
    const r = porAnunciar.current;
    if (r && red.nodos.get(r)?.expandido) {
      porAnunciar.current = null;
      const nodo = red.nodos.get(r)!;
      const nuevos = [...red.nodos.values()].filter((n) => n.padre === r);
      const porTipo = new Map<TipoNodoRdf | null, number>();
      for (const n of nuevos) porTipo.set(n.tipo, (porTipo.get(n.tipo) ?? 0) + 1);
      const detalle = [...porTipo]
        .map(([t, k]) => `${k} ${k === 1 ? (t ? TIPO[t].etiqueta.toLowerCase() : "otro") : t ? TIPO[t].plural : "otros"}`)
        .join(", ");
      setAnuncio(
        nuevos.length
          ? `Se abrió ${nodo.titulo}: ${nuevos.length} ${nuevos.length === 1 ? "vecino nuevo" : "vecinos nuevos"} (${detalle})${nodo.restantes ? `; ${nodo.restantes} más en el inspector` : ""}.`
          : nodo.vecinos === 0
            ? `Se abrió ${nodo.titulo}: ninguna fuente lo liga con otro nodo.`
            : `Se abrió ${nodo.titulo}: sus vecinos ya estaban en el lienzo.`,
      );
    }
    // `fuenteDe` lee `fuentes`, que cambia con la red.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [red, fijados]);

  const vista = useMemo(
    () => ({ foco, ocultos, solo: url.lc, camino, apartadas: new Set(apartadas.keys()), arista: aristaFoco }),
    [foco, ocultos, url.lc, camino, apartadas, aristaFoco],
  );
  useEffect(() => motor.current?.ver(vista), [vista, red]);

  /* --------------------------------------------------------- gestos */

  const describir = useCallback(
    (ruta: string) => {
      const n = red.nodos.get(ruta);
      if (!n) return "";
      const tipo = n.tipo ? TIPO[n.tipo].etiqueta : "Otro";
      const estado = n.expandido ? `abierto, ${n.vecinos} ${n.vecinos === 1 ? "relación" : "relaciones"}` : "sin abrir; Enter lo abre";
      return `${n.titulo}, ${tipo}, ${estado}${fijados[ruta] ? ", fijado" : ""}.`;
    },
    [red, fijados],
  );

  const enfocarNodo = useCallback(
    (ruta: string | null) => {
      setFoco(ruta);
      setAristaFoco(null);
      if (ruta) {
        motor.current?.mostrar(ruta);
        setEnFoco(describir(ruta));
      }
    },
    [describir],
  );

  const expandir = useCallback(
    (ruta: string) => {
      if (expandidos.includes(ruta)) return;
      porAnunciar.current = ruta;
      void setUrl({ ls: semillasGrandes ? null : semillas, lx: [...expandidos, ruta] });
    },
    [expandidos, semillas, semillasGrandes, setUrl],
  );

  const activar = useCallback(
    (ruta: string) => {
      const n = red.nodos.get(ruta);
      if (!n) return;
      enfocarNodo(ruta);
      expandir(ruta);
      onInspeccionar(ruta, n.titulo);
    },
    [red, enfocarNodo, expandir, onInspeccionar],
  );
  activarRef.current = activar;
  soltarRef.current = (ruta, x, y) => void setUrl({ lf: { ...fijados, [ruta]: [redondear(x), redondear(y)] } });

  const contraerNodo = (ruta: string) => {
    const lx = contraer(ruta, entrada);
    void setUrl({ lx, ls: semillasGrandes ? null : semillas });
    setAnuncio(`Se cerró ${red.nodos.get(ruta)?.titulo ?? "el nodo"}: el lienzo queda con lo que no dependía de él.`);
  };
  const fijar = (ruta: string) => {
    const m = motor.current;
    if (!m || !m.grafo.hasNode(ruta)) return;
    const siguiente = { ...fijados };
    if (siguiente[ruta]) delete siguiente[ruta];
    else {
      const { x, y } = m.grafo.getNodeAttributes(ruta);
      siguiente[ruta] = [redondear(x), redondear(y)];
    }
    void setUrl({ lf: Object.keys(siguiente).length ? siguiente : null });
  };
  const ocultar = (ruta: string) => {
    void setUrl({ lo: [...ocultos, ruta] });
    setAnuncio(`Se ocultó ${red.nodos.get(ruta)?.titulo ?? "el nodo"}.`);
    enfocarNodo(null);
  };
  const soloClase = (tipo: TipoNodoRdf | null) => {
    void setUrl({ lc: tipo });
    setAnuncio(tipo ? `Solo se ven los nodos de la clase ${TIPO[tipo].etiqueta}.` : "Se ven todas las clases.");
  };
  const cerrar = () => {
    void setUrl(SIN_LIENZO, { history: "replace" });
    onCerrar();
  };

  /* ------------------------------------------------------------- API */

  const sembrar = useCallback<LienzoApi["sembrar"]>(
    (nodos, opciones = {}) => {
      for (const n of nodos) conocidos.current.set(n.ruta, { ...conocidos.current.get(n.ruta), ...n });
      const base = opciones.reemplazar ? [] : semillas;
      const todas = [...new Set([...base, ...nodos.map((n) => n.ruta)])];
      recienSembradas.current = new Set(todas);
      setSembradas((s) => (opciones.reemplazar ? (opciones.aristas ?? []) : [...s, ...(opciones.aristas ?? [])]));
      if (todas.length > SEMILLAS_EN_ENLACE) {
        setSemillasGrandes(todas);
        void setUrl({ ls: null, lx: opciones.reemplazar ? [] : expandidos, ...(opciones.reemplazar ? { lo: null, lc: null, lf: null } : {}) });
      } else {
        setSemillasGrandes(null);
        void setUrl({ ls: todas, lx: opciones.reemplazar ? [] : expandidos, ...(opciones.reemplazar ? { lo: null, lc: null, lf: null } : {}) });
      }
      setAnuncio(`Se pusieron ${formatInt(nodos.length)} nodos en el lienzo.`);
    },
    [semillas, expandidos, setUrl],
  );

  const resaltarCamino = useCallback<LienzoApi["resaltarCamino"]>(
    (pasos) => {
      if (pasos?.length) {
        const faltan = pasos.filter((p) => !red.nodos.has(p) && !recienSembradas.current.has(p));
        if (faltan.length) {
          sembrar(
            faltan.map((ruta) => ({ ruta })),
            { aristas: pasos.slice(1).map((a, i) => ({ de: pasos[i], a, verbo: "" })) },
          );
        }
      }
      setCamino(pasos?.length ? [...pasos] : null);
    },
    [red, sembrar],
  );

  useImperativeHandle(
    ref,
    () => ({
      sembrar,
      resaltarCamino,
      aristasConEstilo: (fn) => setEstilo({ fn }),
      expandir: (ruta) => {
        if (red.nodos.has(ruta)) expandir(ruta);
      },
      enfocar: (ruta) => enfocarNodo(ruta),
    }),
    [sembrar, resaltarCamino, expandir, enfocarNodo, red],
  );

  // Los mismos verbos como eventos del DOM, para quien no tenga la referencia.
  useEffect(() => {
    const el = raizDom.current;
    if (!el) return;
    const alSembrar = (e: Event) => {
      const d = (e as CustomEvent<DetalleSembrar>).detail;
      if (d && Array.isArray(d.nodos)) sembrar(d.nodos, { aristas: d.aristas, reemplazar: d.reemplazar });
    };
    const alCamino = (e: Event) => resaltarCamino((e as CustomEvent<{ pasos: string[] | null }>).detail?.pasos ?? null);
    el.addEventListener("lienzo:sembrar", alSembrar);
    el.addEventListener("lienzo:camino", alCamino);
    return () => {
      el.removeEventListener("lienzo:sembrar", alSembrar);
      el.removeEventListener("lienzo:camino", alCamino);
    };
  }, [sembrar, resaltarCamino]);

  /* --------------------------------------------------------- teclado */

  const onTecla = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const m = motor.current;
    if (!m) return;
    const flecha = FLECHAS[e.key];
    if (flecha) {
      e.preventDefault();
      const siguiente = m.enDireccion(foco, flecha[0], flecha[1]);
      if (siguiente) enfocarNodo(siguiente);
      else setEnFoco("No hay más nodos en esa dirección.");
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (foco) activar(foco);
    } else if ((e.key === "a" || e.key === "A") && foco) {
      // De arista en arista del nodo enfocado: cada una dice de dónde sale.
      e.preventDefault();
      const suyas = m.aristasVisiblesDe(foco);
      if (!suyas.length) {
        setEnFoco("Este nodo no tiene aristas a la vista.");
        return;
      }
      const i = aristaFoco ? suyas.indexOf(aristaFoco) : -1;
      const siguiente = suyas[(i + (e.shiftKey ? -1 : 1) + suyas.length) % suyas.length];
      setAristaFoco(siguiente);
      const a = red.aristas.find((x) => x.clave === siguiente);
      if (a) setEnFoco(`${describirArista(a)} ${suyas.indexOf(siguiente) + 1} de ${suyas.length}.`);
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Esc suelta primero la arista enfocada; con nada enfocado, vuelve a la lista.
      if (aristaFoco) {
        setAristaFoco(null);
        setEnFoco("");
      } else cerrar();
    } else if (e.key === "+" || e.key === "=") {
      m.zoom(1 / 1.5);
    } else if (e.key === "-") {
      m.zoom(1.5);
    } else if (e.key === "0") {
      m.camara(null);
    }
  };

  /* ------------------------------------------------------------ vista */

  const nodoFoco = foco ? (red.nodos.get(foco) ?? null) : null;
  const nodos = useMemo(() => [...red.nodos.values()], [red]);
  const pendientes = red.pendientes.filter((r) => !fallidas.includes(r));
  const etiquetaTipo = (n: NodoLienzo) => (n.tipo ? TIPO[n.tipo].etiqueta : "Otro");
  const titulo = (ruta: string) => red.nodos.get(ruta)?.titulo ?? ruta;
  function describirArista(a: AristaLienzo): string {
    const rel = [a.verbo, a.detalle].filter(Boolean).join(" · ") || "se liga con";
    return `${titulo(a.de)}, ${rel}, ${titulo(a.a)}${a.fecha ? `, ${formatFecha(a.fecha)}` : ""}. Sale de: ${fuenteDe(a.grafo)}.`;
  }
  const aristaVista = (aristaSobre ?? aristaFoco) ? (red.aristas.find((a) => a.clave === (aristaSobre ?? aristaFoco)) ?? null) : null;
  const enDibujo = (a: AristaLienzo) => {
    const por = apartadas.get(a.clave);
    return por === "periodo" ? "fuera del período" : por === "procedencia" ? "apartada: no la publica una fuente" : "sí";
  };

  return (
    <div
      ref={raizDom}
      data-lienzo=""
      data-nodos={nodosDibujados}
      data-aristas={red.aristas.length}
      data-pendientes={pendientes.length}
      data-dispuesto={dispuesto ? "" : undefined}
      className="space-y-3"
    >
      {falla ? (
        <EstadoVacio
          variante="caida"
          titulo="Este navegador no pudo dibujar el lienzo."
          accion={
            <Button variant="secondary" onClick={cerrar}>
              Volver a la lista
            </Button>
          }
        >
          El lienzo necesita WebGL y aquí no arrancó (la aceleración por hardware puede estar apagada). Lo que la red dice sigue en pie: las tablas de
          abajo traen sus nodos y sus aristas, y el inspector, la lista completa de cada nodo.
        </EstadoVacio>
      ) : (
        <div className="relative">
          <div
            ref={contenedor}
            tabIndex={0}
            role="application"
            aria-roledescription="lienzo del grafo"
            aria-label="La red de los nodos abiertos. Flechas para ir de un nodo a otro, Enter para abrir sus vecinos, Escape para volver a la lista."
            aria-describedby="lienzo-foco"
            onKeyDown={onTecla}
            onFocus={() => {
              if (!foco && motor.current) enfocarNodo(motor.current.masCentral());
            }}
            className={cn(
              "h-[min(70vh,40rem)] w-full rounded-lg border border-hairline bg-surface outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !dispuesto && "invisible",
            )}
          />
          {!dispuesto && (
            <p className="absolute inset-0 grid place-items-center text-sm text-ink-soft">
              Colocando {formatInt(red.nodos.size)} {red.nodos.size === 1 ? "nodo" : "nodos"}…
            </p>
          )}
          <div className="absolute right-2 top-2 flex gap-1">
            <Button variant="secondary" size="icon-sm" aria-label="Acercar" onClick={() => motor.current?.zoom(1 / 1.5)}>
              <IconPlus className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="icon-sm" aria-label="Alejar" onClick={() => motor.current?.zoom(1.5)}>
              <IconMinus className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="icon-sm" aria-label="Recentrar" onClick={() => motor.current?.camara(null)}>
              <IconEncuadrar className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* La barra del nodo enfocado: lo que se le puede hacer, en palabras. */}
      {!falla && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <p id="lienzo-foco" className="min-w-0 flex-1 text-ink-soft">
            {nodoFoco ? (
              <>
                <span className="font-semibold text-ink">{nodoFoco.titulo}</span> · {etiquetaTipo(nodoFoco)}
                {nodoFoco.expandido && nodoFoco.restantes > 0 && ` · ${formatInt(nodoFoco.restantes)} vecinos más en el inspector`}
              </>
            ) : (
              "Toca un nodo para abrir sus vecinos, o entra con Tab y recorre con las flechas. Arrastrar un nodo lo fija."
            )}
          </p>
          {nodoFoco && (
            <div className="flex flex-wrap gap-1.5">
              {nodoFoco.expandido ? (
                <Button variant="secondary" size="sm" onClick={() => contraerNodo(nodoFoco.ruta)}>
                  Cerrar sus vecinos
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => activar(nodoFoco.ruta)}>
                  Abrir sus vecinos
                </Button>
              )}
              <Button variant="secondary" size="sm" aria-pressed={!!fijados[nodoFoco.ruta]} onClick={() => fijar(nodoFoco.ruta)}>
                {fijados[nodoFoco.ruta] ? "Soltar" : "Fijar"}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => ocultar(nodoFoco.ruta)}>
                Ocultar
              </Button>
              {nodoFoco.tipo && (
                <Button
                  variant="secondary"
                  size="sm"
                  aria-pressed={url.lc === nodoFoco.tipo}
                  onClick={() => soloClase(url.lc === nodoFoco.tipo ? null : nodoFoco.tipo)}
                >
                  {url.lc === nodoFoco.tipo ? "Todas las clases" : "Solo esta clase"}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* La arista señalada (puntero) o enfocada (tecla A): de dónde sale, con su corte y su fuente. */}
      {!falla && (
        <Card data-panel-arista="" className="min-h-11 px-3 py-2 text-sm">
          {aristaVista ? (
            <PanelArista
              arista={aristaVista}
              titulo={titulo}
              fuente={aristaVista.grafo ? (fuentes.get(aristaVista.grafo) ?? null) : null}
              pendiente={procedenciaDe(aristaVista.grafo, fuentes) === "pendiente"}
              enDibujo={enDibujo(aristaVista)}
            />
          ) : (
            <p className="text-ink-soft">
              Toca una arista (o enfoca un nodo y pulsa A) para ver de qué fuente sale y con qué corte.
            </p>
          )}
        </Card>
      )}

      <section aria-labelledby="lienzo-trazos" className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <h3 id="lienzo-trazos" className="rotulo text-ink-soft">
            De dónde salen las aristas
          </h3>
          <Leyenda
            entradas={[
              { clave: "fuente", etiqueta: "Maciza: la publica una fuente del Estado", clase: "bg-ink-soft", forma: "linea", cifra: formatInt(cuentas.fuente) },
              {
                clave: "regla",
                etiqueta: "Punteada: la deriva una regla de Socrático",
                clase: "border-ink-soft",
                forma: "punteada",
                cifra: formatInt(cuentas.regla),
              },
              ...(cuentas.sinDato
                ? [{ clave: "sin-dato", etiqueta: "Maciza, sin fuente en el compilado", clase: "bg-ink-soft", forma: "linea" as const, cifra: formatInt(cuentas.sinDato) }]
                : []),
              ...(cuentas.pendiente
                ? [{ clave: "pendiente", etiqueta: "Maciza, fuente aún no leída", clase: "bg-ink-soft", forma: "linea" as const, cifra: formatInt(cuentas.pendiente) }]
                : []),
            ]}
          />
          <ToggleGroup
            type="single"
            value={soloFuente ? "fuente" : "todo"}
            onValueChange={(v) => {
              if (!v) return;
              void setUrl({ lp: v === "fuente" ? "fuente" : null });
              setAnuncio(
                v === "fuente"
                  ? `Solo lo que publica una fuente: se apartan ${formatInt(cuentas.regla + cuentas.sinDato)} aristas.`
                  : "Con lo que deriva Socrático: se ven todas las aristas.",
              );
            }}
            aria-label="Qué aristas se dibujan según su procedencia"
            className="flex-wrap"
          >
            <ToggleGroupItem value="todo" className="min-h-11 text-xs sm:min-h-9">
              Con lo que deriva Socrático
            </ToggleGroupItem>
            <ToggleGroupItem value="fuente" className="min-h-11 text-xs sm:min-h-9">
              Solo lo que publica una fuente
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-xs leading-relaxed text-ink-soft">
            Las fuentes, sus cortes y lo que dejan fuera, en{" "}
            <Link href="/fuentes" className="text-brand-700 underline">
              /fuentes
            </Link>
            .
          </p>
        </div>

        <div className="space-y-2">
          <h3 id="lienzo-periodo" className="rotulo text-ink-soft">
            Período
          </h3>
          {anios && anios[0] < anios[1] ? (
            <>
              <p className="text-sm text-ink">
                <span className="font-mono tabular-nums">{periodo ? `${Math.max(periodo[0], anios[0])}–${Math.min(periodo[1], anios[1])}` : `${anios[0]}–${anios[1]}`}</span>
                {!periodo && <span className="text-ink-soft"> · todo lo fechado</span>}
              </p>
              <Slider
                min={anios[0]}
                max={anios[1]}
                step={1}
                minStepsBetweenThumbs={0}
                value={[Math.max(periodo?.[0] ?? anios[0], anios[0]), Math.min(periodo?.[1] ?? anios[1], anios[1])]}
                etiquetas={["Desde el año", "Hasta el año"]}
                texto={(v) => String(v)}
                aria-labelledby="lienzo-periodo"
                onValueChange={(v) => setArrastre([v[0], v[1]])}
                onValueCommit={(v) => {
                  setArrastre(null);
                  const entero = v[0] <= anios[0] && v[1] >= anios[1];
                  void setUrl({ lt: entero ? null : [v[0], v[1]] }, { history: "replace" });
                }}
              />
            </>
          ) : (
            <p className="text-sm text-ink-soft">
              {anios ? `Todas las aristas fechadas del lienzo son de ${anios[0]}: no hay período que elegir.` : "Ninguna arista del lienzo trae fecha: no hay período que elegir."}
            </p>
          )}
          <p className="text-xs leading-relaxed text-ink-soft">
            {cuentas.fuera > 0 && (
              <>
                <span className="font-mono tabular-nums text-ink">{formatInt(cuentas.fuera)}</span> {cuentas.fuera === 1 ? "arista fuera" : "aristas fuera"} del
                período.{" "}
              </>
            )}
            {cuentas.sinFecha > 0
              ? `${formatInt(cuentas.sinFecha)} ${cuentas.sinFecha === 1 ? "arista no trae fecha y se queda" : "aristas no traen fecha y se quedan"}.`
              : "Todas las aristas traen fecha."}
            {(url.lt || cuentas.fuera > 0) && (
              <>
                {" "}
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto min-h-11 px-0 text-xs sm:min-h-0"
                  onClick={() => void setUrl({ lt: null }, { history: "replace" })}
                >
                  Ver todo el período
                </Button>
              </>
            )}
          </p>
        </div>
      </section>

      <Clases nodos={nodos} solo={url.lc} onSolo={soloClase} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-soft">
        <span>
          {formatInt(red.nodos.size)} {red.nodos.size === 1 ? "nodo" : "nodos"} y {formatInt(red.aristas.length)}{" "}
          {red.aristas.length === 1 ? "arista" : "aristas"} del grafo compilado
          {apartadas.size > 0 && ` (${formatInt(apartadas.size)} fuera del dibujo: ${[cuentas.fuera ? `${formatInt(cuentas.fuera)} fuera del período` : null, cuentas.porProcedencia ? `${formatInt(cuentas.porProcedencia)} que no publica una fuente` : null].filter(Boolean).join(", ")})`}
          ; cada expansión trae hasta {TOPE_POR_EXPANSION} vecinos repartidos por grupo y el inspector, al lado, los trae todos.
        </span>
        {ocultos.size > 0 && (
          <Button variant="link" size="sm" className="h-auto px-0" onClick={() => void setUrl({ lo: null })}>
            Mostrar {ocultos.size === 1 ? "el oculto" : `los ${formatInt(ocultos.size)} ocultos`}
          </Button>
        )}
        {Object.keys(fijados).length > 0 && (
          <Button variant="link" size="sm" className="h-auto px-0" onClick={() => void setUrl({ lf: null })}>
            Soltar {Object.keys(fijados).length === 1 ? "el fijado" : `los ${formatInt(Object.keys(fijados).length)} fijados`}
          </Button>
        )}
        {fallidas.length > 0 && (
          <Button variant="link" size="sm" className="h-auto px-0" onClick={() => consultas.forEach((c) => c.isError && void c.refetch())}>
            Leer de nuevo
          </Button>
        )}
        {semillasGrandes && (
          <span>
            El enlace de esta vista no guarda sus {formatInt(semillasGrandes.length)} semillas: caben {SEMILLAS_EN_ENLACE}.
          </span>
        )}
        <Button variant="link" size="sm" className="ml-auto h-auto px-0" onClick={cerrar}>
          Volver a la lista
        </Button>
      </div>

      {/* Lo que dice el dibujo, escrito: el dibujo nunca sustituye a la lista. */}
      <VerComoTabla
        className="mx-0 sm:mx-0"
        nombre="nodos"
        columnas={[{ titulo: "Nodo" }, { titulo: "Clase" }, { titulo: "Llegó por" }, { titulo: "Vecinos sin traer", numerica: true }]}
        filas={nodos.map((n) => ({
          clave: n.ruta,
          celdas: [
            <Button key="n" variant="link" size="sm" className="h-auto whitespace-normal px-0 text-left font-sans" onClick={() => activar(n.ruta)}>
              {n.titulo}
            </Button>,
            etiquetaTipo(n),
            n.padre ? titulo(n.padre) : "semilla",
            n.expandido ? formatInt(n.restantes) : "sin abrir",
          ],
        }))}
      />
      <VerComoTabla
        className="mx-0 mt-0 sm:mx-0"
        nombre="aristas"
        columnas={[{ titulo: "De" }, { titulo: "Relación" }, { titulo: "A" }, { titulo: "Fecha" }, { titulo: "Fuente" }, { titulo: "En el dibujo" }]}
        filas={red.aristas.map((a) => ({
          clave: a.clave,
          celdas: [
            titulo(a.de),
            [a.verbo, a.detalle].filter(Boolean).join(" · ") || "—",
            titulo(a.a),
            a.fecha ? formatFecha(a.fecha) : "sin fecha",
            fuenteDe(a.grafo),
            enDibujo(a),
          ],
        }))}
      />

      {aviso && <p className="text-xs text-ink-soft">{aviso}</p>}
      <p role="status" className="sr-only">
        {pendientes.length > 0 ? `Leyendo los vecinos de ${formatInt(pendientes.length)} ${pendientes.length === 1 ? "nodo" : "nodos"}…` : ""}
        {fallidas.length > 0 ? ` No se pudieron leer los vecinos de ${formatInt(fallidas.length)} ${fallidas.length === 1 ? "nodo" : "nodos"}.` : ""}
      </p>
      {(pendientes.length > 0 || fallidas.length > 0) && (
        <p aria-hidden className="text-xs text-ink-soft">
          {pendientes.length > 0 && `Leyendo los vecinos de ${formatInt(pendientes.length)} ${pendientes.length === 1 ? "nodo" : "nodos"}… `}
          {fallidas.length > 0 && `No se pudieron leer los vecinos de ${formatInt(fallidas.length)} ${fallidas.length === 1 ? "nodo" : "nodos"}.`}
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {anuncio}
      </p>
      <p aria-live="polite" className="sr-only">
        {enFoco}
      </p>
    </div>
  );
}

/**
 * Si la dirección de una fuente es una página que se lee, y no la descarga o
 * la API de donde se leyó (la tabla de contratos en CSV, el padrón en ZIP, el
 * SIL): esas no se enlazan, que un toque no arranque una descarga de cientos
 * de MB; su descripción y sus límites están en `/fuentes`.
 */
function esPagina(url: string): boolean {
  return !/\.(csv|zip|json|xlsx?|pdf|gz)(\?|$)|\/api(\/|$|\?)|\/wp-json\/|[?&](type|format)=/i.test(url);
}

/** La arista señalada: sus dos extremos, la relación, el día y de dónde sale, con su corte y su fuente. */
function PanelArista({
  arista,
  titulo,
  fuente,
  pendiente,
  enDibujo,
}: {
  arista: AristaLienzo;
  titulo: (ruta: string) => string;
  fuente: FuenteVista | null;
  pendiente: boolean;
  enDibujo: string;
}) {
  const pagina = fuente?.origen && esPagina(fuente.origen) ? fuente.origen : null;
  return (
    <div className="space-y-1">
      <p className="text-ink">
        <span className="font-semibold">{titulo(arista.de)}</span>
        <span className="text-ink-soft"> · {[arista.verbo, arista.detalle].filter(Boolean).join(" · ") || "se liga con"} · </span>
        <span className="font-semibold">{titulo(arista.a)}</span>
        {arista.fecha && <span className="font-mono text-xs text-ink-soft"> · {formatFecha(arista.fecha)}</span>}
        {enDibujo !== "sí" && <span className="text-xs text-ink-soft"> · {enDibujo}</span>}
      </p>
      <p className="text-xs leading-relaxed text-ink-soft">
        {!fuente ? (
          <>{pendiente ? "Su fuente se dirá cuando se lea uno de sus dos nodos. " : "El grafo compilado no dice de qué fuente sale esta arista. "}</>
        ) : fuente.derivado ? (
          <>
            Punteada: la deriva una regla de Socrático, <span className="text-ink">{fuente.etiqueta}</span>
            {fuente.corte && <>, sobre los datos del {formatFecha(fuente.corte)}</>}.{" "}
          </>
        ) : (
          <>
            Sale de <span className="text-ink">{fuente.etiqueta}</span>
            {fuente.corte && <>, corte del {formatFecha(fuente.corte)}</>}.{" "}
            {pagina && (
              <>
                <a href={pagina} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-700 underline">
                  La página de la fuente
                  <IconExternal className="h-3.5 w-3.5 shrink-0" />
                  <span className="sr-only">(se abre en otra pestaña)</span>
                </a>
                {" · "}
              </>
            )}
          </>
        )}
        <Link href="/fuentes" className="text-brand-700 underline">
          Qué lee la plataforma y con qué límites
        </Link>
      </p>
    </div>
  );
}

/**
 * Las clases del lienzo: la leyenda de las cinco familias con la primitiva
 * (`Leyenda`, cada familia con su punto y su cuenta) y, debajo, los tipos
 * presentes como filtro «solo esta clase» (`ToggleGroup`, uno a la vez,
 * pulsar el puesto lo quita). El tipo va escrito también bajo cada nombre.
 */
function Clases({ nodos, solo, onSolo }: { nodos: NodoLienzo[]; solo: TipoNodoRdf | null; onSolo: (t: TipoNodoRdf | null) => void }) {
  const porTipo = new Map<TipoNodoRdf, number>();
  let otros = 0;
  for (const n of nodos) {
    if (n.tipo) porTipo.set(n.tipo, (porTipo.get(n.tipo) ?? 0) + 1);
    else otros++;
  }
  const entradas: EntradaLeyenda[] = FAMILIAS.map((f) => ({
    clave: f.clave,
    etiqueta: f.etiqueta,
    clase: CATEGORICA[f.paso].bg,
    forma: "punto" as const,
    cifra: formatInt(TIPOS.filter((t) => TIPO[t].familia === f.clave).reduce((s, t) => s + (porTipo.get(t) ?? 0), 0)),
  }));
  if (otros) entradas.push({ clave: "otros", etiqueta: "Otros", clase: OTROS.bg, forma: "punto", cifra: formatInt(otros) });
  const tipos = TIPOS.filter((t) => porTipo.has(t));
  return (
    <section aria-labelledby="lienzo-clases" className="space-y-2">
      <h3 id="lienzo-clases" className="rotulo text-ink-soft">
        Clases en el lienzo
      </h3>
      <Leyenda entradas={entradas} />
      {tipos.length > 1 && (
        <ToggleGroup
          type="single"
          value={solo ?? ""}
          onValueChange={(v) => onSolo(esTipo(v) ? v : null)}
          aria-label="Ver solo una clase"
          className="flex-wrap"
        >
          {tipos.map((t) => (
            <ToggleGroupItem key={t} value={t} className="min-h-11 text-xs sm:min-h-9">
              {TIPO[t].etiqueta}
              <span className="font-mono">{formatInt(porTipo.get(t) ?? 0)}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </section>
  );
}
