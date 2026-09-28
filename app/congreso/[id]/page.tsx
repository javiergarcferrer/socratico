import Link from "next/link";
import { Suspense, cache } from "react";
import { notFound } from "next/navigation";
import { MarcaIniciativa } from "@/components/iniciativa-card";
import {
  desdeMayusculas,
  documentoUrl,
  evaluarPerencion,
  getDocumentos,
  getHistoricos,
  getIniciativa,
  getProponentes,
  getRutaDocumento,
  getVotacionesDeIniciativa,
  hrefLegislador,
  normalizarDocumento,
  normalizarIniciativa,
  normalizarProponente,
} from "@/lib/congreso";
import { formatFecha, hace } from "@/lib/format";
import { getAgregado, refIniciativa } from "@/lib/democracia";
import VotoWidget from "@/components/democracia/voto-widget";
import Dossier from "@/components/congreso/dossier";
import Plegable from "@/components/plegable";
import ListaPlegada from "../lista-plegada";
import { Alert } from "@/components/ui/alert";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { IconExternal } from "@/components/icons";
import { Esqueleto } from "@/components/esqueleto";
import { Ruta } from "@/components/ruta";
import AccionesFicha from "@/components/acciones-ficha";
import { Termino } from "@/components/termino";
import { FilaVotacion } from "@/components/congreso/votaciones";
import { EnElSenado } from "@/components/congreso/cruces";
import { InstitucionesNombradas } from "@/components/congreso/instituciones-nombradas";
import { enlace } from "@/lib/grafo";
import { ConectadoCon } from "@/components/conectado-con";
import { provinciaDeTexto } from "@/lib/provincias";
import { TextoEnlazado } from "@/components/texto-enlazado";
import Conversacion from "@/components/espacios/conversacion";

export const revalidate = 300;

/*
  Cuántas filas de cada registro se ven sin pedirlo.

  Un expediente veterano trae treinta trámites, una docena de documentos y
  treinta firmantes: en un teléfono eso son seis pantallas de desplazamiento
  antes de llegar al final de la ficha, y el único evento que importa —el
  último— queda enterrado bajo los rutinarios. Se enseña la cabeza de cada
  registro y el resto queda a un toque, con el número dicho en el botón.
*/
const VISIBLES_DOCS = 4;
const VISIBLES_TRAMITES = 4;
const VISIBLES_FIRMANTES = 3;
const VISIBLES_VOTACIONES = 3;

type Props = { params: Promise<{ id: string }> };

/** Una sola lectura del SIL por render, compartida con `generateMetadata`. */
const cargarIniciativa = cache((id: number) => getIniciativa(id));

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const raw = await cargarIniciativa(Number(id));
  if (!raw) return { title: "Iniciativa no encontrada" };
  const ini = normalizarIniciativa(raw);
  return {
    title: ini.numero?.completo ?? `Iniciativa ${ini.id}`,
    description: ini.titulo.slice(0, 160),
    alternates: { canonical: enlace.iniciativa(ini.id) },
  };
}

