import Link from "next/link";
import { Suspense, cache } from "react";
import { notFound } from "next/navigation";
import { getCompetencia, getProceso, normalize, type Documento } from "@/lib/dgcp";
import { pesoDocumento, urlDeLectura } from "@/lib/documentos";
import VisorDocumento from "@/components/visor-documento";
import { diasHasta, formatFecha, formatMonto, tituloLegible, SIN_DATO } from "@/lib/format";
import { cierreMeta, estadoMeta, etapaDe } from "@/lib/estados";
import { cn } from "@/lib/cn";
import PreciosHistoricos from "./precios";
import Compartir from "@/components/compartir";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MarcaEstado } from "@/components/marca-estado";
import SeguirButton from "@/components/seguir-button";
import Guardar from "@/components/espacios/guardar";
import AccionesProceso from "@/components/acciones-proceso";
import { IconDoc, IconExternal, IconStar } from "@/components/icons";
import { Esqueleto } from "@/components/esqueleto";
import { Ruta } from "@/components/ruta";
import { hrefInstitucion, institucionPorId } from "@/lib/instituciones";
import { Termino } from "@/components/termino";
import { huellaDe } from "@/lib/seguimiento";
import { ObraDelProceso } from "@/components/fuentes-nuevas/obra-del-proceso";
import { ConectadoCon } from "@/components/conectado-con";
import { obrasDeProceso } from "@/lib/obras";
import { enlace } from "@/lib/grafo";
import { TextoEnlazado } from "@/components/texto-enlazado";
import Conversacion from "@/components/espacios/conversacion";
import { EnElGrafo, alternasRdf } from "@/components/en-el-grafo";
import { schemaOrgDe } from "@/lib/grafo-ld";

const DOC_CLAVE =
  /pliego|ficha tecnica|especificacion|termino de referencia|tdr|condiciones/;

function esDocClave(d: Documento): boolean {
  return DOC_CLAVE.test(normalize(`${d.tipo_documento} ${d.nombre_documento}`));
}

/**
 * `generateMetadata` y la página piden el mismo proceso en el mismo render:
 * `cache` lo deja en una sola tanda de peticiones a la DGCP.
 */
