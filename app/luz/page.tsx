import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getCortes, NOMBRE_EMPRESA, type Corte, type Empresa, type FuenteCortes } from "@/lib/cortes";
import { formatFecha } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";
import { NavFiltros, FiltroEnlace } from "@/components/nav-filtros";
import { BuscadorUrl } from "@/components/buscador-url";
import { EstadoVacio } from "@/components/estado-vacio";
import Antiguedad from "@/components/antiguedad";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { agujas, contieneTodas, plano, recortar } from "@/lib/raiz";

export const metadata: Metadata = {
  alternates: { canonical: "/luz" },
  title: "Cortes de luz programados",
  description:
    "Los mantenimientos programados que Edenorte y Edesur anuncian para esta semana: qué sectores se quedan sin luz, qué día y a qué hora.",
};

export const revalidate = 21600;

const EMPRESAS: Empresa[] = ["edenorte", "edesur"];

/** «2026-09-25» → «viernes 25 de septiembre»: el día se nombra, no se codifica. */
function nombreDia(fecha: string): string {
  return new Intl.DateTimeFormat("es-DO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })
    .format(new Date(`${fecha}T12:00:00Z`))
    .replace(",", "");
}

function mas(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** «PODA PREVENTIVO» → «Poda preventivo»: la fuente grita, la página no. */
function causaLegible(c: string): string {
  const b = c.toLowerCase();
  return b.charAt(0).toUpperCase() + b.slice(1);
}

function ventanaHoraria(c: Corte): string {
  return c.hasta ? `${c.desde}–${c.hasta}` : c.desde;
}

/** «del 12 al 18 de septiembre», para decir qué semana cubre lo último publicado. */
function semana(f: FuenteCortes): string | null {
  if (!f.semanaDesde || !f.semanaHasta) return f.ultimaPublicacion;
  return `del ${formatFecha(f.semanaDesde)} al ${formatFecha(f.semanaHasta)}`;
}

/**
 * ¿Me van a quitar la luz esta semana? — los mantenimientos que las
 * distribuidoras anuncian por adelantado (`lib/cortes.ts`).
 *
 * Solo lo programado y de hoy en adelante. Cada empresa se lee por su lado: si
 * una no contesta, la otra sigue en pie y la página lo dice con su nombre.
 * Empresa y búsqueda viven en la URL.
 */
export default async function LuzPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const d = await getCortes();
  const empresa = EMPRESAS.find((e) => e === sp.empresa) ?? null;
  const q = recortar(sp.q, 80);
  const aguja = q ? agujas(q) : null;

  const vistas = (empresa ? [empresa] : EMPRESAS).filter((e) => d[e] !== null);
  const caidas = (empresa ? [empresa] : EMPRESAS).filter((e) => d[e] === null);
  const todas = vistas.flatMap((e) => d[e] ?? []).sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.desde.localeCompare(b.desde),
  );
  const filas = aguja
    ? todas.filter((c) =>
        contieneTodas(plano([c.provincia, c.municipio, c.zonas, c.circuito].filter(Boolean).join(" ")), aguja),
      )
    : todas;

  const porDia = new Map<string, Corte[]>();
  for (const c of filas) porDia.set(c.fecha, [...(porDia.get(c.fecha) ?? []), c]);

  const total = EMPRESAS.reduce((n, e) => n + (d[e]?.length ?? 0), 0);
  const diasConCortes = new Set(EMPRESAS.flatMap((e) => (d[e] ?? []).map((c) => c.fecha))).size;
  const atrasadas = EMPRESAS.filter(
    (e) => d[e] !== null && d.fuentes[e].semanaHasta !== null && d.fuentes[e].semanaHasta! < d.hoy,
  );

  const url = (cambios: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const todo = { empresa: empresa ?? undefined, q: sp.q?.trim() || undefined, ...cambios };
    for (const [k, v] of Object.entries(todo)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `/luz?${s}` : "/luz";
  };

  return (
    <div className="space-y-5">
      <Portada
        rotulo={`Luz · mantenimientos programados · Edenorte y Edesur · al ${formatFecha(d.hoy)}`}
        titulo="¿Me van a quitar la luz esta semana?"
        descripcion={
          <>
            Los cortes que Edenorte y Edesur anuncian por adelantado para trabajar
            en sus redes: qué sectores, qué día y en qué horario. Solo se muestran
            los de hoy en adelante. Edeeste publica su programa únicamente en PDF y
            no está en esta lista. Los apagones por averías o por falta de
            generación no se anuncian, así que tampoco están aquí.
          </>
        }
        aviso={
          atrasadas.length > 0
            ? atrasadas
                .map((e) => `${NOMBRE_EMPRESA[e]} no ha publicado la semana en curso: lo último que publicó es ${semana(d.fuentes[e])}`)
                .join(" · ")
            : undefined
        }
      >
        <PortadaCifras>
          <PortadaCifra etiqueta="Cortes anunciados de hoy en adelante" valor={formatInt(total)} destacar />
          {EMPRESAS.map((e) => (
            <PortadaCifra
              key={e}
              etiqueta={NOMBRE_EMPRESA[e]}
              valor={d[e] === null ? "sin respuesta" : formatInt(d[e]!.length)}
            />
          ))}
          <PortadaCifra etiqueta="Días con cortes" valor={formatInt(diasConCortes)} />
        </PortadaCifras>
      </Portada>

      <NavFiltros etiqueta="Qué empresa ver">
        <FiltroEnlace href={url({ empresa: undefined })} activo={!empresa}>
          Todas · {formatInt(total)}
        </FiltroEnlace>
        {EMPRESAS.map((e) => (
          <FiltroEnlace key={e} href={url({ empresa: e })} activo={empresa === e}>
            {NOMBRE_EMPRESA[e]} · {d[e] === null ? "sin respuesta" : formatInt(d[e]!.length)}
          </FiltroEnlace>
        ))}
      </NavFiltros>

      <Suspense>
        <BuscadorUrl
          etiqueta="Buscar tu sector"
          placeholder="Provincia, municipio, sector o circuito: Naco, Moca, Baní…"
          ayuda={`Busca en la provincia, el municipio, los sectores y el circuito de los ${formatInt(todas.length)} cortes anunciados de hoy en adelante${empresa ? ` por ${NOMBRE_EMPRESA[empresa]}` : ""}, todas las palabras en cualquier orden y sin distinguir tildes.`}
        />
      </Suspense>

      {caidas.map((e) => (
        <EstadoVacio
          key={e}
          variante="caida"
          titulo={`No pudimos leer el programa de ${NOMBRE_EMPRESA[e]}`}
          accion={
            <Button asChild variant="secondary">
              <a href={d.fuentes[e].pagina} target="_blank" rel="noopener noreferrer">
                Ver el programa en el sitio de {NOMBRE_EMPRESA[e]}
                <span className="sr-only">(se abre en otra pestaña)</span>
              </a>
            </Button>
          }
        >
          Su sitio no contestó o cambió de formato. No quiere decir que no haya cortes
          programados en su zona: quiere decir que no pudimos mirar.
          {vistas.length > 0 && ` Lo de ${vistas.map((v) => NOMBRE_EMPRESA[v]).join(" y ")} sigue abajo.`}
        </EstadoVacio>
      ))}

      {vistas.length === 0 ? null : filas.length === 0 ? (
        q ? (
          <EstadoVacio
            titulo={`Ningún corte anunciado coincide con «${q}»`}
            accion={
              <Button asChild variant="secondary">
                <Link href={url({ q: undefined })}>Ver todos los cortes anunciados</Link>
              </Button>
            }
          >
            No aparece en lo que {vistas.map((v) => NOMBRE_EMPRESA[v]).join(" y ")}{" "}
            {vistas.length > 1 ? "han" : "ha"} publicado de hoy en adelante. Prueba con el municipio o la provincia: las
            empresas escriben los sectores a su manera.
          </EstadoVacio>
        ) : (
          <EstadoVacio titulo="No hay mantenimientos anunciados de hoy en adelante">
            {vistas.map((v) => NOMBRE_EMPRESA[v]).join(" y ")}{" "}
            {vistas.length > 1 ? "no tienen" : "no tiene"} cortes programados publicados
            desde hoy.
            {atrasadas.some((a) => vistas.includes(a)) &&
              ` Puede ser que todavía no ${vistas.length > 1 ? "hayan" : "haya"} subido la semana en curso: mira el aviso de arriba.`}{" "}
            Eso no cubre las averías ni los apagones por falta de generación.
          </EstadoVacio>
        )
      ) : (
        <div className="space-y-4">
          {[...porDia.entries()].map(([fecha, cortes]) => (
            <Card as="section" key={fecha} aria-labelledby={`dia-${fecha}`}>
              <CardHeader>
                <CardTitle id={`dia-${fecha}`} className="first-letter:uppercase">
                  {nombreDia(fecha)}
                  {fecha === d.hoy && <span className="font-normal text-ink-soft"> · hoy</span>}
                  {fecha === mas(d.hoy, 1) && <span className="font-normal text-ink-soft"> · mañana</span>}
                </CardTitle>
                <CardAction className="font-mono text-xs tabular-nums text-ink-soft">
                  {formatInt(cortes.length)} {cortes.length === 1 ? "corte" : "cortes"}
                </CardAction>
              </CardHeader>
              <ol className="divide-y divide-hairline">
                {cortes.map((c, i) => (
                  <li key={`${c.empresa}-${i}`} className="px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-mono text-sm font-semibold tabular-nums text-ink">
                        {ventanaHoraria(c)}
                      </span>
                      <span className="text-[15px] font-medium leading-snug text-ink">
                        {c.municipio ?? c.provincia ?? "Lugar no indicado"}
                      </span>
                      {!empresa && (
                        <Badge forma="etiqueta" variant="contorno">
                          {NOMBRE_EMPRESA[c.empresa]}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-[15px] leading-relaxed text-ink [overflow-wrap:anywhere]">
                      {c.zonas}
                    </p>
                    {(c.circuito || c.causa) && (
                      <p className="mt-1 text-xs text-ink-soft">
                        {c.circuito && (
                          <>
                            Circuito <span className="font-mono">{c.circuito}</span>
                          </>
                        )}
                        {c.circuito && c.causa && " · "}
                        {c.causa && causaLegible(c.causa)}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      )}

      <Card as="section" aria-labelledby="que-publica">
        <CardHeader>
          <CardTitle id="que-publica">Qué publica cada empresa</CardTitle>
        </CardHeader>
        <ul className="divide-y divide-hairline text-sm">
          <li className="px-4 py-3 sm:px-5">
            <span className="font-medium text-ink">Edenorte</span>
            <span className="text-ink-soft">
              {" "}
              · una entrada por semana con municipio, circuito, horario, sectores y causa.{" "}
              {d.edenorte === null ? (
                "No contestó en esta consulta."
              ) : (
                <>
                  Lo último publicado cubre {semana(d.fuentes.edenorte)}
                  {d.fuentes.edenorte.publicado && (
                    <>
                      {" "}
                      (<Antiguedad iso={d.fuentes.edenorte.publicado} prefijo="subido" />)
                    </>
                  )}
                  ; se leyeron las dos entradas más recientes, {formatInt(d.fuentes.edenorte.leidas)} filas.
                </>
              )}{" "}
              <a
                href={d.fuentes.edenorte.pagina}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-700 hover:underline"
              >
                Ver en Edenorte
                <span className="sr-only"> (se abre en otra pestaña)</span>
              </a>
            </span>
          </li>
          <li className="px-4 py-3 sm:px-5">
            <span className="font-medium text-ink">Edesur</span>
            <span className="text-ink-soft">
              {" "}
              · la semana en curso, de sábado a viernes, por provincia y horario, sin
              circuito ni causa.{" "}
              {d.edesur === null ? (
                "No contestó en esta consulta."
              ) : (
                <>
                  La página cubre {semana(d.fuentes.edesur)}: {formatInt(d.fuentes.edesur.leidas)} cortes
                  en total, pasados incluidos.
                </>
              )}{" "}
              <a
                href={d.fuentes.edesur.pagina}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-700 hover:underline"
              >
                Ver en Edesur
                <span className="sr-only"> (se abre en otra pestaña)</span>
              </a>
            </span>
          </li>
          <li className="px-4 py-3 sm:px-5">
            <span className="font-medium text-ink">Edeeste</span>
            <span className="text-ink-soft">
              {" "}
              · publica su programa solo como PDF semanal, que esta página no lee.{" "}
              <a
                href={d.fuentes.edeeste.pagina}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-700 hover:underline"
              >
                Ver los PDF de Edeeste
                <span className="sr-only"> (se abre en otra pestaña)</span>
              </a>
            </span>
          </li>
        </ul>
      </Card>

      <p className="text-xs leading-relaxed text-ink-soft">
        Aquí están solo los mantenimientos programados que publican Edenorte y
        Edesur, leídos en sus sitios cada seis horas; Edeeste los publica solo en
        PDF. Los cortes que no se programan (averías, apagones por déficit de
        generación) no aparecen en esta lista: cómo anduvo la generación está en{" "}
        <Link href="/indicadores" className="font-medium text-brand-700 hover:underline">
          la tarjeta de electricidad de los indicadores
        </Link>
        . Los horarios son los que la empresa anuncia y pueden cambiar. Mira{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          el estado de las fuentes
        </Link>
        .
      </p>
    </div>
  );
}
