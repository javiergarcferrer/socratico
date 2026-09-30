import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";
import { NavFiltros, FiltroEnlace } from "@/components/nav-filtros";
import { BuscadorUrl } from "@/components/buscador-url";
import { EstadoVacio } from "@/components/estado-vacio";
import { Paginador } from "@/components/paginador";
import { MarcaEstado } from "@/components/marca-estado";
import { Rotulo } from "@/components/papel";
import Antiguedad from "@/components/antiguedad";
import { Termino } from "@/components/termino";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { IconExternal } from "@/components/icons";
import { enlace } from "@/lib/grafo";
import { formatFecha } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { agujas, contieneTodas, plano, recortar } from "@/lib/raiz";
import {
  GRUPOS_MEDIDA,
  ORDEN_GRUPOS,
  ORDEN_TIPOS,
  TIPOS_MEDIDA,
  buscadorMedidas,
  cumpleTipo,
  enAnio,
  esGrupoMedida,
  esTipoMedida,
  getSanciones,
  hrefFichaOfac,
  motivoBancoMundialEnLlano,
  programaEnLlano,
  type EntidadBancoMundial,
  type EntidadOfac,
  type FiltrosMedidas,
  type MedidaDgcp,
  type MetaSanciones,
  type ProveedorConMedidas,
  type ViaOfac,
} from "@/lib/sanciones";

export const metadata: Metadata = {
  alternates: { canonical: "/proveedores/inhabilitados" },
  title: "Proveedores con medidas de la DGCP",
  description:
    "Qué proveedores del Estado ha suspendido, cancelado o inhabilitado la DGCP: el tipo de medida, su fecha, su resolución y el motivo entero. Y las entidades ligadas al país en la lista de sanciones de la OFAC.",
};

export const revalidate = 86400;

const POR_PAGINA = 30;

/** Años con filtro propio; lo anterior, escaso, se junta en «antes de». */
const ANIOS_CON_FILTRO = 7;

const VIA: Record<ViaOfac, string> = {
  rnc: "un RNC dominicano",
  direccion: "una dirección en el país",
  mencion: "una mención en sus observaciones",
};

function nProveedores(n: number): string {
  return `${formatInt(n)} ${n === 1 ? "proveedor" : "proveedores"}`;
}

function nMedidas(n: number): string {
  return `${formatInt(n)} ${n === 1 ? "medida" : "medidas"}`;
}

type Props = {
  searchParams: Promise<{ q?: string; grupo?: string; tipo?: string; anio?: string; p?: string }>;
};

/**
 * ¿Qué proveedores ha suspendido, cancelado o inhabilitado la DGCP? — la tabla
 * de medidas sobre el Registro de Proveedores, por proveedor (`lib/sanciones.ts`).
 *
 * Cada fila es un proveedor y enseña la medida más reciente que cumple los
 * filtros; la ficha tiene todas, con el texto entero. Filtros, búsqueda y
 * página viven en la URL. Abajo, las entidades de la lista SDN de la OFAC
 * ligadas al país, que son otra fuente y otro Estado y por eso van aparte.
 */
