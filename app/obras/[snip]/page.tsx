import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  FUENTE_OBRAS,
  finVencido,
  getObra,
  slugProvincia,
  tonoDeObra,
  urlFichaMapaInversiones,
} from "@/lib/obras";
import { hrefInstitucion, institucionPorId } from "@/lib/instituciones";
import { formatFecha, formatMonto, formatPesos, tituloLegible } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { Ruta } from "@/components/ruta";
import { MarcaEstado } from "@/components/marca-estado";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { IconExternal } from "@/components/icons";
import { enlace } from "@/lib/grafo";
import { ConectadoCon } from "@/components/conectado-con";
import { provinciaDeTexto } from "@/lib/provincias";
import Conversacion from "@/components/espacios/conversacion";

export const revalidate = 86400;

interface Props {
  params: Promise<{ snip: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { snip } = await params;
  const d = /^\d{1,7}$/.test(snip) ? await getObra(snip) : null;
  if (!d) return { title: "Obra no encontrada" };
  return {
    title: tituloLegible(d.obra.nombre),
    alternates: { canonical: enlace.obra(snip) },
    description: `Estado, valor, avance declarado y contratos de la obra SNIP ${snip}, ejecutada por ${d.obra.entidad}.`,
  };
}

/**
 * Ficha de obra: lo que es, en qué estado está, cuánto dice haber avanzado,
 * quién la ejecuta, dónde, y los contratos y procesos de compras que la
 * materializan — cada uno enlazado a su ficha de proceso y de proveedor.
 *
 * El orden de los bloques es el de IDENTIDAD §4: qué es → en qué punto está →
 * con qué se ejecuta → el documento original (la ficha de MapaInversiones).
 */
export default async function ObraPage({ params }: Props) {
  const { snip } = await params;
  if (!/^\d{1,7}$/.test(snip)) notFound();
  const d = await getObra(snip);
  if (!d) notFound();
  const { obra: o, contratos, procesos, corte } = d;
  const institucion = o.uc ? institucionPorId(o.uc) : null;
  const vencido = finVencido(o);

  return (
    <div className="space-y-5">
      <Ruta raiz={{ href: "/obras", label: "Obras" }} actual={`SNIP ${o.snip}`} />

      <Card as="section" className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <MarcaEstado tono={tonoDeObra(o.estado)} title="Estado que publica el Banco de Proyectos">
            {o.estado}
          </MarcaEstado>
          <span className="rotulo text-ink-soft">{o.sector}</span>
        </div>
        <h1 className="mt-3 font-display text-2xl leading-tight sm:text-3xl">{tituloLegible(o.nombre)}</h1>
        {tituloLegible(o.nombre) !== o.nombre && (
          <p className="mt-1 text-xs text-ink-soft">
            Registrada en el Banco de Proyectos como «{o.nombre}».
          </p>
        )}
        <p className="mt-2 text-sm text-ink-soft">
          Ejecuta{" "}
          {institucion ? (
            <Link href={hrefInstitucion(institucion)} className="font-medium text-brand-700 hover:underline">
              {o.entidad}
            </Link>
          ) : (
            <span className="font-medium text-ink">{o.entidad}</span>
          )}
          .{" "}
          {o.nacional ? (
            "Alcance nacional."
          ) : o.provincias.length > 0 ? (
            <>
              En{" "}
              {o.provincias.map((p, i) => (
                <span key={p}>
                  {i > 0 && (i === o.provincias.length - 1 ? " y " : ", ")}
                  <Link href={`/obras?provincia=${slugProvincia(p)}`} className="text-brand-700 hover:underline">
                    {p}
                  </Link>
                </span>
              ))}
              .
            </>
          ) : null}
        </p>
        <p className="mt-1 font-mono text-sm text-ink-soft">SNIP {o.snip}</p>
      </Card>

      <ConectadoCon
        aristas={[
          institucion && {
            etiqueta: "Institución que la ejecuta",
            href: hrefInstitucion(institucion),
            nombre: o.entidad,
            fuente: "MapaInversiones",
          },
          ...o.provincias
            .map((nombre) => provinciaDeTexto(nombre))
            .filter((p): p is NonNullable<typeof p> => p !== null)
            .slice(0, 3)
            .map((p) => ({ etiqueta: "Provincia", href: enlace.provincia(p.slug), nombre: p.nombre, fuente: "MapaInversiones" })),
          ...[...new Map(contratos.filter((c) => c.rpe).map((c) => [c.rpe, c])).values()].slice(0, 3).map((c) => ({
            etiqueta: "Contratista",
            href: enlace.proveedor(c.rpe),
            nombre: c.proveedor,
            fuente: "MapaInversiones ↔ DGCP",
          })),
          ...procesos.slice(0, 3).map((pr) => ({
            etiqueta: "Proceso de compra",
            href: enlace.proceso(pr.codigo),
            nombre: pr.codigo,
            fuente: "MapaInversiones ↔ DGCP",
          })),
        ]}
      />

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle>¿Avanza?</CardTitle>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          Datos del Banco de Proyectos con corte al {formatFecha(corte)}.
        </p>
        <TiraDeCifras className="mt-4">
          <Cifra etiqueta="Valor del proyecto" valor={formatPesos(o.valor)} />
          <Cifra
            etiqueta="Avance declarado"
            valor={`${o.avance.toFixed(1)} %`}
            nota="La fuente publica el mismo número como avance físico y financiero"
          />
          <Cifra etiqueta="Inicio" valor={o.inicio ? formatFecha(o.inicio) : "—"} />
          <Cifra
            etiqueta="Fin previsto"
            valor={o.fin ? formatFecha(o.fin) : "—"}
            tono={vencido ? "text-alerta-700" : "text-ink"}
            nota={vencido ? "Ya pasó, y el avance declarado no llega al 100 %" : undefined}
          />
        </TiraDeCifras>
        <Progress
          value={o.avance}
          aria-label={`Avance declarado: ${o.avance.toFixed(1)} %`}
          className="mt-4"
          indicadorClassName="bg-v-finanzas"
        />
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          El avance lo reporta la institución que ejecuta la obra; no es una
          inspección. MapaInversiones lo publica en dos columnas —físico y
          financiero— que en todas las obras traen el mismo valor, así que aquí
          se muestra una sola cifra.
          {vencido &&
            " Que la fecha de fin prevista haya pasado no prueba un retraso: la fuente puede no haber actualizado el avance."}
        </p>
      </Card>

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle>Con qué se ejecuta</CardTitle>
        {o.nContratos === 0 && o.nProcesos === 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            MapaInversiones no asocia a esta obra ningún proceso ni contrato de
            compras. Puede ejecutarse por administración, con fondos de otra obra o
            no haber llegado aún a la etapa de compra.
          </p>
        ) : (
          <>
            {o.nContratos === 0 ? (
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                MapaInversiones no le asocia contratos: le vincula{" "}
                {o.nProcesos === 1 ? "un proceso de compra" : `${formatInt(o.nProcesos)} procesos de compra`}, sin
                contrato enlazado en sus datos.
              </p>
            ) : (
            <TiraDeCifras className="mt-4">
              <Cifra etiqueta="Contratos" valor={formatInt(o.nContratos)} />
              <Cifra
                etiqueta="Contratado"
                valor={formatPesos(o.montoContratado)}
                nota="Activos, cerrados o modificados"
              />
              <Cifra etiqueta="Proveedores distintos" valor={formatInt(o.proveedores)} />
              <Cifra etiqueta="Procesos de compra" valor={formatInt(o.nProcesos)} />
            </TiraDeCifras>
            )}

            {contratos.length > 0 && (
              <>
                <h2 className="mt-5 text-sm font-semibold">
                  {contratos.length < o.nContratos
                    ? `Los ${contratos.length} contratos de mayor monto, de ${formatInt(o.nContratos)}`
                    : "Contratos"}
                </h2>
                <ul className="mt-2 divide-y divide-hairline">
                  {contratos.map((c) => (
                    <li key={`${c.codigo}-${c.proceso}`} className="py-2.5 text-sm">
                      <Link href={enlace.proceso(c.proceso)} className="group block">
                        <span className="line-clamp-2 leading-snug group-hover:text-brand-700">
                          {c.descripcion || c.proceso}
                        </span>
                      </Link>
                      <span className="mt-0.5 block text-xs text-ink-soft">
                        {c.rpe ? (
                          <Link href={enlace.proveedor(c.rpe)} className="text-brand-700 hover:underline">
                            {c.proveedor}
                          </Link>
                        ) : (
                          c.proveedor
                        )}{" "}
                        · <span className="font-mono tabular-nums">{formatMonto(c.monto, "DOP")}</span> ·{" "}
                        {c.estado}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {procesos.length > 0 && (
              <>
                <h2 className="mt-5 text-sm font-semibold">
                  {procesos.length < o.nProcesos
                    ? `Los ${procesos.length} procesos de mayor monto, de ${formatInt(o.nProcesos)}`
                    : "Procesos de compra"}
                </h2>
                <ul className="mt-2 divide-y divide-hairline">
                  {procesos.map((p) => (
                    <li key={p.codigo} className="py-2.5 text-sm">
                      <Link href={enlace.proceso(p.codigo)} className="group block">
                        <span className="line-clamp-2 leading-snug group-hover:text-brand-700">
                          {p.descripcion || p.codigo}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-soft">
                          <span className="font-mono">{p.codigo}</span> · {p.modalidad} · {p.estado} ·{" "}
                          <span className="font-mono tabular-nums">{formatMonto(p.monto, "DOP")}</span> estimado
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary">
          <a href={urlFichaMapaInversiones(o)} target="_blank" rel="noopener noreferrer">
            Ficha original en MapaInversiones
            <IconExternal className="h-4 w-4" />
          </a>
        </Button>
        {institucion && (
          <Button asChild variant="secondary">
            <Link href={`/obras?uc=${institucion.id}`}>Otras obras de {institucion.acronimo || "esta institución"}</Link>
          </Button>
        )}
      </div>

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuente:{" "}
        <a href={FUENTE_OBRAS} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
          datos abiertos de MapaInversiones
        </a>
        , instantánea con corte al {formatFecha(corte)}. Los contratos y procesos
        son los que MapaInversiones asocia al código SNIP; la ficha de cada uno
        consulta la DGCP en vivo.
      </p>
      <Conversacion className="mt-6" referencia={{ tipo: "obra", ref: enlace.obra(String(Number(snip))), titulo: tituloLegible(o.nombre), href: enlace.obra(String(Number(snip))) }} />
    </div>
  );
}
