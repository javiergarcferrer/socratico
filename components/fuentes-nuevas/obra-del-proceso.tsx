import Link from "next/link";
import { obrasDeProceso, tonoDeObra } from "@/lib/obras";
import { formatPesos, tituloLegible } from "@/lib/format";
import { MarcaEstado } from "@/components/marca-estado";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { enlace } from "@/lib/grafo";

/**
 * «¿De qué obra es esta compra?» — el eslabón proceso → SNIP → obra.
 *
 * Se pinta en la ficha de proceso. Une por el `codigo_snip` que trae la DGCP y
 * por el índice de MapaInversiones (que asocia procesos que la DGCP publica
 * sin SNIP). Si las dos fuentes discrepan, se muestran ambas obras y cada una
 * dice según quién. Si el proceso no pertenece a ninguna obra de la instantánea, no
 * pinta nada: la mayoría de las compras no son inversión.
 */
export async function ObraDelProceso({ codigo, snip }: { codigo: string; snip?: string | null }) {
  const obras = await obrasDeProceso(codigo, snip);
  if (obras.length === 0) return null;
  return (
    <Card as="section" className="p-5 sm:p-6">
      <CardTitle>{obras.length === 1 ? "La obra de esta compra" : `Las ${obras.length} obras de esta compra`}</CardTitle>
      <p className="mt-1 text-xs text-ink-soft">
        {obras.length === 1
          ? "Proyecto de inversión pública al que se asocia este proceso."
          : "Este proceso aparece asociado a más de un proyecto de inversión. La DGCP y MapaInversiones no siempre coinciden: cada obra dice según quién."}
      </p>
      <ul className="mt-3 divide-y divide-hairline">
        {obras.map(({ obra: o, segun }) => (
          <li key={o.snip} className="relative py-3">
            <div className="flex flex-wrap items-center gap-2">
              <MarcaEstado tono={tonoDeObra(o.estado)}>{o.estado}</MarcaEstado>
              <span className="font-mono text-xs tabular-nums text-ink-soft">SNIP {o.snip}</span>
              <span className="text-xs text-ink-soft">según {segun.join(" y ")}</span>
            </div>
            <Link
              href={enlace.obra(o.snip)}
              className="mt-1.5 block text-[15px] leading-snug text-ink estira hover:text-brand-700"
            >
              {tituloLegible(o.nombre)}
            </Link>
            <div className="mt-2 flex items-center gap-3">
              <Progress
                value={o.avance}
                aria-label={`Avance declarado: ${o.avance.toFixed(0)} %`}
                className="flex-1"
              />
              <span className="shrink-0 font-mono text-xs tabular-nums text-ink-soft">
                {o.avance.toFixed(0)} % declarado · {formatPesos(o.valor)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
