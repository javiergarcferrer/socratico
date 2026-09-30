import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { MarcaEstado } from "@/components/marca-estado";
import Plegable from "@/components/plegable";
import { Termino } from "@/components/termino";
import { IconExternal } from "@/components/icons";
import { enlace } from "@/lib/grafo";
import { formatFecha } from "@/lib/format";
import {
  TIPOS_MEDIDA,
  esFutura,
  hrefFichaOfac,
  motivoBancoMundialEnLlano,
  programaEnLlano,
  tonoEstadoRpe,
  type EntidadBancoMundial,
  type EntidadOfac,
  type MedidaDgcp,
  type MetaSanciones,
  type ProveedorConMedidas,
} from "@/lib/sanciones";

/** Las que se ven sin abrir: la más reciente responde casi siempre la pregunta. */
const VISIBLES = 3;

function nMedidas(n: number): string {
  return `${n.toLocaleString("es-DO")} ${n === 1 ? "medida" : "medidas"}`;
}

/**
 * «¿Tiene medidas de la DGCP?» en la ficha de un proveedor: cada suspensión,
 * cancelación o inhabilitación que registra la tabla de la DGCP, con su tipo
 * (leído del texto del Estado, en la lista cerrada de `lib/sanciones.ts`), sus
 * fechas, su oficio y **el motivo entero**, tal como lo escribió la DGCP.
 *
 * Solo se pinta cuando hay algo. Un «sin sanciones» sería un certificado de
 * buena conducta que la plataforma no puede dar: la tabla es una instantánea
 * con fecha de corte, y lo posterior no está en ella.
 */
