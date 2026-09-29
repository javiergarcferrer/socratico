import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BuscadorUrl } from "@/components/buscador-url";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { EstadoVacio } from "@/components/estado-vacio";
import { MarcaEstado } from "@/components/marca-estado";
import { Paginador } from "@/components/paginador";
import { Termino } from "@/components/termino";
import Antiguedad from "@/components/antiguedad";
import {
  ALCANCE,
  buscarEmpresas,
  empresaPorRnc,
  padronEmpresas,
  type Empresa,
  type PadronEmpresas,
} from "@/lib/empresas";
import { enLlano, pareceCedula, pareceRnc, soloCifras, tonoContribuyente } from "@/lib/padron";
import { formatFecha } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { enlace } from "@/lib/grafo";
import { recortar } from "@/lib/raiz";

export const metadata: Metadata = {
  alternates: { canonical: "/empresas" },
  title: "Empresas",
  description:
    "Cualquier empresa del padrón de contribuyentes de la DGII, por su RNC o su razón social: a qué se dedica, desde cuándo opera, si está activa y si le vende al Estado.",
};

type Props = { searchParams: Promise<{ q?: string; pagina?: string }> };

/** La dirección de una página de resultados. */
function hrefPagina(q: string, n: number): string {
  const base = `/empresas?q=${encodeURIComponent(q)}`;
  return n > 1 ? `${base}&pagina=${n}` : base;
}

/**
 * El directorio de empresas: la puerta a sus fichas.
 *
 * No hay listado de entrada —son casi medio millón—: la página espera un
 * RNC o una palabra. Un RNC exacto va directo a su ficha (el middleware
 * responde un 307; la redirección de aquí es la red por si no corre), y una
 * cédula no se busca: las personas físicas no se publican.
 */
export default async function EmpresasPage({ searchParams }: Props) {
  const p = await searchParams;
  const q = recortar(p.q, 120);
  const pagina = Math.max(1, Math.floor(Number(p.pagina ?? "1")) || 1);

  if (q && pareceRnc(q) && (await empresaPorRnc(q))) redirect(enlace.empresa(soloCifras(q)));

  const padron = await padronEmpresas();
  const ayuda = padron
    ? `Busca por RNC o por razón social en las ${formatInt(padron.empresas)} personas jurídicas del padrón de la DGII, corte ${formatFecha(padron.corteDgii ?? undefined)}: todas las palabras, en cualquier orden y sin distinguir tildes. Las personas físicas no se publican.`
    : "Busca por RNC o por razón social en las personas jurídicas del padrón de la DGII. Las personas físicas no se publican.";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="font-display text-3xl text-ink sm:text-4xl">¿Qué empresa es esta?</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          Cualquier empresa, asociación o entidad inscrita en la DGII con su{" "}
          <Termino clave="rnc" />: a qué se dedica, desde cuándo opera, si sigue
          activa y si le vende al Estado. Son todas las personas jurídicas del
          padrón de contribuyentes, no una muestra.
        </p>
      </header>

      <Suspense>
        <BuscadorUrl
          etiqueta="Buscar una empresa por RNC o razón social"
          placeholder="RNC o razón social: 401010062, banco popular…"
          ayuda={ayuda}
        />
      </Suspense>

      {q ? <Resultados q={q} pagina={pagina} corte={padron?.corteDgii ?? null} /> : <Entrada padron={padron} />}

      <p className="px-1 text-xs leading-relaxed text-ink-soft">
        Fuente: padrón de contribuyentes de la DGII
        {padron?.corteDgii ? `, corte del ${formatFecha(padron.corteDgii)}` : ""}, con el RPE de
        la tabla del Registro de Proveedores del Estado (DGCP). Instantánea que se renueva con
        cada corte mensual, no consulta en vivo. La razón social se muestra tal como está
        inscrita. Aquí no están los socios, los gerentes ni el capital: eso es del registro
        mercantil, que no se puede consultar por nombre.{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          Estado y límites de las fuentes
        </Link>
        .
      </p>
    </div>
  );
}

/** Antes de buscar: qué hay en el padrón, con sus cifras, y cómo se pregunta. */
function Entrada({ padron }: { padron: PadronEmpresas | null }) {
  if (!padron) {
    return (
      <EstadoVacio
        variante="caida"
        titulo="No pudimos leer el padrón de empresas"
        accion={
          <Button asChild variant="secondary">
            <Link href="/fuentes">Ver el estado de las fuentes</Link>
          </Button>
        }
      >
        La instantánea del padrón de la DGII no está disponible ahora mismo. No es
        que no haya empresas: es que no pudimos mirar. Las fichas de proveedor del
        Estado siguen mostrando su registro tributario.
      </EstadoVacio>
    );
  }
  const suspendidas = (padron.porEstado["SUSPENDIDO"] ?? 0) + (padron.porEstado["CESE TEMPORAL"] ?? 0);
  // Las tres son partes del mismo censo: el porcentaje tiene su base escrita.
  const parte = (n: number) => `${((n / padron.empresas) * 100).toFixed(1)} %`;
  return (
    <>
      <TiraDeCifras>
        <Cifra
          etiqueta={<Termino clave="personaJuridica">Personas jurídicas</Termino>}
          valor={formatInt(padron.empresas)}
          nota={`todas las del padrón, corte del ${formatFecha(padron.corteDgii ?? undefined)}`}
        />
        <Cifra
          etiqueta="Activas ante la DGII"
          valor={formatInt(padron.porEstado["ACTIVO"] ?? 0)}
          nota={`${parte(padron.porEstado["ACTIVO"] ?? 0)} de ellas`}
        />
        <Cifra
          etiqueta="Suspendidas o en cese temporal"
          valor={formatInt(suspendidas)}
          nota={`${parte(suspendidas)}; el resto está dado de baja, anulado o rechazado`}
        />
        <Cifra
          etiqueta="Inscritas como proveedoras del Estado"
          valor={formatInt(padron.conRpe)}
          nota={`${parte(padron.conRpe)}, con RPE en la DGCP`}
        />
      </TiraDeCifras>
      <EstadoVacio titulo="Escribe un RNC o una palabra de la razón social">
        Un RNC de nueve cifras abre su ficha. Un nombre busca todas sus palabras,
        en cualquier orden: «banco popular», «constructora del caribe». Las
        personas físicas no se publican, ni por nombre ni por cédula.
      </EstadoVacio>
    </>
  );
}

