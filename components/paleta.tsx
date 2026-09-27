"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BUSQUEDAS, SECCIONES, seccionDe, type DestinoBusqueda } from "@/lib/secciones";
import { INDICE, porTarea, type Destino } from "@/lib/indice";
import { TAREAS } from "@/lib/tareas";
import { getBusquedas, onBusquedasCambio, type Busqueda } from "@/lib/busquedas";
import { getRecientes } from "@/lib/recientes";
import { cn } from "@/lib/cn";
import { IconArrowRight, IconBookmark, IconClock, IconExternal, IconSearch } from "./icons";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

/**
 * La paleta: «¿a dónde vas?» desde cualquier página.
 *
 * Hasta aquí, llegar a una vista de otra vertical costaba recordar en qué
 * vertical vivía —«Perención» cuelga de Congreso, «Planes» de Licitaciones—,
 * abrirla y buscar la pestaña; y buscar un texto fuera de licitaciones costaba
 * saber que proveedores y las dos cámaras tienen su propio campo. La paleta
 * sostiene eso por el lector (docs/IDENTIDAD.md §3, reconocer y no recordar):
 * toda la arquitectura de `lib/secciones` en una lista que se filtra al
 * teclear, y el texto tecleado ofrecido a **cada** búsqueda de la plataforma.
 * La lista es el índice de `lib/indice.ts`, agrupado por tarea.
 *
 * Lo que no hace es fingir un índice de todo. El de la plataforma
 * (`lib/busqueda.ts`: instituciones, legisladores, proveedores, procesos del
 * último año, leyes y normativa, iniciativas de Diputados, sentencias, obras,
 * documentos, datos abiertos y cargos, por palabra y por tema) sugiere sus
 * primeras filas en «En la plataforma»; lo que vive fuera de él —las
 * licitaciones más viejas, el Senado, lo publicado después de cada
 * instantánea— no se finge: lo tecleado se ofrece a cada destino y cada fila
 * dice debajo qué recorre; «Toda la plataforma» (`/buscar`) encabeza y
 * declara igual su alcance. Es la trampa del campo de
 * licitaciones que vivía en la cabecera, evitada al revés: el alcance no se
 * esconde tras un campo único, se declara en cada opción.
 *
 * Se abre con el botón del header, con ⌘K / Ctrl K y con «/» fuera de un
 * campo, que es la tecla que la web ya enseñó para buscar.
 */
/** Una fila de `/api/buscar`. */
/** Una pantalla que contesta lo tecleado por su significado (`/api/buscar`). */
interface PantallaSugerida {
  href: string;
  titulo: string;
  nota: string;
  pregunta: string | null;
}

interface Sugerida {
  tipo: string;
  etiqueta: string;
  titulo: string;
  detalle: string | null;
  href: string | null;
  externo: boolean;
  via: "palabra" | "tema" | "ambas";
}

