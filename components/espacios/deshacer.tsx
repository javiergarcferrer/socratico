"use client";

import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * «Deshacer» en lugar de «¿Seguro?» (docs/INFRAESTRUCTURA.md §11): lo reversible se
 * hace al primer toque y se ofrece volver atrás durante unos segundos. Solo
 * para lo que de verdad se restaura entero desde el navegador; lo que se lleva
 * consigo algo que no se puede volver a poner (los enlaces de un registro, las
 * menciones de la narración) sigue preguntando antes.
 *
 * La región está siempre montada para que el lector de pantalla anuncie el
 * cambio (`aria-live`), y el plazo se detiene mientras el foco está dentro:
 * quien llega con el teclado no ve desaparecer el botón bajo el cursor.
 *
 * Cada aviso monta su propio cuerpo (`key` por aviso): un «deshacer» lento que
 * contesta cuando ya hay otro aviso no pinta su resultado sobre el nuevo.
 * Si deshacer falla, el botón queda como «Reintentar» y el aviso no se cierra
 * solo: el lector decide.
 */

export type Resultado = { ok: true } | { ok: false; error: string };

export interface Deshacible {
  /** Qué pasó, dicho con el objeto: «Quitaste «X» de lo guardado.» */
  texto: string;
  deshacer: () => Promise<Resultado>;
}

const PLAZO_MS = 10_000;

// Identidad estable por objeto de aviso, para usarla de `key`.
const ids = new WeakMap<Deshacible, number>();
let siguiente = 0;
function idDe(aviso: Deshacible): number {
  let id = ids.get(aviso);
  if (id === undefined) {
    id = ++siguiente;
    ids.set(aviso, id);
  }
  return id;
}

export function AvisoDeshacer({
  aviso,
  onCerrar,
  className,
}: {
  aviso: Deshacible | null;
  onCerrar: () => void;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite">
      {aviso && <Cuerpo key={idDe(aviso)} aviso={aviso} onCerrar={onCerrar} className={className} />}
    </div>
  );
}

function Cuerpo({
  aviso,
  onCerrar,
  className,
}: {
  aviso: Deshacible;
  onCerrar: () => void;
  className?: string;
}) {
  const [estado, setEstado] = useState<"listo" | "deshaciendo" | "hecho" | "error">("listo");
  const [error, setError] = useState<string | null>(null);
  const [foco, setFoco] = useState(false);
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;
  const vigente = useRef(true);
  const cajaRef = useRef<HTMLDivElement>(null);
  const textoRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    vigente.current = true;
    return () => {
      vigente.current = false;
    };
  }, []);

  // El plazo corre mientras se ofrece deshacer y, más corto, tras hacerlo. Un
  // error no se cierra solo; mientras se deshace, tampoco.
  useEffect(() => {
    if (foco || estado === "deshaciendo" || estado === "error") return;
    const t = window.setTimeout(() => cerrarRef.current(), estado === "listo" ? PLAZO_MS : 4000);
    return () => window.clearTimeout(t);
  }, [foco, estado]);

  async function deshacer() {
    // El botón se desactiva (y luego desaparece si sale bien): el foco pasa al
    // texto del aviso antes de perderse, y la pausa por foco se suelta.
    if (cajaRef.current?.contains(document.activeElement)) textoRef.current?.focus();
    setFoco(false);
    setEstado("deshaciendo");
    const r = await aviso.deshacer();
    if (!vigente.current) return;
    if (r.ok) {
      setError(null);
      setEstado("hecho");
    } else {
      setError(r.error);
      setEstado("error");
    }
  }

  return (
    <Alert
      ref={cajaRef}
      variant="neutro"
      role="none"
      onFocus={() => {
        if (estado === "listo") setFoco(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFoco(false);
      }}
      className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-canvas px-3 py-2", className)}
    >
      <p ref={textoRef} tabIndex={-1} className="min-w-0 break-words text-ink outline-none">
        {estado === "hecho"
          ? "Hecho: volvió a su sitio."
          : estado === "error"
            ? <span className="text-alerta-700">No se pudo deshacer. {error}</span>
            : aviso.texto}
      </p>
      {estado !== "hecho" && (
        <Button type="button" size="sm" variant="outline" disabled={estado === "deshaciendo"} onClick={() => void deshacer()}>
          {estado === "deshaciendo" ? "Deshaciendo…" : estado === "error" ? "Reintentar" : "Deshacer"}
        </Button>
      )}
    </Alert>
  );
}
