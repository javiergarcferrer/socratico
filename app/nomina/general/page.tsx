import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import {
  claveInstitucion,
  getNominaGeneral,
  mesGeneral,
  type InstitucionGeneral,
} from "@/lib/nomina-general";
import { hrefInstitucion, institucionPorId } from "@/lib/instituciones";
import { variacion } from "@/lib/cifras";
import { formatFecha, formatPesos } from "@/lib/format";
import { formatDOP, formatInt } from "@/lib/nomina";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";
import { BuscadorUrl } from "@/components/buscador-url";
import { EstadoVacio } from "@/components/estado-vacio";
import { Paginador } from "@/components/paginador";
import { Ruta } from "@/components/ruta";
import Plegable from "@/components/plegable";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { BarrasHorizontales } from "@/components/graficos";
import { coincideConsulta, recortar } from "@/lib/raiz";
import { siglasDe } from "@/lib/instituciones";

const METADATA_GENERAL: Metadata = {
  alternates: { canonical: "/nomina/general" },
  title: "Nómina general del Estado",
  description:
    "Cuántas plazas paga el Estado dominicano y cuánto le cuestan cada mes, institución por institución y cargo por cargo, según la nómina general del Ministerio de Administración Pública.",
};

/**
 * Con `?inst=` la página es la de una institución, y su pestaña y su tarjeta
 * al compartir lo dicen; sin él, la de todo el Estado.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ inst?: string }>;
}): Promise<Metadata> {
  const { inst } = await searchParams;
  if (!inst) return METADATA_GENERAL;
  const d = await getNominaGeneral();
  const i = d?.instituciones.find((o) => claveInstitucion(o.nombre) === inst);
  if (!d || !i) return METADATA_GENERAL;
  return {
    ...METADATA_GENERAL,
    title: `${i.nombre}: nómina general`,
    description: `Plazas, cargos y sueldos brutos de ${i.nombre} en ${mesGeneral(d.anio, d.mes)}, según la nómina general del Ministerio de Administración Pública, sin nombres.`,
  };
}

export const revalidate = 86400;

const CARGOS_POR_PAGINA = 50;

/** Todas las palabras, en cualquier orden y por raíz (`lib/raiz.ts`). */
function coincide(q: string, texto: string): boolean {
  return coincideConsulta(texto, q);
}

/**
 * ¿Cuánto paga el Estado cada mes? — la nómina general del MAP
 * (`lib/nomina-general.ts`), agregada sin nombres. Sin `?inst=`, el ranking de
 * instituciones; con él, los cargos de una. Todo vive en la URL.
 */
