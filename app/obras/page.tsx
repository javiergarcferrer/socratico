import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";
import type { Metadata } from "next";
import {
  ESTADOS_OBRA,
  FUENTE_OBRAS,
  filtrarObras,
  getObras,
  provinciasDe,
  type FiltroObras,
} from "@/lib/obras";
import { institucionPorId, hrefInstitucion } from "@/lib/instituciones";
import { formatFecha, formatPesos } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";
import { BuscadorUrl } from "@/components/buscador-url";
import { NavFiltros, FiltroEnlace } from "@/components/nav-filtros";
import { Paginador } from "@/components/paginador";
import { EstadoVacio } from "@/components/estado-vacio";
import Plegable from "@/components/plegable";
import { Card } from "@/components/ui/card";
import { FilaObra } from "@/components/fuentes-nuevas/fila-obra";
import { recortar } from "@/lib/raiz";
import { getMapa } from "@/lib/mapa";
import { MapaProvincias } from "@/components/graficos";

export const metadata: Metadata = {
  alternates: { canonical: "/obras" },
  title: "Obras públicas",
  description:
    "La inversión pública del Estado dominicano proyecto a proyecto: estado, valor, avance declarado, provincia y los contratos de compras que la ejecutan, según los datos abiertos de MapaInversiones.",
};

export const revalidate = 86400;

const POR_PAGINA = 30;

type Params = { q?: string; estado?: string; provincia?: string; uc?: string; pagina?: string };

/**
 * ¿Existe la obra y avanza? — el listado de la inversión pública.
 *
 * Todo se filtra en el servidor sobre la instantánea (`lib/obras.ts`), y cada
 * filtro vive en la URL: una búsqueda por provincia se comparte y vuelve con
 * «atrás». Los estados son los cuatro que publica la fuente; la provincia sale
 * del CSV de territorio, y una obra que toca varias aparece en cada una.
 */