export default async function IniciativaPage({ params }: Props) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();

  const raw = await cargarIniciativa(id);
  if (!raw) notFound();

  const ini = normalizarIniciativa(raw);
  // El SIL publica el enunciado en versales. En caja alta un título de
  // cuarenta palabras se convierte en ocho líneas ilegibles en un teléfono, y
  // es justo el primer bloque de la ficha: se devuelve a caja mixta para
  // leerlo, sin tocar una palabra. La capa del Senado ya lo hacía.
  const titulo = desdeMayusculas(ini.titulo);
  const ref = refIniciativa("diputados", ini.id);

  // Todo lo que depende solo del id sale en una tanda, el agregado de votos
  // incluido: antes esperaba en fila detrás de los cuatro del SIL.
  const [historicos, proponentes, documentos, rutaBase, agregado] = await Promise.all([
    getHistoricos(id),
    getProponentes(id),
    getDocumentos(id),
    getRutaDocumento(),
    getAgregado("diputados", ref),
  ]);

  const docs = documentos.results
    .map(normalizarDocumento)
    .sort((a, b) => (a.cargado ?? "").localeCompare(b.cargado ?? ""));
  const cadenaTexto = docs.filter((d) => d.etapa.texto);
  const tramites = historicos.results;
  const firmantes = proponentes.results.map(normalizarProponente);
  const proponentePrincipal =
    proponentes.results.find((p) => p.principal)?.nombreCompleto ??
    proponentes.results[0]?.nombreCompleto ??
    null;
  const perencion = ini.viva ? evaluarPerencion(ini.legislatura) : null;

  // El vecindario (G2): quien la propuso, de dónde, y la norma en que se
  // convirtió. Solo diputados y senadores tienen ficha de legislador.
  const principal = firmantes.find((f) => f.principal) ?? firmantes[0] ?? null;
  const principalConFicha =
    principal?.legisladorId && /diputad|senad/i.test(principal.funcion ?? "") ? principal : null;
  const provinciaPrincipal = provinciaDeTexto(principal?.provincia);
  const numeroNorma = /\d{1,4}-\d{2,4}/.exec(ini.numPromulgacion ?? "")?.[0] ?? null;
  const normaResultante = numeroNorma
    ? enlace.norma(/resoluci/i.test(ini.tipo ?? "") ? "resolucion" : "ley", numeroNorma)
    : null;

  return (
    <div className="mx-auto max-w-4xl">
      <Ruta seccion="congreso" actual={`Iniciativa ${ini.numero?.completo ?? ini.id}`} />

      <header className="mt-1 sm:mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold tabular-nums text-brand-700">
            {ini.numero?.completo ?? `#${ini.id}`}
          </span>
          {/*
            Una sola marca, del punto más avanzado que se conoce: antes eran
            dos —«APROBADO» en versales del SIL junto a «Promulgada»—, y el
            lector tenía que decidir cuál de las dos mandaba.
          */}
          <MarcaIniciativa iniciativa={ini} />
        </div>

        <h1 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-ink sm:text-2xl">
          <TextoEnlazado texto={titulo} />
        </h1>

        {ini.tituloModificado && (
          <div className="mt-3 rounded-lg border-l-[3px] border-brand-500 bg-surface py-3 pl-4 pr-3">
            <p className="rotulo text-brand-700">
              Título modificado durante el trámite
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              <TextoEnlazado texto={desdeMayusculas(ini.tituloModificado)} />
            </p>
          </div>
        )}
      </header>

      {perencion && perencion.estado !== "sin-datos" && (
        <Alert
          variant={perencion.estado === "en-riesgo" ? "aviso" : "neutro"}
          className="mt-5"
        >
          <p
            className={
              perencion.estado === "en-riesgo"
                ? "text-sm font-semibold text-alerta-700"
                : "text-sm font-semibold text-ink"
            }
          >
            {perencion.estado === "en-riesgo" && (
              <><Termino clave="perime">Perime</Termino> en {perencion.diasRestantes} días</>
            )}
            {perencion.estado === "vigente" &&
              `Quedan ${perencion.diasRestantes} días de legislatura`}
            {perencion.estado === "cerrada" && "Su legislatura ya cerró"}
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {perencion.legislatura.nombre} {perencion.legislatura.anio} · cierra el{" "}
            {formatFecha(perencion.legislatura.cierre.toISOString().slice(0, 10))}
          </p>
        </Alert>
      )}

      {/*
        Antes de los metadatos: qué es la pieza, qué norma vigente toca y en qué
        punto del trámite está. El SIL no publica sinopsis, así que se explica
        desde el propio enunciado oficial. El dossier resuelve hasta cinco
        normas contra la Consultoría, y por eso va en su propio Suspense: la
        ficha se lee mientras llega. Recibe el título **crudo**, en versales,
        porque de él se extraen las citas con expresiones regulares.
      */}
      <ConectadoCon
        className="mt-5"
        aristas={[
          normaResultante && {
            etiqueta: "La norma en que se convirtió",
            href: normaResultante,
            nombre: ini.numPromulgacion,
            fuente: "SIL de la Cámara",
          },
          principalConFicha && {
            etiqueta: "Quien la propuso",
            href: hrefLegislador(principalConFicha.legisladorId!),
            nombre: principalConFicha.nombre,
            fuente: "SIL de la Cámara",
          },
          provinciaPrincipal && {
            etiqueta: "Provincia de quien la propuso",
            href: enlace.provincia(provinciaPrincipal.slug),
            nombre: provinciaPrincipal.nombre,
            fuente: "SIL de la Cámara",
          },
          firmantes.length > 1 && {
            etiqueta: "Proponentes",
            href: "#proponentes",
            cuenta: firmantes.length,
            fuente: "SIL de la Cámara",
          },
        ]}
      />

      <Suspense fallback={<Esqueleto className="mt-5 h-40" />}>
        <Dossier
          titulo={ini.titulo}
          tipo={ini.tipo}
          condicion={ini.condicion ?? ini.estado}
          estado={ini.estado}
          camaraOrigen={ini.camaraOrigen}
          materia={ini.grupo ?? ini.materia}
          proponente={proponentePrincipal}
          promulgadaComo={ini.numPromulgacion}
        />
      </Suspense>

      {/*
        Seguir, compartir y el RSS van después de entender la pieza, no antes:
        encima del título empujaban el h1 a media pantalla del teléfono, y
        nadie sigue una iniciativa antes de saber qué es y en qué punto está
        (docs/IDENTIDAD.md §4, el orden de los bloques).
      */}
      <AccionesFicha className="mt-4" tipo="proyecto" id={String(ini.id)} titulo={titulo} href={enlace.iniciativa(ini.id)} situacion={ini} feed={`/api/feed/congreso/${ini.id}`} />

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-5">
          <Panel
            titulo="Documentos"
            nota={cadenaTexto.length > 1 ? `${cadenaTexto.length} versiones del texto` : undefined}
          >
            {docs.length > 0 ? (
              <ListaPlegada
                total={docs.length}
                visibles={VISIBLES_DOCS}
                etiqueta={`Ver los ${docs.length} documentos`}
                etiquetaCerrar="Ocultar el resto de los documentos"
                render={(desde, hasta) => (
                  <ul className="divide-y divide-hairline">
                    {docs.slice(desde, hasta).map((doc) => (
                      <FilaDocumento
                        key={doc.id}
                        doc={doc}
                        url={documentoUrl(rutaBase, doc.id)}
                      />
                    ))}
                  </ul>
                )}
              />
            ) : (
              <p className="px-5 py-6 text-sm text-ink-soft">
                Esta pieza aún no tiene documentos cargados en el SIL.
              </p>
            )}

            {cadenaTexto.length > 1 && (
              <div className="border-t border-hairline bg-canvas/50 px-5 py-3">
                <p className="text-xs leading-relaxed text-ink-soft">
                  <span className="font-semibold text-ink">
                    Comparación entre lecturas:
                  </span>{" "}
                  hay {cadenaTexto.length} versiones con articulado. El servidor de
                  documentos del Congreso es on-premise y no acepta conexiones desde
                  fuera de RD, así que la comparación automática todavía no corre.{" "}
                  <Link href="/fuentes" className="text-brand-700 underline">
                    Detalle
                  </Link>
                  .
                </p>
              </div>
            )}
          </Panel>

          <Suspense fallback={<Esqueleto className="h-48" />}>
            <VotacionesDelPleno id={id} />
          </Suspense>
        </div>

      {/*
        El voto va donde estaba —después del texto, nunca antes—, pero es un
        hijo suelto de esta rejilla: sin el `col-span` caía en la segunda
        columna y partía el ancho con los trámites. En el teléfono, que es de
        una sola columna, el orden no cambia.
      */}
      {/* Sin recuento se vota igual: el widget dice «no disponible». */}
      <div className="mt-5 lg:col-span-2">
        <VotoWidget
          camara="diputados"
          refIni={ref}
          numero={ini.numero?.completo ?? null}
          titulo={ini.titulo}
          grupo={ini.grupo}
          inicial={agregado}
        />
      </div>

        <div className="flex flex-col gap-5">
          <Panel titulo="Trámites" nota={tramites.length > 0 ? String(tramites.length) : undefined}>
            {tramites.length > 0 ? (
              <ListaPlegada
                total={tramites.length}
                visibles={VISIBLES_TRAMITES}
                etiqueta={`Ver los ${tramites.length} trámites`}
                etiquetaCerrar="Ocultar el resto de los trámites"
                render={(desde, hasta) => (
                  <ol className="px-5 pb-4 pt-4">
                    {tramites.slice(desde, hasta).map((h, i) => (
                      <li key={h.id} className="flex gap-3 pb-4 last:pb-0">
                        <div className="flex flex-col items-center">
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sello-600" />
                          {desde + i < tramites.length - 1 && (
                            <span className="mt-1 w-px flex-1 bg-hairline" />
                          )}
                        </div>
                        <div className="-mt-0.5 min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">{h.estado ?? "—"}</p>
                          <p className="font-mono mt-0.5 text-xs tabular-nums text-ink-soft">
                            {formatFecha(h.inicio ?? undefined)}
                            {h.fin && h.fin !== h.inicio && (
                              <> → {formatFecha(h.fin)}</>
                            )}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              />
            ) : (
              <p className="px-5 py-6 text-sm text-ink-soft">Sin trámites registrados.</p>
            )}
            <div className="border-t border-hairline bg-canvas/50 px-5 py-2.5">
              <p className="text-xs text-ink-soft">
                El SIL entrega intervalos de estado, no eventos con comisión ni cámara.
              </p>
            </div>
          </Panel>

          {ini.numero?.camara === "CD" && puedeEstarEnElSenado(ini) && (
            <Suspense fallback={null}>
              <EnElSenado
                numero={ini.numero.completo}
                titulo={titulo}
                promulgacion={ini.numPromulgacion}
              />
            </Suspense>
          )}

          <InstitucionesNombradas texto={`${ini.titulo} ${ini.tituloModificado ?? ""}`} />
        </div>

        <Panel id="proponentes" titulo="Proponentes" nota={String(proponentes.total)}>
          {firmantes.length > 0 ? (
            <ListaPlegada
              total={firmantes.length}
              visibles={VISIBLES_FIRMANTES}
              etiqueta={`Ver los ${firmantes.length} proponentes`}
              etiquetaCerrar="Ocultar el resto de los proponentes"
              render={(desde, hasta) => (
                <ul className="divide-y divide-hairline">
                  {firmantes.slice(desde, hasta).map((p, i) => (
                    <li key={p.legisladorId ?? desde + i} className="px-5 py-3">
                      <p className="text-sm font-medium text-ink">
                        {/*
                          Solo diputados y senadores tienen ficha: el Poder
                          Ejecutivo o la Suprema Corte también firman con un
                          id de legislador, y su «ficha» no diría nada.
                        */}
                        {p.legisladorId && /diputad|senad/i.test(p.funcion ?? "") ? (
                          <Link
                            href={hrefLegislador(p.legisladorId)}
                            className="text-brand-700 hover:underline"
                          >
                            {p.nombre}
                          </Link>
                        ) : (
                          p.nombre
                        )}
                        {p.principal && (
                          <span className="ml-2 rotulo text-brand-700">
                            principal
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {[p.funcion, p.provincia, p.partidoSiglas].filter(Boolean).join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            />
          ) : (
            <p className="px-5 py-6 text-sm text-ink-soft">Sin proponentes registrados.</p>
          )}
        </Panel>
      </div>

      {/*
        La ficha técnica va al final: es el registro literal para verificar,
        no lo que se lee para entender. Nueve celdas de taxonomía cruda justo
        antes del botón de votar era el bloque de mayor densidad y menor valor
        decisorio, colocado en el momento de decidir.
      */}
      <Plegable
        className="mt-5 overflow-hidden rounded-lg border border-hairline bg-surface"
        etiqueta="Ver la ficha técnica"
        etiquetaCerrar="Ocultar la ficha técnica"
      >
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-3">
          <Dato etiqueta="Tipo" valor={ini.tipo} />
          <Dato etiqueta="Cámara de origen" valor={ini.camaraOrigen} />
          <Dato etiqueta="Estado" valor={ini.estado} />
          <Dato etiqueta="Tema" valor={ini.grupo} />
          <Dato etiqueta="Materia" valor={ini.materia} />
          <Dato etiqueta="Legislatura" valor={ini.legislatura} mono />
          <Dato
            etiqueta="Depositada"
            valor={formatFecha(ini.fechaDeposito ?? undefined)}
            nota={hace(ini.fechaDeposito)}
            mono
          />
          <Dato
            etiqueta="Último cambio"
            valor={formatFecha(ini.fechaUltimoCambio ?? undefined)}
            nota={hace(ini.fechaUltimoCambio)}
            mono
          />
          <Dato
            etiqueta="Promulgación"
            valor={
              ini.promulgada
                ? [ini.numPromulgacion, formatFecha(ini.fechaPromulgacion ?? undefined)]
                    .filter(Boolean)
                    .join(" · ")
                : "No promulgada"
            }
            mono
          />
        </dl>
      </Plegable>
      <Conversacion className="mt-6" referencia={{ tipo: "proyecto", ref: enlace.iniciativa(ini.id), titulo, href: enlace.iniciativa(ini.id) }} />
    </div>
  );
}

/**
 * Solo un proyecto de ley viaja a la otra cámara, y solo si nació en el Senado
 * o ya salió de esta. Buscar el gemelo de una resolución de la Cámara —que
 * nunca pasa al Senado— sería gastar tres peticiones al consultante en balde.
 */
function puedeEstarEnElSenado(ini: ReturnType<typeof normalizarIniciativa>): boolean {
  if (!/ley/i.test(ini.tipo ?? "")) return false;
  return (
    /senado/i.test(ini.camaraOrigen ?? "") ||
    ini.tono === "cumplido" ||
    /senado|despach/i.test(`${ini.estado ?? ""} ${ini.condicion ?? ""}`)
  );
}

/** Las votaciones del pleno en que se sometió la pieza, con enlace al voto nominal. */
async function VotacionesDelPleno({ id }: { id: number }) {
  const votaciones = await getVotacionesDeIniciativa(id);
  if (votaciones === null) {
    return (
      <Panel titulo="¿Cómo votó la Cámara?">
        <p className="px-5 py-6 text-sm text-ink-soft">
          El registro de votaciones del SIL no respondió. El resto de la ficha
          no depende de él.
        </p>
      </Panel>
    );
  }
  if (votaciones.length === 0) {
    return (
      <Panel titulo="¿Cómo votó la Cámara?">
        <p className="px-5 py-6 text-sm text-ink-soft">
          El pleno aún no la ha sometido a una votación registrada en el SIL.
        </p>
      </Panel>
    );
  }
  return (
    <Panel titulo="¿Cómo votó la Cámara?" nota={String(votaciones.length)}>
      <ListaPlegada
        total={votaciones.length}
        visibles={VISIBLES_VOTACIONES}
        etiqueta={`Ver las ${votaciones.length} votaciones`}
        etiquetaCerrar="Ocultar el resto de las votaciones"
        render={(desde, hasta) => (
          <ul>
            {votaciones.slice(desde, hasta).map((v) => (
              <FilaVotacion key={v.id} votacion={v} />
            ))}
          </ul>
        )}
      />
      <div className="border-t border-hairline bg-canvas/50 px-5 py-2.5">
        <p className="text-xs text-ink-soft">
          Cada votación abre el voto de cada diputado. A veces el pleno vota un
          grupo de piezas a la vez: la moción lo dice.
        </p>
      </div>
    </Panel>
  );
}

/** Una pieza documental del expediente, con su enlace al archivo del SIL. */
function FilaDocumento({
  doc,
  url,
}: {
  doc: ReturnType<typeof normalizarDocumento>;
  url: string | null;
}) {
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <span
        aria-hidden
        className={
          doc.etapa.texto
            ? "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sello-600"
            : "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-hairline"
        }
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">
          {doc.etiqueta}
          {doc.etapa.texto && (
            <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 rotulo text-brand-700">
              texto
            </span>
          )}
        </p>
        <p className="font-mono mt-0.5 text-xs tabular-nums text-ink-soft">
          {formatFecha(doc.cargado ?? undefined)}
          {doc.extension && ` · ${doc.extension.toUpperCase()}`}
        </p>
      </div>
      {/*
        «Abrir» era un renglón de 16 px al borde de la pantalla: el objetivo
        más difícil de acertar de la ficha. Con `min-h-11` y su margen negativo
        ocupa el alto de un mando sin mover la fila.
      */}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="-my-1 -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-xs font-medium text-brand-700 hover:underline sm:my-0 sm:mr-0 sm:min-h-0 sm:px-0"
        >
          Abrir
          <IconExternal className="h-3.5 w-3.5" />
        </a>
      )}
    </li>
  );
}

function Panel({
  id,
  titulo,
  nota,
  children,
}: {
  id?: string;
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <Card as="section" id={id}>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        {nota && <CardAction className="font-mono tabular-nums">{nota}</CardAction>}
      </CardHeader>
      {children}
    </Card>
  );
}

function Dato({
  etiqueta,
  valor,
  nota,
  mono,
}: {
  etiqueta: string;
  valor: string | null;
  /** Antigüedad en llano: «hace 4 meses». Una fecha sola obliga a restar. */
  nota?: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="rotulo text-ink-soft">{etiqueta}</dt>
      <dd
        className={
          mono
            ? "mt-0.5 font-mono text-sm tabular-nums text-ink"
            : "mt-0.5 text-sm text-ink"
        }
      >
        {valor ?? "—"}
      </dd>
      {nota && <p className="mt-0.5 text-xs text-ink-soft">{nota}</p>}
    </div>
  );
}
