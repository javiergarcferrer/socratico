"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { claves } from "@/lib/consultas";
import type { Proceso } from "@/lib/dgcp";
import ProcesoCard from "@/components/proceso-card";
import {
  GRUPOS_SEGUIDO,
  TIPOS_CON_ESTADO,
  TIPOS_SEGUIDO,
  getSeguidos,
  huellaDe,
  marcarVistos,
  onSeguimientoCambio,
  toggleSeguido,
  type Seguido,
  type TipoSeguido,
} from "@/lib/seguimiento";
import { IconArrowRight, IconSearch, IconStar } from "@/components/icons";
import Antiguedad from "@/components/antiguedad";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EstadoVacio } from "@/components/estado-vacio";
import { Rotulo } from "@/components/papel";

/**
 * Lo que el visitante sigue, de todas las verticales, y **qué cambió desde su
 * última visita**.
 *
 * Todo ocurre en el navegador (`lib/seguimiento.ts`): la lista sale de
 * `localStorage`; el estado de hoy de cada pieza que tiene estado se pide a
 * las rutas de siempre —`/api/procesos?proceso=` para una compra,
 * `/api/seguimiento` para una pieza del Congreso—; y se compara con la huella
 * guardada. Lo que cambió se enseña arriba, con el antes y el ahora, y solo
 * después se guarda la huella nueva: el cambio se ve una vez y no se pierde
 * por abrir la página.
 *
 * Proveedores, instituciones y normas no tienen un estado que cambie de un
 * día para otro, así que se listan como marcadores, sin comparación. Se dice
 * en la propia página para que nadie espere un aviso que no llegará.
 */

type Lectura =
  | { estado: "cargando" }
  | { estado: "caida" }
  | { estado: "ok"; huella: string; titulo?: string; proceso?: Proceso };

interface Cambio {
  item: Seguido;
  antes: string;
  ahora: string;
}

const clave = (s: { tipo: TipoSeguido; id: string }) => `${s.tipo}:${s.id}`;

async function leerEstado(s: Seguido): Promise<Lectura> {
  try {
    if (s.tipo === "proceso") {
      const r = await fetch(`/api/procesos?proceso=${encodeURIComponent(s.id)}&limit=1`);
      if (!r.ok) return { estado: "caida" };
      const d = await r.json();
      const p: Proceso | undefined = d?.content?.[0];
      if (!p) return { estado: "caida" };
      return {
        estado: "ok",
        huella: huellaDe({ estado: p.estado_proceso }),
        titulo: p.titulo || undefined,
        proceso: p,
      };
    }
    const r = await fetch(
      `/api/seguimiento?tipo=${encodeURIComponent(s.tipo)}&id=${encodeURIComponent(s.id)}`,
    );
    if (!r.ok) return { estado: "caida" };
    const d = await r.json();
    if (typeof d?.huella !== "string") return { estado: "caida" };
    return { estado: "ok", huella: d.huella, titulo: d.titulo || undefined };
  } catch {
    return { estado: "caida" };
  }
}

