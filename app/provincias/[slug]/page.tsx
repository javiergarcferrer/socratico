import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  hrefLegisladores,
  proveedoresPorProvincia,
  provinciaDeSlug,
  provinciaDeTexto,
  type Provincia,
} from "@/lib/provincias";
import { hrefInstitucion, institucionPorId } from "@/lib/instituciones";
import { filtrarObras, getObras, slugProvincia } from "@/lib/obras";
import { ConectadoCon } from "@/components/conectado-con";
import { getCortes } from "@/lib/cortes";
import { agujas, contieneTodas, plano } from "@/lib/raiz";
import { FilaObra } from "@/components/fuentes-nuevas/fila-obra";
import { formatFecha, formatMonto } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { desdeMayusculas } from "@/lib/congreso";
import { Ruta } from "@/components/ruta";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cargando, EsqueletoFilas } from "@/components/esqueleto";
import { EstadoVacio } from "@/components/estado-vacio";
import { enlace } from "@/lib/grafo";

/*
  Dinámica: la agrupación cara ya se cachea un día en `lib/provincias.ts` y un
  fallo no se guarda. Pre-generar las 32 en el build lanzaba 32 lecturas en
  frío a la vez contra el registro de la DGCP, y una caída durante el build
  quedaba servida un día.
*/
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = provinciaDeSlug((await params).slug);
  if (!p) return { title: "Provincia no encontrada" };
  return {
    title: p.nombre,
    alternates: { canonical: enlace.provincia(p.slug) },
    description: `${p.nombre} y el Estado: proveedores del Estado inscritos en la provincia, sus ayuntamientos y sus legisladores.`,
  };
}

/**
 * Ficha de provincia. Tres bloques, cada uno con su alcance dicho: los
 * proveedores (una muestra de los grandes adjudicatarios, del registro de la
 * DGCP), los gobiernos locales que el cruce sabe ubicar, y el enlace a sus
 * legisladores.
 */
export default async function ProvinciaPage({ params }: Props) {
  const p = provinciaDeSlug((await params).slug);
  if (!p) notFound();

  const ayuntamientos = p.ayuntamientos
    .map((id) => institucionPorId(id))
    .filter((i): i is NonNullable<typeof i> => i !== null)
    .map((i) => ({ id: i.id, nombre: i.nombre, href: hrefInstitucion(i) }));

  const obras = await getObras();
  const nObras = obras ? filtrarObras(obras.proyectos, { provincia: p.slug }).length : 0;
  const cortes = await getCortes().catch(() => null);
  const agujaProvincia = agujas(p.nombre);
  const nCortes = (cortes?.edesur ?? []).filter((c) =>
    contieneTodas(plano([c.provincia, c.municipio, c.zonas, c.circuito].filter(Boolean).join(" ")), agujaProvincia),
  ).length;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Ruta seccion="estado" padre={{ href: "/provincias", label: "Provincias" }} actual={p.nombre} />

      <Card as="section" className="p-5 sm:p-6">
        <div className="rotulo text-ink-soft">
          {p.slug === "distrito-nacional" ? "Distrito Nacional" : "Provincia"} · cabecera: {p.cabecera}
        </div>
        <h1 className="mt-1 font-display text-2xl leading-tight sm:text-3xl">
          ¿Qué hace el Estado en {p.nombre}?
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Quién de aquí le vende al Estado, qué ayuntamientos compran y quién
          representa a {p.nombre} en el Congreso.
        </p>
      </Card>

      <ConectadoCon
        aristas={[
          { etiqueta: "Sus diputados y su senador", href: hrefLegisladores(p), nombre: p.nombre, fuente: "SIL de la Cámara" },
          ...ayuntamientos.slice(0, 2).map((a) => ({
            etiqueta: "Ayuntamiento de la cabecera",
            href: a.href,
            nombre: desdeMayusculas(a.nombre),
            fuente: `DGCP ${a.id}`,
          })),
          { etiqueta: "Obras públicas", href: `/obras?provincia=${p.slug}`, cuenta: nObras, fuente: "MapaInversiones" },
          {
            // Solo Edesur dice la provincia de cada corte (Edenorte da el
            // municipio, y Edeeste no se lee): la arista es la de Edesur, con
            // el mismo filtro que la lista que abre, o no se pinta.
            etiqueta: "Cortes de luz programados por Edesur",
            href: `/luz?empresa=edesur&q=${encodeURIComponent(p.nombre)}`,
            cuenta: nCortes,
            fuente: "Mantenimientos anunciados por Edesur",
          },
          { etiqueta: "Sus cifras: robos, escuela y vivienda", href: "/pais", fuente: "MIP, MINERD y MIVHED" },
        ]}
      />

      <Suspense
        fallback={
          <Cargando>
            <p className="text-sm text-ink-soft">
              Consultando el registro de proveedores de la DGCP…
            </p>
            <EsqueletoFilas n={8} className="mt-3" />
          </Cargando>
        }
      >
        <Proveedores provincia={p} />
      </Suspense>

      <ObrasDeLaProvincia provincia={p} />

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle>Gobiernos locales</CardTitle>
        {ayuntamientos.length > 0 ? (
          <>
            <ul className="mt-3 divide-y divide-hairline text-[15px]">
              {ayuntamientos.map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    className="flex min-h-11 items-center justify-between gap-3 py-2 text-brand-700 hover:underline"
                  >
                    {a.nombre}
                    <span className="shrink-0 font-mono text-xs text-ink-soft">DGCP {a.id}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              Su ficha reúne lo que compra y a quién. Solo se listan los
              ayuntamientos que se sabe con certeza de {p.nombre}
              {p.slug === "santo-domingo" ? " (sus siete municipios)" : " (el de la cabecera)"}:
              el catálogo de unidades de compra de la DGCP no dice en qué provincia
              está cada ayuntamiento o junta de distrito, así que los demás no se
              asignan. Búscalos por nombre en{" "}
              <Link href="/instituciones" className="font-medium text-brand-700 hover:underline">
                Instituciones
              </Link>
              .
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            El ayuntamiento de {p.cabecera} no aparece como unidad de compra activa en
            la DGCP. Otros gobiernos locales pueden estar en{" "}
            <Link href="/instituciones" className="font-medium text-brand-700 hover:underline">
              Instituciones
            </Link>
            , sin provincia asignada.
          </p>
        )}
      </Card>
    </div>
  );
}

