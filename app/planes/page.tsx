import Link from "next/link";
import type { Metadata } from "next";
import { hrefInstitucion, institucionPorId } from "@/lib/instituciones";
import { listPacc } from "@/lib/dgcp";
import { formatFecha } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { IconExternal } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EstadoVacio } from "@/components/estado-vacio";
import Antiguedad from "@/components/antiguedad";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";

export const metadata: Metadata = {
  alternates: { canonical: "/planes" },
  title: "Planes anuales de compras",
  description:
    "Qué planea comprar cada institución del Estado dominicano este año, según el Plan Anual de Compras y Contrataciones (PACC) que publica en la DGCP.",
};

export const revalidate = 3600;

/** El año en curso en hora dominicana: el PACC es un documento por período. */
function anioVigente(): number {
  return Number(
    new Intl.DateTimeFormat("es-DO", {
      timeZone: "America/Santo_Domingo",
      year: "numeric",
    }).format(new Date()),
  );
}

export default async function PlanesPage() {
  const periodo = anioVigente();
  const planes = await listPacc({ periodo }).catch(() => []);

  if (planes.length === 0) {
    /*
      La lectura degrada a lista vacía, así que aquí no se distingue «no hay
      planes» de «la API no contestó»: el título dice lo que sabemos, que no
      pudimos ver ninguno, y el texto las dos posibilidades.
    */
    return (
      <EstadoVacio
        como="h1"
        titulo={`No pudimos ver planes publicados para ${periodo}`}
        className="mx-auto max-w-2xl"
        accion={
          <Button asChild variant="secondary">
            <Link href="/fuentes">Ver el estado de las fuentes</Link>
          </Button>
        }
      >
        O la API de la DGCP no respondió, o el bloque de planes que sirve todavía
        no trae ninguno de este año. Vuelve en unos minutos.
      </EstadoVacio>
    );
  }

  const instituciones = new Set(planes.map((p) => p.codigoUnidadCompra)).size;
  // La página no vuelca los ~500 planes del bloque: la lista larga pesa más de
  // un mega y nadie la lee entera. Se muestran los más recientes y se declara
  // el recorte.
  const VISIBLES = 120;
  const visibles = planes.slice(0, VISIBLES);
  const ultimo = planes[0]?.fechaPublicacion ?? null;
  const revisiones = planes.reduce((suma, p) => {
    const v = Number(p.version);
    return suma + (Number.isFinite(v) ? v : 0);
  }, 0);

  const kpis = [
    { etiqueta: `Planes del ${periodo}`, valor: formatInt(planes.length), destacar: true },
    { etiqueta: "Instituciones", valor: formatInt(instituciones) },
    { etiqueta: "Revisiones acumuladas", valor: formatInt(revisiones) },
  ];

  return (
    <div className="space-y-5">
      <Portada
        rotulo={`Plan Anual de Compras y Contrataciones · PACC ${periodo}`}
        titulo="¿Qué planea comprar el Estado?"
        descripcion="Antes de que exista una licitación, cada institución declara lo que piensa comprar en el año. Ese documento es el PACC, y se puede leer hoy: es la señal más temprana que publica el Estado sobre su propio gasto."
      >
        <PortadaCifras className="sm:grid-cols-3">
          {kpis.map((k) => (
            <PortadaCifra
              key={k.etiqueta}
              etiqueta={k.etiqueta}
              valor={k.valor}
              destacar={k.destacar}
            />
          ))}
        </PortadaCifras>
      </Portada>

      <Card as="section" className="overflow-hidden">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <CardTitle>Planes publicados, del más reciente</CardTitle>
          {/* El recorte se dice antes de la lista, no al pie de 120 filas. */}
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            {planes.length > VISIBLES
              ? `Los ${VISIBLES} más recientes de los ${formatInt(planes.length)} que devuelve el registro para ${periodo}`
              : `Los ${formatInt(planes.length)} que devuelve el registro para ${periodo}`}
            {ultimo && <>; el último, del {formatFecha(ultimo)}</>}.
          </p>
        </div>

        {/*
          Filas sobre una sola hoja, no una tarjeta por plan dentro de otra
          tarjeta: eran 120 cajas con borde y un botón cada una, y la lista se
          leía como un muro de marcos. La institución lleva a su ficha y el
          plan abre fuera, así que la fila no se estira: son dos destinos.
        */}
        <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
          {visibles.map((p) => {
            const inst = institucionPorId(p.codigoUnidadCompra);
            return (
              <li
                key={p.uid}
                className="cv-auto [--cv-alto:4.5rem] flex items-center justify-between gap-3 px-5 py-3 sm:px-6"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium leading-snug">
                    {inst ? (
                      <Link href={hrefInstitucion(inst)} className="text-brand-700 hover:underline">
                        {p.unidadCompra}
                      </Link>
                    ) : (
                      p.unidadCompra
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {p.fechaPublicacion ? (
                      <Antiguedad iso={p.fechaPublicacion} prefijo="Publicado" />
                    ) : (
                      "Sin fecha de publicación"
                    )}
                    {Number(p.version) > 0 && (
                      <>
                        {" "}
                        · <span className="tabular-nums">versión {p.version}</span>
                      </>
                    )}
                  </p>
                </div>
                {/* 40 px de alto en el teléfono: es la acción de la fila. */}
                <Button asChild variant="secondary" size="sm" className="h-10 shrink-0 sm:h-9">
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Ver el plan de ${p.unidadCompra} (abre el Portal Transaccional)`}
                  >
                    Ver el plan
                    <IconExternal className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </li>
            );
          })}
        </ul>

        <p className="border-t border-hairline px-5 py-4 text-xs leading-relaxed text-ink-soft sm:px-6">
          Fuente: endpoint <span className="font-mono">/pacc</span> de la API de
          datos abiertos de la DGCP; el documento en sí lo sirve el Portal
          Transaccional. Dos límites que conviene saber: la API devuelve el
          último bloque de planes registrados (no el censo completo de
          instituciones) y su filtro de período no funciona, así que el año se
          filtra aquí. Una versión alta no es un defecto: significa que la
          institución corrigió su plan muchas veces.
        </p>
      </Card>
    </div>
  );
}
