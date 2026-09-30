import Link from "next/link";
import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Cifra, Rotulo, TiraDeCifras } from "@/components/papel";
import { ConectadoCon } from "@/components/conectado-con";
import { EstadoVacio } from "@/components/estado-vacio";
import { MarcaEstado } from "@/components/marca-estado";
import { Ruta } from "@/components/ruta";
import AccionesFicha from "@/components/acciones-ficha";
import { Termino } from "@/components/termino";
import { IconExternal } from "@/components/icons";
import { empresaPorRnc, padronEmpresas } from "@/lib/empresas";
import { enLlano, regimenEnLlano, tonoContribuyente } from "@/lib/padron";
import { formatFecha, hace, SIN_DATO } from "@/lib/format";
import { enlace } from "@/lib/grafo";
import { medidasDeRnc, metaSanciones, ofacDeRnc } from "@/lib/sanciones";
import { NotaOfac } from "@/components/fuentes-nuevas/medidas-proveedor";
import { EnElGrafo, alternasRdf } from "@/components/en-el-grafo";

/** La instantánea solo cambia con un despliegue: una ficha se rehace al día. */
export const revalidate = 86400;

type Props = { params: Promise<{ rnc: string }> };

/** Solo un RNC de nueve cifras se busca: una cédula no llega nunca al padrón. */
const cargar = cache((rnc: string) => (/^\d{9}$/.test(rnc) ? empresaPorRnc(rnc) : Promise.resolve(undefined)));

/** Las dos consultas oficiales que sí existen, enlazadas sin llamarlas. */
const REGISTRO_MERCANTIL = "https://app.registromercantil.do/consultas";
const ONAPI = "https://www.onapi.gov.do/index.php/busqueda-de-signos-nombres-y-marcas";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { rnc } = await params;
  const e = await cargar(rnc);
  if (!e) return { title: "Empresa no encontrada", robots: { index: false, follow: true } };
  // La DGII corta sus actividades a 128 letras, a veces a media frase: en la
  // descripción va hasta el primer paréntesis, que es donde empieza el detalle.
  const detalle = [
    enLlano(e.estado).toLowerCase(),
    e.actividad && enLlano(e.actividad).toLowerCase().split(" (")[0],
    e.inicio && `inició operaciones el ${formatFecha(e.inicio)}`,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    title: e.razonSocial,
    description: `${e.razonSocial}, RNC ${e.rnc}: ${detalle}. Según el padrón de contribuyentes de la DGII.`,
    alternates: { canonical: enlace.empresa(e.rnc), types: alternasRdf({ tipo: "empresa", id: e.rnc }) },
  };
}

/**
 * La ficha de una persona jurídica del padrón de la DGII.
 *
 * Qué es (la razón social y su RNC) → en qué punto está (estado, régimen,
 * desde cuándo opera) → con qué se conecta (su ficha de proveedor del Estado)
 * → lo que aquí no hay y dónde se pide (el registro mercantil). Es el orden
 * de docs/IDENTIDAD.md §4.
 */
