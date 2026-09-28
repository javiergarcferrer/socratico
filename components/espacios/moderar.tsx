"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
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
import { ErrorCampo } from "@/components/ui/error-campo";
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
  if (carga.estado === "cerrado") return <Cerrado h1 />;
  if (carga.estado === "sin-permiso") {
    return (
      <EstadoVacio como="h1" titulo="Esta página es de quien modera" accion={<Button asChild variant="secondary"><Link href="/comunidad">Ir a la comunidad</Link></Button>}>
        Tu cuenta no modera la conversación. Si ves algo que rompe las normas, usa «Reportar» junto a ello.
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
          Lo oculto por tres reportes espera tu decisión; lo reportado menos veces sigue visible.
          Cada decisión cierra sus reportes y queda registrada con tu nota.{" "}
          <Link href="/comunidad/normas" className="font-medium text-brand-700 hover:underline">Lee las normas</Link>.
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
                <Levantar usuario={s.usuario} nombre={s.nombre} onHecho={cargar} />
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
  // Retirar saca lo publicado de la vista de todos y la decisión cierra el
  // caso en la cola: se confirma antes, como el borrar de una investigación.
  const [seguro, setSeguro] = useState(false);
  const id = `nota-${objetivo.tipo === "comentario" ? objetivo.id : objetivo.clave}`;

  async function decidir(accion: "restaurar" | "retirar") {
    setSeguro(false);
    setEnCurso(true);
    const r = await moderar(objetivo, accion, nota.trim());
    setEnCurso(false);
    if (!r.ok) return setError(r.error);
    await onHecho();
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Label htmlFor={id} className="sr-only">Nota de la decisión</Label>
      <Input id={id} value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} placeholder="Por qué (queda en el registro)…" />
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="secondary" disabled={enCurso} onClick={() => void decidir("restaurar")}>Restaurar</Button>
        {seguro ? (
          <>
            <Button type="button" variant="destructive" disabled={enCurso} onClick={() => void decidir("retirar")}>
              {objetivo.tipo === "comentario" ? "Sí, retirar el comentario" : "Sí, retirar la conversación"}
            </Button>
            <Button type="button" variant="ghost" disabled={enCurso} onClick={() => setSeguro(false)}>No</Button>
          </>
        ) : (
          <Button type="button" variant="destructive" disabled={enCurso} onClick={() => setSeguro(true)}>
            {enCurso ? "Decidiendo…" : "Retirar"}
          </Button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-alerta-700">{error}</p>}
    </div>
  );
}

/** Corregir el título falso u ofensivo de una conversación sin cerrarla. */
function Retitular({ clave, actual, onHecho }: { clave: string; actual: string; onHecho: () => Promise<void> }) {
  const [titulo, setTitulo] = useState(actual);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Sin título, o con el mismo, no hay nada que corregir: el botón sigue
  // activo y lo dice junto al campo en vez de apagarse sin explicación.
  const [aviso, setAviso] = useState("");
  const [enCurso, setEnCurso] = useState(false);
  const idTitulo = `titulo-${clave}`;
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={async (e) => {
        e.preventDefault();
        const limpio = titulo.trim();
        if (!limpio || limpio === actual) {
          setAviso(limpio ? "Es el mismo título: cámbialo para corregirlo." : "Escribe el título corregido.");
          document.getElementById(idTitulo)?.focus();
          return;
        }
        setAviso("");
        setEnCurso(true);
        const r = await retitular(clave, limpio, nota.trim());
        setEnCurso(false);
        if (!r.ok) return setError(r.error);
        await onHecho();
      }}
    >
      <Label htmlFor={idTitulo} className="sr-only">Título corregido</Label>
      <Input
        id={idTitulo}
        name="titulo"
        autoComplete="off"
        value={titulo}
        maxLength={300}
        onChange={(e) => {
          setTitulo(e.target.value);
          if (aviso) setAviso("");
        }}
        aria-invalid={aviso ? true : undefined}
        aria-describedby={aviso ? `${idTitulo}-error` : undefined}
      />
      <Label htmlFor={`nota-titulo-${clave}`} className="sr-only">Por qué</Label>
      <Input id={`nota-titulo-${clave}`} name="nota" autoComplete="off" value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} placeholder="Por qué (queda en el registro)…" className="sm:w-56" />
      <Button type="submit" variant="secondary" disabled={enCurso} className="shrink-0">
        {enCurso ? "Corrigiendo…" : "Corregir título"}
      </Button>
      <ErrorCampo id={`${idTitulo}-error`}>{aviso}</ErrorCampo>
      {error && <p role="alert" className="text-xs text-alerta-700">{error}</p>}
    </form>
  );
}

