"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createParser,
  debounce,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import {
  IconBuilding,
  IconChartBar,
  IconCoins,
  IconDownload,
  IconLayers,
  IconMapPin,
  IconSearch,
  IconTrendingUp,
  IconX,
} from "@/components/icons";
import {
  aggregateBy,
  bucketOf,
  CARGOS_COMPARABLES,
  cargoBase,
  COL,
  estaAtrasada,
  patronCargo,
  textoAtraso,
  formatCompactDOP,
  formatDOP,
  formatInt,
  loadNomina,
  median,
  periodLabel,
  SALARY_BUCKETS,
  type GroupStat,
  type NominaData,
  type Row,
} from "@/lib/nomina";
import { BarrasHorizontales, Multiples, SerieTemporal, maximoComun } from "@/components/graficos";
import { DataTable, type SortDir, type SortKey } from "./data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EstadoVacio } from "@/components/estado-vacio";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { agujas, plano, pruebas } from "@/lib/raiz";
import { claves } from "@/lib/consultas";
import { useRebotado } from "@/components/rebotado";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");


type View = "resumen" | "tabla" | "comparar";
const VISTAS: View[] = ["resumen", "tabla", "comparar"];
type Metric = "total" | "count" | "avg";
type IconType = React.ComponentType<{ className?: string }>;

/**
 * Enlace de cada código de nómina a la ficha de su institución. Lo calcula el
 * servidor (`app/nomina/page.tsx`) porque el cruce de instituciones pesa
 * 114 KB y no tiene por qué viajar al navegador para once enlaces.
 */
export type FichasNomina = Record<string, string>;

/*
  El estado del explorador vive en la URL —`?q=`, `?inst=`, `?cargo=`,
  `?vista=`— para que una vista se comparta y se vuelva a ella: la ficha de
  una institución enlaza `/nomina?inst=MSP`, y la paleta ⌘K manda
  `/nomina?q=<texto>`. Los nombres `q` e `inst` son contrato con esas dos
  puertas; no se cambian.
*/
export function Explorer({ fichas = {} }: { fichas?: FichasNomina }) {
  /*
    La instantánea entera, una vez por pestaña: no cambia hasta el próximo
    despliegue, así que volver a `/nomina` no la pide otra vez.
  */
  const { data, error } = useQuery({
    queryKey: claves.nomina,
    queryFn: () => loadNomina(),
    staleTime: Infinity,
    // Un archivo estático: si falla, es la red del lector, y un reintento vale.
    retry: 1,
  });

  if (error) {
    return (
      <Card className="p-6 text-sm text-ink-soft">{error.message}</Card>
    );
  }
  if (!data) return <ExplorerEsqueleto />;
  return <ExplorerReady data={data} fichas={fichas} />;
}

/**
 * La silueta del explorador —barra de filtros y seis indicadores— en lugar de
 * un rótulo suelto: el contenido cae en su sitio sin mover nada. También es
 * el `fallback` del `Suspense` de la página, mientras se leen los parámetros.
 */
export function ExplorerEsqueleto() {
  return (
      <div role="status" aria-busy="true" className="space-y-5">
        <span className="sr-only">Cargando la nómina consolidada…</span>
        {/*
          Las alturas son las del contenido real a cada ancho: hasta `lg` la
          barra de filtros apila cuatro controles de 44 px (244 px) y solo en una
          sola fila mide 76; cada indicador crece cuando su rótulo se parte en
          dos líneas, que es lo normal a 390 px. Con las alturas de escritorio
          la página daba un tirón de media pantalla al llegar el JSON.
        */}
        <Skeleton className="h-[244px] rounded-lg border border-hairline bg-surface lg:h-20" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-[123px] rounded-lg border border-hairline bg-surface lg:h-28"
            />
          ))}
        </div>
        <div className="space-y-2">
          <Skeleton className="h-11 w-56 rounded-lg bg-hairline/70" />
          <Skeleton className="h-4 w-40 bg-hairline/70" />
        </div>
        <Skeleton className="h-[845px] rounded-lg border border-hairline bg-surface lg:h-[36rem]" />
      </div>
  );
}

