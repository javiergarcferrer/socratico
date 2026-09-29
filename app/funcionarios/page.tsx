import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { EstadoVacio } from "@/components/estado-vacio";
import { FiltroEnlace, NavFiltros } from "@/components/nav-filtros";
import { Paginador } from "@/components/paginador";
import Plegable from "@/components/plegable";
import { Termino } from "@/components/termino";
import Antiguedad from "@/components/antiguedad";
import { formatFecha } from "@/lib/format";
import { enlace } from "@/lib/grafo";
import { hrefInstitucion, institucionPorId } from "@/lib/instituciones";
import { desdeMayusculas } from "@/lib/congreso";
import {
  FAMILIAS_PEP,
  PODERES,
  cabezasDelEstado,
  cargoDeFamilia,
  cargoEnInstitucion,
  cargoPrincipal,
  contarPersonas,
  esActual,
  ETIQUETA_MOVIMIENTO,
  filtrarPersonas,
  gabinete,
  getFuncionarios,
  type Cargo,
  type Persona,
  type Poder,
} from "@/lib/funcionarios";
import BuscadorFuncionarios from "./buscador";
import { hrefFuncionarios, type FiltrosFuncionarios } from "./href";

export const metadata: Metadata = {
  alternates: { canonical: "/funcionarios" },
  title: "Funcionarios",
  description:
    "Quién ocupa cada cargo público: el Presidente, el gabinete, las altas cortes, los legisladores, los alcaldes y los regidores, con los decretos que los nombraron.",
};

export const revalidate = 86400;

const POR_PAGINA = 30;
const ORDEN_PODERES: Poder[] = ["ejecutivo", "congreso", "justicia", "organos", "local"];

type Props = {
  searchParams: Promise<{ q?: string; poder?: string; pep?: string; tipo?: string; inst?: string; page?: string }>;
};