export default async function NominaGeneralPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; inst?: string; p?: string }>;
}) {
  const sp = await searchParams;
  const d = await getNominaGeneral();
  if (!d) {
    return (
      <EstadoVacio
        variante="caida"
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="No pudimos leer la nómina general"
        accion={
          <Link href="/nomina" className="text-sm font-medium text-brand-700 hover:underline">
            Ir a la foto de nómina por institución
          </Link>
        }
      >
        La copia agregada de la nómina del MAP no está disponible en este momento. No
        es que no haya datos: es que no pudimos mirar.
      </EstadoVacio>
    );
  }

  const q = recortar(sp.q, 80);
  const inst = sp.inst ? d.instituciones.find((i) => claveInstitucion(i.nombre) === sp.inst) : undefined;
  const periodo = mesGeneral(d.anio, d.mes);

  if (inst) return <Detalle inst={inst} periodo={periodo} q={q} pagina={Number(sp.p) || 1} fuente={d.fuente} generado={d.generado} />;

  const cambio = d.anterior ? variacion(d.plazas, d.anterior.plazas) : null;
  const lista = q ? d.instituciones.filter((i) => coincide(q, `${i.nombre} ${siglasDe(i.uc)}`)) : d.instituciones;
  const maxPlazas = d.instituciones[0]?.plazas ?? 1;

  return (
    <div className="space-y-5">
      <Portada
        rotulo={`Nómina general · MAP · ${periodo}`}
        titulo="¿Cuánto paga el Estado cada mes?"
        descripcion={
          <>
            Todas las plazas que las instituciones reportan al sistema de recursos
            humanos del Ministerio de Administración Pública, con su sueldo bruto:
            Educación, Salud, la Procuraduría y más de cien instituciones en un solo
            archivo mensual. Aquí no hay nombres: se cuentan plazas y se suman sueldos
            por institución y por cargo.
            {cambio && d.anterior && (
              <>
                {" "}Frente a {mesGeneral(d.anterior.anio, d.anterior.mes)}, el Estado tiene{" "}
                <span className="font-medium text-canvas">
                  {formatInt(Math.abs(cambio.abs))} plazas {cambio.abs >= 0 ? "más" : "menos"}
                </span>
                .
              </>
            )}
          </>
        }
        aviso={`Un mes: ${periodo}. No aparecen quienes no reportan al MAP: Fuerzas Armadas, Policía Nacional, Congreso, Poder Judicial, ayuntamientos, Banco Central ni JCE`}
      >
        <PortadaCifras>
          <PortadaCifra etiqueta="Plazas" valor={formatInt(d.plazas)} destacar />
          <PortadaCifra etiqueta="Masa salarial del mes" valor={formatPesos(d.masa)} />
          <PortadaCifra etiqueta="Sueldo bruto mediano" valor={formatDOP(d.mediana)} />
          <PortadaCifra etiqueta="Instituciones" valor={formatInt(d.instituciones.length)} />
        </PortadaCifras>
      </Portada>

      <Suspense>
        <BuscadorUrl
          etiqueta="Buscar una institución"
          placeholder="Educación, Salud, INAIPI…"
          ayuda={`Busca en el nombre y las siglas de las ${formatInt(d.instituciones.length)} instituciones de la nómina general, todas las palabras en cualquier orden y sin distinguir tildes.`}
        />
      </Suspense>

      {lista.length === 0 ? (
        <EstadoVacio titulo={`Ninguna institución coincide con «${q}»`}>
          Prueba con otra palabra. Si la institución no reporta al MAP, puede estar en{" "}
          <Link href="/nomina" className="font-medium text-brand-700 hover:underline">
            la foto de nómina por institución
          </Link>
          .
        </EstadoVacio>
      ) : (
        <Card as="section" className="overflow-hidden">
          <div className="px-5 pt-5 sm:px-6">
            <CardTitle>Institución por institución</CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Ordenadas por plazas; la cifra de cada fila es su número de
              plazas. Cada fila abre sus cargos.
            </p>
          </div>
          <BarrasHorizontales
            className="mt-3 border-t border-hairline"
            filas
            lineas={2}
            maximo={maxPlazas}
            etiqueta="Plazas por institución"
            barras={lista.map((i) => ({
              clave: i.nombre,
              etiqueta: i.nombre,
              titulo: `${i.nombre}: ${formatInt(i.plazas)} plazas`,
              valor: i.plazas,
              href: `/nomina/general?inst=${claveInstitucion(i.nombre)}`,
              // La masa baja al detalle: como segunda línea de la cifra le
              // quitaba a un nombre largo la mitad de la fila, y a 390 px
              // «Servicio Nacional de…» se cortaba antes de decir cuál era.
              cifra: formatInt(i.plazas),
              detalle: `${formatPesos(i.masa)} al mes · sueldo mediano ${formatDOP(i.mediana)}`,
            }))}
          />
        </Card>
      )}

      {!q && (
        <Card as="section" className="overflow-hidden">
          <div className="px-5 pt-5 sm:px-6">
            <CardTitle>Los cargos mejor pagados</CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              El sueldo bruto más alto de cada cargo en cada institución. Algunos cargos
              del servicio exterior se pagan en pesos equivalentes a un sueldo en dólares.
            </p>
          </div>
          <Plegable
            className="mt-3"
            resumen={<ListaMejorPagados filas={d.mejorPagados.slice(0, 15)} desde={0} />}
            etiqueta={`Ver los ${d.mejorPagados.length}`}
            etiquetaCerrar="Ver solo los primeros 15"
          >
            <ListaMejorPagados filas={d.mejorPagados.slice(15)} desde={15} />
          </Plegable>
        </Card>
      )}

      <Pie fuente={d.fuente} generado={d.generado} periodo={periodo} />
    </div>
  );
}

