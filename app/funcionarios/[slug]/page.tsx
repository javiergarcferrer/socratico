import Link from "next/link";
import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { ConectadoCon } from "@/components/conectado-con";
import { EnElGrafo, alternasRdf } from "@/components/en-el-grafo";
import { DeclaracionJurada } from "@/components/fuentes-nuevas/declaracion-jurada";
import Plegable from "@/components/plegable";
import { Ruta } from "@/components/ruta";
import AccionesFicha from "@/components/acciones-ficha";
import { Termino } from "@/components/termino";
import { formatFecha, hace } from "@/lib/format";
import { enlace } from "@/lib/grafo";
import { hrefInstitucion, institucionPorId } from "@/lib/instituciones";
import { decretoPorNumero, hrefDecreto } from "@/lib/decretos";
import { provinciaDeTexto } from "@/lib/provincias";
import {
  ETIQUETA_MOVIMIENTO,
  ETIQUETA_ORIGEN,
  cargoPrincipal,
  esActual,
  getFuncionarios,
  parecidos,
  personaPorId,
  type Cargo,
} from "@/lib/funcionarios";

export const revalidate = 86400;

type Props = { params: Promise<{ slug: string }> };

const cargar = cache((slug: string) => personaPorId(decodeURIComponent(slug)));


