import { documentoPublicable } from "@/lib/padron";
import Link from "next/link";
import { Suspense, cache, type ReactNode } from "react";
import type { Metadata } from "next";
import {
  buscarProveedores,
  contarProveedoresRegistrados,
  muestrearProveedores,
  normalize,
  registrosDeProveedores,
  type ProveedorEnMercado,
  type ProveedorRegistro,
  type ResultadoProveedores,
} from "@/lib/dgcp";
import { buscarEnTodo, type Hallazgos } from "@/lib/busqueda";
import { titulizar } from "@/lib/capitulos";
import { formatFecha, formatMonto, formatPesos, hace, SIN_DATO } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { Cifra, Rotulo, TiraDeCifras } from "@/components/papel";
import Antiguedad from "@/components/antiguedad";
import Plegable from "@/components/plegable";
import { Badge } from "@/components/ui/badge";
import { FilaBarra } from "@/components/graficos";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Ancla } from "@/lib/cifras";
import { Cargando, Esqueleto, EsqueletoFilas } from "@/components/esqueleto";
import { EstadoVacio } from "@/components/estado-vacio";
import { Skeleton } from "@/components/ui/skeleton";
import { IconArrowRight } from "@/components/icons";
import { Resaltado } from "@/components/resaltado";
import BuscadorProveedores from "./buscador";
import { Portada } from "@/components/portada";
import { enlace } from "@/lib/grafo";
import { recortar } from "@/lib/raiz";

export const metadata: Metadata = {
  alternates: { canonical: "/proveedores" },
  title: "Proveedores del Estado",
  description:
    "Quién le vende al Estado dominicano: quién más se adjudica, con cuántas instituciones trabaja y qué dice de cada empresa el Registro de Proveedores del Estado.",
};

export const revalidate = 1800;

/** Cuántos proveedores se enriquecen con su ficha de registro. */
const CABEZA = 10;

/*
  Las dos vistas del mercado (por monto y por número de contratos) y los
  indicadores leen el mismo barrido. `cache` garantiza una sola lectura por
  render aunque las secciones se rendericen por separado dentro de sus
  `Suspense`.
*/
const mercado = cache(() => muestrearProveedores().catch(() => null));
const censo = cache(() => contarProveedoresRegistrados());

const AYUDA =
  "Un número (RNC, cédula o RPE) busca en el registro completo de proveedores del Estado. " +
  "Un nombre busca entre todos los que han contratado desde 2015 y entre quienes ganaron algo " +
  "este último mes; un inscrito que nunca contrató solo se encuentra por su número, porque el " +
  "origen no permite consultar el registro por razón social.";