export function MedidasDelProveedor({
  medidas,
  otros,
  rnc,
  meta,
}: {
  /** Las de este RPE, o `null` si solo las tiene otro registro con el mismo RNC. */
  medidas: ProveedorConMedidas | null;
  /** Otros RPE con el mismo RNC que también tienen medidas. */
  otros: ProveedorConMedidas[];
  rnc: string | null;
  meta: MetaSanciones | null;
}) {
  const corte = meta?.fuentes.dgcp.corte ?? null;
  // El motivo se publica entero salvo los datos de quien firma una solicitud;
  // cuando se quitó algo, se dice aquí mismo.
  const omitido = medidas?.eventos.some((e) => /\[(nombre|documento|domicilio) omitido\]/.test(e.motivo));
  const fuente = (
    <p>
      Fuente: tabla «Proveedores inhabilitados» de los datos abiertos de la DGCP
      {corte ? `, con registros hasta el ${formatFecha(corte)}` : ""}. Es una instantánea: una
      medida posterior a esa fecha no sale aquí.
      {omitido && " Del motivo se omiten el nombre y los documentos de la persona que firmó la solicitud."}
    </p>
  );
  const enlacesOtros = otros.map((o, i) => (
    <span key={o.rpe}>
      {i > 0 && ", "}
      <Link href={enlace.proveedor(o.rpe)} className="font-medium text-brand-700 hover:underline">
        RPE {o.rpe}
      </Link>{" "}
      ({nMedidas(o.eventos.length)})
    </span>
  ));

  /*
    Una empresa puede tener más de un RPE con el mismo RNC: la DGCP libera el
    número al cancelar un registro y la empresa se inscribe otra vez. Si las
    medidas cayeron sobre el registro viejo, la ficha del nuevo lo dice.
  */
  if (!medidas) {
    return (
      <Card as="section" id="medidas" aria-labelledby="medidas-titulo" className="px-5 py-5">
        <CardTitle id="medidas-titulo" className="text-[15px]">
          ¿Tiene medidas de la DGCP?
        </CardTitle>
        <p className="mt-1.5 text-sm leading-relaxed text-ink">
          La tabla de la DGCP no registra medidas sobre este RPE, pero sí sobre{" "}
          {otros.length === 1 ? "otro registro inscrito" : "otros registros inscritos"} con el mismo
          RNC ({rnc}): {enlacesOtros}.
        </p>
        <div className="mt-3 text-xs leading-relaxed text-ink-soft">{fuente}</div>
      </Card>
    );
  }

  const eventos = medidas.eventos;
  const primeras = eventos.slice(0, VISIBLES);
  const resto = eventos.slice(VISIBLES);
  const masAntigua = eventos[eventos.length - 1]?.fecha;
  // La advertencia de que no todo es sanción solo hace falta si hay algo que no lo es.
  const mezcla = eventos.some((e) => TIPOS_MEDIDA[e.tipo].grupo !== "sancion");

  return (
    <Card as="section" id="medidas" aria-labelledby="medidas-titulo">
      <div className="px-5 pb-4 pt-5">
        <CardTitle id="medidas-titulo" className="text-[15px]">
          ¿Tiene medidas de la DGCP?
        </CardTitle>
        <p className="mt-1.5 text-sm leading-relaxed text-ink">
          Sí. La DGCP registra {nMedidas(eventos.length)} sobre este proveedor
          {eventos.length > 1 && masAntigua ? `, desde el ${formatFecha(masAntigua)}` : ""}.{" "}
          {mezcla && (
            <>
              No toda medida es una sanción: la tabla mezcla{" "}
              <Termino clave="inhabilitacion">inhabilitaciones</Termino> con{" "}
              <Termino clave="suspensionRpe">suspensiones</Termino> preventivas y bajas que pidió
              el propio proveedor.{" "}
            </>
          )}
          El tipo lo leemos del texto de la DGCP, que va entero en cada una.
        </p>
        {medidas.estadoRpe && (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
            <span>Estado en el registro:</span>
            <MarcaEstado tono={tonoEstadoRpe(medidas.estadoRpe)}>{medidas.estadoRpe}</MarcaEstado>
            {meta && <span>según la tabla del registro descargada el {formatFecha(meta.generado)}</span>}
          </p>
        )}
      </div>

      {resto.length > 0 ? (
        <Plegable
          resumen={
            <ol className="divide-y divide-hairline border-t border-hairline">
              {primeras.map((m, i) => (
                <Medida key={i} m={m} />
              ))}
            </ol>
          }
          etiqueta={
            resto.length === 1
              ? "Ver la medida más antigua"
              : `Ver las ${resto.length.toLocaleString("es-DO")} medidas más antiguas`
          }
          etiquetaCerrar={resto.length === 1 ? "Ocultar la más antigua" : "Ocultar las más antiguas"}
        >
          <ol className="divide-y divide-hairline">
            {resto.map((m, i) => (
              <Medida key={i} m={m} />
            ))}
          </ol>
        </Plegable>
      ) : (
        <ol className="divide-y divide-hairline border-t border-hairline">
          {primeras.map((m, i) => (
            <Medida key={i} m={m} />
          ))}
        </ol>
      )}

      <div className="space-y-2 border-t border-hairline px-5 py-4 text-xs leading-relaxed text-ink-soft">
        {otros.length > 0 && (
          <p>
            Con el mismo RNC ({rnc}) la DGCP registra medidas en{" "}
            {otros.length === 1 ? "otro registro" : "otros registros"}: {enlacesOtros}.
          </p>
        )}
        {medidas.certificacion && (
          <p>
            <a
              href={medidas.certificacion}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-700 hover:underline"
            >
              Constancia del registro, en el portal de la DGCP
              <IconExternal className="ml-0.5 inline h-3.5 w-3.5 align-[-2px]" />
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          </p>
        )}
        {fuente}
      </div>
    </Card>
  );
}

/** Una medida: su tipo, cuándo, con qué oficio, hasta cuándo, y el texto entero. */
function Medida({ m }: { m: MedidaDgcp }) {
  const tipo = TIPOS_MEDIDA[m.tipo];
  const futura = esFutura(m.hasta);
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <MarcaEstado tono={tipo.tono}>{tipo.etiqueta}</MarcaEstado>
        <time dateTime={m.fecha} className="font-mono text-xs tabular-nums text-ink-soft">
          {formatFecha(m.fecha)}
        </time>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
        {m.tipo === "prohibicion" && (
          <>
            <Termino clave="regimenProhibiciones">Régimen de prohibiciones</Termino>.{" "}
          </>
        )}
        {tipo.llano}
      </p>

      <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
        {m.resolucion && (
          <div className="min-w-0">
            <dt className="rotulo text-ink-soft">Oficio o resolución</dt>
            <dd className="mt-0.5 break-words font-mono text-ink">{m.resolucion}</dd>
          </div>
        )}
        {m.fechaResolucion && (
          <div>
            <dt className="rotulo text-ink-soft">Fecha de firma</dt>
            <dd className="mt-0.5 font-mono tabular-nums text-ink">{formatFecha(m.fechaResolucion)}</dd>
          </div>
        )}
        {m.hasta && (
          <div>
            <dt className="rotulo text-ink-soft">{futura ? "Habilitación prevista" : "Habilitación registrada"}</dt>
            <dd className="mt-0.5 font-mono tabular-nums text-ink">{formatFecha(m.hasta)}</dd>
          </div>
        )}
      </dl>

      <figure className="mt-3">
        <figcaption className="rotulo text-ink-soft">El motivo, como lo escribe la DGCP</figcaption>
        <blockquote className="mt-1 border-l-2 border-hairline pl-3 text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">
          «{m.motivo}»
        </blockquote>
      </figure>
    </li>
  );
}

