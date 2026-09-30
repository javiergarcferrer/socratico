"use client";

import { useId } from "react";
import { IconSearch, IconX } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ErrorCampo } from "@/components/ui/error-campo";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

/**
 * El campo de búsqueda de la plataforma — uno, no cuatro.
 *
 * Estaba escrito tres veces (licitaciones, proveedores, congreso) con tres
 * alturas, dos radios y dos azules distintos en el botón, y solo uno de los
 * tres ofrecía borrar lo tecleado. Es el patrón de dilución que documenta
 * `docs/IDENTIDAD.md` §8: donde no hay primitiva compartida, la idea se
 * reimplementa en cada sitio y cada copia se desvía un poco.
 *
 * Dos decisiones son de la casa y viajan con la pieza:
 *
 *  · **La ayuda va debajo del campo, siempre que exista.** Los alcances de
 *    búsqueda de esta plataforma son muy distintos entre sí —el RNC busca en el
 *    registro entero, el nombre solo entre quienes ganaron algo hace poco— y
 *    quien va a teclear necesita saberlo *antes*, no después de leer «sin
 *    resultados» (ergonomía §6: un control explica su alcance antes del toque).
 *  · **Borrar es un botón con nombre**, no un aspa muda, y solo aparece cuando
 *    hay algo que borrar.
 *
 * Una búsqueda que solo acepta una forma —un número de caso, un número de
 * expediente— dice por qué no vale **junto al campo** (`error`, con
 * `ErrorCampo`, `aria-invalid` y `aria-describedby`: docs/DESIGN.md §1.2), no en
 * una pantalla de «sin resultados» que haría creer que se buscó.
 */
export function CampoBusqueda({
  valor,
  onValor,
  onEnviar,
  onLimpiar,
  etiqueta,
  placeholder,
  ayuda,
  pendiente = false,
  textoBoton = "Buscar",
  name = "q",
  error,
  className,
}: {
  valor: string;
  onValor: (v: string) => void;
  /** Qué hacer al enviar. Recibe el texto ya recortado. */
  onEnviar: (valor: string) => void;
  /** Si se pasa, aparece el botón de borrar. */
  onLimpiar?: () => void;
  /** Para lector de pantalla: «Buscar un proveedor del Estado». */
  etiqueta: string;
  placeholder?: string;
  /** La línea en llano que dice **qué alcance tiene** esta búsqueda. */
  ayuda?: React.ReactNode;
  pendiente?: boolean;
  textoBoton?: string;
  name?: string;
  /**
   * Por qué lo escrito no vale. Si el campo valida, se pasa siempre —`null`
   * cuando no hay nada que decir—: la región viva tiene que existir antes de
   * llenarse para que el lector de pantalla la anuncie.
   */
  error?: string | null;
  className?: string;
}) {
  const ayudaId = useId();
  const errorId = useId();
  const describe = [error !== undefined && errorId, ayuda && ayudaId].filter(Boolean).join(" ") || undefined;

  return (
    <form
      role="search"
      aria-busy={pendiente}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        onEnviar(valor.trim());
      }}
    >
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <IconSearch
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft"
          />
          <Input
            type="search"
            name={name}
            value={valor}
            onChange={(e) => onValor(e.target.value)}
            placeholder={placeholder}
            aria-label={etiqueta}
            aria-describedby={describe}
            aria-invalid={error ? true : undefined}
            enterKeyHint="search"
            className={cn("pl-9", onLimpiar && valor ? "pr-12 sm:pr-10" : "pr-3")}
          />
          {onLimpiar && valor && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onLimpiar}
              // El campo mide 44 px en el teléfono, así que el aspa cabe entera
              // dentro: a 32 × 32 se fallaba y se acababa borrando a mano.
              className="absolute right-0.5 top-1/2 h-11 w-11 -translate-y-1/2 text-ink-soft sm:right-1 sm:h-8 sm:w-8"
            >
              <IconX className="h-4 w-4" />
              <span className="sr-only">Limpiar la búsqueda</span>
            </Button>
          )}
        </div>
        {/*
          A 390 px el botón con su palabra dejaba el campo en 190 px y el
          marcador de posición salía cortado —«Buscar en el texto de las inic»—,
          justo la línea que dice qué se va a buscar. En el teléfono el botón se
          queda en el icono (44 × 44, y su nombre sigue ahí para el lector de
          pantalla y para quien lo mantenga pulsado) y recupera la palabra desde
          `sm`, donde el ancho da para las dos cosas.
        */}
        <Button
          type="submit"
          disabled={pendiente}
          title={pendiente ? "Buscando…" : textoBoton}
          className="w-11 shrink-0 px-0 sm:w-auto sm:px-4"
        >
          <IconSearch aria-hidden className="h-4 w-4 sm:hidden" />
          <span className="sr-only sm:not-sr-only">
            {pendiente ? "Buscando…" : textoBoton}
          </span>
        </Button>
      </div>
      {error !== undefined && (
        <ErrorCampo id={errorId} className="mt-2 leading-relaxed">
          {error}
        </ErrorCampo>
      )}
      {ayuda && (
        <p id={ayudaId} className="mt-2 text-xs leading-relaxed text-ink-soft">
          {ayuda}
        </p>
      )}
    </form>
  );
}