/** Índice de la institución por su código (`MSP`, `msp`), o `null`. */
function indiceDe(data: NominaData, codigo: string | null): number | null {
  if (!codigo) return null;
  const i = data.instituciones.findIndex((o) => o.codigo.toLowerCase() === codigo.toLowerCase());
  return i < 0 ? null : i;
}

/**
 * Un texto libre en la URL: se escribe sin los espacios de los bordes, y un
 * texto que solo tiene espacios cuenta como vacío (no deja `?q=+`). El valor
 * del campo conserva lo que se tecleó —el espacio antes de la palabra
 * siguiente no puede desaparecer bajo el dedo—; solo la URL se recorta.
 */
const parseAsTexto = createParser({
  parse: (v) => v,
  serialize: (v: string) => v.trim(),
  eq: (a, b) => a.trim() === b.trim(),
});

/*
  `q` y `cargo` se escriben mientras se teclea: el estado cambia al instante
  —el campo lo muestra— y la URL espera 250 ms a que el dedo se detenga, la
  misma espera con que el filtro barre las filas. Cada cambio **reemplaza** la
  entrada del historial: una tecla no es una navegación.
*/
const URL_NOMINA = {
  q: parseAsTexto.withDefault("").withOptions({ limitUrlUpdates: debounce(250) }),
  inst: parseAsString,
  cargo: parseAsTexto.withDefault("").withOptions({ limitUrlUpdates: debounce(250) }),
  vista: parseAsStringLiteral(VISTAS).withDefault("resumen"),
};