export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await cargar(slug);
  if (!p) return { title: "Persona no encontrada" };
  const c = cargoPrincipal(p);
  return {
    title: p.nombre,
    alternates: { canonical: enlace.funcionario(p.id), types: alternasRdf({ tipo: "funcionario", id: p.id }) },
    description: c
      ? `${p.nombre}: ${c.titulo}. Sus cargos públicos, con el decreto o la fuente de cada uno.`
      : `${p.nombre}: sus cargos públicos, con la fuente de cada uno.`,
    /*
      Proporcionalidad (Ley 172-13): la plataforma muestra lo que el Estado
      publica de cada servidor, pero solo ofrece a los buscadores externos la
      ficha de quien es PEP hoy: ocupa un cargo obligado a declarar patrimonio
      o lo ocupó en los últimos tres años. La de un encargado de departamento,
      o la de quien dejó un ministerio en 2004, se lee aquí y no se indexa.
    */
    ...(p.pepVigente ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function FuncionarioPage({ params }: Props) {
  const { slug } = await params;
  const persona = await cargar(slug);
  if (!persona) notFound();
  const datos = (await getFuncionarios())!;
  // Adónde lleva cada decreto de sus cargos: su ficha si el registro la resuelve, si no su PDF.
  const numeros = unicas(persona.cargos.map((c) => c.decreto?.numero).filter((n): n is string => Boolean(n)));
  const resueltos = await Promise.all(numeros.map(async (n) => [n, await decretoPorNumero(n)] as const));
  // El número con ficha y el documento de esa ficha: un cargo que cita otro
  // documento con el mismo número (una errata, un duplicado) va a su PDF.
  const decretos = new Map(resueltos.filter(([, d]) => d?.ficha).map(([n, d]) => [n, d!.docId]));

  const principal = cargoPrincipal(persona);
  const hoy = principal ? esActual(principal) : false;
  const instituciones = unicas(persona.cargos.map((c) => c.institucionId).filter((i): i is number => i != null))
    .map((id) => institucionPorId(id))
    .filter((i): i is NonNullable<typeof i> => i != null);
  const provincias = unicas(
    persona.cargos
      .map((c) => provinciaDeTexto(c.provincia ?? provinciaEnCargo(c.titulo)))
      .filter((p): p is NonNullable<typeof p> => p != null),
  );
  const otros = parecidos(datos, persona);
  const numerales = persona.pep;

  return (
    <div className="mx-auto max-w-4xl">
      <Ruta raiz={{ href: "/funcionarios", label: "Funcionarios" }} actual={persona.nombre} />

      <header className="mt-1 sm:mt-3">
        <p className="rotulo text-ink-soft">
          {[principal?.institucion ?? (principal?.institucionId ? institucionPorId(principal.institucionId)?.nombre : null),
            hoy ? "en el cargo" : null]
            .filter(Boolean)
            .join(" · ") || "Cargos públicos"}
        </p>
        <h1 className="mt-1.5 font-display text-3xl leading-tight text-ink sm:text-4xl">{persona.nombre}</h1>
        {principal && (
          <p className="mt-2 text-sm text-ink-soft">
            {principal.titulo}
            {principal.fecha && (
              <>
                {" · "}
                {hoy ? "desde el " : ""}
                <time dateTime={principal.fecha} className="font-mono tabular-nums">
                  {formatFecha(principal.fecha)}
                </time>
              </>
            )}
          </p>
        )}
        {persona.alias.length > 0 && (
          <p className="mt-1 text-xs text-ink-soft">
            También escrito: {persona.alias.slice(0, 4).join(" · ")}
          </p>
        )}
        <AccionesFicha
          className="mt-3"
          tipo="funcionario"
          id={persona.id}
          titulo={persona.nombre}
          href={enlace.funcionario(persona.id)}
        />
      </header>

      <Card as="section" className="mt-5 p-5">
        <p className="rotulo text-ink-soft">¿Es persona expuesta políticamente?</p>
        {numerales.length > 0 ? (
          <>
            {persona.pepVigente ? (
              <p className="mt-1.5 text-sm leading-relaxed text-ink">
                Sí, por su cargo. La Ley 311-14 obliga a declarar patrimonio a quien ocupa{" "}
                {numerales.length === 1 ? "este tipo de cargo" : "estos tipos de cargo"}, y la Ley 155-17 (art.
                2, num. 19) considera <Termino clave="pep">persona expuesta políticamente</Termino> a todo
                funcionario obligado a declarar, mientras ocupe el cargo y hasta tres años después.
                {persona.pepUltimaFecha &&
                  ` Las fuentes no lo dan en el cargo hoy; su fecha más reciente en él es del ${formatFecha(persona.pepUltimaFecha)}, dentro de esos tres años.`}
              </p>
            ) : (
              <p className="mt-1.5 text-sm leading-relaxed text-ink">
                No consta hoy. Ocupó {numerales.length === 1 ? "un cargo" : "cargos"} de los que la Ley 311-14
                obliga a declarar patrimonio
                {persona.pepUltimaFecha ? `; la fecha más reciente que dan las fuentes es del ${formatFecha(persona.pepUltimaFecha)}` : ""}
                . La Ley 155-17 (art. 2, num. 19) considera{" "}
                <Termino clave="pep">persona expuesta políticamente</Termino> a quien lo ocupa y hasta tres
                años después de dejarlo, y las fuentes que lee la plataforma no lo dan en ese cargo hoy ni en
                los últimos tres años.
              </p>
            )}
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {numerales.map((n) => (
                <li key={n}>
                  <span className="font-mono tabular-nums text-ink-soft">Art. 2, num. {n}</span> ·{" "}
                  {datos.ley311[n] ?? "cargo obligado a declarar"}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              Es una categoría legal que obliga a bancos y notarios a mirar sus operaciones con más cuidado, no
              una acusación. La plataforma asigna el numeral por el nombre del cargo; dónde consultar su{" "}
              <Termino clave="declaracionJurada">declaración jurada</Termino> está justo debajo.
            </p>
          </>
        ) : (
          <p className="mt-1.5 text-sm leading-relaxed text-ink">
            Ninguno de los cargos registrados aquí casa con los que enumera el artículo 2 de la Ley 311-14, que
            son los que la Ley 155-17 considera de{" "}
            <Termino clave="pep">persona expuesta políticamente</Termino>. La clasificación se hace por el
            nombre del cargo, con reglas conservadoras: ante la duda, no se afirma.
          </p>
        )}
      </Card>

      <DeclaracionJurada persona={persona} />

      {persona.firma && (
        <Card as="section" className="mt-5">
          <CardHeader>
            <CardTitle>¿Cuántos decretos firmó?</CardTitle>
          </CardHeader>
          <TiraDeCifras>
            <Cifra
              etiqueta="Decretos con su firma"
              valor={persona.firma.decretos.toLocaleString("es-DO")}
              ancla={{ alcance: "registro", periodo: "todo lo que publica la Consultoría Jurídica" }}
              href={enlace.decretosFirmados(persona.id)}
            />
            <Cifra etiqueta="El primero" valor={formatFecha(persona.firma.desde)} />
            <Cifra etiqueta="El más reciente" valor={formatFecha(persona.firma.hasta)} />
          </TiraDeCifras>
          <div className="border-t border-hairline px-5 py-3">
            <Button asChild variant="secondary">
              <Link href={enlace.decretosFirmados(persona.id)}>
                {`Ver los ${persona.firma.decretos.toLocaleString("es-DO")} decretos, por año y por materia`}
              </Link>
            </Button>
          </div>
          <p className="border-t border-hairline px-5 py-3 text-xs leading-relaxed text-ink-soft">
            La Consultoría Jurídica anota en cada decreto quién lo firma, como «{persona.firma.como}». El rango
            descarta una fecha suelta, a más de un año de cualquier otro decreto del mismo firmante: es un error
            de captura del origen.
          </p>
        </Card>
      )}

      <ConectadoCon
        className="mt-5"
        aristas={[
          persona.legislador != null && {
            etiqueta: "Su ficha de legislador",
            href: enlace.legislador(persona.legislador),
            nombre: "Qué propuso y cómo votó",
            fuente: "SIL de la Cámara",
          },
          ...instituciones.slice(0, 4).map((i) => ({
            etiqueta: "Institución donde tuvo cargo",
            href: hrefInstitucion(i),
            nombre: i.nombre,
            fuente: "Cruce de instituciones",
          })),
          ...provincias.slice(0, 2).map((p) => ({
            etiqueta: "Provincia de su cargo",
            href: enlace.provincia(p.slug),
            nombre: p.nombre,
            fuente: "JCE y SIL",
          })),
        ]}
      />

      <Card as="section" className="mt-5">
        <CardHeader>
          <CardTitle>¿Qué cargos ha ocupado?</CardTitle>
          <CardAction className="font-mono tabular-nums">{persona.cargos.length}</CardAction>
        </CardHeader>
        {persona.cargos.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-soft">
            Solo figura como firmante de decretos: ninguna fuente de la instantánea le asigna otro cargo.
          </p>
        ) : persona.cargos.length <= 8 ? (
          <ul>
            {persona.cargos.map((c, k) => (
              <FilaCargo key={k} cargo={c} decretos={decretos} />
            ))}
          </ul>
        ) : (
          <Plegable
            resumen={
              <ul>
                {persona.cargos.slice(0, 8).map((c, k) => (
                  <FilaCargo key={k} cargo={c} decretos={decretos} />
                ))}
              </ul>
            }
            etiqueta={`Ver los ${persona.cargos.length} cargos`}
            etiquetaCerrar="Ocultar los cargos más viejos"
          >
            <ul>
              {persona.cargos.slice(8).map((c, k) => (
                <FilaCargo key={k} cargo={c} decretos={decretos} />
              ))}
            </ul>
          </Plegable>
        )}
      </Card>

      {otros.length > 0 && (
        <Card as="section" className="mt-5">
          <CardHeader>
            <CardTitle>¿Es la misma persona?</CardTitle>
          </CardHeader>
          <p className="px-5 pt-1 text-sm leading-relaxed text-ink-soft">
            Estos nombres contienen todas las palabras del suyo. Pueden ser la misma persona escrita de otra
            forma o alguien distinto: compara sus cargos antes de unirlos.
          </p>
          <ul className="mt-2">
            {otros.map((o) => {
              const c = cargoPrincipal(o);
              return (
                <li key={o.id} className="relative border-t border-hairline">
                  <div className="px-4 py-3 sm:px-5">
                    <Link
                      href={enlace.funcionario(o.id)}
                      className="text-[15px] font-medium text-ink estira hover:text-brand-700"
                    >
                      {o.nombre}
                    </Link>
                    {c && <p className="mt-0.5 text-xs text-ink-soft">{c.titulo}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <p className="mt-5 text-xs leading-relaxed text-ink-soft">
        Cada cargo dice de dónde sale: el Directorio de Funcionarios del MAP, un decreto de la Consultoría
        Jurídica, la página de una alta corte o de la Junta Central Electoral, los electos de 2024 o el SIL.
        Una persona es su nombre tal como lo escriben esas fuentes: dos grafías distintas son dos fichas.
        Instantánea del {formatFecha(datos.generado)}.{" "}
        <Link href="/funcionarios" className="text-brand-700 underline">
          Volver al directorio
        </Link>
        .
      </p>
      <EnElGrafo nodo={{ tipo: "funcionario", id: persona.id }} className="mt-6" />
    </div>
  );
}

function FilaCargo({ cargo: c, decretos }: { cargo: Cargo; decretos: Map<string, number | null> }) {
  const inst = c.institucionId != null ? institucionPorId(c.institucionId) : null;
  const tono = c.movimiento === "cesa" || c.movimiento === "sustituido" || c.movimiento === "renuncia" || c.movimiento === "anterior"
    ? "neutro"
    : esActual(c)
      ? "valido"
      : "firma";
  const decreto = c.decreto;
  const hrefDelDecreto = decreto
    ? hrefDecreto({
        numero: decreto.numero,
        ficha: decretos.has(decreto.numero) && (decreto.docId == null || decretos.get(decreto.numero) === decreto.docId),
        docId: decreto.docId,
      })
    : null;
  return (
    <li className="border-b border-hairline px-4 py-3.5 last:border-0 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge forma="etiqueta" variant={tono}>
          {ETIQUETA_MOVIMIENTO[c.movimiento]}
        </Badge>
        {c.fecha && (
          <time dateTime={c.fecha} title={formatFecha(c.fecha)} className="font-mono text-xs tabular-nums text-ink-soft">
            {formatFecha(c.fecha)}
            {esActual(c) ? ` · ${hace(c.fecha)}` : ""}
          </time>
        )}
        {!c.fecha && c.periodo && <span className="font-mono text-xs tabular-nums text-ink-soft">{c.periodo}</span>}
        {/* El tipo de cargo, no el estado de la persona: si hoy es PEP lo dice la tarjeta de arriba. */}
        {c.numeral311 != null && (
          <Badge variant="contorno" title="Cargo obligado a declarar patrimonio (Ley 311-14, art. 2)">
            {`Ley 311-14 · num. ${c.numeral311}`}
          </Badge>
        )}
      </div>
      <p className="mt-1.5 text-[15px] leading-snug text-ink">
        {c.grado && <span className="text-ink-soft">{c.grado} · </span>}
        {c.titulo}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        {inst ? (
          <Link href={hrefInstitucion(inst)} className="text-brand-700 hover:underline">
            {inst.nombre}
          </Link>
        ) : (
          c.institucion && <span>{c.institucion}</span>
        )}
        {(inst || c.institucion) && " · "}
        {c.unidad && `${c.unidad} · `}
        {c.partido && `${c.partido} · `}
        {c.votos != null && (
          <>
            <span className="font-mono tabular-nums">{c.votos.toLocaleString("es-DO")}</span> votos ·{" "}
          </>
        )}
        {c.sustituidoPor && `En su lugar: ${c.sustituidoPor} · `}
        {decreto ? (
          hrefDelDecreto ? (
            <Link href={hrefDelDecreto} className="text-brand-700 hover:underline">
              Decreto {decreto.numero}
            </Link>
          ) : (
            <>Decreto {decreto.numero}</>
          )
        ) : c.url ? (
          <a href={c.url} className="text-brand-700 hover:underline" rel="noopener">
            {ETIQUETA_ORIGEN[c.origen]}
          </a>
        ) : (
          ETIQUETA_ORIGEN[c.origen]
        )}
        {decreto && c.origen === "map" && " (según el MAP)"}
      </p>
    </li>
  );
}

/** «Gobernadora de la provincia La Altagracia»: la provincia que el cargo nombra. */
function provinciaEnCargo(titulo: string): string | null {
  const m = /\bprovincia (?:de )?([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ ]+?)(?:[,.]|$)/.exec(titulo);
  return m ? m[1].trim() : null;
}

function unicas<T>(lista: T[]): T[] {
  return [...new Set(lista)];
}

