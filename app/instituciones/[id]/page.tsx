import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  FUENTES_DEL_CRUCE,
  contarPorSector,
  getComprasDeInstitucion,
  hrefDirectorio,
  hrefInstitucion,
  institucionDeSlug,
  institucionesDelCapitulo,
  sectorDe,
  type Institucion,
  type SenalesDeCompra,
  type Transferencia,
} from "@/lib/instituciones";
import { etiquetaCorte, getInstitucionFiscal } from "@/lib/fiscal";
import { getNominaDeInstitucion, getResumenNomina } from "@/lib/nomina-server";
import { obrasDeInstitucion } from "@/lib/obras";
import { sismapDeGobiernoLocal, sismapDeInstitucion } from "@/lib/sismap";
import { variacion } from "@/lib/cifras";
import { normasDeInstitucion, RUTA_POR_TIPO } from "@/lib/normativa";
import { listPacc } from "@/lib/dgcp";
import { desdeMayusculas } from "@/lib/congreso";
import { formatFecha, formatMonto, formatPesos, SIN_DATO } from "@/lib/format";
import { formatDOP, formatInt } from "@/lib/nomina";
import { Ruta } from "@/components/ruta";
import { ObrasDeInstitucion } from "@/components/fuentes-nuevas/obras-de-institucion";
import { SismapDeInstitucion } from "@/components/fuentes-nuevas/sismap-de-institucion";
import { HistoriaDeInstitucion } from "@/components/fuentes-nuevas/historia-compras";
import { historiaDeInstitucion, prefijoSinAsignar } from "@/lib/historico";
import { documentosDeInstitucion } from "@/lib/biblioteca";
import { claveInstitucion, mesGeneral, nominaGeneralDeInstitucion } from "@/lib/nomina-general";
import { DocumentosDeInstitucion } from "@/components/fuentes-nuevas/documentos-de-institucion";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BarrasHorizontales } from "@/components/graficos";
import { Button } from "@/components/ui/button";
import { EsqueletoFilas } from "@/components/esqueleto";
import { EstadoVacio } from "@/components/estado-vacio";
import { IconExternal } from "@/components/icons";
import { Cifra, TiraDeCifras } from "@/components/papel";
import Plegable from "@/components/plegable";
import Antiguedad from "@/components/antiguedad";
import AccionesFicha from "@/components/acciones-ficha";
import { FiltroEnlace, NavFiltros } from "@/components/nav-filtros";
import { enlace } from "@/lib/grafo";
import { ConectadoCon } from "@/components/conectado-con";
import { filtrarInformes, getAuditorias, informesDe } from "@/lib/auditorias";
import Conversacion from "@/components/espacios/conversacion";
import { QuienDirige } from "@/components/fuentes-nuevas/quien-dirige";
import { getFuncionarios, personasDeInstitucion } from "@/lib/funcionarios";
import { entidadDeInstitucion } from "@/lib/financieras";

/** Normas a la vista en «Lo que decreta el Ejecutivo»; el resto, plegado. */
const NORMAS_A_LA_VISTA = 2;
/**
 * Tope de normas en la ficha. La Dirección de Jubilaciones tiene 488: la
 * lista entera no cabe en una ficha ni plegada, y el conteo lo declara.
 */
const NORMAS_MAX = 50;
/** Adjudicaciones recientes a la vista en Compras; el resto, plegado. */
const ADJUDICACIONES_A_LA_VISTA = 2;

/*
  Dinámica a propósito: lo caro —el resumen de compras— ya se cachea una hora
  en `lib/instituciones.ts`, y un fallo no se guarda. Con ISR, la página que
  se generó durante una caída de la DGCP quedaba servida una hora diciendo
  «no respondió».
*/
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const i = institucionDeSlug((await params).id);
  if (!i) return { title: "Institución no encontrada" };
  return {
    title: desdeMayusculas(i.nombre),
    // `/instituciones/237` y `/instituciones/237-minerd` son la misma página:
    // la canónica es la del tramo legible.
    alternates: { canonical: hrefInstitucion(i) },
    description: i.dgcp
      ? `Qué compra, cuánto gasta, a quién le paga y qué decreta el Estado sobre ${i.nombre}: presupuesto, contratos, nómina y normativa en una sola página.`
      : `Su sector y su capítulo en el Clasificador Institucional, su presupuesto, lo que le transfiere el Gobierno central y lo que decreta el Estado sobre ${i.nombre}, en una sola página.`,
  };
}

/**
 * Ficha de institución: presupuesto, compras, nómina y normativa de un mismo
 * organismo, que en el Estado viven en cuatro catálogos que no se hablan.
 *
 * El presupuesto y la nómina salen de instantáneas locales y llegan con la
 * página; las compras y el plan anual consultan la DGCP en vivo y caen cada
 * una en su hueco al contestar, para que una API lenta no retenga lo demás.
 */
