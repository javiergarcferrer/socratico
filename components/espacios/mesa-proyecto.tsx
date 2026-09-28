"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { buscarEnPlataforma, claves } from "@/lib/consultas";
import {
  anotar,
  borrarProyecto,
  cambiarRol,
  editarProyecto,
  enlacesDe,
  enlazar,
  entradasDe,
  guardar,
  invitacionesDe,
  invitar,
  miembrosDe,
  publicar,
  quitarEnlace,
  quitarEntrada,
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
import Antiguedad from "@/components/antiguedad";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EstadoVacio } from "@/components/estado-vacio";
import { Rotulo } from "@/components/papel";
import { IconLink, IconPencil, IconPlus, IconSearch, IconTrash } from "@/components/icons";
import { Cerrado, EnlaceRegistro, MarcaTipo, SinSesion, useUsuario } from "./comun";

/**
 * La mesa de una investigación: sus registros con notas, lo que los une,
 * quién trabaja en ella y si se publica (docs/PLAN-ESPACIOS.md §3).
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
      <EstadoVacio como="h1" titulo="Falta decir qué investigación abrir">
        <Link href="/espacio" className="font-medium text-brand-700 hover:underline">Volver a tu espacio</Link>
      </EstadoVacio>
    );
  }
  if (sesion.estado === "cargando") return <Skeleton className="h-[520px] w-full" />;
  if (sesion.estado === "fuera") return <SinSesion volver={`/espacio/proyecto?id=${id}`} que="Entra para abrir esta investigación" />;
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

  if (cerrado) return <Cerrado />;
  if (p === undefined && !error) return <Skeleton className="h-[520px] w-full" />;
  if (!p) {
    return (
      <EstadoVacio
        como="h1"
        variante={error ? "caida" : "vacio"}
        titulo={error ? "No pudimos abrir esta investigación" : "Esta investigación no existe o no es tuya"}
        accion={<Button asChild variant="secondary"><Link href="/espacio">Volver a tu espacio</Link></Button>}
      >
        {error ?? "Puede que la hayan borrado o que te hayan quitado de ella. Si te invitaron, entra con el correo al que llegó la invitación."}
      </EstadoVacio>
    );
  }

  const edita = p.rol === "dueno" || p.rol === "editor";
  return (
    <div className="space-y-5">
      <Cabecera p={p} edita={edita} onCambio={cargar} />
      {error && <Alert variant="aviso" className="px-4 py-3 text-sm">{error}</Alert>}
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          {edita && <Agregar proyecto={p.id} existentes={entradas} onAgregado={cargar} />}
          <Registros entradas={entradas} enlaces={enlaces} edita={edita} proyecto={p.id} onCambio={cargar} />
          <Enlaces entradas={entradas} enlaces={enlaces} edita={edita} onCambio={cargar} />
        </div>
        <aside className="space-y-5">
          <Colaboran p={p} u={u} />
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

  async function guardarCambios(e: React.FormEvent) {
    e.preventDefault();
    const r = await editarProyecto(p.id, { titulo: titulo.trim(), descripcion: descripcion.trim() });
    if (!r.ok) return setError(r.error);
    setEditando(false);
    onCambio();
  }

  const rol = { dueno: "Tuya", editor: "Editas", lector: "Solo lees" }[p.rol];
  return (
    <header>
      <Rotulo>
        <Link href="/espacio" className="hover:underline">Tu espacio</Link> · Investigación · {rol}
        {p.publico && " · Publicada"}
      </Rotulo>
      {editando ? (
        <form onSubmit={guardarCambios} className="mt-2 space-y-2.5">
          <Label htmlFor="titulo-proyecto" className="sr-only">Título</Label>
          <Input id="titulo-proyecto" value={titulo} maxLength={140} onChange={(e) => setTitulo(e.target.value)} />
          <Label htmlFor="descripcion-proyecto" className="sr-only">De qué trata</Label>
          <Textarea
            id="descripcion-proyecto"
            rows={4}
            value={descripcion}
            maxLength={5000}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Qué investigas, qué preguntas quieres responder, qué ya sabes."
          />
          {error && <p className="text-xs text-alerta-700">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={!titulo.trim()}>Guardar</Button>
            <Button type="button" variant="outline" onClick={() => setEditando(false)}>Cancelar</Button>
          </div>
        </form>
      ) : (
        <>
          <h1 className="font-display mt-1 text-3xl text-ink sm:text-4xl">{p.titulo}</h1>
          {p.descripcion ? (
            <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink-soft">{p.descripcion}</p>
          ) : (
            edita && <p className="mt-2 text-sm text-ink-soft">Sin descripción: di qué investigas y qué quieres responder.</p>
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
    queryFn: ({ signal }) =>
      buscarEnPlataforma<{ tipo: string; titulo: string; detalle: string | null; href: string | null }>(enviada, 8, signal),
    enabled: enviada.length >= 2,
  });
  const hallados: Hallado[] | null = busqueda.data
    ? (busqueda.data.resultados ?? []).flatMap((x) => {
        const tipo = tipoDeResultado(x.tipo);
        return tipo && x.href && hrefValido(x.href) ? [{ tipo, ref: x.href, titulo: x.titulo, href: x.href, detalle: x.detalle }] : [];
      })
    : null;
  const buscando = busqueda.isFetching;
  const errorBusqueda = busqueda.isError ? "El buscador no respondió. Vuelve a intentarlo." : null;

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const t = q.trim();
    if (t.length < 2) return;
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
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Una institución, un proveedor, una ley, una compra…"
        />
        <Button type="submit" variant="secondary" disabled={q.trim().length < 2 || buscando} className="shrink-0">
          <IconSearch className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only">Buscar</span>
        </Button>
      </form>
      <p className="mt-1.5 text-xs text-ink-soft">
        El mismo índice de «Buscar en todo». También puedes guardar desde la ficha de cada registro.
      </p>
      {(error ?? errorBusqueda) && <p className="mt-2 text-xs text-alerta-700">{error ?? errorBusqueda}</p>}
      {hallados && (
        <ul aria-live="polite" className="mt-3 divide-y divide-hairline">
          {hallados.length === 0 && <li className="py-2 text-sm text-ink-soft">Nada con «{enviada}» que se pueda guardar.</li>}
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
                  aria-label={dentro ? `«${h.titulo}» ya está en la investigación` : `Agregar «${h.titulo}»`}
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

/* ------------------------------------------------------------ registros */

