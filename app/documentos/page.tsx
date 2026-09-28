import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";
import type { Metadata } from "next";
import {
  buscarDocumentos,
  getIndiceBiblioteca,
  type TipoDocumento,
} from "@/lib/biblioteca";
import { hrefInstitucion, institucionPorId } from "@/lib/instituciones";
import { formatFecha } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";
import { NavFiltros, FiltroEnlace } from "@/components/nav-filtros";
import { BuscadorUrl } from "@/components/buscador-url";
import { EstadoVacio } from "@/components/estado-vacio";
import { Paginador } from "@/components/paginador";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import Plegable from "@/components/plegable";
import Antiguedad from "@/components/antiguedad";
import { recortar } from "@/lib/raiz";

export const metadata: Metadata = {
  alternates: { canonical: "/documentos" },
  title: "Biblioteca del Estado",
  description:
    "Un buscador sobre los documentos que publican las instituciones del Estado dominicano en sus sitios: informes, memorias, estadísticas, nóminas, resoluciones.",
};

export const revalidate = 86400;

const TIPOS: { clave: TipoDocumento | "hojas" | ""; nombre: string }[] = [
  { clave: "", nombre: "Todo" },
  { clave: "pdf", nombre: "PDF" },
  { clave: "hojas", nombre: "Hojas de cálculo" },
  { clave: "docx", nombre: "Word" },
];

const ETIQUETA_TIPO: Record<TipoDocumento, string> = {
  pdf: "PDF",
  xlsx: "Excel",
  xls: "Excel",
  docx: "Word",
  doc: "Word",
};

/**
 * ¿Qué ha publicado el Estado? — un índice de lo que las instituciones suben a
 * sus propios sitios, buscable desde un solo sitio (`lib/biblioteca.ts`).
 *
 * Búsqueda, institución, tipo y página viven en la URL: una búsqueda se
 * comparte tal cual.
 */
