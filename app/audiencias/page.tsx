import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { BuscadorUrl } from "@/components/buscador-url";
import { EstadoVacio } from "@/components/estado-vacio";
import { MarcaEstado } from "@/components/marca-estado";
import { Termino } from "@/components/termino";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ROL_PUBLICO,
  ahoraEnSantoDomingo,
  estadoEnLlano,
  proximaAudiencia,
  resultadoEnLlano,
  rolDeCaso,
  tonoDeAudiencia,
  validarNuc,
  type Audiencia,
  type RolDeCaso,
} from "@/lib/audiencias";
import { formatFecha, nombrePropio, tituloLegible } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { recortar } from "@/lib/raiz";

const METADATA: Metadata = {
  alternates: { canonical: "/audiencias" },
  title: "Audiencias de un caso",
  description:
    "Cuándo y dónde es la próxima audiencia de un caso y qué pasó en las anteriores, por su número único (NUC), según el Rol Nacional de Audiencias del Poder Judicial. Sin los nombres de las partes.",
};

type Props = { searchParams: Promise<{ q?: string }> };

/**
 * Con un número la página es la consulta de un caso ajeno: no se indexa ni se
 * siguen sus enlaces (límite del dueño, docs/DECISIONES.md), y su título no
 * lleva el número, que viajaría en cada vista previa de un enlace compartido.
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  return q?.trim() ? { ...METADATA, robots: { index: false, follow: false } } : METADATA;
}

/**
 * ¿Cuándo es la próxima audiencia de un caso? — el Rol Nacional de Audiencias
 * del Poder Judicial (`lib/audiencias.ts`), consultado en vivo por el número
 * único de caso exacto que escribe el lector, nunca por nombre.
 *
 * El número vive en la URL (`?q=`, el de `BuscadorUrl`), así que la consulta se
 * comparte y vuelve con «atrás». La validación la hace la capa: aquí solo se
 * dice, junto al campo, por qué un texto no puede ser un NUC. Los nombres de
 * las partes nunca llegan a esta página: la capa entrega solo sus papeles.
 */
export default async function AudienciasPage({ searchParams }: Props) {
  const { q: crudo } = await searchParams;
  const q = recortar(crudo, 60).trim();
  const validado = q ? validarNuc(q) : null;
  const error = validado && "error" in validado ? validado.error : null;
  const nuc = validado && "nuc" in validado ? validado.nuc : null;
  const rol = nuc ? await rolDeCaso(nuc) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="font-display text-3xl text-ink sm:text-4xl">¿Cuándo es la próxima audiencia de un caso?</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          Con el <Termino clave="nuc">número único del caso</Termino>, el Rol Nacional de Audiencias del Poder
          Judicial dice cuándo y dónde es la próxima audiencia y qué pasó en las anteriores, en todos los
          tribunales por los que ha pasado el caso. Aquí no salen los nombres de las partes: solo su papel en
          el caso.
        </p>
      </header>

      <Suspense>
        <BuscadorUrl
          etiqueta="Buscar las audiencias de un caso por su número único (NUC)"
          placeholder="Número único del caso (NUC)"
          ayuda="Solo por el número único del caso, exacto y con sus guiones, tal como lo da el tribunal. No se busca por nombre, cédula ni abogado. Se consulta en vivo el rol del Poder Judicial."
          error={error}
        />
      </Suspense>

      {!nuc ? (
        <DondeEstaElNumero />
      ) : !rol ? (
        <EstadoVacio
          variante="caida"
          titulo="No pudimos consultar el Rol Nacional de Audiencias"
          accion={
            <Button asChild variant="secondary">
              <a href={ROL_PUBLICO} target="_blank" rel="noopener noreferrer">
                Consultar en el rol del Poder Judicial
              </a>
            </Button>
          }
        >
          El rol del Poder Judicial no contestó a tiempo o devolvió otra cosa que la lista de audiencias. No es
          que el caso no tenga audiencias: es que no pudimos mirar. El resto de la plataforma sigue en pie.
        </EstadoVacio>
      ) : rol.audiencias.length === 0 ? (
        <EstadoVacio titulo={`El rol no tiene audiencias para el caso «${rol.nuc}»`}>
          La consulta es exacta: revisa que el número esté completo y con sus guiones, tal como aparece en la
          citación o en los documentos del caso. Un caso sin audiencias fijadas o conocidas no sale en el rol.
        </EstadoVacio>
      ) : (
        <Resultado rol={rol} />
      )}

      <p className="px-1 text-xs leading-relaxed text-ink-soft">
        Fuente:{" "}
        <a href={ROL_PUBLICO} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
          Rol Nacional de Audiencias del Poder Judicial
        </a>
        {rol ? `, consultado el ${formatFecha(rol.consultado, true)} y guardado una hora` : ", consultado en vivo y guardado una hora por número"}
        . Se pregunta solo por el número exacto que escribes; nunca por nombre, cédula ni abogado, y esta
        página no se ofrece a los buscadores. Los nombres de las partes no se muestran ni se guardan: solo su
        papel. El enlace de una sala virtual está en el rol del Poder Judicial. Ver{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          el estado de las fuentes
        </Link>
        .
      </p>
    </div>
  );
}

