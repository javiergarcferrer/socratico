import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import {
  PROVINCIAS,
  TOPE_PROVEEDORES,
  proveedoresPorProvincia,
} from "@/lib/provincias";
import { formatFecha, formatMonto } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { Card, CardTitle } from "@/components/ui/card";
import { BarrasHorizontales } from "@/components/graficos";
import { Cargando, EsqueletoFilas } from "@/components/esqueleto";
import { EstadoVacio } from "@/components/estado-vacio";
import { enlace } from "@/lib/grafo";

export const metadata: Metadata = {
  alternates: { canonical: "/provincias" },
  title: "Provincias",
  description:
    "El Estado dominicano por provincia: qué proveedores del Estado están inscritos en cada una, sus gobiernos locales y sus legisladores.",
};

// Dinámica por la misma razón que cada provincia: lo caro está en
// `lib/provincias.ts`, cacheado un día, y un fallo no se sirve congelado.
export const dynamic = "force-dynamic";

/**
 * El directorio del territorio: las 32 demarcaciones y, cuando el registro
 * contesta, cómo se reparten por provincia los mayores adjudicatarios
 * recientes del Estado. La lista de provincias llega al instante; el reparto
 * cae en su hueco.
 */
export default function ProvinciasPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          ¿Quién le vende al Estado desde cada provincia?
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          Cada provincia en una página: los proveedores del Estado inscritos en
          ella, sus ayuntamientos y quién la representa en el Congreso. El
          Distrito Nacional y las 31 provincias.
        </p>
      </header>

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle>Provincias</CardTitle>
        {/*
          Dos columnas ya en el teléfono: los nombres son cortos y en una sola
          la lista medía dos pantallas de enlaces de una palabra.
        */}
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[15px] lg:grid-cols-3">
          {PROVINCIAS.map((p) => (
            <li key={p.slug} className="min-w-0">
              <Link
                href={enlace.provincia(p.slug)}
                className="flex min-h-11 items-center break-words leading-snug text-brand-700 hover:underline sm:min-h-9"
              >
                {p.nombre}
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Suspense
        fallback={
          <Cargando>
            <p className="text-sm text-ink-soft">
              Consultando en el registro de proveedores la provincia de los mayores
              adjudicatarios recientes…
            </p>
            <EsqueletoFilas n={8} className="mt-3" />
          </Cargando>
        }
      >
        <Reparto />
      </Suspense>
    </div>
  );
}

async function Reparto() {
  const r = await proveedoresPorProvincia();
  if (!r) {
    return (
      <EstadoVacio variante="caida" titulo="El registro de proveedores no respondió">
        La DGCP no devolvió la ventana de contratos o las fichas del registro, así
        que no se puede decir hoy cómo se reparten los proveedores por provincia.
        Las páginas de cada provincia siguen enlazando a sus ayuntamientos y
        legisladores.
      </EstadoVacio>
    );
  }
  const filas = PROVINCIAS.map((p) => {
    const lista = r.porProvincia[p.slug] ?? [];
    return { p, n: lista.length, monto: lista.reduce((s, x) => s + x.monto, 0) };
  })
    .filter((f) => f.n > 0)
    .sort((a, b) => b.monto - a.monto);
  const max = Math.max(1, ...filas.map((f) => f.monto));

  return (
    <Card as="section" className="p-5 sm:p-6">
      <CardTitle>Dónde están inscritos los mayores adjudicatarios</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Muestra: los {formatInt(r.consultados)} proveedores que más adjudicaron en
        los {formatInt(r.contratosEscaneados)} contratos más recientes de la DGCP
        {r.desde && r.hasta ? ` (del ${formatFecha(r.desde)} al ${formatFecha(r.hasta)})` : ""}, de{" "}
        {formatInt(r.enVentana)} con contratos en esa ventana, según la provincia de
        su ficha en el Registro de Proveedores. No es el padrón de cada provincia.
      </p>
      <BarrasHorizontales
        className="mt-4"
        maximo={max}
        etiqueta="Monto adjudicado por provincia del proveedor"
        barras={filas.map(({ p, n, monto }) => ({
          clave: p.slug,
          etiqueta: p.nombre,
          titulo: `${p.nombre}: ${formatMonto(monto, "DOP")}`,
          valor: monto,
          cifra: formatMonto(monto, "DOP"),
          detalle: `${formatInt(n)} ${n === 1 ? "proveedor" : "proveedores"}`,
          href: enlace.provincia(p.slug),
        }))}
      />
      {r.sinProvincia > 0 && (
        <p className="mt-4 text-xs text-ink-soft">
          {formatInt(r.sinProvincia)} de los consultados tienen la provincia vacía o
          sin una provincia reconocible en su ficha, y {formatInt(r.consultados - r.conFicha)} no
          devolvieron ficha. El tope de {formatInt(TOPE_PROVEEDORES)} consultas es
          deliberado: el registro no se puede filtrar por provincia.
        </p>
      )}
    </Card>
  );
}
