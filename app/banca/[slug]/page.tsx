import Link from "next/link";
import { cache, type ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  SUPERVISORES,
  decretoConFicha,
  entidadPorSlug,
  formatMesLargo,
  formatRnc,
  getFinancieras,
  infoSector,
  institucionDe,
  opera,
  porSector,
  provinciaDe,
  sinCalificacion,
  textoParticipacion,
  tonoDeEstatus,
  type DocumentoFinanciero,
  type EntidadFinanciera,
  type Financieras,
  type Persona,
} from "@/lib/financieras";
import { hrefInstitucion } from "@/lib/instituciones";
import { plano } from "@/lib/raiz";
import { getFuncionarios, personaPorNombre, type Persona as PersonaPublica } from "@/lib/funcionarios";
import { enlace } from "@/lib/grafo";
import { formatFecha, formatPesos, tituloLegible } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import type { Ancla } from "@/lib/cifras";
import { Ruta } from "@/components/ruta";
import AccionesFicha from "@/components/acciones-ficha";
import { ConectadoCon } from "@/components/conectado-con";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { MarcaEstado } from "@/components/marca-estado";
import { Termino } from "@/components/termino";
import { TextoEnlazado } from "@/components/texto-enlazado";
import { EstadoVacio } from "@/components/estado-vacio";
import Plegable from "@/components/plegable";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { IconExternal } from "@/components/icons";

export const revalidate = 86400;

interface Props {
  params: Promise<{ slug: string }>;
}

/** Una lectura por render, compartida con `generateMetadata`. */
const cargar = cache((slug: string) => entidadPorSlug(slug));

/** Filas a la vista en una lista de personas o de documentos antes de plegar. */
const A_LA_VISTA = 8;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const e = await cargar(slug);
  if (!e) return { title: "Entidad financiera no encontrada" };
  const s = infoSector(e.sector);
  const sup = SUPERVISORES[e.supervisor];
  // Solo lo que su ficha de la SB trae de verdad: hay bancos sin consejo publicado.
  const trae = [
    e.activosMillones != null && "sus activos",
    e.consejo?.length && "su consejo",
    e.funcionarios?.length && "sus principales funcionarios",
    e.estadosFinancieros?.length && "sus estados financieros",
  ].filter((x): x is string => Boolean(x));
  const lista = trae.length > 1 ? `${trae.slice(0, -1).join(", ")} y ${trae[trae.length - 1]}` : trae[0];
  return {
    title: e.nombre,
    alternates: { canonical: enlace.entidadFinanciera(e.slug) },
    description:
      e.supervisor === "sb" && lista
        ? `${e.nombre}: ${s.nombre.toLowerCase()} bajo la supervisión ${sup.de}. ${lista[0].toUpperCase()}${lista.slice(1)}, según la SB.`
        : `${e.nombre}: ${s.nombre.toLowerCase()} bajo la supervisión ${sup.de}, con lo que publica de ella su supervisor.`,
  };
}

/**
 * La ficha de una entidad financiera: qué es y quién la supervisa → de qué
 * tamaño es → con qué se cruza → quién la dirige → qué informa → de dónde sale
 * cada dato. El orden de IDENTIDAD §4.
 *
 * Todo sale de la instantánea de `lib/financieras.ts`. Los nombres del consejo
 * y de los funcionarios se muestran tal como los publica la SB, sin completar;
 * uno enlaza a `/funcionarios` solo si esa persona tiene allí un cargo en esta
 * misma entidad (ver `conCargo`). Teléfonos, correos y direcciones no están.
 */