function ListaMejorPagados({
  filas,
  desde,
}: {
  filas: { sueldo: number; institucion: string; cargo: string; plazas: number; uc: number | null }[];
  desde: number;
}) {
  return (
    <ol className="divide-y divide-hairline border-t border-hairline">
      {filas.map((f, i) => (
        <li key={`${f.institucion}-${f.cargo}`} className="relative flex items-baseline gap-3 px-5 py-2.5 sm:px-6">
          <span className="w-7 shrink-0 font-mono text-xs tabular-nums text-ink-soft">{desde + i + 1}</span>
          <span className="min-w-0 flex-1">
            <Link
              href={`/nomina/general?inst=${claveInstitucion(f.institucion)}&q=${encodeURIComponent(f.cargo)}`}
              className="block text-sm leading-snug text-ink [overflow-wrap:anywhere] estira hover:text-brand-700"
            >
              {f.cargo}
            </Link>
            <span className="block text-xs text-ink-soft">
              {f.institucion}
              {f.plazas > 1 ? ` · ${formatInt(f.plazas)} plazas con este cargo` : ""}
            </span>
          </span>
          <span className="shrink-0 font-mono text-sm tabular-nums">{formatDOP(f.sueldo)}</span>
        </li>
      ))}
    </ol>
  );
}

