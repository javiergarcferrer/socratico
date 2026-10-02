"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  aceptarInvitacion,
  crearProyecto,
  entradasDe,
  fechar,
  guardar,
  misInvitaciones,
  misProyectos,
  quitarEntrada,
  rechazarInvitacion,
  type Entrada,
  type InvitacionRecibida,
  type ProyectoConCuenta,
  type Usuario,
} from "@/lib/espacios-cliente";
import { getSeguidos, onSeguimientoCambio } from "@/lib/seguimiento";
import Antiguedad from "@/components/antiguedad";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ErrorCampo } from "@/components/ui/error-campo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Rotulo } from "@/components/papel";
import { IconArrowRight, IconBell, IconFolder, IconPlus, IconTrash, IconUser } from "@/components/icons";
import { Cerrado, EnlaceRegistro, MarcaTipo, SinSesion, useUsuario } from "./comun";
import { AvisoDeshacer, type Deshacible } from "./deshacer";
import Uso from "./uso";

const ROL: Record<ProyectoConCuenta["rol"], string> = { dueno: "Tuyo", editor: "Editas", lector: "Lees" };

/**
 * El espacio del lector: las invitaciones que esperan respuesta, lo que sigue,
 * sus investigaciones (propias y compartidas) y lo guardado sin ordenar. El
 * orden es el de la pregunta con que se abre: ¿quién me espera? → ¿qué
 * cambió? → ¿en qué estoy trabajando? → ¿qué dejé sin ordenar?
 * (docs/INFRAESTRUCTURA.md §11).
 */
export default function MiEspacio() {
  const sesion = useUsuario();
  if (sesion.estado === "cargando") return <Skeleton className="h-[420px] w-full" />;
  if (sesion.estado === "fuera") return <SinSesion volver="/espacio" que="Entra para ver tu espacio" />;
  return <Espacio u={sesion.usuario} />;
}

