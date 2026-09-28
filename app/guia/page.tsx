import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import type { ReactNode } from "react";
import { Termino } from "@/components/termino";
import { OtrasGuias } from "@/components/otras-guias";
import { Rotulo } from "@/components/papel";
import { IconArrowRight, IconExternal } from "@/components/icons";

export const metadata = {
  alternates: { canonical: "/guia" },
  title: "Guía para ofertar al Estado",
  description:
    "Cómo registrarte como proveedor del Estado dominicano, qué documentos suelen pedir y cómo presentar una oferta ganadora.",
};

const MODALIDADES: [string, ReactNode][] = [
  [
    "Compras por Debajo del Umbral",
    "Compras pequeñas y rápidas. Plazos muy cortos (días). Ideal para empezar: poca competencia formal y requisitos ligeros.",
  ],
  [
    "Contratación Menor",
    "Montos bajos o medios. Proceso simple con invitación pública corta. Buen punto de entrada para MIPYMES.",
  ],
  [
    "Comparación de Precios",
    "Montos medios. Gana la mejor oferta que cumpla la ficha técnica; la documentación pesa más que en las menores.",
  ],
  [
    "Licitación Pública (Nacional/Internacional)",
    "Montos altos. Proceso formal por etapas con pliego extenso, garantías obligatorias y mayor plazo. Exige preparación seria.",
  ],
  [
    "Subasta Inversa",
    "Los oferentes compiten bajando el precio en línea para bienes estandarizados.",
  ],
  [
    "Procesos de Excepción",
    <>
      Casos especiales previstos por ley (una{" "}
      <Termino clave="emergencia">emergencia</Termino>, un{" "}
      <Termino clave="proveedorUnico">proveedor único</Termino>) en los que no
      hay competencia abierta. Suelen tener invitación dirigida.
    </>,
  ],
];

const ESTADOS: [string, ReactNode][] = [
  ["Proceso publicado", "Abierto: puedes preparar y presentar tu oferta."],
  ["Sobres estan abriendose / abiertos", "Cerró la recepción; la institución está abriendo y comparando ofertas."],
  ["Proceso con etapa cerrada", "En evaluación o entre etapas; espera resultados."],
  [
    "Proceso adjudicado y celebrado",
    <>
      Ya está <Termino clave="adjudicado">adjudicado</Termino> y hay contrato.
      Revisa quién ganó y a qué precio para aprender.
    </>,
  ],
  [
    "Proceso desierto",
    <>
      Quedó <Termino clave="desierto">desierto</Termino>: nadie ganó (sin
      ofertas válidas). Suele volver a publicarse: una segunda oportunidad.
    </>,
  ],
  ["Cancelado", "La institución desistió del proceso."],
];

