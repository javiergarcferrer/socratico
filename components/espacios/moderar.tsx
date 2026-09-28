"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  colaModeracion,
  estadoConversacion,
  MOTIVOS_DENUNCIA,
  moderar,
  retitular,
  suspender,
  type ColaModeracion,
  type DenunciaEnCola,
} from "@/lib/espacios-cliente";
import { NOMBRE_HILO, rutaPropia } from "@/lib/espacios";
import { formatFecha } from "@/lib/format";
import Antiguedad from "@/components/antiguedad";
import { EstadoVacio } from "@/components/estado-vacio";
import { Rotulo } from "@/components/papel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Cerrado, SinSesion, useUsuario } from "./comun";

type Carga = { estado: "cargando" } | { estado: "ok"; cola: ColaModeracion } | { estado: "sin-permiso" } | { estado: "cerrado" } | { estado: "error"; error: string };

/**
 * La cola de moderación (docs/PLAN-ESPACIOS.md §6): lo oculto por denuncias y
 * lo denunciado aún visible, con los motivos; restaurar o retirar, con una
 * nota que queda en el registro de acciones; suspender o levantar una
 * suspensión. Solo la ve quien está en `espacios.moderadores`: la base lo
 * decide, esta pantalla solo lo pinta.
 */
export default function Moderar() {
  const sesion = useUsuario();
  if (sesion.estado === "cargando") return <Skeleton className="h-[420px] w-full" />;
  if (sesion.estado === "fuera") return <SinSesion volver="/espacio/moderar" que="Entra para moderar" />;
  return <Cola />;
}

