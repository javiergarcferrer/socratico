import Link from "next/link";
import { Suspense, cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import IniciativaCard from "@/components/iniciativa-card";
import { FilaVotacion } from "@/components/congreso/votaciones";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { EstadoVacio } from "@/components/estado-vacio";
import { Esqueleto } from "@/components/esqueleto";
import { FiltroEnlace, NavFiltros } from "@/components/nav-filtros";
import { Ruta } from "@/components/ruta";
import ListaPlegada from "../../lista-plegada";
import {
  ETIQUETA_SENTIDO,
  ORDEN_SENTIDOS,
  getLegislador,
  getPropuestasDeLegislador,
  getVotosDeLegislador,
  parseLegislatura,
  type Iniciativa,
  type SentidoVoto,
} from "@/lib/congreso";
import type { Ancla } from "@/lib/cifras";
import { hrefDirectorio } from "../href";
import { enlace } from "@/lib/grafo";
import { ConectadoCon } from "@/components/conectado-con";
import { provinciaDeTexto } from "@/lib/provincias";
import { filtrarObras, getObras } from "@/lib/obras";
import Conversacion from "@/components/espacios/conversacion";

export const revalidate = 3600;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ver?: string }>;
};

/** Qué propuestas enseñar. Cada corte es una URL, así que se comparte. */
const CORTES = {
  todas: { label: "Todas", filtra: () => true },
  aprobadas: { label: "Aprobadas", filtra: (i: Iniciativa) => i.tono === "cumplido" },
  vivas: { label: "En trámite", filtra: (i: Iniciativa) => i.tono === "accionable" },
  cayeron: {
    label: "Se cayeron",
    filtra: (i: Iniciativa) => i.tono === "anulado" || i.tono === "contexto",
  },
} as const;
type Corte = keyof typeof CORTES;

const VISIBLES_PROPUESTAS = 10;
const VISIBLES_VOTOS = 8;

