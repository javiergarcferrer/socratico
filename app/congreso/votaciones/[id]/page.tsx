import Link from "next/link";
import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EstadoVacio } from "@/components/estado-vacio";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { Recuento } from "@/components/congreso/votaciones";
import { Ruta } from "@/components/ruta";
import ListaPlegada from "../../lista-plegada";
import {
  ETIQUETA_SENTIDO,
  ORDEN_SENTIDOS,
  desdeMayusculas,
  getVotacion,
  hrefLegislador,
  type SentidoVoto,
  type VotoNominal,
} from "@/lib/congreso";
import { formatFecha, SIN_DATO } from "@/lib/format";
import { enlace } from "@/lib/grafo";

// Una votación cerrada no cambia: el SIL se consulta como mucho una vez al día.
// Dinámica: el voto nominal ya se cachea un día por `fetch` en
// `lib/congreso.ts`; con ISR, una caída del SIL quedaba servida un día.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const VISIBLES_POR_SENTIDO = 12;

const cargarVotacion = cache((id: number) => getVotacion(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const d = await cargarVotacion(Number(id));
  if (d === "caida") return { title: "Votación del pleno" };
  if (d === "inexistente") return { title: "Votación no encontrada" };
  return {
    title: d.votacion.titulo,
    alternates: { canonical: enlace.votacion(id) },
    description: `${d.votacion.si} a favor, ${d.votacion.no} en contra: cómo votó cada diputado.`,
  };
}

/**
 * Una votación del pleno de Diputados con el voto de cada uno.
 *
 * El orden es el de siempre: qué se sometió, qué piezas decidía, cómo salió y,
 * al final, quién votó qué — primero por bancada, que es la pregunta que se
 * hace un ciudadano, y después nombre por nombre.
 */
export default async function VotacionPage({ params }: Props) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const d = await cargarVotacion(id);
  if (d === "caida") {
    return (
      <div className="mx-auto max-w-4xl">
        <Ruta seccion="congreso" actual="Votación" />
        <EstadoVacio
          variante="caida"
          className="mt-4"
          titulo="El SIL de la Cámara no respondió"
          accion={
            <Button asChild variant="secondary">
              <Link href="/congreso">Ir al Congreso</Link>
            </Button>
          }
        >
          No es que esta votación no exista: es que el sistema de información
          legislativa no contestó. El voto nominal vuelve solo cuando el origen se
          restablece.
        </EstadoVacio>
      </div>
    );
  }
  if (d === "inexistente") notFound();

  const { votacion: v, iniciativas, votos, totalVotos } = d;
  const emitidos = v.si + v.no + v.abstencion;

  const porSentido = new Map<SentidoVoto, VotoNominal[]>();
  const porPartido = new Map<string, Map<SentidoVoto, number>>();
  for (const voto of votos) {
    porSentido.set(voto.sentido, [...(porSentido.get(voto.sentido) ?? []), voto]);
    const partido = voto.partidoSiglas ?? "Sin partido";
    const fila = porPartido.get(partido) ?? new Map<SentidoVoto, number>();
    fila.set(voto.sentido, (fila.get(voto.sentido) ?? 0) + 1);
    porPartido.set(partido, fila);
  }
  const bancadas = [...porPartido.entries()]
    .map(([partido, fila]) => ({
      partido,
      fila,
      total: [...fila.values()].reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="mx-auto max-w-4xl">
      <Ruta seccion="congreso" actual={v.titulo} />

      <header className="mt-1 sm:mt-3">
        <p className="font-mono text-sm font-semibold tabular-nums text-brand-700">
          {[v.titulo, v.sesion && `sesión ${v.sesion}`].filter(Boolean).join(" · ")}
        </p>
        <h1 className="mt-2 break-words text-xl leading-snug text-ink sm:text-2xl">
          {v.mocion ?? "Votación del pleno"}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {v.fecha && <>{formatFecha(v.fecha)} · </>}
          <a
            href={`${enlace.votacion(v.id)}/csv`}
            download
            className="font-medium text-brand-700 hover:underline"
          >
            Descargar el voto nominal (CSV)
          </a>
        </p>
      </header>

      {iniciativas.length > 0 && (
        <Card as="section" className="mt-5">
          <CardHeader>
            <CardTitle>
              {iniciativas.length === 1 ? "La pieza que se votó" : "Las piezas que se votaron"}
            </CardTitle>
            <CardAction className="font-mono tabular-nums">{iniciativas.length}</CardAction>
          </CardHeader>
          <ListaPlegada
            total={iniciativas.length}
            visibles={4}
            etiqueta={`Ver las ${iniciativas.length} piezas`}
            etiquetaCerrar="Ocultar el resto de las piezas"
            render={(desde, hasta) => (
              <ul className="divide-y divide-hairline">
                {iniciativas.slice(desde, hasta).map((ini) => (
                  <li key={ini.id} className="relative px-5 py-3">
                    <Link
                      href={enlace.iniciativa(ini.id)}
                      className="font-mono text-xs font-semibold tabular-nums text-brand-700 estira hover:underline"
                    >
                      {ini.numero ?? `#${ini.id}`}
                    </Link>
                    <p className="mt-1 text-sm leading-snug text-ink">{desdeMayusculas(ini.titulo)}</p>
                  </li>
                ))}
              </ul>
            )}
          />
        </Card>
      )}

      <Card as="section" className="mt-5">
        <CardHeader>
          <CardTitle>¿Cómo salió?</CardTitle>
        </CardHeader>
        <TiraDeCifras>
          <Cifra etiqueta="A favor" valor={v.si} />
          <Cifra etiqueta="En contra" valor={v.no} />
          <Cifra etiqueta="Abstenciones" valor={v.abstencion} />
          <Cifra
            etiqueta="Presentes"
            valor={v.presentes ?? SIN_DATO}
            tono={v.presentes == null ? "text-ink-soft" : undefined}
            nota={v.miembros ? `de ${v.miembros} miembros` : undefined}
          />
        </TiraDeCifras>
        <div className="px-5 py-4">
          <Recuento votacion={v} emitidos={emitidos} />
        </div>
      </Card>

      {d.rollCallFallido && (
        <EstadoVacio
          variante="caida"
          className="mt-5"
          rotulo="¿Quién votó qué?"
          titulo="El voto nominal no respondió"
          accion={
            <Button asChild variant="secondary">
              <Link href="/fuentes">Ver el estado de las fuentes</Link>
            </Button>
          }
        >
          El SIL devolvió el recuento de esta votación pero no la lista de quién
          votó qué. No es que falte: es que no pudimos leerla ahora. El recuento de
          arriba sigue en pie.
        </EstadoVacio>
      )}

      {votos.length > 0 && (
        <>
          <Card as="section" className="mt-5">
            <CardHeader>
              <CardTitle>¿Cómo votó cada bancada?</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-hairline">
              {bancadas.map(({ partido, fila, total }) => (
                <li key={partido} className="px-5 py-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-ink">
                    <Badge variant="neutro">{partido}</Badge>
                    <span className="font-mono text-xs tabular-nums text-ink-soft">
                      {total} {total === 1 ? "miembro" : "miembros"}
                    </span>
                  </p>
                  <p className="mt-1 font-mono text-xs tabular-nums text-ink-soft">
                    {ORDEN_SENTIDOS.filter((s) => fila.has(s))
                      .map((s) => `${fila.get(s)} ${ETIQUETA_SENTIDO[s].toLowerCase()}`)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          <Card as="section" className="mt-5">
            <CardHeader>
              <CardTitle>¿Quién votó qué?</CardTitle>
              <CardAction className="font-mono tabular-nums">{votos.length}</CardAction>
            </CardHeader>
            {votos.length < totalVotos && (
              <Alert variant="aviso" role="note" className="m-5">
                <p className="text-xs text-alerta-700">
                  Faltan {totalVotos - votos.length} de {totalVotos} filas: el SIL no
                  respondió alguna página del voto nominal. Los recuentos de arriba
                  son los oficiales; las listas de abajo, incompletas.
                </p>
              </Alert>
            )}
            <div className="divide-y divide-hairline">
              {ORDEN_SENTIDOS.filter((s) => porSentido.has(s)).map((s) => {
                const lista = porSentido.get(s)!;
                return (
                  <section key={s}>
                    <h3 className="rotulo px-5 pb-1 pt-4 text-ink-soft">
                      {`${ETIQUETA_SENTIDO[s]} · ${lista.length}`}
                    </h3>
                    <ListaPlegada
                      total={lista.length}
                      visibles={VISIBLES_POR_SENTIDO}
                      etiqueta={`Ver los ${lista.length}: ${ETIQUETA_SENTIDO[s].toLowerCase()}`}
                      etiquetaCerrar="Ocultar el resto"
                      render={(desde, hasta) => (
                        <ul className="grid sm:grid-cols-2">
                          {lista.slice(desde, hasta).map((voto) => (
                            <li key={voto.legisladorId} className="relative px-5 py-2">
                              <Link
                                href={hrefLegislador(voto.legisladorId)}
                                className="text-sm text-ink estira hover:text-brand-700"
                              >
                                {voto.nombre}
                              </Link>
                              {voto.partidoSiglas && (
                                <span className="ml-2 font-mono text-xs text-ink-soft">
                                  {voto.partidoSiglas}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    />
                  </section>
                );
              })}
            </div>
          </Card>
        </>
      )}

      <p className="mt-5 text-xs leading-relaxed text-ink-soft">
        Fuente: registro de votaciones electrónicas del SIL de la Cámara de
        Diputados. «Presente, no votó» es quien marcó asistencia y no emitió
        voto; «Ausente» es quien no figuraba presente en esa votación. Presentes
        = a favor + en contra + abstenciones + presentes que no votaron.
      </p>
    </div>
  );
}