export default async function EmpresaPage({ params }: Props) {
  const { rnc } = await params;
  if (!/^\d{9}$/.test(rnc)) notFound();
  const [e, padron] = await Promise.all([cargar(rnc), padronEmpresas()]);

  if (e === null) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Ruta raiz={{ href: "/empresas", label: "Empresas" }} actual={`RNC ${rnc}`} />
        <EstadoVacio
          como="h1"
          variante="caida"
          titulo="No pudimos leer el padrón de empresas"
          accion={
            <Button asChild variant="secondary">
              <Link href="/fuentes">Ver el estado de las fuentes</Link>
            </Button>
          }
        >
          No es que este RNC no exista: la instantánea del padrón de la DGII no
          respondió. La ficha vuelve sola cuando se restablece.
        </EstadoVacio>
      </div>
    );
  }
  if (!e) {
    // Un RNC bien formado que el padrón no trae: una empresa inscrita después
    // del corte, una persona física con RNC de nueve cifras (no se publican) o
    // un número que no existe. El registro de proveedores de la DGCP busca por
    // ese mismo número hoy: se ofrece, en vez de un callejón sin salida.
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Ruta raiz={{ href: "/empresas", label: "Empresas" }} actual={`RNC ${rnc}`} />
        <EstadoVacio
          como="h1"
          titulo={`¿Y el RNC ${rnc}?`}
          accion={
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button asChild>
                <Link href={enlace.documentoProveedor(rnc)}>Buscarlo en el registro de proveedores</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/empresas">Buscar otra empresa</Link>
              </Button>
            </div>
          }
        >
          Ninguna persona jurídica del padrón de contribuyentes de la DGII
          {padron?.corteDgii ? ` (corte del ${formatFecha(padron.corteDgii)})` : ""} tiene ese número. Puede
          ser una empresa inscrita después de ese corte, o una persona física: el padrón las inscribe a veces con
          RNC de nueve cifras y aquí no se publican. El registro de proveedores del Estado busca por el mismo
          número, al día.
        </EstadoVacio>
      </div>
    );
  }

  const corte = padron?.corteDgii ?? null;
  const antiguedad = hace(e.inicio);
  const [rpe, ...otrosRpe] = e.rpe;
  // Lo que un abogado mira primero: si el Estado le cerró la puerta a alguno de
  // sus registros de proveedor, y si Estados Unidos la tiene en su lista SDN.
  // Solo se dice lo que hay: un «sin medidas» sería un certificado que una
  // instantánea con fecha de corte no puede dar (components/fuentes-nuevas/medidas-proveedor.tsx).
  const [conMedidas, ofac, meta] = await Promise.all([medidasDeRnc(e.rnc), ofacDeRnc(e.rnc), metaSanciones()]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Ruta raiz={{ href: "/empresas", label: "Empresas" }} actual={e.razonSocial} />

      <Card as="section" className="p-5 sm:p-6">
        <Rotulo>
          {enLlano(e.estado)} · Régimen {regimenEnLlano(e.regimen)}
        </Rotulo>
        <h1 className="mt-2 break-words font-display text-2xl leading-tight text-ink sm:text-3xl">
          {e.razonSocial}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          <Termino clave="personaJuridica" /> · <Termino clave="rnc" />{" "}
          <span className="font-mono font-medium tabular-nums text-ink">{e.rnc}</span>
        </p>
        <AccionesFicha className="mt-3" tipo="empresa" id={e.rnc} titulo={e.razonSocial} href={enlace.empresa(e.rnc)} />

        <TiraDeCifras className="mt-5 lg:grid-cols-3">
          <Cifra
            etiqueta="Estado ante la DGII"
            valor={
              <MarcaEstado tono={tonoContribuyente(e.estado)} title={`La DGII la publica como «${e.estado}»`}>
                {enLlano(e.estado)}
              </MarcaEstado>
            }
            nota={corte ? `en el padrón del ${formatFecha(corte)}` : "en el último padrón leído"}
          />
          <Cifra
            etiqueta="Inició operaciones"
            valor={e.inicio ? formatFecha(e.inicio) : SIN_DATO}
            nota={e.inicio ? `${antiguedad ? `${antiguedad}, ` : ""}según lo declaró a la DGII` : "no declaró la fecha"}
          />
          <Cifra
            etiqueta={<Termino clave="regimenPago" />}
            valor={regimenEnLlano(e.regimen)}
            nota="cómo le paga sus impuestos"
          />
        </TiraDeCifras>

        <dl className="mt-4 text-sm">
          <dt className="rotulo text-ink-soft">Actividad económica declarada</dt>
          <dd className="mt-1 leading-relaxed text-ink">
            {e.actividad ? enLlano(e.actividad) : "No declara ninguna."}
          </dd>
        </dl>
        {!rpe && (
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            No figura en la tabla del Registro de Proveedores del Estado leída con este
            padrón. Si se inscribió después,{" "}
            <Link
              href={enlace.documentoProveedor(e.rnc)}
              className="font-medium text-brand-700 hover:underline"
            >
              búscala hoy en el registro de proveedores
            </Link>
            .
          </p>
        )}
      </Card>

      <ConectadoCon
        aristas={[
          rpe && {
            etiqueta: "Lo que le vende al Estado",
            href: enlace.proveedor(rpe),
            nombre: `RPE ${rpe}`,
            fuente: "Registro de Proveedores del Estado · DGCP",
          },
          ...otrosRpe.map((otro) => ({
            etiqueta: "Otra inscripción como proveedora",
            href: enlace.proveedor(otro),
            nombre: `RPE ${otro}`,
            fuente: "Registro de Proveedores del Estado · DGCP",
          })),
          ...conMedidas.map((p) => ({
            etiqueta: "Medidas de la DGCP sobre su registro",
            href: `${enlace.proveedor(p.rpe)}#medidas`,
            nombre: `RPE ${p.rpe}`,
            cuenta: p.eventos.length,
            fuente: "Proveedores inhabilitados · DGCP",
          })),
        ]}
      />


      {ofac && <NotaOfac entidad={ofac} fecha={meta?.fuentes.ofac.fecha ?? null} />}

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle>¿Y el registro mercantil?</CardTitle>
        <p className="mt-2 text-sm leading-relaxed text-ink">
          Quiénes son sus socios, quién la administra y con cuánto capital se
          constituyó está en el <Termino clave="registroMercantil" /> de la Cámara de
          Comercio y Producción de su provincia, no en el padrón de la DGII. Ese registro
          no se puede buscar por nombre ni por RNC: su consulta pública solo valida un
          certificado que ya tienes, con su número y su código.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button asChild variant="secondary">
            <a href={REGISTRO_MERCANTIL} target="_blank" rel="noopener noreferrer">
              Validar un certificado mercantil
              <IconExternal className="h-4 w-4" />
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          </Button>
          <Button asChild variant="secondary">
            <a href={ONAPI} target="_blank" rel="noopener noreferrer">
              Buscar su nombre comercial en la ONAPI
              <IconExternal className="h-4 w-4" />
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          </Button>
        </div>
      </Card>

      <p className="px-1 text-xs leading-relaxed text-ink-soft">
        Fuente: padrón de contribuyentes de la DGII{corte ? `, corte del ${formatFecha(corte)}` : ""}.
        Instantánea que se renueva con cada corte mensual, no consulta en vivo: el
        estado de hoy puede ser otro. La razón social se muestra tal como está inscrita;
        la actividad, la fecha de inicio y el régimen los declara la propia empresa.{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          Estado y límites de las fuentes
        </Link>
        .
      </p>
      <EnElGrafo nodo={{ tipo: "empresa", id: e.rnc }} className="mt-2" />
    </div>
  );
}
