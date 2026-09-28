import { getAlertas, type Severidad } from "@/lib/alertas";
import { formatFecha, hace } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { IconBell, IconExternal } from "@/components/icons";

const SEVERIDAD: Record<Severidad, { texto: string; variante: "alerta" | "sello" | "neutro" }> = {
  // El ocre es el color del aviso; el sello rojo dice «se anuló»: no se usa aquí.
  Extreme: { texto: "Extrema", variante: "alerta" },
  Severe: { texto: "Severa", variante: "alerta" },
  Moderate: { texto: "Moderada", variante: "alerta" },
  Minor: { texto: "Menor", variante: "neutro" },
  Unknown: { texto: "Sin grado", variante: "neutro" },
};

/** «20 sept., 13:12» en la hora de Santo Domingo. */
function momento(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-DO", {
    timeZone: "America/Santo_Domingo",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * ¿Hay alguna alerta del tiempo ahora? — las alertas vigentes de INDOMET
 * (`lib/alertas.ts`). Sin alertas vigentes lo dice, con la fecha de la última
 * emitida para que el silencio no se lea como fuente caída.
 */
export async function AlertasTiempo() {
  const a = await getAlertas();
  return (
    <Card as="section" className="flex h-full flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <IconBell className="h-4 w-4 text-ink-soft" />
            ¿Hay alguna alerta del tiempo ahora?
          </CardTitle>
          <p className="mt-0.5 text-xs text-ink-soft">
            Alertas vigentes del Instituto Dominicano de Meteorología (INDOMET)
          </p>
        </div>
        <Button asChild variant="link" className="-my-2 -mr-2 px-2 text-xs">
          <a href="https://indomet.gob.do/" target="_blank" rel="noopener noreferrer">
            INDOMET
            <IconExternal className="h-3.5 w-3.5" />
            <span className="sr-only">(se abre en otra pestaña)</span>
          </a>
        </Button>
      </div>
      {!a ? (
        <p className="mt-4 text-sm text-alerta-700">
          El canal de alertas de INDOMET no contestó. Que aquí no aparezca ninguna no
          quiere decir que no las haya: consulta su sitio.
        </p>
      ) : a.vigentes.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">
          Ninguna vigente en este momento.
          {a.ultimaEmitida && <> La última se emitió {hace(a.ultimaEmitida)}, el {formatFecha(a.ultimaEmitida)}.</>}{" "}
          Son alertas, no el pronóstico: sin alertas no quiere decir buen tiempo.
        </p>
      ) : (
        <>
          <ol className="mt-3 divide-y divide-hairline">
            {a.vigentes.map((x) => (
              <li key={x.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={SEVERIDAD[x.severidad].variante}>{SEVERIDAD[x.severidad].texto}</Badge>
                  <span className="text-sm font-medium text-ink">
                    {x.evento || x.titulo} · {x.zona}
                  </span>
                </div>
                {x.descripcion && <p className="mt-1 text-sm leading-relaxed text-ink-soft">{x.descripcion}</p>}
                {x.instruccion && (
                  <p className="mt-1 text-sm leading-relaxed text-ink">
                    <span className="font-medium">Qué hacer: </span>
                    {x.instruccion}
                  </p>
                )}
                <p className="mt-1 font-mono text-xs tabular-nums text-ink-soft">
                  {x.desde ? `Desde ${momento(x.desde)} · ` : ""}{x.hasta ? `hasta ${momento(x.hasta)}` : "sin fecha de fin"} ·{" "}
                  <a href={x.url} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
                    alerta oficial (XML)
                  </a>
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            Tal como las emite INDOMET en el estándar internacional de alertas (CAP),
            con la hora de Santo Domingo. Son alertas, no el pronóstico.
          </p>
        </>
      )}
    </Card>
  );
}