async function Resultados({ q, pagina, corte }: { q: string; pagina: number; corte: string | null }) {
  if (pareceCedula(q)) {
    return (
      <EstadoVacio titulo="Las personas físicas no se publican aquí">
        Once cifras son una cédula. Esta página muestra solo personas jurídicas del
        padrón de la DGII, que tienen un RNC de nueve cifras; a una persona no se la
        busca por su número.
      </EstadoVacio>
    );
  }
  if (pareceRnc(q)) {
    const rnc = soloCifras(q);
    return (
      <EstadoVacio
        titulo={`El RNC ${rnc} no es de ninguna persona jurídica del padrón`}
        accion={
          <Button asChild variant="secondary">
            <Link href={enlace.documentoProveedor(rnc)}>Buscarlo entre los proveedores del Estado</Link>
          </Button>
        }
      >
        Revisa las cifras. El padrón {corte ? `del ${formatFecha(corte)} ` : ""}no lo
        lista como empresa: puede ser de una persona física, que aquí no se publica, o
        haberse inscrito después del corte.
      </EstadoVacio>
    );
  }

  const r = await buscarEmpresas(q, { pagina });
  if (!r) {
    return (
      <EstadoVacio
        variante="caida"
        titulo="No pudimos leer el padrón de empresas"
        accion={
          <Button asChild variant="secondary">
            <Link href={`/buscar?q=${encodeURIComponent(q)}`}>Buscar «{q}» en toda la plataforma</Link>
          </Button>
        }
      >
        La instantánea no respondió. No quiere decir que no haya empresas con ese
        nombre: no pudimos mirar. La búsqueda de toda la plataforma encuentra a los
        proveedores del Estado por su nombre.
      </EstadoVacio>
    );
  }
  if (r.sinPalabras) {
    return (
      <EstadoVacio titulo="Escribe al menos una palabra de la razón social">
        «{q}» no deja nada que buscar: las letras sueltas y los signos no cuentan.
      </EstadoVacio>
    );
  }
  if (r.total === 0) {
    return (
      <EstadoVacio
        titulo={`Ninguna persona jurídica lleva «${q}» en su razón social`}
        accion={
          <Button asChild variant="secondary">
            <Link href={`/buscar?q=${encodeURIComponent(q)}`}>Buscar «{q}» en toda la plataforma</Link>
          </Button>
        }
      >
        La búsqueda pide todas las palabras, cada una al comienzo de una palabra del
        nombre inscrito: prueba con menos palabras o con su RNC. Muchas empresas se
        conocen por un nombre comercial distinto de su razón social.
      </EstadoVacio>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft" aria-live="polite">
        <span className="font-mono tabular-nums">{formatInt(r.total)}</span>{" "}
        {r.total === 1 ? "persona jurídica lleva" : "personas jurídicas llevan"}{" "}
        <span className="font-medium text-ink">{`«${q}»`}</span> en su razón social
        {r.truncado ? `; se pueden recorrer las ${formatInt(ALCANCE)} primeras` : ""}.
      </p>

      <Card as="section">
        <ul>
          {r.filas.map((e) => (
            <FilaEmpresa key={e.rnc} e={e} />
          ))}
        </ul>
      </Card>

      {r.paginas > 1 && (
        <Paginador
          pagina={r.pagina}
          paginas={r.paginas}
          href={(n) => hrefPagina(q, n)}
          etiqueta="Paginación de las empresas"
          className="pt-2"
        />
      )}

      <p className="px-1 text-xs leading-relaxed text-ink-soft">
        {r.truncado &&
          `Hay ${formatInt(r.total)} coincidencias y se dejan recorrer ${formatInt(ALCANCE)}: añade otra palabra de la razón social para acotar. `}
        Orden: primero las que llevan tus palabras enteras y las que empiezan por
        ellas; después las activas, las inscritas como proveedoras del Estado y las
        de nombre más corto.
      </p>
    </div>
  );
}

/** Una empresa en la lista: la fila entera abre su ficha. */
function FilaEmpresa({ e }: { e: Empresa }) {
  return (
    <li className="relative border-b border-hairline last:border-0">
      <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
        <div className="min-w-0 flex-1">
          <Link
            href={enlace.empresa(e.rnc)}
            className="break-words text-[15px] font-medium leading-snug text-ink estira hover:text-brand-700"
          >
            {e.razonSocial}
          </Link>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
            <span className="font-mono tabular-nums">RNC {e.rnc}</span>
            {e.inicio && (
              <>
                {" · "}
                <Antiguedad iso={e.inicio} prefijo="inició operaciones" />
              </>
            )}
          </p>
          {e.actividad && (
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-soft" title={enLlano(e.actividad)}>
              {enLlano(e.actividad)}
            </p>
          )}
        </div>
        <MarcaEstado
          tono={tonoContribuyente(e.estado)}
          title={`La DGII la publica como «${e.estado}»`}
          className="mt-0.5"
        >
          {enLlano(e.estado)}
        </MarcaEstado>
      </div>
    </li>
  );
}
