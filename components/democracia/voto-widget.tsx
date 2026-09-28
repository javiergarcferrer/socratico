"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, db } from "@/lib/supabase";
import type { Agregado, Camara } from "@/lib/democracia";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

/**
 * Widget de voto ciudadano (a favor / en contra) sobre una iniciativa, embebido en su ficha.
 *
 * Muestra el agregado en vivo (público) y, si hay sesión con votante
 * registrado, el voto propio, que puede cambiarse o quitarse. Sin registro,
 * invita a `/democracia/registro`. Toda la seguridad (un voto por cédula,
 * privacidad del voto) vive en la base; aquí solo se llama a los RPC.
 */

/**
 * `caido` es el estado que faltaba: si la base no contesta —se cae la red, el
 * proyecto duerme—, el efecto se quedaba en `cargando` para siempre y los dos
 * botones quedaban apagados **sin decir por qué**, que es justo lo que la
 * ergonomía de la casa prohíbe (un control apagado explica su motivo antes del
 * toque). Ahora ese caso tiene nombre y su propio aviso encima del control.
 */
type Estado = "cargando" | "anon" | "sin-registro" | "listo" | "caido";

export default function VotoWidget({
  camara,
  refIni: refId,
  numero,
  titulo,
  grupo,
  inicial,
}: {
  camara: Camara;
  refIni: string;
  numero?: string | null;
  titulo?: string | null;
  grupo?: string | null;
  /** `null`: el recuento no se pudo leer. Se puede votar igual; no se inventan ceros. */
  inicial: Agregado | null;
}) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [agg, setAgg] = useState<Agregado | null>(inicial);
  const [miVoto, setMiVoto] = useState<-1 | 1 | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lo que cambió al votar, dicho en voz baja al lector de pantalla: el botón
  // cambia de vestido sin cargar la página y eso solo no se oye.
  const [anuncio, setAnuncio] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data: sesion } = await supabase().auth.getSession();
        if (!vivo) return;
        if (!sesion.session) {
          setEstado("anon");
          return;
        }
        // ¿Tiene registro de votante? (RLS: solo ve su propia fila.)
        const { data: votante } = await db().from("votantes").select("id").maybeSingle();
        if (!vivo) return;
        if (!votante) {
          setEstado("sin-registro");
          return;
        }
        const { data: voto } = await db()
          .from("votos")
          .select("valor")
          .eq("camara", camara)
          .eq("ref", refId)
          .maybeSingle();
        if (!vivo) return;
        setMiVoto((voto?.valor as -1 | 1 | undefined) ?? null);
        setEstado("listo");
      } catch {
        // Sin esto el widget se quedaba en «cargando» para siempre: botones
        // apagados y ni una palabra de por qué.
        if (vivo) setEstado("caido");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [camara, refId]);

  async function refrescarAgregado() {
    const { data } = await db()
      .from("agregados_publicos")
      .select("*")
      .eq("camara", camara)
      .eq("ref", refId)
      .maybeSingle();
    if (data) setAgg(data as Agregado);
  }

  /** Solo quien tiene sesión y registro puede votar; el resto ni lo intenta. */
  const puedeVotar = estado === "listo";

  async function votar(valor: -1 | 1) {
    // Sin registro no se dispara nada: contar el voto de forma optimista y
    // luego culpar a la red de un fallo de permisos es mentirle al usuario.
    if (enviando || !puedeVotar) return;
    setError(null);
    setEnviando(true);
    const previo = miVoto;
    const quitar = previo === valor;

    // Optimista sobre el agregado.
    setAgg((a) => {
      if (!a) return a; // sin recuento no hay a qué sumar: lo trae el refresco
      const next = { ...a };
      if (previo === 1) next.a_favor -= 1;
      if (previo === -1) next.en_contra -= 1;
      if (previo != null) next.total -= 1;
      if (!quitar) {
        if (valor === 1) next.a_favor += 1;
        else next.en_contra += 1;
        next.total += 1;
      }
      return next;
    });
    setMiVoto(quitar ? null : valor);

    const rpc = quitar
      ? db().rpc("quitar_voto", { p_camara: camara, p_ref: refId })
      : db().rpc("emitir_voto", {
          p_camara: camara,
          p_ref: refId,
          p_valor: valor,
          p_numero: numero ?? null,
          p_titulo: titulo ?? null,
          p_grupo: grupo ?? null,
        });
    const { data, error: err } = await rpc;
    const ok = !err && (data as { ok?: boolean } | null)?.ok !== false;
    if (!ok) {
      setError("No se pudo registrar el voto. Vuelve a intentarlo en un momento.");
      setMiVoto(previo);
      setAnuncio("");
    } else {
      setAnuncio(
        quitar
          ? "Quitaste tu voto."
          : `Tu voto quedó registrado: ${valor === 1 ? "a favor" : "en contra"}.`,
      );
    }
    await refrescarAgregado();
    setEnviando(false);
  }

  const total = agg?.total ?? 0;
  const pctFavor = agg && total > 0 ? Math.round((agg.a_favor / total) * 100) : 0;

  return (
    <Card as="section" className="border-brand-100 bg-brand-50/50 p-4 sm:p-5">
      {/*
        En el teléfono el titular y el recuento se estorbaban: «¿Apoyas esta
        iniciativa?» se partía en dos líneas para dejarle sitio a «142 personas
        ya opinaron», que además quedaba alineado a la derecha contra el borde.
        Apilados, cada uno ocupa su renglón entero y se leen en el orden en que
        importan: primero la pregunta, después cuánta gente la contestó.
      */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <h2 className="font-sans flex items-center gap-2 text-sm font-semibold text-ink">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-sello-600" />
            ¿Apoyas esta iniciativa?
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Voto ciudadano · piloto independiente, no oficial
          </p>
        </div>
        <span className="font-mono shrink-0 text-xs tabular-nums text-ink-soft sm:text-right">
          {!agg
            ? "Recuento no disponible por ahora"
            : miVoto === null
              ? `${total.toLocaleString("es-DO")} ${total === 1 ? "persona ya opinó" : "personas ya opinaron"}`
              : `${total.toLocaleString("es-DO")} ${total === 1 ? "voto" : "votos"}`}
        </span>
      </div>

      {/*
        El agregado solo aparece después de votar. Enseñar «68% a favor» antes
        de preguntar ancla la respuesta —es el efecto mejor documentado en
        votación pública—, y esta plataforma dice que la conclusión la saca el
        lector. El ranking de /democracia sigue siendo el sitio del agregado.
      */}
      {agg && total > 0 && miVoto !== null && (
        <div className="mt-4">
          <Progress
            value={pctFavor}
            aria-label={`${pctFavor} % a favor`}
            className="h-2.5 bg-ink-soft/30 ring-1 ring-inset ring-hairline"
          />
          <div className="font-mono mt-1.5 flex justify-between text-xs tabular-nums text-ink-soft">
            <span className="font-medium text-brand-600">{pctFavor}&nbsp;% a favor</span>
            <span className="font-medium text-sello-600">{100 - pctFavor}&nbsp;% en contra</span>
          </div>
          {/* Cuántos de esos votos vienen de una identidad verificada por Cuenta Única. */}
          {(agg.verificados ?? 0) > 0 && (
            <p className="font-mono mt-1 text-xs tabular-nums text-ink-soft">
              {agg.verificados.toLocaleString("es-DO")} con identidad verificada (Cuenta Única)
            </p>
          )}
        </div>
      )}

      {/*
        El motivo antes que el control: si los botones están apagados, el
        lector tiene que saber por qué **antes** de intentar pulsarlos, no
        después de un error.
      */}
      {estado === "cargando" && (
        <p className="mt-4 text-xs leading-relaxed text-ink-soft" aria-live="polite">
          Comprobando si tu sesión puede votar…
        </p>
      )}

      {estado === "caido" && (
        <Alert
          variant="aviso"
          className="mt-4 px-3.5 py-2.5 text-xs leading-relaxed"
        >
          No pudimos comprobar tu registro ahora mismo, así que los botones
          quedan apagados: no vamos a contar un voto que no sabemos si podemos
          guardar. Vuelve a cargar la página en un momento; lo que ya votaste
          sigue contado.
        </Alert>
      )}

      {(estado === "anon" || estado === "sin-registro") && (
        <Alert
          variant="neutro"
          role="note"
          className="mt-4 bg-canvas px-3.5 py-2.5 text-xs leading-relaxed text-ink-soft"
        >
          {estado === "anon" ? (
            <>
              Para votar hace falta{" "}
              <Link
                href="/democracia/registro"
                className="font-semibold text-brand-700 hover:underline"
              >
                registrarse con la cédula
              </Link>
              . Tu voto es privado: solo se publican los totales.
            </>
          ) : (
            <>
              Tu sesión no tiene una cédula registrada.{" "}
              <Link
                href="/democracia/registro"
                className="font-semibold text-brand-700 hover:underline"
              >
                Completa tu registro
              </Link>{" "}
              para votar.
            </>
          )}
        </Alert>
      )}

      {/* botones */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <BotonVoto
          activo={miVoto === 1}
          disabled={enviando || !puedeVotar}
          onClick={() => votar(1)}
          tono="favor"
          conteo={miVoto === null || !agg ? null : agg.a_favor}
        >
          A favor
        </BotonVoto>
        <BotonVoto
          activo={miVoto === -1}
          disabled={enviando || !puedeVotar}
          onClick={() => votar(-1)}
          tono="contra"
          conteo={miVoto === null || !agg ? null : agg.en_contra}
        >
          En contra
        </BotonVoto>
      </div>

      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>

      {error && (
        <Alert
          variant="sello"
          role="alert"
          className="mt-3 px-3.5 py-2.5 text-xs font-medium"
        >
          {error}
        </Alert>
      )}
    </Card>
  );
}

function BotonVoto({
  activo,
  tono,
  conteo,
  children,
  ...props
}: {
  activo: boolean;
  tono: "favor" | "contra";
  conteo: number | null;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const favor = tono === "favor";
  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      aria-pressed={activo}
      /*
        Votado y sin votar son dos vestidos distintos —relleno contra filete—,
        y el `hover` del vestido activo sigue cambiando algo: un control que
        parece pulsable y no responde es la regla «un control apagado explica
        por qué» fallando en silencio.
      */
      /*
        `h-auto px-3 py-2.5` dejaba el botón en 40 px de alto: por debajo del
        objetivo táctil de 44, y en el control más importante de la vertical.
        Ahora la altura mínima es de 56 px y el recuento baja a su propio
        renglón — en dos columnas de 155 px, «A favor 1,234» en una sola línea
        se salía de la caja.
      */
      className={cn(
        "h-auto min-h-14 flex-col gap-0.5 px-2 py-2.5 sm:min-h-12",
        activo && favor && "border-brand-500 bg-brand-500 text-canvas hover:bg-brand-600",
        activo && !favor && "border-ink bg-ink text-canvas hover:bg-ink/90",
        !activo && favor && "text-brand-600 hover:border-brand-400 hover:bg-brand-50",
        !activo && !favor && "hover:border-ink",
      )}
      {...props}
    >
      <span className="flex items-center gap-2">
        <Pulgar arriba={favor} />
        {children}
      </span>
      {conteo !== null && (
        <span className="font-mono text-xs tabular-nums opacity-80">
          {conteo.toLocaleString("es-DO")}
        </span>
      )}
    </Button>
  );
}

function Pulgar({ arriba }: { arriba: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", !arriba && "rotate-180")}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3z" />
      <path d="M7 11l4-8a2 2 0 0 1 2 2v3h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7" />
    </svg>
  );
}