export default function SeguimientoPage() {
  const [items, setItems] = useState<Seguido[] | null>(null);
  const [cambios, setCambios] = useState<Cambio[]>([]);
  /*
    La última visita se fija **al abrir** la página, antes de que esta misma
    visita la sobrescriba: si se leyera después, diría siempre «hace un
    momento».
  */
  const [ultimaVisita, setUltimaVisita] = useState<string | null>(null);
  const comparados = useRef<Set<string>>(new Set());

  useEffect(() => {
    const inicial = getSeguidos();
    const vistos = inicial
      .filter((s) => TIPOS_CON_ESTADO.has(s.tipo))
      .map((s) => s.visto)
      .filter((v): v is string => Boolean(v))
      .sort();
    setUltimaVisita(vistos.length ? vistos[vistos.length - 1] : null);

    const sync = () => setItems(getSeguidos());
    sync();
    return onSeguimientoCambio(sync);
  }, []);

  /*
    El estado de hoy de lo que tiene estado, una consulta por pieza
    (TanStack Query). Se pide una sola vez por visita a la página
    (`staleTime: Infinity`) y se olvida al salir (`gcTime: 0`): volver mañana
    tiene que leer el estado de mañana, no el que quedó en memoria. El modo
    estricto de React, que monta dos veces en desarrollo, ya no puede perder
    una respuesta: la consulta es del cliente, no del efecto.
  */
  const conEstadoItems = useMemo(
    () => (items ?? []).filter((s) => TIPOS_CON_ESTADO.has(s.tipo)),
    [items],
  );
  const consultas = useQueries({
    queries: conEstadoItems.map((s) => ({
      queryKey: claves.seguimiento(s.tipo, s.id),
      queryFn: () => leerEstado(s),
      staleTime: Infinity,
      gcTime: 0,
      // `leerEstado` no lanza: una caída vuelve como `{ estado: "caida" }`.
      retry: false,
    })),
  });
  const lecturas: Record<string, Lectura> = {};
  conEstadoItems.forEach((s, i) => {
    lecturas[clave(s)] = consultas[i]?.data ?? { estado: "cargando" };
  });

  /*
    Cada lectura que llega se compara una sola vez con la huella guardada.
    Lo que cambió se enseña arriba y solo después se guarda la huella nueva:
    la próxima visita compara contra lo de hoy.
  */
  const firma = conEstadoItems.map((s) => `${clave(s)}=${lecturas[clave(s)].estado}`).join("|");
  useEffect(() => {
    const detectados: Cambio[] = [];
    const vistos: Parameters<typeof marcarVistos>[0] = [];
    for (const s of conEstadoItems) {
      const l = lecturas[clave(s)];
      if (l.estado !== "ok" || comparados.current.has(clave(s))) continue;
      comparados.current.add(clave(s));
      if (s.huella !== undefined && s.huella !== l.huella) {
        detectados.push({ item: s, antes: s.huella, ahora: l.huella });
      }
      vistos.push({ tipo: s.tipo, id: s.id, huella: l.huella, titulo: l.titulo });
    }
    if (detectados.length) setCambios((prev) => [...prev, ...detectados]);
    if (vistos.length) marcarVistos(vistos);
    // `firma` resume las lecturas: el efecto corre cuando una llega, no en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  const grupos = useMemo(() => {
    const porTipo = new Map<TipoSeguido, Seguido[]>();
    for (const s of items ?? []) {
      porTipo.set(s.tipo, [...(porTipo.get(s.tipo) ?? []), s]);
    }
    return TIPOS_SEGUIDO.filter((t) => porTipo.has(t)).map((t) => ({
      tipo: t,
      lista: porTipo.get(t)!,
    }));
  }, [items]);

  const conEstado = conEstadoItems;
  const pendientes = conEstado.filter(
    (s) => (lecturas[clave(s)]?.estado ?? "cargando") === "cargando",
  ).length;
  const caidas = conEstado.filter((s) => lecturas[clave(s)]?.estado === "caida").length;
  const cambiados = new Set(cambios.map((c) => clave(c.item)));

  return (
    <div className="space-y-5">
      <Card as="section" className="p-5">
        <Rotulo className="flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <IconStar className="h-3.5 w-3.5 text-brand-600" filled />
            Mi seguimiento
            {items && items.length > 0 && (
              <span className="font-mono tabular-nums"> · {items.length}</span>
            )}
          </span>
        </Rotulo>
        <h1 className="mt-2 font-display text-3xl leading-tight">
          ¿Qué cambió en lo que sigues?
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Lo que marcaste con «Seguir» en cualquier parte de la plataforma: compras,
          proyectos de ley, proveedores, instituciones y normas. Sin cuenta, se
          guarda solo en este navegador y se borra si borras sus datos. Con{" "}
          <Link href="/cuenta" className="font-medium text-brand-700 hover:underline">
            cuenta
          </Link>
          , viaja con ella a cualquier dispositivo en que entres.
        </p>
      </Card>

      {items === null ? (
        <Skeleton className="h-40 rounded-lg border border-hairline" />
      ) : items.length === 0 ? (
        <EstadoVacio
          titulo="Aún no sigues nada"
          accion={
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/licitaciones">
                  <IconSearch className="h-4 w-4" />
                  Buscar compras
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/congreso">Ver el Congreso</Link>
              </Button>
            </div>
          }
        >
          Toca «Seguir» en la ficha de una compra, un proyecto de ley, un proveedor
          o una norma para guardarla aquí. Cuando vuelvas, esta página te dirá qué
          cambió.
        </EstadoVacio>
      ) : (
        <>
          <PanelCambios
            cambios={cambios}
            pendientes={pendientes}
            caidas={caidas}
            conEstado={conEstado.length}
            ultimaVisita={ultimaVisita}
          />

          {grupos.map(({ tipo, lista }) => (
            <section key={tipo} aria-labelledby={`grupo-${tipo}`} className="space-y-3">
              <h2 id={`grupo-${tipo}`}>
                <Rotulo>
                  {GRUPOS_SEGUIDO[tipo].plural} · {lista.length}
                </Rotulo>
              </h2>
              {tipo === "proceso" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {lista.map((s) => {
                    const l = lecturas[clave(s)];
                    return l?.estado === "ok" && l.proceso ? (
                      <ProcesoCard key={s.id} p={l.proceso} />
                    ) : (
                      <FilaSeguida
                        key={s.id}
                        item={s}
                        lectura={l}
                        cambio={cambiados.has(clave(s))}
                      />
                    );
                  })}
                </div>
              ) : (
                <Card asChild>
                  <ul className="divide-y divide-hairline">
                  {lista.map((s) => (
                    <FilaSeguida
                      key={s.id}
                      as="li"
                      item={s}
                      lectura={lecturas[clave(s)]}
                      cambio={cambiados.has(clave(s))}
                    />
                  ))}
                  </ul>
                </Card>
              )}
              {!TIPOS_CON_ESTADO.has(tipo) && (
                <p className="text-xs text-ink-soft">
                  {GRUPOS_SEGUIDO[tipo].plural} no tienen un estado que la plataforma
                  pueda comparar entre visitas: aquí quedan como marcadores.
                </p>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function PanelCambios({
  cambios,
  pendientes,
  caidas,
  conEstado,
  ultimaVisita,
}: {
  cambios: Cambio[];
  pendientes: number;
  caidas: number;
  conEstado: number;
  ultimaVisita: string | null;
}) {
  if (conEstado === 0) return null;

  const desde = ultimaVisita ? (
    <>
      {" "}desde tu última visita (<Antiguedad iso={ultimaVisita} />)
    </>
  ) : null;

  if (cambios.length > 0) {
    return (
      <Alert variant="firma" role="status">
        <AlertTitle>
          {cambios.length === 1 ? "Una pieza cambió" : `${cambios.length} piezas cambiaron`}
          {desde}
        </AlertTitle>
        <ul className="mt-3 space-y-3">
          {cambios.map((c) => (
            <li key={clave(c.item)} className="text-[13px]">
              <Link
                href={c.item.href}
                className="font-semibold text-brand-900 underline-offset-2 hover:underline"
              >
                {c.item.titulo}
              </Link>
              <p className="mt-0.5 text-brand-800">
                <span className="text-brand-800/75">Antes:</span> {c.antes || "sin estado"}
                <span aria-hidden> → </span>
                <span className="sr-only">. </span>
                <span className="text-brand-800/75">Ahora:</span>{" "}
                <strong>{c.ahora || "sin estado"}</strong>
              </p>
            </li>
          ))}
        </ul>
        {pendientes > 0 && (
          <p className="mt-3 text-xs">Todavía se están consultando {pendientes} más.</p>
        )}
      </Alert>
    );
  }

  return (
    <Alert variant="neutro" role="status">
      <p className="text-sm">
        {pendientes > 0 ? (
          <>Consultando el estado de hoy de {pendientes} {pendientes === 1 ? "pieza" : "piezas"}…</>
        ) : (
          <>
            <span className="font-semibold">Nada cambió</span>
            {desde}.
          </>
        )}
      </p>
      {caidas > 0 && pendientes === 0 && (
        <p className="mt-1 text-xs text-ink-soft">
          {caidas === 1 ? "Una fuente no contestó" : `${caidas} consultas no contestaron`}:
          se volverá a comparar en tu próxima visita, contra el mismo estado de antes.
        </p>
      )}
      <p className="mt-1 text-xs text-ink-soft">
        Se compara el estado de las compras y de los proyectos de ley con el que tenían
        la última vez que abriste esta página.
      </p>
    </Alert>
  );
}

function FilaSeguida({
  item,
  lectura,
  cambio,
  as: Comp = "div",
}: {
  item: Seguido;
  lectura?: Lectura;
  cambio: boolean;
  as?: "div" | "li";
}) {
  const conEstado = TIPOS_CON_ESTADO.has(item.tipo);
  const estado =
    !conEstado
      ? null
      : !lectura || lectura.estado === "cargando"
        ? "Consultando su estado…"
        : lectura.estado === "caida"
          ? "La fuente no contestó ahora"
          : lectura.huella || "Sin estado publicado";

  return (
    <Comp
      className={
        Comp === "div"
          ? "relative flex items-start gap-3 rounded-lg border border-hairline bg-surface p-4"
          : "relative flex items-start gap-3 px-4 py-3"
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {cambio && (
            <Badge forma="etiqueta" variant="firma">
              Cambió
            </Badge>
          )}
          {estado && <span className="text-xs text-ink-soft">{estado}</span>}
        </div>
        <Link
          href={item.href}
          className="mt-0.5 line-clamp-2 font-medium text-ink estira hover:text-brand-700"
        >
          {item.titulo}
        </Link>
        {item.desde && (
          <p className="mt-0.5 text-xs text-ink-soft">
            <Antiguedad iso={item.desde} prefijo="Lo sigues desde" />
          </p>
        )}
      </div>
      <IconArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
      <Button
        variant="ghost"
        size="icon"
        onClick={() =>
          toggleSeguido({ tipo: item.tipo, id: item.id, titulo: item.titulo, href: item.href })
        }
        aria-label={`Dejar de seguir: ${item.titulo}`}
        className="relative z-10 -my-2 -mr-2 shrink-0 text-brand-600 hover:text-brand-700"
      >
        <IconStar className="h-5 w-5" filled />
      </Button>
    </Comp>
  );
}
