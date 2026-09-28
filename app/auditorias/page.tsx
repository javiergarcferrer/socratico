import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import {
  filtrarInformes,
  getAuditorias,
  informesDe,
  type EstadoDeclaracion,
  type FuenteAuditoria,
  type ListaDeclaracion,
} from "@/lib/auditorias";
import { hrefInstitucion, institucionPorId } from "@/lib/instituciones";
import { formatFecha } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";
import { NavFiltros, FiltroEnlace } from "@/components/nav-filtros";
import { BuscadorUrl } from "@/components/buscador-url";
import { EstadoVacio } from "@/components/estado-vacio";
import { Paginador } from "@/components/paginador";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import Plegable from "@/components/plegable";
import Antiguedad from "@/components/antiguedad";
import { recortar } from "@/lib/raiz";

export const metadata: Metadata = {
  alternates: { canonical: "/auditorias" },
  title: "Auditorías y declaraciones juradas",
  description:
    "Los informes de auditoría de la Contraloría General y de la Cámara de Cuentas, el Índice de Control Interno trimestral y las listas de quién presentó su declaración jurada de patrimonio a tiempo, tarde o no la presentó.",
};

export const revalidate = 86400;

const POR_PAGINA = 25;

const FUENTES: { clave: FuenteAuditoria | ""; nombre: string }[] = [
  { clave: "", nombre: "Los dos órganos" },
  { clave: "contraloria", nombre: "Contraloría General" },
  { clave: "camara", nombre: "Cámara de Cuentas" },
];

const NOMBRE_FUENTE: Record<FuenteAuditoria, string> = {
  contraloria: "Contraloría",
  camara: "Cámara de Cuentas",
};

const ESTADO: Record<EstadoDeclaracion, { nombre: string; variant: "valido" | "neutro" | "alerta" }> = {
  a_tiempo: { nombre: "A tiempo", variant: "valido" },
  tarde: { nombre: "Tarde", variant: "neutro" },
  omiso: { nombre: "No la presentó", variant: "alerta" },
};

/**
 * ¿A quién audita el Estado y quién rinde cuentas? — la instantánea de
 * `lib/auditorias.ts` sobre los dos órganos de control.
 *
 * Búsqueda, órgano y página viven en la URL (`?q=`, `?fuente=`, `?pagina=`):
 * una búsqueda se comparte tal cual. Las listas de declaración jurada se
 * **enlazan**, no se reproducen: nombran personas, y aquí no se muestra
 * ningún nombre.
 */
