import Link from "next/link";
import type { Metadata } from "next";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";
import { NavFiltros, FiltroEnlace } from "@/components/nav-filtros";
import { EstadoVacio } from "@/components/estado-vacio";
import { Paginador } from "@/components/paginador";
import { MarcaEstado } from "@/components/marca-estado";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { enlace } from "@/lib/grafo";
import { formatFecha, formatPesos } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { hrefInstitucion, institucionPorId } from "@/lib/instituciones";
import { titulizar } from "@/lib/capitulos";
import {
  ORDEN_SENALES,
  TIPOS_SENAL,
  describirSenal,
  esTipoSenal,
  getSenales,
  type Senal,
  type Senales,
  type TipoSenal,
} from "@/lib/senales";

export const metadata: Metadata = {
  alternates: { canonical: "/proveedores/senales" },
  title: "Señales de las compras públicas",
  description:
    "Contratos adjudicados con una medida de la DGCP vigente, empresas recién iniciadas con contratos grandes, RNC inactivos, instituciones que concentran sus compras en un proveedor o compran sobre todo por excepción: cinco reglas escritas sobre el registro entero de la DGCP.",
};

export const revalidate = 86400;

const POR_PAGINA = 30;

type Fila = {
  senal: Senal;
  clave: string;
  nombre: string;
  href: string | null;
  /** Persona natural: la fila no se ofrece a los buscadores (Ley 172-13). */
  fisica: boolean;
};

/** El monto que ordena: lo que la señal pone en juego. */
const peso = (s: Senal) => s.monto;

function filas(d: Senales): Fila[] {
  const out: Fila[] = [];
  for (const [rpe, p] of Object.entries(d.proveedores)) {
    for (const s of p.senales) {
      out.push({ senal: s, clave: `p${rpe}${s.tipo}${out.length}`, nombre: p.nombre || `RPE ${rpe}`, href: enlace.proveedor(rpe), fisica: p.fisica });
    }
  }
  for (const [uc, i] of Object.entries(d.instituciones)) {
    const inst = institucionPorId(uc);
    for (const s of i.senales) {
      out.push({
        senal: s,
        clave: `i${uc}${s.tipo}`,
        nombre: inst?.nombre ?? titulizar(i.nombre),
        href: inst ? hrefInstitucion(inst) : null,
        fisica: s.tipo === "concentracion" && s.fisica,
      });
    }
  }
  return out.sort((a, b) => peso(b.senal) - peso(a.senal));
}

type Props = { searchParams: Promise<{ tipo?: string; p?: string }> };

/**
 * ¿Qué patrones del registro de compras merecen revisión? — las cinco reglas
 * de `lib/senales.ts` sobre el registro entero de la DGCP, por proveedor y por
 * institución. Filtro y página viven en la URL; cada fila lleva a la ficha,
 * donde la señal se lee junto a su historia.
 */
