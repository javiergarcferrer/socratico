"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Referencia } from "@/lib/espacios";
import type { ProyectoConCuenta } from "@/lib/espacios-cliente";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorCampo } from "@/components/ui/error-campo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IconArrowRight, IconBookmark, IconPlus } from "@/components/icons";
import { useHaySesion } from "./presencia";

type Carga =
  | { estado: "cargando" }
  | { estado: "listo"; proyectos: ProyectoConCuenta[]; donde: Set<string> }
  | { estado: "cerrado" }
  | { estado: "error"; error: string };

/** La bandeja «Guardado sin ordenar», como clave del conjunto `donde`. */
const BANDEJA = "__bandeja__";

/**
 * «Guardar» en una ficha: en la bandeja o directo a una o varias
 * investigaciones (docs/PLAN-ESPACIOS.md). Es la única pieza de una ficha que
 * habla con la base, y la ficha no lo sabe: importa este componente, no el
 * cliente de Supabase. El cliente se carga **al abrir**, no al pintar la
 * ficha: la mayoría de las visitas no tiene cuenta y no tiene por qué
 * pagarlo.
 *
 * Sin sesión, no finge: dice qué haría la cuenta y lleva a crearla,
 * volviendo después a esta misma ficha. Con sesión, el botón dice desde el
 * principio si el registro ya está guardado: quien tiene sesión ya cargó el
 * cliente (`SincronizarCuenta`), así que preguntarlo no cuesta otra descarga.
 */