export default async function AuditoriasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; fuente?: string; pagina?: string }>;
}) {
  const sp = await searchParams;
  const d = await getAuditorias();
  if (!d) {
    return (
      <EstadoVacio
        variante="caida"
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="No pudimos leer la copia de las auditorías"
        accion={
          <Button asChild variant="secondary">
            <a
              href="https://camaradecuentas.gob.do/index.php/ultimas-auditorias"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver las auditorías en el sitio de la Cámara de Cuentas
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          </Button>
        }
      >
        La instantánea de los informes y las listas no está disponible en este
        momento. Los informes siguen publicados en los sitios de la Contraloría y
        de la Cámara de Cuentas, y el resto de la plataforma sigue en pie.
      </EstadoVacio>
    );
  }

  const fuente = FUENTES.find((f) => f.clave && f.clave === sp.fuente)?.clave || undefined;
  const q = recortar(sp.q, 120);
  const todos = informesDe(d);
  const filas = filtrarInformes(todos, { q, fuente: fuente as FuenteAuditoria | undefined });
  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Math.floor(Number(sp.pagina)) || 1), paginas);
  const vista = filas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const url = (cambios: { fuente?: string; pagina?: number }) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    const f = "fuente" in cambios ? cambios.fuente : fuente;
    if (f) u.set("fuente", f);
    if (cambios.pagina && cambios.pagina > 1) u.set("pagina", String(cambios.pagina));
    const s = u.toString();
    return s ? `/auditorias?${s}` : "/auditorias";
  };

  const nCgr = d.contraloria.informes.length;
  const nCcrd = d.camara.informes.length;
  const listadoCcrd =
    d.camara.paginasListado && d.camara.porPagina ? d.camara.paginasListado * d.camara.porPagina : null;
  const ici = d.contraloria.ici ?? [];

  const omisos = d.camara.declaraciones.filter((l) => l.estado === "omiso");
  const tardias = d.camara.declaraciones.filter((l) => l.estado === "tarde");
  const aTiempo = d.camara.declaraciones.filter((l) => l.estado === "a_tiempo");
  const corteOmisos = omisos.map((l) => l.periodo).filter(Boolean).sort().pop() ?? null;
  const cat = d.camara.categorias;

  return (
    <div className="space-y-5">
      <Portada
        rotulo={`Contraloría General y Cámara de Cuentas · instantánea del ${formatFecha(d.generado)}`}
        titulo="¿A quién audita el Estado y quién rinde cuentas?"
        descripcion={
          <>
            Dos órganos revisan cómo se gasta el dinero público. La Contraloría
            General controla desde dentro del Poder Ejecutivo; la Cámara de Cuentas
            audita desde fuera y le rinde al Congreso. La Cámara, además, recibe las
            declaraciones juradas de patrimonio de los funcionarios y publica quién
            la presentó a tiempo, quién tarde y quién no. Aquí están los informes y
            esas listas en un solo lugar; cada enlace abre el documento en el sitio
            del órgano que lo publica.
          </>
        }
        aviso={
          listadoCcrd
            ? `De la Cámara, los ${formatInt(nCcrd)} informes más recientes de unos ${formatInt(listadoCcrd)} que lista su sitio`
            : undefined
        }
      >
        <PortadaCifras>
          <PortadaCifra etiqueta="Informes de la Contraloría" valor={formatInt(nCgr)} destacar />
          <PortadaCifra etiqueta="Informes recientes de la Cámara" valor={formatInt(nCcrd)} />
          <PortadaCifra etiqueta="Trimestres del índice de control interno" valor={formatInt(ici.length)} />
          <PortadaCifra
            etiqueta="Listas de omisos del último corte"
            valor={formatInt(omisos.length)}
          />
        </PortadaCifras>
      </Portada>

      <section aria-labelledby="informes" className="space-y-4">
        <h2 id="informes" className="font-display text-2xl leading-tight text-ink">
          ¿Qué instituciones han sido auditadas?
        </h2>

        <Suspense>
          <BuscadorUrl
            etiqueta="Buscar en los informes de auditoría"
            placeholder="MINERD, EDENORTE, ayuntamiento, 2020…"
            ayuda={`Busca todas las palabras, en cualquier orden, en el título, la institución (por nombre o siglas) y el período de ${formatInt(todos.length)} informes, sin distinguir tildes. No busca dentro del PDF.`}
          />
        </Suspense>

        <NavFiltros etiqueta="Órgano de control">
          {FUENTES.map((f) => (
            <FiltroEnlace
              key={f.nombre}
              href={url({ fuente: f.clave || undefined, pagina: undefined })}
              activo={(fuente ?? "") === f.clave}
            >
              {f.nombre}
            </FiltroEnlace>
          ))}
        </NavFiltros>

        {filas.length === 0 ? (
          <EstadoVacio
            titulo={q ? `Ningún informe coincide con «${q}»` : "No hay informes con este filtro"}
            accion={
              <Button asChild variant="secondary">
                <Link href="/auditorias">Ver todos los informes</Link>
              </Button>
            }
          >
            Prueba con las siglas de la institución o con menos palabras. De la
            Cámara de Cuentas solo están aquí los más recientes; su archivo completo
            sigue en su sitio.
          </EstadoVacio>
        ) : (
          <Card as="section" className="overflow-hidden">
            <p className="px-5 pt-4 text-xs text-ink-soft sm:px-6" aria-live="polite">
              {q || fuente
                ? `${formatInt(filas.length)} de ${formatInt(todos.length)} informes`
                : `${formatInt(todos.length)} informes`}
              , del más reciente al más antiguo.
            </p>
            <ol className="mt-2 divide-y divide-hairline border-t border-hairline">
              {vista.map((i) => {
                const inst = i.uc ? institucionPorId(i.uc) : null;
                return (
                  <li key={i.url} className="relative px-5 py-3 sm:px-6">
                    <a
                      href={i.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-[15px] leading-snug text-ink [overflow-wrap:anywhere] estira hover:text-brand-700"
                    >
                      {i.titulo}
                      <span className="sr-only">
                        {" "}
                        (abre {i.fuente === "camara" ? "la ficha" : "el PDF"} en el sitio de la{" "}
                        {NOMBRE_FUENTE[i.fuente]})
                      </span>
                    </a>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                      <Badge variant="contorno">{NOMBRE_FUENTE[i.fuente]}</Badge>
                      {i.replica && <Badge variant="neutro">Réplica de la institución</Badge>}
                      {inst ? (
                        <Link
                          href={hrefInstitucion(inst)}
                          className="relative z-10 inline-flex min-h-6 items-center text-brand-700 hover:underline"
                        >
                          {inst.nombre}
                        </Link>
                      ) : null}
                      {i.periodo && <span>Período {i.periodo}</span>}
                      <Antiguedad
                        iso={i.fecha}
                        prefijo={i.fuente === "contraloria" ? "Subido" : "Publicado"}
                      />
                    </span>
                  </li>
                );
              })}
            </ol>
            {paginas > 1 && (
              <div className="border-t border-hairline px-5 py-3 sm:px-6">
                <Paginador pagina={pagina} paginas={paginas} href={(p) => url({ pagina: p })} />
              </div>
            )}
          </Card>
        )}

        {ici.length > 0 && (
          <Card as="section" className="overflow-hidden">
            <div className="px-5 pt-5 sm:px-6 sm:pt-6">
              <CardTitle>¿Cómo sale el control interno de cada trimestre?</CardTitle>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                El Índice de Control Interno (ICI) es la nota con que la Contraloría
                mide cuánto cumplen las instituciones las normas básicas de control
                interno (NOBACI). Lo publica por trimestre, en PDF; aquí se enlaza
                cada uno.
              </p>
            </div>
            <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
              {ici.slice(0, 4).map((t) => (
                <FilaIci key={t.url} titulo={t.titulo} fecha={t.fecha} url={t.url} />
              ))}
            </ul>
            {ici.length > 4 && (
              <Plegable
                className="border-t border-hairline"
                etiqueta={`Ver los ${formatInt(ici.length - 4)} trimestres anteriores`}
                etiquetaCerrar="Ocultar los trimestres anteriores"
              >
                <ul className="divide-y divide-hairline">
                  {ici.slice(4).map((t) => (
                    <FilaIci key={t.url} titulo={t.titulo} fecha={t.fecha} url={t.url} />
                  ))}
                </ul>
              </Plegable>
            )}
          </Card>
        )}
      </section>

      <section aria-labelledby="declaraciones" className="space-y-4">
        <h2 id="declaraciones" className="font-display text-2xl leading-tight text-ink">
          ¿Quién presentó su declaración jurada?
        </h2>
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Quien entra a un cargo público o sale de él debe declarar su patrimonio
          ante la Cámara de Cuentas (Ley 311-14). La Cámara publica listas de quién
          lo hizo a tiempo, quién tarde y quién no lo hizo (los <em>omisos</em>). Esas
          listas nombran personas: <strong className="font-semibold text-ink">aquí no se muestra ningún nombre</strong>.
          Cada lista se enlaza en el sitio de la Cámara, donde está publicada.
        </p>

        <Card as="section" className="overflow-hidden">
          <div className="px-5 pt-5 sm:px-6 sm:pt-6">
            <CardTitle>
              ¿Quién no la había presentado{corteOmisos ? ` al ${formatFecha(corteOmisos)}` : ""}?
            </CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              La Cámara publica los omisos en una lista por grupo, cada dos meses.
              Estas son las {formatInt(omisos.length)} listas del último corte
              {cat.omiso?.leido ? ` (${cat.omiso.leido.replace(/^\d+\s*-\s*/, "").toLowerCase()})` : ""}.
              Son PDF y todavía no las contamos: cuántas personas hay en cada una se
              ve al abrirla.
            </p>
          </div>
          <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
            {omisos.map((l) => (
              <FilaLista key={l.url} l={l} />
            ))}
          </ul>
        </Card>

        <Card as="section" className="overflow-hidden">
          <div className="px-5 pt-5 sm:px-6 sm:pt-6">
            <CardTitle>¿Quién la presentó tarde?</CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Las listas de declaraciones extemporáneas: {formatInt(tardias.length)} cortes
              {tardias.length ? `, del ${formatFecha(ultimo(tardias))} hacia atrás` : ""}.
              Hasta 2025 se titulaban «Extemporáneas Procuraduría»: son las que la
              Cámara remite a la Procuraduría.
            </p>
          </div>
          <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
            {tardias.slice(0, 3).map((l) => (
              <FilaLista key={l.url} l={l} />
            ))}
          </ul>
          {tardias.length > 3 && (
            <Plegable
              className="border-t border-hairline"
              etiqueta={`Ver los ${formatInt(tardias.length - 3)} cortes anteriores`}
              etiquetaCerrar="Ocultar los cortes anteriores"
            >
              <ul className="divide-y divide-hairline">
                {tardias.slice(3).map((l) => (
                  <FilaLista key={l.url} l={l} />
                ))}
              </ul>
            </Plegable>
          )}
        </Card>

        <Card as="section" className="overflow-hidden">
          <div className="px-5 pt-5 sm:px-6 sm:pt-6">
            <CardTitle>¿Quién la presentó a tiempo?</CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              {aTiempo.length
                ? `La Cámara lista ${formatInt(aTiempo.length)} archivos de declaraciones en tiempo hábil; el más reciente es ${
                    ultimo(aTiempo) ? `del ${formatFecha(ultimo(aTiempo))}` : "sin fecha en el título"
                  }. Desde entonces no ha publicado otro.`
                : "La Cámara no lista archivos de declaraciones en tiempo hábil."}
            </p>
          </div>
          {aTiempo.length > 0 && (
            <Plegable
              className="mt-3 border-t border-hairline"
              etiqueta={`Ver los ${formatInt(aTiempo.length)} archivos`}
              etiquetaCerrar="Ocultar los archivos"
            >
              <ul className="divide-y divide-hairline">
                {aTiempo.map((l, n) => (
                  <FilaLista key={`${l.url}-${n}`} l={l} />
                ))}
              </ul>
            </Plegable>
          )}
        </Card>
      </section>

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuentes:{" "}
        <a href={d.contraloria.pagina} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
          informes de auditoría
        </a>{" "}
        y{" "}
        <a href={d.contraloria.paginaIci} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
          ICI
        </a>{" "}
        de la Contraloría General;{" "}
        <a href={d.camara.listado} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
          últimas auditorías
        </a>{" "}
        y{" "}
        <a href="https://camaradecuentas.gob.do/index.php/reportes-djp" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
          reportes de declaración jurada
        </a>{" "}
        de la Cámara de Cuentas. Instantánea del {formatFecha(d.generado)}. La fecha
        de un informe de la Contraloría es la de subida al sitio, no la del informe;
        la de la Cámara, la de publicación. Una institución enlaza a su ficha solo si
        sus siglas o su nombre coinciden exactamente con los de la plataforma. Mira{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          el estado de las fuentes
        </Link>
        .
      </p>
    </div>
  );
}

/** La fecha más reciente de un grupo de listas: la de corte o, si falta, la de publicación. */
function ultimo(listas: ListaDeclaracion[]): string | undefined {
  return listas
    .map((l) => l.periodo ?? l.publicado)
    .filter((f): f is string => Boolean(f))
    .sort()
    .pop();
}

function FilaIci({ titulo, fecha, url }: { titulo: string; fecha: string | null; url: string }) {
  return (
    <li className="relative px-5 py-3 sm:px-6">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-[15px] leading-snug text-ink estira hover:text-brand-700"
      >
        {titulo.replace(/^Resultados ICI\s*-\s*/i, "").replace(/^./, (c) => c.toUpperCase())}
        <span className="sr-only"> (abre el PDF en el sitio de la Contraloría)</span>
      </a>
      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-soft">
        <Badge variant="contorno">PDF</Badge>
        <Antiguedad iso={fecha} prefijo="Subido" />
      </span>
    </li>
  );
}

/**
 * Una lista de declaraciones: su grupo (si es de omisos) o su título, la fecha
 * de corte y el enlace al PDF en la Cámara. Nunca un nombre de persona: la
 * instantánea no los guarda.
 */
function FilaLista({ l }: { l: ListaDeclaracion }) {
  const inst = l.uc ? institucionPorId(l.uc) : null;
  const e = ESTADO[l.estado];
  return (
    <li className="relative px-5 py-3 sm:px-6">
      <a
        href={l.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-[15px] leading-snug text-ink [overflow-wrap:anywhere] estira hover:text-brand-700"
      >
        {l.grupo ?? capitalizar(l.lista)}
        <span className="sr-only"> (abre la lista en el sitio de la Cámara de Cuentas)</span>
      </a>
      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
        <Badge variant={e.variant}>{e.nombre}</Badge>
        {l.periodo && <span>Al {formatFecha(l.periodo)}</span>}
        {inst && (
          <Link href={hrefInstitucion(inst)} className="relative z-10 inline-flex min-h-6 items-center text-brand-700 hover:underline">
            Ficha: {inst.acronimo && inst.acronimo.length <= 8 ? inst.acronimo : inst.nombre}
          </Link>
        )}
        <Antiguedad iso={l.publicado} prefijo="Publicada" />
      </span>
    </li>
  );
}

/** Los títulos de la Cámara vienen en mayúsculas sostenidas: se leen en caja normal. */
function capitalizar(s: string): string {
  const t = s.trim();
  if (t !== t.toUpperCase()) return t;
  const bajo = t.toLowerCase().replace(/\bdjp\b/g, "DJP");
  return bajo.charAt(0).toUpperCase() + bajo.slice(1);
}
