"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { buscarEnPlataforma, claves } from "@/lib/consultas";
import {
  borrarProyecto,
  cambiarRol,
  editarProyecto,
  enlacesDe,
  entradasDe,
  guardar,
  invitacionesDe,
  invitar,
  miembrosDe,
  publicar,
  quitarMiembro,
  retirarInvitacion,
  unProyecto,
  type Enlace,
  type Entrada,
  type Hecho,
  type Invitacion,
  type Miembro,
  type ProyectoConCuenta,
  type Usuario,
} from "@/lib/espacios-cliente";
import { esTipoEntrada, hrefValido, type Referencia, type TipoEntrada } from "@/lib/espacios";
import { correoValido } from "@/lib/sesion";
import { enviarConModificador } from "@/components/teclas";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ErrorCampo } from "@/components/ui/error-campo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EstadoVacio } from "@/components/estado-vacio";
import { Rotulo } from "@/components/papel";
import { IconPencil, IconPlus, IconSearch, IconTrash } from "@/components/icons";
import Caso from "./caso";
import { Cerrado, EnlaceRegistro, MarcaTipo, SinSesion, useUsuario } from "./comun";
import { AvisoDeshacer, type Deshacible } from "./deshacer";
import ExportarFtm from "./exportar-ftm";

/**
 * La mesa de una investigación: el caso —tablero, línea de tiempo, evidencia
 * y narración (`./caso.tsx`)—, quién trabaja en ella, cómo se lleva a otras
 * herramientas y si se publica (docs/PLAN-ESPACIOS.md §3 y §7).
 *
 * Cada registro enlaza a su ficha viva: aquí no hay cifras del Estado, solo lo
 * que el lector eligió, cómo lo ordenó y qué anotó. Quien solo lee
 * (`lector`) ve lo mismo sin los controles de edición; publicar, invitar y
 * borrar son del dueño. La base lo impone (RLS); la pantalla solo no ofrece
 * lo que no se puede hacer.
 */
export default function MesaProyecto({ id }: { id: string | null }) {
  const sesion = useUsuario();
  if (!id) {
    return (
      <EstadoVacio
        como="h1"
        titulo="Falta decir qué proyecto abrir"
        accion={<Button asChild variant="secondary"><Link href="/espacio">Volver a tu espacio</Link></Button>}
      >
        La dirección no dice cuál. Tus proyectos están en tu espacio.
      </EstadoVacio>
    );
  }
  if (sesion.estado === "cargando") return <Skeleton className="h-[520px] w-full" />;
  if (sesion.estado === "fuera") return <SinSesion volver={`/espacio/proyecto?id=${id}`} que="Entra para abrir este proyecto" />;
  return <Mesa u={sesion.usuario} id={id} />;
}

/** Del tipo que devuelve `/api/buscar` al tipo que se guarda. */
function tipoDeResultado(t: string): TipoEntrada | null {
  const tipo = t === "iniciativa" ? "proyecto" : t;
  return esTipoEntrada(tipo) ? tipo : null;
}