export default async function MedidasPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [datos, busca] = await Promise.all([getSanciones(), buscadorMedidas()]);

  if (!datos || !busca) {
    return (
      <EstadoVacio
        variante="caida"
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="No pudimos leer la tabla de medidas sobre proveedores"
        accion={
          <Button asChild variant="secondary">
            <Link href="/proveedores">Buscar en el registro de proveedores</Link>
          </Button>
        }
      >
        La copia de la tabla de la DGCP no está disponible ahora mismo. El registro de
        proveedores y la ficha de cada uno siguen en pie.
      </EstadoVacio>
    );
  }

  const dgcp = datos.fuentes.dgcp;
  // `?q=a&q=b` llega como lista: se toma solo si es un texto.
  const q = recortar(typeof sp.q === "string" ? sp.q : undefined, 120);
  const tipo = esTipoMedida(sp.tipo) ? sp.tipo : null;
  const grupo = tipo ? TIPOS_MEDIDA[tipo].grupo : esGrupoMedida(sp.grupo) ? sp.grupo : null;

  // Los años, del más reciente al más antiguo; los primeros llevan filtro
  // propio y el resto se junta en «antes de», que son pocas medidas.
  const porAnio = new Map<string, number>();
  for (const p of datos.proveedores) {
    for (const e of p.eventos) porAnio.set(e.fecha.slice(0, 4), (porAnio.get(e.fecha.slice(0, 4)) ?? 0) + 1);
  }
  const anios = [...porAnio.keys()].sort().reverse();
  const conFiltro = anios.slice(0, ANIOS_CON_FILTRO);
  const antes = anios.length > ANIOS_CON_FILTRO ? `antes-${conFiltro[conFiltro.length - 1]}` : null;
  const anio = sp.anio && (conFiltro.includes(sp.anio) || sp.anio === antes) ? sp.anio : null;

  const filtros: FiltrosMedidas = { q, grupo, tipo, anio };
  const url = (cambios: Partial<Record<"q" | "grupo" | "tipo" | "anio" | "p", string | null>>) => {
    const u = new URLSearchParams();
    const todo = { q: q || null, grupo, tipo, anio, ...cambios };
    for (const [k, v] of Object.entries(todo)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `/proveedores/inhabilitados?${s}` : "/proveedores/inhabilitados";
  };

  // La búsqueda primero (vale para todo lo demás); después, cuántos
  // proveedores deja cada filtro con los otros puestos, para que el número
  // del filtro diga lo que se obtiene al pulsarlo.
  const buscados = q ? datos.proveedores.filter((p) => busca(p, q)) : datos.proveedores;
  const cuantos = (f: FiltrosMedidas) =>
    buscados.filter((p) => p.eventos.some((e) => cumpleTipo(e, f) && enAnio(e.fecha, f.anio))).length;

  const filas = buscados
    .map((p) => ({ p, eventos: p.eventos.filter((e) => cumpleTipo(e, filtros) && enAnio(e.fecha, anio)) }))
    .filter((x) => x.eventos.length > 0)
    .sort((a, b) => b.eventos[0].fecha.localeCompare(a.eventos[0].fecha) || a.p.razonSocial.localeCompare(b.p.razonSocial, "es"));
  const medidasVistas = filas.reduce((s, x) => s + x.eventos.length, 0);
  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Number(sp.p) || 1), paginas);
  const vista = filas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const sanciones = datos.proveedores.reduce(
    (s, p) => s + p.eventos.filter((e) => TIPOS_MEDIDA[e.tipo].grupo === "sancion").length,
    0,
  );
  const explicacion = tipo ? TIPOS_MEDIDA[tipo].llano : grupo ? GRUPOS_MEDIDA[grupo].llano : null;

  return (
    <div className="space-y-5">
      <Portada
        rotulo={`Registro de Proveedores del Estado · DGCP · tabla con registros hasta el ${formatFecha(dgcp.corte ?? datos.generado)}`}
        titulo="¿Qué proveedores ha suspendido, cancelado o inhabilitado la DGCP?"
        descripcion={
          <>
            La tabla de la DGCP mezcla sanciones, suspensiones preventivas, prohibiciones por
            cargo público y bajas que pidió el propio proveedor. No dice qué es cada medida: lo
            leemos de su texto, que va entero en la ficha de cada proveedor.
          </>
        }
      >
        <PortadaCifras>
          <PortadaCifra etiqueta="Medidas publicadas" valor={formatInt(dgcp.eventos)} destacar />
          <PortadaCifra etiqueta="Empresas y entidades" valor={formatInt(dgcp.juridicas)} />
          <PortadaCifra etiqueta="Personas físicas" valor={formatInt(dgcp.personasFisicas)} />
          <PortadaCifra etiqueta="Medidas que son sanciones" valor={formatInt(sanciones)} />
        </PortadaCifras>
      </Portada>

      <Suspense>
        <BuscadorUrl
          etiqueta="Buscar entre los proveedores con medidas"
          placeholder="Nombre, RNC, RPE o resolución…"
          ayuda={`Busca entre los ${formatInt(datos.proveedores.length)} proveedores con medidas de esta tabla, empresas y personas físicas: por RNC o RPE exactos, por nombre, por número de resolución o por palabras del motivo, sin distinguir tildes. No es el registro entero: a cualquier otro proveedor se le busca en Proveedores.`}
        />
      </Suspense>

      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-ink-soft">
          Cada filtro dice cuántos proveedores deja, con los demás puestos.
        </p>
        <NavFiltros etiqueta="Qué medida">
          <FiltroEnlace href={url({ grupo: null, tipo: null, p: null })} activo={!grupo}>
            {`Todas · ${formatInt(cuantos({ ...filtros, grupo: null, tipo: null }))}`}
          </FiltroEnlace>
          {ORDEN_GRUPOS.map((g) => (
            <FiltroEnlace key={g} href={url({ grupo: g, tipo: null, p: null })} activo={grupo === g}>
              {`${GRUPOS_MEDIDA[g].etiqueta} · ${formatInt(cuantos({ ...filtros, grupo: g, tipo: null }))}`}
            </FiltroEnlace>
          ))}
        </NavFiltros>

        {/* El tipo se elige dentro de su familia: quince a la vez no se leen. */}
        {grupo && (
          <NavFiltros etiqueta={`Tipo de medida dentro de «${GRUPOS_MEDIDA[grupo].etiqueta}»`}>
            <FiltroEnlace href={url({ grupo, tipo: null, p: null })} activo={!tipo}>
              {`Todos los tipos · ${formatInt(cuantos({ ...filtros, grupo, tipo: null }))}`}
            </FiltroEnlace>
            {ORDEN_TIPOS.filter((t) => TIPOS_MEDIDA[t].grupo === grupo).map((t) => {
              const n = cuantos({ ...filtros, grupo, tipo: t });
              return n > 0 || tipo === t ? (
                <FiltroEnlace key={t} href={url({ grupo, tipo: t, p: null })} activo={tipo === t}>
                  {`${TIPOS_MEDIDA[t].etiqueta} · ${formatInt(n)}`}
                </FiltroEnlace>
              ) : null;
            })}
          </NavFiltros>
        )}

        <NavFiltros etiqueta="Año de la medida">
          <FiltroEnlace href={url({ anio: null, p: null })} activo={!anio}>
            {`Todos los años · ${formatInt(cuantos({ ...filtros, anio: null }))}`}
          </FiltroEnlace>
          {conFiltro.map((a) => (
            <FiltroEnlace key={a} href={url({ anio: a, p: null })} activo={anio === a} mono>
              {`${a} · ${formatInt(cuantos({ ...filtros, anio: a }))}`}
            </FiltroEnlace>
          ))}
          {antes && (
            <FiltroEnlace href={url({ anio: antes, p: null })} activo={anio === antes}>
              {`Antes de ${antes.slice(-4)} · ${formatInt(cuantos({ ...filtros, anio: antes }))}`}
            </FiltroEnlace>
          )}
        </NavFiltros>

        {explicacion && (
          <p className="text-sm leading-relaxed text-ink-soft">
            {grupo === "oficio" && !tipo && (
              <>
                <Termino clave="deOficio">De oficio</Termino>:{" "}
              </>
            )}
            {tipo === "prohibicion" && (
              <>
                <Termino clave="regimenProhibiciones">Régimen de prohibiciones</Termino>.{" "}
              </>
            )}
            {explicacion}
          </p>
        )}
      </div>

      {vista.length === 0 ? (
        <EstadoVacio
          titulo={q ? `Ningún proveedor con medidas coincide con «${q}»` : "Ningún proveedor con esos filtros"}
          accion={
            <Button asChild variant="secondary">
              <Link href="/proveedores/inhabilitados">Quitar los filtros</Link>
            </Button>
          }
        >
          {q
            ? "La búsqueda mira solo a los proveedores con medidas de esta tabla. Prueba con menos palabras, con el RNC o con el número de RPE, o búscalo en el registro entero desde Proveedores."
            : "Ninguna medida de la tabla cumple a la vez el tipo y el año elegidos."}
        </EstadoVacio>
      ) : (
        <Card as="section" aria-labelledby="lista-medidas">
          <CardHeader>
            <CardTitle id="lista-medidas" aria-live="polite">
              {`${nProveedores(filas.length)} · ${nMedidas(medidasVistas)}`}
              {q && <span className="font-normal text-ink-soft">{` para «${q}»`}</span>}
            </CardTitle>
            <CardAction>la medida más reciente primero</CardAction>
          </CardHeader>
          <ol>
            {vista.map(({ p, eventos }) => (
              <FilaProveedor key={p.rpe} p={p} medida={eventos[0]} mas={p.eventos.length - 1} />
            ))}
          </ol>
          {paginas > 1 && (
            <div className="border-t border-hairline px-5 py-3">
              <Paginador
                pagina={pagina}
                paginas={paginas}
                href={(n) => url({ p: n > 1 ? String(n) : null })}
                etiqueta="Paginación de los proveedores con medidas"
              />
            </div>
          )}
        </Card>
      )}

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuente: tabla «Proveedores inhabilitados» de los datos abiertos de la DGCP, descargada el{" "}
        {formatFecha(datos.generado)}, cruzada con el Registro de Proveedores del Estado para el
        nombre, el RNC y el estado de cada registro. El tipo de cada medida es nuestra lectura del
        texto de la DGCP con reglas fijas; lo que no encaja dice «Otro motivo». De las{" "}
        {formatInt(dgcp.personasFisicas)} personas físicas ({nMedidas(dgcp.eventosPersonasFisicas)}) se
        publica el nombre con que se inscribieron, nunca su cédula ni la constancia del registro que la
        muestra, y sus filas no se ofrecen a los buscadores. No se publican {formatInt(dgcp.pruebas)}{" "}
        filas de prueba del propio sistema ni {formatInt(dgcp.duplicadas)} filas repetidas; en los
        motivos se omiten el nombre y el documento de quien firma una solicitud. Una medida posterior a la fecha de la tabla no sale
        aquí.{" "}
        <a href="/data/sanciones.json" download className="font-medium text-brand-700 hover:underline">
          Descargar los datos (JSON)
        </a>{" "}
        ·{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          Estado de las fuentes
        </Link>
      </p>

      <SeccionOfac entidades={datos.ofac} q={q} ofac={datos.fuentes.ofac} generado={datos.generado} />

      {datos.fuentes.bancoMundial && (
        <SeccionBancoMundial entidades={datos.bancoMundial ?? []} bm={datos.fuentes.bancoMundial} />
      )}
    </div>
  );
}