export default async function FuncionariosPage({ searchParams }: Props) {
  const p = await searchParams;
  const institucion = p.inst && /^\d{1,7}$/.test(p.inst) ? institucionPorId(Number(p.inst)) : null;
  const filtros: FiltrosFuncionarios = {
    q: p.q?.trim().slice(0, 120) ?? "",
    poder: p.poder && p.poder in PODERES ? (p.poder as Poder) : "",
    pep: p.pep === "1" || p.pep === "hoy" ? p.pep : "",
    tipo: (p.pep === "1" || p.pep === "hoy") && FAMILIAS_PEP.some((x) => x.clave === p.tipo) ? (p.tipo as string) : "",
    inst: institucion ? institucion.id : null,
  };
  const pagina = Math.max(1, Number(p.page ?? "1") || 1);
  const datos = await getFuncionarios();

  if (!datos) {
    return (
      <div className="mx-auto max-w-4xl">
        <EstadoVacio
          como="h1"
          variante="caida"
          titulo="No pudimos leer el directorio de funcionarios"
          accion={
            <Button asChild variant="secondary">
              <Link href="/fuentes">Ver el estado de las fuentes</Link>
            </Button>
          }
        >
          La instantánea que arma esta página no se pudo abrir. No es que no haya
          nadie: es que no pudimos mirar.
        </EstadoVacio>
      </div>
    );
  }

  const sinFiltro = !filtros.q && !filtros.poder && !filtros.pep && filtros.inst == null;
  // El filtro de la página, del que cada cuenta cambia una sola cosa.
  const base = {
    q: filtros.q,
    poder: filtros.poder || null,
    soloPep: filtros.pep !== "",
    soloPepVigente: filtros.pep === "hoy",
    familiaPep: filtros.tipo || null,
    institucionId: filtros.inst,
  };
  const lista = filtrarPersonas(datos, base);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = lista.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);
  const cuentaPoder = (poder: Poder | null) => contarPersonas(datos, { ...base, poder });
  const cuentaFamilia = (clave: string) => contarPersonas(datos, { ...base, soloPep: true, familiaPep: clave });
  const cabezas = sinFiltro ? cabezasDelEstado(datos) : [];
  const ministros = sinFiltro ? gabinete(datos) : [];
  const f = datos.fuentes;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-5">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">¿Quién ocupa cada cargo público?</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          El Presidente, el gabinete, las altas cortes, los legisladores, los alcaldes y los regidores, con
          los decretos que los nombraron. Quien ocupa un cargo obligado a declarar su patrimonio, o lo ocupó
          en los últimos tres años, es por ley una <Termino clave="pep">persona expuesta políticamente</Termino>:
          aquí se dice cuál y por qué artículo, nunca más que eso.
        </p>
      </header>

      {cabezas.length > 0 && (
        <Card as="section">
          <CardHeader>
            <CardTitle>¿Quién encabeza cada poder hoy?</CardTitle>
          </CardHeader>
          <ul>
            {cabezas.map(({ persona, cargo }) => (
              <FilaPersona key={persona.id} persona={persona} cargo={cargo} />
            ))}
          </ul>
        </Card>
      )}

      {ministros.length > 0 && (
        <Card as="section" className="mt-5">
          <CardHeader>
            <CardTitle>¿Quiénes forman el gabinete?</CardTitle>
            <CardAction className="font-mono tabular-nums">{ministros.length}</CardAction>
          </CardHeader>
          <Plegable
            resumen={
              <ul>
                {ministros.slice(0, 6).map(({ persona, cargo }) => (
                  <FilaPersona key={persona.id} persona={persona} cargo={cargo} />
                ))}
              </ul>
            }
            etiqueta={`Ver los ${ministros.length} ministros`}
            etiquetaCerrar="Ocultar el resto del gabinete"
          >
            <ul>
              {ministros.slice(6).map(({ persona, cargo }) => (
                <FilaPersona key={persona.id} persona={persona} cargo={cargo} />
              ))}
            </ul>
          </Plegable>
          <p className="border-t border-hairline px-5 py-3 text-xs text-ink-soft">
            Los ministros que el Directorio de Funcionarios del MAP pone hoy en el primer nivel del Poder
            Ejecutivo, consultado el {formatFecha(f.map.corte)}.
          </p>
        </Card>
      )}

      <section
        className={sinFiltro ? "mt-8" : ""}
        {...(sinFiltro ? { "aria-labelledby": "todas" } : { "aria-label": "Personas con cargo público" })}
      >
        {sinFiltro && (
          <h2 id="todas" className="mb-3 font-display text-2xl text-ink">
            ¿A quién buscas?
          </h2>
        )}
        <BuscadorFuncionarios filtros={filtros} total={datos.personas.length} />

        <NavFiltros etiqueta="Poder del Estado" className="mt-4">
          <FiltroEnlace href={hrefFuncionarios({ ...filtros, poder: "" })} activo={!filtros.poder}>
            {`Todos (${cuentaPoder(null).toLocaleString("es-DO")})`}
          </FiltroEnlace>
          {ORDEN_PODERES.map((poder) => (
            <FiltroEnlace
              key={poder}
              href={hrefFuncionarios({ ...filtros, poder })}
              activo={filtros.poder === poder}
            >
              {`${PODERES[poder].etiqueta} (${cuentaPoder(poder).toLocaleString("es-DO")})`}
            </FiltroEnlace>
          ))}
        </NavFiltros>
        <NavFiltros etiqueta="Qué cargos" className="mt-2">
          <FiltroEnlace href={hrefFuncionarios({ ...filtros, pep: "", tipo: "" })} activo={!filtros.pep}>
            Todos los cargos
          </FiltroEnlace>
          <FiltroEnlace href={hrefFuncionarios({ ...filtros, pep: "hoy" })} activo={filtros.pep === "hoy"}>
            PEP hoy
          </FiltroEnlace>
          <FiltroEnlace href={hrefFuncionarios({ ...filtros, pep: "1" })} activo={filtros.pep === "1"}>
            Con algún cargo obligado a declarar patrimonio
          </FiltroEnlace>
        </NavFiltros>
        {filtros.pep !== "" && (
          <NavFiltros etiqueta="Tipo de cargo, según el art. 2 de la Ley 311-14" className="mt-2">
            <FiltroEnlace href={hrefFuncionarios({ ...filtros, tipo: "" })} activo={!filtros.tipo}>
              Todos los tipos
            </FiltroEnlace>
            {FAMILIAS_PEP.map((x) => (
              <FiltroEnlace key={x.clave} href={hrefFuncionarios({ ...filtros, tipo: x.clave })} activo={filtros.tipo === x.clave}>
                {`${x.etiqueta} (${cuentaFamilia(x.clave).toLocaleString("es-DO")})`}
              </FiltroEnlace>
            ))}
          </NavFiltros>
        )}
        {institucion && (
          <NavFiltros etiqueta="Institución" className="mt-2">
            <FiltroEnlace href={hrefFuncionarios({ ...filtros, inst: null })} activo={false}>
              Todas las instituciones
            </FiltroEnlace>
            <FiltroEnlace href={hrefFuncionarios(filtros)} activo>
              {`Con cargo en ${desdeMayusculas(institucion.nombre)}`}
            </FiltroEnlace>
          </NavFiltros>
        )}

        <p className="mt-4 text-sm text-ink-soft" aria-live="polite">
          <span className="font-mono tabular-nums">
            {lista.length.toLocaleString("es-DO")} {lista.length === 1 ? "persona" : "personas"}
          </span>
          {filtros.q && (
            <>
              {" para "}
              <span className="font-medium text-ink">{`«${filtros.q}»`}</span>
            </>
          )}
          {institucion && (
            <>
              {" con cargo en "}
              <Link href={hrefInstitucion(institucion)} className="font-medium text-brand-700 hover:underline">
                {desdeMayusculas(institucion.nombre)}
              </Link>
              , primero las de hoy
            </>
          )}
        </p>

        {visibles.length > 0 ? (
          <Card as="section" className="mt-3">
            <ul>
              {visibles.map((persona) => (
                <FilaPersona
                  key={persona.id}
                  persona={persona}
                  cargo={
                    (filtros.inst != null && cargoEnInstitucion(persona, filtros.inst)) ||
                    (filtros.tipo && cargoDeFamilia(persona, filtros.tipo)) ||
                    cargoPrincipal(persona)
                  }
                />
              ))}
            </ul>
          </Card>
        ) : (
          <EstadoVacio
            titulo="Nadie con esos filtros"
            className="mt-3"
            accion={
              <Button asChild variant="secondary">
                <Link href="/funcionarios">Quitar los filtros</Link>
              </Button>
            }
          >
            {filtros.q
              ? "La búsqueda compara el nombre completo sin tildes. Prueba con un solo apellido o quita algún filtro. Una persona sin cargo público no está aquí."
              : "Ninguna persona de la instantánea cumple a la vez todos los filtros elegidos."}
          </EstadoVacio>
        )}

        {paginas > 1 && (
          <Paginador
            pagina={actual}
            paginas={paginas}
            href={(n) => {
              const base = hrefFuncionarios(filtros);
              return n > 1 ? `${base}${base.includes("?") ? "&" : "?"}page=${n}` : base;
            }}
            etiqueta="Paginación de funcionarios"
            className="mt-5"
          />
        )}
      </section>

      <section className="mt-6 space-y-2 text-xs leading-relaxed text-ink-soft">
        <p>
          <strong className="font-semibold text-ink">De dónde sale.</strong> El Directorio de Funcionarios
          del MAP ({f.map.filas.toLocaleString("es-DO")} servidores, consultado el {formatFecha(f.map.corte)});
          los {f.decretos.total.toLocaleString("es-DO")} decretos que publica la Consultoría Jurídica, de los
          que se leen las designaciones y los ceses desde el {formatFecha(f.decretos.desdeTitulos)} por su
          título y, cuando nombran a varias personas, por su texto desde el{" "}
          {formatFecha(f.decretos.desdePdf)}; las páginas de la Suprema Corte, el Consejo del Poder Judicial,
          el Tribunal Constitucional, el Tribunal Superior Electoral, la Junta Central Electoral y el Defensor
          del Pueblo; los {f.electos2024.filas.toLocaleString("es-DO")} electos municipales de 2024 de la JCE y
          los {f.congreso.filas} legisladores del SIL.
        </p>
        <p>
          <strong className="font-semibold text-ink">Qué no está.</strong> La Cámara de Cuentas y la
          Procuraduría rechazan hoy la lectura (HTTP 470), y el Banco Central sirve su Junta Monetaria por
          una vía que no devuelve el contenido: sus titulares faltan salvo que aparezcan en un decreto o en el
          directorio del MAP. Los decretos anteriores a 2012 que nombran a varias personas son escaneos y no
          se leen. Ver <Link href="/fuentes" className="text-brand-700 underline">el estado de las fuentes</Link>.
        </p>
        <p>
          <strong className="font-semibold text-ink">Una persona es su nombre.</strong> Dos fuentes que
          escriben el mismo nombre son la misma ficha; si lo escriben distinto, son dos. Nunca se usa la
          cédula ni se publica un parentesco.
        </p>
      </section>
    </div>
  );
}

