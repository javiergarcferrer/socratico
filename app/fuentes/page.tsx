import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getCountIniciativas, getPeriodos } from "@/lib/congreso";
import { contarProveedoresRegistrados } from "@/lib/dgcp";
import { CUATRIENIOS, getCensoSenado } from "@/lib/senado";
import { getDeuda } from "@/lib/deuda";
import { consultarNormativa } from "@/lib/normativa";
import { formatFecha, formatMagnitud, SIN_DATO } from "@/lib/format";
import { etiquetaCorte, getResumenFiscal } from "@/lib/fiscal";
import { formatInt } from "@/lib/nomina";
import { getResumenNomina } from "@/lib/nomina-server";
import { FUENTES_DEL_CRUCE, INSTITUCIONES } from "@/lib/instituciones";
import { IconArrowLeft } from "@/components/icons";
import {
  ResumenBiblioteca,
  ResumenCatalogo,
  ResumenCombustibles,
  ResumenHistorico,
  ResumenObras,
  ResumenRnc,
  ResumenTasa,
} from "@/components/fuentes-nuevas/resumen-fuentes";

export const metadata: Metadata = {
  alternates: { canonical: "/fuentes" },
  title: "Fuentes",
  description:
    "Qué fuentes alimentan la plataforma, cuáles están bloqueadas y con qué límites de cobertura.",
};

export const revalidate = 3600;