async function Proveedores({ provincia }: { provincia: Provincia }) {
  const r = await proveedoresPorProvincia();
  if (!r) {
    return (
      <EstadoVacio variante="caida" rotulo="Proveedores del Estado" titulo="El registro de proveedores no respondió">
        La DGCP no devolvió la ventana de contratos o las fichas del registro. No
        es que {provincia.nombre} no tenga proveedores: es que hoy no se pudo mirar.
        Los ayuntamientos y legisladores de abajo siguen en pie.
      </EstadoVacio>
    );
  }
  const lista = r.porProvincia[provincia.slug] ?? [];
  const alcance = (
    <>
      Muestra: de los {formatInt(r.consultados)} proveedores que más adjudicaron en
      los {formatInt(r.contratosEscaneados)} contratos más recientes de la DGCP
      {r.desde && r.hasta ? ` (del ${formatFecha(r.desde)} al ${formatFecha(r.hasta)})` : ""},
      los que su ficha del Registro de Proveedores ubica en {provincia.nombre}. El
      registro no se puede filtrar por provincia, así que esto no es el padrón:
      quien no está entre los mayores adjudicatarios recientes no aparece.
      Respondieron {formatInt(r.conFicha)} de {formatInt(r.consultados)} fichas.
      Calculado el {formatFecha(r.calculadoEn)}.
    </>
  );

  if (lista.length === 0) {
    return (
      <EstadoVacio rotulo="Proveedores del Estado" titulo={`Ninguno de los ${formatInt(r.conFicha)} mayores adjudicatarios recientes con ficha está inscrito en ${provincia.nombre}`}>
        {alcance}
      </EstadoVacio>
    );
  }

  const total = lista.reduce((s, x) => s + x.monto, 0);
  return (
    <Card as="section" className="p-5 sm:p-6">
      <CardTitle>Proveedores del Estado inscritos en {provincia.nombre}</CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
        <span className="font-mono tabular-nums text-ink">{formatInt(lista.length)}</span>{" "}
        {lista.length === 1 ? "proveedor" : "proveedores"} ·{" "}
        <span className="font-mono tabular-nums text-ink">{formatMonto(total, "DOP")}</span>{" "}
        adjudicados en la ventana
      </p>
      <ul className="mt-3 divide-y divide-hairline">
        {lista.map((x) => (
          <li key={x.rpe} className="relative py-3">
            <div className="flex items-baseline justify-between gap-3">
              <Link
                href={enlace.proveedor(x.rpe)}
                className="min-w-0 text-[15px] leading-snug text-ink estira hover:text-brand-700"
              >
                {x.razonSocial}
              </Link>
              <span className="shrink-0 font-mono text-sm tabular-nums text-ink">
                {formatMonto(x.monto, "DOP")}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
              {x.municipio && <span>{desdeMayusculas(x.municipio)}</span>}
              <span>
                {formatInt(x.contratos)} {x.contratos === 1 ? "contrato" : "contratos"}
              </span>
              {x.mipyme && <Badge variant="neutro">MIPYME</Badge>}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-ink-soft">{alcance}</p>
    </Card>
  );
}

/**
 * Las obras de inversión pública que MapaInversiones ubica en la provincia,
 * de mayor a menor valor. El nombre de la provincia se casa por la misma
 * tabla de alias que el registro de proveedores («Baoruco» es Bahoruco).
 */
async function ObrasDeLaProvincia({ provincia }: { provincia: Provincia }) {
  const inst = await getObras();
  if (!inst) return null;
  const aqui = inst.proyectos.filter((o) =>
    o.provincias.some((n) => provinciaDeTexto(n)?.slug === provincia.slug),
  );
  const nombreFuente = aqui
    .flatMap((o) => o.provincias)
    .find((n) => provinciaDeTexto(n)?.slug === provincia.slug);
  const lista = [...aqui].sort((a, b) => b.valor - a.valor).slice(0, 6);
  return (
    <Card as="section">
      <div className="p-5 pb-0 sm:p-6 sm:pb-0">
        <CardTitle>Obras públicas</CardTitle>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          {aqui.length === 0
            ? `MapaInversiones no ubica ninguna obra en ${provincia.nombre} (instantánea con corte al ${formatFecha(inst.corte)}).`
            : `${formatInt(aqui.length)} proyectos de inversión que MapaInversiones ubica en ${provincia.nombre}, los de mayor valor primero. Instantánea con corte al ${formatFecha(inst.corte)}; las obras de alcance nacional no se cuentan aquí.`}
        </p>
      </div>
      {lista.length > 0 && (
        <>
          <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
            {lista.map((o) => (
              <FilaObra key={o.snip} obra={o} />
            ))}
          </ul>
          {nombreFuente && (
            <div className="border-t border-hairline p-5 sm:px-6">
              <Button asChild variant="secondary">
                <Link href={`/obras?provincia=${slugProvincia(nombreFuente)}`}>
                  Ver las {formatInt(aqui.length)} obras
                </Link>
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
