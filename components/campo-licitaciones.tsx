"use client";

import Link from "next/link";
import { useQueryStates } from "nuqs";
import { useEffect, useRef, useState } from "react";
import { getRecientes, pushReciente } from "@/lib/recientes";
import {
  addBusqueda,
  getBusquedas,
  onBusquedasCambio,
  removeBusqueda,
  type Busqueda,
} from "@/lib/busquedas";
import { BUSQUEDAS } from "@/lib/secciones";
import { FILTROS_LICITACIONES } from "@/components/licitaciones-url";
import { Input } from "@/components/ui/input";
import {
  IconBookmark,
  IconCheck,
  IconClock,
  IconCoins,
  IconSearch,
  IconSparkles,
  IconTrash,
  IconX,
} from "./icons";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";

/**
 * El campo de texto del buscador de licitaciones, con sus filtros rápidos,
 * recientes y guardadas.
 *
 * Vivía en la cabecera, y solo en compras: la misma franja del chrome buscaba
 * toda la plataforma en unas páginas y solo procesos de la DGCP en otras, y en
 * el teléfono se comía la marca. Ahora la cabecera es siempre la búsqueda de
 * toda la plataforma (`components/paleta.tsx`) y este campo vive dentro de
 * `/licitaciones`, debajo del titular, con su alcance escrito debajo —la
 * misma frase que la paleta pone junto al destino, sacada de `BUSQUEDAS`—.
 *
 * Sigue manejando el buscador solo a través de la URL, que es la fuente de
 * verdad de la página: teclear pone `?q=`, un filtro rápido pone o quita
 * parámetros, y una guardada navega a su querystring entero. Lee y escribe
 * con `nuqs` y el mismo mapa de parámetros que el buscador
 * (`components/licitaciones-url.ts`); solo se monta dentro de `/licitaciones`.
 */
const BUSCADOR = "/licitaciones";

const ALCANCE = BUSQUEDAS.find((b) => b.href === BUSCADOR)?.alcance;

