import Link from "next/link";
import {
  desdeMayusculas,
  evaluarPerencion,
  marcaDeIniciativa,
  type CondicionTono,
  type Iniciativa,
} from "@/lib/congreso";
import Antiguedad from "@/components/antiguedad";
import { MarcaEstado } from "@/components/marca-estado";
import { cn } from "@/lib/cn";
import { enlace } from "@/lib/grafo";

/**
 * La marca de estado de una pieza legislativa.
 *
 * Este archivo tenía su propia tabla de colores y un comentario que la decía
 * «alineada con lib/estados.ts». No lo estaba: invertía los dos tonos que más
 * pesan. Hoy no hay tabla **ni marca** aquí: las dos viven una sola vez, la
 * tabla en `lib/estados.ts` y la marca en `components/marca-estado.tsx`. Lo que
 * queda es el nombre con el que el Congreso la llama.
 */
export function CondicionBadge({
  tono,
  children,
  title,
  className,
}: {
  tono: CondicionTono;
  children: React.ReactNode;
  /** El literal crudo del origen. */
  title?: string;
  className?: string;
}) {
  return (
    <MarcaEstado tono={tono} conPunto={false} title={title} className={className}>
      {children}
    </MarcaEstado>
  );
}

/**
 * La marca de una iniciativa de Diputados: **una sola**, del punto más
 * avanzado que se conoce (`marcaDeIniciativa`), en caja mixta y con el literal
 * del SIL en el `title`. Ficha, fila y cruces la piden aquí en vez de pintar la
 * condición cruda, que llega en versales y en masculino.
 */
export function MarcaIniciativa({
  iniciativa,
  className,
}: {
  iniciativa: Pick<Iniciativa, "condicion" | "estado" | "tono" | "promulgada" | "numPromulgacion">;
  className?: string;
}) {
  const marca = marcaDeIniciativa(iniciativa);
  return (
    <CondicionBadge tono={marca.tono} title={marca.original} className={className}>
      {marca.label}
    </CondicionBadge>
  );
}

/**
 * Fila de listado: densa a propósito, el usuario escanea muchas a la vez.
 *
 * La fila entera lleva a la ficha, pero el enlace es el titular y se estira
 * sobre la fila (`estira`): así su nombre accesible es la descripción de la
 * pieza y no el renglón entero leído de corrido, y la fila toma sola la
 * respuesta de la casa (tinta al apuntar, se hunde al pulsar).
 */
export default function IniciativaCard({ iniciativa }: { iniciativa: Iniciativa }) {
  const perencion = iniciativa.viva ? evaluarPerencion(iniciativa.legislatura) : null;
  const enRiesgo = perencion?.estado === "en-riesgo";

  return (
    <li className="cv-auto relative border-b border-hairline px-4 py-3.5 last:border-0 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="font-mono text-xs font-semibold tabular-nums text-brand-700">
          {iniciativa.numero?.completo ?? `#${iniciativa.id}`}
        </span>

        <MarcaIniciativa iniciativa={iniciativa} />

        {enRiesgo && (
          <MarcaEstado tono="aviso" conPunto={false}>
            Perime en {perencion.diasRestantes}{" "}
            {perencion.diasRestantes === 1 ? "día" : "días"}
          </MarcaEstado>
        )}
      </div>

      {/*
        El SIL publica la descripción en versales: «LEY QUE MODIFICA LOS
        ARTÍCULOS…». En un teléfono ese mismo enunciado ocupa ocho líneas de
        caja alta —la forma de la palabra desaparece y la fila deja de
        escanearse— así que se devuelve a caja mixta para leerlo. El texto no
        cambia: cambia la caja, igual que ya hacía el Senado en su capa.
      */}
      <Link
        href={enlace.iniciativa(iniciativa.id)}
        className="estira mt-1.5 block break-words text-[15px] leading-snug text-ink hover:text-brand-700"
      >
        {desdeMayusculas(iniciativa.titulo)}
      </Link>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-soft">
        {iniciativa.tipo && <span>{iniciativa.tipo}</span>}
        {iniciativa.grupo && (
          <>
            <Sep />
            <span>{iniciativa.grupo}</span>
          </>
        )}
        {iniciativa.fechaDeposito && (
          <>
            <Sep />
            <Antiguedad iso={iniciativa.fechaDeposito} prefijo="Depositada" />
          </>
        )}
        {/*
          La legislatura es un nombre largo —«Segunda Legislatura Ordinaria
          2026»— que en el teléfono se lleva una línea entera de la fila para
          decir algo que la ficha repite y que el aviso de perención ya
          resume. Desde `sm` hay sitio y vuelve.
        */}
        {iniciativa.legislatura && (
          <>
            <Sep className="hidden sm:inline" />
            <span className="hidden font-mono tabular-nums sm:inline">
              {iniciativa.legislatura}
            </span>
          </>
        )}
      </div>
    </li>
  );
}

function Sep({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("text-hairline", className)}>
      ·
    </span>
  );
}