export default async function SenalesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const datos = await getSenales();

  if (!datos) {
    return (
      <EstadoVacio
        variante="caida"
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="No pudimos leer las señales de las compras"
        accion={
          <Button asChild variant="secondary">
            <Link href="/historico">Ver la historia de las compras</Link>
          </Button>
        }
      >
        La instantánea de señales no está disponible ahora mismo. La historia de las compras y la
        ficha de cada proveedor e institución siguen en pie.
      </EstadoVacio>
    );
  }

  const tipo: TipoSenal | null = esTipoSenal(sp.tipo) ? sp.tipo : null;
  const todas = filas(datos);
  const cuenta = (t: TipoSenal) => todas.filter((f) => f.senal.tipo === t).length;
  const elegidas = tipo ? todas.filter((f) => f.senal.tipo === tipo) : todas;
  const paginas = Math.max(1, Math.ceil(elegidas.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Number(sp.p) || 1), paginas);
  const vista = elegidas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const url = (t: TipoSenal | null, p?: number) => {
    const u = new URLSearchParams();
    if (t) u.set("tipo", t);
    if (p && p > 1) u.set("p", String(p));
    const s = u.toString();
    return s ? `/proveedores/senales?${s}` : "/proveedores/senales";
  };
  const r = datos.reglas;
  const proveedores = Object.keys(datos.proveedores).length;
  const instituciones = Object.keys(datos.instituciones).length;

  return (
    <div className="space-y-5">
      <Portada
        rotulo={`Registro de compras de la DGCP · contratos hasta el ${formatFecha(datos.corte)} · calculado el ${formatFecha(datos.generado)}`}
        titulo="¿Qué patrones del registro de compras merecen revisión?"
        descripcion={
          <>
            Cinco reglas escritas, aplicadas a todos los contratos y procesos registrados desde 2015,
            a las medidas de la DGCP y al padrón de la DGII. Una señal no es una acusación ni un
            hallazgo de irregularidad: es un hecho del registro que cumple una regla, con las cifras
            para comprobarlo. Que un proveedor no salga aquí no certifica nada.
          </>
        }
      >
        <PortadaCifras>
          <PortadaCifra etiqueta="Señales" valor={formatInt(todas.length)} destacar />
          <PortadaCifra etiqueta="Proveedores con señal" valor={formatInt(proveedores)} />
          <PortadaCifra etiqueta="Instituciones con señal" valor={formatInt(instituciones)} />
          <PortadaCifra etiqueta="Adjudicados bajo una medida" valor={formatInt(cuenta("medida"))} />
        </PortadaCifras>
      </Portada>

      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-ink-soft">Cada filtro dice cuántas señales deja.</p>
        <NavFiltros etiqueta="Qué señal">
          <FiltroEnlace href={url(null)} activo={!tipo}>
            {`Todas · ${formatInt(todas.length)}`}
          </FiltroEnlace>
          {ORDEN_SENALES.map((t) => (
            <FiltroEnlace key={t} href={url(t)} activo={tipo === t}>
              {`${TIPOS_SENAL[t].etiqueta} · ${formatInt(cuenta(t))}`}
            </FiltroEnlace>
          ))}
        </NavFiltros>
        {tipo && <p className="text-sm leading-relaxed text-ink-soft">{TIPOS_SENAL[tipo].llano}</p>}
      </div>

      {vista.length === 0 ? (
        <EstadoVacio
          titulo="Ninguna señal de ese tipo"
          accion={
            <Button asChild variant="secondary">
              <Link href="/proveedores/senales">Ver todas las señales</Link>
            </Button>
          }
        >
          Ningún proveedor ni institución cumple esa regla en este corte.
        </EstadoVacio>
      ) : (
        <Card as="section" aria-labelledby="lista-senales">
          <CardHeader>
            <CardTitle id="lista-senales" aria-live="polite">
              {`${formatInt(elegidas.length)} ${elegidas.length === 1 ? "señal" : "señales"}`}
            </CardTitle>
            <CardAction>el mayor monto primero</CardAction>
          </CardHeader>
          <ol>
            {vista.map((f) => (
              <FilaSenal key={f.clave} f={f} datos={datos} />
            ))}
          </ol>
          {paginas > 1 && (
            <div className="border-t border-hairline px-5 py-3">
              <Paginador
                pagina={pagina}
                paginas={paginas}
                href={(n) => url(tipo, n)}
                etiqueta="Paginación de las señales"
              />
            </div>
          )}
        </Card>
      )}

      <Card as="section" aria-labelledby="reglas" className="p-5 sm:p-6">
        <CardTitle id="reglas" className="text-[15px]">
          ¿Cuáles son las reglas?
        </CardTitle>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-ink">
          <li>
            <span className="font-semibold">{TIPOS_SENAL.medida.etiqueta}.</span> Contratos
            adjudicados después de la fecha de una medida de la DGCP que impide contratar y antes de
            su fin. De una medida registrada más de una vez cuenta solo el tramo en que todas sus filas
            coinciden; una medida sin fin sobre un registro que hoy está activo no se usa, porque no
            se sabe cuándo terminó.
          </li>
          <li>
            <span className="font-semibold">{TIPOS_SENAL.nueva.etiqueta}.</span> Primer contrato en
            pesos registrado desde 2015 a
            menos de {formatInt(r.diasNueva)} días del inicio de operaciones ante la DGII y{" "}
            {formatPesos(r.montoNueva)} o más en los doce meses siguientes. No cuenta a los
            consorcios, que nacen para una licitación.
          </li>
          <li>
            <span className="font-semibold">{TIPOS_SENAL.padron.etiqueta}.</span> Suspendida, de
            baja o en cese temporal en el padrón de la DGII del {formatFecha(datos.cortePadron)}, con
            contratos en los doce meses anteriores.
          </li>
          <li>
            <span className="font-semibold">{TIPOS_SENAL.concentracion.etiqueta}.</span> Desde el{" "}
            {formatFecha(r.desdeConcentracion)}, un proveedor con el {r.pctConcentracion} % o más de
            lo contratado por una institución que contrató {formatPesos(r.montoConcentracion)} o más.
            No se emite si descansa en un solo contrato de más de {formatInt(r.vecesMediana)} veces el
            contrato mediano del proveedor, que puede ser un error de captura (
            {formatInt(r.concentracionDudosas)} en este corte). Solo cuentan los contratos cuyo
            prefijo identifica a una sola institución.
          </li>
          <li>
            <span className="font-semibold">{TIPOS_SENAL.excepcion.etiqueta}.</span> En doce meses de
            procesos publicados, el {r.pctExcepcion} % o más del monto estimado por excepción, en una
            institución que publicó {formatPesos(r.montoExcepcion)} o más. De las{" "}
            {formatInt(r.institucionesExcepcion)} que pasan ese monto, la mediana es{" "}
            {r.medianaExcepcion.toLocaleString("es-DO")} %.
          </li>
        </ul>
      </Card>

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuente: tablas completas de contratos y procesos de los datos abiertos de la DGCP (contratos
        hasta el {formatFecha(datos.corte)}, procesos hasta el {formatFecha(datos.corteProcesos)}),
        su tabla de medidas sobre proveedores (hasta el {formatFecha(datos.corteMedidas)}) y el padrón
        de contribuyentes de la DGII (al {formatFecha(datos.cortePadron)}). Valor contratado en pesos,
        no pagado; sin contratos cancelados, en otras monedas ni de RD$&nbsp;10 mil millones o más. La
        institución de un contrato se deduce del prefijo de su código, como en{" "}
        <Link href="/historico" className="font-medium text-brand-700 hover:underline">
          la historia de las compras
        </Link>
        : en la regla de concentración no cuentan los contratos cuyo prefijo no identifica a una sola
        institución (el mayor, el del MOPC con la OPRET).{" "}
        <a href="/data/senales.json" download className="font-medium text-brand-700 hover:underline">
          Descargar los datos (JSON)
        </a>{" "}
        ·{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          Estado de las fuentes
        </Link>
      </p>
    </div>
  );
}

function FilaSenal({ f, datos }: { f: Fila; datos: Senales }) {
  const d = TIPOS_SENAL[f.senal.tipo];
  return (
    <li className="relative border-b border-hairline last:border-0">
      <div className="px-5 py-3.5" {...(f.fisica ? { "data-nosnippet": "" } : {})}>
        {f.href ? (
          <Link
            href={f.href}
            className="text-[15px] font-medium leading-snug text-ink [overflow-wrap:anywhere] estira hover:text-brand-700"
          >
            {f.nombre}
          </Link>
        ) : (
          <p className="text-[15px] font-medium leading-snug text-ink [overflow-wrap:anywhere]">{f.nombre}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <MarcaEstado tono="aviso">{d.etiqueta}</MarcaEstado>
          <span className="font-mono text-xs tabular-nums text-ink-soft">{formatPesos(f.senal.monto)}</span>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-ink">{describirSenal(f.senal, datos.reglas)}</p>
        <p className="mt-0.5 text-xs text-ink-soft">{d.sujeto === "proveedor" ? "Proveedor" : "Institución"}</p>
      </div>
    </li>
  );
}
