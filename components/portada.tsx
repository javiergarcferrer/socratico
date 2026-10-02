import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * La portada de una vertical: la banda de tinta con la pregunta.
 *
 * Es **tinta plana** con la trama de papel milimetrado, nunca un degradado
 * (docs/INFRAESTRUCTURA.md §11), y su epígrafe lleva el punto en rojo sello, que es la
 * regla única de la marca. El titular es una pregunta y va en la letra de
 * titular (Geist): la pregunta la hace la plataforma y la responden los datos de abajo.
 *
 * Estaba copiada en siete páginas —siete veces la misma trama, el mismo punto y
 * el mismo `p-6 sm:p-8`— con las diferencias que era de esperar: titulares a
 * dos tamaños distintos y párrafos separados unas veces `mt-1.5` y otras
 * `mt-3`. Ahora la portada es una y las páginas solo traen su pregunta.
 */
export function Portada({
  rotulo,
  titulo,
  descripcion,
  aviso,
  children,
  principal = false,
  className,
}: {
  /** El epígrafe en versalitas: la fuente y su corte. */
  rotulo: ReactNode;
  /** La pregunta. */
  titulo: ReactNode;
  /** El párrafo que explica qué se está mirando. */
  descripcion?: ReactNode;
  /** Segunda línea de rótulo, en ocre: el alcance de una muestra, un límite. */
  aviso?: ReactNode;
  /** Lo que va debajo: la tira de cifras, los botones. */
  children?: ReactNode;
  /**
   * La portada del panorama, que es la primera pantalla de la plataforma:
   * respira un poco más y su pregunta es la más grande del sitio. Una sola
   * página la lleva.
   */
  principal?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-lg bg-ink text-canvas",
        className,
      )}
    >
      <div className="absolute inset-0 app-grid-dark" aria-hidden />
      {/*
        24 px de margen en el teléfono contra los 32/36 de pantalla ancha. A
        390 px eso deja 310 px de caja de texto: por debajo, la pregunta
        empieza a partirse en tres renglones y deja de leerse como una
        frase.
      */}
      <div className={cn("relative p-6", principal ? "sm:p-9" : "sm:p-8")}>
        <p className="rotulo inline-flex items-start gap-2 text-canvas/70">
          <span
            aria-hidden
            className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-sello-400"
          />
          <span>{rotulo}</span>
        </p>

        {/*
          El aviso iba en `text-alerta-200` con el punto en `bg-alerta-400`, y
          **ninguno de los dos tonos existe**: la paleta ocre de
          `app/globals.css` tiene 50, 100, 500, 600 y 700. Tailwind no genera la
          utilidad que no tiene token, así que la línea heredaba el papel del
          resto de la portada y el punto no se pintaba nunca — el aviso llevaba
          meses sin ser ocre y sin tener punto. Con `alerta-100` (#f0e0bc) sobre
          la tinta el contraste pasa de 12:1 y el matiz se lee como lo que es:
          una anotación al margen.
        */}
        {aviso && (
          <p className="rotulo mt-3 flex items-start gap-2 text-alerta-100">
            <span
              aria-hidden
              className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-alerta-100"
            />
            <span>{aviso}</span>
          </p>
        )}

        <h1
          className={cn(
            "mt-4 max-w-3xl font-display leading-[1.1]",
            principal ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl",
          )}
        >
          {titulo}
        </h1>

        {descripcion && (
          <div className="mt-2 max-w-2xl text-sm leading-relaxed text-canvas/70">
            {descripcion}
          </div>
        )}

        {children && <div className="mt-6">{children}</div>}
      </div>
    </section>
  );
}

/** La tira de cifras de una portada: casillas sobre la tinta. */
export function PortadaCifras({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  /*
    `auto-rows-fr` iguala la altura de **todas** las filas, no solo la de las
    casillas de una misma fila. A 390 px cada casilla tiene 117 px de texto
    útil y un monto formateado («RD$ 1.15 billones») cae en dos líneas: sin
    esto, la fila de arriba crecía y la de abajo no, y la tira —que existe
    justamente para que las cifras se comparen entre sí— se leía como dos
    bloques distintos.
  */
  return (
    <dl className={cn("grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-4", className)}>
      {children}
    </dl>
  );
}

/**
 * Una cifra sobre la tinta. Todas en mono tabular —se comparan entre sí—; lo
 * único que distingue a la destacada es el relleno, no la familia.
 */
export function PortadaCifra({
  etiqueta,
  valor,
  destacar = false,
  className,
}: {
  etiqueta: ReactNode;
  valor: ReactNode;
  destacar?: boolean;
  /**
   * Para el ajuste fino que solo la página conoce: un valor excepcionalmente
   * largo que pide un cuerpo menor, un tramo que quiere ocupar dos columnas.
   * La talla normal la decide la primitiva; esto es la excepción, no la vía.
   */
  className?: string;
}) {
  return (
    /*
      `min-w-0` y `break-words` no son celo: en dos columnas de 173 px, una
      casilla de la tira mide 141 px de texto útil, y un monto formateado
      («RD$ 1,234,567,890») pasa de 190 px en mono a 18 px. Sin esto, la
      casilla se estira, arrastra la rejilla y la página entera se desplaza en
      horizontal. El número no se recorta —recortar una cifra es mentir—: se
      parte en dos renglones y baja un punto de cuerpo en el teléfono.
    */
    <div
      className={cn(
        "h-full min-w-0 rounded-lg px-4 py-3",
        destacar ? "bg-canvas/10" : "bg-canvas/5",
        className,
      )}
    >
      <dt className="text-xs text-canvas/60">{etiqueta}</dt>
      <dd className="mt-0.5 break-words font-mono text-base font-semibold tabular-nums sm:text-lg">
        {valor}
      </dd>
    </div>
  );
}