export default async function EntidadFinancieraPage({ params }: Props) {
  const { slug } = await params;
  const [e, d, funcionarios] = await Promise.all([cargar(slug), getFinancieras(), getFuncionarios()]);
  if (!d) {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <Ruta raiz={{ href: "/banca", label: "Bancos y financieras" }} actual="Entidad" />
        <EstadoVacio
          variante="caida"
          como="h1"
          titulo="No pudimos leer la copia del registro de entidades financieras"
          accion={
            <Button asChild variant="secondary">
              <Link href="/fuentes">Ver el estado de las fuentes</Link>
            </Button>
          }
        >
          No es que la entidad no exista: es que la instantánea no está disponible en
          este momento. Su ficha sigue publicada en el sitio de quien la supervisa.
        </EstadoVacio>
      </div>
    );
  }
  if (!e) notFound();

  const s = infoSector(e.sector);
  const sup = SUPERVISORES[e.supervisor];
  const institucion = institucionDe(e);
  const decreto = decretoConFicha(e);
  const prov = provinciaDe(e);
  const delSector = porSector(d, e.sector).length - 1;
  const deSuProvincia = prov
    ? d.entidades.filter((x) => x.sector === e.sector && x.slug !== e.slug && provinciaDe(x)?.slug === prov.slug)
        .length
    : 0;
  const codigos = [
    e.rnc && `RNC ${formatRnc(e.rnc)}`,
    e.registroSb && `Registro en la SB ${e.registroSb}`,
    e.siglas && e.siglas !== e.nombre && `Siglas ${e.siglas}`,
    e.resolucion && `Resolución de la SIPEN ${e.resolucion}`,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Ruta raiz={{ href: "/banca", label: "Bancos y financieras" }} actual={e.nombre} />

      <Card as="section" className="p-5 sm:p-6">
        <p className="rotulo text-ink-soft">{[s.nombre, e.estatus].filter(Boolean).join(" · ")}</p>
        <h1 className="mt-1.5 font-display text-2xl leading-tight text-ink [overflow-wrap:anywhere] sm:text-3xl">
          {e.nombre}
        </h1>
        {e.razonSocial && e.razonSocial !== e.nombre && (
          <p className="mt-1 text-sm text-ink-soft">{e.razonSocial}</p>
        )}
        {codigos.length > 0 && (
          <p className="mt-2 font-mono text-xs tabular-nums text-ink-soft">{codigos.join(" · ")}</p>
        )}
        <AccionesFicha
          className="mt-3"
          tipo="entidad-financiera"
          id={e.slug}
          titulo={e.nombre}
          href={enlace.entidadFinanciera(e.slug)}
        />
        <p className="mt-3 text-[15px] leading-relaxed text-ink sm:text-sm">
          <QueEs e={e} d={d} />
        </p>
        {e.servicios && e.servicios.length > 0 && (
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Lo que la SB le tiene autorizado:{" "}
            {e.servicios.map((t, i) => (
              <span key={t}>
                {i > 0 && "; "}
                <TextoEnlazado texto={t} soloForma />
              </span>
            ))}
            .
          </p>
        )}
        {e.web && (
          <p className="mt-2 text-sm">
            <a
              href={e.web}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 font-medium text-brand-700 hover:underline sm:min-h-0"
            >
              {e.web.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
              <IconExternal className="h-3.5 w-3.5" />
              <span className="sr-only"> (su página web, se abre en otra pestaña)</span>
            </a>
          </p>
        )}
        {e.aviso && (
          <Alert variant="aviso" role="note" className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              {e.estatus && <MarcaEstado tono={tonoDeEstatus(e.estatus)}>{e.estatus}</MarcaEstado>}
              <span className="text-xs text-ink-soft">Aviso de la Superintendencia de Bancos</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink">
              <TextoEnlazado texto={e.aviso} />
            </p>
          </Alert>
        )}
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          <LineaCorte e={e} d={d} />
        </p>
      </Card>

      <Tamano e={e} />

      {e.sector === "cooperativa" && <RegistroCooperativa e={e} d={d} />}

      <ConectadoCon
        aristas={[
          e.rnc && {
            etiqueta: "En el padrón de la DGII",
            href: enlace.empresa(e.rnc),
            nombre: `RNC ${formatRnc(e.rnc)}`,
            fuente: `RNC según la ${sup.siglas}`,
          },
          e.rnc && {
            etiqueta: "¿Le vende al Estado?",
            href: enlace.documentoProveedor(e.rnc),
            nombre: "Su RNC en el registro de proveedores",
            fuente: "DGCP",
          },
          institucion && {
            etiqueta: "Su ficha como institución del Estado",
            href: hrefInstitucion(institucion),
            nombre: institucion.nombre,
            fuente: "Cruce de instituciones",
          },
          decreto && {
            etiqueta: "El decreto que la incorporó",
            href: enlace.norma("decreto", decreto) ?? "/normativa",
            nombre: `Decreto ${decreto}`,
            fuente: "IDECOOP",
          },
          prov && { etiqueta: "Su provincia", href: enlace.provincia(prov.slug), nombre: prov.nombre, fuente: "IDECOOP" },
          prov && {
            etiqueta: "Otras cooperativas de su provincia",
            href: `/banca?sector=cooperativa&provincia=${prov.slug}`,
            cuenta: deSuProvincia,
            fuente: "IDECOOP",
          },
          {
            etiqueta: "Del mismo sector",
            href: `/banca?sector=${e.sector}`,
            nombre: s.plural,
            cuenta: delSector,
            fuente: sup.siglas,
          },
        ]}
      />

      <QuienDirige
        e={e}
        conCargo={(nombre) => {
          // Solo si esa persona tiene, en /funcionarios, un cargo en esta misma
          // entidad: en la institución que es (Banreservas) o en un cargo que la
          // nombra. Un nombre igual sin ese lazo puede ser otra persona.
          const p = funcionarios ? personaPorNombre(funcionarios, nombre) : null;
          if (!p) return null;
          const propios = [institucion?.nombre, e.razonSocial, e.nombre]
            .filter((x): x is string => Boolean(x))
            .map((x) => plano(x).trim())
            .filter((x) => x.length >= 8);
          const ata = p.cargos.some(
            (c) =>
              (institucion != null && c.institucionId === institucion.id) ||
              propios.some((n) => plano(c.titulo).includes(n)),
          );
          return ata ? p : null;
        }}
      />

      <QueInforma e={e} />

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuente:{" "}
        <a
          href={e.fuente}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-brand-700 [overflow-wrap:anywhere] hover:underline"
        >
          {e.fuente.replace(/^https?:\/\//, "")}
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
        . Copia del {formatFecha(d.generado)}; los datos son los que publica{" "}
        {sup.conArticulo}, sin ajustes nuestros.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ qué es */

/** Qué es, en una frase, con la jerga explicada donde aparece. */
function QueEs({ e, d }: { e: EntidadFinanciera; d: Financieras }) {
  const s = infoSector(e.sector);
  const termino = (texto: string) => <Termino clave={s.glosa}>{texto}</Termino>;
  let frase: ReactNode;
  switch (e.sector) {
    case "entidad-publica":
      frase = (
        <>
          Es una {termino("entidad pública de intermediación financiera")}: un banco del Estado
          que supervisa la Superintendencia de Bancos.
        </>
      );
      break;
    case "cambiaria":
      frase = (
        <>
          Es un {termino((e.tipo ?? s.nombre).toLowerCase())} que supervisa la Superintendencia de
          Bancos.
        </>
      );
      break;
    case "fiduciaria":
      frase = (
        <>
          Es una {termino("fiduciaria")} que supervisa la Superintendencia de Bancos
          {e.fechaRegistro && <>, donde está registrada desde el {formatFecha(e.fechaRegistro)}</>}.
        </>
      );
      break;
    case "informacion-crediticia":
      frase = (
        <>
          Es un {termino("buró de crédito")}, lo que la ley llama sociedad de información
          crediticia, y la supervisa la Superintendencia de Bancos.
        </>
      );
      break;
    case "oficina-representacion":
      frase = (
        <>
          Es la {termino("oficina de representación")} de un banco extranjero: busca negocios para
          su casa matriz y no recibe depósitos ni presta en el país. La supervisa la
          Superintendencia de Bancos.
        </>
      );
      break;
    case "afp":
      frase = (
        <>
          Es una {termino("administradora de fondos de pensiones")} que supervisa la
          Superintendencia de Pensiones
          {e.fechaRegistro && (
            <>
              , donde está registrada desde el {formatFecha(e.fechaRegistro)}
              {e.resolucion && <> por su Resolución {e.resolucion}</>}
            </>
          )}
          .
        </>
      );
      break;
    case "aseguradora":
      frase = (
        <>
          Es una {termino("compañía de seguros o de reaseguros")} que supervisa la
          Superintendencia de Seguros.{e.antes && <> Antes se llamaba {e.antes}.</>}
        </>
      );
      break;
    case "cooperativa":
      frase = (
        <>
          Es una {termino("cooperativa")} incorporada por el Poder Ejecutivo
          {e.decreto && <> con el decreto {e.decreto}</>}
          {e.fechaDecreto ? (
            <> del {formatFecha(e.fechaDecreto)}</>
          ) : e.anioDecreto ? (
            <> de {e.anioDecreto}</>
          ) : null}
          . La fiscaliza el IDECOOP, no la Superintendencia de Bancos, y el IDECOOP no publica si
          sigue activa ni sus cifras.
        </>
      );
      break;
    default:
      frase = (
        <>
          Es {s.articulo} {termino(s.nombre.toLowerCase())}, una de las{" "}
          <Termino clave="eif">entidades de intermediación financiera</Termino> que supervisa la
          Superintendencia de Bancos.
        </>
      );
  }
  return (
    <>
      {frase}
      {e.estatus && !opera(e) && <> En la lista de la SB figura como «{e.estatus}».</>}
      {e.registroDesde && (
        <>
          {" "}
          Con esta razón social figura en el registro mensual de entidades autorizadas de la SB
          desde {formatMesLargo(e.registroDesde)}
          {e.registroDesde === d.cortes.registroSb.desde && ", el primer mes que cubre ese registro"}.
        </>
      )}
    </>
  );
}

/** A qué fecha corresponde lo que se ve, en la voz de cada supervisor. */
function LineaCorte({ e, d }: { e: EntidadFinanciera; d: Financieras }) {
  switch (e.supervisor) {
    case "sb":
      return e.corte ? (
        <>Datos de la Superintendencia de Bancos actualizados al {formatFecha(e.corte)}.</>
      ) : (
        <>La Superintendencia de Bancos no dice en esta ficha a qué fecha corresponden sus datos.</>
      );
    case "sipen":
      return <>Según la página de administradoras de fondos de pensiones de la SIPEN.</>;
    case "sis":
      return (
        <>
          Según la lista de compañías de la Superintendencia de Seguros, que publica el nombre, la
          dirección y los teléfonos; aquí solo se copian el nombre y la web.
        </>
      );
    case "idecoop":
      return (
        <>
          Según el archivo de cooperativas incorporadas del IDECOOP
          {d.cortes.idecoop ? `, que llega a ${formatMesLargo(d.cortes.idecoop)} y no se ha vuelto a publicar` : ""}.
        </>
      );
  }
}

/* ------------------------------------------------------------------ tamaño */

/** Las cifras de la SB, cada una con su ancla. Si no publica ninguna, no hay bloque. */
function Tamano({ e }: { e: EntidadFinanciera }) {
  const ancla: Ancla = {
    alcance: "registro",
    periodo: e.corte ? `SB, datos al ${formatFecha(e.corte)}` : "según la SB",
  };
  const cifras: ReactNode[] = [];
  if (e.activosMillones != null)
    cifras.push(<Cifra key="a" etiqueta="Total de activos" valor={formatPesos(e.activosMillones * 1e6)} ancla={ancla} />);
  if (e.participacion != null)
    cifras.push(
      <Cifra
        key="p"
        etiqueta={<Termino clave="participacionMercado">Participación en el sistema</Termino>}
        valor={textoParticipacion(e.participacion)}
        ancla={ancla}
      />,
    );
  if (e.activosAdministradosMillones != null)
    cifras.push(
      <Cifra
        key="aa"
        etiqueta="Lo que administra en fideicomisos"
        valor={formatPesos(e.activosAdministradosMillones * 1e6)}
        nota={`No es suyo: son bienes de terceros · ${ancla.periodo}`}
      />,
    );
  if (e.fideicomisos != null)
    cifras.push(<Cifra key="f" etiqueta="Fideicomisos" valor={formatInt(e.fideicomisos)} ancla={ancla} />);
  if (e.empleados != null) cifras.push(<Cifra key="e" etiqueta="Empleados" valor={formatInt(e.empleados)} ancla={ancla} />);
  if (e.oficinas != null) cifras.push(<Cifra key="o" etiqueta="Oficinas" valor={formatInt(e.oficinas)} ancla={ancla} />);
  if (e.cajeros != null)
    cifras.push(<Cifra key="c" etiqueta="Cajeros automáticos" valor={formatInt(e.cajeros)} ancla={ancla} />);
  if (e.subagentes != null)
    cifras.push(
      <Cifra
        key="s"
        etiqueta={<Termino clave="subagente">Subagentes</Termino>}
        valor={formatInt(e.subagentes)}
        ancla={ancla}
      />,
    );
  if (e.accionistas != null && e.accionistas > 0)
    cifras.push(
      <Cifra
        key="ac"
        etiqueta="Accionistas"
        valor={formatInt(e.accionistas)}
        nota={`La SB publica cuántos son, no quiénes · ${ancla.periodo}`}
      />,
    );
  const calificada = e.calificacion && !sinCalificacion(e);
  if (cifras.length === 0 && !e.calificacion) return null;

  return (
    <Card as="section" aria-labelledby="tamano">
      <CardHeader>
        <CardTitle id="tamano">¿De qué tamaño es?</CardTitle>
        <CardAction>Según la SB</CardAction>
      </CardHeader>
      {cifras.length > 0 && <TiraDeCifras className="border-y-0">{cifras}</TiraDeCifras>}
      {e.calificacion && (
        <p className="border-t border-hairline px-5 py-3 text-sm leading-relaxed text-ink-soft">
          {calificada ? (
            <>
              <Termino clave="calificacionRiesgo">Calificación de riesgo</Termino>:{" "}
              <span className="font-mono font-semibold text-ink">{e.calificacion}</span>
              {e.calificadora && <>, de {e.calificadora}</>}
              {e.fechaCalificacion && <>, del {formatFecha(e.fechaCalificacion)}</>}. Así la publica la SB.
            </>
          ) : (
            <>
              Según la SB, no tiene <Termino clave="calificacionRiesgo">calificación de riesgo</Termino>.
            </>
          )}
        </p>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------- cooperativa */

function RegistroCooperativa({ e, d }: { e: EntidadFinanciera; d: Financieras }) {
  const prov = provinciaDe(e);
  const filas: [string, ReactNode][] = [
    ["Tipología, como la escribe el IDECOOP", e.tipologia ?? null],
    [
      "Decreto de incorporación",
      e.decreto ? (
        <>
          <span className="font-mono">{e.decreto}</span>
          {e.fechaDecreto ? `, del ${formatFecha(e.fechaDecreto)}` : e.anioDecreto ? `, de ${e.anioDecreto}` : ""}
        </>
      ) : null,
    ],
    ["Provincia", prov?.nombre ?? e.provincia ?? null],
    ["Centro regional del IDECOOP", e.centroRegional ?? null],
  ];
  return (
    <Card as="section" aria-labelledby="registro" className="p-5 sm:p-6">
      <CardTitle id="registro">¿Qué dice su registro?</CardTitle>
      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {filas
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-ink-soft">{k}</dt>
              <dd className="mt-0.5 break-words text-sm text-ink">{v}</dd>
            </div>
          ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-ink-soft">
        El archivo del IDECOOP tiene también la dirección de cada cooperativa; aquí no se
        copia. {d.cortes.idecoop && `Llega a ${formatMesLargo(d.cortes.idecoop)}.`}
      </p>
    </Card>
  );
}

/* --------------------------------------------------------- quién la dirige */

function QuienDirige({ e, conCargo }: { e: EntidadFinanciera; conCargo: (nombre: string) => PersonaPublica | null }) {
  const listas = [
    { titulo: "Consejo de administración", personas: e.consejo, abrir: "miembros del consejo" },
    { titulo: "Principales funcionarios", personas: e.funcionarios, abrir: "funcionarios" },
    { titulo: "Accionistas", personas: e.accionistasLista, abrir: "accionistas" },
  ].filter((l) => l.personas && l.personas.length > 0) as { titulo: string; personas: Persona[]; abrir: string }[];
  if (listas.length === 0) return null;
  return (
    <Card as="section" aria-labelledby="dirige">
      <CardHeader>
        <CardTitle id="dirige">¿Quién la dirige?</CardTitle>
        <CardAction>Según la SB</CardAction>
      </CardHeader>
      <div className="grid grid-cols-1 divide-y divide-hairline lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        {listas.map((l) => (
          <ListaPersonas key={l.titulo} {...l} conCargo={conCargo} />
        ))}
      </div>
      <p className="border-t border-hairline px-5 py-3 text-xs leading-relaxed text-ink-soft">
        Nombres y cargos tal como los publica la Superintendencia de Bancos en la ficha de la
        entidad, sin completar ni corregir. Un nombre lleva a la ficha de cargo público de una
        persona que se llama igual (sin contar tildes ni mayúsculas) solo si esa persona tiene un
        cargo en esta misma entidad según el MAP o un decreto; la SB no lo dice por sí misma.
      </p>
    </Card>
  );
}

function ListaPersonas({
  titulo,
  personas,
  abrir,
  conCargo,
}: {
  titulo: string;
  personas: Persona[];
  abrir: string;
  conCargo: (nombre: string) => PersonaPublica | null;
}) {
  const fila = (p: Persona, i: number) => {
    const publica = conCargo(p.nombre);
    return (
      <li key={`${p.nombre}-${i}`} className={publica ? "relative px-5 py-2.5" : "px-5 py-2.5"}>
        {publica ? (
          <Link href={enlace.funcionario(publica.id)} className="block text-sm text-ink estira hover:text-brand-700">
            {p.nombre}
          </Link>
        ) : (
          <span className="block text-sm text-ink">{p.nombre}</span>
        )}
        {p.cargo && <span className="block text-xs text-ink-soft">{tituloLegible(p.cargo)}</span>}
        {publica && <span className="block text-xs text-ink-soft">Tiene ficha de cargo público</span>}
      </li>
    );
  };
  const vista = personas.slice(0, A_LA_VISTA);
  const resto = personas.slice(A_LA_VISTA);
  return (
    <section aria-label={titulo} className="min-w-0">
      <h3 className="flex items-baseline justify-between gap-3 px-5 pb-1 pt-4 font-sans text-sm font-semibold text-ink">
        {titulo}
        <span className="font-mono text-xs font-normal tabular-nums text-ink-soft">{formatInt(personas.length)}</span>
      </h3>
      {resto.length > 0 ? (
        <Plegable
          resumen={<ul className="divide-y divide-hairline">{vista.map(fila)}</ul>}
          etiqueta={`Ver a los ${formatInt(personas.length)} ${abrir}`}
          etiquetaCerrar={`Ver solo los primeros ${A_LA_VISTA}`}
        >
          <ul className="divide-y divide-hairline">{resto.map((p, i) => fila(p, i + A_LA_VISTA))}</ul>
        </Plegable>
      ) : (
        <ul className="divide-y divide-hairline">{vista.map(fila)}</ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------- qué informa */

function QueInforma({ e }: { e: EntidadFinanciera }) {
  const listas = [
    { titulo: "Estados financieros", docs: e.estadosFinancieros, abrir: "estados financieros" },
    { titulo: "Memorias anuales", docs: e.memorias, abrir: "memorias" },
  ].filter((l) => l.docs && l.docs.length > 0) as { titulo: string; docs: DocumentoFinanciero[]; abrir: string }[];
  if (listas.length === 0) return null;
  return (
    <Card as="section" aria-labelledby="informa">
      <CardHeader>
        <CardTitle id="informa">¿Qué informa?</CardTitle>
        <CardAction>PDF en el sitio de la SB</CardAction>
      </CardHeader>
      <div className="grid grid-cols-1 divide-y divide-hairline lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        {listas.map((l) => (
          <ListaDocumentos key={l.titulo} {...l} />
        ))}
      </div>
      <p className="border-t border-hairline px-5 py-3 text-xs leading-relaxed text-ink-soft">
        Los publica la entidad y los aloja la Superintendencia de Bancos. Se enlazan tal cual,
        sin leerlos ni resumirlos: cada uno se abre en el sitio de la SB.
      </p>
    </Card>
  );
}

function ListaDocumentos({ titulo, docs, abrir }: { titulo: string; docs: DocumentoFinanciero[]; abrir: string }) {
  const fila = (doc: DocumentoFinanciero) => (
    <li key={doc.url}>
      <a
        href={doc.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-11 items-center justify-between gap-3 px-5 py-2 text-sm text-ink transition-colors hover:bg-canvas/60 hover:text-brand-700 active:bg-canvas"
      >
        <span className="min-w-0 [overflow-wrap:anywhere]">{tituloLegible(doc.titulo)}</span>
        <IconExternal className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
        <span className="sr-only"> (PDF en el sitio de la SB, se abre en otra pestaña)</span>
      </a>
    </li>
  );
  const vista = docs.slice(0, A_LA_VISTA);
  const resto = docs.slice(A_LA_VISTA);
  return (
    <section aria-label={titulo} className="min-w-0">
      <h3 className="flex items-baseline justify-between gap-3 px-5 pb-1 pt-4 font-sans text-sm font-semibold text-ink">
        {titulo}
        <span className="font-mono text-xs font-normal tabular-nums text-ink-soft">{formatInt(docs.length)}</span>
      </h3>
      {resto.length > 0 ? (
        <Plegable
          resumen={<ul className="divide-y divide-hairline">{vista.map(fila)}</ul>}
          etiqueta={`Ver los ${formatInt(docs.length)} ${abrir}`}
          etiquetaCerrar={`Ver solo los ${A_LA_VISTA} más recientes`}
        >
          <ul className="divide-y divide-hairline">{resto.map(fila)}</ul>
        </Plegable>
      ) : (
        <ul className="divide-y divide-hairline">{vista.map(fila)}</ul>
      )}
    </section>
  );
}
