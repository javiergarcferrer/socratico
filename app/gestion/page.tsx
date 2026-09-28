import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getSismap, TABLAS_SISMAP, type TablaSismap } from "@/lib/sismap";
import { hrefInstitucion, institucionPorId } from "@/lib/instituciones";
import { formatFecha } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";
import { NavFiltros, FiltroEnlace } from "@/components/nav-filtros";
import { BuscadorUrl } from "@/components/buscador-url";
import { EstadoVacio } from "@/components/estado-vacio";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { agujas, contieneTodas, plano, recortar } from "@/lib/raiz";

export const metadata: Metadata = {
  alternates: { canonical: "/gestion" },
  title: "Calidad de la gestión pública",
  description:
    "El ranking del SISMAP: cuánto cumple cada institución del Gobierno central, cada ayuntamiento y cada junta de distrito los indicadores de gestión del Ministerio de Administración Pública.",
};

export const revalidate = 86400;

/**
 * ¿Qué tan bien se gestiona? — el ranking del SISMAP en tres tablas.
 *
 * Se muestra entero (son 181, 160 y 233 filas) porque un ranking recortado
 * esconde justo a los de abajo. La tabla y la búsqueda viven en la URL.
 */
export default async function GestionPage({
  searchParams,
}: {
  searchParams: Promise<{ tabla?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const d = await getSismap();
  if (!d) {
    return (
      <EstadoVacio
        variante="caida"
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="No pudimos leer el ranking del SISMAP"
        accion={
          <Button asChild variant="secondary">
            <Link href="/fuentes">Ver el estado de las fuentes</Link>
          </Button>
        }
      >
        La copia del ranking no está disponible en este momento. No es que no haya
        datos de gestión: es que no pudimos mirar.
      </EstadoVacio>
    );
  }
  const tabla: TablaSismap = TABLAS_SISMAP.some((t) => t.clave === sp.tabla)
    ? (sp.tabla as TablaSismap)
    : "instituciones";
  const actual = TABLAS_SISMAP.find((t) => t.clave === tabla)!;
  const todas = d[tabla];
  const q = recortar(sp.q, 80);
  const aguja = q ? agujas(q) : null;
  const filas = aguja ? todas.filter((f) => contieneTodas(plano(f.nombre), aguja)) : todas;
  const valores = todas.map((f) => f.valor).sort((a, b) => a - b);
  const mediana = valores.length ? valores[Math.floor(valores.length / 2)] : 0;
  const bajoLaMitad = todas.filter((f) => f.valor < 50).length;

  return (
    <div className="space-y-5">
      <Portada
        rotulo={`Gestión pública · SISMAP · consultado el ${formatFecha(d.consultado)}`}
        titulo="¿Qué tan bien se gestiona?"
        descripcion={
          <>
            El Ministerio de Administración Pública mide con el SISMAP cuánto cumple
            cada organismo sus indicadores de gestión, a partir de las evidencias que
            el organismo remite a la entidad que rige cada indicador. Mide
            cumplimiento de procesos, no resultados, y no es una auditoría. El SISMAP
            no publica fecha de corte: la de arriba es la del día en que lo
            consultamos.
          </>
        }
      >
        <PortadaCifras>
          <PortadaCifra etiqueta={`${actual.nombre} en el ranking`} valor={formatInt(todas.length)} destacar />
          <PortadaCifra etiqueta="Valoración mediana" valor={`${mediana.toFixed(1)} %`} />
          <PortadaCifra etiqueta="Por debajo del 50 %" valor={formatInt(bajoLaMitad)} />
          <PortadaCifra etiqueta="Primer puesto" valor={`${(todas[0]?.valor ?? 0).toFixed(1)} %`} />
        </PortadaCifras>
      </Portada>

      <NavFiltros etiqueta="Qué ranking ver">
        {TABLAS_SISMAP.map((t) => (
          <FiltroEnlace key={t.clave} href={`/gestion?${new URLSearchParams(q ? { tabla: t.clave, q } : { tabla: t.clave })}`} activo={t.clave === tabla}>
            {t.nombre} · {formatInt(d[t.clave].length)}
          </FiltroEnlace>
        ))}
      </NavFiltros>

      <Suspense>
        <BuscadorUrl
          etiqueta={`Buscar en ${actual.nombre.toLowerCase()}`}
          placeholder="Nombre: Educación, Santiago, Canca la Reina…"
          ayuda={`Busca todas las palabras en el nombre de las ${formatInt(todas.length)} filas de este ranking, en cualquier orden y sin distinguir tildes.`}
        />
      </Suspense>

      {filas.length === 0 ? (
        <EstadoVacio
          titulo={`Ningún nombre coincide con «${q}»`}
          accion={
            <Button asChild variant="secondary">
              <Link href={`/gestion?tabla=${tabla}`}>Ver el ranking entero</Link>
            </Button>
          }
        >
          Prueba con otra palabra o cambia de ranking.
        </EstadoVacio>
      ) : (
        <Card as="section">
          <ol className="divide-y divide-hairline">
            {filas.map((f) => {
              const inst = f.uc ? institucionPorId(f.uc) : null;
              return (
                <li key={`${f.posicion}-${f.nombre}`} className="relative px-4 py-3 sm:px-5">
                  <div className="flex items-baseline gap-3">
                    <span className="w-9 shrink-0 font-mono text-sm font-semibold tabular-nums text-ink-soft">
                      {f.posicion}
                    </span>
                    <span className="min-w-0 flex-1">
                      {inst ? (
                        <Link
                          href={hrefInstitucion(inst)}
                          className="block text-[15px] leading-snug text-ink estira hover:text-brand-700"
                        >
                          {f.nombre}
                        </Link>
                      ) : (
                        <span className="block text-[15px] leading-snug text-ink">{f.nombre}</span>
                      )}
                      {f.sector && <span className="mt-0.5 block text-xs text-ink-soft">{f.sector}</span>}
                    </span>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-ink">{f.valor.toFixed(2)} %</span>
                  </div>
                  <Progress
                    value={f.valor}
                    aria-label={`${f.nombre}: ${f.valor.toFixed(2)} %`}
                    className="mt-2 ml-12"
                    indicadorClassName={f.valor < 50 ? "bg-alerta-500" : undefined}
                  />
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuente:{" "}
        <a href={d.fuente} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
          SISMAP, Ministerio de Administración Pública
        </a>
        . Instantánea del {formatFecha(d.consultado)}. Las filas con enlace llevan a la
        ficha de la institución en esta plataforma; el cruce es por nombre y la que
        no casa se queda sin enlace. Mira{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          el estado de las fuentes
        </Link>
        .
      </p>
    </div>
  );
}