/** Un proveedor: su nombre, la medida que cumple los filtros y su estado hoy en la tabla. */
function FilaProveedor({ p, medida, mas }: { p: ProveedorConMedidas; medida: MedidaDgcp; mas: number }) {
  const tipo = TIPOS_MEDIDA[medida.tipo];
  return (
    <li className="relative border-b border-hairline last:border-0">
      {/*
        El nombre de un particular se lee aquí, pero no se ofrece en los
        resultados de los buscadores (proporcionalidad, Ley 172-13). Google atiende `data-nosnippet` en un `div`, no en un `li`.
      */}
      <div className="px-5 py-3.5" {...(p.fisica ? { "data-nosnippet": "" } : {})}>
        <Link
          href={enlace.proveedor(p.rpe)}
          className="text-[15px] font-medium leading-snug text-ink [overflow-wrap:anywhere] estira hover:text-brand-700"
        >
          {p.razonSocial}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <MarcaEstado tono={tipo.tono}>{tipo.etiqueta}</MarcaEstado>
          <span className="text-xs text-ink-soft">
            <Antiguedad iso={medida.fecha} />
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          <span className="font-mono tabular-nums">RPE {p.rpe}</span>
          {p.fisica && " · persona física"}
          {p.rnc && (
            <>
              {" · "}
              <span className="font-mono tabular-nums">RNC {p.rnc}</span>
            </>
          )}
          {p.estadoRpe && ` · estado en el registro: ${p.estadoRpe.toLowerCase()}`}
          {mas > 0 && ` · ${nMedidas(mas)} más en su ficha`}
        </p>
      </div>
    </li>
  );
}

