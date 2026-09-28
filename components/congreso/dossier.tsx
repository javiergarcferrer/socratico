import Link from "next/link";
import { IconExternal, IconLayers } from "@/components/icons";
import {
  ETIQUETA_RELACION,
  numeroDeNorma,
  enQuePunto,
  queEs,
  referenciasNormativas,
  type ReferenciaNorma,
} from "@/lib/legislacion";
import { RUTA_POR_TIPO, resolverNorma } from "@/lib/normativa";
import type { Documento as DocumentoNormativo } from "@/lib/normativa";
import { formatFecha } from "@/lib/format";
import { desdeMayusculas } from "@/lib/congreso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { enlace } from "@/lib/grafo";

interface Props {
  /** Título tal como lo publica la cámara; de aquí salen las citas. */
  titulo: string;
  /** Título reformulado, si el trámite lo cambió: también cita normas. */
  tituloModificado?: string | null;
  tipo: string | null;
  condicion: string | null;
  /**
   * El estado del último trámite. La condición es gruesa —una ley promulgada
   * sigue diciendo «APROBADO»— y este es el dato fino.
   */
  estado?: string | null;
  /** De qué cámara partió: decide si «aprobada aquí» deja pendiente la otra. */
  camaraOrigen?: string | null;
  materia?: string | null;
  proponente?: string | null;
  /** Número con que se promulgó («136-15»), si completó el trámite. */
  promulgadaComo?: string | null;
}

/** Cuántas citas se resuelven contra la Consultoría por ficha. */
const MAX_CITAS_RESUELTAS = 4;

interface CitaResuelta {
  ref: ReferenciaNorma;
  norma: DocumentoNormativo | null;
}

/**
 * «De qué se trata»: el dossier en lenguaje llano de una iniciativa.
 *
 * Ninguna de las dos cámaras publica sinopsis —el único texto es el título—,
 * así que aquí no se resume: se **explica**. Qué tipo de pieza es, qué normas
 * vigentes toca (resueltas contra la Consultoría Jurídica, que sí tiene el
 * texto de cada una) y en qué punto del trámite está. Todo se deriva del
 * enunciado oficial, que queda íntegro a la vista más arriba.
 */
