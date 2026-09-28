"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NOMBRE_HILO, type FilaComunidad, type OrdenComunidad } from "@/lib/espacios";
import Antiguedad from "@/components/antiguedad";
import { Badge } from "@/components/ui/badge";
import { IconChat } from "@/components/icons";
import { useHaySesion } from "./presencia";
import VotoHilo from "./voto-hilo";

/**
 * Las filas del feed de `/comunidad`. El servidor las trae sin sesión (se
 * cachean para todos); si el lector tiene sesión, aquí se pregunta cuáles ya
 * votó, para que «Importa» salga hundido donde corresponde.
 *
 * Cada fila lleva a la ficha del registro, a su conversación (`#conversacion`):
 * se opina con el registro delante, no sobre un titular.
 */
export default function FeedComunidad({ filas, orden }: { filas: FilaComunidad[]; orden: OrdenComunidad }) {
  const hay = useHaySesion();
  const [votadas, setVotadas] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!hay) return;
    let vivo = true;
    (async () => {
      const c = await import("@/lib/espacios-cliente");
      const r = await c.comunidadConSesion(orden);
      if (!vivo || !r.ok) return;
      setVotadas(new Set(r.datos.filter((f) => f.mi_voto).map((f) => `${f.tipo}:${f.ref}`)));
    })();
    return () => {
      vivo = false;
    };
  }, [hay, orden]);

  return (
    <ol className="divide-y divide-hairline">
      {filas.map((f, i) => (
        <li key={`${f.tipo}:${f.ref}`} className="flex items-start gap-3 py-3.5 sm:gap-4">
          <span className="w-6 shrink-0 pt-3 text-right font-mono text-xs tabular-nums text-ink-soft" aria-hidden>
            {i + 1}
          </span>
          <VotoHilo
            vertical
            referencia={{ tipo: f.tipo, ref: f.ref, titulo: f.titulo, href: f.href }}
            votos={f.votos}
            miVoto={votadas.has(`${f.tipo}:${f.ref}`)}
            className="shrink-0"
          />
          <div className="relative min-w-0 flex-1">
            <Link href={`${f.href}#conversacion`} className="estira text-[15px] font-semibold leading-snug text-ink hover:text-brand-700">
              {f.titulo}
            </Link>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
              <Badge variant="neutro">{NOMBRE_HILO[f.tipo]}</Badge>
              <span className="inline-flex items-center gap-1">
                <IconChat className="h-3.5 w-3.5" />
                <span className="font-mono tabular-nums">{f.comentarios}</span>
                {f.comentarios === 1 ? "comentario" : "comentarios"}
              </span>
              <span aria-hidden>·</span>
              <Antiguedad iso={f.actividad} prefijo="activa" />
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
