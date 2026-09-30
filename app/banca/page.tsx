import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import {
  SECTORES,
  esSector,
  filtrarEntidades,
  formatMesLargo,
  getFinancieras,
  infoSector,
  opera,
  ordenarEntidades,
  provinciaDe,
  resumenSistema,
  seLlamaAsi,
  textoParticipacion,
  tonoDeEstatus,
  type EntidadFinanciera,
  type InfoSector,
  type Sector,
} from "@/lib/financieras";
import { provinciaDeSlug } from "@/lib/provincias";
import { BUSQUEDAS } from "@/lib/secciones";
import { enlace } from "@/lib/grafo";
import { formatFecha, formatPesos } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { recortar } from "@/lib/raiz";
import { BuscadorUrl } from "@/components/buscador-url";
import { FiltroEnlace, NavFiltros } from "@/components/nav-filtros";
import FiltrosPlegados from "@/components/filtros-plegados";
import { EstadoVacio } from "@/components/estado-vacio";
import { Paginador } from "@/components/paginador";
import { MarcaEstado } from "@/components/marca-estado";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { Termino } from "@/components/termino";
import { Esqueleto } from "@/components/esqueleto";
import Antiguedad from "@/components/antiguedad";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { IndicadoresBanca } from "@/components/fuentes-nuevas/indicadores-banca";

export const metadata: Metadata = {
  alternates: { canonical: "/banca" },
  title: "Bancos y financieras",
  description:
    "Los bancos, asociaciones y corporaciones de crédito, las AFP, las aseguradoras y las cooperativas de ahorro que el Estado autoriza: cuánto tiene cada una, quién la dirige y qué informa, según quien la supervisa.",
};

export const revalidate = 86400;

/** Filas por página: el registro entero pasa de mil entidades. */
const POR_PAGINA = 50;

/** La misma frase que la paleta pone junto a este destino (`lib/secciones.ts`). */
const ALCANCE = BUSQUEDAS.find((b) => b.href === "/banca")?.alcance;

/**
 * Los sectores a la vista en la fila de filtros; los demás, tras «Ver todas».
 * Doce chips llenaban la pantalla del teléfono antes de la primera entidad.
 */
const A_LA_VISTA: Sector[] = ["banco-multiple", "asociacion", "ahorro-credito", "cooperativa", "afp", "aseguradora"];

type Props = {
  searchParams: Promise<{ q?: string; sector?: string; provincia?: string; pagina?: string }>;
};

/**
 * ¿Quién guarda el dinero del país? — el registro de `lib/financieras.ts`:
 * cada entidad financiera regulada con su ficha, ordenadas por lo que tienen
 * según la Superintendencia de Bancos.
 *
 * Búsqueda, sector, provincia y página viven en la URL (`?q=`, `?sector=`,
 * `?provincia=`, `?pagina=`): una búsqueda se comparte tal cual. Los recuentos
 * de cada sector se calculan sobre lo que dejan la búsqueda y la provincia, así
 * que el número del filtro dice lo que se obtiene al pulsarlo.
 */