function Registros({
  entradas,
  enlaces,
  edita,
  proyecto,
  onCambio,
}: {
  entradas: Entrada[];
  enlaces: Enlace[];
  edita: boolean;
  proyecto: string;
  onCambio: () => void;
}) {
  return (
    <Card as="section" className="p-5">
      <CardTitle>
        Registros <span className="font-mono text-sm font-normal tabular-nums text-ink-soft">{entradas.length}</span>
      </CardTitle>
      {entradas.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">
          {edita
            ? "Todavía ninguno. Búscalos arriba o usa «Guardar» en la ficha de cada uno."
            : "Todavía no tiene registros."}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-hairline">
          {entradas.map((e) => (
            <Registro
              key={e.id}
              e={e}
              otras={entradas.filter((x) => x.id !== e.id)}
              enlazados={enlaces.filter((l) => l.desde === e.id || l.hasta === e.id).length}
              edita={edita}
              proyecto={proyecto}
              onCambio={onCambio}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function Registro({
  e,
  otras,
  enlazados,
  edita,
  proyecto,
  onCambio,
}: {
  e: Entrada;
  otras: Entrada[];
  enlazados: number;
  edita: boolean;
  proyecto: string;
  onCambio: () => void;
}) {
  const [abierto, setAbierto] = useState<"nota" | "enlace" | null>(null);
  const [nota, setNota] = useState(e.nota);
  const [hasta, setHasta] = useState("");
  const [por, setPor] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function guardarNota(ev: React.FormEvent) {
    ev.preventDefault();
    const r = await anotar(e.id, nota.trim());
    if (!r.ok) return setError(r.error);
    setAbierto(null);
    onCambio();
  }

  async function unir(ev: React.FormEvent) {
    ev.preventDefault();
    if (!hasta) return;
    const r = await enlazar(proyecto, e.id, hasta, por);
    if (!r.ok) return setError(r.error);
    setAbierto(null);
    setHasta("");
    setPor("");
    onCambio();
  }

  async function quitar() {
    const r = await quitarEntrada(e.id);
    if (!r.ok) return setError(r.error);
    onCambio();
  }

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <EnlaceRegistro titulo={e.titulo} href={e.href} />
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
            <MarcaTipo tipo={e.tipo} />
            <Antiguedad iso={e.creado} prefijo="agregado" />
            {enlazados > 0 && (
              <span className="inline-flex items-center gap-1">
                <IconLink className="h-3.5 w-3.5" />
                {enlazados} {enlazados === 1 ? "enlace" : "enlaces"}
              </span>
            )}
          </p>
        </div>
        {edita && (
          <Button type="button" variant="ghost" size="icon" onClick={quitar} aria-label={`Quitar «${e.titulo}» de la investigación`}>
            <IconTrash className="h-4 w-4" />
          </Button>
        )}
      </div>

      {e.nota && abierto !== "nota" && (
        <p className="mt-2 whitespace-pre-line border-l-2 border-hairline pl-3 text-sm leading-relaxed text-ink">{e.nota}</p>
      )}

      {edita && abierto === null && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setAbierto("nota")}>
            <IconPencil className="h-3.5 w-3.5" />
            {e.nota ? "Editar nota" : "Anotar"}
          </Button>
          {otras.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setAbierto("enlace")}>
              <IconLink className="h-3.5 w-3.5" />
              Enlazar con otro registro
            </Button>
          )}
        </div>
      )}

      {abierto === "nota" && (
        <form onSubmit={guardarNota} className="mt-2 space-y-2">
          <Label htmlFor={`nota-${e.id}`} className="sr-only">Nota sobre «{e.titulo}»</Label>
          <Textarea
            id={`nota-${e.id}`}
            rows={3}
            maxLength={5000}
            value={nota}
            onChange={(ev) => setNota(ev.target.value)}
            placeholder="Qué encontraste aquí, qué falta verificar, de dónde sale."
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm">Guardar nota</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setAbierto(null); setNota(e.nota); }}>Cancelar</Button>
          </div>
        </form>
      )}

      {abierto === "enlace" && (
        <Card asChild className="mt-2 space-y-2 bg-canvas p-3">
        <form onSubmit={unir}>
          <p className="text-xs text-ink-soft">
            Une «{e.titulo}» con otro registro y di qué los une: «la adjudicó», «la firmó», «es su dueño».
          </p>
          <Select value={hasta} onValueChange={setHasta}>
            <SelectTrigger aria-label="El otro registro">
              <SelectValue placeholder="¿Con cuál?" />
            </SelectTrigger>
            <SelectContent>
              {otras.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.titulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label htmlFor={`por-${e.id}`} className="sr-only">Qué los une</Label>
          <Input id={`por-${e.id}`} value={por} maxLength={1000} onChange={(ev) => setPor(ev.target.value)} placeholder="Qué los une" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!hasta}>Enlazar</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setAbierto(null)}>Cancelar</Button>
          </div>
        </form>
        </Card>
      )}
      {error && <p className="mt-2 text-xs text-alerta-700">{error}</p>}
    </li>
  );
}