export default async function FuentesPage() {
  const [censo, periodos, censoSenado, nomina, deuda, fiscal, proveedores, normativa] =
    await Promise.all([
      getCountIniciativas(),
      getPeriodos(),
      getCensoSenado(),
      getResumenNomina(),
      getDeuda(),
      getResumenFiscal(),
      contarProveedoresRegistrados(),
      consultarNormativa("3", new Date().getFullYear()),
    ]);
  const normativaInstantanea =
    normativa.origen !== null && normativa.origen !== "vivo" ? normativa.origen : null;

  // El universo de instituciones y de dónde sale (scripts/build-instituciones.py).
  const cruce = FUENTES_DEL_CRUCE;
  const cuadros = Object.values(cruce.transferencias).sort((a, b) => a.anio - b.anio);
  const sinUnidad = INSTITUCIONES.filter((i) => !i.dgcp);
  const sinCapituloVigente = INSTITUCIONES.filter((i) => i.dgcp && !i.clasificador).length;
  const conNomina = INSTITUCIONES.filter((i) => i.nomina).length;

  return (
    <div className="mx-auto max-w-3xl">
      {/*
        La vuelta al panorama medía 76 × 16 px. Con la primitiva toma 44 px de
        alto en teléfono y los márgenes negativos dejan el texto en su sitio.
      */}
      <Button asChild variant="ghost" className="-mx-2 -my-2 px-2 text-xs font-medium text-ink-soft">
        <Link href="/">
          <IconArrowLeft className="h-3.5 w-3.5" />
          Inicio
        </Link>
      </Button>

      <header className="mb-6 mt-3">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          ¿De dónde sale cada dato?
        </h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft sm:text-sm">
          Qué alimenta esta plataforma, qué no, y por qué. Sin maquillarlo: una
          herramienta de inteligencia que oculta sus huecos de cobertura no sirve
          para decidir.
        </p>
      </header>

      <div className="space-y-4">
        <Fuente nombre="DGCP · Compras públicas" estado="activa" etiqueta="Conectada">
          <p>
            API de datos abiertos de la Dirección General de Contrataciones
            Públicas. Alimenta el buscador de licitaciones, los precios históricos
            de adjudicación y el panel de mercado.
          </p>
          <p className="mt-3">
            El buscador filtra por <strong>etapa</strong> (abiertos a ofertar,
            ya cerrada la recepción, en evaluación, adjudicados, desiertos o
            cancelados) y no solo por lo que está abierto. Dos límites que
            conviene tener presentes: el rango de fechas corre sobre la
            <strong> fecha de publicación</strong>, no la de cierre, así que un
            proceso que acaba de cerrar puede haberse publicado mucho antes; y
            cuando hay que filtrar por etapa, buscar por texto u ordenar por
            algo que no sea «más recientes», la respuesta se arma recorriendo
            hasta 6,000 registros del rango pedido. Son los{" "}
            <strong>primeros</strong> 6,000 en el orden en que los sirve el
            origen, así que en una ventana amplia el recorte no solo trunca:
            sesga hacia lo más reciente, y por tanto cuenta de menos lo ya
            cerrado. Ese conteo es <strong>una muestra</strong>, y el buscador
            lo dice junto al número en vez de presentarlo como el censo.
          </p>
          <p className="mt-3">
            Los pliegos y actas de cada proceso son públicos, pero
            comprasdominicana los manda como descarga forzada y prohíbe
            incrustarlos: bajar un archivo para saber qué dice no es acceso a la
            información, así que la plataforma los vuelve a servir para lectura
            (los mismos bytes, sin editar) y los enlaces de abrir y descargar
            siguen apuntando al original.
          </p>
          <p className="mt-3">
            De la misma API se leen otras cuatro cosas que antes no
            aprovechábamos: las <strong>ofertas</strong> de cada proceso (quién
            compitió, no solo quién ganó), el <strong>registro de
            proveedores</strong> (con el RNC, la forma jurídica y la fecha
            de constitución de cada empresa), el <strong>catálogo UNSPSC</strong>{" "}
            y los <strong>planes anuales de compra</strong> de cada institución.
          </p>
          <p className="mt-3">
            El registro de proveedores tiene su propio índice en{" "}
            <Link
              href="/proveedores"
              className="font-medium text-brand-700 hover:underline"
            >
              ¿Quién le vende al Estado?
            </Link>
            , con dos caminos que no son equivalentes y que la página distingue:
            por <strong>RNC, cédula o número de RPE</strong> se consulta el
            registro completo
            {proveedores !== null && <> ({formatInt(proveedores)} inscritos)</>},
            mientras que{" "}
            <strong>por nombre</strong> se busca entre todos los que han
            contratado desde 2015 (la instantánea de compras) y entre quienes
            ganaron algo el último mes; un inscrito que nunca contrató solo se
            encuentra por su número, porque el registro no admite búsqueda por
            razón social.
          </p>
          <p className="mt-3 text-[13px] text-ink-soft sm:text-xs">
            Las búsquedas por texto escanean hasta 6 páginas de 1,000 registros
            dentro del rango de fechas; cuando el barrido no cubre todo, la
            interfaz lo advierte en vez de fingir un resultado completo. Cuatro
            límites del origen que la interfaz declara donde tocan: el estado de
            evaluación de las ofertas llega casi siempre vacío (quién ganó lo
            dicen los contratos); el filtro de período de los planes no
            funciona, así que el año se filtra aquí; el registro de contratos no
            admite filtro por fecha, así que los rankings describen una ventana
            reciente y no todo el histórico; y el registro de proveedores no se
            puede buscar por razón social ni recorrer entero (hay páginas que
            devuelven error de forma permanente), por lo que la búsqueda por
            nombre se hace sobre esa misma ventana y lo dice junto al resultado.
            Del registro de proveedores omitimos además a propósito teléfonos y
            correos: esto vigila al Estado, no es un directorio comercial.
          </p>
          <p className="mt-3 text-[13px] text-ink-soft sm:text-xs">
            La vista por{" "}
            <Link href="/provincias" className="font-medium text-brand-700 hover:underline">
              provincia
            </Link>{" "}
            tampoco es el padrón: el filtro de provincia del registro devuelve
            error con cualquier valor, así que se consulta la ficha de los 200
            proveedores que más adjudicaron en esa misma ventana y se agrupan por
            la provincia que declaran. Las descargas CSV de licitaciones y
            contratos traen lo que la página leyó (el barrido de hasta 6,000
            registros, la muestra de contratos) y lo dicen en el nombre del
            archivo.
          </p>
        </Fuente>

        <Fuente
          nombre="SIGEF · Ejecución del presupuesto"
          estado={fiscal !== null ? "activa" : "caida"}
          etiqueta={fiscal !== null ? "Instantánea local" : "No disponible"}
        >
          <p>
            API de datos abiertos del Ministerio de Hacienda: el presupuesto
            vigente, comprometido, devengado y pagado de cada institución del
            Presupuesto General del Estado, mes a mes. Es la fuente de la
            vertical de <Link href="/finanzas" className="font-medium text-brand-700 hover:underline">finanzas públicas</Link>.
          </p>
          {fiscal && (
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              <Metrica etiqueta="Instituciones" valor={formatInt(fiscal.instituciones)} />
              <Metrica
                etiqueta="Corte"
                valor={etiquetaCorte(fiscal.mesCorte, fiscal.anio)}
              />
              <Metrica
                etiqueta="Ejecutado"
                valor={
                  fiscal.ejecucion === null
                    ? SIN_DATO
                    : `${(fiscal.ejecucion * 100).toFixed(1)} %`
                }
              />
            </dl>
          )}
          <p className="mt-4 text-[13px] text-ink-soft sm:text-xs">
            Por qué es una instantánea y no lectura en vivo: el origen calcula el
            año en curso al vuelo y tarda entre 20 y 97 segundos por consulta, más
            de lo que puede esperar una página. Se consolidan las tres secciones
            institucionales con{" "}
            <code className="rounded bg-canvas px-1 py-0.5 font-mono">
              scripts/build-fiscal.py
            </code>{" "}
            y se sirven al instante; la fecha de corte va siempre a la vista.
            Cubre el Presupuesto General del Estado: no incluye ayuntamientos ni
            empresas públicas financieras.
          </p>
          <p className="mt-3 text-[13px] text-ink-soft sm:text-xs">
            El 29 de septiembre de 2026 la API respondió 403 de Cloudflare desde el
            entorno donde se construye la plataforma, hasta en su robots.txt: ese día
            la instantánea no se pudo renovar y se sirve la anterior, con su corte.
            No se rodea: la vía es institucional.
          </p>
        </Fuente>

        <Fuente
          nombre="SIL · Cámara de Diputados"
          estado={censo !== null ? "activa" : "caida"}
          etiqueta={censo !== null ? "Conectada" : "Sin respuesta"}
        >
          <p>
            API JSON interna del portal SIL Ciudadano, abierta y sin
            autenticación. Alimenta iniciativas, trámites, proponentes, la alerta
            de perención, el directorio de legisladores (los 221 que lista el
            período, por demarcación) y las votaciones nominales del pleno.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            <Metrica
              etiqueta="Iniciativas"
              valor={censo !== null ? formatInt(censo) : SIN_DATO}
            />
            <Metrica etiqueta="Por página" valor="10 (fijo)" />
            <Metrica
              etiqueta="Períodos"
              valor={periodos.length > 0 ? periodos.map((p) => p.description).join(", ") : SIN_DATO}
            />
          </dl>
          <p className="mt-4 text-[13px] text-ink-soft sm:text-xs">
            No es una API pública documentada: es un contrato interno que puede
            cambiar sin aviso. Toda la lectura es GET y valida{" "}
            <code className="rounded bg-canvas px-1 py-0.5 font-mono">content-type</code>,
            porque el catch-all de la SPA devuelve HTML con estado 200 en rutas
            inexistentes.
          </p>
          <p className="mt-2 text-[13px] text-ink-soft sm:text-xs">
            Filtros del listado: el SIL filtra en origen por tema (sus 15 grupos)
            y, solo dentro de un tema, por tipo (proyectos de ley o resoluciones)
            y por perimidas. No filtra un tipo en todos los temas a la vez, y por
            eso la vista no lo ofrece.
          </p>
          <p className="mt-2 text-[13px] text-ink-soft sm:text-xs">
            Para el buscador de toda la plataforma, los legisladores y las
            iniciativas de los dos períodos que el SIL expone (2020–2024 y
            2024–2028) se guardan en una instantánea (
            <code className="rounded bg-canvas px-1 py-0.5 font-mono">scripts/build-congreso.py</code>
            ): título, expediente, tipo, estado y fecha de depósito. Lo depositado
            después se busca en vivo en{" "}
            <Link href="/congreso" className="font-medium text-brand-700 hover:underline">
              Congreso
            </Link>
            .
          </p>
        </Fuente>

        <Fuente
          nombre="Nóminas de transparencia (consolidadas)"
          estado={nomina !== null ? "activa" : "caida"}
          etiqueta={nomina !== null ? "Instantánea local" : "No disponible"}
        >
          <p>
            Cada institución publica su nómina bajo la Ley 200-04 en formatos que
            solo coinciden en el concepto. Esta plataforma consolida las que están
            en formato procesable en una <strong>foto transversal</strong>: el
            último mes publicado por cada institución, sin nombres ni datos
            personales (cada fila es una plaza con su sueldo bruto).
          </p>
          {nomina && (
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              <Metrica etiqueta="Instituciones" valor={formatInt(nomina.instituciones)} />
              <Metrica etiqueta="Plazas" valor={formatInt(nomina.plazas)} />
              <Metrica etiqueta="Foto más reciente" valor={nomina.periodoReciente} />
            </dl>
          )}
          <p className="mt-4 text-[13px] text-ink-soft sm:text-xs">
            Cobertura parcial declarada: es lo publicado en CSV procesable, no
            todo el Estado. De los 169 conjuntos de nómina que indexa
            datos.gob.do se leyeron todas las fichas; entran los que pasan los
            controles del script fila a fila. Quedan fuera, en vez de entrar mal:
            los que cambiaron columnas sin cambiar la cabecera (INDOTEL, CNC,
            APORDOM…), los que no traen puesto (Catastro, ProDominicana, Trabajo),
            los que solo publican el sueldo neto (INDRHI, FARD), los agregados por
            rango en vez de una fila por plaza (Policía Nacional, CESFRONT), los
            desactualizados de antes de 2025 y los que no se pudieron bajar
            (Migración y el Ayuntamiento de Santiago con 403, INAZUCAR, varios
            ayuntamientos con 503). Educación y el Servicio Nacional de Salud no
            publican su nómina en formato procesable por su cuenta; sí aparecen en
            la nómina general del MAP, que se integrará cuando el explorador la
            pueda cargar sin descargar decenas de megabytes. Por lo mismo sale el
            Instituto Cartográfico Militar, que escribe unos sueldos sin el punto
            decimal. De la Cancillería solo entran las plazas pagadas en pesos:
            el personal en el exterior cobra en dólares y no se mezclan monedas. La nómina estatal completa (con nombres) vive en el
            tablero oficial del{" "}
            <a
              href="https://transparencia.gob.do/2025/12/17/nomina/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-700 hover:underline"
            >
              Portal Único de Transparencia
            </a>
            , un Power BI sin API pública utilizable. Fuente fija: se actualiza al
            regenerar el archivo (fuentes y método en{" "}
            <code className="rounded bg-canvas px-1 py-0.5 font-mono">
              scripts/build-nomina.py
            </code>
            ).
          </p>
        </Fuente>

        <Fuente
          nombre="Consultoría Jurídica · normativa del Ejecutivo"
          estado={normativa.origen === null ? "caida" : "activa"}
          etiqueta={
            normativa.origen === null
              ? "Sin respuesta"
              : normativaInstantanea
                ? "Instantánea"
                : "Conectada"
          }
        >
          <p>
            Consulta pública de la Consultoría Jurídica del Poder Ejecutivo:
            leyes, decretos, reglamentos y resoluciones desde 1926, por su
            buscador JSON, y la Gaceta Oficial desde 2020, por su repositorio de
            documentos. Alimenta la vertical de{" "}
            <Link href="/normativa" className="font-medium text-brand-700 hover:underline">
              normativa
            </Link>
            , donde se ve el conteo por año. La búsqueda de esa vertical mira el
            número y el título, no el texto de la norma; las designaciones del mes
            se derivan de la etiqueta «Cámara de Cuentas» que la Consultoría pone
            a los decretos de nombramiento y de su título. La materia de cada
            decreto (pensiones, expropiaciones, compras de emergencia…) tampoco
            es un campo del origen: se lee con reglas fijas del título y de esa
            etiqueta, y lo que ninguna reconoce queda en «Otros asuntos».
          </p>
          {normativaInstantanea && (
            <p className="mt-3">
              Desde septiembre de 2026 el portal nuevo pasa por un desafío de
              Cloudflare que rechaza las consultas desde los servidores de la
              plataforma. No se rodea: la vertical sirve la instantánea del{" "}
              {formatFecha(normativaInstantanea)}, generada desde una red que el
              origen acepta, hasta que la Consultoría admita el acceso
              automatizado identificado.
            </p>
          )}
          <p className="mt-3">
            Aparte, el histórico completo de leyes (unas 12,100 desde 1844, en una
            sola consulta del mismo buscador JSON,{" "}
            <code className="rounded bg-canvas px-1 py-0.5 font-mono">scripts/build-leyes.py</code>
            ) alimenta el buscador de toda la plataforma y la ficha de una ley más
            vieja que la instantánea reciente, que entonces dice de qué
            instantánea salió. Solo las leyes con número y año tienen ficha
            propia; las anteriores, o las que el origen numera igual siendo
            distintas, abren su PDF en el sitio de la Consultoría.
          </p>
          <p className="mt-3">
            Sus PDF traen capa de texto (no son escaneos) y cada norma tiene su
            ficha, que es también la vía al articulado de las piezas del
            Congreso ya promulgadas. El visor siempre ofrece abrir el PDF en el
            sitio oficial, que es la vía mientras el desafío impida traerlo.
          </p>
          <p className="mt-4 text-[13px] text-ink-soft sm:text-xs">
            Toda la lectura es de consulta y se acota por año o por número: el
            origen no pagina y devuelve cada año entero de una vez.
          </p>
        </Fuente>

        <Fuente nombre="Cruce de instituciones" estado="activa" etiqueta="Versionado">
          <p>
            No es una fuente nueva sino el puente entre las demás: el catálogo de
            unidades de compra de la DGCP ({formatInt(cruce.dgcp.unidades)} activas) trae el capítulo
            presupuestario de cada una, y con él se ata al SIGEF sin emparejar
            nombres; el Clasificador Institucional de DIGEPRES le da a cada una su
            sector y suma las {formatInt(sinUnidad.length)} entidades que no tienen unidad de compra. La nómina se ata a mano donde la correspondencia es
            inequívoca ({formatInt(conNomina)}
            {nomina ? ` de ${formatInt(nomina.instituciones)}` : ""} instituciones: el Consejo del Café, el Registro
            Inmobiliario y EGAEE no tienen ficha propia; el Poder Judicial se ata a la
            suya, que viene del clasificador) y los decretos por la etiqueta de
            institución de la Consultoría Jurídica. Alimenta las{" "}
            <Link href="/instituciones" className="font-medium text-brand-700 hover:underline">
              fichas de institución
            </Link>{" "}
            y el buscador de toda la plataforma.
          </p>
          <p className="mt-4 text-[13px] text-ink-soft sm:text-xs">
            Es un archivo del repositorio, no una base de datos: se regenera con{" "}
            <code className="rounded bg-canvas px-1 py-0.5 font-mono">
              scripts/build-instituciones.py
            </code>
            . La etiqueta «Cámara de Cuentas» de la Consultoría se excluye del cruce
            porque marca nombramientos, no a la Cámara.
          </p>
        </Fuente>

        <Fuente nombre="DIGEPRES · Clasificador Institucional y transferencias" estado="activa" etiqueta="Instantánea local">
          <p>
            El{" "}
            <a href={cruce.clasificador.url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
              Clasificador Institucional
            </a>{" "}
            de la Dirección General de Presupuesto es la lista maestra de las
            entidades del presupuesto, del Senado a cada junta de distrito municipal,
            con su sector. Da a cada{" "}
            <Link href="/instituciones" className="font-medium text-brand-700 hover:underline">
              ficha de institución
            </Link>{" "}
            su sector y abre una para cada entidad que no tiene unidad de compra en
            la DGCP: el Congreso, el Poder Judicial, el Banco Central y la mayoría de
            las juntas de distrito. Del mismo portal se lee el cuadro «Clasificación
            institucional según entidad receptora» de{" "}
            {cuadros.map((c, n) => (
              <span key={c.anio}>
                {n > 0 ? " y del " : "la "}
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
                  {c.tipo === "ley" ? `Ley de Presupuesto ${c.anio}` : `proyecto de ${c.anio}`}
                </a>
              </span>
            ))}
            : lo que el Gobierno central presupuesta transferir a cada una.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            <Metrica etiqueta="Entidades" valor={formatInt(cruce.clasificador.capitulos)} />
            <Metrica etiqueta="Actualizado al" valor={formatFecha(cruce.clasificador.actualizado)} />
            <Metrica etiqueta="Sin unidad de compra" valor={formatInt(sinUnidad.length)} />
          </dl>
          <p className="mt-4 text-[13px] text-ink-soft sm:text-xs">
            El clasificador es un PDF que DIGEPRES actualiza a principios de año y
            que se lee al construir la plataforma con{" "}
            <code className="rounded bg-canvas px-1 py-0.5 font-mono">scripts/build-instituciones.py</code>
            ; se consultó el {formatFecha(cruce.clasificador.consultado)}. Cuando la
            DGCP deja una unidad de compra en un capítulo que el clasificador ya
            retiró (la extinta CDEEE, el antiguo Ministerio de Economía, las
            superintendencias de Bancos y de Valores), una tabla del script la lleva
            al vigente; {formatInt(sinCapituloVigente)} no tienen capítulo vigente
            (fideicomisos, la Empresa Minera, el Consejo de Población) y toman el
            sector de la familia de su código. La transferencia es lo presupuestado,
            no lo ejecutado, y solo se atribuye cuando el capítulo es de una sola
            institución: la del Servicio Nacional de Salud no se reparte entre sus
            hospitales. El cuadro de 2026 se publica con la Ley de Presupuesto, pero
            su título conserva «Proyecto de Ley de Presupuesto 2026».
          </p>
        </Fuente>

        <Fuente
          nombre="Crédito Público · deuda del SPNF"
          estado={deuda !== null ? "activa" : "caida"}
          etiqueta={
            deuda === null
              ? "Sin respuesta"
              : deuda.desdeInstantanea
                ? "Instantánea"
                : "Conectada"
          }
        >
          <p>
            Dirección General de Crédito Público del Ministerio de Hacienda.
            Publica la evolución del saldo de la deuda del Sector Público No
            Financiero como archivos XLSX mensuales con URL predecible; la
            plataforma intenta la lectura en vivo y, como el servidor del origen
            no acepta conexiones desde la nube, sirve la última instantánea
            verificada declarando su fecha.
          </p>
          {deuda && (
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              <Metrica
                etiqueta="Deuda total"
                valor={formatMagnitud(deuda.saldoTotal)}
              />
              <Metrica etiqueta="Saldo a" valor={deuda.periodo} />
              <Metrica
                etiqueta={deuda.desdeInstantanea ? "Instantánea del" : "Formato"}
                valor={deuda.desdeInstantanea ? formatFecha(deuda.generadoEn) : "XLSX mensual"}
              />
            </dl>
          )}
          <p className="mt-4 text-[13px] text-ink-soft sm:text-xs">
            Sin clave ni WAF. El saldo viene en millones de dólares; la
            plataforma lo lee de la fila «Deuda Pública Total del SPNF» de la
            hoja de saldo-evolución, en la columna del saldo de cierre. La
            serie de{" "}
            <Link href="/deuda" className="font-medium text-brand-700 hover:underline">
              /deuda
            </Link>{" "}
            es lo que el origen conserva publicado: el cierre de cada año desde
            2000, con su peso en el PIB, y cada trimestre desde 2015. Los meses
            intermedios de años pasados ya no están en su servidor.
          </p>
        </Fuente>

        <Fuente
          nombre="Servidor de documentos de Diputados"
          estado="bloqueada"
          etiqueta="Inalcanzable"
        >
          <p>
            Los textos de los proyectos son PDF y están versionados por etapa
            (depósito, modificaciones sucesivas, texto aprobado), que es
            exactamente lo que necesita una comparación entre lecturas.
          </p>
          <p className="mt-3">
            Pero viven en un servidor on-premise en RD que rechaza la conexión en
            el handshake TLS desde fuera del país. Los enlaces «Abrir» de cada
            ficha apuntan al origen real y funcionan desde una red dominicana; la
            extracción automática de texto sigue bloqueada. El Senado sí sirve
            los suyos por internet abierto, y por eso sus fichas traen el
            documento incrustado y las de Diputados no.
          </p>
        </Fuente>

        <Fuente
          nombre="SIL · Senado"
          estado={censoSenado !== null ? "activa" : "caida"}
          etiqueta={censoSenado !== null ? "Conectada" : "Sin respuesta"}
        >
          <p>
            El sistema de consulta pública de expedientes que la propia web del
            Senado enlaza («consultante»), con seis colecciones por cuatrienio
            desde 2002. Alimenta el listado, la búsqueda y las fichas del
            Senado: estado procesal, historial de trámites, proponentes,
            promulgación, el número del expediente gemelo en Diputados y, por
            su documentación asociada, el PDF del proyecto tal como se
            depositó.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            <Metrica
              etiqueta="Expedientes (2024–2028)"
              valor={censoSenado !== null ? formatInt(censoSenado) : SIN_DATO}
            />
            <Metrica etiqueta="Colecciones" valor={String(CUATRIENIOS.length)} />
            <Metrica
              etiqueta="Cobertura"
              valor={`${CUATRIENIOS[CUATRIENIOS.length - 1].etiqueta.slice(0, 4)}–hoy`}
            />
          </dl>
          <p className="mt-4 text-[13px] text-ink-soft sm:text-xs">
            Los textos que publica son escaneos: PDF de imágenes, sin capa de
            texto, así que se pueden leer y descargar pero no buscar por
            palabra. Su búsqueda es literal y distingue tildes, muestra 50 filas por consulta y cada
            colección exige su propia sesión. Si una búsqueda tecleada sin tildes
            no trae nada, se prueban a lo sumo tres formas con tilde de su palabra
            más larga, una detrás de otra, y se para en la primera que traiga algo. Se lee con caché larga y volumen
            mínimo: el <code className="rounded bg-canvas px-1 py-0.5 font-mono">robots.txt</code>{" "}
            de la web del Senado sigue vetando rastreadores de IA y limitando el
            ritmo del resto, así que esta plataforma no rastrea esa web: lee el
            consultante, que no declara restricciones, muy por debajo de ese
            techo.
          </p>
        </Fuente>

        <Fuente nombre="MapaInversiones · obra pública" estado="activa" etiqueta="Instantánea local">
          <p>
            Los datos abiertos de MapaInversiones (Ministerio de Hacienda y
            Economía, sobre el Banco de Proyectos del SNIP y la DGCP) alimentan{" "}
            <Link href="/obras" className="font-medium text-brand-700 hover:underline">
              ¿Existe la obra y avanza?
            </Link>
            : los proyectos de inversión que publica en ejecución, paralizados, en
            reevaluación o por reprogramar (las obras terminadas no están en estos
            datos), con su estado, valor, avance, provincia y los procesos y
            contratos de compras que los ejecutan. Son cuatro CSV
            descargables sin clave (unos 21 MB) que se consolidan al construir, no
            en cada visita. <ResumenObras />
          </p>
          <p className="mt-3 text-[13px] text-ink-soft sm:text-xs">
            Límites que la interfaz dice donde tocan: la fuente publica el mismo
            número como avance físico y como financiero en todas las obras, así que
            se muestra uno solo, «avance declarado», que reporta la propia
            institución y no es una inspección. De cada obra se guardan los 12
            contratos y procesos de mayor monto, con el total de todos. La
            institución ejecutora se une a su ficha por nombre, y la que no casa se
            queda sin enlace. Un proceso puede tener un SNIP en la DGCP y otro en
            MapaInversiones: se muestran los dos, cada uno con su origen.
            Regenerar con{" "}
            <code className="rounded bg-canvas px-1 py-0.5 font-mono">scripts/build-obras.py</code>.
          </p>
        </Fuente>

        <Fuente nombre="DGII · padrón de contribuyentes (RNC)" estado="activa" etiqueta="Instantánea local">
          <p>
            La consulta web de RNC de la DGII rechaza a los programas, pero la DGII
            publica el padrón completo como un ZIP descargable. Se cruza al
            construir con el Registro de Proveedores del Estado (que la DGCP también
            ofrece como archivo) y la ficha de cada proveedor muestra su actividad
            económica declarada, su estado ante la DGII, su régimen y la fecha en que
            inició operaciones, con la distancia hasta su primer contrato. <ResumenRnc />
          </p>
          <p className="mt-3 text-[13px] text-ink-soft sm:text-xs">
            Solo se cruzan los RNC de 9 dígitos (casi todos empresas; unos pocos
            parecen de personas físicas inscritas con RNC): quien se inscribió en
            el registro de proveedores con su cédula no se cruza. La fecha de inicio la declara
            el contribuyente, y el «primer contrato» es el más antiguo que devuelve
            la API de la DGCP. Del registro de proveedores solo se leen el RPE y el
            documento; sus teléfonos y correos no se descargan a la plataforma.
            Regenerar con{" "}
            <code className="rounded bg-canvas px-1 py-0.5 font-mono">scripts/build-rnc.py</code>.
          </p>
        </Fuente>

        <Fuente nombre="SISMAP · calidad de la gestión pública" estado="activa" etiqueta="Instantánea local">
          <p>
            El ranking del Sistema de Monitoreo de la Administración Pública
            (Ministerio de Administración Pública) alimenta{" "}
            <Link href="/gestion" className="font-medium text-brand-700 hover:underline">
              ¿Qué tan bien se gestiona?
            </Link>{" "}
            y el recuadro de gestión de cada ficha de institución. Son tres tablas
            que el SISMAP sirve como páginas normales: instituciones del Gobierno
            central, ayuntamientos y juntas de distrito municipal.
          </p>
          <p className="mt-3 text-[13px] text-ink-soft sm:text-xs">
            El SISMAP no publica fecha de corte en esas páginas: se declara el día en
            que se consultó. Mide cumplimiento de indicadores de gestión con
            evidencias que remite cada organismo; no es una auditoría. El enlace a la
            ficha de institución es por nombre, y la que no casa se queda sin enlace
            (sobre todo juntas de distrito). Regenerar con{" "}
            <code className="rounded bg-canvas px-1 py-0.5 font-mono">scripts/build-sismap.py</code>.
          </p>
        </Fuente>

        <Fuente nombre="MICM · precios de los combustibles" estado="activa" etiqueta="Conectada">
          <p>
            El Ministerio de Industria, Comercio y Mipymes pone en su portada los
            precios de la semana. Se leen de ahí, con caché de una hora, para el
            indicador del panorama. <ResumenCombustibles />
          </p>
          <p className="mt-3 text-[13px] text-ink-soft sm:text-xs">
            Son los precios de la portada, no el aviso completo: el aviso semanal se
            publica con el cuerpo vacío y su API está cerrada, así que otros
            productos (kerosene, fuel oil) no se pueden leer. La portada no escribe
            unidades; se dice «por galón» solo para gasolinas y gasoil.
          </p>
        </Fuente>

        <Fuente nombre="Banco Central · tasa de cambio de referencia" estado="activa" etiqueta="Conectada">
          <p>
            La tasa del dólar del mercado spot, día a día desde 1991, sale del
            archivo público que el Banco Central deja en su CDN; se lee con caché de
            una hora. <ResumenTasa />
          </p>
          <p className="mt-3 text-[13px] text-ink-soft sm:text-xs">
            La API del Banco Central exige credenciales y no se usa: pedirlas es una
            decisión pendiente del dueño. El archivo <code className="rounded bg-canvas px-1 py-0.5 font-mono">.xls</code>{" "}
            con el mismo nombre sigue en línea pero dejó de actualizarse en julio de
            2022; el vigente es el <code className="rounded bg-canvas px-1 py-0.5 font-mono">.xlsx</code>. El
            resto de las series del Banco Central no se puede enumerar sin
            navegador: su índice se arma con JavaScript.
          </p>
        </Fuente>

        <Fuente
          nombre="Portal de datos abiertos (datos.gob.do)"
          estado="activa"
          etiqueta="Índice e instantánea"
        >
          <p>
            Su <code className="rounded bg-canvas px-1 py-0.5 font-mono">robots.txt</code>{" "}
            prohíbe <code className="rounded bg-canvas px-1 py-0.5 font-mono">/api/</code>, así
            que no se consulta su API. Se usa como lo que es: un índice. Su búsqueda
            pública recorre el catálogo entero y de ahí sale{" "}
            <Link href="/datos" className="font-medium text-brand-700 hover:underline">
              el buscador de datos abiertos
            </Link>
            : título, organización, formatos y grupo de cada conjunto, con enlace a
            su ficha. <ResumenCatalogo /> Sus fichas dan además los enlaces directos a
            las nóminas que cada institución publica en su propio portal, y de ahí
            salió la ampliación de la nómina. Todo se lee al regenerar, a una
            petición cada diez segundos como pide el portal, nunca en una visita.
            El rótulo del portal («1199 resultados») no cambia con la búsqueda: el
            total que damos es el que contamos.
          </p>
        </Fuente>

        <Fuente nombre="SIGEF · subsidio eléctrico" estado="activa" etiqueta="Instantánea local">
          <p>
            La misma API del SIGEF da las transferencias del Tesoro por institución
            receptora. De ahí sale, en{" "}
            <Link href="/finanzas#subsidio-electrico" className="font-medium text-brand-700 hover:underline">
              finanzas
            </Link>
            , lo que el Tesoro transfiere cada año desde 2019 a las distribuidoras,
            la transmisora y la hidroeléctrica (hasta 2023, a la CDEEE que lo
            repartía). Valor devengado del capítulo de Obligaciones del Tesoro: no es
            todo el costo del sector eléctrico, y el año en curso va hasta el último
            mes registrado.
          </p>
        </Fuente>

        <Fuente nombre="MAP · nómina pública general del Estado" estado="activa" etiqueta="Instantánea local">
          <p>
            El Ministerio de Administración Pública publica cada mes un archivo con
            todas las plazas que las instituciones reportan a su sistema de recursos
            humanos (unas 492 mil, Educación y Salud incluidas), con nombre, cargo,
            estatus y sueldo bruto. Se baja al regenerar (unos 60 MB por mes, el último
            publicado y el anterior) y se agrega por institución y por cargo en{" "}
            <Link href="/nomina/general" className="font-medium text-brand-700 hover:underline">
              la nómina de todo el Estado
            </Link>
            ; las fichas de institución sin nómina propia muestran sus cifras.{" "}
            <strong>No se guarda ningún nombre ni el género.</strong> No trae el área
            de trabajo, y no aparecen quienes no reportan al MAP: Fuerzas Armadas,
            Policía Nacional, Congreso, Poder Judicial, ayuntamientos, Banco Central
            ni JCE. Donde coincide con la foto por institución, casa: el MAP y ANAMAR
            al peso, cinco más en menos de 2 %.
          </p>
        </Fuente>

        <Fuente nombre="DGCP · historia completa desde 2015" estado="activa" etiqueta="Instantánea local">
          <p>
            La sección «Tablas» de datos abiertos de la DGCP sirve enteras, como
            archivo, las tablas de contratos y de procesos: cada contrato y cada
            proceso registrado desde que existe el sistema. Se bajan al regenerar
            (unos 360 MB, nunca en una visita) y se agregan por año, por
            institución y por proveedor para{" "}
            <Link href="/historico" className="font-medium text-brand-700 hover:underline">
              la historia de las compras
            </Link>{" "}
            y el bloque «desde 2015» de cada ficha. <ResumenHistorico /> Es valor
            contratado en pesos, no pagado, sin cancelados. La tabla de contratos no
            dice qué institución firmó: se deduce del prefijo del código, que es el
            de la unidad de compra, solo cuando ese prefijo es inequívoco; el del
            MOPC lo comparte la OPRET, así que sus contratos cuentan en los años pero
            en ninguna institución, y la página lo dice junto al ranking. Los
            contratos de RD$&nbsp;10 mil millones o más no se suman: algunos parecen
            errores de captura, otros pueden ser obras reales, y sin el expediente
            no se distinguen. Se listan aparte, con nombre y apellido.
          </p>
          <p className="mt-3">
            De la tabla de procesos se guardan además, con su carátula, unidad de
            compra, modalidad, estado y monto estimado, los publicados en los doce
            meses anteriores a su publicación más reciente (unos 78 mil,{" "}
            <code className="rounded bg-canvas px-1 py-0.5 font-mono">scripts/build-procesos.py</code>
            ): son los que{" "}
            <Link href="/buscar" className="font-medium text-brand-700 hover:underline">
              el buscador
            </Link>{" "}
            encuentra por lo que se compra. Cada uno abre su ficha, leída en vivo.
          </p>
        </Fuente>

        <Fuente nombre="Contraloría y Cámara de Cuentas · auditorías y declaraciones" estado="activa" etiqueta="Instantánea local">
          <p>
            En{" "}
            <Link href="/auditorias" className="font-medium text-brand-700 hover:underline">
              auditorías y declaraciones
            </Link>{" "}
            se juntan los informes de auditoría de la Contraloría (y su Índice de
            Control Interno trimestral) y los de la Cámara de Cuentas, que volvió a
            responder después de meses de bloqueo. De la Cámara solo se leen los 10
            informes más recientes de su canal, de unos 216 publicados; la página lo
            dice. Las listas de quién presentó su declaración jurada a tiempo, tarde o
            no la presentó son PDF: se enlazan con su fecha de corte y todavía no se
            cuentan. Aquí no se muestra ningún nombre. La fecha de los informes de la
            Contraloría es la de subida, no la del informe.
          </p>
        </Fuente>

        <Fuente nombre="Biblioteca del Estado · documentos de las instituciones" estado="activa" etiqueta="Instantánea local">
          <p>
            Muchas instituciones publican en WordPress, y WordPress trae una vía
            pública de lectura de su biblioteca de archivos, sin clave. Se recorre
            entera al regenerar (robots primero, un segundo entre peticiones) y
            queda{" "}
            <Link href="/documentos" className="font-medium text-brand-700 hover:underline">
              un buscador de documentos
            </Link>{" "}
            que enlaza al archivo en el sitio de cada institución; aquí no se copia
            nada. <ResumenBiblioteca /> El total que anuncia cada sitio incluye
            archivos que cuelgan de páginas no públicas y que nadie puede abrir: se
            da lo que de verdad se leyó. El título es el que puso la institución y la
            fecha, la de subida. Las declaraciones juradas de patrimonio que algunas
            instituciones publican por mandato de la Ley 311-14 se dejan fuera del
            índice, por título, hasta decidir si un buscador por nombre de
            funcionario es proporcionado: siguen en el sitio de cada institución.
          </p>
          <p className="mt-3">
            <strong>Sin acceso:</strong> el Servicio Nacional de Salud (SNS), Administración Pública
            (MAP) y Deportes cierran esa vía con un plugin; el Ministerio de la
            Presidencia la veta en su robots; Agricultura e INFOTEP responden con el
            muro de Cloudflare; la ONE, con un desafío. Educación, Obras Públicas,
            Salud, la DGII y Aduanas no usan WordPress. La apertura se pide por la
            Ley 200-04.
          </p>
        </Fuente>

        <Fuente nombre="Buscador de toda la plataforma · por palabra y por tema" estado="activa" etiqueta="Instantánea local">
          <p>
            <Link href="/buscar" className="font-medium text-brand-700 hover:underline">
              El buscador
            </Link>{" "}
            junta en un índice las instantáneas de instituciones, legisladores,
            proveedores, procesos de compra, normativa y leyes, iniciativas del
            Congreso, sentencias, obras, documentos, datos abiertos y cargos de
            nómina, y dice la fecha en que se armó. Busca por palabra (sin
            tildes, con plurales y conjugaciones, y una errata admitida en
            palabras largas cuando lo exacto trae casi nada) y por tema, con un
            modelo abierto de vectores (Model2Vec, licencia MIT) reducido al
            español y guardado junto a los datos: no hay servicio externo ni
            clave. Lo que sale solo por tema se marca así. En una pregunta, las
            palabras con que se pregunta («¿cuánto gana…?») ordenan pero no se
            exigen, y la página lo dice.
          </p>
          <p className="mt-3">
            <strong>Cobertura:</strong> de los proveedores, los 32 mil con al
            menos un contrato desde 2015 en el registro de la DGCP, por nombre,
            RNC o RPE (no los inscritos que nunca contrataron); de los procesos,
            los publicados en los doce meses anteriores a la tabla abierta de la
            DGCP; de la normativa, todas las leyes desde 1844 y los decretos,
            reglamentos y resoluciones de los últimos cuatro años; del Congreso,
            los legisladores con ficha y las iniciativas de Diputados de los
            períodos 2020–2024 y 2024–2028, los dos que expone el SIL; de las
            sentencias, las del Tribunal Constitucional desde 2012 y las del
            Tribunal Superior Electoral desde 2021, por lo que dice su listado y
            no por el texto de la sentencia. El sueldo de un cargo es el mensual
            bruto de sus plazas en la foto de nómina: la mediana y el tramo en
            que cae el 80 % del medio. Del padrón de la DGII solo se usa el RNC:
            ni teléfonos ni correos. El Senado, los procesos más viejos y lo
            publicado después de cada instantánea se buscan en su vertical.
          </p>
        </Fuente>

        <Fuente nombre="Tribunal Constitucional · sentencias" estado="activa" etiqueta="Conectada">
          <p>
            El buscador de sentencias del Tribunal sirve cada año entero en una
            página normal, sin paginar: número, fecha, expediente y de qué trata.{" "}
            <Link href="/constitucional" className="font-medium text-brand-700 hover:underline">
              Las sentencias del Tribunal
            </Link>{" "}
            se leen de ahí con caché de horas para el año en curso y de días para los
            cerrados. La sentencia en sí es un PDF que se abre desde su ficha en el
            sitio del Tribunal: no se descarga ni se copia.
          </p>
          <p className="mt-3">
            Para el buscador de toda la plataforma, el listado de cada año desde
            2012 se guarda en una instantánea (
            <code className="rounded bg-canvas px-1 py-0.5 font-mono">scripts/build-sentencias.py</code>
            , unas 11,400 sentencias): número, fecha, expediente y de qué trata.
          </p>
        </Fuente>

        <Fuente nombre="Tribunal Superior Electoral · sentencias" estado="activa" etiqueta="Conectada">
          <p>
            Su visor público lista las sentencias por año, 60 por página, desde 2021:{" "}
            <Link href="/tse" className="font-medium text-brand-700 hover:underline">
              las sentencias del TSE
            </Link>{" "}
            se leen de ahí, siguiendo las páginas hasta un tope de 15 que la página
            declara si lo alcanza. La numeración de la fuente es irregular y un mismo
            número puede tener dos fichas: cada fila es una ficha. El PDF se abre
            desde la ficha, en el sitio del tribunal.
          </p>
          <p className="mt-3">
            La misma instantánea del buscador guarda sus 713 sentencias desde 2021,
            recorriendo todas las páginas. El visor pagina un orden con empates:
            algunas fichas salen en dos páginas y puede que otras en ninguna (en
            2024, 402 filas para 396 fichas distintas).
          </p>
        </Fuente>

        <Fuente nombre="Poder Judicial · estadísticas de los tribunales ordinarios" estado="activa" etiqueta="Instantánea local">
          <p>
            Del boletín estadístico mensual del Poder Judicial se lee, al regenerar,
            la hoja de entradas y salidas de los tribunales de jurisdicción ordinaria
            por departamento judicial, el último mes y el mismo mes del año anterior.
            Cuenta solicitudes de servicio judicial, no expedientes, y las salidas no
            corresponden a las entradas del mismo mes: la razón dice si los
            tribunales dan abasto, no qué parte de lo nuevo se resolvió. No incluye la
            Suprema Corte. Son cifras preliminares; el script rechaza el archivo si los
            departamentos no suman el total.
          </p>
        </Fuente>

        <Fuente nombre="Banco Central · remesas, reservas y tasa activa" estado="activa" etiqueta="Conectada">
          <p>
            Tres archivos públicos del CDN del Banco Central, sin clave, en el
            panorama: remesas del mes, reservas internacionales brutas y la tasa de
            interés activa ponderada. Cada una contra el mismo mes del año anterior
            (la tasa, contra el mes anterior, en puntos). Los títulos de dos de esos
            archivos dicen «millones» y las celdas vienen en dólares: se convierte y
            se dice. Lo que el Banco marca como preliminar, se marca. El índice de
            actividad (IMAE) del mismo CDN está congelado desde octubre de 2024 y no
            se muestra.
          </p>
        </Fuente>

        <Fuente nombre="Banco Central · inflación y llegadas por avión" estado="activa" etiqueta="Instantánea local">
          <p>
            El IPC y las llegadas de pasajeros por vía aérea están en el CDN del Banco
            Central como hojas de cálculo del formato antiguo de Excel, que la
            plataforma no lee en vivo: un script las convierte al regenerar y el
            panorama muestra los últimos 36 meses. Las llegadas son pasajeros
            aéreos, residentes incluidos, sin cruceristas; el reparto entre
            residentes y no residentes es una estimación del propio Banco. Lo que el
            Banco marca como sujeto a rectificación, se marca.
          </p>
        </Fuente>

        <Fuente nombre="Superintendencia de Bancos · SIMBAD" estado="activa" etiqueta="Conectada">
          <p>
            El tablero público SIMBAD de la Superintendencia de Bancos sirve cada
            gráfico por una interfaz sin clave. Se leen cada día cuatro series del
            sistema financiero (morosidad, cartera de créditos, solvencia y tasa de
            los préstamos nuevos), pidiendo solo sus datos. Cada gráfico trae unos
            dos años y termina en su propio mes, que se dice junto a la cifra. Esa
            misma interfaz expone información interna que no debería ser pública; no
            se usa, y se notifica a la Superintendencia.
          </p>
        </Fuente>

        <Fuente nombre="Crédito Público · subastas de bonos" estado="activa" etiqueta="Instantánea local">
          <p>
            El consolidado anual de subastas de bonos en pesos (2025 en el formato
            antiguo de Excel, 2026 en el nuevo) se convierte al regenerar: fecha,
            bono, tasa de corte, monto demandado y adjudicado, en{" "}
            <Link href="/deuda" className="font-medium text-brand-700 hover:underline">
              deuda
            </Link>
            . El script rechaza el archivo si las filas no suman su propio total. En
            las subastas de septiembre de 2026 el archivo pone la fecha de liquidación
            donde va el vencimiento: se muestran marcadas como dudosas, no se corrigen
            a ojo.
          </p>
        </Fuente>

        <Fuente nombre="Aduanas · comercio exterior y recaudación" estado="activa" etiqueta="Conectada">
          <p>
            La DGA publica sus series como hojas de cálculo con rutas que cambian en
            cada publicación; su propio sitio las lista en un índice JSON público, y
            de ahí se toman cada día: importaciones y exportaciones del mes (valor
            FOB, en dólares) y lo que cobró Aduanas, con el mismo mes y el acumulado
            del año anterior. Son cifras preliminares de la DGA, no la balanza
            comercial del Banco Central. Los títulos dicen «millones» y las celdas no
            lo están: un valor fuera de rango se descarta, nunca se reescala a ojo.
          </p>
        </Fuente>

        <Fuente nombre="Organismo Coordinador · generación eléctrica" estado="activa" etiqueta="Conectada">
          <p>
            La portada del OC pinta sus gráficos con un servicio JSON público. De él
            se lee el día de ayer: generación real contra programada, hora pico y
            cuántas horas registró el OC como «desabastecimiento», que es la huella
            pública de la falta de energía. Ese servicio a veces devuelve menos de 24
            horas: se dice sobre cuántas. Un día incompleto no se muestra.
          </p>
        </Fuente>

        <Fuente nombre="Edenorte y Edesur · mantenimientos programados" estado="activa" etiqueta="Conectada">
          <p>
            <Link href="/luz" className="font-medium text-brand-700 hover:underline">
              Los cortes de luz programados
            </Link>{" "}
            se leen de lo que publica cada distribuidora, con caché de seis horas y
            solo de hoy en adelante: Edenorte, de su canal RSS (trae municipio y
            circuito, no provincia; a veces no publica la semana, y la página lo
            dice); Edesur, de su página de la semana (provincia, horario y sectores,
            sin circuito). Edeeste solo publica un PDF semanal, que se enlaza. Las
            averías y los apagones por falta de generación no se anuncian y no están
            aquí.
          </p>
        </Fuente>

        <Fuente nombre="INDOMET · alertas meteorológicas" estado="activa" etiqueta="Conectada">
          <p>
            INDOMET emite sus alertas en el estándar internacional CAP y las publica,
            en dominio público, en el repositorio que alimenta a los agregadores de
            alertas. Se leen las 20 más recientes con caché de 15 minutos y se
            muestran las vigentes; el panorama se rehace cada media hora, así que una
            alerta recién vencida puede seguir a la vista hasta treinta minutos. Son alertas, no el pronóstico.
          </p>
        </Fuente>

        <Fuente nombre="INTRANT · muertes en las vías (OPSEVI)" estado="activa" etiqueta="Conectada">
          <p>
            El tablero del Observatorio Permanente de Seguridad Vial se alimenta de
            una interfaz JSON sin clave que su propia página llama. No está
            documentada: puede cambiar sin aviso, y sus cifras son preliminares y se
            revisan. El año en curso se compara con los mismos meses del anterior,
            nunca con el año entero.
          </p>
        </Fuente>

        <Fuente nombre="Interior, MINERD y MIVHED · el país en cifras" estado="activa" etiqueta="Instantánea local">
          <p>
            <Link href="/pais" className="font-medium text-brand-700 hover:underline">
              El país en cifras
            </Link>{" "}
            junta, al regenerar, tres archivos públicos: las denuncias de robo y las
            armas incautadas y registradas del Ministerio de Interior (fuente
            primaria: Policía Nacional; son denuncias, no delitos, y provisionales),
            la matrícula escolar del MINERD por regional (hasta el año escolar
            2023-24; sin doble conteo entre regional y distrito) y las licencias de
            construcción del MIVHED (permisos, no obras terminadas; la inversión
            declarada se lee como orden de magnitud). Cada bloque se valida contra
            su propio total y, si falla, no se publica. Los homicidios solo se
            publican como imagen y no están.
          </p>
        </Fuente>

        <Fuente nombre="Mapeadas en la tercera pasada, aún sin integrar" estado="descartada" etiqueta="Pendientes">
          <p>
            Verificadas y sin clave, a la espera de su turno: el conteo por institución
            de las listas de declaraciones juradas, que necesita leer PDF en build.
          </p>
        </Fuente>

        <Fuente nombre="Bloqueadas o sin vía hoy (tercera pasada)" estado="bloqueada" etiqueta="Sin acceso">
          <p>
            <strong>ONE y SIMV</strong>: desafío de Cloudflare hasta en su robots.{" "}
            <strong>Superintendencia de Electricidad</strong>, <strong>Agricultura</strong>{" "}
            e <strong>INFOTEP</strong>: 403 de Cloudflare.{" "}
            <strong>Archivo de recaudación de la DGII</strong>: 403 (la misma cifra
            la publica Hacienda). <strong>SNIP</strong>: solo con usuario.{" "}
            <strong>IDAC y Liga Municipal</strong>: tableros Power BI sin datos
            legibles. <strong>MOPC</strong>: su interfaz exige un token incrustado en
            su página, que no se usa. <strong>Buscador de sentencias de la Suprema
            Corte</strong>: solo responde a un formulario. <strong>Consulta de
            declaraciones juradas de la Cámara de Cuentas</strong>: error 500.{" "}
            <strong>API del SIGEF</strong>: 403 de Cloudflare el 29 de septiembre de
            2026, hasta en su robots.txt, desde el entorno de la plataforma.{" "}
            <strong>DIGECOG</strong> (Contabilidad Gubernamental): respondió 470 el
            mismo día. Ninguna se rodea: la vía es institucional (Ley 200-04), y cada
            una está anotada en la auditoría de fuentes.
          </p>
        </Fuente>
      </div>

      <Card as="section" className="mt-8 p-5">
        <CardTitle>Límites de cobertura</CardTitle>
        <ul className="mt-2.5 space-y-3 text-[15px] leading-relaxed text-ink-soft sm:text-sm">
          <li>
            El listado de <strong>Diputados</strong> cubre el registro vigente. Las
            piezas que siguen vivas se arrastran conservando su fecha de depósito
            original, con depósitos desde 2003; lo que murió en períodos anteriores
            no aparece. El límite es la supervivencia, no la antigüedad.
          </li>
          <li>
            El consultante del <strong>Senado</strong> no pagina hacia atrás por
            URL: el listado enseña los 50 expedientes más recientes de cada
            colección y el resto se alcanza buscando por texto. La búsqueda es
            subcadena literal, sensible a tildes: lo que se filtra aquí después
            de probar las formas con tilde sale de las 50 filas de esa forma, y
            la vista lo dice.
          </li>
          <li>
            La búsqueda del <strong>SIL</strong> también es literal: distingue
            tildes y orden («ambiente medio» no encuentra «medio ambiente»).
            Aquí se buscan todas las palabras en cualquier orden con un tope por
            consulta: tres palabras, doce sondeos de primera página entre sus
            formas con tilde y 300 iniciativas leídas para filtrar, de cuatro en
            cuatro. Si la palabra menos común tiene más, se sirve la frase exacta
            o se dice que el filtro recorrió solo las más recientes.
          </li>
          <li>
            Los conteos por condición del panorama salen de una muestra de las
            páginas más recientes. El SIL pagina de 10 en 10 y no expone agregados.
          </li>
          <li>
            Ningún dato del Estado va a una base de datos: cada vista lee su fuente
            en vivo con caché de minutos, o su instantánea versionada en el
            repositorio. La única base guarda lo que es del lector (su voto y, con
            cuenta, lo que guarda, anota y sigue), nunca una cifra de una fuente.
          </li>
          <li>
            Un <strong>proyecto</strong> se arma con piezas abiertas y probadas (React
            Flow para el tablero, Tiptap para el texto, TanStack Table para los
            registros, las tres con licencia MIT) y se descarga en un archivo JSON de
            formato abierto. Lo que sale es de quien lo arma: referencias, notas,
            fechas que anotó y el verbo de cada enlace.
            Ninguna cifra del Estado; esa se lee en cada ficha.
          </li>
        </ul>
        <p className="mt-4 text-[13px] text-ink-soft sm:text-xs">
          Herramienta independiente y no oficial. Para efectos legales, verifica
          contra la institución correspondiente.
        </p>
      </Card>
    </div>
  );
}

/**
 * El estado de una fuente traducido al oficio del color que ya conoce toda la
 * plataforma: conectada es lo cumplido, bloqueada es el sello, caída es el
 * ocre del plazo y descartada no dice nada. El sello iba escrito a mano aquí
 * con sus propios colores —un `<span>` con relleno, filete y versalitas, que es
 * exactamente `Badge forma="sello"`—, que es cómo se abre la segunda tabla de
 * colores que `lib/estados.ts` documenta como la forma de romper un sistema.
 */
const ESTADOS = {
  activa: { variant: "valido", ring: "ring-valido-500/20" },
  bloqueada: { variant: "sello", ring: "ring-sello-600/20" },
  descartada: { variant: "neutro", ring: "ring-hairline" },
  caida: { variant: "alerta", ring: "ring-alerta-600/20" },
} as const;

function Fuente({
  nombre,
  estado,
  etiqueta,
  children,
}: {
  nombre: string;
  estado: keyof typeof ESTADOS;
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <Card as="section" className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">{nombre}</CardTitle>
        <Badge
          forma="sello"
          variant={ESTADOS[estado].variant}
          className={`px-2 py-0.5 ring-1 ring-inset ${ESTADOS[estado].ring}`}
        >
          {etiqueta}
        </Badge>
      </div>
      {/*
        `/fuentes` es una página larga de lectura y se consulta en el teléfono:
        el cuerpo sube a 15 px, que es el mínimo cómodo para leer seguido, y
        vuelve a 14 desde `sm`, donde la columna ya es más ancha de lo que pide
        el ojo.
      */}
      <div className="mt-2.5 text-[15px] leading-relaxed text-ink-soft sm:text-sm">
        {children}
      </div>
    </Card>
  );
}

function Metrica({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-ink-soft">{etiqueta}</dt>
      <dd className="mt-0.5 break-words font-mono text-sm font-semibold tabular-nums text-ink">{valor}</dd>
    </div>
  );
}