function Cola() {
  const [carga, setCarga] = useState<Carga>({ estado: "cargando" });

  const cargar = useCallback(async () => {
    const yo = await estadoConversacion();
    if (!yo.ok) return setCarga(yo.cerrado ? { estado: "cerrado" } : { estado: "error", error: yo.error });
    if (!yo.datos.moderador) return setCarga({ estado: "sin-permiso" });
    const c = await colaModeracion();
    setCarga(c.ok ? { estado: "ok", cola: c.datos } : { estado: "error", error: c.error });
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (carga.estado === "cargando") return <Skeleton className="h-[420px] w-full" />;
  if (carga.estado === "cerrado") return <Cerrado />;
  if (carga.estado === "sin-permiso") {
    return (
      <EstadoVacio como="h1" titulo="Esta página es de quien modera" accion={<Button asChild variant="secondary"><Link href="/comunidad">Ir a la comunidad</Link></Button>}>
        Tu cuenta no modera la conversación. Si ves algo que rompe las normas, usa «Denunciar» junto a ello.
      </EstadoVacio>
    );
  }
  if (carga.estado === "error") {
    return (
      <EstadoVacio como="h1" variante="caida" titulo="No pudimos traer la cola" accion={<Button type="button" variant="secondary" onClick={() => void cargar()}>Volver a intentarlo</Button>}>
        {carga.error} Lo publicado sigue como estaba.
      </EstadoVacio>
    );
  }

  const { comentarios, hilos, suspensiones } = carga.cola;
  return (
    <div className="space-y-5">
      <header>
        <Rotulo>Moderación · privado</Rotulo>
        <h1 className="font-display mt-1 text-3xl text-ink sm:text-4xl">¿Qué hay que revisar?</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Lo oculto por tres denuncias espera tu decisión; lo denunciado menos veces sigue visible.
          Cada decisión cierra sus denuncias y queda registrada con tu nota.{" "}
          <Link href="/comunidad/normas" className="font-medium text-brand-700 hover:underline">Las normas</Link>
        </p>
      </header>

      <Card as="section" className="p-5">
        <CardTitle>
          Comentarios <span className="font-mono text-sm font-normal tabular-nums text-ink-soft">{comentarios.length}</span>
        </CardTitle>
        {comentarios.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">Nada pendiente.</p>
        ) : (
          <ul className="mt-2 divide-y divide-hairline">
            {comentarios.map((c) => (
              <li key={c.id} className="space-y-2 py-4">
                <p className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                  <Badge variant={c.estado === "oculto" ? "alerta" : "neutro"}>{c.estado === "oculto" ? "Oculto" : "Visible"}</Badge>
                  <span className="font-semibold text-ink">{c.autor}</span>
                  <Antiguedad iso={c.creado} />
                  <span aria-hidden>·</span>
                  {rutaPropia(c.hilo.href) ? (
                    <Link href={`${c.hilo.href}#conversacion`} className="font-medium text-brand-700 hover:underline">
                      {NOMBRE_HILO[c.hilo.tipo] ?? c.hilo.tipo}: {c.hilo.titulo}
                    </Link>
                  ) : (
                    <span>{c.hilo.titulo}</span>
                  )}
                </p>
                <Card className="whitespace-pre-line break-words bg-canvas px-3 py-2 text-[15px] leading-relaxed text-ink">{c.cuerpo || "(vacío)"}</Card>
                <Denuncias lista={c.denuncias} />
                <Decidir objetivo={{ tipo: "comentario", id: c.id }} onHecho={cargar} />
                <Suspender usuario={c.usuario} nombre={c.autor} onHecho={cargar} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card as="section" className="p-5">
        <CardTitle>
          Conversaciones <span className="font-mono text-sm font-normal tabular-nums text-ink-soft">{hilos.length}</span>
        </CardTitle>
        <p className="mt-1 text-xs text-ink-soft">El título de una conversación lo pone quien la abre: aquí se retira uno falso u ofensivo.</p>
        {hilos.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">Nada pendiente.</p>
        ) : (
          <ul className="mt-2 divide-y divide-hairline">
            {hilos.map((h) => (
              <li key={`${h.tipo}:${h.ref}`} className="space-y-2 py-4">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={h.estado === "oculto" ? "alerta" : "neutro"}>{h.estado === "oculto" ? "Oculta" : "Visible"}</Badge>
                  <span className="font-semibold text-ink">{h.titulo}</span>
                  <span className="font-mono text-xs text-ink-soft">{h.href}</span>
                </p>
                <Denuncias lista={h.denuncias} />
                <Retitular clave={`${h.tipo}:${h.ref}`} actual={h.titulo} onHecho={cargar} />
                <Decidir objetivo={{ tipo: "hilo", clave: `${h.tipo}:${h.ref}` }} onHecho={cargar} />
                {h.abierto_por && <Suspender usuario={h.abierto_por} nombre={h.abierto_por_nombre ?? "quien la abrió"} onHecho={cargar} />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card as="section" className="p-5">
        <CardTitle>
          Suspensiones vigentes <span className="font-mono text-sm font-normal tabular-nums text-ink-soft">{suspensiones.length}</span>
        </CardTitle>
        {suspensiones.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">Ninguna.</p>
        ) : (
          <ul className="mt-2 divide-y divide-hairline">
            {suspensiones.map((s) => (
              <li key={s.usuario} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span>
                  <span className="font-semibold text-ink">{s.nombre}</span>
                  <span className="text-ink-soft"> · hasta el {formatFecha(s.hasta)} · {s.motivo}</span>
                </span>
                <Levantar usuario={s.usuario} onHecho={cargar} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Denuncias({ lista }: { lista: DenunciaEnCola[] | null }) {
  if (!lista?.length) return null;
  return (
    <ul className="space-y-0.5 text-xs text-ink-soft">
      {lista.map((d, i) => (
        <li key={i}>
          <span className="font-medium text-ink">{MOTIVOS_DENUNCIA[d.motivo]?.nombre ?? d.motivo}</span>
          {d.detalle ? `: ${d.detalle}` : ""} · {d.con_cedula ? "con cédula" : "sin cédula (no cuenta para ocultar)"} ·{" "}
          <Antiguedad iso={d.creado} />
        </li>
      ))}
    </ul>
  );
}

function Decidir({
  objetivo,
  onHecho,
}: {
  objetivo: { tipo: "comentario"; id: string } | { tipo: "hilo"; clave: string };
  onHecho: () => Promise<void>;
}) {
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState(false);
  const id = `nota-${objetivo.tipo === "comentario" ? objetivo.id : objetivo.clave}`;

  async function decidir(accion: "restaurar" | "retirar") {
    setEnCurso(true);
    const r = await moderar(objetivo, accion, nota);
    setEnCurso(false);
    if (!r.ok) return setError(r.error);
    await onHecho();
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Label htmlFor={id} className="sr-only">Nota de la decisión</Label>
      <Input id={id} value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} placeholder="Por qué (queda en el registro)" />
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="secondary" disabled={enCurso} onClick={() => void decidir("restaurar")}>Restaurar</Button>
        <Button type="button" variant="destructive" disabled={enCurso} onClick={() => void decidir("retirar")}>Retirar</Button>
      </div>
      {error && <p role="status" className="text-xs text-alerta-700">{error}</p>}
    </div>
  );
}

/** Corregir el título falso u ofensivo de una conversación sin cerrarla. */
function Retitular({ clave, actual, onHecho }: { clave: string; actual: string; onHecho: () => Promise<void> }) {
  const [titulo, setTitulo] = useState(actual);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cambia = titulo.trim().length > 0 && titulo.trim() !== actual;
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!cambia) return;
        const r = await retitular(clave, titulo, nota);
        if (!r.ok) return setError(r.error);
        await onHecho();
      }}
    >
      <Label htmlFor={`titulo-${clave}`} className="sr-only">Título corregido</Label>
      <Input id={`titulo-${clave}`} value={titulo} maxLength={300} onChange={(e) => setTitulo(e.target.value)} />
      <Label htmlFor={`nota-titulo-${clave}`} className="sr-only">Por qué</Label>
      <Input id={`nota-titulo-${clave}`} value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} placeholder="Por qué (queda en el registro)" className="sm:w-56" />
      <Button type="submit" variant="secondary" disabled={!cambia} className="shrink-0">Corregir título</Button>
      {error && <p role="status" className="text-xs text-alerta-700">{error}</p>}
    </form>
  );
}

function Suspender({ usuario, nombre, onHecho }: { usuario: string; nombre: string; onHecho: () => Promise<void> }) {
  const [abierto, setAbierto] = useState(false);
  const [dias, setDias] = useState("7");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!abierto) {
    return (
      <Button type="button" variant="ghost" size="sm" className="h-11 text-ink-soft sm:h-9" onClick={() => setAbierto(true)}>
        Suspender a {nombre}…
      </Button>
    );
  }
  const n = Number(dias);
  const valido = Number.isInteger(n) && n >= 1 && n <= 3650 && motivo.trim().length > 0;
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valido) return;
        const r = await suspender(usuario, n, motivo);
        if (!r.ok) return setError(r.error);
        await onHecho();
      }}
    >
      <Label htmlFor={`dias-${usuario}`} className="sr-only">Días</Label>
      <Input id={`dias-${usuario}`} inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} className="sm:w-20" aria-describedby={`ayuda-${usuario}`} />
      <Label htmlFor={`motivo-${usuario}`} className="sr-only">Motivo</Label>
      <Input id={`motivo-${usuario}`} value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (queda en el registro)" />
      <div className="flex shrink-0 gap-2">
        <Button type="submit" variant="destructive" disabled={!valido}>Suspender</Button>
        <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
      </div>
      <p id={`ayuda-${usuario}`} className="text-xs text-ink-soft">{valido ? "" : "Días (1 a 3650) y un motivo."}</p>
      {error && <p role="status" className="text-xs text-alerta-700">{error}</p>}
    </form>
  );
}

function Levantar({ usuario, onHecho }: { usuario: string; onHecho: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11 sm:h-9"
        onClick={async () => {
          const r = await suspender(usuario, 0, "levantada");
          if (!r.ok) return setError(r.error);
          await onHecho();
        }}
      >
        Levantar
      </Button>
      {error && <span role="status" className="text-xs text-alerta-700">{error}</span>}
    </span>
  );
}