export default async function Dossier({
  titulo,
  tituloModificado,
  tipo,
  condicion,
  estado,
  camaraOrigen,
  materia,
  proponente,
  promulgadaComo,
}: Props) {
  const refs = referenciasNormativas([titulo, tituloModificado].filter(Boolean).join(". "));
  const citas: CitaResuelta[] = await Promise.all(
    refs.slice(0, MAX_CITAS_RESUELTAS).map(async (ref) => ({
      ref,
      norma: await resolverNorma(ref.tipo, ref.numero),
    })),
  );
  for (const ref of refs.slice(MAX_CITAS_RESUELTAS)) citas.push({ ref, norma: null });

  // Si completó el trámite, su texto definitivo está en la Consultoría: es la
  // única vía al articulado en las fichas de Diputados, cuyo servidor de
  // documentos no acepta conexiones desde fuera del país.
  const ley = await resolverNorma("Ley", numeroDeNorma(promulgadaComo));

  const esto = ley ? null : queEs(tipo);
  // «En qué punto está» sale del punto más avanzado que se conoce, no de la
  // condición sola: si la ley ya resolvió en la Consultoría o la cámara guarda
  // su número de promulgación, la pieza terminó, diga lo que diga la condición.
  const sigue = enQuePunto({
    condicion,
    estado,
    promulgada: Boolean(ley || promulgadaComo),
    numPromulgacion: ley ? `Ley ${ley.numero}` : promulgadaComo,
    tipo,
    camaraOrigen,
  });
  if (!esto && !sigue && !ley && citas.length === 0 && !materia && !proponente) {
    return null;
  }

  return (
    <Card as="section" className="mt-5">
      <CardHeader className="justify-start gap-2">
        <IconLayers className="h-4 w-4 text-brand-700" />
        <CardTitle>De qué se trata</CardTitle>
      </CardHeader>

      <div className="divide-y divide-hairline">
        {ley && (
          <div className="bg-valido-50 px-5 py-4">
            <p className="rotulo text-valido-700">
              Ya es ley · texto vigente
            </p>
            <p className="mt-1.5 text-sm font-medium text-ink">
              {`Ley ${ley.numero}${ley.titulo ? `, ${desdeMayusculas(ley.titulo)}` : ""}`}
            </p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {[ley.gaceta && `Gaceta ${ley.gaceta}`, ley.fechaIso ? formatFecha(ley.fechaIso) : ley.fecha]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {/*
              Es la salida más valiosa de toda la ficha —del expediente al
              texto vigente— y estaba en talla `sm`, 36 px. Ocupa el ancho del
              bloque en el teléfono, con los 44 px de un mando.
            */}
            <Button asChild className="mt-3 w-full sm:mt-2 sm:w-auto">
              <Link href={enlace.norma("ley", ley.numero) ?? "/normativa"}>
                Leer el texto de la ley →
              </Link>
            </Button>
          </div>
        )}

        {(esto || materia || proponente) && (
          <div className="px-5 py-4">
            {esto && (
              <>
                <p className="rotulo text-ink-soft">
                  Qué es
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink">{esto}</p>
              </>
            )}
            {(materia || proponente) && (
              <p className={esto ? "mt-2 text-xs leading-relaxed text-ink-soft" : "text-xs leading-relaxed text-ink-soft"}>
                {proponente && (
                  <>
                    La propone{" "}
                    <span className="font-medium text-ink">
                      {desdeMayusculas(proponente)}
                    </span>
                    {materia ? " y " : "."}
                  </>
                )}
                {materia && (
                  <>
                    la cámara la clasifica en{" "}
                    <span className="font-medium text-ink">
                      {desdeMayusculas(materia)}
                    </span>
                    .
                  </>
                )}
              </p>
            )}
          </div>
        )}

        {sigue && (
          <div className="px-5 py-4">
            <p className="rotulo text-ink-soft">
              En qué punto está
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink">{sigue}</p>
          </div>
        )}

        {citas.length > 0 && (
          <div className="px-5 py-4">
            <p className="rotulo text-ink-soft">
              Qué toca del ordenamiento vigente
            </p>
            <ul className="mt-2.5 space-y-2.5">
              {citas.map(({ ref, norma }) => (
                <li key={`${ref.tipo}-${ref.numero ?? "s/n"}`} className="flex gap-2.5">
                  {/*
                    El sello rojo solo para lo que **deroga**: es una de las
                    cuatro cosas de la plataforma a las que la identidad les
                    reserva la marca (docs/IDENTIDAD.md §Color).
                  */}
                  <Badge
                    variant={
                      ref.relacion === "deroga"
                        ? "sello"
                        : ref.relacion === "cita"
                          ? "neutro"
                          : "alerta"
                    }
                    className="mt-0.5 h-fit self-start"
                  >
                    {ETIQUETA_RELACION[ref.relacion]}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{ref.etiqueta}</p>
                    {norma ? (
                      <>
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                          {desdeMayusculas(norma.titulo)}
                          {norma.fecha && ` · ${norma.fechaIso ? formatFecha(norma.fechaIso) : norma.fecha}`}
                          {norma.gaceta && ` · Gaceta ${norma.gaceta}`}
                        </p>
                        {/*
                          Cada cita lleva su enlace al texto vigente, y era un
                          renglón de 16 px dentro de una lista apretada: dos
                          seguidos quedaban a menos de un dedo uno de otro. Con
                          `min-h-11` cada uno ocupa el alto de un mando y se
                          separan solos; desde `sm` vuelven al renglón.
                        */}
                        {RUTA_POR_TIPO[ref.tipo] && ref.numero ? (
                          <Button
                            asChild
                            variant="link"
                            size="sm"
                            className="mt-1 h-auto min-h-11 justify-start whitespace-normal px-0 text-left text-xs font-medium sm:min-h-0"
                          >
                            <Link href={enlace.norma(ref.tipo, ref.numero) ?? "/normativa"}>
                              Leer el texto de esta norma
                              <span className="sr-only">{`: ${ref.etiqueta}`}</span> →
                            </Link>
                          </Button>
                        ) : (
                          norma.url && (
                            <Button
                              asChild
                              variant="link"
                              size="sm"
                              className="mt-1 h-auto min-h-11 justify-start whitespace-normal px-0 text-left text-xs font-medium sm:min-h-0"
                            >
                              <a href={norma.url} target="_blank" rel="noopener noreferrer">
                                Texto oficial en la Consultoría Jurídica
                                <IconExternal className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )
                        )}
                      </>
                    ) : (
                      <p className="mt-0.5 text-xs text-ink-soft">
                        Citada en el título; no se pudo enlazar su texto.
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {/* 11 px es letra pequeña de contrato; el suelo de la casa para un
                metadato son 12, y esta línea dice de dónde salen las citas. */}
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              Las citas se extraen del enunciado oficial y se resuelven contra la{" "}
              <Link href="/normativa" className="text-brand-700 underline">
                normativa del Poder Ejecutivo
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