export default function CampoLicitaciones() {
  const [url, setUrl] = useQueryStates(FILTROS_LICITACIONES);
  /*
    Este campo solo vive en el buscador, así que el `?q=` que refleja es
    siempre el de licitaciones. Otras vistas de la vertical usan el mismo
    nombre de parámetro para su propia búsqueda —`/proveedores?q=` busca en el
    registro de proveedores—, y por eso el campo no se monta fuera de aquí.
  */
  const spq = url.q;

  const [text, setText] = useState(spq);
  const [open, setOpen] = useState(false);
  const [recientes, setRecientes] = useState<string[]>([]);
  const [busquedas, setBusquedas] = useState<Busqueda[]>([]);
  const focused = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecientes(getRecientes());
    const sync = () => setBusquedas(getBusquedas());
    sync();
    return onBusquedasCambio(sync);
  }, []);

  // La URL manda sobre el campo, salvo mientras se teclea en él.
  useEffect(() => {
    if (!focused.current) setText(spq);
  }, [spq]);

  /*
    Buscar mientras se teclea, con 400 ms de espera: el texto es estado local
    y solo pasa a `?q=` cuando el dedo se detiene. La espera vive aquí y no en
    `nuqs` (que sabe retrasar la URL, pero no el estado que comparte con el
    buscador): así el listado sigue sin enterarse de cada tecla.
  */
  useEffect(() => {
    if (text === spq) return;
    const t = setTimeout(() => {
      ponerTexto(text);
      if (text.trim().length >= 3) setRecientes(pushReciente(text.trim()));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, spq]);

  /** Un texto nuevo es una búsqueda nueva: vuelve a la primera página. */
  function ponerTexto(v: string) {
    setUrl({ q: v.trim() || null, page: null });
  }

  /** El aspa del campo: borra el texto y solo el texto; los filtros se quedan. */
  function limpiarTexto() {
    setText("");
    ponerTexto("");
  }

  /** «Abiertas ahora»: la búsqueda con que abre la página, sin nada puesto. */
  function reset() {
    setText("");
    setUrl(null);
  }

  function aplicarTermino(term: string) {
    setText(term);
    ponerTexto(term);
    if (term.trim().length >= 3) setRecientes(pushReciente(term.trim()));
    setOpen(false);
    inputRef.current?.blur();
  }

  /*
    Una guardada sí es una navegación —se apila en el historial y «atrás»
    vuelve a la búsqueda de antes—, y su querystring es crudo: puede traer el
    `?estado=` de entonces, que el buscador traduce al leerlo. Por eso es un
    enlace y no un botón: se abre en otra pestaña y se copia como cualquiera.
  */
  const hrefGuardada = (b: Busqueda) => `${BUSCADOR}${b.qs ? `?${b.qs}` : ""}`;

  function guardarActual() {
    const qs = typeof window !== "undefined"
      ? window.location.search.replace(/^\?/, "")
      : "";
    setBusquedas(addBusqueda(text.trim() || spq || "Búsqueda", qs));
  }

  const presets: { label: string; Icon: typeof IconClock; run: () => void }[] = [
    { label: "Abiertas ahora", Icon: IconSparkles, run: reset },
    {
      // Borrar la etapa devuelve el filtro a su valor inicial —abiertos a
      // ofertar—, igual que antes borrar `estado` devolvía «Proceso publicado».
      // Lo que hacía que este preset abriera con plazos ya vencidos era el
      // orden, no el filtro, y se arregla en `ordenar` (lib/dgcp.ts).
      label: "Cierran pronto",
      Icon: IconClock,
      run: () => setUrl({ etapa: null, estado: null, orden: "cierre", page: null }),
    },
    {
      label: "Ya cerraron",
      Icon: IconCheck,
      run: () => setUrl({ etapa: "cerrados", estado: null, orden: null, page: null }),
    },
    {
      label: "Mayor monto",
      Icon: IconCoins,
      run: () => setUrl({ orden: "monto_desc", page: null }),
    },
    {
      label: "Para MIPYMES",
      Icon: IconSparkles,
      run: () => setUrl({ etapa: null, estado: null, mipyme: true, page: null }),
    },
  ];

  return (
    /*
      El panel de sugerencias es un `Popover` de Radix y no un `div` absoluto
      con un escucha de `mousedown` en el documento, que es como estaba. Lo que
      se gana no es el aspecto: es el cierre con Escape, el `aria-expanded` y
      la relación entre campo y panel para un lector de pantalla, y que al
      cerrar el foco vuelva donde estaba. `onOpenAutoFocus` se cancela a
      propósito — el foco tiene que quedarse en el campo mientras se teclea—, y
      `modal={false}` deja la página detrás viva.
    */
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <div role="search">
        <PopoverAnchor asChild>
          <div className="relative">
            <IconSearch
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft"
            />
            <Input
              ref={inputRef}
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => {
                focused.current = true;
                setOpen(true);
              }}
              onBlur={() => {
                focused.current = false;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") aplicarTermino(text);
                if (e.key === "Escape") {
                  setOpen(false);
                  inputRef.current?.blur();
                }
              }}
              placeholder="Buscar en las licitaciones…"
              aria-label="Buscar en las licitaciones"
              aria-describedby={ALCANCE ? "alcance-licitaciones" : undefined}
              enterKeyHint="search"
              autoComplete="off"
              className={text ? "pl-9 pr-12 sm:pr-10" : "pl-9 pr-3"}
            />
            {text && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  limpiarTexto();
                  inputRef.current?.focus();
                }}
                // El campo mide 44 px en el teléfono: el aspa cabe entera.
                className="absolute right-0.5 top-1/2 h-11 w-11 -translate-y-1/2 text-ink-soft sm:right-1 sm:h-8 sm:w-8"
              >
                <IconX className="h-4 w-4" />
                <span className="sr-only">Limpiar la búsqueda</span>
              </Button>
            )}
          </div>
        </PopoverAnchor>
        {ALCANCE && (
          <p id="alcance-licitaciones" className="mt-1.5 text-xs leading-relaxed text-ink-soft">
            {ALCANCE}
          </p>
        )}
      </div>

      {/*
        Tres medidas gobiernan este panel en el teléfono y las tres se midieron
        a 390 px:

         · `collisionPadding` 12: sin él, Radix empujaba el panel contra el
           borde derecho —quedaba con 32 px de aire a la izquierda y 0 a la
           derecha—, y un panel pegado a un lado se lee como cortado.
         · El ancho descuenta 1,5 rem para que los dos márgenes existan.
         · `100dvh` y no `vh`: al enfocar el campo, el teclado de iOS reduce la
           altura visible y `vh` sigue midiendo la pantalla entera, así que el
           panel se metía debajo del teclado. Los 13 rem que se restan son el
           header (4 rem), la tab bar (4,5 rem) y el aire de arriba y abajo.
      */}
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={12}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex max-h-[min(32rem,calc(100dvh-13rem))] w-[min(36rem,calc(100vw-1.5rem))] flex-col overflow-y-auto overscroll-contain p-0 shadow-pop"
      >
        <div className="border-b border-hairline p-2">
          <p className="rotulo px-2 pb-1 pt-1 text-ink-soft">Filtros rápidos</p>
          <div className="flex flex-wrap gap-1.5 p-1">
            {presets.map((p) => (
              <Button
                key={p.label}
                variant="secondary"
                size="sm"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  p.run();
                  setOpen(false);
                }}
                // Los 36 px de `size="sm"` son para una fila con puntero; aquí
                // se pulsan con el pulgar, así que 40 en el teléfono.
                className="h-10 bg-canvas font-medium hover:bg-brand-50 hover:text-brand-700 sm:h-9"
              >
                <p.Icon className="h-3.5 w-3.5" />
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {recientes.length > 0 && (
          <div className="border-b border-hairline p-1.5">
            <p className="rotulo px-2.5 pb-1 pt-1 text-ink-soft">Recientes</p>
            {recientes.slice(0, 5).map((t) => (
              <button
                key={t}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => aplicarTermino(t)}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-canvas sm:min-h-0"
              >
                <IconClock className="h-4 w-4 shrink-0 text-ink-soft" />
                <span className="truncate">{t}</span>
              </button>
            ))}
          </div>
        )}

        <div className="p-1.5">
          <div className="flex items-center justify-between px-2.5 pb-1 pt-1">
            <span className="rotulo text-ink-soft">Guardadas</span>
            <Button
              variant="link"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={guardarActual}
              // Era un enlace de 16 px de alto: imposible de acertar con el
              // pulgar. El texto no crece; crece el área que lo rodea.
              className="-mr-2 h-11 gap-1 px-2 text-xs sm:h-8"
            >
              <IconBookmark className="h-3.5 w-3.5" />
              Guardar actual
            </Button>
          </div>
          {busquedas.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-ink-soft">
              Aún no tienes búsquedas guardadas.
            </p>
          ) : (
            /*
              La lista ya no lleva su propio `max-h`: con el panel entero
              desplazándose, un segundo marco de desplazamiento dentro del
              primero es una trampa táctil —el dedo mueve uno u otro según
              dónde caiga— y nunca se sabe cuál.
            */
            <ul>
              {busquedas.map((b) => (
                <li key={b.id} className="flex items-center gap-1">
                  <Link
                    href={hrefGuardada(b)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setOpen(false)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-canvas sm:min-h-0"
                  >
                    <IconBookmark className="h-4 w-4 shrink-0 text-brand-600" filled />
                    <span className="truncate font-medium">{b.nombre}</span>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setBusquedas(removeBusqueda(b.id))}
                    // Borrar es irreversible: si el objetivo es pequeño se
                    // acierta por accidente. 44 px en el teléfono.
                    className="h-11 w-11 shrink-0 text-ink-soft hover:bg-canvas hover:text-ink sm:h-9 sm:w-9"
                  >
                    <IconTrash className="h-4 w-4" />
                    <span className="sr-only">Eliminar «{b.nombre}»</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