export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; inst?: string; tipo?: string; p?: string }>;
}) {
  const sp = await searchParams;
  const indice = await getIndiceBiblioteca();
  if (!indice) {
    return (
      <EstadoVacio
        variante="caida"
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="No pudimos leer el índice de documentos"
        accion={
          <Button asChild variant="secondary">
            <Link href="/fuentes">Ver el estado de las fuentes</Link>
          </Button>
        }
      >
        La copia del índice no está disponible en este momento.
      </EstadoVacio>
    );
  }

  const conDocs = indice.fuentes.filter((f) => f.documentos > 0);
  const fuente = conDocs.find((f) => f.host === sp.inst) ?? null;
  const tipo = TIPOS.find((t) => t.clave && t.clave === sp.tipo)?.clave || undefined;
  const q = recortar(sp.q, 120);
  const r = await buscarDocumentos({
    q,
    host: fuente?.host,
    tipo: tipo as TipoDocumento | "hojas" | undefined,
    pagina: Number(sp.p) || 1,
  });
  const bloqueadas = indice.fuentes.filter((f) => f.documentos === 0);

  const url = (cambios: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const todo = { q: q || undefined, inst: fuente?.host, tipo, ...cambios };
    for (const [k, v] of Object.entries(todo)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `/documentos?${s}` : "/documentos";
  };

  return (
    <div className="space-y-5">
      <Portada
        rotulo={`Biblioteca del Estado · ${formatInt(conDocs.length)} instituciones · índice del ${formatFecha(indice.generado)}`}
        titulo="¿Qué ha publicado el Estado?"
        descripcion={
          <>
            Informes, memorias, estadísticas, nóminas y resoluciones que las
            instituciones suben a sus propios sitios, en un solo buscador. Las
            declaraciones juradas de patrimonio quedan fuera hasta decidir si un
            buscador por nombre de funcionario es proporcionado. Aquí no se copia nada: cada resultado abre el archivo en el
            sitio de la institución. El título es el que ella le puso (a veces, el
            nombre del archivo) y la fecha es la de subida, no la del documento.
          </>
        }
      >
        <PortadaCifras>
          <PortadaCifra etiqueta="Documentos indexados" valor={formatInt(indice.total)} destacar />
          <PortadaCifra etiqueta="Instituciones" valor={formatInt(conDocs.length)} />
          <PortadaCifra etiqueta="Consultadas sin documentos legibles" valor={formatInt(bloqueadas.length)} />
        </PortadaCifras>
      </Portada>

      <Suspense>
        <BuscadorUrl
          etiqueta="Buscar en los documentos"
          placeholder="Memoria 2025, nómina julio, auditoría, presupuesto…"
          ayuda={`Busca todas las palabras en el título y el nombre del archivo de ${formatInt(indice.total)} documentos, sin distinguir tildes.`}
        />
      </Suspense>

      <NavFiltros etiqueta="Tipo de documento">
        {TIPOS.map((t) => (
          <FiltroEnlace key={t.nombre} href={url({ tipo: t.clave || undefined, p: undefined })} activo={(tipo ?? "") === t.clave}>
            {t.nombre}
          </FiltroEnlace>
        ))}
      </NavFiltros>

      <NavFiltros etiqueta="Institución">
        <FiltroEnlace href={url({ inst: undefined, p: undefined })} activo={!fuente}>
          Todas
        </FiltroEnlace>
        {conDocs.map((f) => (
          <FiltroEnlace key={f.host} href={url({ inst: f.host, p: undefined })} activo={fuente?.host === f.host}>
            {siglas(f.nombre, f.uc)} · {formatInt(f.documentos)}
          </FiltroEnlace>
        ))}
      </NavFiltros>

      {!r ? (
        <EstadoVacio variante="caida" titulo="No pudimos leer el índice de documentos">
          La copia del índice no respondió. No es que no haya documentos: es que no
          pudimos mirar. Cada institución los sigue teniendo en su sitio.
        </EstadoVacio>
      ) : r.total === 0 ? (
        <EstadoVacio
          titulo={q ? `Ningún título coincide con «${q}»` : "No hay documentos con este filtro"}
          accion={
            <Button asChild variant="secondary">
              <Link href="/documentos">Ver todos los documentos</Link>
            </Button>
          }
        >
          Prueba con menos palabras, otra institución u otro tipo. Recuerda que se busca
          en el título que puso la institución, no dentro del documento.
        </EstadoVacio>
      ) : (
        <Card as="section" className="overflow-hidden">
          <p className="px-5 pt-4 text-xs text-ink-soft sm:px-6" aria-live="polite">
            {formatInt(r.total)} {r.total === 1 ? "documento" : "documentos"}
            {fuente ? ` de ${fuente.nombre}` : ""}, del más reciente al más antiguo.
          </p>
          <ol className="mt-2 divide-y divide-hairline border-t border-hairline">
            {r.docs.map((d) => {
              const f = conDocs.find((x) => x.host === d.host);
              return (
                <li key={d.url} className="relative px-5 py-3 sm:px-6">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[15px] leading-snug text-ink [overflow-wrap:anywhere] estira hover:text-brand-700"
                  >
                    {d.titulo}
                    <span className="sr-only"> (se abre en otra pestaña)</span>
                  </a>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                    <Badge variant="contorno">{ETIQUETA_TIPO[d.tipo]}</Badge>
                    <span>{f ? f.nombre : d.host}</span>
                    <Antiguedad iso={d.fecha || null} prefijo="Subido" />
                  </span>
                </li>
              );
            })}
          </ol>
          {r.paginas > 1 && (
            <div className="border-t border-hairline px-5 py-3 sm:px-6">
              <Paginador pagina={r.pagina} paginas={r.paginas} href={(p) => url({ p: p > 1 ? String(p) : undefined })} />
            </div>
          )}
        </Card>
      )}

      <Card as="section" className="overflow-hidden">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <CardTitle>Qué cubre y qué no</CardTitle>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Se leen las instituciones cuyo sitio WordPress deja consultar su
            biblioteca de archivos por la vía pública de lectura. El número que
            cuenta es el de documentos que de verdad se pudieron leer: el que
            anuncia cada sitio incluye archivos que cuelgan de páginas no públicas
            y que nadie puede abrir.
          </p>
        </div>
        <Plegable
          className="mt-3"
          etiqueta={`Ver las ${formatInt(indice.fuentes.length)} instituciones consultadas`}
          etiquetaCerrar="Ocultar"
        >
          <ul className="divide-y divide-hairline">
            {indice.fuentes.map((f) => {
              const inst = f.uc ? institucionPorId(f.uc) : null;
              return (
                <li key={f.host} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm sm:px-6">
                  <span className="min-w-0">
                    {inst ? (
                      <Link href={hrefInstitucion(inst)} className="text-ink hover:text-brand-700 hover:underline">
                        {f.nombre}
                      </Link>
                    ) : (
                      <span className="text-ink">{f.nombre}</span>
                    )}
                    <span className="block text-xs text-ink-soft">
                      {f.host}
                      {f.estado !== "ok" ? ` · sin acceso: ${f.nota}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right font-mono tabular-nums">
                    {formatInt(f.documentos)}
                    {f.anunciados > f.documentos && (
                      <span className="block text-xs text-ink-soft">de {formatInt(f.anunciados)} anunciados</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Plegable>
      </Card>

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuera de este índice por decisión de cada institución, y no por falta de
        intento: el Servicio Nacional de Salud (SNS), Administración Pública (MAP), el Ministerio de
        la Presidencia, Deportes, Agricultura, INFOTEP y la ONE cierran o protegen
        esa vía de lectura; su apertura se pide por la Ley 200-04. Otras, como Educación,
        Obras Públicas, Salud, la DGII y Aduanas, no usan WordPress y requieren otra
        vía. Ver{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          el estado de las fuentes
        </Link>
        .
      </p>
    </div>
  );
}

/** Siglas para el chip: las de la ficha si la hay; si no, el nombre. */
function siglas(nombre: string, uc: number | null): string {
  const i = uc ? institucionPorId(uc) : null;
  const a = i?.acronimo?.trim();
  if (a && a.length <= 14 && !/\s/.test(a)) return a;
  return nombre.length > 28 ? `${nombre.slice(0, 26)}…` : nombre;
}