function Mesa({ u, id }: { u: Usuario; id: string }) {
  const [p, setP] = useState<ProyectoConCuenta | null | undefined>(undefined);
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [enlaces, setEnlaces] = useState<Enlace[]>([]);
  const [cerrado, setCerrado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await unProyecto(u, id);
    if (!r.ok) {
      if (r.cerrado) setCerrado(true);
      else setError(r.error);
      return;
    }
    setP(r.datos);
    if (!r.datos) return;
    const [e, l] = await Promise.all([entradasDe(u, id), enlacesDe(id)]);
    if (e.ok) setEntradas(e.datos);
    else setError(e.error);
    if (l.ok) setEnlaces(l.datos);
  }, [u, id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (cerrado) return <Cerrado h1 />;
  if (p === undefined && !error) return <Skeleton className="h-[520px] w-full" />;
  if (!p) {
    return (
      <EstadoVacio
        como="h1"
        variante={error ? "caida" : "vacio"}
        titulo={error ? "No pudimos abrir este proyecto" : "Este proyecto no existe o no es tuyo"}
        accion={<Button asChild variant="secondary"><Link href="/espacio">Volver a tu espacio</Link></Button>}
      >
        {error ?? "Puede que lo hayan borrado o que te hayan quitado de él. Si te invitaron, entra con el correo al que llegó la invitación."}
      </EstadoVacio>
    );
  }

  const edita = p.rol === "dueno" || p.rol === "editor";
  return (
    <div className="space-y-5">
      <Cabecera p={p} edita={edita} onCambio={cargar} />
      {error && <Alert variant="aviso" className="px-4 py-3 text-sm">{error}</Alert>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          {edita && <Agregar proyecto={p.id} existentes={entradas} onAgregado={cargar} />}
          <Caso
            proyecto={p.id}
            entradas={entradas}
            enlaces={enlaces}
            edita={edita}
            onCambio={cargar}
            onMovida={(eid, x, y) => setEntradas((todas) => todas.map((e) => (e.id === eid ? { ...e, x, y } : e)))}
          />
        </div>
        <aside className="space-y-5">
          <Colaboran p={p} u={u} />
          <Llevar titulo={p.titulo} entradas={entradas} enlaces={enlaces} />
          {p.rol === "dueno" && <Publicar p={p} onCambio={cargar} />}
          {p.rol === "dueno" && <Borrar p={p} />}
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ cabecera */

function Cabecera({ p, edita, onCambio }: { p: ProyectoConCuenta; edita: boolean; onCambio: () => void }) {
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(p.titulo);
  const [descripcion, setDescripcion] = useState(p.descripcion);
  const [error, setError] = useState<string | null>(null);
  const [tituloMal, setTituloMal] = useState(false);
  const [guardando, setGuardando] = useState(false);

  async function guardarCambios(e: React.FormEvent) {
    e.preventDefault();
    if (guardando) return;
    const limpio = titulo.trim();
    if (!limpio) {
      setTituloMal(true);
      document.getElementById("titulo-proyecto")?.focus();
      return;
    }
    setGuardando(true);
    const r = await editarProyecto(p.id, { titulo: limpio, descripcion: descripcion.trim() });
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    setEditando(false);
    onCambio();
  }

  const rol = { dueno: "Tuyo", editor: "Editas", lector: "Solo lees" }[p.rol];
  return (
    <header>
      <Rotulo>
        <Link href="/espacio" className="hover:underline">Tu espacio</Link> · Proyecto · {rol}
        {p.publico && " · Publicado"}
      </Rotulo>
      {editando ? (
        <form onSubmit={guardarCambios} className="mt-2 space-y-2.5">
          <Label htmlFor="titulo-proyecto" className="sr-only">Título</Label>
          <Input
            id="titulo-proyecto"
            name="titulo"
            autoComplete="off"
            value={titulo}
            maxLength={140}
            onChange={(e) => {
              setTitulo(e.target.value);
              if (tituloMal) setTituloMal(false);
            }}
            aria-invalid={tituloMal || undefined}
            aria-describedby={tituloMal ? "titulo-proyecto-error" : undefined}
          />
          <ErrorCampo id="titulo-proyecto-error">
            {tituloMal ? "El proyecto necesita un título." : ""}
          </ErrorCampo>
          <Label htmlFor="descripcion-proyecto" className="sr-only">De qué trata</Label>
          <Textarea
            id="descripcion-proyecto"
            name="descripcion"
            rows={4}
            value={descripcion}
            maxLength={5000}
            onChange={(e) => setDescripcion(e.target.value)}
            onKeyDown={enviarConModificador}
            placeholder="De qué trata, qué preguntas quieres responder, qué ya sabes…"
          />
          {error && <p role="alert" className="text-xs text-alerta-700">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
            <Button type="button" variant="outline" onClick={() => setEditando(false)}>Cancelar</Button>
          </div>
        </form>
      ) : (
        <>
          <h1 className="font-display mt-1 text-3xl text-ink sm:text-4xl">{p.titulo}</h1>
          {p.descripcion ? (
            <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink-soft">{p.descripcion}</p>
          ) : (
            edita && <p className="mt-2 text-sm text-ink-soft">Sin descripción: di de qué trata y qué quieres responder.</p>
          )}
          {edita && (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setEditando(true)}>
              <IconPencil className="h-3.5 w-3.5" />
              Editar título y descripción
            </Button>
          )}
        </>
      )}
    </header>
  );
}

/* ------------------------------------------------------------- agregar */

interface Hallado extends Referencia {
  detalle: string | null;
}

/**
 * Agregar desde aquí mismo, sin salir: la misma búsqueda de `/buscar`
 * (`/api/buscar`), y cada resultado entra con un toque. La referencia es la
 * ruta del registro: la misma que guarda «Guardar» en su ficha.
 */
function Agregar({ proyecto, existentes, onAgregado }: { proyecto: string; existentes: Entrada[]; onAgregado: () => void }) {
  const [q, setQ] = useState("");
  // Lo que se buscó al enviar el formulario: la consulta sale de aquí, no de
  // cada tecla.
  const [enviada, setEnviada] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ya = useMemo(() => new Set(existentes.map((e) => `${e.tipo}:${e.ref}`)), [existentes]);

  const busqueda = useQuery({
    queryKey: claves.buscar(enviada, 8),
    // La respuesta lleva su consulta: «Nada con…» nombra lo que se buscó.
    queryFn: async ({ signal }) => ({
      q: enviada,
      ...(await buscarEnPlataforma<{ tipo: string; titulo: string; detalle: string | null; href: string | null }>(enviada, 8, signal)),
    }),
    enabled: enviada.length >= 2,
    // La lista anterior se queda mientras llega la nueva: el formulario no salta.
    placeholderData: keepPreviousData,
  });
  const hallados: Hallado[] | null = busqueda.data
    ? (busqueda.data.resultados ?? []).flatMap((x) => {
        const tipo = tipoDeResultado(x.tipo);
        return tipo && x.href && hrefValido(x.href) ? [{ tipo, ref: x.href, titulo: x.titulo, href: x.href, detalle: x.detalle }] : [];
      })
    : null;
  const buscando = busqueda.isFetching;
  const errorBusqueda = busqueda.isError ? "El buscador no respondió. Vuelve a intentarlo." : null;

  const [corta, setCorta] = useState(false);
  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const t = q.trim();
    if (t.length < 2) {
      setCorta(true);
      document.getElementById("agregar-q")?.focus();
      return;
    }
    setCorta(false);
    setError(null);
    // La misma consulta otra vez es «vuelve a intentarlo»: se pide de nuevo.
    if (t === enviada) void busqueda.refetch();
    else setEnviada(t);
  }

  async function agregar(h: Hallado) {
    const r = await guardar(h, proyecto);
    if (!r.ok) return setError(r.error);
    onAgregado();
  }

  return (
    <Card as="section" className="p-5">
      <CardTitle>Agregar un registro</CardTitle>
      <form onSubmit={buscar} className="mt-2 flex gap-2" role="search">
        <Label htmlFor="agregar-q" className="sr-only">Buscar en toda la plataforma</Label>
        <Input
          id="agregar-q"
          name="q"
          type="search"
          autoComplete="off"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (corta) setCorta(false);
          }}
          aria-invalid={corta || undefined}
          aria-describedby={corta ? "agregar-q-error" : undefined}
          placeholder="Una institución, un proveedor, una ley, una compra…"
        />
        <Button type="submit" variant="secondary" disabled={buscando} className="shrink-0">
          <IconSearch className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only">Buscar</span>
        </Button>
      </form>
      <ErrorCampo id="agregar-q-error" className="mt-1.5">
        {corta ? "Escribe al menos dos letras." : ""}
      </ErrorCampo>
      <p className="mt-1.5 text-xs text-ink-soft">
        El mismo índice de «Buscar en todo». También puedes guardar desde la ficha de cada registro.
      </p>
      {(error ?? errorBusqueda) && <p role="alert" className="mt-2 text-xs text-alerta-700">{error ?? errorBusqueda}</p>}
      {hallados && (
        <ul aria-live="polite" className="mt-3 divide-y divide-hairline">
          {hallados.length === 0 && <li className="py-2 text-sm text-ink-soft">Nada con «{busqueda.data?.q}» que se pueda guardar.</li>}
          {hallados.map((h) => {
            const dentro = ya.has(`${h.tipo}:${h.ref}`);
            return (
              <li key={`${h.tipo}:${h.ref}`} className="flex items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <EnlaceRegistro titulo={h.titulo} href={h.href} className="text-sm font-medium text-ink hover:text-brand-700 hover:underline" />
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                    <MarcaTipo tipo={h.tipo} />
                    {h.detalle && <span className="line-clamp-1">{h.detalle}</span>}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={dentro ? "ghost" : "secondary"}
                  disabled={dentro}
                  onClick={() => agregar(h)}
                  aria-label={dentro ? `«${h.titulo}» ya está en el proyecto` : `Agregar «${h.titulo}»`}
                >
                  {dentro ? "Ya está" : (<><IconPlus className="h-3.5 w-3.5" />Agregar</>)}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* --------------------------------------------------------- colaboración */

const NOMBRE_ROL = { dueno: "Dueña o dueño", editor: "Edita", lector: "Lee" } as const;

function Colaboran({ p, u }: { p: ProyectoConCuenta; u: Usuario }) {
  const router = useRouter();
  const [miembros, setMiembros] = useState<Miembro[] | null>(null);
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([]);
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<"editor" | "lector">("editor");
  const [error, setError] = useState<string | null>(null);
  const esDueno = p.rol === "dueno";
  // Quitar a alguien o salirse no se deshace desde aquí (hace falta otra
  // invitación): se pregunta antes, con el «Sí, …» / «No» de `Borrar`.
  const [aQuitar, setAQuitar] = useState<string | null>(null);
  const [saliendo, setSaliendo] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [yendose, setYendose] = useState(false);
  // Retirar una invitación sí se deshace entero: se vuelve a invitar al mismo
  // correo con el mismo rol (docs/DESIGN.md §4.1).
  const [deshacible, setDeshacible] = useState<Deshacible | null>(null);
  const [retirando, setRetirando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const m = await miembrosDe(p.id);
    if (m.ok) setMiembros(m.datos);
    if (esDueno) {
      const i = await invitacionesDe(p.id);
      if (i.ok) setInvitaciones(i.datos);
    }
  }, [p.id, esDueno]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // El botón queda activo aunque el correo esté a medias: pulsarlo es la
  // manera de preguntar qué falta, y la respuesta va junto al campo.
  const [invitando, setInvitando] = useState(false);
  const [correoMal, setCorreoMal] = useState(false);
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (invitando) return;
    const limpio = email.trim();
    if (!correoValido(limpio)) {
      setCorreoMal(true);
      document.getElementById("invitar-correo")?.focus();
      return;
    }
    setCorreoMal(false);
    setInvitando(true);
    const r = await invitar(p.id, limpio, rol);
    setInvitando(false);
    if (!r.ok) return setError(r.error);
    setEmail("");
    setError(null);
    void cargar();
  }

  /** Una acción del dueño sobre la lista: si falla, lo dice; si sale, recarga. */
  async function hacer(accion: Promise<Hecho<null>>) {
    const r = await accion;
    setError(r.ok ? null : r.error);
    if (r.ok) void cargar();
  }

  async function irme() {
    setYendose(true);
    const r = await quitarMiembro(p.id, u.id);
    if (!r.ok) {
      setYendose(false);
      return setError(r.error);
    }
    router.push("/espacio");
  }

  return (
    <Card as="section" className="p-5">
      <CardTitle className="text-base">Quién trabaja aquí</CardTitle>
      {miembros === null ? (
        <Skeleton className="mt-3 h-16 w-full" />
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {miembros.map((m) => (
            <li key={m.usuario} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-ink">
                {m.nombre}
                {m.usuario === u.id && <span className="text-ink-soft"> (tú)</span>}
              </span>
              {esDueno && m.rol !== "dueno" ? (
                <span className="flex shrink-0 items-center gap-2">
                  <Select value={m.rol} onValueChange={(v) => void hacer(cambiarRol(p.id, m.usuario, v as "editor" | "lector"))}>
                    <SelectTrigger className="w-24 text-xs" aria-label={`Rol de ${m.nombre}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">Edita</SelectItem>
                      <SelectItem value="lector">Lee</SelectItem>
                    </SelectContent>
                  </Select>
                  {aQuitar === m.usuario ? (
                    <>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="h-11 sm:h-9"
                        disabled={quitando}
                        onClick={async () => {
                          setQuitando(true);
                          await hacer(quitarMiembro(p.id, m.usuario));
                          setQuitando(false);
                          setAQuitar(null);
                        }}
                      >
                        {quitando ? "Quitando…" : `Sí, quitar a ${m.nombre}`}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-11 sm:h-9" disabled={quitando} onClick={() => setAQuitar(null)}>No</Button>
                    </>
                  ) : (
                    <Button type="button" variant="ghost" size="icon" aria-label={`Quitar a ${m.nombre}`} onClick={() => setAQuitar(m.usuario)}>
                      <IconTrash className="h-4 w-4" />
                    </Button>
                  )}
                </span>
              ) : (
                <Badge variant="neutro">{NOMBRE_ROL[m.rol]}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      {esDueno && (
        <form onSubmit={enviar} className="mt-4 space-y-2 border-t border-hairline pt-4">
          <Label htmlFor="invitar-correo" className="text-sm font-semibold">Invitar por correo</Label>
          <Input
            id="invitar-correo"
            name="invitado"
            type="email"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (correoMal) setCorreoMal(false);
            }}
            placeholder="nombre@correo.com"
            aria-invalid={correoMal || undefined}
            aria-describedby={correoMal ? "invitar-correo-error" : undefined}
          />
          <ErrorCampo id="invitar-correo-error">
            {correoMal ? "Escribe un correo completo, como nombre@correo.com." : ""}
          </ErrorCampo>
          <div className="flex gap-2">
            <Select value={rol} onValueChange={(v) => setRol(v as "editor" | "lector")}>
              <SelectTrigger className="flex-1" aria-label="Qué podrá hacer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor" ayuda="Agrega, anota y enlaza registros">Edita</SelectItem>
                <SelectItem value="lector" ayuda="Ve todo, no cambia nada">Lee</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" variant="secondary" disabled={invitando}>
              {invitando ? "Invitando…" : "Invitar"}
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-ink-soft">
            No enviamos correos: avísale tú. Cuando entre en esta plataforma con ese correo ya
            verificado, verá la invitación en su espacio y decidirá si la acepta.
          </p>
        </form>
      )}

      {esDueno && invitaciones.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-ink-soft">Invitaciones pendientes</p>
          <ul className="mt-1 space-y-1 text-sm">
            {invitaciones.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-mono text-xs">{i.email}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Retirar la invitación a ${i.email}`}
                  disabled={retirando !== null}
                  onClick={async () => {
                    if (retirando !== null) return;
                    setRetirando(i.id);
                    const r = await retirarInvitacion(i.id);
                    setRetirando(null);
                    setError(r.ok ? null : r.error);
                    if (!r.ok) return;
                    setDeshacible({
                      texto: `Retiraste la invitación a ${i.email}.`,
                      deshacer: async () => {
                        const v = await invitar(p.id, i.email, i.rol);
                        if (!v.ok) return v;
                        void cargar();
                        return { ok: true };
                      },
                    });
                    void cargar();
                  }}
                >
                  {retirando === i.id ? "Retirando…" : "Retirar"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {esDueno && <AvisoDeshacer aviso={deshacible} onCerrar={() => setDeshacible(null)} className="mt-3" />}

      {!esDueno &&
        (saliendo ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="destructive" size="sm" className="h-11 sm:h-9" disabled={yendose} onClick={irme}>
              {yendose ? "Saliendo…" : "Sí, salir de este proyecto"}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-11 sm:h-9" disabled={yendose} onClick={() => setSaliendo(false)}>No</Button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setSaliendo(true)}>
            Salir de este proyecto
          </Button>
        ))}
      {error && <p role="alert" className="mt-2 text-xs text-alerta-700">{error}</p>}
    </Card>
  );
}

/* --------------------------------------------------------------- llevar */

/** El caso fuera de aquí: FollowTheMoney, para Aleph y OpenSanctions. */
function Llevar({ titulo, entradas, enlaces }: { titulo: string; entradas: Entrada[]; enlaces: Enlace[] }) {
  return (
    <Card as="section" className="p-5">
      <CardTitle className="text-base">Llevártelo</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Un archivo JSON de formato abierto, para abrirlo en otras herramientas: cada registro
        con su enlace y tu nota, y cada enlace con su verbo. Ninguna cifra del Estado: esas se
        leen en cada ficha.
      </p>
      <div className="mt-3">
        <ExportarFtm titulo={titulo} entradas={entradas} enlaces={enlaces} />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------- publicar */

function Publicar({ p, onCambio }: { p: ProyectoConCuenta; onCambio: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const url = p.slug ? `/p/${p.slug}` : null;

  async function alternar() {
    setCargando(true);
    const r = await publicar(p, !p.publico);
    setCargando(false);
    if (!r.ok) return setError(r.error);
    onCambio();
  }

  return (
    <Card as="section" className="p-5">
      <CardTitle className="text-base">Publicar</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        {p.publico
          ? "Cualquiera con la dirección ve el título, la descripción, el texto, el tablero, las fechas, los registros con sus notas (también las de quienes colaboran) y los enlaces, bajo tu nombre de firma. No ve quién colabora, ni tu correo, ni los parentescos («es familiar de»)."
          : "Al publicar, cualquiera con la dirección verá el título, la descripción, el texto, el tablero, las fechas, los registros con sus notas (también las de quienes colaboran) y los enlaces, bajo tu nombre de firma; los parentescos («es familiar de») nunca se publican. Puedes retirarlo cuando quieras; la dirección se conserva."}
      </p>
      {p.publico && url && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link href={url} className="min-w-0 truncate font-mono text-xs text-brand-700 hover:underline">
            {url}
          </Link>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant={p.publico ? "outline" : "default"} disabled={cargando} onClick={alternar}>
          {p.publico ? "Retirar la publicación" : "Publicar"}
        </Button>
        {p.publico && url && <CopiarRuta ruta={url} />}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-alerta-700">{error}</p>}
    </Card>
  );
}

/** Copia la dirección pública entera (no la de esta página, que es privada). */
function CopiarRuta({ ruta }: { ruta: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(`${window.location.origin}${ruta}`);
            setCopiado(true);
            window.setTimeout(() => setCopiado(false), 2000);
          } catch {
            /* sin permiso de portapapeles: la dirección está a la vista */
          }
        }}
      >
        {copiado ? "Copiada" : "Copiar dirección"}
      </Button>
      <span role="status" className="sr-only">{copiado ? "Dirección copiada." : ""}</span>
    </>
  );
}

/* --------------------------------------------------------------- borrar */

function Borrar({ p }: { p: ProyectoConCuenta }) {
  const router = useRouter();
  const [seguro, setSeguro] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card as="section" className="p-5">
      <CardTitle className="text-base">Borrar el proyecto</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Se borran sus registros, notas y enlaces, para ti y para quien colabore. Los registros
        del Estado siguen en la plataforma.
      </p>
      {seguro ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="destructive"
            disabled={borrando}
            onClick={async () => {
              setBorrando(true);
              const r = await borrarProyecto(p.id);
              if (!r.ok) {
                setBorrando(false);
                return setError(r.error);
              }
              router.push("/espacio");
            }}
          >
            {borrando ? "Borrando…" : `Sí, borrar «${p.titulo}»`}
          </Button>
          <Button type="button" variant="outline" disabled={borrando} onClick={() => setSeguro(false)}>No</Button>
        </div>
      ) : (
        <Button type="button" variant="outline" className="mt-3" onClick={() => setSeguro(true)}>
          <IconTrash className="h-4 w-4" />
          Borrar
        </Button>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-alerta-700">{error}</p>}
    </Card>
  );
}
