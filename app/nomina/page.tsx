import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { preload } from "react-dom";
import { Explorer, ExplorerEsqueleto, type FichasNomina } from "@/components/nomina/explorer";
import { getInstitucionesNomina } from "@/lib/nomina-server";
import { hrefInstitucion, institucionDeNomina } from "@/lib/instituciones";
import { estaAtrasada, formatInt, textoAtraso } from "@/lib/nomina";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Termino } from "@/components/termino";
import { Portada } from "@/components/portada";

export const metadata: Metadata = {
  title: "¿A quién le paga el Estado?",
  description:
    "Foto transversal de la nómina pública dominicana: plazas, áreas, cargos y sueldos brutos del último mes publicado por cada institución cubierta, sin nombres ni datos personales.",
  alternates: { canonical: "/nomina" },
};

/*
  La marca de antigüedad se calcula contra la fecha de hoy: la página se
  rehace una vez al día para que «foto de hace 4 meses» no se quede atrás.
*/
export const revalidate = 86400;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export default async function NominaPage() {
  /*
    El explorador es un componente cliente que pide la instantánea al
    hidratar: HTML → JavaScript → hidratación → fetch → render, cuatro pasos
    en fila. La pista de precarga viaja en el HTML y el navegador empieza a
    bajar el JSON en paralelo con el JavaScript; cuando el explorador lo pide,
    ya está en caché. `anonymous` casa con el modo del `fetch()` del cliente.
  */
  preload("/data/nomina.json", { as: "fetch", crossOrigin: "anonymous" });

  // El cruce de instituciones pesa 114 KB: los once enlaces se resuelven aquí
  // y al explorador solo viaja el mapa código → ficha.
  const foto = await getInstitucionesNomina();
  const fichas: FichasNomina = {};
  for (const i of foto?.instituciones ?? []) {
    const inst = institucionDeNomina(i.codigo);
    if (inst) fichas[i.codigo] = hrefInstitucion(inst);
  }
  const cubiertas = [...(foto?.instituciones ?? [])].sort(
    (a, b) => b.anio * 100 + b.mes - (a.anio * 100 + a.mes) || b.plazas - a.plazas,
  );
  const atrasadas = cubiertas.filter((i) => estaAtrasada(i)).length;

  return (
    <div className="space-y-5">
      <Portada
        rotulo="Nóminas de transparencia · consolidadas"
        titulo="¿A quién le paga el Estado?"
        descripcion={
          <>
            Qué paga el Estado por{" "}
            <Termino clave="plaza" className="text-canvas">plaza</Termino>: la
            foto del último mes publicado por cada institución cubierta,
            consolidada desde sus nóminas oficiales de transparencia, sin
            nombres ni datos personales. Filtra por institución, área, cargo y{" "}
            <Termino clave="sueldoBruto" className="text-canvas">sueldo bruto</Termino>, o
            compara el mismo puesto entre instituciones. Los paneles de gasto
            suman la{" "}
            <Termino clave="masaSalarial" className="text-canvas">masa salarial</Termino> del
            mes.
          </>
        }
      />

      <Suspense fallback={<ExplorerEsqueleto />}>
        <Explorer fichas={fichas} />
      </Suspense>

      {cubiertas.length > 0 && (
        <Card as="section" className="p-5 sm:p-6">
          <CardTitle>¿Qué instituciones cubre esta foto?</CardTitle>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            {cubiertas.length} instituciones y {formatInt(foto?.plazas ?? 0)} plazas: las
            que publican su nómina en un formato que se puede procesar. No es
            todo el Estado. Cada una publica a su ritmo
            {atrasadas > 0
              ? `, y ${atrasadas === 1 ? "una tiene" : `${atrasadas} tienen`} la foto de hace más de tres meses.`
              : "."}
          </p>
          <ul className="mt-3 divide-y divide-hairline">
            {cubiertas.map((i) => (
              <li
                key={i.codigo}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5"
              >
                <span className="min-w-0">
                  {fichas[i.codigo] ? (
                    <Link
                      href={fichas[i.codigo]}
                      className="text-sm font-medium text-ink hover:text-brand-700 hover:underline"
                    >
                      {i.nombre}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-ink">{i.nombre}</span>
                  )}
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                    <span className="font-mono tabular-nums">
                      {MESES[i.mes - 1]} de {i.anio} · {formatInt(i.plazas)} plazas
                    </span>
                    {estaAtrasada(i) && (
                      <Badge variant="alerta" forma="etiqueta">
                        Foto {textoAtraso(i.anio, i.mes)}
                      </Badge>
                    )}
                  </span>
                </span>
                <Button asChild variant="ghost" size="sm" className="text-brand-700">
                  <Link href={`/nomina?inst=${encodeURIComponent(i.codigo)}`}>
                    Ver sus plazas
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