export default async function BancaPage({ searchParams }: Props) {
  const sp = await searchParams;
  const d = await getFinancieras();
  if (!d) {
    return (
      <EstadoVacio
        variante="caida"
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="No pudimos leer la copia del registro de entidades financieras"
        accion={
          <Button asChild variant="secondary">
            <a href="https://sb.gob.do/supervisados/" target="_blank" rel="noopener noreferrer">
              Ver las entidades en el sitio de la Superintendencia de Bancos
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          </Button>
        }
      >
        La instantánea no está disponible en este momento. No es que no haya
        entidades: es que no pudimos leer la copia. Siguen publicadas en los sitios
        de quienes las supervisan, y el resto de la plataforma sigue en pie.
      </EstadoVacio>
    );
  }

  const sector = esSector(sp.sector) ? sp.sector : undefined;
  const provincia = sp.provincia ? provinciaDeSlug(sp.provincia) : null;
  const q = recortar(sp.q, 120);

  const base = filtrarEntidades(d, { q, provincia: provincia?.slug });
  const cuenta = new Map<Sector, number>();
  for (const e of base) cuenta.set(e.sector, (cuenta.get(e.sector) ?? 0) + 1);
  const filtradas = ordenarEntidades(sector ? base.filter((e) => e.sector === sector) : base, sector, q);
  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Math.floor(Number(sp.pagina)) || 1), paginas);
  const vista = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const sistema = resumenSistema(d);
  const coops = d.resumen;
  const corteCoop = d.cortes.idecoop ? formatMesLargo(d.cortes.idecoop) : null;

  const url = (cambios: { sector?: Sector | null; provincia?: string | null; pagina?: number }) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    const s = "sector" in cambios ? cambios.sector : sector;
    if (s) u.set("sector", s);
    const p = "provincia" in cambios ? cambios.provincia : provincia?.slug;
    if (p) u.set("provincia", p);
    if (cambios.pagina && cambios.pagina > 1) u.set("pagina", String(cambios.pagina));
    const t = u.toString();
    return t ? `/banca?${t}` : "/banca";
  };

  const chip = (s: InfoSector) => (
    <FiltroEnlace key={s.clave} href={url({ sector: s.clave })} activo={sector === s.clave}>
      {`${s.corto} (${formatInt(cuenta.get(s.clave) ?? 0)})`}
    </FiltroEnlace>
  );
  // Solo los sectores que la instantánea trae: un chip «(0)» prometería un registro que no se leyó.
  const conEntidades = SECTORES.filter((s) => (cuenta.get(s.clave) ?? 0) > 0 || s.clave === sector);
  const visibles = conEntidades.filter((s) => A_LA_VISTA.includes(s.clave) || s.clave === sector);
  const resto = conEntidades.filter((s) => !visibles.includes(s));

  const conActivos = filtradas.some((e) => e.activosMillones != null);
  const orden =
    (q && filtradas[0] && seLlamaAsi(filtradas[0], q) ? "primero la que se llama así; después, " : "") +
    (sector === "fiduciaria"
      ? "de la que más administra a la que menos, según la SB"
      : conActivos
        ? "de la que más activos tiene a la que menos, según la SB; las que no publican activos, por nombre"
        : "por nombre");

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="font-display text-3xl text-ink sm:text-4xl">¿Quién guarda el dinero del país?</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft sm:text-sm">
          Los bancos, asociaciones y corporaciones de crédito, las AFP, las aseguradoras y
          las cooperativas de ahorro que el Estado autoriza, cada una con su ficha: cuánto
          tiene, quién la dirige y qué informa, tal como lo publica quien la supervisa. No
          están el mercado de valores ni los corredores de seguros, porque sus registros
          están bloqueados; tampoco los agentes de cambio, las fiduciarias, los burós de
          crédito ni las oficinas de representación, porque el sitio de la Superintendencia
          de Bancos respondió con un desafío de su cortafuegos al leerlos. Las cooperativas
          llegan hasta {corteCoop ?? "el último archivo del IDECOOP"}.
        </p>
      </header>

      <Card as="section" aria-label="El sistema en cuatro cifras">
        <TiraDeCifras className="border-y-0">
          <Cifra
            etiqueta={
              <>
                <Termino clave="eif">Entidades de intermediación</Termino> que operan
              </>
            }
            valor={formatInt(sistema.operan)}
            ancla={{ alcance: "registro", periodo: "según la Superintendencia de Bancos" }}
          />
          <Cifra
            etiqueta="Sus activos, sumados"
            valor={formatPesos(sistema.activosMillones * 1e6)}
            nota={
              sistema.corteDesde && sistema.corteHasta
                ? `Suma de lo que dice cada ficha de la SB, actualizadas entre el ${formatFecha(sistema.corteDesde)} y el ${formatFecha(sistema.corteHasta)}`
                : "Suma de lo que dice cada ficha de la SB"
            }
          />
          <Cifra
            etiqueta="En las tres mayores"
            valor={textoParticipacion(sistema.participacionMayores)}
            nota={`${sistema.mayores.map((e) => e.nombre).join(", ")}: su participación sumada, según la SB`}
          />
          <Cifra
            etiqueta={
              <>
                <Termino clave="cooperativa">Cooperativas de ahorro, crédito o servicios múltiples</Termino>
              </>
            }
            valor={formatInt(coops.cooperativasIncluidas)}
            nota={`Incorporadas por decreto de 1953 a ${corteCoop ?? "su último archivo"}, según el IDECOOP`}
          />
        </TiraDeCifras>
      </Card>

      <Suspense>
        <BuscadorUrl
          etiqueta="Buscar una entidad financiera"
          placeholder="Banreservas, Popular, COOPNAMA, un RNC…"
          ayuda={ALCANCE}
        />
      </Suspense>

      <NavFiltros etiqueta="Sector">
        <FiltrosPlegados
          total={conEntidades.length}
          visibles={
            <>
              <FiltroEnlace href={url({ sector: null })} activo={!sector}>
                {`Todas (${formatInt(base.length)})`}
              </FiltroEnlace>
              {visibles.map(chip)}
            </>
          }
          resto={resto.map(chip)}
        />
      </NavFiltros>

      {provincia && (
        <p className="text-sm text-ink-soft">
          Solo las de <span className="font-medium text-ink">{provincia.nombre}</span>: la provincia
          la publica el IDECOOP para las cooperativas; bancos, AFP y aseguradoras no la tienen.{" "}
          <Link href={url({ provincia: null })} className="font-medium text-brand-700 hover:underline">
            Quitar la provincia
          </Link>
        </p>
      )}

      {filtradas.length === 0 ? (
        <EstadoVacio
          titulo={q ? `Ninguna entidad coincide con «${q}»` : "Ninguna entidad con estos filtros"}
          accion={
            <Button asChild variant="secondary">
              {q ? (
                <Link href={`/buscar?q=${encodeURIComponent(q)}`}>Buscar «{q}» en toda la plataforma</Link>
              ) : (
                <Link href="/banca">Quitar los filtros</Link>
              )}
            </Button>
          }
        >
          La búsqueda mira el nombre, la razón social, las siglas y el RNC. Los puestos de
          bolsa, los fondos de inversión y los corredores de seguros no están: sus
          registros están bloqueados.
        </EstadoVacio>
      ) : (
        <Card as="section" aria-labelledby="entidades">
          <h2 id="entidades" className="sr-only">
            Entidades
          </h2>
          <p className="px-5 pt-4 text-sm text-ink-soft" aria-live="polite">
            <span className="font-mono tabular-nums">{formatInt(filtradas.length)}</span>{" "}
            {filtradas.length === 1 ? "entidad" : "entidades"}
            {q && (
              <>
                {" para "}
                <span className="font-medium text-ink">{`«${q}»`}</span>
              </>
            )}
            {filtradas.length > 1 ? `, ${orden}.` : "."}
          </p>
          <ul className="mt-2 border-t border-hairline">
            {vista.map((e) => (
              <FilaEntidad key={e.slug} e={e} conSector={!sector} />
            ))}
          </ul>
          {paginas > 1 && (
            <div className="border-t border-hairline px-5 py-3">
              <Paginador
                pagina={pagina}
                paginas={paginas}
                href={(n) => url({ pagina: n })}
                etiqueta="Paginación de las entidades"
              />
            </div>
          )}
        </Card>
      )}

      <Card as="section" aria-labelledby="fuera" className="p-5 sm:p-6">
        <CardTitle id="fuera">¿Qué no está aquí?</CardTitle>
        <ul className="mt-2.5 space-y-2.5 text-[15px] leading-relaxed text-ink-soft sm:text-sm">
          <li>
            <strong className="font-semibold text-ink">El mercado de valores.</strong> Puestos de
            bolsa, administradoras de fondos de inversión y emisores los registra la
            Superintendencia del Mercado de Valores, que responde con un desafío de
            Cloudflare hasta en su robots.txt. Aquí no se rodea: la vía es pedir el registro
            por la Ley 200-04 de libre acceso a la información, o que se publique en
            datos.gob.do.
          </li>
          <li>
            <strong className="font-semibold text-ink">Los corredores y agentes de seguros.</strong>{" "}
            Su registro en línea, en la Superintendencia de Seguros, está tras el mismo tipo
            de bloqueo. Las compañías de seguros sí están.
          </li>
          {coops.subagentes && (
            <li>
              <strong className="font-semibold text-ink">Los subagentes.</strong> La SB lista{" "}
              {formatInt(coops.subagentes.total)}{" "}
              <Termino clave="subagente">subagentes bancarios</Termino> y cambiarios: comercios
              que atienden a nombre de un banco o de un agente de cambio. No son entidades
              financieras y no se copian aquí; cada ficha dice cuántos tiene su entidad.
            </li>
          )}
          <li>
            <strong className="font-semibold text-ink">Las demás cooperativas.</strong> De las{" "}
            {formatInt(coops.cooperativasIncorporadas)} que el IDECOOP incorporó entre 1953 y{" "}
            {corteCoop ?? "su último archivo"}, aquí están las{" "}
            {formatInt(coops.cooperativasIncluidas)} que clasifica de ahorro, de crédito o solo
            de servicios múltiples, que es como está COOPNAMA; las agropecuarias, de
            producción, de transporte y las demás, no. El IDECOOP no publica cuáles siguen
            activas ni sus cifras, y no ha vuelto a publicar el archivo.
          </li>
          <li>
            <strong className="font-semibold text-ink">Otras supervisadas por la SB.</strong>{" "}
            Procesadoras de pagos, agentes de garantías y firmas de auditores (CARDNET,
            CEVALDOM y otras) tienen otra ficha en el sitio de la SB y no reciben dinero del
            público.
          </li>
        </ul>
        <p className="mt-3 text-sm">
          <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
            Qué leemos, con qué límites y qué está bloqueado
          </Link>
        </p>
      </Card>

      {/* A lo ancho de la página la tira va en una fila desde `lg`: la tarjeta es más baja que en /indicadores. */}
      <Suspense fallback={<Esqueleto className="h-[520px] sm:h-[420px] lg:h-80" />}>
        <IndicadoresBanca />
      </Suspense>

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuentes: las fichas de la Superintendencia de Bancos, la página de AFP de la
        Superintendencia de Pensiones, la lista de compañías de la Superintendencia de
        Seguros y el archivo de cooperativas incorporadas del IDECOOP. Instantánea del{" "}
        {formatFecha(d.generado)}; cada ficha dice la fecha de su dato. Se regenera con{" "}
        <code className="font-mono">scripts/build-banca.py</code>.
      </p>
    </div>
  );
}