function Espacio({ u }: { u: Usuario }) {
  const [proyectos, setProyectos] = useState<ProyectoConCuenta[] | null>(null);
  const [sueltas, setSueltas] = useState<Entrada[] | null>(null);
  const [cerrado, setCerrado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seguidos, setSeguidos] = useState(0);
  const [invitaciones, setInvitaciones] = useState<InvitacionRecibida[]>([]);

  const cargar = useCallback(async () => {
    const [p, e, i] = await Promise.all([misProyectos(u), entradasDe(u, null), misInvitaciones()]);
    if ((!p.ok && p.cerrado) || (!e.ok && e.cerrado)) {
      setCerrado(true);
      return;
    }
    if (i.ok) setInvitaciones(i.datos);
    else setError(`No pudimos ver si tienes invitaciones pendientes. ${i.error}`);
    if (!p.ok) setError(p.error);
    else setProyectos(p.datos);
    if (!e.ok) setError(e.error);
    else setSueltas(e.datos);
  }, [u]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    const contar = () => setSeguidos(getSeguidos().length);
    contar();
    return onSeguimientoCambio(contar);
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <Rotulo>Tu espacio · {u.email}</Rotulo>
        <h1 className="font-display mt-1 text-3xl text-ink sm:text-4xl">¿En qué estás trabajando?</h1>
      </header>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-start gap-3">
          <IconBell className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
          <div>
            <CardTitle className="text-base">Lo que sigues</CardTitle>
            <p className="mt-0.5 text-sm text-ink-soft">
              {seguidos === 0
                ? "Todavía nada. En cada compra, iniciativa, norma, proveedor o institución, «Seguir» te avisa aquí cuando cambie."
                : `${seguidos} ${seguidos === 1 ? "pieza" : "piezas"}, en cualquier dispositivo en que entres.`}
            </p>
          </div>
        </div>
        {seguidos > 0 && (
          <Button asChild variant="secondary">
            <Link href="/seguimiento">
              Ver qué cambió
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </Card>

      {cerrado ? (
        <Cerrado />
      ) : (
        <>
          {error && <Alert variant="aviso" className="px-4 py-3 text-sm">{error}</Alert>}
          {invitaciones.length > 0 && <Invitaciones lista={invitaciones} onCambio={cargar} />}
          <Proyectos proyectos={proyectos} onCreado={cargar} />
          <Guardado sueltas={sueltas} proyectos={proyectos} onCambio={cargar} />
        </>
      )}

      {/*
        Solo para quien lleva la plataforma; a cualquier otra cuenta no le pinta
        nada. `key`: si la sesión cambia de cuenta sin pasar por «fuera» (otra
        pestaña), el panel se monta de nuevo y no le quedan las cifras de la anterior.
      */}
      <Uso key={u.id} />
    </div>
  );
}

const ROL_INVITADO: Record<InvitacionRecibida["rol"], string> = {
  editor: "para editar: guardar, anotar y enlazar",
  lector: "para leer",
};

/**
 * Las invitaciones a este correo verificado. No se aceptan solas: entrar en
 * un proyecto ajeno es decisión de quien entra, y lo que anote ahí lo publica
 * el dueño con su propio nombre si decide publicarlo.
 */
function Invitaciones({ lista, onCambio }: { lista: InvitacionRecibida[]; onCambio: () => void }) {
  const router = useRouter();
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function aceptar(i: InvitacionRecibida) {
    setEnCurso(i.id);
    const r = await aceptarInvitacion(i.id);
    setEnCurso(null);
    if (!r.ok) return setAviso(r.error);
    router.push(`/espacio/proyecto?id=${r.datos}`);
  }

  async function rechazar(i: InvitacionRecibida) {
    setEnCurso(i.id);
    const r = await rechazarInvitacion(i.id);
    setEnCurso(null);
    if (!r.ok) return setAviso(r.error);
    onCambio();
  }

  return (
    <Card as="section" className="border-brand-200 p-5" aria-live="polite">
      <CardTitle>{lista.length === 1 ? "Te invitaron a un proyecto" : `Te invitaron a ${lista.length} proyectos`}</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Si aceptas, quien invita y sus colaboradores ven tu nombre de firma o, si no tienes, tu
        correo enmascarado. Lo que anotes ahí es
        parte de su proyecto: si lo publica, sale bajo su nombre, no el tuyo.
      </p>
      {aviso && <p role="alert" className="mt-2 text-xs text-alerta-700">{aviso}</p>}
      <ul className="mt-3 divide-y divide-hairline">
        {lista.map((i) => (
          <li key={i.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <IconUser className="mt-0.5 h-5 w-5 shrink-0 text-ink-soft" />
              <div className="min-w-0">
                <p className="font-medium text-ink">{i.titulo}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-soft">
                  <span>De {i.invita ?? "una cuenta sin nombre de firma"}, {ROL_INVITADO[i.rol]}</span>
                  <span aria-hidden>·</span>
                  <Antiguedad iso={i.creado} />
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" onClick={() => aceptar(i)} disabled={enCurso !== null}>
                Aceptar
              </Button>
              <Button type="button" variant="outline" onClick={() => rechazar(i)} disabled={enCurso !== null}>
                Rechazar
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Proyectos({ proyectos, onCreado }: { proyectos: ProyectoConCuenta[] | null; onCreado: () => void }) {
  const router = useRouter();
  const [titulo, setTitulo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinTitulo, setSinTitulo] = useState(false);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const limpio = titulo.trim();
    // Vacío no apaga el botón: pulsarlo dice qué falta, junto al campo.
    if (!limpio) {
      setSinTitulo(true);
      document.getElementById("nueva-investigacion")?.focus();
      return;
    }
    setSinTitulo(false);
    setCargando(true);
    const r = await crearProyecto(limpio);
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setTitulo("");
    setError(null);
    onCreado();
    router.push(`/espacio/proyecto?id=${r.datos.id}`);
  }

  return (
    <Card as="section" className="p-5">
      <CardTitle>Tus proyectos</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Un proyecto junta registros de toda la plataforma (compras, contratistas, normas,
        iniciativas, sentencias, documentos) con tus notas y lo que los une.
      </p>
      <form onSubmit={crear} className="mt-3 flex gap-2">
        <Label htmlFor="nueva-investigacion" className="sr-only">Título del nuevo proyecto</Label>
        <Input
          id="nueva-investigacion"
          name="titulo"
          autoComplete="off"
          value={titulo}
          maxLength={140}
          onChange={(e) => {
            setTitulo(e.target.value);
            if (sinTitulo) setSinTitulo(false);
          }}
          placeholder="Ej.: Compras de INAPA en 2026"
          aria-invalid={sinTitulo || undefined}
          aria-describedby={sinTitulo ? "nueva-investigacion-error" : undefined}
        />
        <Button type="submit" disabled={cargando} className="shrink-0">
          <IconPlus className="h-4 w-4" />
          {cargando ? "Creando…" : "Crear"}
        </Button>
      </form>
      <ErrorCampo id="nueva-investigacion-error" className="mt-1.5">
        {sinTitulo ? "Ponle un título al proyecto." : ""}
      </ErrorCampo>
      {error && <p role="alert" className="mt-2 text-xs text-alerta-700">{error}</p>}

      {proyectos === null ? (
        <Skeleton className="mt-4 h-24 w-full" />
      ) : proyectos.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">
          Aún no tienes ninguno. Crea uno arriba o guarda un registro desde su ficha.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-hairline">
          {proyectos.map((p) => (
            <li key={p.id} className="relative flex items-start gap-3 py-3">
              <IconFolder className="mt-0.5 h-5 w-5 shrink-0 text-ink-soft" />
              <div className="min-w-0 flex-1">
                <Link href={`/espacio/proyecto?id=${p.id}`} className="estira font-medium text-ink">
                  {p.titulo}
                </Link>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                  <span className="font-mono tabular-nums">
                    {p.registros} {p.registros === 1 ? "registro" : "registros"}
                  </span>
                  <span aria-hidden>·</span>
                  <Antiguedad iso={p.actualizado} prefijo="editado" />
                  <Badge variant={p.rol === "dueno" ? "neutro" : "firma"}>{ROL[p.rol]}</Badge>
                  {p.publico && <Badge variant="valido">Publicado</Badge>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Guardado({
  sueltas,
  proyectos,
  onCambio,
}: {
  sueltas: Entrada[] | null;
  proyectos: ProyectoConCuenta[] | null;
  onCambio: () => void;
}) {
  const editables = (proyectos ?? []).filter((p) => p.rol !== "lector");
  const [aviso, setAviso] = useState<string | null>(null);
  /*
    Quitar algo guardado sin ordenar se deshace entero: vuelve a guardarse con
    su nota y su fecha (no tiene enlaces ni sitio en un tablero). Por eso no se
    pregunta antes; se ofrece «Deshacer» (docs/INFRAESTRUCTURA.md §11).
  */
  const [deshacible, setDeshacible] = useState<Deshacible | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);

  // Mover es copiar con su nota y borrar el original. Si el borrado falla, se
  // deshace la copia: el registro no queda en dos sitios sin que se sepa.
  async function mover(e: Entrada, proyecto: string) {
    const r = await guardar(e, proyecto, e.nota);
    if (!r.ok) return setAviso(r.error);
    const q = await quitarEntrada(e.id);
    if (!q.ok) {
      await quitarEntrada(r.datos.id);
      return setAviso(q.error);
    }
    setAviso(null);
    onCambio();
  }

  async function quitar(e: Entrada) {
    setQuitando(e.id);
    const r = await quitarEntrada(e.id);
    setQuitando(null);
    if (!r.ok) return setAviso(r.error);
    setAviso(null);
    setDeshacible({
      texto: `Quitaste «${e.titulo}» de lo guardado.`,
      deshacer: async () => {
        const g = await guardar(e, null, e.nota);
        if (!g.ok) return g;
        if (e.fecha) await fechar(g.datos.id, e.fecha);
        onCambio();
        return { ok: true };
      },
    });
    onCambio();
  }

  return (
    <Card as="section" className="p-5">
      <CardTitle>Guardado sin ordenar</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Lo que guardaste con «Guardar» sin elegir proyecto. Llévalo a uno cuando sepas dónde va.
      </p>
      {aviso && <p role="alert" className="mt-2 text-xs text-alerta-700">{aviso}</p>}
      <AvisoDeshacer aviso={deshacible} onCerrar={() => setDeshacible(null)} className="mt-3" />
      {sueltas === null ? (
        <Skeleton className="mt-4 h-24 w-full" />
      ) : sueltas.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">Nada por ahora.</p>
      ) : (
        <ul className="mt-3 divide-y divide-hairline">
          {sueltas.map((e) => (
            <li key={e.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <EnlaceRegistro titulo={e.titulo} href={e.href} />
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                  <MarcaTipo tipo={e.tipo} />
                  <Antiguedad iso={e.creado} prefijo="guardado" />
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {editables.length > 0 && (
                  <Select onValueChange={(v) => void mover(e, v)}>
                    <SelectTrigger className="w-44" aria-label={`Llevar «${e.titulo}» a un proyecto`}>
                      <SelectValue placeholder="Llevar a…" />
                    </SelectTrigger>
                    <SelectContent>
                      {editables.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.titulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={quitando !== null}
                  onClick={() => void quitar(e)}
                  aria-label={`Quitar «${e.titulo}» de lo guardado`}
                >
                  <IconTrash className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