/** Antes de buscar, o con un texto que no vale: qué es el NUC y dónde encontrarlo. */
function DondeEstaElNumero() {
  return (
    <Card as="section">
      <CardHeader>
        <CardTitle>¿Dónde está el número del caso?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-[15px] leading-relaxed text-ink-soft sm:text-sm">
        <p>
          Es el número con que el Poder Judicial sigue el caso en todos sus tribunales: el mismo en primera
          instancia, en apelación y en la Suprema Corte. Suele venir en la citación, en la notificación de la
          audiencia y en los documentos del caso. Si no lo tienes, pídelo en la secretaría del tribunal o a quien
          lleva el caso.
        </p>
        <p>
          No tiene un solo formato: puede ser una cifra larga o cifras separadas por guiones, a veces con
          letras. Escríbelo tal como aparece, con sus guiones.
        </p>
      </CardContent>
    </Card>
  );
}

/** «13 oct 2026, 9:00 a. m.»; sin hora si el rol no la da. */
function cuando(fecha: string): string {
  return fecha.includes("T") ? formatFecha(fecha, true) : formatFecha(fecha);
}

/** Solo la hora local que da el rol («9:00 a. m.»), o `null` si no da hora. */
function hora(fecha: string): string | null {
  if (!fecha.includes("T")) return null;
  // Hora de pared sin zona, como `formatFecha`: se escribe tal cual, sin convertir.
  return new Intl.DateTimeFormat("es-DO", { timeStyle: "short", timeZone: "UTC" }).format(new Date(`${fecha}Z`));
}

