import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { CondicionBadge } from "@/components/iniciativa-card";
import { Termino } from "@/components/termino";
import {
  CUATRIENIOS,
  CUATRIENIO_VIGENTE,
  SENADO_PAGE_SIZE,
  buscarExpedientesSenado,
  cuatrienioPorEtiqueta,
  listarRecientesSenado,
  type ExpedienteSenado,
} from "@/lib/senado";
import { IconSearch } from "@/components/icons";
import { EsqueletoFilas } from "@/components/esqueleto";
import Antiguedad from "@/components/antiguedad";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EstadoVacio } from "@/components/estado-vacio";
import { FiltroEnlace, NavFiltros } from "@/components/nav-filtros";
import { enlace } from "@/lib/grafo";
import { recortar } from "@/lib/raiz";

export const metadata: Metadata = {
  alternates: { canonical: "/congreso/senado" },
  title: "Senado",
  description:
    "Expedientes legislativos del Senado dominicano: estado procesal, historial de trámites y promulgación, desde 2002 hasta hoy.",
};

export const revalidate = 300;

export default async function SenadoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; c?: string }>;
}) {
  const params = await searchParams;
  const q = recortar(params.q, 120);
  const cuatrienio = cuatrienioPorEtiqueta(params.c) ?? CUATRIENIO_VIGENTE;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-5">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          Senado de la República
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          Expedientes en vivo desde el sistema de consulta pública del Senado,
          con una colección por <Termino clave="cuatrienio">cuatrienio</Termino> desde 2002.{" "}
          <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
            Cómo se lee esta fuente
          </Link>
          .
        </p>
      </header>

      {/*
        Formulario GET puro: la consulta y la colección viven en la URL, así
        cualquier búsqueda es compartible — misma regla que en licitaciones.
      */}
      <form action="/congreso/senado" method="get" className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          {/*
            Esta búsqueda es un formulario GET de servidor —no hay estado de
            cliente que compartir—, así que usa el campo directamente y no
            `CampoBusqueda`, que vive del estado. Mismo vestido, otra mecánica.
          */}
          {/*
            El marcador va corto porque en un teléfono el campo mide unos
            250 px y la frase larga se cortaba a la mitad; el alcance lo dice
            entera la ayuda de abajo. `enterKeyHint` pone «buscar» en la tecla
            de retorno del teclado táctil, que es la que se pulsa aquí: sin
            ella el teclado ofrece «intro» y no se sabe si envía o salta línea.
          */}
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Por ejemplo: código penal…"
            aria-label="Buscar expedientes del Senado"
            aria-describedby="alcance-busqueda-senado"
            enterKeyHint="search"
            className="pl-9"
          />
        </div>
        {cuatrienio.etiqueta !== CUATRIENIO_VIGENTE.etiqueta && (
          <input type="hidden" name="c" value={cuatrienio.etiqueta} />
        )}
        <Button type="submit" className="shrink-0">
          Buscar
        </Button>
      </form>
      <p
        id="alcance-busqueda-senado"
        className="mt-2 text-xs leading-relaxed text-ink-soft"
      >
        La búsqueda del Senado es literal y distingue tildes: «educación» no
        encuentra «educacion».
      </p>

      {/*
        Colecciones por cuatrienio: cada una es una base distinta en el origen.
        Seis filtros de nueve caracteres que a 390 px envuelven en dos líneas
        limpias de tres, sin cortar el último; la altura táctil la pone
        `FiltroEnlace`, que es donde vive esa decisión.
      */}
      <NavFiltros etiqueta="Cuatrienios" className="mt-4">
        {CUATRIENIOS.map((c) => {
          const activa = c.etiqueta === cuatrienio.etiqueta;
          const sp = new URLSearchParams();
          if (q) sp.set("q", q);
          if (c.etiqueta !== CUATRIENIO_VIGENTE.etiqueta) sp.set("c", c.etiqueta);
          const qs = sp.toString();
          return (
            <FiltroEnlace
              key={c.etiqueta}
              href={`/congreso/senado${qs ? `?${qs}` : ""}`}
              activo={activa}
              mono
            >
              {c.etiqueta}
            </FiltroEnlace>
          );
        })}
      </NavFiltros>

      {/*
        El consultante del Senado es la fuente más lenta de la plataforma
        (sesión por colección, dos peticiones por lectura fría). El listado
        espera dentro de su propio Suspense: cabecera, buscador y cuatrienios
        llegan al instante y las filas caen cuando el origen contesta.
      */}
      <Suspense fallback={<ListadoEsqueleto q={q} etiqueta={cuatrienio.etiqueta} />}>
        <ListadoSenado q={q} etiqueta={cuatrienio.etiqueta} />
      </Suspense>
    </div>
  );
}