function ExplorerReady({ data, fichas }: { data: NominaData; fichas: FichasNomina }) {
  /*
    El estado del explorador **es** la URL, a través de `nuqs`: lo que llega
    de fuera —un enlace `/nomina?inst=JAC` pulsado en esta misma página,
    «atrás»— se ve sin re-aplicarlo a mano. Antes había un eco que suprimir:
    se recordaba la cadena escrita con `replaceState` para no confundirla con
    una navegación ajena.
  */
  const [url, setUrl] = useQueryStates(URL_NOMINA);
  const view: View = url.vista;
  const setView = (v: View) => setUrl({ vista: v });

  // ---- filters
  const queryInput = url.q;
  const setQueryInput = (v: string) => setUrl({ q: v });
  const query = useRebotado(queryInput.trim(), 250);
  const instId = useMemo(() => indiceDe(data, url.inst), [data, url.inst]);
  const setInstId = (id: number | null) =>
    setUrl({ inst: id != null ? (data.instituciones[id]?.codigo ?? null) : null });
  const cargoInput = url.cargo;
  const setCargoInput = (v: string) => setUrl({ cargo: v });
  const cargo = useRebotado(cargoInput.trim(), 250);
  const [salMin, setSalMin] = useState<string>("");
  const [salMax, setSalMax] = useState<string>("");

  // ---- raw-table sort
  const [sortKey, setSortKey] = useState<SortKey>("sueldo");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ---- ranking metric for instituciones/áreas
  const [metric, setMetric] = useState<Metric>("total");

  // ---- cargo → qué nombres de cargo del diccionario entran
  const cargoPatron = useMemo(() => patronCargo(cargo), [cargo]);
  const cargoBases = useMemo(() => data.cargos.map(cargoBase), [data]);
  const cargoEntra = useMemo(
    () => (cargoPatron ? cargoBases.map((b) => cargoPatron.test(b)) : null),
    [cargoPatron, cargoBases],
  );

  // El cargo va también con su base expandida: «ENC. COMPRAS» se encuentra
  // buscando «encargado compras».
  const { areaNorm, cargoNorm, instNorm } = useMemo(
    () => ({
      areaNorm: data.areas.map((a) => plano(a)),
      cargoNorm: data.cargos.map((c) => plano(`${c} ${cargoBase(c)}`)),
      instNorm: data.instituciones.map((i) => plano(`${i.codigo} ${i.nombre}`)),
    }),
    [data],
  );

  // Cada palabra de la búsqueda, con sus aciertos en cada diccionario. Las
  // palabras pueden repartirse entre campos: «médico salud» es un cargo y
  // una institución (`lib/raiz.ts`).
  const porPalabra = useMemo(() => {
    if (!query) return null;
    const ps = pruebas(agujas(query));
    if (ps.length === 0) return null;
    return ps.map((p) => ({
      area: areaNorm.map(p),
      cargo: cargoNorm.map(p),
      inst: instNorm.map(p),
    }));
  }, [query, areaNorm, cargoNorm, instNorm]);

  // Los controles responden al toque; el barrido de miles de filas va detrás,
  // en una prioridad menor, y el teclado nunca se queda esperando al filtro.
  const instFiltro = useDeferredValue(instId);
  const salMinFiltro = useDeferredValue(salMin);
  const salMaxFiltro = useDeferredValue(salMax);
  const min = salMinFiltro ? Number(salMinFiltro) : null;
  const max = salMaxFiltro ? Number(salMaxFiltro) : null;

  // ---- core filter
  const filtered = useMemo(() => {
    const out: Row[] = [];
    for (const r of data.rows) {
      if (instFiltro != null && r[COL.INST] !== instFiltro) continue;
      if (cargoEntra && !cargoEntra[r[COL.CARGO]]) continue;
      const s = r[COL.SUELDO];
      if (min != null && s < min) continue;
      if (max != null && s > max) continue;
      if (
        porPalabra &&
        !porPalabra.every((w) => w.area[r[COL.AREA]] || w.cargo[r[COL.CARGO]] || w.inst[r[COL.INST]])
      ) {
        continue;
      }
      out.push(r);
    }
    return out;
  }, [data.rows, instFiltro, cargoEntra, min, max, porPalabra]);

  // ---- el mismo cargo en cada institución
  /*
    La comparación mira solo el cargo: ignora a propósito la institución, la
    búsqueda y el rango de sueldo, porque su pregunta es «cuánto paga cada
    institución por este puesto» y un filtro de institución la dejaría en una
    sola fila.
  */
  const comparacion = useMemo(() => {
    if (!cargoEntra) return null;
    const porInst = new Map<number, number[]>();
    const nombres = new Map<number, number>();
    for (const r of data.rows) {
      if (!cargoEntra[r[COL.CARGO]]) continue;
      const lista = porInst.get(r[COL.INST]) ?? [];
      lista.push(r[COL.SUELDO]);
      porInst.set(r[COL.INST], lista);
      nombres.set(r[COL.CARGO], (nombres.get(r[COL.CARGO]) ?? 0) + 1);
    }
    const filas = [...porInst.entries()]
      .map(([inst, sueldos]) => ({
        inst,
        plazas: sueldos.length,
        mediana: median(sueldos),
        min: Math.min(...sueldos),
        max: Math.max(...sueldos),
      }))
      .sort((a, b) => b.mediana - a.mediana);
    const denominaciones = [...nombres.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => data.cargos[c]);
    return { filas, denominaciones, plazas: filas.reduce((s, f) => s + f.plazas, 0) };
  }, [cargoEntra, data]);

  // ---- los puestos mejor pagados de la foto (cargo + institución)
  const mejorPagados = useMemo(() => {
    const acc = new Map<string, { inst: number; cargo: number; sueldo: number; plazas: number }>();
    for (const r of data.rows) {
      const k = `${r[COL.INST]}:${r[COL.CARGO]}`;
      const g = acc.get(k);
      if (!g) acc.set(k, { inst: r[COL.INST], cargo: r[COL.CARGO], sueldo: r[COL.SUELDO], plazas: 1 });
      else {
        g.plazas++;
        if (r[COL.SUELDO] > g.sueldo) g.sueldo = r[COL.SUELDO];
      }
    }
    return [...acc.values()].sort((a, b) => b.sueldo - a.sueldo).slice(0, 15);
  }, [data]);

  // ---- KPIs
  const kpis = useMemo(() => {
    let total = 0;
    const instSet = new Set<number>();
    const cargoSet = new Set<number>();
    const salaries: number[] = [];
    for (const r of filtered) {
      total += r[COL.SUELDO];
      salaries.push(r[COL.SUELDO]);
      instSet.add(r[COL.INST]);
      cargoSet.add(r[COL.CARGO]);
    }
    const count = filtered.length;
    return {
      count,
      total,
      avg: count ? total / count : 0,
      median: median(salaries),
      insts: instSet.size,
      cargos: cargoSet.size,
    };
  }, [filtered]);

  // ---- rankings + distribution
  const topInsts = useMemo(
    () => rankBy(aggregateBy(filtered, COL.INST), metric, 11),
    [filtered, metric],
  );
  const topAreas = useMemo(
    () => rankBy(aggregateBy(filtered, COL.AREA), "total", 12),
    [filtered],
  );
  const topCargos = useMemo(
    () => rankBy(aggregateBy(filtered, COL.CARGO), "total", 12),
    [filtered],
  );

  /** Escala común de los dos paneles de gasto (áreas y cargos). */
  const escalaGasto = maximoComun([topAreas.map((g) => g.total), topCargos.map((g) => g.total)]);

  const histogram = useMemo(() => {
    const counts = new Array(SALARY_BUCKETS.length).fill(0);
    for (const r of filtered) counts[bucketOf(r[COL.SUELDO])]++;
    return SALARY_BUCKETS.map((b, i) => ({ label: b.label, count: counts[i] }));
  }, [filtered]);

  // ---- sorted rows for the table
  const sorted = useMemo(() => {
    const arr = filtered.slice();
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
      sueldo: (a, b) => (a[COL.SUELDO] - b[COL.SUELDO]) * dir,
      institucion: (a, b) =>
        data.instituciones[a[COL.INST]].codigo.localeCompare(
          data.instituciones[b[COL.INST]].codigo,
          "es",
        ) * dir,
      area: (a, b) =>
        data.areas[a[COL.AREA]].localeCompare(data.areas[b[COL.AREA]], "es") * dir,
      cargo: (a, b) =>
        data.cargos[a[COL.CARGO]].localeCompare(data.cargos[b[COL.CARGO]], "es") * dir,
    };
    arr.sort(cmp[sortKey]);
    return arr;
  }, [filtered, sortKey, sortDir, data]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "sueldo" ? "desc" : "asc");
    }
  };

  const exportCsv = () => {
    const head = "Institución,Área,Cargo,Sueldo,Período\n";
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const body = sorted
      .map((r) => {
        const inst = data.instituciones[r[COL.INST]];
        return [
          esc(inst.nombre),
          esc(data.areas[r[COL.AREA]]),
          esc(data.cargos[r[COL.CARGO]]),
          r[COL.SUELDO],
          `${data.monthNames[inst.mes - 1]} ${inst.anio}`,
        ].join(",");
      })
      .join("\n");
    const blob = new Blob([head + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nomina-filtrada.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasFilters = !!query || instId != null || !!cargoInput || !!salMin || !!salMax;
  const reset = () => {
    setQueryInput("");
    setInstId(null);
    setCargoInput("");
    setSalMin("");
    setSalMax("");
  };

  const metricFormat = metric === "total" ? formatCompactDOP : formatInt;
  const instSel = instId != null ? data.instituciones[instId] : null;

  return (
    <div className="space-y-5">
      {/* ---------- filter bar ---------- */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Buscar por institución, área o cargo</span>
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <Input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Buscar por institución, área o cargo…"
              className="bg-canvas pl-10 pr-9"
            />
            {queryInput && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setQueryInput("")}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-ink-soft"
              >
                <IconX className="h-4 w-4" />
                <span className="sr-only">Limpiar búsqueda</span>
              </Button>
            )}
          </label>

          <Input
            value={cargoInput}
            onChange={(e) => setCargoInput(e.target.value)}
            placeholder="Cargo: chofer, director…"
            aria-label="Filtrar por cargo: la palabra con que empieza el nombre del puesto"
            className="bg-canvas lg:max-w-52"
          />

          <Select
            value={instId === null ? "todas" : String(instId)}
            onValueChange={(v) => setInstId(v === "todas" ? null : Number(v))}
          >
            <SelectTrigger
              aria-label="Filtrar por institución"
              className="bg-canvas lg:max-w-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">
                Todas las instituciones ({data.instituciones.length})
              </SelectItem>
              {data.instituciones.map((o, i) => (
                <SelectItem
                  key={o.codigo}
                  value={String(i)}
                  ayuda={`${o.codigo} · ${data.monthNames[o.mes - 1]} ${o.anio}${estaAtrasada(o) ? ` · desactualizada, ${textoAtraso(o.anio, o.mes)}` : ""}`}
                >
                  {o.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/*
            En teléfono los dos campos de sueldo reparten el ancho entero: con
            anchos fijos de 28 y 24 dejaban un tercio de la fila en blanco y
            parecían un resto de la versión de escritorio. Desde `lg`, donde la
            barra vuelve a ser una sola fila, recuperan su medida corta.
          */}
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              value={salMin}
              onChange={(e) => setSalMin(e.target.value)}
              placeholder="Sueldo mín."
              aria-label="Sueldo mínimo"
              className="w-full bg-canvas lg:w-28"
            />
            <span aria-hidden className="shrink-0 text-ink-soft">
              –
            </span>
            <Input
              type="number"
              inputMode="numeric"
              value={salMax}
              onChange={(e) => setSalMax(e.target.value)}
              placeholder="máx."
              aria-label="Sueldo máximo"
              className="w-full bg-canvas lg:w-24"
            />
          </div>

          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              onClick={reset}
              className="self-start text-brand-700 lg:self-auto"
            >
              <IconX className="h-4 w-4" /> Limpiar
            </Button>
          )}
        </div>

        {instSel && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
            <p>
              <span className="font-semibold text-ink">{instSel.nombre}</span> · foto de{" "}
              {data.monthNames[instSel.mes - 1]} {instSel.anio} ·{" "}
              {formatInt(instSel.plazas)} plazas
            </p>
            <MarcaAtraso anio={instSel.anio} mes={instSel.mes} />
            {fichas[instSel.codigo] && (
              <Link
                href={fichas[instSel.codigo]}
                className="font-semibold text-brand-700 hover:underline"
              >
                Ficha de la institución: presupuesto, compras y decretos
              </Link>
            )}
          </div>
        )}
      </Card>

      {/* ---------- KPI cards ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          icon={IconLayers}
          label="Plazas"
          value={formatInt(kpis.count)}
          base={`de ${formatInt(data.rows.length)} en la foto`}
        />
        <Kpi
          icon={IconCoins}
          label="Masa salarial mensual"
          value={formatCompactDOP(kpis.total)}
          base="último mes publicado por cada institución"
        />
        <Kpi icon={IconChartBar} label="Sueldo promedio" value={formatDOP(kpis.avg)} base="bruto mensual" />
        <Kpi icon={IconTrendingUp} label="Sueldo mediano" value={formatDOP(kpis.median)} base="bruto mensual" />
        <Kpi
          icon={IconBuilding}
          label="Instituciones"
          value={formatInt(kpis.insts)}
          base="con nómina publicada y legible"
        />
        <Kpi icon={IconMapPin} label="Cargos distintos" value={formatInt(kpis.cargos)} />
      </div>

      {/* ---------- vistas ---------- */}
      <Tabs value={view} onValueChange={(v) => setView(v as View)}>
        {/*
          A 390 px las dos pestañas y el conteo no caben en una fila: el conteo
          se partía en dos renglones pegado al borde de la última pestaña. Con
          `flex-wrap` baja entero a su propia línea y las pestañas quedan
          intactas.
        */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <TabsList className="w-auto">
            <TabsTrigger value="resumen">
              <IconChartBar className="h-4 w-4" />
              Resumen
            </TabsTrigger>
            <TabsTrigger value="tabla">
              <IconLayers className="h-4 w-4" />
              Tabla
            </TabsTrigger>
            <TabsTrigger value="comparar">
              <IconTrendingUp className="h-4 w-4" />
              Comparar
            </TabsTrigger>
          </TabsList>
          {/*
            El conteo cambia sin navegar —cada tecla del buscador lo mueve—, así
            que vive en una región cortés: quien no ve la pantalla se entera de
            que su filtro recortó a 412 plazas.
          */}
          <p aria-live="polite" className="text-sm text-ink-soft">
            <span className="font-semibold text-ink">{formatInt(kpis.count)}</span> de{" "}
            {formatInt(data.rows.length)} plazas
          </p>
        </div>

        <TabsContent value="resumen" className="space-y-5">
          <Panel
            title="Instituciones"
            subtitle="Cada institución aporta su último mes publicado (clic para filtrar)"
            action={
              <ToggleGroup
                type="single"
                value={metric}
                onValueChange={(v) => v && setMetric(v as Metric)}
                aria-label="Qué se mide en el ranking"
                className="p-0.5"
              >
                {(
                  [
                    ["total", "Masa"],
                    ["count", "Plazas"],
                    ["avg", "Promedio"],
                  ] as [Metric, string][]
                ).map(([m, lbl]) => (
                  /*
                    El control segmentado se queda en los 36 px de la primitiva
                    en escritorio, pero en teléfono es el único modo de cambiar
                    lo que mide el ranking: sube a 44 px, que es el objetivo
                    táctil, y ensancha el relleno para acompañarlo.
                  */
                  <ToggleGroupItem
                    key={m}
                    value={m}
                    className="min-h-11 px-3 text-xs sm:min-h-9 sm:px-2.5"
                  >
                    {lbl}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            }
          >
            <BarrasHorizontales
              lineas={2}
              etiqueta="Instituciones del ranking; tocar una filtra la nómina"
              alElegir={(clave) => {
                const id = Number(clave);
                setInstId(id === instId ? null : id);
              }}
              elegida={instId == null ? null : String(instId)}
              barras={topInsts.map((g) => {
                const inst = data.instituciones[g.key];
                const valor = metric === "total" ? g.total : metric === "count" ? g.count : g.avg;
                return {
                  clave: String(g.key),
                  etiqueta: inst.nombre,
                  titulo: inst.nombre,
                  valor,
                  cifra: metricFormat(valor),
                  detalle: `${formatInt(g.count)} plazas · ${periodLabel(inst.anio, inst.mes)}${estaAtrasada(inst) ? ` · desactualizada (${textoAtraso(inst.anio, inst.mes)})` : ""}`,
                };
              })}
            />
          </Panel>

          {/*
            Paneles pequeños con la misma escala: las áreas y los cargos son
            dos cortes del mismo gasto, y una barra llena significa lo mismo en
            los dos (docs/IDENTIDAD.md §Gráficos, `Multiples`).
          */}
          <Multiples>
            <Panel title="Top áreas por gasto">
              <BarrasHorizontales
                lineas={2}
                maximo={escalaGasto}
                etiqueta="Áreas con más gasto"
                barras={topAreas.map((g) => ({
                  clave: String(g.key),
                  etiqueta: data.areas[g.key],
                  titulo: data.areas[g.key],
                  valor: g.total,
                  cifra: formatCompactDOP(g.total),
                  detalle: `${formatInt(g.count)} plazas`,
                }))}
              />
            </Panel>

            <Panel title="Top cargos por gasto">
              <BarrasHorizontales
                lineas={2}
                maximo={escalaGasto}
                etiqueta="Cargos con más gasto"
                barras={topCargos.map((g) => ({
                  clave: String(g.key),
                  etiqueta: data.cargos[g.key],
                  titulo: data.cargos[g.key],
                  valor: g.total,
                  cifra: formatCompactDOP(g.total),
                  detalle: `${formatInt(g.count)} · ${formatDOP(g.avg)} prom.`,
                }))}
              />
            </Panel>
          </Multiples>

          <Panel
            title="Distribución salarial"
            subtitle={`Sueldo mediano ${formatDOP(kpis.median)} · promedio ${formatDOP(kpis.avg)}`}
          >
            <SerieTemporal
              className="mt-0"
              rotular="todos"
              etiqueta={`Plazas por tramo de sueldo bruto: ${histogram.map((b) => `${b.label}, ${formatInt(b.count)}`).join("; ")}`}
              puntos={histogram.map((b) => ({
                clave: b.label,
                valor: b.count,
                lectura: `${b.label}: ${formatInt(b.count)} plazas`,
                marca: b.label,
              }))}
            />
          </Panel>
        </TabsContent>

        <TabsContent value="tabla" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">
              Ordenado por <span className="font-medium text-ink">{sortLabel(sortKey)}</span> (
              {sortDir === "asc" ? "asc" : "desc"})
            </p>
            <Button type="button" onClick={exportCsv}>
              <IconDownload className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>
          <DataTable
            rows={sorted}
            instituciones={data.instituciones}
            areas={data.areas}
            cargos={data.cargos}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
          />
        </TabsContent>

        <TabsContent value="comparar" className="space-y-5">
          <Panel
            title="¿Cuánto paga cada institución por el mismo puesto?"
            subtitle={`Sueldo bruto mediano de las plazas cuyo cargo empieza por la palabra elegida, en las ${data.instituciones.length} instituciones de la foto. Solo cuenta el cargo: la institución, la búsqueda y el rango de sueldo no se aplican aquí.`}
          >
            <div role="group" aria-label="Cargos que aparecen en casi todas las instituciones" className="flex flex-wrap gap-2 sm:gap-1.5">
              {CARGOS_COMPARABLES.map((c) => {
                const activo = norm(cargo) === norm(c);
                return (
                  <Button
                    key={c}
                    type="button"
                    size="sm"
                    variant={activo ? "default" : "secondary"}
                    aria-pressed={activo}
                    onClick={() => setCargoInput(activo ? "" : c)}
                    className="h-10 sm:h-9"
                  >
                    {c}
                  </Button>
                );
              })}
            </div>

            {!comparacion ? (
              <p className="mt-4 text-sm text-ink-soft">
                Elige un cargo o escríbelo en el campo «Cargo» de arriba: se
                compara la mediana de cada institución, que no se mueve por un
                solo sueldo muy alto.
              </p>
            ) : comparacion.filas.length === 0 ? (
              <EstadoVacio className="mt-4" titulo={`Ningún cargo de la foto empieza por «${cargo}»`}>
                Prueba con la palabra con que empieza el puesto: «chofer», «analista»,
                «director».
              </EstadoVacio>
            ) : (
              <>
                <BarrasHorizontales
                  className="mt-4"
                  lineas={2}
                  minimo={1}
                  maximo={comparacion.filas[0]?.mediana || 1}
                  etiqueta={`Sueldo bruto mediano de «${cargo}» por institución`}
                  barras={comparacion.filas.map((f) => {
                    const inst = data.instituciones[f.inst];
                    return {
                      clave: String(f.inst),
                      etiqueta: inst.nombre,
                      titulo: `${inst.nombre}: sueldo mediano ${formatDOP(f.mediana)}`,
                      valor: f.mediana,
                      cifra: formatDOP(f.mediana),
                      href: fichas[inst.codigo],
                      detalle: (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>
                            {formatInt(f.plazas)} {f.plazas === 1 ? "plaza" : "plazas"}
                            {f.plazas > 1 && ` · de ${formatDOP(f.min)} a ${formatDOP(f.max)}`} ·{" "}
                            {periodLabel(inst.anio, inst.mes)}
                          </span>
                          <MarcaAtraso anio={inst.anio} mes={inst.mes} />
                        </div>
                      ),
                    };
                  })}
                />
                <p className="mt-4 text-xs leading-relaxed text-ink-soft">
                  {formatInt(comparacion.plazas)} plazas en{" "}
                  {comparacion.denominaciones.length === 1
                    ? "una denominación"
                    : `${comparacion.denominaciones.length} denominaciones`}{" "}
                  de cargo: {comparacion.denominaciones.slice(0, 8).join(" · ")}
                  {comparacion.denominaciones.length > 8 &&
                    ` y ${comparacion.denominaciones.length - 8} más`}
                  . Cada institución nombra el puesto a su manera; se juntan las que
                  empiezan igual, en masculino o femenino, sin grado ni nivel.
                </p>
              </>
            )}
          </Panel>

          <Panel
            title="¿Cuáles son los puestos mejor pagados?"
            subtitle={`El sueldo más alto de cada cargo en cada institución, en las ${data.instituciones.length} instituciones de la foto: no es todo el Estado.`}
          >
            <ol className="divide-y divide-hairline">
              {mejorPagados.map((p) => {
                const inst = data.instituciones[p.inst];
                return (
                  <li
                    key={`${p.inst}:${p.cargo}`}
                    className="flex items-baseline justify-between gap-3 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm leading-snug text-ink">{data.cargos[p.cargo]}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                        {fichas[inst.codigo] ? (
                          <Link href={fichas[inst.codigo]} className="hover:text-brand-700 hover:underline">
                            {inst.nombre}
                          </Link>
                        ) : (
                          <span>{inst.nombre}</span>
                        )}
                        <span>
                          · {periodLabel(inst.anio, inst.mes)}
                          {p.plazas > 1 && ` · ${formatInt(p.plazas)} plazas con este cargo`}
                        </span>
                        <MarcaAtraso anio={inst.anio} mes={inst.mes} />
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                      {formatDOP(p.sueldo)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Panel>
        </TabsContent>
      </Tabs>

      {/* La declaración de cobertura es lectura, no metadato: 13 px en teléfono. */}
      <p className="pt-1 text-[13px] leading-relaxed text-ink-soft sm:text-xs">
        Foto transversal: el último mes publicado por cada una de las{" "}
        {data.instituciones.length} instituciones cubiertas ({formatInt(data.rows.length)}{" "}
        plazas). Cada fila es una plaza con su sueldo bruto; no hay nombres ni datos
        personales. La cobertura es la que cada institución publica en formato
        procesable — <span className="font-medium text-ink">no es todo el Estado</span>;
        el detalle completo con nombres vive en el{" "}
        <a
          href="https://transparencia.gob.do/2025/12/17/nomina/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand-700 hover:underline"
        >
          tablero oficial del Portal Único de Transparencia
        </a>
        . Generado el {data.generatedAt}; fuentes y método en{" "}
        <code className="rounded bg-canvas px-1 py-0.5 font-mono">scripts/build-nomina.py</code>.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* small presentational helpers                                        */
/* ------------------------------------------------------------------ */

/**
 * La marca de una foto vieja: más de tres meses desde el mes publicado. Ocre,
 * porque es una advertencia al margen, y dicha en palabras —«foto de hace 4
 * años y 9 meses»—, porque el color solo no llega a quien no lo ve.
 */
function MarcaAtraso({ anio, mes }: { anio: number; mes: number }) {
  if (!estaAtrasada({ anio, mes })) return null;
  return (
    <Badge variant="alerta" forma="etiqueta">
      Foto {textoAtraso(anio, mes)}
    </Badge>
  );
}

function rankBy(stats: GroupStat[], metric: Metric, n: number): GroupStat[] {
  const key = (g: GroupStat) =>
    metric === "total" ? g.total : metric === "count" ? g.count : g.avg;
  return stats.sort((a, b) => key(b) - key(a)).slice(0, n);
}

function sortLabel(k: SortKey): string {
  return { institucion: "institución", area: "área", cargo: "cargo", sueldo: "sueldo" }[k];
}

/**
 * Un KPI de nómina con **su base debajo de la cifra**.
 *
 * «Masa salarial mensual» es la suma del último mes publicado por cada
 * institución: meses distintos sumados en un solo peso. Esa advertencia vivía
 * al final de la página, después de dos rejillas de gráficos, y nadie asocia
 * una nota al pie con un número que leyó tres pantallas antes.
 */
function Kpi({
  icon: Icon,
  label,
  value,
  base,
}: {
  icon: IconType;
  label: string;
  value: string;
  base?: string;
}) {
  return (
    <Card className="p-3.5">
      {/*
        El icono se alinea con la primera línea del rótulo, no con su centro:
        a 390 px «MASA SALARIAL MENSUAL» ocupa dos líneas y el icono centrado
        quedaba flotando entre las dos.
      */}
      <div className="flex items-start gap-1.5 text-ink-soft">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="rotulo">{label}</span>
      </div>
      <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums text-ink">{value}</p>
      {/* La base de la cifra no es adorno: a 11 px no se lee en un teléfono. */}
      {base && <p className="mt-1 text-xs leading-snug text-ink-soft">{base}</p>}
    </Card>
  );
}

/**
 * Un panel del explorador: cabecera con título, subtítulo y su control a la
 * derecha. Es `Card` de `components/ui` con el título en serif, que es lo que
 * la identidad reserva a un titular de sección grande — un título de panel de
 * 14 px iría en sans.
 */
function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="items-start px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <CardTitle className="font-display text-lg">{title}</CardTitle>
          {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
        </div>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="px-4 py-4 sm:px-5">{children}</CardContent>
    </Card>
  );
}