export default function Paleta() {
  const router = useRouter();
  const pathname = usePathname();
  const actual = seccionDe(pathname);

  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState("");
  const [recientes, setRecientes] = useState<string[]>([]);
  const [guardadas, setGuardadas] = useState<Busqueda[]>([]);
  const [atajo, setAtajo] = useState("Ctrl K");

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setAtajo("⌘K");
    const sync = () => setGuardadas(getBusquedas());
    sync();
    return onBusquedasCambio(sync);
  }, []);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierta((v) => !v);
        return;
      }
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      // «/» dentro de un campo es una barra que se está escribiendo.
      if (el?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      setAbierta(true);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);

  // Al abrir: lo tecleado la vez anterior no sirve, lo reciente sí.
  useEffect(() => {
    if (!abierta) return;
    setTexto("");
    setRecientes(getRecientes());
  }, [abierta]);

  // Lo que el índice de la plataforma encuentra (`/api/buscar`), pedido al
  // servidor a medida que se teclea: el corpus y el modelo no viajan al
  // navegador.
  // Van con la consulta que las trajo: al seguir tecleando, las de la
  // anterior se dejan de ver en el acto. Antes seguían en pantalla bajo el
  // texto nuevo y un Intro rápido abría un resultado de «agua potable»
  // buscando «MINERD».
  const [sugeridasDe, setSugeridasDe] = useState<{ q: string; lista: Sugerida[]; pantallas: PantallaSugerida[] }>({
    q: "",
    lista: [],
    pantallas: [],
  });
  // «No respondió» no es «no hay nada»: se dice, en una línea.
  const [fallo, setFallo] = useState(false);
  useEffect(() => {
    const q = texto.trim();
    setFallo(false);
    if (!abierta || q.length < 2) {
      setSugeridasDe({ q: "", lista: [], pantallas: [] });
      return;
    }
    const control = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/buscar?q=${encodeURIComponent(q)}&n=6`, { signal: control.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((r: { resultados?: Sugerida[]; pantallas?: PantallaSugerida[] } | null) => {
          setFallo(r === null);
          setSugeridasDe({
            q,
            lista: Array.isArray(r?.resultados) ? r.resultados.filter((s) => s.href) : [],
            pantallas: Array.isArray(r?.pantallas) ? r.pantallas : [],
          });
        })
        .catch((err: unknown) => {
          // Abortar al seguir tecleando no es una caída.
          if ((err as { name?: string })?.name !== "AbortError") setFallo(true);
        });
    }, 180);
    return () => {
      clearTimeout(t);
      control.abort();
    };
  }, [texto, abierta]);

  const ir = (href: string) => {
    setAbierta(false);
    router.push(href);
  };
  // Un documento o un conjunto de datos vive en el sitio de su institución.
  const abrir = (s: Sugerida) => {
    if (!s.href) return;
    if (!s.externo) return ir(s.href);
    setAbierta(false);
    window.open(s.href, "_blank", "noopener,noreferrer");
  };

  const consulta = texto.trim();
  const sugeridas = sugeridasDe.q === consulta ? sugeridasDe.lista : [];
  // Las pantallas que el índice halló por significado, salvo las que ya
  // salen arriba porque lo tecleado las nombra.
  const pantallas =
    sugeridasDe.q === consulta
      ? sugeridasDe.pantallas.filter((p) => {
          const d = INDICE.find((x) => x.href === p.href);
          return !d || !coincide(consulta, claves(d));
        })
      : [];
  const sinSeccion = !!consulta && !INDICE.some((d) => coincide(consulta, claves(d)));

  // La búsqueda de la vertical en la que ya está el lector va primero: es la
  // que más probablemente quería.
  // «Toda la plataforma» encabeza siempre: es la que no exige saber dónde vive
  // lo buscado.
  const peso = (d: DestinoBusqueda) =>
    d.href === "/buscar" ? 2 : Number(!!actual && d.seccion === actual.id);
  const destinos = [...BUSQUEDAS].sort((a, b) => peso(b) - peso(a));

  return (
    <Dialog open={abierta} onOpenChange={setAbierta}>
      <DialogTrigger
        aria-keyshortcuts="Meta+K Control+K /"
        /*
          El mismo mando en todas las páginas y en todas las anchuras, con su
          nombre escrito: «Buscar». Antes era una lupa sola en el teléfono y
          «Ir a…» en escritorio, y en compras cedía su sitio a un campo que
          solo buscaba licitaciones. El filete lo distingue de los enlaces del
          megamenú: es la caja donde se escribe, no un destino más.
        */
        className={cn(
          buttonVariants({ variant: "tinta", size: "default" }),
          "gap-2 px-3 text-canvas/80 ring-1 ring-inset ring-canvas/20 lg:h-8 lg:px-2.5 lg:text-[13px] lg:font-medium",
        )}
      >
        <IconSearch className="h-5 w-5 lg:h-4 lg:w-4" />
        <span>Buscar</span>
        <kbd className="hidden rounded-sm border border-canvas/25 px-1 font-mono text-[11px] text-canvas/65 xl:inline">
          {atajo}
        </kbd>
      </DialogTrigger>

      <DialogContent conCierre="telefono" aria-describedby="paleta-ayuda">
        <DialogTitle className="sr-only">Ir a una sección o buscar</DialogTitle>
        <DialogDescription id="paleta-ayuda" className="sr-only">
          Escribe el nombre de una sección o el texto que buscas. Flechas para
          recorrer, Intro para abrir, Escape para cerrar.
        </DialogDescription>

        <Command
          /*
            El filtro propio existe por una sola razón: las filas de «Buscar en…»
            no son opciones que se filtran, son el destino de lo tecleado, y
            tienen que seguir ahí con cualquier texto. El resto se filtra por
            subcadena normalizada —sin tildes, sin mayúsculas—, que es como
            teclea alguien en el teléfono: «nomina» encuentra «Nómina». Dentro
            de un grupo cmdk ordena por puntuación; entre grupos manda el
            marcado.
          */
          filter={(valor, busqueda, claves = []) => {
            if (valor.startsWith("buscar:")) return 1;
            // Solo las claves: el `value` lleva un prefijo técnico («ir:/…»)
            // y teclear «ir» encendía todas las filas. Las dos primeras claves
            // son el nombre de la fila; lo demás —la pregunta, el descriptor—
            // también encuentra, pero detrás: «senado» tiene que dar primero
            // «Congreso · Senado» y no «Diputados», cuyo descriptor lo nombra.
            if (coincide(busqueda, claves.slice(0, 2))) return 1;
            return coincide(busqueda, claves) ? 0.5 : 0;
          }}
          className="min-h-0 flex-1"
        >
          <CommandInput
            value={texto}
            onValueChange={setTexto}
            placeholder="Una sección, o lo que buscas…"
            enterKeyHint="go"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            // En el teléfono el aspa de cerrar vive al final de esta fila.
            className="pr-10 sm:pr-0"
          />
          <CommandList>
            {!consulta && (guardadas.length > 0 || recientes.length > 0) && (
              <>
                <CommandGroup heading="Tus búsquedas de licitaciones">
                  {guardadas.slice(0, 4).map((b) => (
                    <CommandItem
                      key={b.id}
                      value={`guardada:${b.id}`}
                      keywords={[b.nombre]}
                      onSelect={() => ir(`/licitaciones${b.qs ? `?${b.qs}` : ""}`)}
                    >
                      <IconBookmark className="h-4 w-4 text-brand-600" filled />
                      <span className="truncate font-medium">{b.nombre}</span>
                      <span className="ml-auto shrink-0 text-xs text-ink-soft">Guardada</span>
                    </CommandItem>
                  ))}
                  {recientes.slice(0, 3).map((t) => (
                    <CommandItem
                      key={t}
                      value={`reciente:${t}`}
                      keywords={[t]}
                      onSelect={() => ir(`/licitaciones?q=${encodeURIComponent(t)}`)}
                    >
                      <IconClock className="h-4 w-4 text-ink-soft" />
                      <span className="truncate">{t}</span>
                      <span className="ml-auto shrink-0 text-xs text-ink-soft">Reciente</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {/*
              El índice entero, agrupado por lo que el lector viene a hacer
              (`lib/tareas.ts`) y no por tema: el tema ya lo ordena el menú.
              Seis grupos, cada destino con su línea de qué hay detrás.
            */}
            {porTarea().map(({ tarea, etiqueta, destinos }) => (
              <CommandGroup key={tarea} heading={etiqueta}>
                {destinos.map((d) => (
                  <CommandItem
                    key={d.href}
                    value={`ir:${d.href}`}
                    keywords={claves(d)}
                    onSelect={() => ir(d.href)}
                  >
                    <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", d.punto)} />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{d.label}</span>
                      <span className="text-ink-soft"> · {d.tema}</span>
                    </span>
                    <span className="hidden max-w-[45%] shrink-0 truncate text-xs text-ink-soft sm:inline">
                      {d.nota}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            {/*
              Lo encontrado, de cualquier tipo, ya ordenado por el índice: la
              fila dice de qué tipo es y, si no lleva las palabras tecleadas,
              que salió por tema. Todo lo demás está a un Intro en «Toda la
              plataforma».
            */}
            {consulta && pantallas.length > 0 && (
              <CommandGroup heading="Pantallas que lo responden">
                {pantallas.map((p) => (
                  <CommandItem key={p.href} value={`buscar:pan:${p.href}`} onSelect={() => ir(p.href)}>
                    <IconArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{p.titulo}</span>
                      <span className="hidden text-ink-soft sm:inline"> · {p.pregunta ?? p.nota}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {consulta && sugeridas.length > 0 && (
              <CommandGroup heading="En la plataforma">
                {sugeridas.map((s, n) => (
                  <CommandItem
                    key={`${n}:${s.href}`}
                    value={`buscar:res:${n}:${s.href}`}
                    onSelect={() => abrir(s)}
                  >
                    <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{s.titulo}</span>
                      {s.detalle && <span className="hidden text-ink-soft sm:inline"> · {s.detalle}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-ink-soft">
                      {s.via === "tema" ? `${s.etiqueta} · por tema` : s.etiqueta}
                    </span>
                    {s.externo && <IconExternal className="h-3.5 w-3.5 shrink-0 text-ink-soft" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {consulta && fallo && (
              <p className="px-2.5 pb-1 pt-2 text-xs text-alerta-700">
                La búsqueda en la plataforma no respondió: no es que no haya
                nada. «Toda la plataforma», abajo, lo vuelve a intentar.
              </p>
            )}

            {/*
              «Buscar en…» va al final y no arriba. Si lo tecleado nombra una
              sección —«nomina», «senado»—, esa sección es la primera fila y es
              adonde lleva Intro; si no nombra ninguna, las secciones se filtran
              fuera y los destinos de búsqueda quedan solos, primeros. Se probó
              arriba con menor puntuación y cmdk no reordenó los grupos: el
              orden se decide aquí, en el marcado.
            */}
            {consulta && (
              <>
                {/*
                  Las filas de búsqueda nunca se filtran, así que la lista nunca
                  queda vacía y un `CommandEmpty` no se pintaría jamás. Que el
                  texto no nombra ninguna sección se dice aquí, a mano.
                */}
                {sinSeccion ? (
                  <p className="px-2.5 pb-1 pt-2 text-xs text-ink-soft">
                    Ninguna sección se llama así. Elige dónde buscarlo:
                  </p>
                ) : (
                  <CommandSeparator />
                )}
                <CommandGroup heading={`Buscar «${consulta}» en…`}>
                  {destinos.map((d) => (
                    <FilaBusqueda
                      key={d.href}
                      destino={d}
                      onElegir={() =>
                        ir(`${d.href}?q=${encodeURIComponent(consulta)}`)
                      }
                    />
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>

          {/*
            El pie dice cómo se maneja, solo donde hay teclado. En el teléfono
            sobra: se toca.
          */}
          <div className="hidden shrink-0 items-center gap-4 border-t border-hairline px-4 py-2 text-[11px] text-ink-soft sm:flex">
            <span><CommandShortcut className="ml-0 mr-1">↑↓</CommandShortcut>recorrer</span>
            <span><CommandShortcut className="ml-0 mr-1">Intro</CommandShortcut>abrir</span>
            <span><CommandShortcut className="ml-0 mr-1">Esc</CommandShortcut>cerrar</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/** Una fila de «Buscar en…»: el destino y, debajo, qué recorre. */
function FilaBusqueda({
  destino,
  onElegir,
}: {
  destino: DestinoBusqueda;
  onElegir: () => void;
}) {
  const seccion = SECCIONES.find((s) => s.id === destino.seccion);
  return (
    <CommandItem value={`buscar:${destino.href}`} onSelect={onElegir} className="items-start">
      <span
        aria-hidden
        className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", seccion?.hue.punto ?? "bg-ink")}
      />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{destino.etiqueta}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
          {destino.alcance}
        </span>
      </span>
      <IconArrowRight className="mt-0.5 h-4 w-4 text-ink-soft" />
    </CommandItem>
  );
}

/**
 * Las claves de un destino, en orden de peso: las dos primeras son su nombre
 * (el filtro las pone delante); después la línea de qué hay, la pregunta de
 * su vertical y las palabras de su tarea, para que «votar» o «comparar»
 * encuentren aunque no sean el nombre de nada.
 */
function claves(d: Destino): string[] {
  const seccion = SECCIONES.find((s) => s.id === d.seccion);
  return [
    d.label,
    d.tema,
    d.nota,
    d.grupo,
    ...(seccion ? [seccion.nombre, seccion.pregunta] : []),
    ...TAREAS[d.tarea].claves,
  ];
}

/** ¿Aparecen todas las palabras de lo tecleado, sin tildes ni mayúsculas? */
function coincide(busqueda: string, textos: string[]) {
  const heno = normalizar(textos.join(" "));
  return normalizar(busqueda)
    .split(/\s+/)
    .filter(Boolean)
    .every((palabra) => heno.includes(palabra));
}

function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