async function ListadoSenado({ q, etiqueta }: { q: string; etiqueta: string }) {
  const cuatrienio = cuatrienioPorEtiqueta(etiqueta) ?? CUATRIENIO_VIGENTE;
  const listado = q
    ? await buscarExpedientesSenado(cuatrienio.etiqueta, q)
    : await listarRecientesSenado(cuatrienio.etiqueta);

  return (
    <>
      {listado ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            <span className="font-mono tabular-nums">
              {`${listado.total.toLocaleString("es-DO")} ${
                listado.total === 1 ? "expediente" : "expedientes"
              }`}
              {q ? (
                <>
                  {" para "}
                  <span className="font-medium text-ink">{`«${q}»`}</span>
                </>
              ) : (
                <> en la colección {cuatrienio.etiqueta}</>
              )}
              {listado.enviado ? ` · buscado como «${listado.enviado}»` : null}
            </span>
          </div>

          {listado.expedientes.length > 0 ? (
            <Card as="section" className="mt-3">
              <ul>
                {listado.expedientes.map((exp) => (
                  <ExpedienteRow key={exp.id} exp={exp} />
                ))}
              </ul>
            </Card>
          ) : (
            <EstadoVacio titulo="Sin resultados" className="mt-3">
              {q
                ? "Ningún expediente lleva esas palabras en su descripción, ni tal cual ni con tildes. Prueba con menos palabras o con otra forma de decirlo."
                : "El Senado no devolvió expedientes para esta colección. Prueba con otro cuatrienio o busca por texto."}
            </EstadoVacio>
          )}

          {listado.parcial && (
            <p className="mt-4 text-xs leading-relaxed text-ink-soft">
              Filtrado entre los primeros {SENADO_PAGE_SIZE} expedientes de cada forma de la palabra: puede haber
              más. Escribe las tildes para buscar directo en el Senado.
            </p>
          )}
          {!listado.parcial && listado.total > listado.expedientes.length && (
            <p className="mt-4 text-xs leading-relaxed text-ink-soft">
              {q
                ? `El origen muestra hasta ${SENADO_PAGE_SIZE} resultados por consulta; hay ${listado.total.toLocaleString("es-DO")} en total. Añade palabras para acotar.`
                : `Se muestran los ${listado.expedientes.length} expedientes más recientes de ${listado.total.toLocaleString("es-DO")}; el consultante del Senado no pagina hacia atrás. Para llegar al resto, busca por texto.`}
            </p>
          )}
        </>
      ) : (
        <EstadoVacio
          variante="caida"
          titulo="El Senado no respondió"
          className="mt-4"
          accion={
            <Button asChild variant="secondary">
              <Link href="/fuentes">Ver el estado de las fuentes</Link>
            </Button>
          }
        >
          El sistema de consulta del Senado está caído o rechazó la conexión. No
          es que no haya expedientes: es que no pudimos mirar. Los datos vuelven
          solos cuando el origen se restablece.
        </EstadoVacio>
      )}
    </>
  );
}

function ListadoEsqueleto({ q, etiqueta }: { q: string; etiqueta: string }) {
  return (
    <div role="status" aria-busy="true">
      <p className="mt-4 text-sm text-ink-soft">
        {q
          ? `Buscando «${q}» en la colección ${etiqueta}…`
          : `Consultando la colección ${etiqueta} del Senado…`}
      </p>
      <EsqueletoFilas n={10} className="mt-3" />
    </div>
  );
}

/**
 * Fila densa, hermana visual de la de Diputados: el titular es el enlace y se
 * estira sobre la fila entera (`IniciativaCard` explica por qué).
 */
function ExpedienteRow({ exp }: { exp: ExpedienteSenado }) {
  return (
    <li className="cv-auto relative border-b border-hairline px-4 py-3.5 last:border-0 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="font-mono text-xs font-semibold tabular-nums text-brand-700">
          {exp.numero?.completo ?? `#${exp.id}`}
        </span>
        <CondicionBadge tono={exp.tono}>{exp.estado ?? "Sin estado"}</CondicionBadge>
      </div>

      <Link
        href={enlace.expedienteSenado(exp.cuatrienio, exp.id)}
        className="estira mt-1.5 block break-words text-[15px] leading-snug text-ink hover:text-brand-700"
      >
        {exp.titulo}
      </Link>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-soft">
        {exp.tipo && <span>{exp.tipo}</span>}
        {exp.fechaCreacion && (
          <>
            <span aria-hidden className="text-hairline">
              ·
            </span>
            <Antiguedad iso={exp.fechaCreacion} prefijo="Creada" />
          </>
        )}
      </div>
    </li>
  );
}