function FilaPersona({ persona, cargo }: { persona: Persona; cargo: Cargo | null }) {
  const hoy = cargo ? esActual(cargo) : false;
  return (
    <li className="relative border-b border-hairline last:border-0">
      <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
        <div className="min-w-0 flex-1">
          <Link
            href={enlace.funcionario(persona.id)}
            className="text-[15px] font-medium leading-snug text-ink estira hover:text-brand-700"
          >
            {persona.nombre}
          </Link>
          {cargo && (
            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
              {cargo.titulo}
              {cargo.fecha ? (
                <>
                  {" · "}
                  {/* Un cargo que no es de hoy dice qué pasó: «Deja el cargo hace 3 años», no el título a secas. */}
                  <Antiguedad iso={cargo.fecha} prefijo={hoy ? "Desde" : ETIQUETA_MOVIMIENTO[cargo.movimiento]} />
                </>
              ) : (
                cargo.periodo && <> · <span className="font-mono tabular-nums">{cargo.periodo}</span></>
              )}
            </p>
          )}
          {persona.firma && (
            <p className="mt-0.5 text-xs text-ink-soft">
              Firmó <span className="font-mono tabular-nums">{persona.firma.decretos.toLocaleString("es-DO")}</span>{" "}
              decretos
            </p>
          )}
        </div>
        {persona.pepVigente && (
          <Badge
            variant="contorno"
            className="mt-0.5"
            title="Ocupa, o ocupó en los últimos tres años, un cargo obligado a declarar patrimonio (Ley 311-14, art. 2; Ley 155-17, art. 2, num. 19)"
          >
            PEP
          </Badge>
        )}
      </div>
    </li>
  );
}
