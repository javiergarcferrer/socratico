"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReferenciaHilo } from "@/lib/espacios";
import { Button } from "@/components/ui/button";
import { IconVoto } from "@/components/icons";
import { cn } from "@/lib/cn";
import { useHaySesion } from "./presencia";

/**
 * «Importa»: el voto sobre un registro o una investigación
 * (docs/PLAN-ESPACIOS.md §6). Solo hacia arriba: no se vota contra un hecho,
 * se dice que merece atención. Vota cualquier cuenta con correo verificado;
 * sin sesión, el botón lleva a entrar y vuelve aquí.
 *
 * Cambia al instante y se deshace si la base dice que no. El cliente de
 * Supabase se carga al pulsar, no al pintar: el feed y la ficha no lo pagan.
 */
export default function VotoHilo({
  referencia,
  votos: votosIniciales,
  miVoto: miVotoInicial,
  vertical = false,
  className,
}: {
  referencia: ReferenciaHilo;
  votos: number;
  miVoto: boolean;
  /** En el feed: la cifra debajo de la flecha, como una columna. */
  vertical?: boolean;
  className?: string;
}) {
  const hay = useHaySesion();
  const router = useRouter();
  const pathname = usePathname();
  const [votos, setVotos] = useState(votosIniciales);
  const [mio, setMio] = useState(miVotoInicial);
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Una lectura nueva (con la sesión ya cargada) trae el voto propio.
  useEffect(() => {
    setVotos(votosIniciales);
    setMio(miVotoInicial);
  }, [votosIniciales, miVotoInicial]);

  async function alternar() {
    if (!hay) {
      router.push(`/cuenta?volver=${encodeURIComponent(pathname)}`);
      return;
    }
    const antes = { votos, mio };
    setMio(!mio);
    setVotos(votos + (mio ? -1 : 1));
    setEnCurso(true);
    const c = await import("@/lib/espacios-cliente");
    const r = await c.votarHilo(referencia, !antes.mio);
    setEnCurso(false);
    if (!r.ok) {
      setVotos(antes.votos);
      setMio(antes.mio);
      setError(r.error);
      return;
    }
    setError(null);
    setVotos(r.datos);
  }

  const etiqueta = mio ? "Ya dijiste que importa; pulsa para retirarlo" : "Decir que esto importa";
  return (
    <span className={cn("inline-flex flex-col items-center", className)}>
      <Button
        type="button"
        variant="outline"
        size={vertical ? "icon" : "default"}
        aria-pressed={mio}
        aria-label={`${etiqueta}. ${votos} ${votos === 1 ? "cuenta lo dice" : "cuentas lo dicen"}.`}
        title={hay ? etiqueta : "Entra para votar"}
        disabled={enCurso}
        onClick={alternar}
        className={cn(vertical ? "h-auto w-12 flex-col gap-0.5 py-1.5 sm:w-11" : "gap-2", mio && "text-brand-700")}
      >
        <IconVoto className="h-4 w-4" />
        {vertical ? (
          <span className="font-mono text-xs tabular-nums">{votos}</span>
        ) : (
          <>
            Importa
            <span className="font-mono tabular-nums text-ink-soft">{votos}</span>
          </>
        )}
      </Button>
      {error && (
        <span role="status" className="mt-1 max-w-48 text-center text-xs leading-snug text-alerta-700">
          {error}
        </span>
      )}
    </span>
  );
}