/**
 * La nota de la lista SDN de la OFAC, aparte de las medidas de la DGCP: es
 * otra fuente, de otro Estado, con otros efectos. Se pinta solo cuando el RNC
 * del proveedor está en el extracto.
 */
export function NotaOfac({ entidad, fecha }: { entidad: EntidadOfac; fecha: string | null }) {
  const programas = entidad.programas.map(programaEnLlano);
  return (
    <Card as="section" id="ofac" aria-labelledby="ofac-titulo" className="px-5 py-5">
      <CardTitle id="ofac-titulo" className="text-[15px]">
        ¿Está en la lista de sanciones de Estados Unidos?
      </CardTitle>
      <p className="mt-1.5 text-sm leading-relaxed text-ink">
        Su RNC ({entidad.rnc}) figura en la <Termino clave="listaSdn">lista SDN de la OFAC</Termino>{" "}
        como «{entidad.nombre}»
        {programas.length > 0 && <>, en {programas.length === 1 ? "el programa" : "los programas"} de {programas.join(" y ")}</>}
        .
      </p>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">
        Es una lista del gobierno de Estados Unidos: dice lo que decidió su Departamento del Tesoro,
        no una medida del Estado dominicano. Lista
        {fecha ? ` publicada el ${formatFecha(fecha)}` : " sin fecha de publicación"}, entrada núm.{" "}
        <span className="font-mono">{entidad.ent}</span>.{" "}
        <a
          href={hrefFichaOfac(entidad.ent)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand-700 hover:underline"
        >
          Ver la entrada en el buscador de la OFAC
          <IconExternal className="ml-0.5 inline h-3.5 w-3.5 align-[-2px]" />
          <span className="sr-only">(se abre en otra pestaña)</span>
        </a>
      </p>
    </Card>
  );
}

/**
 * La nota del Banco Mundial en la ficha de un proveedor cuyo nombre es
 * **exactamente** el de una firma de su lista que el Banco registra en la
 * República Dominicana. Una del mismo nombre registrada en otro país no se
 * pinta aquí (puede ser otra empresa): queda en la sección del listado de
 * medidas, que lo dice. Aun así, un mismo nombre no prueba identidad, y la
 * nota lo dice.
 */
export function NotaBancoMundial({ entidades: todas, fecha }: { entidades: EntidadBancoMundial[]; fecha: string | null }) {
  const entidades = todas.filter((e) => e.dominicana);
  if (entidades.length === 0) return null;
  return (
    <Card as="section" id="banco-mundial" aria-labelledby="bm-titulo" className="px-5 py-5">
      <CardTitle id="bm-titulo" className="text-[15px]">
        ¿Está en la lista de inhabilitados del Banco Mundial?
      </CardTitle>
      {entidades.map((e) => (
        <div key={e.id} className="mt-2">
          <p className="text-sm leading-relaxed text-ink">
            Una firma con exactamente su mismo nombre, «{e.nombre}», registrada en la República Dominicana,
            está en la lista: inhabilitada desde el {e.desde ? formatFecha(e.desde) : "(sin fecha)"}
            {e.hasta ? ` hasta el ${formatFecha(e.hasta)}` : ", sin fecha de fin"}. {motivoBancoMundialEnLlano(e)}
          </p>
        </div>
      ))}
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">
        Es la lista de a quién no contrata el Banco Mundial en los proyectos que financia, no una medida del Estado
        dominicano, y se cruza por el nombre, no por un documento: compáralo antes de sacar conclusiones. Lista
        {fecha ? ` actualizada el ${formatFecha(fecha)}` : ""}.{" "}
        <a
          href="https://www.worldbank.org/en/projects-operations/procurement/debarred-firms"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center font-medium text-brand-700 hover:underline sm:min-h-0"
        >
          Ver la lista del Banco Mundial
          <IconExternal className="ml-0.5 inline h-3.5 w-3.5" />
          <span className="sr-only">(se abre en otra pestaña)</span>
        </a>
      </p>
    </Card>
  );
}
