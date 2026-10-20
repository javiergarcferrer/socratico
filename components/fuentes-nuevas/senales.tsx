import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { MarcaEstado } from "@/components/marca-estado";
import { enlace } from "@/lib/grafo";
import { formatFecha } from "@/lib/format";
import {
  TIPOS_SENAL,
  corteDeSenal,
  describirSenal,
  senalesDeInstitucion,
  senalesDeProveedor,
  type Senal,
  type Senales,
} from "@/lib/senales";

/**
 * «¿Qué patrones del registro merecen revisión?» en la ficha de un proveedor
 * o de una institución (`lib/senales.ts`). Cada señal dice la regla que
 * cumple, sus cifras y lo que no significa.
 *
 * Solo se pinta cuando hay alguna. Un «sin señales» sería un certificado que
 * cinco reglas sobre una instantánea no pueden dar.
 */

function Lista({ senales, datos }: { senales: Senal[]; datos: Senales }) {
  return (
    <ul className="-mx-5 mt-3 divide-y divide-hairline border-t border-hairline sm:-mx-6">
      {senales.map((s, i) => {
        const d = TIPOS_SENAL[s.tipo];
        return (
          <li key={i} className="px-5 py-4 sm:px-6">
            {/* Google atiende `data-nosnippet` en un `div`, no en un `li`. */}
            <div {...(s.tipo === "concentracion" && s.fisica ? { "data-nosnippet": "" } : {})}>
              <MarcaEstado tono="aviso">{d.etiqueta}</MarcaEstado>
              <h3 className="mt-2 text-[15px] font-semibold leading-snug text-ink">{d.pregunta}</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-ink">{describirSenal(s, datos.reglas)}</p>
              {s.tipo === "concentracion" && (
                <Button asChild variant="secondary" className="mt-2">
                  <Link href={enlace.proveedor(s.rpe)}>Ver la ficha del proveedor</Link>
                </Button>
              )}
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                {d.llano} Corte: {corteDeSenal(s, datos)}.
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Pie({ datos }: { datos: Senales }) {
  return (
    <p className="mt-3 text-xs leading-relaxed text-ink-soft">
      Calculado el {formatFecha(datos.generado)} sobre las tablas completas de contratos y procesos
      de la DGCP, sus medidas sobre proveedores y el padrón de la DGII. Instantánea, no consulta en
      vivo. Una señal no es una acusación ni un hallazgo de irregularidad: es un hecho del registro
      que cumple una regla escrita, y su explicación está en el expediente.{" "}
      <Link href="/proveedores/senales" className="font-medium text-brand-700 hover:underline">
        Las cinco reglas y todas las señales
      </Link>
      .
    </p>
  );
}

export async function SenalesDeProveedor({ rpe }: { rpe: string }) {
  const r = await senalesDeProveedor(rpe);
  if (!r || r.senales.length === 0) return null;
  return (
    <Card as="section" id="senales" className="p-5 sm:p-6">
      <CardTitle className="text-[15px]">¿Qué patrones de su registro merecen revisión?</CardTitle>
      <Lista senales={r.senales} datos={r.datos} />
      <Pie datos={r.datos} />
    </Card>
  );
}

export async function SenalesDeInstitucion({ uc }: { uc: number }) {
  const r = await senalesDeInstitucion(uc);
  if (!r || r.senales.length === 0) return null;
  return (
    <Card as="section" id="senales" className="p-5 sm:p-6">
      <CardTitle className="text-[15px]">¿Qué patrones de sus compras merecen revisión?</CardTitle>
      <Lista senales={r.senales} datos={r.datos} />
      <Pie datos={r.datos} />
    </Card>
  );
}
