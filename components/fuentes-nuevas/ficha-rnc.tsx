import Link from "next/link";
import { getRegistroTributario, tieneFichaDeEmpresa } from "@/lib/rnc";
import { enLlano, regimenEnLlano, tonoContribuyente } from "@/lib/padron";
import { formatFecha } from "@/lib/format";
import { enlace } from "@/lib/grafo";
import { MarcaEstado } from "@/components/marca-estado";
import { Card, CardTitle } from "@/components/ui/card";

/**
 * El proveedor en el padrón de la DGII: actividad declarada, estado y fecha
 * de inicio de operaciones. La distancia hasta su primer contrato la dice la
 * ficha en una sola frase, junto a la de constitución del Registro de
 * Proveedores, para que dos fechas distintas no se lean como dos verdades.
 *
 * Se pinta en `/proveedores/[rpe]`. Si el proveedor no está en el cruce
 * (persona física, documento extranjero) o la instantánea falta, no pinta
 * nada: la ficha de registro de la DGCP sigue diciendo lo suyo.
 *
 * El estado y el régimen se dicen con el vocabulario de `lib/padron.ts`, el
 * mismo de `/empresas`, y el RNC lleva a la ficha de la empresa cuando la
 * hay (`tieneFichaDeEmpresa`: nunca a una que el padrón de empresas no
 * publica).
 */
export async function FichaRnc({ rpe }: { rpe: string }) {
  const r = await getRegistroTributario(rpe);
  if (!r) return null;
  const conFicha = await tieneFichaDeEmpresa(r.rnc);

  return (
    <Card as="section" className="p-6">
      <CardTitle className="text-[15px]">Registro tributario</CardTitle>
      <p className="mt-1 text-xs text-ink-soft">
        Lo que el padrón de contribuyentes de la DGII dice de este RNC.
      </p>
      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="rotulo text-ink-soft">RNC</dt>
          <dd className="font-mono font-medium tabular-nums">
            {conFicha ? (
              <Link
                href={enlace.empresa(r.rnc)}
                title="Su ficha en el padrón de empresas de la DGII"
                className="text-brand-700 underline decoration-brand-700/40 underline-offset-2 hover:decoration-brand-700"
              >
                {r.rnc}
              </Link>
            ) : (
              r.rnc
            )}
          </dd>
        </div>
        <div>
          <dt className="rotulo text-ink-soft">Estado ante la DGII</dt>
          <dd className="mt-0.5">
            <MarcaEstado tono={tonoContribuyente(r.estado)} title={`La DGII lo publica como «${r.estado}»`}>
              {enLlano(r.estado)}
            </MarcaEstado>
          </dd>
        </div>
        {r.inicio && (
          <div>
            <dt className="rotulo text-ink-soft">Inició operaciones</dt>
            <dd className="font-mono tabular-nums">{formatFecha(r.inicio)}</dd>
          </div>
        )}
        {r.actividad && (
          <div className="sm:col-span-2">
            <dt className="rotulo text-ink-soft">Actividad económica declarada</dt>
            <dd>{enLlano(r.actividad)}</dd>
          </div>
        )}
        <div>
          <dt className="rotulo text-ink-soft">Régimen de pago</dt>
          <dd>{regimenEnLlano(r.regimen)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-ink-soft">
        Fuente: padrón de contribuyentes de la DGII
        {r.corteDgii ? ` actualizado al ${formatFecha(r.corteDgii)}` : ""}, cruzado con el
        Registro de Proveedores del Estado por el RNC. Instantánea, no consulta
        en vivo.
      </p>
    </Card>
  );
}