/**
 * Una entidad como fila entera. En el teléfono la cifra baja debajo del
 * nombre; desde `sm` es la columna de la derecha, donde se compara.
 */
function FilaEntidad({ e, conSector }: { e: EntidadFinanciera; conSector: boolean }) {
  const info = infoSector(e.sector);
  const prov = e.sector === "cooperativa" ? provinciaDe(e) : null;
  const detalle = [
    conSector || e.sector === "cambiaria" ? (e.sector === "cambiaria" && e.tipo ? e.tipo : info.nombre) : null,
    e.siglas && e.siglas !== e.nombre ? e.siglas : null,
    e.sector === "cooperativa" && e.anioDecreto ? `incorporada en ${e.anioDecreto}` : null,
    e.sector === "cooperativa" ? (prov?.nombre ?? e.provincia) : null,
    e.sector === "afp" && e.fechaRegistro ? `registrada en ${e.fechaRegistro.slice(0, 4)}` : null,
    e.antes ? `antes ${e.antes}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const noOpera = Boolean(e.estatus) && !opera(e);

  return (
    <li className="relative border-b border-hairline last:border-0">
      <div className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <Link
            href={enlace.entidadFinanciera(e.slug)}
            className="text-[15px] font-medium leading-snug text-ink [overflow-wrap:anywhere] estira hover:text-brand-700"
          >
            {e.nombre}
          </Link>
          {(detalle || noOpera) && (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
              {noOpera && <MarcaEstado tono={tonoDeEstatus(e.estatus)}>{e.estatus}</MarcaEstado>}
              {detalle && <span>{detalle}</span>}
            </p>
          )}
        </div>
        <CifraDeFila e={e} />
      </div>
    </li>
  );
}

function CifraDeFila({ e }: { e: EntidadFinanciera }) {
  if (e.activosMillones != null) {
    return (
      <p className="shrink-0 font-mono text-xs tabular-nums text-ink-soft sm:text-right">
        <span className="text-sm text-ink">{formatPesos(e.activosMillones * 1e6)}</span>
        <span className="sr-only"> en activos</span>
        {e.participacion != null && <span className="block">{textoParticipacion(e.participacion)} del sistema</span>}
        {/* Cada ficha de la SB tiene su fecha: el ancla va con la cifra, no en una nota al pie. */}
        {e.corte && (
          <span className="block">
            <Antiguedad iso={e.corte} prefijo="datos de la SB de" />
          </span>
        )}
      </p>
    );
  }
  if (e.activosAdministradosMillones != null) {
    return (
      <p className="shrink-0 font-mono text-xs tabular-nums text-ink-soft sm:text-right">
        <span className="text-sm text-ink">{formatPesos(e.activosAdministradosMillones * 1e6)}</span>
        <span className="block">
          administrados
          {e.fideicomisos != null ? ` en ${formatInt(e.fideicomisos)} fideicomisos` : ""}
        </span>
      </p>
    );
  }
  return null;
}