const cargarLegislador = cache((id: number) => getLegislador(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const l = await cargarLegislador(Number(id));
  if (l === "caida") return { title: "Legislador" };
  if (l === "inexistente") return { title: "Legislador no encontrado" };
  return {
    title: l.nombre,
    alternates: { canonical: enlace.legislador(id) },
    description: `${[l.funcion, l.provincia, l.partidoSiglas].filter(Boolean).join(" · ")}: qué propuso, cuánto prosperó y cómo votó.`,
  };
}

export default async function LegisladorPage({ params, searchParams }: Props) {
  const { id: idParam } = await params;
  const { ver } = await searchParams;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const l = await cargarLegislador(id);
  if (l === "caida") {
    return (
      <div className="mx-auto max-w-4xl">
        <Ruta seccion="congreso" padre={{ href: "/congreso/legisladores", label: "Legisladores" }} actual="Legislador" />
        <EstadoVacio
          variante="caida"
          className="mt-4"
          titulo="El SIL de la Cámara no respondió"
          accion={
            <Button asChild variant="secondary">
              <Link href="/congreso/legisladores">Volver al directorio</Link>
            </Button>
          }
        >
          No es que este legislador no exista: es que el sistema de información
          legislativa no contestó. La ficha vuelve sola cuando el origen se
          restablece.
        </EstadoVacio>
      </div>
    );
  }
  if (l === "inexistente") notFound();

  const corte: Corte = ver && ver in CORTES ? (ver as Corte) : "todas";
  const provincia = provinciaDeTexto(l.provincia);
  const obras = provincia ? await getObras() : null;
  const obrasProvincia = provincia && obras ? filtrarObras(obras.proyectos, { provincia: provincia.slug }).length : 0;

  return (
    <div className="mx-auto max-w-4xl">
      <Ruta
        seccion="congreso"
        padre={{ href: "/congreso/legisladores", label: "Legisladores" }}
        actual={l.nombre}
      />

      <header className="mt-1 sm:mt-3">
        <p className="rotulo text-ink-soft">
          {[l.funcion, l.provincia, l.circunscripcion].filter(Boolean).join(" · ")}
        </p>
        <h1 className="mt-1.5 font-display text-3xl leading-tight text-ink sm:text-4xl">
          {l.nombre}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {[
            l.partidoNombre && `${l.partidoNombre}${l.partidoSiglas ? ` (${l.partidoSiglas})` : ""}`,
            l.periodo && `Período ${l.periodo}`,
            l.ejercicio,
            l.profesion,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <ConectadoCon
        className="mt-5"
        aristas={[
          provincia && {
            etiqueta: "Su provincia",
            href: enlace.provincia(provincia.slug),
            nombre: provincia.nombre,
            fuente: "SIL de la Cámara",
          },
          l.provincia && {
            etiqueta: "Quién más representa a su provincia",
            href: hrefDirectorio({ provincia: l.provincia }),
            nombre: l.provincia,
            fuente: "SIL de la Cámara",
          },
          l.partidoSiglas && {
            etiqueta: "Su bancada",
            href: hrefDirectorio({ partido: l.partidoSiglas }),
            nombre: l.partidoNombre ?? l.partidoSiglas,
            fuente: "SIL de la Cámara",
          },
          provincia && {
            etiqueta: "Obras públicas en su provincia",
            href: `/obras?provincia=${provincia.slug}`,
            cuenta: obrasProvincia,
            fuente: "MapaInversiones",
          },
        ]}
      />

      <Suspense key={corte} fallback={<Esqueleto className="mt-6 h-96" />}>
        <Propuestas id={id} corte={corte} />
      </Suspense>

      {l.camara === "diputados" ? (
        <Suspense fallback={<Esqueleto className="mt-5 h-80" />}>
          <Votos id={id} />
        </Suspense>
      ) : (
        <p className="mt-5 text-xs leading-relaxed text-ink-soft">
          El registro de votaciones del SIL es el de la Cámara de Diputados: el
          voto de un senador se emite y se registra en el Senado, y no aparece
          aquí.
        </p>
      )}
      <Conversacion className="mt-6" referencia={{ tipo: "legislador", ref: enlace.legislador(id), titulo: l.nombre, href: enlace.legislador(id) }} />
    </div>
  );
}

/* ----------------------------------------------------------- propuestas */

async function Propuestas({ id, corte }: { id: number; corte: Corte }) {
  const propuestas = await getPropuestasDeLegislador(id);

  if (!propuestas) {
    return (
      <EstadoVacio
        variante="caida"
        rotulo="¿Qué ha propuesto?"
        titulo="El SIL no devolvió sus propuestas"
        className="mt-6"
        accion={
          <Button asChild variant="secondary">
            <Link href="/fuentes">Ver el estado de las fuentes</Link>
          </Button>
        }
      >
        La ficha de arriba sí llegó; lo que falló es el listado de piezas que
        firmó. No quiere decir que no haya propuesto nada.
      </EstadoVacio>
    );
  }

  const { iniciativas, total, leidas } = propuestas;
  const completo = leidas >= total;
  const ancla: Ancla = completo
    ? { alcance: "registro", periodo: "registro vigente del SIL" }
    : { alcance: "muestra", escaneados: leidas, universo: total, periodo: "las más recientes" };

  const aprobadas = iniciativas.filter(CORTES.aprobadas.filtra);
  const vivas = iniciativas.filter(CORTES.vivas.filtra);
  const cayeron = iniciativas.filter(CORTES.cayeron.filtra);
  const leyes = iniciativas.filter((i) => i.tipo === "Proyecto de Ley");
  const leyesAprobadas = leyes.filter(CORTES.aprobadas.filtra);

  const lista = iniciativas.filter(CORTES[corte].filtra);
  const conteo: Record<Corte, number> = {
    todas: iniciativas.length,
    aprobadas: aprobadas.length,
    vivas: vivas.length,
    cayeron: cayeron.length,
  };

  return (
    <Card as="section" className="mt-6">
      <CardHeader>
        <CardTitle>¿Qué ha propuesto?</CardTitle>
        <CardAction className="font-mono tabular-nums">{total}</CardAction>
      </CardHeader>

      {total === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-soft">
          No figura como proponente de ninguna pieza del registro vigente del SIL.
        </p>
      ) : (
        <>
          <TiraDeCifras>
            <Cifra etiqueta="Propuestas firmadas" valor={total} ancla={{ alcance: "registro", periodo: "registro vigente del SIL" }} />
            <Cifra etiqueta="Aprobadas" valor={aprobadas.length} tono="text-valido-700" ancla={ancla} />
            <Cifra etiqueta="Siguen en trámite" valor={vivas.length} ancla={ancla} />
            <Cifra etiqueta="Perimidas, retiradas u otras" valor={cayeron.length} ancla={ancla} />
          </TiraDeCifras>

          <div className="px-5 py-4">
            {completo ? (
              <>
                <p className="text-sm leading-relaxed text-ink">
                  Prosperaron{" "}
                  <span className="font-mono font-semibold tabular-nums">{aprobadas.length}</span>{" "}
                  de sus{" "}
                  <span className="font-mono font-semibold tabular-nums">{total}</span>{" "}
                  propuestas
                  {leyes.length > 0 && (
                    <>
                      {"; de los "}
                      <span className="font-mono tabular-nums">{leyes.length}</span>
                      {" proyectos de ley, "}
                      <span className="font-mono tabular-nums">{leyesAprobadas.length}</span>
                      {leyesAprobadas.length === 1 ? " fue aprobado" : " fueron aprobados"}
                    </>
                  )}
                  .
                </p>
                <Progress
                  value={aprobadas.length}
                  max={total}
                  className="mt-2 max-w-sm"
                  indicadorClassName="bg-valido-500"
                  aria-label={`${aprobadas.length} de ${total} propuestas aprobadas`}
                />
              </>
            ) : (
              <p className="text-sm leading-relaxed text-ink">
                Se leyeron las {leidas} más recientes de {total}: los recuentos son
                de esa muestra y no se dan en porcentaje.
              </p>
            )}
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              «Aprobada» es la condición que el SIL le da a una pieza que pasó el
              pleno: una resolución termina ahí; un proyecto de ley necesita además
              la otra cámara y la promulgación. Cuenta toda pieza donde figura como
              proponente, sola o con otros. El SIL guarda el período 2024-2028 y lo
              arrastrado a él, no los períodos anteriores.
            </p>
          </div>

          <NavFiltros etiqueta="Qué propuestas ver" className="border-t border-hairline px-5 py-3">
            {(Object.keys(CORTES) as Corte[]).map((c) => (
              <FiltroEnlace
                key={c}
                href={`${enlace.legislador(id)}${c === "todas" ? "" : `?ver=${c}`}`}
                activo={corte === c}
              >
                {`${CORTES[c].label} (${conteo[c]})`}
              </FiltroEnlace>
            ))}
          </NavFiltros>

          {lista.length > 0 ? (
            <div className="border-t border-hairline">
              <ListaPlegada
                total={lista.length}
                visibles={VISIBLES_PROPUESTAS}
                etiqueta={`Ver las ${lista.length} propuestas`}
                etiquetaCerrar="Ocultar el resto de las propuestas"
                render={(desde, hasta) => (
                  <ul>
                    {lista.slice(desde, hasta).map((ini) => (
                      <IniciativaCard key={ini.id} iniciativa={ini} />
                    ))}
                  </ul>
                )}
              />
            </div>
          ) : (
            <p className="border-t border-hairline px-5 py-6 text-sm text-ink-soft">
              Ninguna de sus propuestas leídas está en este corte.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- votos */

async function Votos({ id }: { id: number }) {
  const votos = await getVotosDeLegislador(id);

  if (!votos) {
    return (
      <EstadoVacio
        variante="caida"
        rotulo="¿Cómo ha votado?"
        titulo="El SIL no devolvió sus votaciones"
        className="mt-5"
      >
        Sus propuestas sí llegaron; lo que no respondió es el registro de
        votaciones de la Cámara. Vuelve a intentarlo más tarde.
      </EstadoVacio>
    );
  }

  const legislatura = parseLegislatura(votos.legislatura);
  const nombreLegislatura = legislatura
    ? `${legislatura.nombre} ${legislatura.anio}`
    : votos.legislatura;

  const reparto = new Map<SentidoVoto, number>();
  for (const v of votos.votaciones) {
    if (v.sentido) reparto.set(v.sentido, (reparto.get(v.sentido) ?? 0) + 1);
  }
  const leidas = votos.votaciones.length;

  return (
    <Card as="section" className="mt-5">
      <CardHeader>
        <CardTitle>¿Cómo ha votado?</CardTitle>
        <CardAction className="font-mono tabular-nums">{votos.total}</CardAction>
      </CardHeader>

      {leidas === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-soft">
          El SIL no registra votaciones suyas en la {nombreLegislatura} ni en la
          anterior.
        </p>
      ) : (
        <>
          <div className="px-5 py-4">
            <p className="text-sm leading-relaxed text-ink">
              En las{" "}
              <span className="font-mono tabular-nums">{leidas}</span> votaciones más
              recientes de la {nombreLegislatura}
              {leidas < votos.total ? ` (de ${votos.total} que lleva)` : ""}:{" "}
              {ORDEN_SENTIDOS.filter((s) => reparto.has(s))
                .map((s) => `${reparto.get(s)} ${ETIQUETA_SENTIDO[s].toLowerCase()}`)
                .join(" · ")}
              .
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Cada votación dice qué se sometió y cómo salió; al abrirla está el
              voto de cada diputado. Muchas son de trámite —el orden del día, liberar
              una pieza de comisión—: la moción dice cuál es cuál.
            </p>
          </div>
          <div className="border-t border-hairline">
            <ListaPlegada
              total={leidas}
              visibles={VISIBLES_VOTOS}
              etiqueta={`Ver las ${leidas} votaciones`}
              etiquetaCerrar="Ocultar el resto de las votaciones"
              render={(desde, hasta) => (
                <ul>
                  {votos.votaciones.slice(desde, hasta).map((v) => (
                    <FilaVotacion key={v.id} votacion={v} conSentido />
                  ))}
                </ul>
              )}
            />
          </div>
        </>
      )}
      <p className="border-t border-hairline px-5 py-3 text-xs text-ink-soft">
        Fuente: registro de votaciones electrónicas del SIL de la Cámara de
        Diputados.{" "}
        <Badge variant="neutro" className="align-middle">
          {votos.legislatura}
        </Badge>
      </p>
    </Card>
  );
}