export default async function InstitucionPage({ params }: Props) {
  const i = institucionDeSlug((await params).id);
  if (!i) notFound();
  // La que entró por el Clasificador Institucional no tiene unidad de compra:
  // su ficha no le pregunta nada a la DGCP (ver `FichaDelClasificador`).
  if (!i.dgcp) return <FichaDelClasificador i={i} />;

  const [fiscal, nomina, resumenNomina, normas, obras, sismap, historia, sinAsignar, documentos, general, auditorias, funcionarios] = await Promise.all([
    i.capitulo ? getInstitucionFiscal(i.capitulo) : null,
    i.nomina ? getNominaDeInstitucion(i.nomina) : null,
    // Solo para decir de cuántas se lee la nómina cuando esta no está.
    i.nomina ? null : getResumenNomina(),
    normasDeInstitucion(i.consultoria),
    obrasDeInstitucion(i.id),
    sismapDeInstitucion(i.id),
    historiaDeInstitucion(i.id),
    prefijoSinAsignar(i.nombre),
    documentosDeInstitucion(i.id),
    nominaGeneralDeInstitucion(i.id),
    getAuditorias(),
    getFuncionarios(),
  ]);
  const entidad = await entidadDeInstitucion(i.id);
  const conHistoria = Boolean(historia?.historia.serie.some((f) => f[1] > 0)) || Boolean(sinAsignar);
  const hermanas = i.capitulo ? institucionesDelCapitulo(i.capitulo).filter((h) => h.id !== i.id) : [];
  const nObras = obras?.obras.length ?? 0;
  // La misma consulta que abre la arista: la cuenta es la de la lista.
  const nAuditorias = auditorias ? filtrarInformes(informesDe(auditorias), { q: i.nombre }).length : 0;
  const conPersonas = funcionarios ? personasDeInstitucion(funcionarios, i.id).length > 0 : false;
  // Lo que la Ley de Presupuesto le transfiere desde el Gobierno central (un
  // ayuntamiento, sobre todo): solo cuando el cuadro de DIGEPRES la nombra sola.
  const transfiere = Boolean(i.transferencia || i.transferenciaProyecto);

  /*
    El índice de la ficha: una entrada por sección que de verdad está en la
    página, en su orden. Eran marcas teñidas de azul de firma que no llevaban
    a ninguna parte —el azul dice «se puede pulsar»—; ahora lo son.
  */
  const indice = [
    conPersonas && { id: "dirige", texto: "Quién la dirige" },
    {
      id: "presupuesto",
      texto: i.capitulo ? `Presupuesto · cap. ${i.capitulo}` : transfiere ? "Transferencias" : "Presupuesto",
    },
    { id: "compras", texto: `Compras · DGCP ${i.id}` },
    conHistoria && { id: "historia", texto: "Desde 2015" },
    nObras > 0 && { id: "obras", texto: `Obras · ${formatInt(nObras)}` },
    sismap && { id: "gestion", texto: "Gestión" },
    { id: "nomina", texto: nomina || general ? "Nómina" : "Nómina · sin datos" },
    documentos && { id: "documentos", texto: `Documentos · ${formatInt(documentos.fuente.documentos)}` },
    { id: "decretos", texto: normas.docs.length > 0 ? `Normativa · ${formatInt(normas.docs.length)}` : "Normativa" },
    { id: "plan", texto: "Plan de compras" },
  ].filter((e): e is { id: string; texto: string } => Boolean(e));

  return (
    <div className="space-y-5">
      <Ruta raiz={{ href: "/instituciones", label: "Instituciones" }} actual={i.acronimo || i.nombre} />

      <Card as="section" className="p-5 sm:p-6">
        <div className="rotulo text-ink-soft">
          {[i.tipo, i.acronimo].filter(Boolean).join(" · ")}
        </div>
        <h1 className="mt-1 font-display text-2xl leading-tight sm:text-3xl">{desdeMayusculas(i.nombre)}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Lo que el Estado publica sobre esta institución en cuatro sitios distintos,
          reunido aquí: su presupuesto, lo que compra y a quién,{" "}
          {nomina ? "su nómina" : "si publica su nómina"} y lo que el Ejecutivo
          decreta sobre ella.
        </p>
        <AccionesFicha
          className="mt-3"
          tipo="institucion"
          id={String(i.id)}
          titulo={i.nombre}
          href={hrefInstitucion(i)}
          feed={`/api/feed?uc=${i.id}`}
        />
        <NavFiltros etiqueta="Secciones de esta ficha" className="mt-4">
          {indice.map((e) => (
            <FiltroEnlace key={e.id} href={`#${e.id}`} activo={false}>
              {e.texto}
            </FiltroEnlace>
          ))}
        </NavFiltros>
      </Card>

      <ConectadoCon
        aristas={[
          i.capitulo && {
            etiqueta: "Capítulo del presupuesto",
            href: enlace.capitulo(i.capitulo),
            nombre: fiscal ? fiscal.institucion.nombreLegible : `Capítulo ${i.capitulo}`,
            fuente: "SIGEF",
          },
          hermanas.length > 0 && i.capitulo && {
            etiqueta: "Otras unidades del mismo capítulo",
            href: enlace.capitulo(i.capitulo),
            cuenta: hermanas.length,
            fuente: "DGCP ↔ SIGEF",
          },
          { etiqueta: "Obras que ejecuta", href: `/obras?uc=${i.id}`, cuenta: nObras, fuente: "MapaInversiones" },
          {
            etiqueta: "Normas que la nombran",
            href: "#decretos",
            cuenta: normas.docs.length,
            fuente: "Consultoría Jurídica",
          },
          {
            etiqueta: "Informes de auditoría",
            href: `/auditorias?q=${encodeURIComponent(i.nombre)}`,
            cuenta: nAuditorias,
            fuente: "Contraloría y Cámara de Cuentas",
          },
          nomina
            ? { etiqueta: "Plazas en su nómina", href: `/nomina?inst=${encodeURIComponent(nomina.codigo)}`, cuenta: nomina.plazas, fuente: `Nómina de ${nomina.periodo}` }
            : general && {
                etiqueta: "Plazas en su nómina",
                href: `/nomina/general?inst=${claveInstitucion(general.inst.nombre)}`,
                cuenta: general.inst.plazas,
                fuente: "Nómina general del MAP",
              },
          documentos && {
            etiqueta: "Documentos que publica",
            href: `/documentos?inst=${encodeURIComponent(documentos.fuente.host)}`,
            cuenta: documentos.fuente.documentos,
            fuente: documentos.fuente.host,
          },
          // La tabla y el nombre de su fila: un ayuntamiento está en la tabla
          // municipal, y buscarlo en la de instituciones no lo encuentra.
          sismap && {
            etiqueta: "Su lugar en el ranking de gestión",
            href: `/gestion?${new URLSearchParams({ tabla: sismap.tabla, q: sismap.fila.nombre })}`,
            fuente: "SISMAP del MAP",
          },
          entidad && {
            etiqueta: "Su ficha de entidad financiera",
            href: enlace.entidadFinanciera(entidad.slug),
            nombre: entidad.nombre,
            fuente: "Superintendencia de Bancos",
          },
        ]}
      />

      {conPersonas && (
        <div id="dirige">
          <QuienDirige uc={i.id} />
        </div>
      )}

      <div id="presupuesto" className="space-y-5">
        {fiscal ? (
          <Presupuesto datos={fiscal} institucion={i} hermanas={hermanas} />
        ) : (
          !transfiere && (
            <EstadoVacio rotulo="Presupuesto" titulo="Sin presupuesto propio en el SIGEF">
              La DGCP no adscribe esta unidad de compra a un capítulo del Presupuesto
              General del Estado (pasa con ayuntamientos, empresas públicas y órganos
              con presupuesto aparte), así que su gasto no aparece en la instantánea
              del SIGEF.
            </EstadoVacio>
          )
        )}
        {transfiere && <Transferencias i={i} />}
      </div>

      <div id="compras">
        <Suspense fallback={<Cargando titulo="Compras" texto="Consultando sus contratos en la DGCP…" />}>
          <Compras institucion={i} />
        </Suspense>
      </div>

      <HistoriaDeInstitucion uc={i.id} nombre={i.nombre} />

      {nObras > 0 && (
        <div id="obras">
          <ObrasDeInstitucion uc={i.id} />
        </div>
      )}
      {sismap && (
        <div id="gestion">
          <SismapDeInstitucion uc={i.id} />
        </div>
      )}

      <div id="nomina">
        {nomina || general ? (
          <NominaLeida nomina={nomina} general={general} />
        ) : i.nomina ? (
          <EstadoVacio variante="caida" rotulo="Nómina" titulo="No pudimos leer su nómina">
            Esta institución está en la foto de nómina, pero el archivo no se pudo
            leer ahora. No es que no la publique: es que no pudimos mirar.
          </EstadoVacio>
        ) : (
          /*
            La cabecera prometía «su nómina» a toda institución y la mayoría no
            está en la foto: callar dejaba al lector buscando una sección que no
            existe. Se dice, con cuántas sí y el camino a ellas.
          */
          <EstadoVacio
            rotulo="Nómina"
            titulo="Su nómina no está entre las que leemos"
            accion={
              <Button asChild variant="secondary">
                <Link href="/nomina">
                  {resumenNomina
                    ? `Ver las ${formatInt(resumenNomina.instituciones)} que sí`
                    : "Ver las que sí"}
                </Link>
              </Button>
            }
          >
            La plataforma lee la nómina de{" "}
            {resumenNomina ? `${formatInt(resumenNomina.instituciones)} instituciones` : "un grupo de instituciones"}{" "}
            cuyos portales de transparencia la publican en un formato que se puede
            procesar, y esta no está entre ellas: puede que la publique en su
            portal, pero aquí no hay cargos ni sueldos suyos.
          </EstadoVacio>
        )}
      </div>

      <DocumentosDeInstitucion uc={i.id} />

      <LoQueDecreta docs={normas.docs} />

      <div id="plan">
        <Suspense fallback={<Cargando titulo="Plan anual de compras" texto="Consultando su PACC…" />}>
          <Planes institucion={i} />
        </Suspense>
      </div>

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuentes: DGCP (unidad de compra {i.id}), SIGEF
        {i.capitulo ? ` (capítulo ${i.capitulo})` : ""}, nóminas de transparencia y
        Consultoría Jurídica. El cruce entre catálogos lo declara la propia DGCP
        (capítulo de cada unidad de compra); nómina y normativa se emparejan por
        nombre y se publican en{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          el estado de las fuentes
        </Link>
        .
      </p>
      {/* La clave es la ruta con solo el código: si cambia el nombre, la conversación sigue siendo la misma. */}
      <Conversacion className="mt-6" referencia={{ tipo: "institucion", ref: enlace.institucion(i.id), titulo: i.nombre, href: enlace.institucion(i.id) }} />
    </div>
  );
}

/**
 * La ficha de una entidad del Clasificador Institucional de DIGEPRES que no
 * tiene unidad de compra en la DGCP: el Congreso, el Poder Judicial, el Banco
 * Central, la mayoría de las juntas de distrito.
 *
 * No consulta la DGCP. No hay nada suyo que consultar, y la ficha de siempre
 * habría dicho «no publicó procesos», que es una afirmación sobre una unidad
 * que no existe. Lo dice llano y ofrece el camino que sí hay. Lo demás sale de
 * donde siempre: el presupuesto del SIGEF si su capítulo se ejecuta ahí, lo
 * que el Gobierno central le transfiere (cuadro de DIGEPRES), su gestión en el
 * SISMAP si es un gobierno local y casa sin duda, su nómina si está en la foto
 * y lo que decreta el Ejecutivo.
 */
async function FichaDelClasificador({ i }: { i: Institucion }) {
  const local = i.sector === "local";
  const [fiscal, nomina, general, normas, sismap, auditorias, funcionarios] = await Promise.all([
    i.capitulo ? getInstitucionFiscal(i.capitulo) : null,
    i.nomina ? getNominaDeInstitucion(i.nomina) : null,
    nominaGeneralDeInstitucion(i.id),
    normasDeInstitucion(i.consultoria),
    local ? sismapDeGobiernoLocal(i.id, i.nombre) : sismapDeInstitucion(i.id),
    getAuditorias(),
    getFuncionarios(),
  ]);
  const entidad = await entidadDeInstitucion(i.id);
  const conPersonas = funcionarios ? personasDeInstitucion(funcionarios, i.id).length > 0 : false;
  const sector = sectorDe(i.sector);
  const clasificador = FUENTES_DEL_CRUCE.clasificador;
  const hermanasDeSector = contarPorSector()[i.sector] - 1;
  const nAuditorias = auditorias ? filtrarInformes(informesDe(auditorias), { q: i.nombre }).length : 0;
  const transfiere = Boolean(i.transferencia || i.transferenciaProyecto);
  const deSuSector = hrefDirectorio({ sector: i.sector });

  const indice = [
    conPersonas && { id: "dirige", texto: "Quién la dirige" },
    { id: "presupuesto", texto: fiscal ? `Presupuesto · cap. ${i.capitulo}` : transfiere ? "Transferencias" : "Presupuesto" },
    { id: "compras", texto: "Compras · sin unidad" },
    sismap && { id: "gestion", texto: "Gestión" },
    (nomina || general) && { id: "nomina", texto: "Nómina" },
    { id: "decretos", texto: normas.docs.length > 0 ? `Normativa · ${formatInt(normas.docs.length)}` : "Normativa" },
  ].filter((e): e is { id: string; texto: string } => Boolean(e));

  return (
    <div className="space-y-5">
      <Ruta
        raiz={{ href: "/instituciones", label: "Instituciones" }}
        padre={{ href: deSuSector, label: sector.nombre }}
        actual={i.acronimo || i.nombre}
      />

      <Card as="section" className="p-5 sm:p-6">
        <div className="rotulo text-ink-soft">
          {[i.tipo, i.acronimo, i.clasificador && `Capítulo ${i.clasificador}`].filter(Boolean).join(" · ")}
        </div>
        <h1 className="mt-1 font-display text-2xl leading-tight sm:text-3xl">{desdeMayusculas(i.nombre)}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          El Clasificador Institucional de DIGEPRES, la lista de entidades del
          presupuesto, la registra con el capítulo{" "}
          <span className="font-mono tabular-nums text-ink">{i.clasificador}</span> en el sector «{sector.nombre}».
          No tiene unidad de compra propia en la DGCP, así que aquí no hay compras
          suyas; sí lo demás que el Estado publica sobre ella en las fuentes que lee
          la plataforma.
        </p>
        <AccionesFicha
          className="mt-3"
          tipo="institucion"
          id={String(i.id)}
          titulo={i.nombre}
          href={hrefInstitucion(i)}
        />
        <NavFiltros etiqueta="Secciones de esta ficha" className="mt-4">
          {indice.map((e) => (
            <FiltroEnlace key={e.id} href={`#${e.id}`} activo={false}>
              {e.texto}
            </FiltroEnlace>
          ))}
        </NavFiltros>
      </Card>

      <ConectadoCon
        aristas={[
          fiscal &&
            i.capitulo && {
              etiqueta: "Capítulo del presupuesto",
              href: enlace.capitulo(i.capitulo),
              nombre: fiscal.institucion.nombreLegible,
              fuente: "SIGEF",
            },
          {
            etiqueta: `Las demás de su sector: ${sector.nombre}`,
            href: deSuSector,
            cuenta: hermanasDeSector,
            fuente: "Clasificador Institucional de DIGEPRES",
          },
          {
            etiqueta: "Normas que la nombran",
            href: "#decretos",
            cuenta: normas.docs.length,
            fuente: "Consultoría Jurídica",
          },
          {
            etiqueta: "Informes de auditoría",
            href: `/auditorias?q=${encodeURIComponent(i.nombre)}`,
            cuenta: nAuditorias,
            fuente: "Contraloría y Cámara de Cuentas",
          },
          nomina
            ? { etiqueta: "Plazas en su nómina", href: `/nomina?inst=${encodeURIComponent(nomina.codigo)}`, cuenta: nomina.plazas, fuente: `Nómina de ${nomina.periodo}` }
            : general && {
                etiqueta: "Plazas en su nómina",
                href: `/nomina/general?inst=${claveInstitucion(general.inst.nombre)}`,
                cuenta: general.inst.plazas,
                fuente: "Nómina general del MAP",
              },
          sismap && {
            etiqueta: "Su lugar en el ranking de gestión",
            href: `/gestion?${new URLSearchParams({ tabla: sismap.tabla, q: sismap.fila.nombre })}`,
            fuente: "SISMAP del MAP",
          },
          entidad && {
            etiqueta: "Su ficha de entidad financiera",
            href: enlace.entidadFinanciera(entidad.slug),
            nombre: entidad.nombre,
            fuente: "Superintendencia de Bancos",
          },
        ]}
      />

      {conPersonas && (
        <div id="dirige">
          <QuienDirige uc={i.id} />
        </div>
      )}

      <div id="presupuesto" className="space-y-5">
        {fiscal && <Presupuesto datos={fiscal} institucion={i} hermanas={[]} />}
        {transfiere && <Transferencias i={i} />}
        {!fiscal && !transfiere && (
          <EstadoVacio rotulo="Presupuesto" titulo="Sin presupuesto en las fuentes que leemos">
            Su capítulo no está en la instantánea del SIGEF, que cubre el
            Presupuesto General del Estado, y el cuadro de transferencias de la Ley
            de Presupuesto no le asigna nada del Gobierno central.
          </EstadoVacio>
        )}
      </div>

      <div id="compras">
        <EstadoVacio
          rotulo="Compras"
          titulo="No tiene unidad de compra propia en la DGCP"
          accion={
            <Button asChild variant="secondary">
              <Link href={`/buscar?q=${encodeURIComponent(desdeMayusculas(i.nombre))}`}>
                Buscar su nombre en toda la plataforma
              </Link>
            </Button>
          }
        >
          El catálogo de unidades de compra de la Dirección General de
          Contrataciones Públicas no tiene ninguna para esta entidad, así que esta
          ficha no puede consultar procesos, contratos ni plan anual suyos. Eso no
          dice que no compre: dice que no hay una unidad suya que consultar.
        </EstadoVacio>
      </div>

      {sismap && (
        <div id="gestion">
          <SismapDeInstitucion uc={i.id} gobiernoLocal={local ? i.nombre : undefined} />
        </div>
      )}

      {(nomina || general) && (
        <div id="nomina">
          <NominaLeida nomina={nomina} general={general} />
        </div>
      )}

      <LoQueDecreta docs={normas.docs} />

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuentes:{" "}
        <a
          href={clasificador.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand-700 hover:underline"
        >
          Clasificador Institucional de DIGEPRES
        </a>{" "}
        (capítulo {i.clasificador}, actualizado al {formatFecha(clasificador.actualizado)})
        {fiscal ? `, SIGEF (capítulo ${i.capitulo})` : ""}
        {transfiere ? ", cuadros de entidades receptoras de DIGEPRES" : ""}
        {sismap ? ", SISMAP" : ""}
        {nomina || general ? ", nóminas" : ""} y Consultoría Jurídica. Tiene ficha
        porque el clasificador la registra, aunque la DGCP no le dé unidad de compra;
        lo que cada fuente cubre está en{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          el estado de las fuentes
        </Link>
        .
      </p>
      <Conversacion className="mt-6" referencia={{ tipo: "institucion", ref: enlace.institucion(i.id), titulo: i.nombre, href: enlace.institucion(i.id) }} />
    </div>
  );
}

/**
 * «¿Cuánto le transfiere el Gobierno central?»: la Ley de Presupuesto vigente
 * y, si ya se depositó, el proyecto del año siguiente, del cuadro de entidades
 * receptoras de DIGEPRES. La comparación entre los dos es del mismo cuadro y
 * de la misma entidad; si la ley no le asigna nada, no hay porcentaje.
 */
function Transferencias({ i }: { i: Institucion }) {
  const ley = i.transferencia;
  const proyecto = i.transferenciaProyecto;
  const cuadro = (t: Transferencia | undefined) => (t ? (FUENTES_DEL_CRUCE.transferencias[t.fuente] ?? null) : null);
  const cuadroLey = cuadro(ley);
  const cuadroProyecto = cuadro(proyecto);
  const cambio = ley && proyecto ? variacion(proyecto.monto, ley.monto) : null;
  const local = i.sector === "local";
  const enlaceCuadro = (url: string, texto: string) => (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1 font-medium text-brand-700 hover:underline sm:min-h-0"
    >
      {texto}
      <IconExternal className="h-3.5 w-3.5" />
    </a>
  );

  return (
    <Card as="section" className="p-5 sm:p-6">
      <CardTitle>¿Cuánto le transfiere el Gobierno central?</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Lo que el presupuesto del Gobierno central le asigna como transferencia,
        según el cuadro «Clasificación institucional según entidad receptora» que
        publica DIGEPRES.{" "}
        {local
          ? "Para un ayuntamiento o una junta de distrito es su parte de lo que el Estado reparte entre los gobiernos locales; lo que recauda por su cuenta no está aquí."
          : "Si tiene ingresos propios, no están aquí."}
      </p>
      <TiraDeCifras className="mt-4 lg:grid-cols-2">
        {ley && (
          <Cifra
            etiqueta={`Presupuesto ${ley.anio}`}
            valor={formatPesos(ley.monto)}
            ancla={{ alcance: "instantanea", periodo: `Ley de Presupuesto ${ley.anio}` }}
          />
        )}
        {proyecto && (
          <Cifra
            etiqueta={`Propuesto para ${proyecto.anio}`}
            valor={formatPesos(proyecto.monto)}
            nota={`Proyecto de Ley de Presupuesto ${proyecto.anio}${
              cambio?.pct != null && ley
                ? ` · ${Math.abs(cambio.pct).toFixed(1)} % ${cambio.abs >= 0 ? "más" : "menos"} que en ${ley.anio}`
                : ""
            }`}
          />
        )}
      </TiraDeCifras>
      {local && cuadroLey && (
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          La Ley de Presupuesto {cuadroLey.anio} transfiere {formatPesos(cuadroLey.totalLocales)} a los
          gobiernos locales
          {cuadroLey.sinRepartir > 0
            ? `; ${formatPesos(cuadroLey.sinRepartir)} de ellos van en una partida «Ayuntamientos» sin repartir por municipio.`
            : "."}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {cuadroLey && enlaceCuadro(cuadroLey.url, `El cuadro de la ley ${cuadroLey.anio}`)}
        {cuadroProyecto && enlaceCuadro(cuadroProyecto.url, `El del proyecto ${cuadroProyecto.anio}`)}
      </div>
    </Card>
  );
}

/** La nómina leída de una institución: la foto de su portal o, si no, la general del MAP. */
function NominaLeida({
  nomina,
  general,
}: {
  nomina: Awaited<ReturnType<typeof getNominaDeInstitucion>>;
  general: Awaited<ReturnType<typeof nominaGeneralDeInstitucion>>;
}) {
  if (nomina) {
    return (
      <Card as="section" className="p-5 sm:p-6">
        <CardTitle>Nómina</CardTitle>
        <p className="mt-1 text-xs text-ink-soft">
          Foto de {nomina.periodo}: el último mes que la institución publicó en
          formato procesable. Sin nombres: cargo y sueldo bruto.
        </p>
        <TiraDeCifras className="mt-4 lg:grid-cols-3">
          <Cifra etiqueta="Plazas" valor={formatInt(nomina.plazas)} ancla={{ alcance: "instantanea", periodo: nomina.periodo }} />
          <Cifra etiqueta="Masa salarial del mes" valor={formatPesos(nomina.masa)} ancla={{ alcance: "instantanea", periodo: nomina.periodo }} />
          <Cifra etiqueta="Sueldo mediano" valor={formatDOP(nomina.mediana)} ancla={{ alcance: "instantanea", periodo: nomina.periodo }} />
        </TiraDeCifras>
        <ul className="mt-4 divide-y divide-hairline text-sm">
          {nomina.cargos.map((c) => (
            <li key={c.cargo} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0">{desdeMayusculas(c.cargo)}</span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-ink-soft">
                {formatInt(c.plazas)} {c.plazas === 1 ? "plaza" : "plazas"} · mediana {formatDOP(c.mediana)}
              </span>
            </li>
          ))}
        </ul>
        <Button asChild variant="secondary" className="mt-4">
          <Link href={`/nomina?inst=${encodeURIComponent(nomina.codigo)}`}>Explorar su nómina</Link>
        </Button>
      </Card>
    );
  }
  if (!general) return null;
  return (
    <Card as="section" className="p-5 sm:p-6">
      <CardTitle>Nómina</CardTitle>
      <p className="mt-1 text-xs text-ink-soft">
        Según la nómina general del Ministerio de Administración Pública,{" "}
        {mesGeneral(general.anio, general.mes)}. Sin nombres: cargo y sueldo bruto,
        sin el área de trabajo.
      </p>
      <TiraDeCifras className="mt-4 lg:grid-cols-3">
        <Cifra etiqueta="Plazas" valor={formatInt(general.inst.plazas)} ancla={{ alcance: "instantanea", periodo: mesGeneral(general.anio, general.mes) }} />
        <Cifra etiqueta="Masa salarial del mes" valor={formatPesos(general.inst.masa)} />
        <Cifra etiqueta="Sueldo mediano" valor={formatDOP(general.inst.mediana)} />
      </TiraDeCifras>
      <ul className="mt-4 divide-y divide-hairline text-sm">
        {general.inst.cargos.slice(0, 6).map(([cargo, n, , mediana]) => (
          <li key={cargo} className="flex items-baseline justify-between gap-3 py-2">
            <span className="min-w-0">{desdeMayusculas(cargo)}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-ink-soft">
              {formatInt(n)} {n === 1 ? "plaza" : "plazas"} · mediana {formatDOP(mediana)}
            </span>
          </li>
        ))}
      </ul>
      <Button asChild variant="secondary" className="mt-4">
        <Link href={`/nomina/general?inst=${claveInstitucion(general.inst.nombre)}`}>
          Ver sus {formatInt(general.inst.cargos.length)} cargos
        </Link>
      </Button>
    </Card>
  );
}

/** «Lo que decreta el Ejecutivo»: las normas que la Consultoría etiqueta con su nombre. */
function LoQueDecreta({ docs }: { docs: Norma[] }) {
  return (
    <Card as="section" id="decretos">
      <div className="p-5 pb-3 sm:p-6 sm:pb-3">
        <CardTitle>Lo que decreta el Ejecutivo</CardTitle>
        {docs.length === 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            No encontramos normas de los últimos cuatro años con una etiqueta de la
            Consultoría Jurídica que coincida con este nombre. El cruce es por
            nombre: si la Consultoría escribe la institución de otra forma, aquí
            no aparece.
          </p>
        ) : (
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            {formatInt(docs.length)} normas que la Consultoría Jurídica
            etiqueta con esta institución, de las más recientes a las más antiguas
            {docs.length > NORMAS_MAX ? `; se muestran las ${NORMAS_MAX} más recientes` : ""}.
          </p>
        )}
      </div>
      {docs.length > 0 && <ListaNormas docs={docs.slice(0, NORMAS_MAX)} />}
    </Card>
  );
}

type Norma = Awaited<ReturnType<typeof normasDeInstitucion>>["docs"][number];

/**
 * Las normas de la institución: las dos más recientes a la vista y el resto
 * a un toque. Diez en bruto eran 2.200 px en el teléfono entre las compras y
 * el plan anual, y las demás no se podían ver de ninguna forma.
 */
function ListaNormas({ docs }: { docs: Norma[] }) {
  const lista = (filas: Norma[]) => (
    <ul className="divide-y divide-hairline px-5 sm:px-6">
      {filas.map((d) => (
        <FilaNorma key={`${d.tipo}-${d.numero}-${d.fechaIso ?? ""}`} d={d} />
      ))}
    </ul>
  );
  const vista = docs.slice(0, NORMAS_A_LA_VISTA);
  const resto = docs.slice(NORMAS_A_LA_VISTA);
  if (resto.length === 0) return <div className="pb-2">{lista(vista)}</div>;
  return (
    <Plegable resumen={lista(vista)} etiqueta={`Ver las otras ${formatInt(resto.length)} normas`}>
      {lista(resto)}
    </Plegable>
  );
}

function FilaNorma({ d }: { d: Norma }) {
  const ruta = RUTA_POR_TIPO[d.tipo];
  const href = (ruta && enlace.norma(ruta, d.numero)) || d.url;
  const cuerpo = (
    <>
      <span className="font-mono text-xs font-semibold tabular-nums text-brand-700">
        {d.tipo} {d.numero}
      </span>
      {d.fechaIso && <span className="ml-2 text-xs text-ink-soft">{formatFecha(d.fechaIso)}</span>}
      <span className="mt-0.5 block text-sm leading-snug text-ink group-hover:text-brand-700">
        {desdeMayusculas(d.titulo)}
      </span>
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="group block py-2.5">
          {cuerpo}
        </Link>
      ) : (
        <div className="py-2.5">{cuerpo}</div>
      )}
    </li>
  );
}

function Cargando({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <Card as="section" className="p-5 sm:p-6" role="status" aria-busy="true">
      <CardTitle>{titulo}</CardTitle>
      <p className="mt-1 text-xs text-ink-soft">{texto}</p>
      <EsqueletoFilas n={4} className="mt-3" />
    </Card>
  );
}

function Presupuesto({
  datos,
  institucion,
  hermanas,
}: {
  datos: NonNullable<Awaited<ReturnType<typeof getInstitucionFiscal>>>;
  institucion: Institucion;
  hermanas: Institucion[];
}) {
  const { institucion: c, fiscal } = datos;
  const ejecutado = c.ejecucion ?? 0;
  const cambio = c.vigente - c.inicial;
  const corte = etiquetaCorte(fiscal.mesCorte, fiscal.anio);
  return (
    <Card as="section" className="p-5 sm:p-6">
      <CardTitle>Presupuesto {fiscal.anio}</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        {hermanas.length > 0 ? (
          <>
            Es el presupuesto del capítulo{" "}
            <span className="font-medium text-ink">{c.nombreLegible}</span>, que
            agrupa a {institucion.acronimo || "esta institución"} y a{" "}
            {hermanas.length === 1 ? "otra unidad de compra" : `otras ${hermanas.length} unidades de compra`}.
          </>
        ) : (
          <>Capítulo {c.codigo} del Presupuesto General del Estado.</>
        )}{" "}
        Con corte a {etiquetaCorte(fiscal.mesCorte, fiscal.anio)}.
      </p>
      <TiraDeCifras className="mt-4">
        <Cifra etiqueta="Vigente" valor={formatPesos(c.vigente)} ancla={{ alcance: "instantanea", periodo: corte }} />
        <Cifra etiqueta="Devengado" valor={formatPesos(c.devengado)} ancla={{ alcance: "instantanea", periodo: corte }} />
        <Cifra etiqueta="Pagado" valor={formatPesos(c.pagado)} ancla={{ alcance: "instantanea", periodo: corte }} />
        <Cifra etiqueta="Ejecutado" valor={c.ejecucion === null ? SIN_DATO : `${(ejecutado * 100).toFixed(1)} %`} nota="Devengado sobre vigente" />
      </TiraDeCifras>
      <Progress
        value={Math.min(100, ejecutado * 100)}
        aria-label={`Ejecutado ${(ejecutado * 100).toFixed(1)} % del presupuesto vigente`}
        className="mt-4"
      />
      <p className="mt-3 text-xs leading-relaxed text-ink-soft">
        {Math.abs(cambio) < 1
          ? "Su presupuesto no se ha modificado en el año."
          : `En el año le ${cambio > 0 ? "añadieron" : "recortaron"} ${formatMonto(Math.abs(cambio), "DOP")}.`}{" "}
        {c.devengado - c.pagado > 0 &&
          `Debe ${formatMonto(c.devengado - c.pagado, "DOP")} ya causados que aún no ha pagado.`}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="secondary">
          <Link href={enlace.capitulo(c.codigo)}>Ver su ejecución mes a mes</Link>
        </Button>
      </div>
      {hermanas.length > 0 && (
        <Plegable
          className="-mx-5 mt-4 sm:-mx-6"
          etiqueta={`Ver las otras ${hermanas.length} unidades de compra del capítulo`}
        >
          <ul className="grid gap-1 px-5 py-3 sm:grid-cols-2 sm:px-6">
            {hermanas.map((h) => (
              <li key={h.id}>
                <Link
                  href={hrefInstitucion(h)}
                  className="flex min-h-11 items-center text-sm leading-snug text-ink hover:text-brand-700 sm:min-h-9"
                >
                  {h.nombre}
                </Link>
              </li>
            ))}
          </ul>
        </Plegable>
      )}
    </Card>
  );
}

async function Compras({ institucion: i }: { institucion: Institucion }) {
  const compras = await getComprasDeInstitucion(i.id);
  if (!compras) {
    return (
      <EstadoVacio
        variante="caida"
        rotulo="Compras"
        titulo="La DGCP no respondió"
        accion={
          <Button asChild variant="secondary">
            <Link href={`/licitaciones?uc=${i.id}`}>Buscar sus procesos</Link>
          </Button>
        }
      >
        La API de datos abiertos de Contrataciones Públicas no contestó. No es que
        no compre: es que no pudimos mirar. Vuelve a intentarlo en unos minutos.
      </EstadoVacio>
    );
  }
  const maxProv = Math.max(1, ...compras.proveedores.map((p) => p.monto));

  return (
    <Card as="section" className="p-5 sm:p-6">
      <CardTitle>Compras</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        {formatInt(compras.totalContratos)} contratos en todo el registro de la DGCP.
        {compras.leidos > 0 &&
          ` Las cifras de abajo salen de los ${formatInt(compras.leidos)} más recientes${
            compras.desde ? `, del ${formatFecha(compras.desde)} al ${formatFecha(compras.hasta ?? undefined)}` : ""
          }.`}
      </p>

      {compras.proveedores.length > 0 && (
        <>
          <TiraDeCifras className="mt-4 lg:grid-cols-2">
            <Cifra
              etiqueta="Contratado en pesos"
              valor={formatPesos(compras.montoDop)}
              ancla={{ alcance: "muestra", escaneados: compras.leidos, universo: compras.totalContratos }}
            />
            <Cifra
              etiqueta="Se lleva el primer proveedor"
              valor={compras.concentracion === null ? SIN_DATO : `${(compras.concentracion * 100).toFixed(1)} %`}
              nota={`Del monto en pesos de esos ${formatInt(compras.leidos)} contratos`}
            />
          </TiraDeCifras>
          <h3 className="mt-5 text-sm font-semibold">A quién le compra</h3>
          <BarrasHorizontales
            className="mt-2"
            maximo={maxProv}
            lineas={2}
            etiqueta="Proveedores por monto contratado"
            barras={compras.proveedores.map((p) => ({
              clave: p.rpe || p.nombre,
              etiqueta: p.nombre,
              titulo: `${p.nombre}: ${formatPesos(p.monto)} en ${p.n} contratos`,
              valor: p.monto,
              // La cuenta iba pegada al monto sin unidad («· 3»): ahora se dice debajo.
              cifra: formatPesos(p.monto),
              detalle: `${formatInt(p.n)} ${p.n === 1 ? "contrato" : "contratos"}`,
              href: p.rpe ? enlace.proveedor(p.rpe) : undefined,
            }))}
          />
        </>
      )}

      {compras.senales && <Senales s={compras.senales} />}

      {compras.recientes.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold">Últimas adjudicaciones</h3>
          {/*
            Las dos últimas responden «¿qué acaba de comprar?»; las otras seis
            quedan a un toque. En bruto eran ocho filas de dos renglones en
            medio de una ficha que ya medía ocho pantallas en el teléfono.
          */}
          {compras.recientes.length > ADJUDICACIONES_A_LA_VISTA ? (
            <Plegable
              className="-mx-5 mt-2 sm:-mx-6"
              resumen={<ListaAdjudicaciones contratos={compras.recientes.slice(0, ADJUDICACIONES_A_LA_VISTA)} />}
              etiqueta={`Ver las otras ${formatInt(compras.recientes.length - ADJUDICACIONES_A_LA_VISTA)} adjudicaciones recientes`}
            >
              <ListaAdjudicaciones contratos={compras.recientes.slice(ADJUDICACIONES_A_LA_VISTA)} />
            </Plegable>
          ) : (
            <div className="-mx-5 mt-2 sm:-mx-6">
              <ListaAdjudicaciones contratos={compras.recientes} />
            </div>
          )}
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="secondary">
          <Link href={`/licitaciones?uc=${i.id}`}>Todos sus procesos</Link>
        </Button>
      </div>
    </Card>
  );
}

type Adjudicacion = NonNullable<Awaited<ReturnType<typeof getComprasDeInstitucion>>>["recientes"][number];

function ListaAdjudicaciones({ contratos }: { contratos: Adjudicacion[] }) {
  return (
    <ul className="divide-y divide-hairline px-5 sm:px-6">
      {contratos.map((c) => (
        <li key={c.codigo_contrato} className="py-2.5 text-sm">
          <Link href={enlace.proceso(c.codigo_proceso)} className="group block">
            <span className="line-clamp-2 leading-snug group-hover:text-brand-700">
              {c.descripcion || c.codigo_proceso}
            </span>
            <span className="mt-0.5 block text-xs text-ink-soft">
              {c.razon_social} · <span className="font-mono tabular-nums">{formatMonto(c.valor_contratado, c.divisa)}</span> ·{" "}
              <Antiguedad iso={c.fecha_adjudicacion} prefijo="adjudicado" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Las señales dichas como frases, con su proporción. */
function Senales({ s }: { s: SenalesDeCompra }) {
  if (s.procesos === 0) {
    return (
      <p className="mt-5 text-sm text-ink-soft">
        No publicó procesos de compra en los últimos doce meses.
      </p>
    );
  }
  const pct = (n: number) => `${Math.round((n / s.procesos) * 100)} %`;
  const filas = [
    { n: s.excepcion, texto: "por excepción, sin concurso abierto" },
    { n: s.emergencia, texto: "declarados de emergencia o urgencia" },
    { n: s.proveedorUnico, texto: "a un proveedor único o exclusivo" },
    { n: s.noPlaneada, texto: "fuera de su plan anual de compras" },
    { n: s.desiertos, texto: "declarados desiertos" },
  ];
  return (
    <>
      <h3 className="mt-5 text-sm font-semibold">Cómo compra</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        {s.truncado
          ? `Publicó ${formatInt(s.universo)} procesos en los últimos doce meses; la DGCP entrega hasta mil por consulta, así que las proporciones de abajo son sobre los ${formatInt(s.procesos)} leídos, no sobre el año entero`
          : `De sus ${formatInt(s.procesos)} procesos publicados en los últimos doce meses`}
        {s.abiertos > 0 ? `; ${formatInt(s.abiertos)} siguen abiertos` : ""}. La ley
        permite cada una de estas vías; lo que se mira es cuánto pesan.
      </p>
      <ul className="mt-2 space-y-2 text-sm">
        {filas.map((f) => (
          <li key={f.texto}>
            <div className="flex items-baseline justify-between gap-2">
              <span>
                <span className="font-mono font-semibold tabular-nums">{formatInt(f.n)}</span> {f.texto}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-ink-soft">{pct(f.n)}</span>
            </div>
            <Progress
              value={(f.n / s.procesos) * 100}
              aria-label={`${f.n} procesos ${f.texto}, ${pct(f.n)}`}
              className="mt-1"
              indicadorClassName="bg-alerta-500"
            />
          </li>
        ))}
      </ul>
    </>
  );
}

async function Planes({ institucion: i }: { institucion: Institucion }) {
  const planes = await listPacc({ unidad_compra: i.id, limit: 50 });
  const porAnio = new Map<number, (typeof planes)[number]>();
  for (const p of planes) {
    const actual = porAnio.get(p.periodo);
    if (!actual || Number(p.version) > Number(actual.version)) porAnio.set(p.periodo, p);
  }
  const lista = [...porAnio.values()].sort((a, b) => b.periodo - a.periodo).slice(0, 4);
  return (
    <Card as="section" className="p-5 sm:p-6">
      <CardTitle>Plan anual de compras</CardTitle>
      {lista.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">
          No encontramos planes anuales (PACC) de esta unidad en la DGCP. Si la API
          no respondió, vuelve en unos minutos; si no, la unidad no ha publicado
          ninguno.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Lo que dijo que iba a comprar cada año. Cada revisión sube la versión:
            un plan con muchas versiones es un plan que se movió mucho.
          </p>
          <ul className="mt-3 divide-y divide-hairline">
            {lista.map((p) => (
              <li key={p.uid} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  <span className="font-mono font-semibold tabular-nums">{p.periodo}</span>
                  <span className="ml-2 text-xs text-ink-soft">
                    versión {p.version}
                    {p.fechaPublicacion ? ` · ${formatFecha(p.fechaPublicacion)}` : ""}
                  </span>
                </span>
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Abrir el plan ${p.periodo} en el Portal Transaccional (se abre en otra pestaña)`}
                    className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-brand-700 hover:underline sm:min-h-0"
                  >
                    Abrir
                    <IconExternal className="h-3.5 w-3.5" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