/**
 * Las entidades de la lista SDN de la OFAC ligadas al país. Aparte, porque es
 * otra fuente y otro Estado: una designación del Tesoro de Estados Unidos no
 * es una medida dominicana. Solo entidades; las personas de la lista no se
 * muestran.
 */
function SeccionOfac({
  entidades,
  q,
  ofac,
  generado,
}: {
  entidades: EntidadOfac[];
  q: string;
  ofac: { fecha: string | null; entradas: number; ligadasRd: number; individuosOmitidos: number };
  generado: string;
}) {
  const a = q ? agujas(q) : null;
  const digitos = q.replace(/[\s.-]/g, "");
  const vistas = a
    ? entidades.filter(
        (o) =>
          (/^\d{9}$/.test(digitos) && o.rnc === digitos) ||
          contieneTodas(plano(`${o.nombre} ${o.alias.join(" ")} ${o.rnc ?? ""}`), a),
      )
    : entidades;
  const inscritas = entidades.filter((o) => o.rpes.length > 0).length;

  return (
    <Card as="section" aria-labelledby="ofac-titulo">
      <div className="px-5 pb-4 pt-5">
        <Rotulo>
          Lista SDN · OFAC, Tesoro de Estados Unidos
          {ofac.fecha ? ` · publicada el ${formatFecha(ofac.fecha)}` : ""}
        </Rotulo>
        <h2 id="ofac-titulo" className="mt-2 font-display text-2xl leading-tight text-ink">
          ¿Qué entidades ligadas al país están en la lista de sanciones de Estados Unidos?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          La <Termino clave="listaSdn">lista SDN de la OFAC</Termino> es del gobierno de Estados
          Unidos: dice lo que decidió su Departamento del Tesoro, no una medida del Estado
          dominicano. De sus {formatInt(ofac.entradas)} entradas, {formatInt(ofac.ligadasRd)} están
          ligadas a la República Dominicana por un RNC, una dirección o una mención; aquí están las{" "}
          {formatInt(entidades.length)} que son empresas u organizaciones. Las{" "}
          {formatInt(ofac.individuosOmitidos)} personas no se muestran.{" "}
          {inscritas === 0
            ? `Ninguna de estas entidades figura, por su RNC, en el Registro de Proveedores del Estado del ${formatFecha(generado)}.`
            : `${formatInt(inscritas)} ${inscritas === 1 ? "figura" : "figuran"}, por su RNC, en el Registro de Proveedores del Estado del ${formatFecha(generado)}: cada fila lo dice.`}
        </p>
      </div>

      {vistas.length === 0 ? (
        <p className="border-t border-hairline px-5 py-4 text-sm text-ink-soft">
          Ninguna entidad de la lista ligada al país coincide con «{q}».
        </p>
      ) : (
        <ul className="border-t border-hairline">
          {vistas.map((o) => (
            <li key={o.ent} className="border-b border-hairline px-5 py-3.5 last:border-0">
              <p className="text-[15px] font-medium leading-snug text-ink [overflow-wrap:anywhere]">{o.nombre}</p>
              {o.alias.length > 0 && (
                <p className="mt-0.5 text-xs text-ink-soft">
                  También figura como {o.alias.map((x) => `«${x}»`).join(", ")}
                </p>
              )}
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                {o.programas.length === 1 ? "Programa: " : "Programas: "}
                {o.programas.map(programaEnLlano).join("; ")}. Ligada al país por{" "}
                {o.via.map((v) => VIA[v]).join(" y ")}.
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                {o.rnc ? (
                  <>
                    <span className="font-mono tabular-nums">RNC {o.rnc}</span>
                    {o.rpes.length > 0 ? (
                      <>
                        {" · inscrita como proveedora: "}
                        {o.rpes.map((rpe, i) => (
                          <span key={rpe}>
                            {i > 0 && ", "}
                            <Link href={enlace.proveedor(rpe)} className="font-medium text-brand-700 hover:underline">
                              RPE {rpe}
                            </Link>
                          </span>
                        ))}
                      </>
                    ) : (
                      " · no figura en el Registro de Proveedores del Estado"
                    )}
                  </>
                ) : (
                  "La lista no le da RNC: no se puede cruzar con el Registro de Proveedores."
                )}
              </p>
              <a
                href={hrefFichaOfac(o.ent)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex min-h-11 items-center text-xs font-medium text-brand-700 hover:underline sm:min-h-0"
              >
                Entrada núm. {o.ent} en el buscador de la OFAC
                <IconExternal className="ml-1 h-3.5 w-3.5" />
                <span className="sr-only">(se abre en otra pestaña)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Las firmas de la lista de inhabilitados del Banco Mundial ligadas al país o
 * con exactamente el mismo nombre que un proveedor inscrito en la DGCP. Aparte
 * de la OFAC: es otra lista, de un banco multilateral, con otros efectos, y un
 * mismo nombre no prueba que sea la misma empresa.
 */
function SeccionBancoMundial({
  entidades,
  bm,
}: {
  entidades: EntidadBancoMundial[];
  bm: NonNullable<MetaSanciones["fuentes"]["bancoMundial"]>;
}) {
  return (
    <Card as="section" aria-labelledby="bm-lista-titulo">
      <div className="px-5 pb-4 pt-5">
        <Rotulo>
          Firmas inhabilitadas · Banco Mundial
          {bm.fecha ? ` · actualizada el ${formatFecha(bm.fecha)}` : ""}
        </Rotulo>
        <h2 id="bm-lista-titulo" className="mt-2 font-display text-2xl leading-tight text-ink">
          ¿Qué firmas ligadas al país ha inhabilitado el Banco Mundial?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          La lista del Banco Mundial dice a quién no contrata el Banco en los proyectos que financia: no es
          una medida del Estado dominicano. De sus {formatInt(bm.firmas)} firmas con una inhabilitación
          vigente, {formatInt(bm.dominicanas)} {bm.dominicanas === 1 ? "está ligada" : "están ligadas"} al
          país por su registro o su dirección, y {formatInt(bm.coincidencias)}{" "}
          {bm.coincidencias === 1 ? "tiene" : "tienen"} exactamente el mismo nombre que un proveedor inscrito
          en el Registro de Proveedores del Estado. Un mismo nombre no prueba que sea la misma empresa: cada
          fila dice dónde la registra el Banco. Los {formatInt(bm.individuosOmitidos)} individuos de la lista no
          se muestran.
        </p>
      </div>
      {entidades.length === 0 ? (
        <p className="border-t border-hairline px-5 py-4 text-sm text-ink-soft">
          Ninguna firma de la lista está ligada al país ni lleva el nombre de un proveedor inscrito.
        </p>
      ) : (
        <ul className="border-t border-hairline">
          {entidades.map((e) => (
            <li key={e.id} className="border-b border-hairline px-5 py-3.5 last:border-0">
              <p className="text-[15px] font-medium leading-snug text-ink [overflow-wrap:anywhere]">{e.nombre}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                {e.dominicana ? "Registrada en la República Dominicana" : `Registrada en ${e.pais ?? "otro país"}`}
                {" · "}inhabilitada desde el {e.desde ? formatFecha(e.desde) : "(sin fecha)"}
                {e.hasta ? ` hasta el ${formatFecha(e.hasta)}` : ", sin fecha de fin"}. {motivoBancoMundialEnLlano(e)}
              </p>
              {e.rpes.length > 0 && (
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  {"Mismo nombre que "}
                  {e.rpes.map((rpe, i) => (
                    <span key={rpe}>
                      {i > 0 && ", "}
                      <Link
                        href={enlace.proveedor(rpe)}
                        className="inline-flex min-h-11 items-center font-medium text-brand-700 hover:underline sm:min-h-0"
                      >
                        el proveedor RPE {rpe}
                      </Link>
                    </span>
                  ))}
                  {e.dominicana ? "." : ": puede ser otra empresa con el mismo nombre."}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-hairline px-5 py-3 text-xs leading-relaxed text-ink-soft">
        De {formatInt(bm.entradas)} entradas vigentes, leídas con la clave que la propia página del Banco
        publica (la plataforma no la guarda).{" "}
        <a
          href={bm.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center font-medium text-brand-700 hover:underline sm:min-h-0"
        >
          Ver la lista del Banco Mundial
          <IconExternal className="ml-1 h-3.5 w-3.5" />
          <span className="sr-only">(se abre en otra pestaña)</span>
        </a>
      </p>
    </Card>
  );
}