export default async function ObrasPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const [datos, geo] = await Promise.all([getObras(), getMapa()]);
  if (!datos) {
    return (
      <EstadoVacio
        variante="caida"
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="No pudimos leer las obras"
        accion={
          <Button asChild variant="secondary">
            <Link href="/fuentes">Ver el estado de las fuentes</Link>
          </Button>
        }
      >
        La copia de los datos abiertos de MapaInversiones no está disponible en
        este momento. No es que no haya obras: es que no pudimos mirar.
      </EstadoVacio>
    );
  }

  const estado = ESTADOS_OBRA.find((e) => e === sp.estado);
  const provincias = provinciasDe(datos.proyectos);
  const provincia = provincias.find((p) => p.slug === sp.provincia);
  const ucNum = /^\d{1,6}$/.test(sp.uc ?? "") ? Number(sp.uc) : undefined;
  const institucion = ucNum !== undefined ? institucionPorId(ucNum) : null;
  const filtro: FiltroObras = {
    q: recortar(sp.q, 80) || undefined,
    estado,
    provincia: provincia?.slug,
    uc: institucion ? institucion.id : undefined,
  };
  const obras = filtrarObras(datos.proyectos, filtro);
  const paginas = Math.max(1, Math.ceil(obras.length / POR_PAGINA));
  const pagina = Math.min(paginas, Math.max(1, Number(sp.pagina) || 1));
  const visibles = obras.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const valor = obras.reduce((s, o) => s + o.valor, 0);
  const paralizadas = obras.filter((o) => o.estado === "Paralizado").length;
  const conContratos = obras.filter((o) => o.nContratos > 0).length;

  const href = (cambios: Partial<Params>) => {
    const u = new URLSearchParams();
    const todo: Params = {
      q: filtro.q,
      estado,
      provincia: provincia?.slug,
      uc: institucion ? String(institucion.id) : undefined,
      ...cambios,
    };
    for (const [k, v] of Object.entries(todo)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `/obras?${s}` : "/obras";
  };

  const filtrado = Boolean(filtro.q || estado || provincia || institucion);

  // El mapa cuenta lo que dejan los otros filtros, no el de provincia: elegir
  // una no apaga las demás, y así se ve dónde más está lo que se busca.
  const enMapa = provinciasDe(filtrarObras(datos.proyectos, { ...filtro, provincia: undefined }));
  const mapaFiltrado = Boolean(filtro.q || estado || institucion);

  return (
    <div className="space-y-5">
      <Portada
        rotulo={`Inversión pública · MapaInversiones · corte al ${formatFecha(datos.corte)}`}
        titulo="¿Existe la obra y avanza?"
        descripcion={
          <>
            Cada proyecto de inversión con su estado, su valor, el avance que
            declara quien lo ejecuta y los contratos que lo materializan. Es una
            instantánea de los datos abiertos: las obras terminadas no vienen.
          </>
        }
      >
        <PortadaCifras>
          <PortadaCifra etiqueta={filtrado ? "Obras que coinciden" : "Obras publicadas, sin las terminadas"} valor={formatInt(obras.length)} destacar />
          <PortadaCifra etiqueta="Valor de esos proyectos" valor={formatPesos(valor)} />
          <PortadaCifra etiqueta="Paralizadas" valor={formatInt(paralizadas)} />
          <PortadaCifra etiqueta="Con contratos en compras" valor={formatInt(conContratos)} />
        </PortadaCifras>
      </Portada>

      <Suspense>
        <BuscadorUrl
          etiqueta="Buscar una obra"
          placeholder="Liceo, acueducto, código SNIP…"
          ayuda={`Busca en el nombre, la entidad ejecutora (también por sus siglas), la provincia y el código SNIP de las ${formatInt(datos.proyectos.length)} obras de la instantánea, todas las palabras en cualquier orden y sin distinguir tildes.`}
        />
      </Suspense>

      <NavFiltros etiqueta="Estado de la obra">
        <FiltroEnlace href={href({ estado: undefined, pagina: undefined })} activo={!estado}>
          Todas
        </FiltroEnlace>
        {ESTADOS_OBRA.map((e) => (
          <FiltroEnlace key={e} href={href({ estado: e, pagina: undefined })} activo={estado === e}>
            {e}
          </FiltroEnlace>
        ))}
      </NavFiltros>

      <Card>
        <Plegable
          resumen={
            <>
              <p className="px-5 pt-4 pb-3 text-sm text-ink">
                {provincia ? (
                  <>
                    Obras en <span className="font-semibold">{provincia.nombre}</span>.{" "}
                    <Link href={href({ provincia: undefined, pagina: undefined })} className="text-brand-700 hover:underline">
                      Ver todas las provincias
                    </Link>
                  </>
                ) : (
                  "Todas las provincias. Una obra que abarca varias aparece en cada una; las de alcance nacional, solo sin filtro."
                )}
              </p>
              {geo && (
                <div className="px-5 pb-3">
                  <MapaProvincias
                    geo={geo}
                    etiqueta={mapaFiltrado ? "Obras que coinciden con los filtros, por provincia" : "Obras por provincia"}
                    unidad={["obra", "obras"]}
                    actual={provincia?.slug}
                    zonas={enMapa.map((p) => ({
                      slug: p.slug,
                      valor: p.n,
                      href: href({ provincia: p.slug, pagina: undefined }),
                    }))}
                    className="mx-auto max-w-xl"
                  />
                  <p className="mx-auto mt-1.5 max-w-xl text-xs leading-relaxed text-ink-soft">
                    {mapaFiltrado
                      ? "Cuántas de las obras que coinciden con los filtros hay en cada provincia"
                      : "Cuántas obras hay en cada provincia"}
                    , sin las de alcance nacional. Es un conteo, no un monto ni una tasa
                    por habitante: las provincias grandes y pobladas tienden a tener más.
                    Pulsa una provincia para ver sus obras.
                  </p>
                </div>
              )}
            </>
          }
          etiqueta={`Elegir entre las ${provincias.length} provincias`}
        >
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 px-5 py-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
            {provincias.map((p) => (
              <li key={p.slug}>
                <Link
                  href={href({ provincia: p.slug, pagina: undefined })}
                  aria-current={p.slug === provincia?.slug ? "page" : undefined}
                  className="inline-flex min-h-11 items-center gap-1.5 text-brand-700 hover:underline sm:min-h-8"
                >
                  {p.nombre}
                  <span className="font-mono text-xs tabular-nums text-ink-soft">{formatInt(p.n)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Plegable>
      </Card>

      {institucion && (
        <p className="text-sm text-ink-soft">
          Solo las obras que ejecuta{" "}
          <Link href={hrefInstitucion(institucion)} className="font-medium text-brand-700 hover:underline">
            {institucion.nombre}
          </Link>
          .{" "}
          <Link href={href({ uc: undefined, pagina: undefined })} className="text-brand-700 hover:underline">
            Quitar este filtro
          </Link>
        </p>
      )}

      {visibles.length === 0 ? (
        <EstadoVacio
          titulo="Ninguna obra coincide con esa búsqueda"
          accion={
            filtrado ? (
              <Button asChild variant="secondary">
                <Link href="/obras">Quitar la búsqueda y los filtros</Link>
              </Button>
            ) : undefined
          }
        >
          Prueba con otra palabra del nombre, con el código SNIP o quitando un
          filtro. Si buscas una obra ya terminada, no estará aquí: MapaInversiones
          solo publica las que están en ejecución, paralizadas, en reevaluación o
          por reprogramar.
        </EstadoVacio>
      ) : (
        <Card as="section">
          <ul className="divide-y divide-hairline">
            {visibles.map((o) => (
              <FilaObra key={o.snip} obra={o} />
            ))}
          </ul>
        </Card>
      )}

      {paginas > 1 && (
        <Paginador
          pagina={pagina}
          paginas={paginas}
          href={(n) => href({ pagina: n > 1 ? String(n) : undefined })}
          etiqueta="Páginas de obras"
        />
      )}

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuente:{" "}
        <a href={FUENTE_OBRAS} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
          datos abiertos de MapaInversiones
        </a>{" "}
        (Ministerio de Hacienda y Economía, sobre el Banco de Proyectos del SNIP y
        la DGCP), con corte al {formatFecha(datos.corte)}. Ordenadas por valor del
        proyecto. El «avance» es el que la fuente publica: trae el mismo número
        como avance físico y como financiero, así que se muestra uno solo. Ver{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          el estado de las fuentes
        </Link>
        .
      </p>
    </div>
  );
}

