import Link from "next/link";
import IniciativaCard from "@/components/iniciativa-card";
import { FilaVotacion } from "@/components/congreso/votaciones";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { EstadoVacio } from "@/components/estado-vacio";
import { FiltroEnlace, NavFiltros } from "@/components/nav-filtros";
import ListaPlegada from "@/app/congreso/lista-plegada";
import {
  ETIQUETA_SENTIDO,
  ORDEN_SENTIDOS,
  getPropuestasDeLegislador,
  getVotosDeLegislador,
  parseLegislatura,
  type Iniciativa,
  type SentidoVoto,
} from "@/lib/congreso";
import type { Ancla } from "@/lib/cifras";

/**
 * Lo que el SIL dice en vivo de un legislador —qué propuso y sus votaciones
 * más recientes—, para la sección Congreso de la ficha de la persona
 * (`app/funcionarios/[slug]`), adonde redirige `/congreso/legisladores/[id]`
 * (docs/INFRAESTRUCTURA.md §3.2, §5.5).
 */

/** Qué propuestas enseñar. Cada corte es una URL, así que se comparte. */
export const CORTES = {
  todas: { label: "Todas", filtra: () => true },
  aprobadas: { label: "Aprobadas", filtra: (i: Iniciativa) => i.tono === "cumplido" },
  vivas: { label: "En trámite", filtra: (i: Iniciativa) => i.tono === "accionable" },
  cayeron: {
    label: "Se cayeron",
    filtra: (i: Iniciativa) => i.tono === "anulado" || i.tono === "contexto",
  },
} as const;
export type Corte = keyof typeof CORTES;

const VISIBLES_PROPUESTAS = 10;
const VISIBLES_VOTOS = 8;

/* ----------------------------------------------------------- propuestas */

/** `base`, la ficha cuyos filtros son enlaces; `null` en una ficha estática: sin filtros, todas. */
export async function Propuestas({ id, corte, base }: { id: number; corte: Corte; base: string | null }) {
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

          {base && <NavFiltros etiqueta="Qué propuestas ver" className="border-t border-hairline px-5 py-3">
            {(Object.keys(CORTES) as Corte[]).map((c) => (
              <FiltroEnlace
                key={c}
                href={`${base}${c === "todas" ? "" : `?ver=${c}`}#congreso`}
                activo={corte === c}
              >
                {`${CORTES[c].label} (${conteo[c]})`}
              </FiltroEnlace>
            ))}
          </NavFiltros>}

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

export async function Votos({ id }: { id: number }) {
  const votos = await getVotosDeLegislador(id);

  if (!votos) {
    return (
      <EstadoVacio
        variante="caida"
        rotulo="¿Cómo ha votado?"
        titulo="El SIL no devolvió sus votaciones"
        className="mt-5"
        accion={
          <Button asChild variant="secondary">
            <Link href="/fuentes">Ver el estado de las fuentes</Link>
          </Button>
        }
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
              voto de cada diputado. Muchas son de trámite, como el orden del día o
              liberar una pieza de comisión: la moción dice cuál es cuál.
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