export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const consulta = recortar(params.q, 120);

  return (
    <div className="space-y-5">
      {/* La cabecera no espera a nadie: pinta con la navegación. */}
      <Portada
        rotulo="Registro de Proveedores del Estado · DGCP"
        titulo="¿Quién le vende al Estado?"
        descripcion="Las empresas y personas inscritas para venderle al Estado son decenas de miles. Las que de verdad se están adjudicando contratos ahora mismo son muchas menos, y son estas. Cada una enlaza a su historial completo y a lo que el registro dice de ella."
      />

      <Suspense fallback={<TiraEsqueleto />}>
        <Indicadores />
      </Suspense>

      <BuscadorProveedores inicial={consulta} ayuda={AYUDA} />

      {consulta ? (
        <Suspense key={consulta} fallback={<ResultadosEsqueleto consulta={consulta} />}>
          <Resultados q={consulta} />
        </Suspense>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Suspense fallback={<Esqueleto className="h-[30rem]" />}>
              <RankingPorMonto />
            </Suspense>
            <Suspense fallback={<Esqueleto className="h-[30rem]" />}>
              <RankingPorContratos />
            </Suspense>
          </div>

          <Suspense fallback={<Esqueleto className="h-96" />}>
            <QuienesSon />
          </Suspense>
        </>
      )}

      <p className="px-1 text-xs leading-relaxed text-ink-soft">
        Fuente: API de datos abiertos de la DGCP (registro de contratos y
        Registro de Proveedores del Estado). El ranking se calcula sobre la
        ventana de contratos más recientes que el origen deja leer: no es todo
        el histórico y no puede serlo, porque la API sirve los contratos por
        recencia y no admite filtro por fecha. Los montos suman solo
        adjudicaciones vigentes, sin canceladas ni rescindidas. Omitimos a
        propósito los teléfonos y correos que el registro publica: esto vigila
        al Estado, no es un directorio comercial.{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          Estado y límites de las fuentes
        </Link>
        .
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ indicadores */

/**
 * La tira dice **una sola cosa**: cómo está la ventana de contratos recientes.
 *
 * El censo del RPE estaba aquí y salió: `docs/INFRAESTRUCTURA.md` §11 prohíbe mezclar un
 * censo con una muestra en la misma fila de tarjetas, porque invita a dividir
 * una por otra —«solo el 2 % de los inscritos gana algo» sería falso, la
 * ventana ve el 0.8 % de los contratos—. El censo va debajo, en prosa y con su
 * naturaleza dicha, donde nadie lo puede usar de denominador.
 */
async function Indicadores() {
  const [inscritos, m] = await Promise.all([censo(), mercado()]);

  if (!m || m.proveedores.length === 0) {
    return <SinVentana inscritos={inscritos} caida={!m} />;
  }

  const adjudicaciones = m.proveedores.reduce((s, p) => s + p.contratos, 0);
  const cabeza = m.proveedores.slice(0, CABEZA).reduce((s, p) => s + p.monto, 0);
  const concentracion = m.montoTotal > 0 ? (cabeza / m.montoTotal) * 100 : null;
  const ancla: Ancla = {
    alcance: "muestra",
    escaneados: m.escaneados,
    universo: m.totalRegistro,
  };

  return (
    <div className="space-y-3">
      <Rotulo tono="text-alerta-700">
        Muestra · {formatInt(m.escaneados)} de {formatInt(m.totalRegistro)} contratos
        {m.desde && m.hasta && (
          <>
            {" "}
            · {formatFecha(m.desde)} a {formatFecha(m.hasta)}
          </>
        )}
      </Rotulo>

      <TiraDeCifras>
        <Cifra
          etiqueta="Proveedores con contrato"
          valor={formatInt(m.proveedores.length)}
          nota={`distintos ${ventanaTexto(m)}`}
        />
        <Cifra
          etiqueta="Adjudicaciones vigentes"
          valor={formatInt(adjudicaciones)}
          ancla={ancla}
        />
        <Cifra
          etiqueta="Adjudicado entre ellos"
          valor={formatPesos(m.montoTotal)}
          nota="sin canceladas ni rescindidas"
          tono="text-brand-700"
        />
        <Cifra
          etiqueta={`Se llevan los ${CABEZA} mayores`}
          valor={concentracion === null ? SIN_DATO : `${concentracion.toFixed(1)} %`}
          nota="del monto de esta ventana"
        />
      </TiraDeCifras>

      <p className="px-1 text-xs leading-relaxed text-ink-soft">
        Las cuatro cifras describen esa ventana y solo esa ventana. El censo es
        otra cosa y no se divide con ellas: en el Registro de Proveedores del
        Estado hay {inscritos === null ? "decenas de miles de" : formatInt(inscritos)}{" "}
        inscritos, y la inmensa mayoría no gana un contrato en un mes
        cualquiera. Para uno en concreto, búscalo por su nombre, su RNC o su número de RPE.
      </p>
    </div>
  );
}

/**
 * Sin ventana hay dos historias distintas y la nota dice cuál: que la fuente
 * no contestó, o que contestó y no trae adjudicaciones vigentes.
 */
function SinVentana({
  inscritos,
  caida,
}: {
  inscritos: number | null;
  caida: boolean;
}) {
  return (
    <TiraDeCifras>
      <Cifra
        etiqueta="Inscritos en el RPE"
        valor={inscritos === null ? SIN_DATO : formatInt(inscritos)}
        ancla={{ alcance: "registro" }}
        nota="censo del registro completo"
      />
      <Cifra
        etiqueta="Adjudicándose ahora"
        valor={SIN_DATO}
        nota={
          caida
            ? "el registro de contratos no respondió"
            : "la ventana escaneada no trae adjudicaciones vigentes"
        }
      />
    </TiraDeCifras>
  );
}

/* -------------------------------------------------------------- rankings */

async function RankingPorMonto() {
  const m = await mercado();
  if (!m) return <FuenteCaida titulo="Los que más se adjudican" />;

  const top = m.proveedores.slice(0, 20);
  const max = Math.max(1, ...top.map((p) => p.monto));

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <p className="rotulo text-ink-soft">Por monto adjudicado</p>
          <CardTitle>Los que más se adjudican</CardTitle>
        </div>
        <CardAction>{`${top.length} de ${formatInt(m.proveedores.length)}`}</CardAction>
      </CardHeader>
      <RankingPlegado
        filas={top.map((p, i) => (
          /*
            La fila entera lleva a la ficha del proveedor: el nombre solo son
            diecisiete píxeles de alto dentro de una fila de ochenta, y en una
            lista de veinte eso es fallar el toque una de cada tres.
          */
          <FilaBarra
            key={p.rpe}
            filas
            numerar
            lineas={2}
            puesto={i + 1}
            maximo={max}
            barra={{
              clave: p.rpe,
              etiqueta: p.razonSocial,
              titulo: p.razonSocial,
              valor: p.monto,
              cifra: formatMonto(p.monto, "DOP"),
              href: enlace.proveedor(p.rpe),
              detalle: (
                <>
                  {p.contratos} {p.contratos === 1 ? "contrato" : "contratos"}
                  <Sep />
                  {p.instituciones}{" "}
                  {p.instituciones === 1 ? "institución" : "instituciones"}
                  {p.ultima && (
                    <>
                      <Sep />
                      <Antiguedad iso={p.ultima} />
                    </>
                  )}
                </>
              ),
            }}
          />
        ))}
      />
    </Card>
  );
}

/**
 * Las primeras ocho, y el resto a un toque.
 *
 * Veinte filas por ranking y dos rankings uno debajo del otro son cuarenta
 * filas antes de llegar a la sección siguiente: en escritorio son dos columnas
 * a la vista y en un teléfono son cinco pantallas de desplazamiento por algo
 * que se mira para saber **quién encabeza**. La revelación progresiva de la
 * casa lo resuelve sin perder nada, y su botón dice cuántas quedan
 * (docs/INFRAESTRUCTURA.md §11).
 */
function RankingPlegado({ filas, cabeza = 8 }: { filas: ReactNode[]; cabeza?: number }) {
  const primeras = filas.slice(0, cabeza);
  const resto = filas.slice(cabeza);
  if (resto.length === 0) {
    return <ol className="divide-y divide-hairline">{primeras}</ol>;
  }
  return (
    <Plegable
      resumen={<ol className="divide-y divide-hairline">{primeras}</ol>}
      etiqueta={`Ver los ${resto.length} siguientes`}
      etiquetaCerrar={`Ocultar los ${resto.length} siguientes`}
    >
      <ol className="divide-y divide-hairline">{resto}</ol>
    </Plegable>
  );
}

async function RankingPorContratos() {
  const m = await mercado();
  if (!m) return <FuenteCaida titulo="Los que más contratos ganan" />;

  const top = [...m.proveedores]
    .sort((a, b) => b.contratos - a.contratos || b.monto - a.monto)
    .slice(0, 20);
  const max = Math.max(1, ...top.map((p) => p.contratos));

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <p className="rotulo text-ink-soft">Por número de adjudicaciones</p>
          <CardTitle>Los que más contratos ganan</CardTitle>
        </div>
        <CardAction>Otra foto distinta</CardAction>
      </CardHeader>
      <RankingPlegado
        filas={top.map((p, i) => (
          <FilaBarra
            key={p.rpe}
            filas
            numerar
            lineas={2}
            puesto={i + 1}
            maximo={max}
            barra={{
              clave: p.rpe,
              etiqueta: p.razonSocial,
              titulo: p.razonSocial,
              valor: p.contratos,
              cifra: formatInt(p.contratos),
              href: enlace.proveedor(p.rpe),
              detalle: (
                <>
                  {formatMonto(p.monto, "DOP")}
                  <Sep />
                  {p.instituciones}{" "}
                  {p.instituciones === 1 ? "institución" : "instituciones"}
                  <Sep />
                  {formatMonto(Math.round(p.monto / p.contratos), "DOP")} de promedio
                </>
              ),
            }}
          />
        ))}
      />
    </Card>
  );
}