const cargarProceso = cache((codigo: string) => getProceso(codigo));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const limpio = decodeURIComponent(codigo);
  try {
    const { proceso: p } = await cargarProceso(limpio);
    if (p) {
      // Su RDF solo si el grafo compilado lo trae: la ficha lee la DGCP en vivo y conoce procesos que el grafo no.
      const nodo = { tipo: "proceso" as const, id: p.codigo_proceso.trim() };
      const enGrafo = (await schemaOrgDe(nodo)) != null;
      return {
        title: p.titulo ? tituloLegible(p.titulo) : limpio,
        alternates: { canonical: enlace.proceso(limpio), ...(enGrafo ? { types: alternasRdf(nodo) } : {}) },
        description: [
          p.unidad_compra,
          p.modalidad,
          p.estado_proceso,
          p.fecha_fin_recepcion_ofertas && `cierre de ofertas ${formatFecha(p.fecha_fin_recepcion_ofertas)}`,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    }
  } catch {
    /* metadata best-effort */
  }
  return {
    title: `Proceso ${limpio}`,
    description: `Ficha del proceso de compras públicas ${limpio} en el registro de la DGCP.`,
  };
}

export default async function ProcesoPage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const decodificado = decodeURIComponent(codigo);
  const [{ proceso: p, articulos, documentos, contratos }, competencia] =
    await Promise.all([cargarProceso(decodificado), getCompetencia(decodificado)]);
  if (!p) notFound();
  const institucion = institucionPorId(p.codigo_unidad_compra);
  // Solo las obras que el cruce verifica (por el SNIP de la DGCP o por el
  // código del proceso en MapaInversiones), no el campo SNIP a secas.
  const obrasLigadas = await obrasDeProceso(p.codigo_proceso, p.codigo_snip).catch(() => []);

  const subclasesUnicas = Array.from(
    new Map(
      articulos
        .filter((a) => a.subclase_unspsc)
        .map((a) => [
          a.subclase_unspsc,
          { codigo: a.subclase_unspsc, descripcion: a.descripcion_articulo },
        ])
    ).values()
  ).slice(0, 4);

  const dias = diasHasta(p.fecha_fin_recepcion_ofertas);
  const est = estadoMeta(p.estado_proceso);
  // `est.abierto` y no el literal: la condición de «abierto» se decide en un
  // solo sitio (lib/estados.ts, por etapa) y no en cada página por su cuenta.
  const abiertoParaOfertar = est.abierto && dias !== null && dias >= 0;
  // Vencido el plazo, manda la fecha y no el estado que la DGCP aún no mueve
  // (la misma regla que la tarjeta): una sola marca, «Recepción cerrada».
  const vencido = est.abierto && dias !== null && dias < 0;
  const cierreBadge = abiertoParaOfertar ? cierreMeta(dias) : null;
  const docsClave = documentos.filter(esDocClave);
  const docsOtros = documentos.filter((d) => !esDocClave(d));

  // El pliego manda: es el documento que dice qué se compra y con qué reglas.
  // Se lee aquí mismo; el resto se abre desde su tarjeta.
  const pliego = docsClave[0] ?? documentos[0] ?? null;
  const totalArticulos = articulos.reduce(
    (s, a) => s + (a.precio_total_estimado || 0),
    0
  );
  const fechas: [string, string, boolean?][] = [
    ["Publicación", p.fecha_publicacion],
    ["Última enmienda", p.fecha_enmienda],
    ["Fin recepción de ofertas", p.fecha_fin_recepcion_ofertas, true],
    ["Apertura de ofertas", p.fecha_apertura_ofertas],
    ["Adjudicación estimada", p.fecha_estimada_adjudicacion],
    ["Suscripción de contrato", p.fecha_suscripcion],
  ];

  const flags: [string, string][] = [
    ["Objeto", `${p.objeto_proceso} · ${p.subobjeto_proceso}`],
    ["Área requiriente", p.area_requiriente],
    ["Duración del contrato", p.duracion_contrato],
    ["Dirigido a MIPYMES", p.dirigido_mipymes],
    ["Dirigido a MIPYMES mujeres", p.dirigido_mipymes_mujeres],
    ["Proceso lotificado", p.proceso_lotificado],
    ["Planificado en PACC", p.adquisicion_planeada],
    ["Compra verde", p.compra_verde],
    ["Proveedores notificados", p.numero_proveedores_notificados],
    ["Tipo de excepción", p.tipo_excepcion],
  ];

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      {/*
        Seguir y compartir se esconden en el teléfono: ahí exactamente las
        mismas dos acciones viven en la barra fija de `AccionesProceso`, al
        alcance del pulgar y siempre a la vista. Tenerlas dos veces era
        duplicar el destino para un lector de pantalla y, de paso, meter tres
        controles de 36 px en la línea más estrecha de la ficha. El enlace de
        vuelta se queda —la barra fija no navega hacia atrás— y ocupa los 44 px
        de alto del botón.
      */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Ruta seccion="licitaciones" actual={`Proceso ${p.codigo_proceso}`} />
        <div className="hidden items-center gap-2 lg:flex">
          <SeguirButton codigo={p.codigo_proceso} titulo={p.titulo} huella={huellaDe({ estado: p.estado_proceso })} />
          <Guardar
            referencia={{
              tipo: "proceso",
              ref: enlace.proceso(p.codigo_proceso),
              titulo: p.titulo,
              href: enlace.proceso(p.codigo_proceso),
            }}
          />
          <Compartir titulo={p.titulo} />
        </div>
      </div>

      <Card as="section" className="p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <MarcaEstado
            tono={vencido ? "contexto" : etapaDe(p.estado_proceso).tono}
            vivo={abiertoParaOfertar}
            title={`La DGCP lo publica como «${p.estado_proceso}»`}
          >
            {vencido ? "Recepción cerrada" : est.label}
          </MarcaEstado>
          <Badge forma="etiqueta" className="bg-hairline text-ink-soft">
            {p.modalidad}
          </Badge>
          {cierreBadge && (
            <Badge
              forma="etiqueta"
              className={cn("ring-1 ring-inset", cierreBadge.badge)}
            >
              {cierreBadge.texto}
            </Badge>
          )}
        </div>

        <h1 className="mt-3 font-display text-3xl leading-tight">{tituloLegible(p.titulo)}</h1>
        {tituloLegible(p.titulo) !== p.titulo && (
          <p className="mt-1 text-xs text-ink-soft">Publicado en la DGCP como «{p.titulo}».</p>
        )}
        <p className="mt-1 text-ink-soft">
          {institucion ? (
            <Link href={hrefInstitucion(institucion)} className="text-ink hover:text-brand-700 hover:underline">
              {p.unidad_compra}
            </Link>
          ) : (
            p.unidad_compra
          )}
        </p>
        {/*
          En su propio renglón: detrás del nombre, envuelto, el enlace
          empezaba con un «·» huérfano al inicio de la línea.
        */}
        <Link
          href={`/licitaciones?uc=${p.codigo_unidad_compra}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand-600 hover:underline sm:min-h-0 sm:py-0.5"
        >
          Ver todos sus procesos →
        </Link>
        <p className="font-mono text-sm text-ink-soft">{p.codigo_proceso}</p>

        {/*
          Las dos cifras que responden la pregunta —cuánto y hasta cuándo— y la
          salida al portal.

          A 390 px esto era una fila envuelta: dos bloques a 24 px de tipo, con
          una fecha larga («3 sept 2026, 3:00 p. m.») que caía en tres líneas, y
          un botón empujado por `ml-auto` a una línea propia alineada a la
          derecha, sin ancho. Ahora en el teléfono son dos bloques apilados a
          20 px y un botón de ancho completo; desde `sm`, la fila de siempre.
          La fecha pasa a mono: es un dato que se copia y se verifica, y así las
          dos cifras se leen con la misma letra.
        */}
        <div className="mt-4 grid gap-4 sm:flex sm:flex-wrap sm:items-center sm:gap-6">
          <div>
            <div className="rotulo text-ink-soft">
              <Termino clave="montoEstimado">Monto estimado</Termino>
            </div>
            <div className="font-mono text-xl font-semibold tabular-nums text-ink sm:text-2xl">
              {formatMonto(p.monto_estimado, p.divisa)}
            </div>
          </div>
          <div>
            <div className="rotulo text-ink-soft">
              {abiertoParaOfertar
                ? "Recibe ofertas hasta"
                : dias !== null && dias < 0
                  ? "Recibió ofertas hasta"
                  : "Plazo de ofertas"}
            </div>
            <div
              className={`font-mono text-xl font-semibold tabular-nums sm:text-2xl ${
                abiertoParaOfertar && dias !== null && dias <= 2
                  ? "text-sello-600"
                  : "text-ink"
              }`}
            >
              {formatFecha(p.fecha_fin_recepcion_ofertas, true)}
            </div>
          </div>
          {p.url && (
            <Button asChild size="lg" className="w-full sm:ml-auto sm:w-auto">
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                Ver en el Portal Transaccional
                <IconExternal className="h-4 w-4" />
              </a>
            </Button>
          )}
        </div>

        {p.descripcion && p.descripcion.trim() !== p.titulo.trim() && (
          <p className="mt-4 whitespace-pre-line text-sm text-ink">
            <TextoEnlazado texto={p.descripcion} excluir={enlace.proceso(p.codigo_proceso)} />
          </p>
        )}
      </Card>

      <ObraDelProceso codigo={p.codigo_proceso} snip={p.codigo_snip} />

      <ConectadoCon
        aristas={[
          institucion && {
            etiqueta: "Institución que compra",
            href: hrefInstitucion(institucion),
            nombre: p.unidad_compra,
            fuente: "DGCP",
          },
          institucion?.capitulo && {
            etiqueta: "Su capítulo del presupuesto",
            href: enlace.capitulo(institucion.capitulo),
            nombre: `Capítulo ${institucion.capitulo}`,
            fuente: "SIGEF",
          },
          {
            etiqueta: "Otros procesos de la misma unidad",
            href: `/licitaciones?uc=${p.codigo_unidad_compra}`,
            nombre: p.unidad_compra,
            fuente: "DGCP",
          },
          ...[...new Map(contratos.filter((c) => c.rpe).map((c) => [c.rpe, c])).values()].slice(0, 4).map((c) => ({
            etiqueta: "Proveedor adjudicado",
            href: enlace.proveedor(c.rpe),
            nombre: c.razon_social,
            fuente: "DGCP",
          })),
          ...obrasLigadas.map(({ obra, segun }) => ({
            etiqueta: "Obra que financia",
            href: enlace.obra(obra.snip),
            nombre: `SNIP ${obra.snip}`,
            fuente: segun.join(" y "),
          })),
        ]}
      />

      <Card as="section" className="p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle>Cómo participar</CardTitle>
          {/* 40 px de alto en el teléfono: es un enlace suelto, no prosa. */}
          <Button
            asChild
            variant="link"
            size="sm"
            className="h-10 px-0 text-xs font-medium text-brand-600 sm:h-auto"
          >
            <Link href="/guia">¿Primera vez ofertando? Lee la guía completa →</Link>
          </Button>
        </div>
        {abiertoParaOfertar ? (
          <ol className="mt-4 space-y-3">
            <Paso n={1} titulo="Lee los documentos clave del proceso">
              {docsClave.length > 0 ? (
                <span>
                  Empieza por el pliego de condiciones y la ficha técnica: ahí están los
                  requisitos exactos, las garantías exigidas y los criterios de
                  evaluación.{" "}
                  <a href="#documentos" className="font-medium text-brand-600 hover:underline">
                    Ver los {docsClave.length} documentos clave ↓
                  </a>
                </span>
              ) : (
                <span>
                  Este proceso aún no tiene documentos cargados en la API; revísalos
                  directamente en el Portal Transaccional con el botón de arriba.
                </span>
              )}
            </Paso>
            <Paso n={2} titulo="Verifica tu Registro de Proveedores del Estado (RPE)">
              Para ofertar necesitas RPE activo, con el rubro de este proceso y tus
              obligaciones fiscales (DGII/TSS) al día. Si no lo tienes,{" "}
              <a
                href="https://www.dgcp.gob.do/servicios/registro-de-proveedores/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-600 hover:underline"
              >
                inscríbete aquí en la DGCP
                <IconExternal className="ml-0.5 inline h-3.5 w-3.5 align-[-2px]" />
                <span className="sr-only">(se abre en otra pestaña)</span>
              </a>{" "}
              cuanto antes: el trámite toma días, no horas.
            </Paso>
            <Paso n={3} titulo="Prepara tu oferta">
              Documentos legales y credenciales según el pliego, oferta técnica conforme
              a la ficha, y oferta económica
              {totalArticulos > 0 ? (
                <> (referencia: el presupuesto estimado de los artículos suma{" "}
                  <strong>{formatMonto(totalArticulos, p.divisa)}</strong>)</>
              ) : (
                <> (referencia: monto estimado {formatMonto(p.monto_estimado, p.divisa)})</>
              )}
              . Revisa si el pliego exige garantía de seriedad de la oferta.
            </Paso>
            <Paso n={4} titulo={`Presenta tu oferta antes del cierre`}>
              Fecha límite:{" "}
              <strong>{formatFecha(p.fecha_fin_recepcion_ofertas, true)}</strong>
              {dias !== null && (
                <> ({dias === 0 ? "cierra hoy" : `faltan ${dias} días`})</>
              )}
              . Se presenta en línea en el{" "}
              {p.url ? (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand-600 hover:underline"
                >
                  Portal Transaccional
                  <IconExternal className="ml-0.5 inline h-3.5 w-3.5 align-[-2px]" />
                  <span className="sr-only">(se abre en otra pestaña)</span>
                </a>
              ) : (
                "Portal Transaccional"
              )}
              .
            </Paso>
          </ol>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">
            Este proceso ya no acepta ofertas nuevas (estado:{" "}
            <strong>{p.estado_proceso}</strong>
            {dias !== null && dias < 0 ? ", la recepción cerró" : ""}). Puedes revisar
            los documentos y resultados para preparar tu próxima participación, o usar
            el buscador para encontrar procesos similares abiertos.
          </p>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card as="section" className="p-6">
          <CardTitle>Cronograma</CardTitle>
          <ol className="mt-4">
            {fechas.map(([label, iso, destacar], i) => {
              const last = i === fechas.length - 1;
              return (
                <li key={label} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ring-4 ring-surface ${
                        destacar ? "bg-alerta-500 text-canvas" : "bg-hairline text-ink-soft"
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    </span>
                    {!last && <span className="w-0.5 flex-1 bg-hairline" />}
                  </div>
                  <div className={last ? "pb-0" : "pb-5"}>
                    <div
                      className={`text-sm ${destacar ? "font-semibold text-ink" : "text-ink"}`}
                    >
                      {label}
                    </div>
                    <div className="mt-0.5 font-mono text-xs tabular-nums text-ink-soft">
                      {formatFecha(iso, true)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        <Card as="section" className="p-6">
          <CardTitle>Información general</CardTitle>
          {/*
            En el teléfono la etiqueta va encima del valor. «Objeto» trae dos
            frases concatenadas («Bienes · Adquisición de…») y, alineado a la
            derecha contra su etiqueta, caía en cuatro líneas de dos palabras
            pegadas al borde. Desde `sm` vuelve el par etiqueta/valor en una
            línea, que es como se lee un formulario cuando hay ancho.
          */}
          <dl className="mt-3 space-y-2 text-sm">
            {flags.map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg bg-canvas px-3 py-2 sm:flex sm:items-start sm:justify-between sm:gap-3"
              >
                <dt className="text-ink-soft">{label}</dt>
                <dd className="mt-0.5 font-medium sm:mt-0 sm:text-right">
                  {value || SIN_DATO}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card as="section" className="p-6">
        <CardTitle>
          Artículos solicitados{" "}
          <span className="font-normal text-ink-soft">({articulos.length})</span>
        </CardTitle>
        {articulos.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">
            La API no reporta artículos para este proceso.
          </p>
        ) : (
          <>
            {/*
              A menos de `sm`, el cuadro deja de ser la única forma de leer un
              artículo.

              La tabla tiene cinco columnas y un ancho mínimo de 640 px: en un
              teléfono había que arrastrarla de lado para ver el precio, y una
              descripción larga quedaba en una columna de dos palabras. Aquí
              cada artículo es una ficha apilada —qué es, después cuánto y a
              cuánto—, con los montos en mono tabular para que se comparen en
              vertical. Desde `sm` manda el cuadro, que es donde de verdad se
              comparan cinco columnas.
            */}
            <ul className="mt-3 divide-y divide-hairline border-t border-hairline sm:hidden">
              {articulos.map((a, i) => (
                <li key={i} className="py-3">
                  <p className="text-sm font-medium leading-snug">
                    {a.descripcion_usuario || a.descripcion_articulo}
                  </p>
                  {a.descripcion_usuario && (
                    <p className="mt-0.5 text-xs leading-snug text-ink-soft">
                      {a.descripcion_articulo}
                    </p>
                  )}
                  <dl className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-ink-soft">
                    <div className="flex items-baseline gap-1.5">
                      <dt>Cantidad</dt>
                      <dd className="font-mono tabular-nums text-ink">
                        {a.cantidad?.toLocaleString("es-DO")} {a.unidad_medida}
                      </dd>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <dt>Unitario</dt>
                      <dd className="font-mono tabular-nums text-ink">
                        {formatMonto(a.precio_unitario_estimado, p.divisa)}
                      </dd>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <dt>Total</dt>
                      <dd className="font-mono font-semibold tabular-nums text-ink">
                        {formatMonto(a.precio_total_estimado, p.divisa)}
                      </dd>
                    </div>
                  </dl>
                  {a.subclase_unspsc && (
                    <p className="mt-1 font-mono text-xs text-ink-soft">
                      UNSPSC {a.subclase_unspsc}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {totalArticulos > 0 && (
              <p className="flex items-baseline justify-between gap-3 border-t border-hairline pt-3 text-sm sm:hidden">
                <span className="font-semibold">Total estimado de artículos</span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatMonto(totalArticulos, p.divisa)}
                </span>
              </p>
            )}

            <Table className="mt-3 hidden min-w-[640px] sm:table">
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead>UNSPSC</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">P. unitario</TableHead>
                <TableHead className="text-right">Total estimado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {articulos.map((a, i) => (
                <TableRow key={i} className="align-top">
                  <TableCell className="pl-0">
                    <div className="font-medium">
                      {a.descripcion_usuario || a.descripcion_articulo}
                    </div>
                    {a.descripcion_usuario && (
                      <div className="text-xs text-ink-soft">
                        {a.descripcion_articulo}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-ink-soft">
                    {a.subclase_unspsc}
                  </TableCell>
                  <TableCell numerica className="font-sans">
                    {a.cantidad?.toLocaleString("es-DO")} {a.unidad_medida}
                  </TableCell>
                  <TableCell numerica>
                    {formatMonto(a.precio_unitario_estimado, p.divisa)}
                  </TableCell>
                  <TableCell numerica className="pr-0 font-medium">
                    {formatMonto(a.precio_total_estimado, p.divisa)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {totalArticulos > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="pl-0 text-right font-semibold">
                    Total estimado de artículos
                  </TableCell>
                  <TableCell numerica className="pr-0 font-semibold">
                    {formatMonto(totalArticulos, p.divisa)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
            </Table>
          </>
        )}
      </Card>

      {competencia && (
        <Card as="section" className="p-6">
          <CardTitle>
            Ofertas: quién compitió{" "}
            <span className="font-normal text-ink-soft">
              ({competencia.oferentes.length}
              {competencia.oferentes.length === 1 ? " oferente" : " oferentes"})
            </span>
          </CardTitle>

          {competencia.oferenteUnico && (
            <Alert role="note" variant="aviso" className="mt-3">
              <span className="font-semibold">Se presentó un solo oferente.</span>{" "}
              No es una irregularidad por sí misma (hay compras que solo un
              proveedor puede servir), pero es lo primero que conviene mirar.
            </Alert>
          )}

          {competencia.menor !== null && competencia.mayor !== null &&
            competencia.menor !== competencia.mayor && (
              <p className="mt-3 text-sm text-ink-soft">
                Las ofertas fueron de{" "}
                <span className="font-mono font-semibold text-ink">
                  {formatMonto(competencia.menor, p.divisa)}
                </span>{" "}
                a{" "}
                <span className="font-mono font-semibold text-ink">
                  {formatMonto(competencia.mayor, p.divisa)}
                </span>
                .
              </p>
            )}

          <ul className="mt-3 space-y-2">
            {competencia.oferentes.map((o) => (
              <li
                key={o.rpe || o.razonSocial}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  {o.rpe ? (
                    <Link
                      href={enlace.proveedor(o.rpe)}
                      className="font-semibold hover:text-brand-600 hover:underline"
                    >
                      {o.razonSocial}
                    </Link>
                  ) : (
                    <span className="font-semibold">{o.razonSocial}</span>
                  )}
                  <div className="text-xs text-ink-soft">
                    {o.rpe ? `RPE ${o.rpe} · ` : ""}
                    {o.ofertas === 1 ? "1 oferta" : `${o.ofertas} ofertas`} ·{" "}
                    {o.digital ? "digital" : "física"}
                  </div>
                </div>
                <span className="font-mono font-semibold tabular-nums">
                  {o.monto > 0 ? formatMonto(o.monto, p.divisa) : "Sin monto publicado"}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-ink-soft">
            Fuente: registro de ofertas de la DGCP ({competencia.totalOfertas}{" "}
            {competencia.totalOfertas === 1 ? "oferta registrada" : "ofertas registradas"}
            {competencia.sinMonto > 0 &&
              `, ${competencia.sinMonto} sin monto publicado`}
            ). El registro publica quién ofertó y por cuánto; el resultado de la
            evaluación llega casi siempre vacío, así que{" "}
            <span className="font-medium">quién ganó lo dicen los contratos</span>,
            no las ofertas.
          </p>
        </Card>
      )}

      {contratos.length > 0 && (
        <Card as="section" className="p-6">
          <CardTitle>
            Adjudicación: quién ganó{" "}
            <span className="font-normal text-ink-soft">({contratos.length})</span>
          </CardTitle>
          <ul className="mt-3 space-y-2">
            {contratos.map((c, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <Link
                    href={enlace.proveedor(c.rpe)}
                    className="font-semibold hover:text-brand-600 hover:underline"
                  >
                    {c.razon_social}
                  </Link>
                  <div className="text-xs text-ink-soft">
                    RPE {c.rpe} ·{" "}
                    {c.fecha_adjudicacion && formatFecha(c.fecha_adjudicacion) !== SIN_DATO
                      ? `adjudicado ${formatFecha(c.fecha_adjudicacion)}`
                      : "sin fecha de adjudicación"}
                    {c.estado_contrato ? ` · ${c.estado_contrato}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold tabular-nums">
                    {formatMonto(c.valor_contratado, c.divisa || p.divisa)}
                  </span>
                  {c.url_contrato && (
                    <Button asChild variant="secondary" size="sm" className="h-10 sm:h-9">
                      <a href={c.url_contrato} target="_blank" rel="noopener noreferrer">
                        Ver contrato
                        <IconExternal className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <PreciosHistoricos subclases={subclasesUnicas} divisa={p.divisa} />

      <Card as="section" id="documentos" className="p-6">
        <CardTitle>
          Documentos del proceso{" "}
          <span className="font-normal text-ink-soft">({documentos.length})</span>
        </CardTitle>
        {documentos.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">
            La API no reporta documentos para este proceso.
          </p>
        ) : (
          <>
            {pliego && (
              <div className="mt-3 overflow-hidden rounded-lg border border-brand-200 bg-brand-50/40">
                <Suspense fallback={<Esqueleto className="m-3 h-24 border-brand-200/60" />}>
                  <Pliego doc={pliego} />
                </Suspense>
              </div>
            )}

            {docsClave.length > 0 && (
              <>
                <h3 className="rotulo mt-4 text-brand-700">
                  Empieza por aquí: pliego, fichas y condiciones
                </h3>
                <ul className="mt-2 grid gap-2 md:grid-cols-2">
                  {docsClave.map((d, i) => (
                    <DocumentoItem key={`k${i}`} d={d} clave />
                  ))}
                </ul>
              </>
            )}
            {docsOtros.length > 0 && (
              <>
                {docsClave.length > 0 && (
                  <h3 className="rotulo mt-4 text-ink-soft">
                    Otros documentos
                  </h3>
                )}
                <ul className="mt-2 grid gap-2 md:grid-cols-2">
                  {docsOtros.map((d, i) => (
                    <DocumentoItem key={`o${i}`} d={d} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Card>

      <AccionesProceso
        codigo={p.codigo_proceso}
        titulo={p.titulo}
        url={p.url}
        abierto={abiertoParaOfertar}
        huella={huellaDe({ estado: p.estado_proceso })}
      />
      <EnElGrafo nodo={{ tipo: "proceso", id: p.codigo_proceso.trim() }} className="mt-6" />
      <Conversacion className="mt-6" referencia={{ tipo: "proceso", ref: enlace.proceso(p.codigo_proceso), titulo: p.titulo, href: enlace.proceso(p.codigo_proceso) }} />
    </div>
  );
}

/**
 * El visor del pliego declara su peso con un HEAD al origen. Ese viaje era
 * el último eslabón de una cadena secuencial que retenía toda la ficha; ahora
 * se transmite aparte y la página no lo espera.
 */
async function Pliego({ doc }: { doc: Documento }) {
  const peso = await pesoDocumento(doc.url_documento);
  return (
    <VisorDocumento
      url={doc.url_documento}
      urlVisor={urlDeLectura(doc.url_documento)}
      nombre={doc.nombre_documento}
      tipo={peso?.tipo ?? "application/pdf"}
      bytes={peso?.bytes ?? null}
      origen="Compras Dominicanas"
    />
  );
}

function Paso({
  n,
  titulo,
  children,
}: {
  n: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-canvas">
        {n}
      </span>
      <div className="text-sm">
        <div className="font-semibold">{titulo}</div>
        <div className="mt-0.5 text-ink-soft">{children}</div>
      </div>
    </li>
  );
}

function DocumentoItem({ d, clave = false }: { d: Documento; clave?: boolean }) {
  return (
    <li className="relative">
      {/*
        El enlace principal lleva a la lectura en el navegador: el origen sirve
        estos PDF como descarga forzada, y bajar un archivo para saber qué dice
        no es acceso a la información. El enlace pequeño va al original.
      */}
      <a
        href={urlDeLectura(d.url_documento)}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex min-h-12 items-start gap-3 rounded-lg border py-2.5 pl-3 pr-12 text-sm ${
          clave
            ? "border-brand-200 bg-brand-50/50 hover:bg-brand-50"
            : "border-hairline hover:border-brand-400 hover:bg-brand-50"
        }`}
      >
        <span className="mt-0.5 shrink-0" aria-hidden>
          {clave ? (
            <IconStar className="h-4 w-4 text-brand-600" filled />
          ) : (
            <IconDoc className="h-4 w-4 text-ink-soft" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium leading-snug">{d.nombre_documento}</span>
          <span className="block text-xs text-ink-soft">
            {d.tipo_documento} · {formatFecha(d.fecha_carga_archivo)}
          </span>
        </span>
      </a>
      {/*
        El atajo al original medía 22 px de lado dentro de la esquina de una
        fila: un objetivo que en el teléfono se falla, y al fallarlo se abre el
        enlace grande de debajo, que lleva a otro sitio. Ahora ocupa los 44 px
        del borde derecho, con el icono centrado en ellos.
      */}
      <a
        href={d.url_documento}
        target="_blank"
        rel="noopener noreferrer"
        title="Abrir en Compras Dominicanas"
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-ink-soft transition-colors hover:bg-canvas hover:text-brand-600"
      >
        <IconExternal className="h-4 w-4" />
        <span className="sr-only">Abrir en el origen</span>
      </a>
    </li>
  );
}
