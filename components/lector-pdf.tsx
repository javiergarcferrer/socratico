"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Lector de PDF que dibuja las páginas en un canvas.
 *
 * El visor nativo del navegador no sirve: en móvil (Chrome/Android, Safari/iOS)
 * un `<iframe>` con un PDF no renderiza nada — pinta un cajón gris con un botón
 * «Abrir» que saca al lector de la página. Justo donde más falta hace leer sin
 * descargar, no se lee. Aquí se rasteriza con pdf.js, que se comporta igual en
 * todas partes.
 *
 * Los bytes vienen por `/api/documento` porque ninguna fuente del Estado envía
 * CORS; cuando el origen acepta `Range` (el SIL del Senado lo hace), pdf.js
 * pide solo los trozos de las páginas que se miran, así que un escaneo de 30 MB
 * no se descarga entero para ver la primera página.
 */

interface Props {
  /** URL desde la que se pueden leer los bytes (mismo origen). */
  url: string;
  /** Enlace al archivo en el origen, para el mensaje de fallo. */
  urlOrigen: string;
}

interface Documento {
  numPages: number;
  getPage: (n: number) => Promise<PaginaPdf>;
  destroy: () => Promise<void>;
}

interface PaginaPdf {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel: () => void };
}

export default function LectorPdf({ url, urlOrigen }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const doc = useRef<Documento | null>(null);
  const render = useRef<{ cancel: () => void } | null>(null);

  const [paginas, setPaginas] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");

  // Carga del documento. pdf.js entra por import dinámico: es pesado y solo
  // hace falta cuando alguien abre de verdad el documento.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        // Build **legacy** a propósito: el moderno usa APIs de V8 recientes
        // (`Map.getOrInsertComputed`) que revientan la carga por trozos en
        // navegadores de un par de versiones atrás. El legacy trae los
        // polyfills y se comporta igual en todos.
        const pdfjs = (await import(
          "pdfjs-dist/legacy/build/pdf.mjs"
        )) as unknown as {
          GlobalWorkerOptions: { workerSrc: string };
          getDocument: (opts: {
            url: string;
            disableAutoFetch?: boolean;
            disableStream?: boolean;
          }) => { promise: Promise<unknown> };
        };
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const tarea = pdfjs.getDocument({ url, disableAutoFetch: true, disableStream: false });
        const cargado = (await tarea.promise) as Documento;
        if (!vivo) {
          void cargado.destroy();
          return;
        }
        doc.current = cargado;
        setPaginas(cargado.numPages);
        setEstado("listo");
      } catch (err) {
        console.error(`[lector] ${String(err)}`);
        if (vivo) setEstado("error");
      }
    })();
    return () => {
      vivo = false;
      render.current?.cancel();
      void doc.current?.destroy();
      doc.current = null;
    };
  }, [url]);

  const pintar = useCallback(async () => {
    const documento = doc.current;
    const canvas = lienzo.current;
    const caja = contenedor.current;
    if (!documento || !canvas || !caja) return;

    render.current?.cancel();
    const pag = await documento.getPage(pagina);

    // Ajuste al ancho disponible, con la densidad real de la pantalla para que
    // un escaneo no se vea borroso en un móvil.
    const natural = pag.getViewport({ scale: 1 });
    const ancho = caja.clientWidth || 640;
    const escala = ((ancho - 8) / natural.width) * zoom;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vista = pag.getViewport({ scale: escala * dpr });

    canvas.width = Math.floor(vista.width);
    canvas.height = Math.floor(vista.height);
    canvas.style.width = `${Math.floor(vista.width / dpr)}px`;
    canvas.style.height = `${Math.floor(vista.height / dpr)}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const tarea = pag.render({ canvasContext: ctx, viewport: vista });
    render.current = tarea;
    try {
      await tarea.promise;
    } catch {
      /* render cancelado por otro más nuevo */
    }
  }, [pagina, zoom]);

  useEffect(() => {
    if (estado === "listo") void pintar();
  }, [estado, pintar]);

  // Reajuste al girar el teléfono o redimensionar.
  useEffect(() => {
    if (estado !== "listo") return;
    let temporizador: ReturnType<typeof setTimeout>;
    const alRedimensionar = () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => void pintar(), 150);
    };
    window.addEventListener("resize", alRedimensionar);
    return () => {
      clearTimeout(temporizador);
      window.removeEventListener("resize", alRedimensionar);
    };
  }, [estado, pintar]);

  if (estado === "error") {
    return (
      <div className="px-5 py-8 text-center">
        <p className="text-sm font-medium text-ink">No se pudo mostrar el documento aquí.</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-ink-soft">
          El origen no lo entregó en un formato que se pueda dibujar. Ábrelo en
          su sitio oficial.
        </p>
        <Button asChild variant="secondary" className="mt-3">
          <a href={urlOrigen} target="_blank" rel="noopener noreferrer">
            Abrir en el origen
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/*
        La barra de mandos del lector se usa con el pulgar, una página tras
        otra: seis objetivos de 44 px (`icon`) en vez de los 36 con que estaba,
        y los dos contadores estrechados —de 6.5 rem a 4.5 y de 3 a 2.75— para
        que los seis quepan en una sola línea a 390 px en vez de partirse en
        dos. El `flex-wrap` se queda de red por si un idioma o una lupa del
        sistema los ensancha.
      */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 border-b border-hairline bg-canvas/60 px-3 py-2 sm:px-4">
        <div className="flex items-center gap-1">
          <Boton
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            desactivado={pagina <= 1 || estado !== "listo"}
            etiqueta="Página anterior"
          >
            ‹
          </Boton>
          {/* Pasar página no carga nada: el número nuevo se anuncia. */}
          <span
            aria-live="polite"
            className="min-w-[4.5rem] text-center font-mono text-xs tabular-nums text-ink-soft"
          >
            {estado === "listo" ? (
              <>
                <span aria-hidden>{`${pagina} / ${paginas}`}</span>
                <span className="sr-only">{`Página ${pagina} de ${paginas}`}</span>
              </>
            ) : (
              "Cargando…"
            )}
          </span>
          <Boton
            onClick={() => setPagina((p) => Math.min(paginas, p + 1))}
            desactivado={pagina >= paginas || estado !== "listo"}
            etiqueta="Página siguiente"
          >
            ›
          </Boton>
        </div>
        <div className="flex items-center gap-1">
          <Boton
            onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
            desactivado={zoom <= 0.5 || estado !== "listo"}
            etiqueta="Alejar"
          >
            −
          </Boton>
          <span className="min-w-[2.75rem] text-center font-mono text-xs tabular-nums text-ink-soft">
            {Math.round(zoom * 100)}&nbsp;%
          </span>
          <Boton
            onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}
            desactivado={zoom >= 3 || estado !== "listo"}
            etiqueta="Acercar"
          >
            +
          </Boton>
        </div>
      </div>

      {/*
        Al acercar, el que se desplaza es este cajón y no la página: el canvas
        crece dentro de `overflow-auto` y nunca desborda el documento. Con
        `overscroll-contain`, llegar al borde del documento no arrastra la
        página de debajo —el rebote que en un teléfono saca al lector de donde
        estaba leyendo.
      */}
      <div
        ref={contenedor}
        className="max-h-[75vh] overflow-auto overscroll-contain bg-canvas px-1 py-3 text-center"
      >
        {estado === "cargando" && (
          <p className="py-16 text-xs text-ink-soft">Abriendo el documento…</p>
        )}
        <canvas
          ref={lienzo}
          role="img"
          aria-label={`Página ${pagina} de ${paginas} del documento`}
          className={estado === "listo" ? "mx-auto border border-hairline" : "hidden"}
        />
      </div>
    </div>
  );
}

/**
 * El mando del lector: cuadrado y con nombre para el lector de pantalla.
 * Talla `icon` —44 px en el teléfono, 40 desde `sm`—, porque pasar página en
 * un documento de ciento cuarenta es el gesto que más se repite aquí.
 */
function Boton({
  children,
  onClick,
  desactivado,
  etiqueta,
}: {
  children: React.ReactNode;
  onClick: () => void;
  desactivado: boolean;
  etiqueta: string;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={onClick}
      disabled={desactivado}
      className="text-base"
    >
      <span aria-hidden>{children}</span>
      <span className="sr-only">{etiqueta}</span>
    </Button>
  );
}