function Suspender({ usuario, nombre, onHecho }: { usuario: string; nombre: string; onHecho: () => Promise<void> }) {
  // La misma persona puede salir dos veces en la cola (autora y quien abrió
  // una conversación): los ids del formulario no pueden repetirse.
  const u = useId();
  const [abierto, setAbierto] = useState(false);
  const [dias, setDias] = useState("7");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [falta, setFalta] = useState<"dias" | "motivo" | null>(null);
  const [enCurso, setEnCurso] = useState(false);

  if (!abierto) {
    return (
      <Button type="button" variant="ghost" size="sm" className="h-11 text-ink-soft sm:h-9" onClick={() => setAbierto(true)}>
        Suspender a {nombre}…
      </Button>
    );
  }
  const n = Number(dias.trim());
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={async (e) => {
        e.preventDefault();
        const razon = motivo.trim();
        const mal = !(Number.isInteger(n) && n >= 1 && n <= 3650) ? "dias" : !razon ? "motivo" : null;
        setFalta(mal);
        if (mal) {
          document.getElementById(`${mal}-${u}`)?.focus();
          return;
        }
        setEnCurso(true);
        const r = await suspender(usuario, n, razon);
        setEnCurso(false);
        if (!r.ok) return setError(r.error);
        await onHecho();
      }}
    >
      <Label htmlFor={`dias-${u}`} className="sr-only">Días</Label>
      <Input
        id={`dias-${u}`}
        name="dias"
        inputMode="numeric"
        autoComplete="off"
        value={dias}
        onChange={(e) => {
          setDias(e.target.value);
          if (falta === "dias") setFalta(null);
        }}
        className="sm:w-20"
        aria-invalid={falta === "dias" || undefined}
        aria-describedby={falta === "dias" ? `error-${u} ayuda-${u}` : `ayuda-${u}`}
      />
      <Label htmlFor={`motivo-${u}`} className="sr-only">Motivo</Label>
      <Input
        id={`motivo-${u}`}
        name="motivo"
        autoComplete="off"
        value={motivo}
        maxLength={500}
        onChange={(e) => {
          setMotivo(e.target.value);
          if (falta === "motivo") setFalta(null);
        }}
        placeholder="Motivo (queda en el registro)…"
        aria-invalid={falta === "motivo" || undefined}
        aria-describedby={falta === "motivo" ? `error-${u} ayuda-${u}` : `ayuda-${u}`}
      />
      <div className="flex shrink-0 gap-2">
        <Button type="submit" variant="destructive" disabled={enCurso}>{enCurso ? "Suspendiendo…" : "Suspender"}</Button>
        <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
      </div>
      <p id={`ayuda-${u}`} className="text-xs text-ink-soft">Días (de 1 a 3,650) y un motivo.</p>
      <ErrorCampo id={`error-${u}`}>
        {falta === "dias" ? "Los días van de 1 a 3,650." : falta === "motivo" ? "Escribe el motivo: queda en el registro." : ""}
      </ErrorCampo>
      {error && <p role="alert" className="text-xs text-alerta-700">{error}</p>}
    </form>
  );
}

function Levantar({ usuario, nombre, onHecho }: { usuario: string; nombre: string; onHecho: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11 sm:h-9"
        disabled={enCurso}
        aria-label={`Levantar la suspensión de ${nombre}`}
        onClick={async () => {
          setEnCurso(true);
          const r = await suspender(usuario, 0, "levantada");
          setEnCurso(false);
          if (!r.ok) return setError(r.error);
          await onHecho();
        }}
      >
        {enCurso ? "Levantando…" : "Levantar"}
      </Button>
      {error && <span role="alert" className="text-xs text-alerta-700">{error}</span>}
    </span>
  );
}