export default function GuiaPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card as="section" className="p-5 sm:p-6">
        <Rotulo>Guía · Compras públicas</Rotulo>
        <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">
          ¿Cómo se le oferta al Estado?
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          Lo esencial para pasar de «vi una licitación interesante» a «presenté
          mi oferta a tiempo», en cuatro pasos.
        </p>
      </Card>

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle className="text-[15px]">1 · Regístrate una sola vez: el RPE</CardTitle>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft sm:text-sm">
          El <strong>Registro de Proveedores del Estado (<Termino clave="rpe">RPE</Termino>)</strong> es el requisito
          de entrada para ofertar en cualquier institución. Necesitas tu RNC activo y
          estar al día con DGII y TSS; tu <Termino clave="rnc">RNC</Termino> activo es
          el número que te identifica. Se solicita en línea y debes registrar los{" "}
          <strong>rubros</strong> (categorías de bienes o servicios) en los que vas a
          ofertar: solo puedes participar en procesos de tus rubros.
        </p>
        {/* Dos salidas al trámite real: 44 px de alto en el teléfono. */}
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Button asChild>
            <a href="https://www.dgcp.gob.do/servicios/registro-de-proveedores/" target="_blank" rel="noopener noreferrer">
              Inscríbete en el RPE (DGCP)
              <IconExternal className="h-4 w-4" />
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          </Button>
          <Button asChild variant="secondary">
            <a
              href="https://comunidad.comprasdominicana.gob.do/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Portal Transaccional
              <IconExternal className="h-4 w-4" />
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          Consejo: si eres <Termino clave="mipyme">MIPYME</Termino> (y más aún MIPYME liderada por mujeres), certifícalo:
          hay procesos reservados con menos competencia.
        </p>
      </Card>

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle className="text-[15px]">2 · Conoce las modalidades (y dónde empezar)</CardTitle>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft sm:text-sm">
          La <Termino clave="modalidad">modalidad</Termino> es el procedimiento
          de cada compra, y depende sobre todo del monto. La publica la{" "}
          <Termino clave="unidadCompra">unidad de compra</Termino> de la
          institución junto al proceso. Los{" "}
          <Termino clave="procesoExcepcion">procesos de excepción</Termino> son
          la salida prevista para cuando no se puede competir.
        </p>
        <dl className="mt-3 space-y-2 text-sm">
          {MODALIDADES.map(([m, d]) => (
            <div key={m} className="rounded-lg bg-canvas px-4 py-2.5">
              <dt className="font-semibold text-ink">{m}</dt>
              <dd className="mt-0.5 text-ink-soft">{d}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle className="text-[15px]">3 · Los documentos que casi siempre piden</CardTitle>
        <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-ink-soft">
          <li>Constancia de inscripción en el RPE (vigente y en el rubro del proceso).</li>
          <li>Certificaciones de estar al día: DGII (impuestos) y TSS (seguridad social).</li>
          <li>
            <strong>Oferta técnica</strong>: tu propuesta punto por punto contra la ficha
            técnica del pliego. Cumple cada requisito o explica el equivalente.
          </li>
          <li>
            <strong>Oferta económica</strong> en el formulario del pliego, firmada y en la
            divisa indicada.
          </li>
          <li>
            Garantías cuando el pliego las exige (seriedad de la oferta y, si ganas, fiel
            cumplimiento). Se gestionan con aseguradoras o bancos.
          </li>
          <li>Documentos societarios (registro mercantil, poderes) para personas jurídicas.</li>
        </ul>
        <p className="mt-2 text-xs text-ink-soft">
          La lista exacta siempre está en el{" "}
          <Termino clave="pliego">pliego de condiciones</Termino> de cada proceso; por
          eso es el primer documento que debes leer.
        </p>
      </Card>

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle className="text-[15px]">4 · Qué significa cada estado</CardTitle>
        {/*
          En el teléfono el término va **encima** de su explicación.

          Estaba en una fila con el término fijo (`shrink-0`) y la explicación
          en lo que sobrara: a 390 px, «Sobres estan abriendose / abiertos»
          dejaba unos setenta píxeles para el resto, y la explicación bajaba a
          una columna de una o dos palabras por línea. Ilegible justo en el
          panel que existe para traducir la jerga. Desde `sm`, donde el término
          cabe sin estrangular lo demás, vuelve la fila.
        */}
        <dl className="mt-3 space-y-2 text-sm">
          {ESTADOS.map(([e, d]) => (
            <div
              key={e}
              className="rounded-lg bg-canvas px-4 py-2.5 sm:flex sm:items-start sm:gap-3"
            >
              <dt className="font-semibold text-ink sm:w-56 sm:shrink-0">{e}</dt>
              <dd className="mt-0.5 text-ink-soft sm:mt-0">{d}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Alert role="note" variant="firma" className="p-5 sm:p-6">
        <CardTitle className="text-[15px] text-brand-900">
          Consejos que ganan procesos
        </CardTitle>
        <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-brand-900/80">
          <li>
            Cotiza con datos: revisa los <strong>precios históricos de adjudicación</strong>{" "}
            que mostramos en cada proceso antes de fijar tu precio.
          </li>
          <li>
            No dejes la carga de la oferta para el último día: el Portal Transaccional
            cierra a la hora exacta.
          </li>
          <li>
            Vigila las <strong>enmiendas</strong>: el pliego puede cambiar después de
            publicado y tu oferta debe responder a la versión final.
          </li>
          <li>
            Un proceso <strong>desierto</strong> casi siempre se republica: márcalo con la estrella de seguimiento
            y prepárate para la segunda ronda.
          </li>
          <li>
            Mira el <Termino clave="pacc">PACC</Termino> de la institución: lo
            que planea comprar en el año se anuncia antes de licitarse, y en{" "}
            <Link href="/planes" className="font-medium underline underline-offset-2 hover:text-brand-700">Planes</Link>{" "}
            lo puedes ver.
          </li>
          <li>
            Cuando un proceso termina con un{" "}
            <Termino clave="oferenteUnico">oferente único</Termino>, no hubo
            competencia de precio: es una oportunidad para la próxima vez.
          </li>
          <li>
            Si un requisito te descalifica injustamente, puedes pedir aclaraciones dentro
            del plazo que fija el pliego.
          </li>
        </ul>
        <Button asChild className="mt-4">
          <Link href="/licitaciones">
            Buscar oportunidades abiertas
            <IconArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </Alert>

      <OtrasGuias actual="/guia" />
    </div>
  );
}