export default function Guardar({ referencia, className }: { referencia: Referencia; className?: string }) {
  const hay = useHaySesion();
  const pathname = usePathname();
  const [carga, setCarga] = useState<Carga>({ estado: "cargando" });
  const [nuevo, setNuevo] = useState("");
  const [sinTitulo, setSinTitulo] = useState(false);
  const [creando, setCreando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (!hay) return setGuardado(false);
    let vivo = true;
    (async () => {
      const c = await import("@/lib/espacios-cliente");
      const d = await c.dondeEsta(referencia);
      if (vivo && d.ok) setGuardado(d.datos.length > 0);
    })();
    return () => {
      vivo = false;
    };
  }, [hay, referencia.tipo, referencia.ref]); // eslint-disable-line react-hooks/exhaustive-deps

  async function abrir(abierto: boolean) {
    if (!abierto || !hay) return;
    setSinTitulo(false);
    setCarga({ estado: "cargando" });
    const c = await import("@/lib/espacios-cliente");
    const u = await c.sesionActual();
    if (!u) return setCarga({ estado: "error", error: "Tu sesión venció. Vuelve a entrar." });
    const [p, d] = await Promise.all([c.misProyectos(u), c.dondeEsta(referencia)]);
    if ((!p.ok && p.cerrado) || (!d.ok && d.cerrado)) return setCarga({ estado: "cerrado" });
    if (!p.ok) return setCarga({ estado: "error", error: p.error });
    if (!d.ok) return setCarga({ estado: "error", error: d.error });
    const donde = new Set(d.datos.map((x) => x ?? BANDEJA));
    setGuardado(donde.size > 0);
    setCarga({ estado: "listo", proyectos: p.datos.filter((x) => x.rol !== "lector"), donde });
  }

  async function alternar(destino: string, marcar: boolean) {
    if (carga.estado !== "listo") return;
    const c = await import("@/lib/espacios-cliente");
    const u = await c.sesionActual();
    if (!u) return;
    const proyecto = destino === BANDEJA ? null : destino;
    const r = marcar ? await c.guardar(referencia, proyecto) : await c.quitarDe(referencia, u, proyecto);
    if (!r.ok) return setCarga({ estado: "error", error: r.error });
    // Sobre el estado de ahora, no el de cuando empezó: dos casillas marcadas
    // seguidas no se pisan.
    setCarga((ahora) => {
      if (ahora.estado !== "listo") return ahora;
      const donde = new Set(ahora.donde);
      if (marcar) donde.add(destino);
      else donde.delete(destino);
      setGuardado(donde.size > 0);
      return { ...ahora, donde };
    });
  }

  async function crearCon(e: React.FormEvent) {
    e.preventDefault();
    if (carga.estado !== "listo") return;
    const titulo = nuevo.trim();
    // Vacío no apaga el botón: pulsarlo dice qué falta, junto al campo.
    if (!titulo) {
      setSinTitulo(true);
      document.getElementById("guardar-nueva")?.focus();
      return;
    }
    setSinTitulo(false);
    setCreando(true);
    const c = await import("@/lib/espacios-cliente");
    const p = await c.crearProyecto(titulo);
    setCreando(false);
    if (!p.ok) return setCarga({ estado: "error", error: p.error });
    const r = await c.guardar(referencia, p.datos.id);
    if (!r.ok) return setCarga({ estado: "error", error: r.error });
    setNuevo("");
    setGuardado(true);
    setCarga((ahora) =>
      ahora.estado !== "listo"
        ? ahora
        : {
            ...ahora,
            proyectos: [{ ...p.datos, rol: "dueno", registros: 1 }, ...ahora.proyectos],
            donde: new Set([...ahora.donde, p.datos.id]),
          },
    );
  }

  return (
    <Popover onOpenChange={abrir}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={className} aria-pressed={guardado}>
          <IconBookmark filled={guardado} className="h-3.5 w-3.5" />
          {guardado ? "Guardado" : "Guardar"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        {!hay ? (
          <div className="space-y-2.5">
            <p className="text-sm font-semibold text-ink">Guárdalo en tu espacio</p>
            <p className="text-xs leading-relaxed text-ink-soft">
              Con una cuenta juntas registros como este en investigaciones, los anotas, los enlazas
              y los publicas. Entrar es un código al correo.
            </p>
            <Button asChild className="w-full">
              <Link href={`/cuenta?volver=${encodeURIComponent(pathname)}`}>
                Crear cuenta o entrar
                <IconArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        ) : carga.estado === "cargando" ? (
          <p className="py-2 text-sm text-ink-soft" aria-busy="true">Buscando tus investigaciones…</p>
        ) : carga.estado === "cerrado" ? (
          <p className="text-xs leading-relaxed text-ink-soft">
            Guardar en investigaciones todavía no está abierto en esta plataforma. Mientras tanto,
            «Seguir» guarda esta ficha en tu navegador.
          </p>
        ) : carga.estado === "error" ? (
          <div className="space-y-2">
            <p role="alert" className="text-xs leading-relaxed text-alerta-700">{carga.error}</p>
            <Button asChild variant="secondary" size="sm" className="w-full">
              <Link href={`/cuenta?volver=${encodeURIComponent(pathname)}`}>Ir a tu cuenta</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink-soft">Guardar en</p>
            <ul className="max-h-60 space-y-0.5 overflow-y-auto overscroll-contain">
              {[{ id: BANDEJA, titulo: "Guardado sin ordenar" }, ...carga.proyectos].map((d) => (
                <li key={d.id}>
                  <Label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-sm font-normal text-ink hover:bg-brand-50 sm:min-h-9">
                    <Checkbox checked={carga.donde.has(d.id)} onCheckedChange={(v) => void alternar(d.id, v === true)} />
                    <span className="min-w-0 truncate" title={d.titulo}>{d.titulo}</span>
                  </Label>
                </li>
              ))}
            </ul>
            <form onSubmit={crearCon} className="flex gap-1.5 border-t border-hairline pt-2">
              <Label htmlFor="guardar-nueva" className="sr-only">Nueva investigación con este registro</Label>
              <Input
                id="guardar-nueva"
                name="titulo"
                autoComplete="off"
                value={nuevo}
                maxLength={140}
                onChange={(e) => {
                  setNuevo(e.target.value);
                  if (sinTitulo) setSinTitulo(false);
                }}
                aria-invalid={sinTitulo || undefined}
                aria-describedby={sinTitulo ? "guardar-nueva-error" : undefined}
                placeholder="Nueva investigación…"
                className="h-11 text-base sm:h-9 sm:text-sm"
              />
              <Button
                type="submit"
                size="icon"
                variant="secondary"
                disabled={creando}
                aria-label={creando ? "Creando la investigación…" : "Crear la investigación con este registro"}
              >
                <IconPlus className="h-4 w-4" />
              </Button>
            </form>
            <ErrorCampo id="guardar-nueva-error">
              {sinTitulo ? "Ponle un título a la investigación." : ""}
            </ErrorCampo>
            <Link href="/espacio" className="flex min-h-11 items-center text-xs font-medium text-brand-700 hover:underline sm:min-h-9">
              Ir a tu espacio
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
