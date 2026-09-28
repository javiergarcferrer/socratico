"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Proceso } from "@/lib/dgcp";
import { diasHasta, formatMonto, tituloLegible } from "@/lib/format";
import { cierreMeta, estadoMeta } from "@/lib/estados";
import { cn } from "@/lib/cn";
import {
  getSeguimiento,
  onSeguimientoCambio,
  toggleSeguimiento,
} from "@/lib/seguimiento";
import { IconArrowRight, IconBuilding, IconStar } from "./icons";
import Antiguedad from "@/components/antiguedad";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MarcaEstado } from "@/components/marca-estado";
import { etapaDe } from "@/lib/estados";
import { enlace } from "@/lib/grafo";

export default function ProcesoCard({ p }: { p: Proceso }) {
  const [seguido, setSeguido] = useState(false);
  useEffect(() => {
    const sync = () => setSeguido(getSeguimiento().includes(p.codigo_proceso));
    sync();
    return onSeguimientoCambio(sync);
  }, [p.codigo_proceso]);

  const estado = estadoMeta(p.estado_proceso);
  const dias = diasHasta(p.fecha_fin_recepcion_ofertas);
  /*
    La DGCP tarda en mover el estado: un proceso sigue «abierto» días después de
    vencido su plazo, y la tarjeta decía a la vez «Abiertos a ofertar» y
    «Recepción cerrada». Manda la fecha: si ya pasó, la marca dice lo que el
    lector puede hacer —nada: ya no se oferta— y el estado publicado queda en
    el `title`.
  */
  const vencido = estado.abierto && dias !== null && dias < 0;
  const abierto = estado.abierto && !vencido;
  const cierre = abierto ? cierreMeta(dias) : null;
  /*
    En un proceso ya cerrado la tarjeta no decía **cuándo** cerró: el plazo
    solo se pintaba mientras corría, y al pasar a «Sobres abiertos» o
    «Adjudicado» el hueco quedaba vacío. Da igual en una lista de procesos
    abiertos; en una de cerrados —que ahora se puede pedir— era la mitad de la
    fila. Solo si la fecha ya pasó: un cerrado con cierre futuro es el registro
    contradiciéndose, y ahí la fecha no se afirma.
  */
  const cerroHace = !abierto && dias !== null && dias < 0;
  const href = enlace.proceso(p.codigo_proceso);

  const titulo = p.titulo || p.descripcion || p.codigo_proceso;

  /*
    La hoja entera es el objetivo de toque.

    En el teléfono esta tarjeta es la pieza más pulsada de la plataforma, y sus
    dos enlaces medían 17 px y 16 px de alto: el titular recortado a dos líneas
    y un «Ver detalle» de once caracteres en la esquina. Con el pulgar eso no
    se acierta. `Card` ya contempla el patrón —`asChild`, «la hoja entera es el
    enlace»—, pero aquí no sirve: la estrella es un botón y un botón dentro de
    un enlace no es HTML válido. Así que el enlace del titular se estira sobre
    la tarjeta con un pseudoelemento y la estrella se eleva por encima.

    Un solo enlace, con el título por nombre accesible: «Ver detalle» pasa a
    ser lo que siempre fue de verdad, un indicio visual, y se marca
    `aria-hidden` para no anunciar dos veces el mismo destino.
  */
  return (
    <Card
      as="article"
      className="cv-auto group relative flex flex-col p-4 focus-within:border-brand-400 hover:border-brand-300"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <MarcaEstado
            tono={vencido ? "contexto" : etapaDe(p.estado_proceso).tono}
            vivo={abierto}
            title={`La DGCP lo publica como «${estado.original}»`}
          >
            {vencido ? "Recepción cerrada" : estado.label}
          </MarcaEstado>
          <Badge forma="etiqueta" variant="contorno" className="bg-canvas font-medium">
            {p.modalidad}
          </Badge>
          {p.dirigido_mipymes === "Si" && (
            <Badge forma="etiqueta" variant="contorno" className="bg-canvas font-medium">
              MIPYMES
            </Badge>
          )}
        </div>
        {/*
          44 px de lado, y por encima del enlace estirado: la estrella es el
          único control de la tarjeta que no lleva a la ficha, y con `icon-sm`
          medía 36. Los márgenes negativos devuelven la alineación óptica con
          la fila de marcas sin recortar el objetivo de toque.
        */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => toggleSeguimiento(p.codigo_proceso)}
          aria-label={
            seguido
              ? `Quitar de seguimiento: ${titulo}`
              : `Guardar en seguimiento: ${titulo}`
          }
          aria-pressed={seguido}
          className={cn(
            "relative z-10 -mr-2 -mt-2 shrink-0",
            seguido
              ? "text-brand-600 hover:bg-brand-50 hover:text-brand-700"
              : "text-ink-soft hover:text-brand-600",
          )}
        >
          <IconStar className="h-5 w-5" filled={seguido} />
        </Button>
      </div>

      <h2 className="mt-2.5 font-sans text-[15px] font-semibold leading-snug tracking-tight">
        <Link
          href={href}
          title={titulo}
          className="line-clamp-2 transition-colors estira hover:text-brand-700 focus-visible:outline-none"
        >
          {tituloLegible(titulo)}
        </Link>
      </h2>
      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-soft">
        <IconBuilding className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
        <span className="line-clamp-2 leading-snug" title={p.unidad_compra}>
          {p.unidad_compra}
        </span>
      </p>

      <div className="mt-3 flex flex-1 items-end justify-between gap-3 border-t border-hairline pt-3">
        <div className="min-w-0">
          <div className="font-mono text-base font-semibold tabular-nums text-ink">
            {formatMonto(p.monto_estimado, p.divisa)}
          </div>
          <Antiguedad
            iso={p.fecha_publicacion}
            prefijo="Publicado"
            className="mt-0.5 block truncate text-xs text-ink-soft"
          />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {cierre && (
            <Badge
              forma="etiqueta"
              className={cn("ring-1 ring-inset", cierre.badge)}
            >
              {cierre.texto}
            </Badge>
          )}
          {cerroHace && (
            <Antiguedad
              iso={p.fecha_fin_recepcion_ofertas}
              prefijo="Cerró"
              className="block text-xs text-ink-soft"
            />
          )}
          {/*
            Indicio, no control: toda la hoja lleva a la ficha, así que un
            segundo enlace al mismo sitio solo duplicaría el destino para quien
            navega con lector de pantalla.
          */}
          <span
            aria-hidden
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700"
          >
            Ver detalle
            <IconArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Card>
  );
}