/** Días de calendario entre hoy y una fecha, en llano: «hoy», «mañana», «dentro de 12 días». */
function faltan(fecha: string, ahora: string): string {
  const dias = Math.round((Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`) - Date.parse(`${ahora.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "mañana";
  return `dentro de ${formatInt(dias)} días`;
}

function tribunalYSala(a: Audiencia): string {
  const tribunal = a.tribunal ? nombrePropio(a.tribunal) : null;
  const sala = a.sala && a.sala !== a.tribunal ? nombrePropio(a.sala) : null;
  return [tribunal, sala].filter(Boolean).join(" · ") || "Tribunal sin nombre en el rol";
}

/** «Recurrente (3), abogado»: los papeles, nunca los nombres (la capa ya los quitó). */
function partes(a: Audiencia): string | null {
  const lista = a.papeles.map((p) => (p.cuantas > 1 ? `${p.papel} (${formatInt(p.cuantas)})` : p.papel));
  if (a.otrasPartes > 0) lista.push(a.otrasPartes === 1 ? "una con otro papel" : `${formatInt(a.otrasPartes)} con otro papel`);
  if (lista.length === 0) return null;
  const texto = lista.join(", ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function Resultado({ rol }: { rol: RolDeCaso }) {
  const ahora = ahoraEnSantoDomingo();
  const proxima = proximaAudiencia(rol, ahora);
  const ultima = rol.audiencias.find((a) => a.fecha && a.fecha.slice(0, 10) < ahora.slice(0, 10)) ?? null;
  const tribunales = new Set(rol.audiencias.map((a) => a.tribunal).filter(Boolean)).size;
  const materias = [...new Set(rol.audiencias.map((a) => a.materia).filter((m): m is string => !!m))];
  const donde = tribunales > 0 ? ` en ${formatInt(tribunales)} ${tribunales === 1 ? "tribunal" : "tribunales"}` : "";
  const materia = materias.length > 0 ? `, materia ${materias.map((m) => tituloLegible(m).toLowerCase()).join(" y ")}` : "";

  return (
    <>
      <Card as="section" aria-labelledby="proxima-titulo">
        <CardHeader>
          <CardTitle id="proxima-titulo">La próxima audiencia</CardTitle>
          <CardAction className="font-mono tabular-nums">Caso {rol.nuc}</CardAction>
        </CardHeader>
        {proxima ? (
          <CardContent className="space-y-1.5">
            <p className="font-mono text-xl font-semibold tabular-nums text-ink">
              <time dateTime={proxima.fecha}>{cuando(proxima.fecha)}</time>
            </p>
            <p className="text-xs text-ink-soft">{faltan(proxima.fecha, ahora)}</p>
            {proxima.porAplazamiento ? (
              <p className="text-[15px] leading-snug text-ink sm:text-sm">
                La audiencia del {cuando(proxima.audiencia.fecha ?? proxima.fecha)} en{" "}
                {tribunalYSala(proxima.audiencia)} se aplazó para esa fecha; el rol todavía no la lista como una
                audiencia nueva.
              </p>
            ) : (
              <>
                <p className="text-[15px] leading-snug text-ink sm:text-sm">{tribunalYSala(proxima.audiencia)}</p>
                <p className="text-xs leading-relaxed text-ink-soft">
                  {[
                    proxima.audiencia.lugar,
                    proxima.audiencia.modalidad,
                    proxima.audiencia.asunto && tituloLegible(proxima.audiencia.asunto),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {/virtual/i.test(proxima.audiencia.modalidad ?? "") && (
                  <p className="text-xs leading-relaxed text-ink-soft">
                    El enlace de la sala virtual está en el rol del Poder Judicial.
                  </p>
                )}
              </>
            )}
          </CardContent>
        ) : (
          <CardContent>
            <p className="text-[15px] leading-relaxed text-ink sm:text-sm">
              El rol no tiene una audiencia fijada desde hoy.
              {ultima?.fecha &&
                ` La más reciente fue el ${cuando(ultima.fecha)}, en ${tribunalYSala(ultima)}${
                  ultima.resultado ? `: ${resultadoEnLlano(ultima.resultado)?.toLowerCase()}` : ""
                }.`}
            </p>
          </CardContent>
        )}
      </Card>

      <Card as="section" className="overflow-hidden" aria-labelledby="historial-titulo">
        <CardHeader>
          <CardTitle id="historial-titulo">Todas las audiencias del caso</CardTitle>
          <CardAction className="font-mono tabular-nums">{formatInt(rol.total)}</CardAction>
        </CardHeader>
        <p className="px-5 pt-3 text-xs leading-relaxed text-ink-soft">
          {rol.truncado
            ? `Aquí van las ${formatInt(rol.audiencias.length)} audiencias más recientes de las ${formatInt(rol.total)} que el rol lista para este caso${donde}${materia}, de la más reciente a la más antigua.`
            : `${formatInt(rol.audiencias.length)} ${rol.audiencias.length === 1 ? "audiencia" : "audiencias"}${donde}${materia}, de la más reciente a la más antigua.`}
        </p>

        {/*
          En el teléfono cada audiencia es una ficha apilada —cuándo, dónde, en
          qué quedó, de qué y con quién—; desde `sm` manda el cuadro, que es
          donde se comparan cuatro columnas (docs/IDENTIDAD.md §8).
        */}
        <ol className="mt-2 divide-y divide-hairline border-t border-hairline sm:hidden">
          {rol.audiencias.map((a, i) => (
            <li key={a.id ?? i} className="space-y-1 px-5 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {a.fecha ? (
                  <time dateTime={a.fecha} className="font-mono text-sm font-semibold tabular-nums text-ink">
                    {cuando(a.fecha)}
                  </time>
                ) : (
                  <span className="text-sm text-ink-soft">Sin fecha en el rol</span>
                )}
                <MarcaEstado tono={tonoDeAudiencia(a.estado)} title={a.estado ? `El rol la marca «${a.estado}»` : undefined}>
                  {estadoEnLlano(a.estado)}
                </MarcaEstado>
              </div>
              <p className="text-[15px] leading-snug text-ink">{tribunalYSala(a)}</p>
              <Detalle a={a} />
            </li>
          ))}
        </ol>

        <Table className="mt-2 hidden sm:table">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Cuándo</TableHead>
              <TableHead>Dónde</TableHead>
              <TableHead>En qué quedó</TableHead>
              <TableHead className="pr-5">Asunto y partes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rol.audiencias.map((a, i) => (
              <TableRow key={a.id ?? i}>
                <TableCell className="pl-5 align-top font-mono text-xs tabular-nums text-ink">
                  {/* La fecha y la hora en su renglón cada una: partida a mitad, «9:00 / a. m.» no se leía. */}
                  {a.fecha ? (
                    <time dateTime={a.fecha}>
                      <span className="block whitespace-nowrap">{formatFecha(a.fecha.slice(0, 10))}</span>
                      {hora(a.fecha) && <span className="block whitespace-nowrap text-ink-soft">{hora(a.fecha)}</span>}
                    </time>
                  ) : (
                    "Sin fecha"
                  )}
                </TableCell>
                <TableCell className="min-w-44 align-top text-sm leading-snug text-ink">
                  {tribunalYSala(a)}
                  {a.modalidad && <span className="mt-0.5 block text-xs text-ink-soft">{a.modalidad}</span>}
                </TableCell>
                <TableCell className="align-top text-sm">
                  <MarcaEstado tono={tonoDeAudiencia(a.estado)} title={a.estado ? `El rol la marca «${a.estado}»` : undefined}>
                    {estadoEnLlano(a.estado)}
                  </MarcaEstado>
                  <EnQueQuedo a={a} />
                </TableCell>
                <TableCell className="min-w-48 pr-5 align-top text-xs leading-relaxed text-ink-soft">
                  {a.asunto && <span className="block text-sm text-ink">{tituloLegible(a.asunto)}</span>}
                  {partes(a) && <span className="block">Partes: {partes(a)}</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

/** El resultado de una audiencia y, si se aplazó con fecha, para cuándo. */
function EnQueQuedo({ a }: { a: Audiencia }) {
  const r = resultadoEnLlano(a.resultado);
  if (!r) return null;
  return (
    <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
      {/reservado/i.test(r) ? <Termino clave="falloReservado">{r}</Termino> : r}
      {a.nuevaFecha && ` para el ${cuando(a.nuevaFecha)}`}
    </span>
  );
}

/** En el teléfono: en qué quedó, de qué trata y los papeles de las partes. */
function Detalle({ a }: { a: Audiencia }) {
  const p = partes(a);
  return (
    <>
      <EnQueQuedo a={a} />
      {(a.asunto || a.modalidad) && (
        <p className="text-xs leading-relaxed text-ink-soft">
          {[a.asunto && tituloLegible(a.asunto), a.modalidad].filter(Boolean).join(" · ")}
        </p>
      )}
      {p && <p className="text-xs leading-relaxed text-ink-soft">Partes: {p}</p>}
    </>
  );
}
