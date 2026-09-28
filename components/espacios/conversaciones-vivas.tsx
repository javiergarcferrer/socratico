"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { leerComunidad, NOMBRE_HILO, type FilaComunidad, type Lectura } from "@/lib/espacios";
import Antiguedad from "@/components/antiguedad";
import { EstadoVacio } from "@/components/estado-vacio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconArrowRight, IconChat, IconVoto } from "@/components/icons";

/**
 * «¿De qué está hablando la gente?» en la portada: las cinco conversaciones
 * destacadas. La portada es una superficie sin base de datos, así que no lee
 * nada en el servidor: esto pregunta por HTTP en el navegador, con la clave
 * publicable y sin supabase-js, y solo cuando el lector se acerca a esta
 * altura de la página: quien no baja hasta aquí no le cuesta una consulta.
 *
 * No pinta nada hasta tener respuesta —ni título ni silueta que luego
 * desaparezcan— y, mientras la conversación no esté abierta (`cerrado`),
 * nada: no se vende lo que todavía no existe. Si no contestó, lo dice.
 */
export default function ConversacionesVivas({ encabezado }: { encabezado: ReactNode }) {
  const [r, setR] = useState<Lectura<FilaComunidad[]> | null>(null);
  const marca = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = marca.current;
    if (!el) return;
    let vivo = true;
    const traer = () => leerComunidad("destacado", 5).then((x) => vivo && setR(x));
    if (typeof IntersectionObserver === "undefined") {
      void traer();
      return () => {
        vivo = false;
      };
    }
    const io = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) {
          io.disconnect();
          void traer();
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => {
      vivo = false;
      io.disconnect();
    };
  }, []);

  if (r === null) return <div ref={marca} aria-hidden />;
  if (r.estado === "cerrado") return null;
  return (
    <section aria-labelledby="comunidad-portada" className="space-y-4">
      {encabezado}
      <Card>
        {r.estado === "caida" ? (
          <EstadoVacio variante="caida" className="m-5" titulo="No pudimos traer las conversaciones">
            El servidor de cuentas no respondió. Cada conversación sigue al final de su ficha.
          </EstadoVacio>
        ) : r.datos.length === 0 ? (
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-prose text-sm leading-relaxed text-ink-soft">
              Todavía nadie ha abierto una conversación. Al final de cada compra, ley o decreto
              puedes decir que importa o dejar una pregunta concreta.
            </p>
            <Button asChild variant="secondary" className="shrink-0">
              <Link href="/comunidad/normas">Cómo funciona</Link>
            </Button>
          </div>
        ) : (
          <ol className="divide-y divide-hairline">
            {r.datos.map((f) => (
              <li key={`${f.tipo}:${f.ref}`} className="relative flex items-start gap-3 px-5 py-3">
                <span className="flex w-10 shrink-0 flex-col items-center pt-0.5 text-ink-soft" aria-label={`${f.votos} dicen que importa`}>
                  <IconVoto className="h-4 w-4" />
                  <span className="font-mono text-xs tabular-nums text-ink">{f.votos}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`${f.href}#conversacion`} className="estira line-clamp-2 text-sm font-semibold text-ink">
                    {f.titulo}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                    <Badge variant="neutro">{NOMBRE_HILO[f.tipo]}</Badge>
                    <span className="inline-flex items-center gap-1">
                      <IconChat className="h-3.5 w-3.5" />
                      <span className="font-mono tabular-nums">{f.comentarios}</span>
                    </span>
                    <Antiguedad iso={f.actividad} prefijo="activa" />
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        <div className="border-t border-hairline px-5 py-3">
          <Button asChild variant="link" className="h-auto p-0 text-sm">
            <Link href="/comunidad">
              Toda la comunidad
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Card>
    </section>
  );
}