/* -------------------------------------------------------------- enlaces */

function Enlaces({
  entradas,
  enlaces,
  edita,
  onCambio,
}: {
  entradas: Entrada[];
  enlaces: Enlace[];
  edita: boolean;
  onCambio: () => void;
}) {
  const por = useMemo(() => new Map(entradas.map((e) => [e.id, e])), [entradas]);
  const [error, setError] = useState<string | null>(null);
  if (enlaces.length === 0) return null;
  return (
    <Card as="section" className="p-5">
      <CardTitle>
        Lo que los une <span className="font-mono text-sm font-normal tabular-nums text-ink-soft">{enlaces.length}</span>
      </CardTitle>
      <ul className="mt-2 divide-y divide-hairline">
        {enlaces.map((l) => {
          const a = por.get(l.desde);
          const b = por.get(l.hasta);
          if (!a || !b) return null;
          return (
            <li key={l.id} className="flex items-start gap-3 py-3 text-sm">
              <p className="min-w-0 flex-1 leading-relaxed">
                <EnlaceRegistro titulo={a.titulo} href={a.href} />
                <span className="mx-1.5 text-ink-soft">—{l.nota ? ` ${l.nota} ` : " "}→</span>
                <EnlaceRegistro titulo={b.titulo} href={b.href} />
              </p>
              {edita && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    const r = await quitarEnlace(l.id);
                    setError(r.ok ? null : r.error);
                    if (r.ok) onCambio();
                  }}
                  aria-label="Quitar este enlace"
                >
                  <IconTrash className="h-4 w-4" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-xs text-alerta-700">{error}</p>}
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

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!correoValido(email)) return;
    const r = await invitar(p.id, email, rol);
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
    const r = await quitarMiembro(p.id, u.id);
    if (!r.ok) return setError(r.error);
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
                  <Button type="button" variant="ghost" size="icon" aria-label={`Quitar a ${m.nombre}`} onClick={() => void hacer(quitarMiembro(p.id, m.usuario))}>
                    <IconTrash className="h-4 w-4" />
                  </Button>
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
            type="email"
            autoCapitalize="off"
            autoCorrect="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colega@medio.com"
          />
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
            <Button type="submit" variant="secondary" disabled={!correoValido(email)}>Invitar</Button>
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
                <Button type="button" variant="ghost" size="sm" onClick={() => void hacer(retirarInvitacion(i.id))}>
                  Retirar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!esDueno && (
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={irme}>
          Salir de esta investigación
        </Button>
      )}
      {error && <p className="mt-2 text-xs text-alerta-700">{error}</p>}
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
          ? "Cualquiera con la dirección ve el título, la descripción, los registros, las notas —también las de quienes colaboran— y los enlaces, bajo tu nombre de firma. No ve quién colabora ni tu correo."
          : "Al publicar, cualquiera con la dirección verá el título, la descripción, los registros con las notas —también las de quienes colaboran— y los enlaces, bajo tu nombre de firma. Puedes retirarla cuando quieras; la dirección se conserva."}
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
      {error && <p className="mt-2 text-xs text-alerta-700">{error}</p>}
    </Card>
  );
}

/** Copia la dirección pública entera (no la de esta página, que es privada). */
function CopiarRuta({ ruta }: { ruta: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
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
  );
}

/* --------------------------------------------------------------- borrar */

function Borrar({ p }: { p: ProyectoConCuenta }) {
  const router = useRouter();
  const [seguro, setSeguro] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card as="section" className="p-5">
      <CardTitle className="text-base">Borrar la investigación</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Se borran sus registros, notas y enlaces, para ti y para quien colabore. Los registros
        del Estado siguen en la plataforma.
      </p>
      {seguro ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="destructive"
            onClick={async () => {
              const r = await borrarProyecto(p.id);
              if (!r.ok) return setError(r.error);
              router.push("/espacio");
            }}
          >
            Sí, borrar «{p.titulo}»
          </Button>
          <Button type="button" variant="outline" onClick={() => setSeguro(false)}>No</Button>
        </div>
      ) : (
        <Button type="button" variant="outline" className="mt-3" onClick={() => setSeguro(true)}>
          <IconTrash className="h-4 w-4" />
          Borrar
        </Button>
      )}
      {error && <p className="mt-2 text-xs text-alerta-700">{error}</p>}
    </Card>
  );
}