/* ---------------------------------------------------- quiénes son de veras */

/**
 * El ranking dice cuánto; esta sección dice quién. Son consultas al registro,
 * una por proveedor y en oleadas, así que llega después: la página ya se lee
 * sin ella.
 */
async function QuienesSon() {
  const m = await mercado();
  if (!m || m.proveedores.length === 0) return null;

  const cabeza = m.proveedores.slice(0, CABEZA);
  const fichas = await registrosDeProveedores(cabeza.map((p) => p.rpe));
  if (fichas.size === 0) return null;

  const conFicha = cabeza.filter((p) => fichas.has(p.rpe));
  const mipymes = conFicha.filter((p) => fichas.get(p.rpe)?.esMipyme).length;
  const inactivos = conFicha.filter(
    (p) => (fichas.get(p.rpe)?.estado ?? "Activo") !== "Activo",
  ).length;

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <p className="rotulo text-ink-soft">Ficha de registro</p>
          <CardTitle>{`Quiénes son los ${CABEZA} mayores`}</CardTitle>
        </div>
        <CardAction>{`${conFicha.length} con ficha en el RPE`}</CardAction>
      </CardHeader>
      <ul className="divide-y divide-hairline">
        {conFicha.map((p) => {
          const f = fichas.get(p.rpe)!;
          const domicilio = titulizar(
            [...new Set([f.municipio, f.provincia].filter((x): x is string => Boolean(x)))].join(
              ", ",
            ),
          );
          return (
            <li
              key={p.rpe}
              className="cv-auto relative px-5 py-3.5 transition-colors hover:bg-brand-50/40"
              style={{ "--cv-alto": "7rem" } as React.CSSProperties}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <Link
                  href={enlace.proveedor(p.rpe)}
                  className="text-sm font-medium text-brand-700 estira hover:underline"
                >
                  {f.razonSocial}
                </Link>
                <span className="font-mono text-sm font-semibold tabular-nums text-ink">
                  {formatMonto(p.monto, "DOP")}
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant="neutro">{documentoPublicable(f.tipoDocumento, f.numeroDocumento)}</Badge>
                {f.estado === "Activo" ? (
                  <Badge variant="valido">Activo en el RPE</Badge>
                ) : (
                  <Badge variant="alerta">{f.estado} en el RPE</Badge>
                )}
                {f.esMipyme && <Badge variant="firma">MIPYME</Badge>}
                {f.productorNacional && <Badge variant="firma">Productor nacional</Badge>}
              </div>

              <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
                {f.formaJuridica || f.tipoPersona}
                {domicilio && (
                  <>
                    <Sep />
                    {domicilio}
                  </>
                )}
                {f.fechaCreacion && (
                  <>
                    <Sep />
                    constituida {hace(f.fechaCreacion) ?? formatFecha(f.fechaCreacion)}
                  </>
                )}
                {f.fechaRegistroRpe && (
                  <>
                    <Sep />
                    inscrita {hace(f.fechaRegistroRpe) ?? formatFecha(f.fechaRegistroRpe)}
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-hairline px-5 py-3 text-xs leading-relaxed text-ink-soft">
        {mipymes === 0
          ? `Ninguno de los ${conFicha.length} mayores está inscrito como MIPYME.`
          : `${mipymes} de los ${conFicha.length} mayores están inscritos como MIPYME.`}
        {inactivos > 0 &&
          ` ${inactivos} ${inactivos === 1 ? "figura" : "figuran"} hoy con el registro en un estado distinto de activo; el registro publica el estado de ahora, no el que tenía al adjudicarse el contrato.`}{" "}
        El registro dice quién es cada empresa; qué se le adjudicó lo dicen los
        contratos, y están en su ficha.
      </p>
    </Card>
  );
}

/* -------------------------------------------------------------- búsqueda */

async function Resultados({ q }: { q: string }) {
  // El barrido que la página ya está leyendo se pasa hecho: si no, se
  // recorrerían y agregarían seis mil contratos dos veces por render.
  //
  // Por nombre hay dos lecturas, y se dicen por separado: la ventana de
  // contratos recientes (en vivo, con monto y fecha) y el índice de
  // proveedores de `/buscar`: todos los que han contratado desde 2015 (la
  // instantánea de `/historico`) y, del grafo, los que sin eso tienen medidas
  // de la DGCP o contratos de obra. Hasta el 2026-09-26 solo existía la
  // primera, y quien buscaba por nombre a un proveedor que no había ganado
  // nada en el último mes —Plaza Lama, con 865 contratos— no lo encontraba nunca.
  const [r, historico] = await Promise.all([
    buscarProveedores(q, mercado()),
    q.replace(/[^\p{L}]/gu, "").length >= 3 && /\p{L}/u.test(q)
      ? // Todas las coincidencias (hasta el tope del índice) y no la primera
        // página: el orden por contratos se hace aquí, sobre el conjunto.
        buscarEnTodo(q, { tipo: "proveedor", porPagina: 1000 })
      : Promise.resolve(null),
  ]);
  // Se listan por peso: primero quien se llama exactamente así, luego los que
  // más contratos tienen. El orden por BM25 subía a la empresa de un contrato
  // con el nombre más corto por delante de las que de verdad le venden al Estado.
  const exacto = normalize(q).replace(/\s+/g, " ").trim();
  const enHistorico = (historico?.resultados.filter((h) => h.via !== "tema" && h.href) ?? []).sort(
    (a, b) =>
      Number(normalize(b.titulo).startsWith(exacto)) - Number(normalize(a.titulo).startsWith(exacto)) ||
      (b.contratos ?? 0) - (a.contratos ?? 0),
  ).slice(0, MAX_HISTORICO);

  const sinNada = !r.registro && r.coincidencias.length === 0 && enHistorico.length === 0;

  return (
    <div className="space-y-4">
      {r.registro && <FichaEncontrada r={r} registro={r.registro} />}

      {enHistorico.length > 0 && historico && (
        <CoincidenciasHistoricas consulta={r.consulta} filas={enHistorico} h={historico} />
      )}

      {r.coincidencias.length > 0 && (
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <p className="rotulo text-ink-soft">{`Coincidencias con «${r.consulta}»`}</p>
              <CardTitle>Proveedores con contrato reciente</CardTitle>
            </div>
            <CardAction>{
                        r.totalCoincidencias > r.coincidencias.length
                          ? `${r.coincidencias.length} de ${formatInt(r.totalCoincidencias)}`
                          : formatInt(r.totalCoincidencias)
                      }</CardAction>
          </CardHeader>
          <ul className="divide-y divide-hairline">
            {r.coincidencias.map((p) => (
              <FilaCoincidencia key={p.rpe} p={p} />
            ))}
          </ul>
        </Card>
      )}

      {/*
        Cuatro desenlaces distintos, y ninguno puede hacerse pasar por otro: el
        registro caído, la ventana caída, la consulta demasiado corta para
        buscarla, y no haber encontrado nada de verdad.
      */}
      {sinNada &&
        (r.registroCaido ? (
          <RegistroCaido />
        ) : r.consultaCorta ? (
          <ConsultaCorta r={r} />
        ) : r.ventanaCaida && r.via === "nombre" ? (
          <VentanaCaida />
        ) : (
          <SinResultados r={r} />
        ))}

      {r.via === "nombre" && !r.ventanaCaida && !r.consultaCorta && (
        <p className="px-1 text-xs leading-relaxed text-ink-soft">
          Buscado entre los {formatInt(r.proveedoresEnVentana)} proveedores con
          contrato en una muestra de {formatInt(r.contratosEscaneados)} de{" "}
          {formatInt(r.contratosEnRegistro)} contratos
          {r.desde && r.hasta && (
            <>
              {" "}
              (del {formatFecha(r.desde)} al {formatFecha(r.hasta)})
            </>
          )}
          , y entre los que tienen algún contrato desde 2015, medidas de la DGCP
          o contratos de obra en las instantáneas. El registro de la DGCP no
          admite búsqueda por razón social ni se puede recorrer entero, así que
          un inscrito sin nada de eso no aparece por nombre: búscalo por su RNC
          o su número de RPE y verás su ficha completa.
        </p>
      )}
    </div>
  );
}

function FichaEncontrada({
  r,
  registro,
}: {
  r: ResultadoProveedores;
  registro: ProveedorRegistro;
}) {
  const domicilio = titulizar(
    [
      ...new Set(
        [registro.municipio, registro.provincia].filter((x): x is string => Boolean(x)),
      ),
    ].join(", "),
  );

  return (
    <Card className="border-t-[3px] border-t-v-compras">
      <CardHeader>
        <div className="min-w-0">
          <p className="rotulo text-ink-soft">{
                r.via === "documento"
                  ? `Encontrado por ${registro.tipoDocumento}`
                  : "Encontrado por número de RPE"
              }</p>
          <CardTitle>En el Registro de Proveedores del Estado</CardTitle>
        </div>
        <CardAction>{`RPE ${registro.rpe}`}</CardAction>
      </CardHeader>
      <div className="px-5 py-4">
        <h2 className="font-display text-2xl leading-tight text-ink">
          {registro.razonSocial}
        </h2>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Badge variant="neutro">{documentoPublicable(registro.tipoDocumento, registro.numeroDocumento)}</Badge>
          {registro.estado === "Activo" ? (
            <Badge variant="valido">Activo en el RPE</Badge>
          ) : (
            <Badge variant="alerta">{registro.estado} en el RPE</Badge>
          )}
          {registro.esMipyme && <Badge variant="firma">MIPYME</Badge>}
          {registro.certificacionMicm && <Badge variant="firma">Certificación MICM</Badge>}
          {registro.productorNacional && <Badge variant="firma">Productor nacional</Badge>}
        </div>

        <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">
          {registro.formaJuridica || registro.tipoPersona}
          {domicilio && (
            <>
              <Sep />
              {domicilio}
            </>
          )}
          {registro.fechaCreacion && (
            <>
              <Sep />
              constituida {hace(registro.fechaCreacion) ?? formatFecha(registro.fechaCreacion)}
            </>
          )}
          {registro.fechaRegistroRpe && (
            <>
              <Sep />
              inscrita como proveedora{" "}
              {hace(registro.fechaRegistroRpe) ?? formatFecha(registro.fechaRegistroRpe)}
            </>
          )}
        </p>

        <p className="mt-3 text-sm leading-relaxed text-ink">
          {r.enVentana ? (
            <>
              En la ventana de contratos recientes se le adjudicaron{" "}
              <span className="font-mono font-semibold tabular-nums">
                {formatMonto(r.enVentana.monto, "DOP")}
              </span>{" "}
              en {r.enVentana.contratos}{" "}
              {r.enVentana.contratos === 1 ? "contrato" : "contratos"} de{" "}
              {r.enVentana.instituciones}{" "}
              {r.enVentana.instituciones === 1 ? "institución" : "instituciones"}.
            </>
          ) : (
            <span className="text-ink-soft">
              No aparece en la ventana de contratos más recientes. Eso no
              significa que no tenga historial: su ficha lee todos sus contratos,
              que sí se pueden consultar por proveedor.
            </span>
          )}
        </p>

        <Button asChild className="mt-4">
          <Link href={enlace.proveedor(registro.rpe)}>
            Ver su historial completo
            <IconArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

/** Cuántos proveedores del histórico se listan por nombre como máximo. */
const MAX_HISTORICO = 60;

/**
 * Los que se llaman así entre todos los que han contratado desde 2015 y los
 * que tienen medidas de la DGCP o contratos de obra (`lib/busqueda.ts`, tipo
 * `proveedor`; el detalle de cada uno dice cuál): el camino por nombre que no
 * depende de haber ganado algo este mes. Solo coincidencias por palabra —un
 * nombre de empresa no tiene «tema»—, con la fecha de la instantánea al lado.
 */
function CoincidenciasHistoricas({
  consulta,
  filas,
  h,
}: {
  consulta: string;
  filas: Hallazgos["resultados"];
  h: Hallazgos;
}) {
  const total = h.porTipo.proveedor ?? filas.length;
  const corte = h.instantaneas.proveedor;
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <p className="rotulo text-ink-soft">{`Coincidencias con «${consulta}»`}</p>
          <CardTitle>Con contratos desde 2015, medidas o contratos de obra</CardTitle>
        </div>
        <CardAction>
          {total > filas.length ? `${filas.length} de ${formatInt(total)}` : formatInt(filas.length)}
        </CardAction>
      </CardHeader>
      <ul className="divide-y divide-hairline">
        {filas.map((p) => (
          <li
            key={p.href}
            className="cv-auto relative px-5 py-3 transition-colors hover:bg-brand-50/40"
            style={{ "--cv-alto": "4rem" } as React.CSSProperties}
          >
            <Link href={p.href!} className="text-sm font-medium text-brand-700 estira hover:underline">
              <Resaltado texto={p.titulo} consulta={consulta} />
            </Link>
            {p.detalle && <p className="mt-0.5 text-xs text-ink-soft">{p.detalle}</p>}
          </li>
        ))}
      </ul>
      {corte && (
        <p className="border-t border-hairline px-5 py-2.5 text-xs text-ink-soft">
          De las instantáneas de compras y de obras, la más vieja del {formatFecha(corte)}; la ficha de cada uno se lee en vivo.
        </p>
      )}
    </Card>
  );
}

function FilaCoincidencia({ p }: { p: ProveedorEnMercado }) {
  return (
    <li
      className="cv-auto relative px-5 py-3 transition-colors hover:bg-brand-50/40"
      style={{ "--cv-alto": "4.5rem" } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Link
          href={enlace.proveedor(p.rpe)}
          className="text-sm font-medium text-brand-700 estira hover:underline"
        >
          {p.razonSocial}
        </Link>
        <span className="font-mono text-sm font-semibold tabular-nums text-ink">
          {formatMonto(p.monto, "DOP")}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-ink-soft">
        <span className="font-mono tabular-nums">RPE {p.rpe}</span>
        <Sep />
        {p.contratos} {p.contratos === 1 ? "contrato" : "contratos"}
        <Sep />
        {p.instituciones} {p.instituciones === 1 ? "institución" : "instituciones"}
        {p.ultima && (
          <>
            <Sep />
            <Antiguedad iso={p.ultima} />
          </>
        )}
      </p>
    </li>
  );
}

/* ---------------------------------------------------------------- vacíos */

/*
  Cuatro desenlaces y ninguno se puede hacer pasar por otro. Los cuatro se
  componen con `EstadoVacio`, que reserva el sitio de la explicación y el de la
  única acción útil; la variante `caida` los pinta en ocre, que es el color de
  «esto es un aviso», no de «esto no existe».
*/

function SinResultados({ r }: { r: ResultadoProveedores }) {
  return (
    <EstadoVacio titulo={`Nada encontrado para «${r.consulta}»`}>
      {r.via === "nombre" ? (
        <>
          Ningún proveedor que haya contratado con el Estado desde 2015 se llama
          así. Un inscrito que nunca ha contratado no se puede buscar por nombre:
          si sabes su RNC o su número de RPE, ese sí consulta el registro entero.
        </>
      ) : (
        <>
          No hay ningún proveedor inscrito con ese número, ni como RPE ni como
          RNC o cédula. El registro guarda las cédulas con once dígitos y los RNC
          con nueve; se prueban ambos formatos.
        </>
      )}
    </EstadoVacio>
  );
}

/**
 * El registro no contestó. Decir aquí «no está inscrito» sería afirmar una
 * falsedad sobre un registro del Estado, justo en el camino que la página
 * presenta como el autoritativo.
 */
function RegistroCaido() {
  return (
    <EstadoVacio
      variante="caida"
      titulo="El Registro de Proveedores del Estado no respondió"
      accion={
        <Button asChild variant="secondary" size="sm">
          <Link href="/proveedores">Ver quiénes se adjudican contratos</Link>
        </Button>
      }
    >
      No podemos decir si ese número está inscrito o no: la consulta al registro
      de la DGCP falló. Vuelve en unos minutos, o mira la ventana de contratos
      recientes, que sí sigue en pie.
    </EstadoVacio>
  );
}

/** No se buscó nada: decirlo, en vez de reportar cero coincidencias. */
function ConsultaCorta({ r }: { r: ResultadoProveedores }) {
  return (
    <EstadoVacio titulo={`«${r.consulta}» es demasiado corto para buscarlo`}>
      Una búsqueda por nombre necesita al menos tres letras: con dos coincidiría
      media plataforma. Si lo que tienes es un RNC, una cédula o un número de
      RPE, escríbelo completo: ese camino sí consulta el registro entero.
    </EstadoVacio>
  );
}

function VentanaCaida() {
  return (
    <EstadoVacio variante="caida" titulo="El registro de contratos no respondió">
      La búsqueda por nombre necesita esa ventana y ahora mismo la API de la
      DGCP no la sirve. La búsqueda por RNC, cédula o número de RPE sí sigue en
      pie: usa cualquiera de esos y verás la ficha del registro.
    </EstadoVacio>
  );
}

function FuenteCaida({ titulo }: { titulo: string }) {
  return (
    <EstadoVacio
      variante="caida"
      rotulo={titulo}
      titulo="El registro de contratos no respondió"
    >
      La API de la DGCP está caída o no devolvió datos. La búsqueda por RNC o
      número de RPE sigue funcionando; vuelve en unos minutos para el ranking.
    </EstadoVacio>
  );
}

/* --------------------------------------------------------------- piezas */

function Sep() {
  return (
    <span aria-hidden className="px-1.5 text-hairline">
      ·
    </span>
  );
}

function ventanaTexto(m: { desde: string | null; hasta: string | null }): string {
  if (!m.desde || !m.hasta) return "en la ventana escaneada";
  const dias = Math.max(
    1,
    Math.round((new Date(m.hasta).getTime() - new Date(m.desde).getTime()) / 86_400_000),
  );
  return `en los últimos ${dias} días del registro`;
}

function TiraEsqueleto() {
  return (
    <Cargando>
      <TiraDeCifras>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24 bg-hairline/70" />
            <Skeleton className="h-6 w-28 bg-hairline/70" />
            <Skeleton className="h-2.5 w-32 bg-hairline/70" />
          </div>
        ))}
      </TiraDeCifras>
    </Cargando>
  );
}

function ResultadosEsqueleto({ consulta }: { consulta: string }) {
  return (
    <Cargando>
      <p className="text-sm text-ink-soft">Buscando «{consulta}»…</p>
      <EsqueletoFilas n={6} className="mt-3" />
    </Cargando>
  );
}
