import Link from "next/link";
import type { Metadata } from "next";
import { muestrearContratos, type AgregadoContrato } from "@/lib/dgcp";
import { formatMonto, formatFecha, formatMes, tituloLegible } from "@/lib/format";
import { formatCompactDOP, formatInt } from "@/lib/nomina";
import Antiguedad from "@/components/antiguedad";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { BarrasHorizontales } from "@/components/graficos";
import { EstadoVacio } from "@/components/estado-vacio";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";
import { Button } from "@/components/ui/button";
import { IconDownload } from "@/components/icons";
import { hrefInstitucion, institucionPorId } from "@/lib/instituciones";
import { enlace } from "@/lib/grafo";

export const metadata: Metadata = {
  alternates: { canonical: "/contratos" },
  title: "Histórico de contrataciones",
  description:
    "Qué está adjudicando el Estado dominicano: montos, adjudicatarios e instituciones sobre los contratos más recientes registrados en la DGCP.",
};

export const revalidate = 1800;

/** Páginas del registro de contratos a escanear (1000 c/u, ~8 días c/u). */
const PAGINAS = 6;

export default async function ContratosPage() {
  const r = await muestrearContratos(PAGINAS).catch(() => null);

  if (!r || r.escaneados === 0) {
    return (
      <EstadoVacio
        variante="caida"
        como="h1"
        titulo="El registro de contratos no respondió"
        className="mx-auto max-w-2xl"
        accion={
          <Button asChild variant="secondary">
            <Link href="/historico">Ver la historia completa desde 2015</Link>
          </Button>
        }
      >
        La API de contratos de la DGCP está caída o no devolvió datos. Vuelve en
        unos minutos; mientras, la historia agregada desde 2015 sigue en pie,
        porque sale de una copia descargada.
      </EstadoVacio>
    );
  }

  const maxMes = Math.max(1, ...r.porMes.map((m) => m.monto));
  const promedio = r.conMonto > 0 ? r.montoTotal / r.conMonto : 0;

  const kpis = [
    { etiqueta: "Monto adjudicado (muestra)", valor: formatCompactDOP(r.montoTotal), destacar: true },
    { etiqueta: "Contratos con monto", valor: formatInt(r.conMonto) },
    { etiqueta: "Adjudicación promedio", valor: formatCompactDOP(promedio) },
    { etiqueta: "Registro completo", valor: formatInt(r.totalRegistro) },
  ];

  return (
    <div className="space-y-5">
      {/* Hero */}
      <Portada
        rotulo="Contratos adjudicados · se actualiza cada 30 min"
        aviso={
          r.truncado
            ? `Muestra · ${formatInt(r.escaneados)} de ${formatInt(r.totalRegistro)} contratos`
            : undefined
        }
        titulo="¿Qué está contratando el Estado?"
        descripcion={
          <>
            Sobre los {formatInt(r.escaneados)} contratos más recientes del
            registro de la DGCP
            {r.desde && r.hasta && (
              <>
                {" "}
                (del {formatFecha(r.desde)} al {formatFecha(r.hasta)})
              </>
            )}
            .
          </>
        }
      >
        <PortadaCifras>
          {kpis.map((k) => (
            <PortadaCifra
              key={k.etiqueta}
              etiqueta={k.etiqueta}
              valor={k.valor}
              destacar={k.destacar}
            />
          ))}
        </PortadaCifras>
      </Portada>

      {/* Tendencia mensual */}
      {r.porMes.length > 1 && (
        <Card as="section" className="p-6">
          <CardTitle>Monto adjudicado por mes</CardTitle>
          <p className="mt-0.5 text-xs text-ink-soft">
            Dentro de la ventana escaneada; los meses de los extremos pueden estar
            incompletos.
          </p>
          <BarrasHorizontales
            className="mt-4"
            forma="periodo"
            maximo={maxMes}
            etiqueta="Monto adjudicado por mes"
            barras={r.porMes.map((m) => ({
              clave: m.mes,
              etiqueta: <time dateTime={m.mes}>{formatMes(m.mes)}</time>,
              titulo: `${formatMes(m.mes)}: ${formatMonto(m.monto, "DOP")} en ${nContratos(m.n)}`,
              valor: m.monto,
              cifra: formatMonto(m.monto, "DOP"),
              detalle: nContratos(m.n),
            }))}
          />
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <RankingContratos
          titulo="Mayores adjudicatarios"
          nota="Enlazan a su perfil"
          items={r.topAdjudicatarios}
          hrefDe={(a) => (a.rpe ? enlace.proveedor(a.rpe) : undefined)}
        />
        <RankingContratos
          titulo="Instituciones que más adjudican"
          nota="Enlazan a su ficha"
          items={r.topInstituciones}
          hrefDe={(a) => {
            const inst = a.codigo ? institucionPorId(a.codigo) : null;
            return inst ? hrefInstitucion(inst) : undefined;
          }}
        />
      </div>

      {/* Detalle reciente */}
      <Card as="section">
        <CardHeader>
          <CardTitle>Adjudicaciones más recientes</CardTitle>
          <CardAction>{r.recientes.length}</CardAction>
        </CardHeader>
        <ul className="divide-y divide-hairline">
          {/*
            La fila entera lleva al proceso.

            Antes el enlace al proceso era un «ver proceso →» de 12 px al final
            de una línea de metadatos que en un teléfono ya venía envuelta en
            tres renglones: el objetivo acababa en cualquier sitio de la fila y
            medía dieciséis píxeles de alto. Ahora el enlace del título se
            estira sobre la fila —el mismo recurso de la tarjeta de proceso— y
            el del proveedor, que lleva a otro sitio, se eleva por encima.
          */}
          {r.recientes.map((c, i) => (
            <li
              key={`${c.codigo_contrato}-${i}`}
              className="relative px-5 py-3 transition-colors hover:bg-brand-50/40"
            >
              {/*
                Dos renglones de título: con uno, «Compra de insumos medicos
                par…» se repetía cinco veces y lo que distinguía una compra de
                otra quedaba cortado. El proveedor va en su renglón y la
                institución con la fecha en el siguiente, en texto corrido: un
                separador en flex quedaba colgando al final de la línea.
              */}
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={enlace.proceso(c.codigo_proceso)}
                  title={c.descripcion || c.codigo_contrato}
                  className="line-clamp-2 min-w-0 break-words text-sm font-medium leading-snug text-ink estira hover:text-brand-700"
                >
                  {tituloLegible(c.descripcion || c.codigo_contrato)}
                </Link>
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-ink">
                  {formatMonto(c.valor_contratado, c.divisa)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-ink-soft">
                {c.rpe ? (
                  <Link
                    href={enlace.proveedor(c.rpe)}
                    className="relative z-10 inline-block py-1 font-medium text-brand-600 hover:underline"
                  >
                    {c.razon_social}
                  </Link>
                ) : (
                  <span className="inline-block py-1">{c.razon_social}</span>
                )}
              </p>
              <p className="text-xs leading-relaxed text-ink-soft">
                <UnidadDeCompra codigo={c.codigo_unidad_compra} nombre={c.unidad_compra} />
                <span className="whitespace-nowrap">
                  <Sep /> <Antiguedad iso={c.fecha_adjudicacion} prefijo="Adjudicado" />
                </span>
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-soft">
          La muestra entera, contrato por contrato, para abrirla en una hoja de cálculo.
        </p>
        <Button asChild variant="secondary" size="sm" className="h-10 shrink-0 sm:h-9">
          <a
            href="/contratos/csv"
            download
            title={`Descarga los ${formatInt(r.escaneados)} contratos de la muestra, con todos sus estados`}
          >
            <IconDownload className="h-4 w-4" /> CSV ({formatInt(r.escaneados)}, muestra)
          </a>
        </Button>
      </div>

      <p className="px-1 text-xs leading-relaxed text-ink-soft">
        Muestra de los {formatInt(r.escaneados)} contratos más recientes de{" "}
        {formatInt(r.totalRegistro)} en el registro de la DGCP: el API sirve los
        contratos por recencia y no admite filtro por fecha, así que estas cifras
        describen la ventana reciente, no todo el histórico. Los montos suman solo
        adjudicaciones vigentes (activas, modificadas o cerradas), sin las
        canceladas ni rescindidas.{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          Estado y límites de las fuentes
        </Link>
        .
      </p>
    </div>
  );
}

/** El nombre de la unidad de compra, con enlace a su ficha si está en el cruce. */
function UnidadDeCompra({ codigo, nombre }: { codigo: string; nombre: string }) {
  const inst = codigo ? institucionPorId(codigo) : null;
  if (!inst) return <span>{nombre} </span>;
  return (
    <>
      <Link href={hrefInstitucion(inst)} className="relative z-10 hover:text-brand-700 hover:underline">
        {nombre}
      </Link>{" "}
    </>
  );
}

function nContratos(n: number): string {
  return `${formatInt(n)} ${n === 1 ? "contrato" : "contratos"}`;
}

function Sep() {
  return (
    <span aria-hidden className="text-hairline">
      ·
    </span>
  );
}

function RankingContratos({
  titulo,
  nota,
  items,
  hrefDe,
}: {
  titulo: string;
  nota?: string;
  items: AgregadoContrato[];
  hrefDe?: (a: AgregadoContrato) => string | undefined;
}) {
  const max = Math.max(1, ...items.map((a) => a.monto));
  return (
    <Card as="section" className="p-6">
      <div className="flex items-baseline justify-between gap-2">
        <CardTitle>{titulo}</CardTitle>
        {nota && <span className="text-xs text-ink-soft">{nota}</span>}
      </div>
      <BarrasHorizontales
        className="mt-3"
        maximo={max}
        lineas={2}
        etiqueta={titulo}
        barras={items.map((a) => ({
          clave: a.codigo ?? a.clave,
          etiqueta: a.clave,
          titulo: `${a.clave}: ${formatMonto(a.monto, "DOP")} en ${nContratos(a.n)}`,
          valor: a.monto,
          cifra: formatMonto(a.monto, "DOP"),
          /* La cuenta decía «1 · RD$…» sin unidad: ahora la dice debajo. */
          detalle: nContratos(a.n),
          href: hrefDe?.(a),
        }))}
      />
    </Card>
  );
}