function Detalle({
  inst,
  periodo,
  q,
  pagina,
  fuente,
  generado,
}: {
  inst: InstitucionGeneral;
  periodo: string;
  q: string;
  pagina: number;
  fuente: string;
  generado: string;
}) {
  const ficha = inst.uc != null ? institucionPorId(inst.uc) : null;
  const cargos = q ? inst.cargos.filter((c) => coincide(q, c[0])) : inst.cargos;
  const paginas = Math.max(1, Math.ceil(cargos.length / CARGOS_POR_PAGINA));
  const p = Math.min(Math.max(1, pagina), paginas);
  const vista = cargos.slice((p - 1) * CARGOS_POR_PAGINA, p * CARGOS_POR_PAGINA);
  const clave = claveInstitucion(inst.nombre);
  const cambio = inst.anterior ? variacion(inst.plazas, inst.anterior[0]) : null;
  const url = (pp: number) => {
    const u = new URLSearchParams({ inst: clave });
    if (q) u.set("q", q);
    if (pp > 1) u.set("p", String(pp));
    return `/nomina/general?${u.toString()}`;
  };

  return (
    <div className="space-y-5">
      <Ruta seccion="nomina" padre={{ href: "/nomina/general", label: "Todo el Estado" }} actual={inst.nombre} />
      <Card as="section" className="p-5 sm:p-6">
        <h1 className="font-display text-2xl text-ink sm:text-3xl">{inst.nombre}</h1>
        <p className="mt-1 text-xs text-ink-soft">Nómina general del MAP · {periodo}</p>
        <TiraDeCifras className="mt-4 lg:grid-cols-4">
          <Cifra etiqueta="Plazas" valor={formatInt(inst.plazas)} ancla={{ alcance: "instantanea", periodo }} />
          <Cifra etiqueta="Masa salarial del mes" valor={formatPesos(inst.masa)} />
          <Cifra etiqueta="Sueldo bruto mediano" valor={formatDOP(inst.mediana)} />
          <Cifra etiqueta="Nueve de cada diez ganan hasta" valor={formatDOP(inst.p90)} />
        </TiraDeCifras>
        {cambio && (
          <p className="mt-3 text-sm text-ink-soft">
            {cambio.abs === 0
              ? "Las mismas plazas que el mes anterior."
              : `${formatInt(Math.abs(cambio.abs))} plazas ${cambio.abs > 0 ? "más" : "menos"} que el mes anterior.`}
          </p>
        )}
        <p className="mt-2 text-sm text-ink-soft">
          {Object.entries(inst.estatus)
            .map(([e, n]) => `${e}: ${formatInt(n)}`)
            .join(" · ")}
        </p>
        {ficha && (
          <Button asChild variant="secondary" className="mt-4">
            <Link href={hrefInstitucion(ficha)}>Su presupuesto, compras y decretos</Link>
          </Button>
        )}
      </Card>

      <Suspense>
        <BuscadorUrl
          etiqueta="Buscar un cargo"
          placeholder="Maestro, chofer, director, enfermera…"
          ayuda={`Busca en los ${formatInt(inst.cargos.length)} cargos de esta institución, todas las palabras en cualquier orden y sin distinguir tildes.`}
        />
      </Suspense>

      {vista.length === 0 ? (
        <EstadoVacio
          titulo={`Ningún cargo coincide con «${q}»`}
          accion={
            <Button asChild variant="secondary">
              <Link href={`/nomina/general?inst=${clave}`}>Ver todos sus cargos</Link>
            </Button>
          }
        >
          Prueba con la palabra con que empieza el puesto: «maestro», «chofer»,
          «director».
        </EstadoVacio>
      ) : (
        <Card as="section" className="overflow-hidden">
          <p className="px-5 pt-4 text-xs text-ink-soft sm:px-6" aria-live="polite">
            {formatInt(cargos.length)} {cargos.length === 1 ? "cargo" : "cargos"}, de más a menos plazas.
          </p>
          <ol className="mt-2 divide-y divide-hairline border-t border-hairline">
            {vista.map(([cargo, n, masa, mediana, min, max]) => (
              <li key={cargo} className="px-5 py-3 sm:px-6">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-[15px] leading-snug text-ink [overflow-wrap:anywhere]">{cargo}</span>
                  <span className="shrink-0 text-right font-mono text-sm tabular-nums">
                    {formatInt(n)} {n === 1 ? "plaza" : "plazas"}
                    <span className="block text-xs text-ink-soft">{formatPesos(masa)}</span>
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-xs tabular-nums text-ink-soft">
                  {n === 1 || min === max ? `Sueldo ${formatDOP(mediana)}` : `Mediana ${formatDOP(mediana)} · de ${formatDOP(min)} a ${formatDOP(max)}`}
                </p>
              </li>
            ))}
          </ol>
          {paginas > 1 && (
            <div className="border-t border-hairline px-5 py-3 sm:px-6">
              <Paginador pagina={p} paginas={paginas} href={url} />
            </div>
          )}
        </Card>
      )}

      <Pie fuente={fuente} generado={generado} periodo={periodo} />
    </div>
  );
}

function Pie({ fuente, generado, periodo }: { fuente: string; generado: string; periodo: string }) {
  return (
    <p className="text-xs leading-relaxed text-ink-soft">
      Fuente:{" "}
      <a href={fuente} className="font-medium text-brand-700 hover:underline">
        Nómina Pública General del Estado, Ministerio de Administración Pública
      </a>{" "}
      (CSV de unos 60 MB), {periodo}, leída el {formatFecha(generado)}. El archivo trae
      el nombre de cada persona; aquí no se guarda ni se muestra: se cuentan plazas y
      se suman sueldos brutos. No trae el área de trabajo; para eso está{" "}
      <Link href="/nomina" className="font-medium text-brand-700 hover:underline">
        la foto por institución
      </Link>
      , que es más estrecha pero más detallada. Ver{" "}
      <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
        el estado de las fuentes
      </Link>
      .
    </p>
  );
}
