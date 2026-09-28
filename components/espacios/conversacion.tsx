"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { leerHilo, type Comentario, type Hilo, type ReferenciaHilo } from "@/lib/espacios";
import type { EstadoConversacion, MotivoDenuncia } from "@/lib/espacios-cliente";
import Antiguedad from "@/components/antiguedad";
import { EstadoVacio } from "@/components/estado-vacio";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { IconChat, IconFlag, IconShield, IconTrash, IconVoto } from "@/components/icons";
import { cn } from "@/lib/cn";
import { NORMAS } from "./normas";
import { useHaySesion } from "./presencia";
import VotoHilo from "./voto-hilo";

type Carga =
  | { estado: "esperando" }
  | { estado: "ok"; hilo: Hilo; yo: EstadoConversacion | null }
  | { estado: "cerrado" }
  | { estado: "caida" };

type Orden = "mejores" | "recientes";

const HILO_VACIO: Hilo = { existe: false, estado: "visible", votos: 0, comentarios: 0, mi_voto: false, lista: [] };

/**
 * La conversación de un registro (docs/PLAN-ESPACIOS.md §6): «Importa», los
 * comentarios en árbol con sus votos, responder, denunciar y borrar lo
 * propio. Va al final de la ficha: primero se entiende el registro, después
 * se opina (docs/IDENTIDAD.md, ergonomía §4).
 *
 * No carga nada hasta que el lector se acerca: la mayoría de las visitas a una
 * ficha no baja hasta aquí. Sin sesión lee por HTTP con la clave publicable
 * (`leerHilo`), sin supabase-js; con sesión, por el cliente, que ya está
 * cargado para quien la tiene.
 *
 * Solo comentan personas con cédula registrada que firman con nombre y
 * aceptaron las normas; vota cualquier cuenta. Lo que falta se dice antes del
 * primer toque, con el paso que lo resuelve.
 */
export default function Conversacion({ referencia, className }: { referencia: ReferenciaHilo; className?: string }) {
  const hay = useHaySesion();
  const pathname = usePathname();
  const caja = useRef<HTMLElement>(null);
  const [cerca, setCerca] = useState(false);
  const [carga, setCarga] = useState<Carga>({ estado: "esperando" });
  const [orden, setOrden] = useState<Orden>("mejores");

  useEffect(() => {
    const el = caja.current;
    if (!el || cerca) return;
    // Quien llega con #conversacion en la dirección ya está aquí.
    if (window.location.hash === "#conversacion" || typeof IntersectionObserver === "undefined") {
      setCerca(true);
      return;
    }
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setCerca(true), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cerca]);

  const cargar = useCallback(async () => {
    if (hay) {
      const c = await import("@/lib/espacios-cliente");
      const [h, yo] = await Promise.all([c.hiloConSesion(referencia.tipo, referencia.ref), c.estadoConversacion()]);
      if (!h.ok) return setCarga({ estado: h.cerrado ? "cerrado" : "caida" });
      setCarga({ estado: "ok", hilo: h.datos ?? HILO_VACIO, yo: yo.ok ? yo.datos : null });
      return;
    }
    const r = await leerHilo(referencia.tipo, referencia.ref);
    if (r.estado !== "ok") return setCarga({ estado: r.estado });
    setCarga({ estado: "ok", hilo: r.datos ?? HILO_VACIO, yo: null });
  }, [hay, referencia.tipo, referencia.ref]);

  useEffect(() => {
    if (cerca && hay !== null) void cargar();
  }, [cerca, hay, cargar]);

  const volver = `${pathname}#conversacion`;

  return (
    <Card asChild className={cn("scroll-mt-24 p-5 sm:p-6", className)}>
    <section ref={caja} id="conversacion" aria-labelledby="conversacion-titulo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="conversacion-titulo" className="font-display text-2xl text-ink">
            ¿Qué opinan quienes lo siguen?
          </h2>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-ink-soft">
            Conversación pública. Comentan personas con cédula registrada, con su nombre de firma;
            vota cualquier cuenta.{" "}
            <Link href="/comunidad/normas" className="font-medium text-brand-700 hover:underline">
              Normas
            </Link>
          </p>
        </div>
        {carga.estado === "ok" && carga.hilo.estado === "visible" && (
          <VotoHilo referencia={referencia} votos={carga.hilo.votos} miVoto={carga.hilo.mi_voto} />
        )}
      </div>

      {carga.estado === "esperando" ? (
        <div aria-busy="true" className="mt-5 space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : carga.estado === "cerrado" ? (
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          La conversación todavía no está abierta en esta plataforma. El registro de arriba sigue
          completo, leído de su fuente.
        </p>
      ) : carga.estado === "caida" ? (
        <EstadoVacio
          variante="caida"
          className="mt-4"
          titulo="No pudimos traer la conversación"
          accion={<Button type="button" variant="secondary" onClick={() => void cargar()}>Volver a intentarlo</Button>}
        >
          El servidor de cuentas no respondió. El registro de arriba sigue completo, leído de su fuente.
        </EstadoVacio>
      ) : carga.hilo.estado !== "visible" ? (
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          {carga.hilo.estado === "oculto"
            ? "Esta conversación está oculta mientras se revisan denuncias sobre ella."
            : "Esta conversación se cerró por moderación."}
        </p>
      ) : (
        <Cuerpo
          referencia={referencia}
          hilo={carga.hilo}
          yo={carga.yo}
          hay={hay === true}
          volver={volver}
          orden={orden}
          setOrden={setOrden}
          recargar={cargar}
        />
      )}
    </section>
    </Card>
  );
}

function Cuerpo({
  referencia,
  hilo,
  yo,
  hay,
  volver,
  orden,
  setOrden,
  recargar,
}: {
  referencia: ReferenciaHilo;
  hilo: Hilo;
  yo: EstadoConversacion | null;
  hay: boolean;
  volver: string;
  orden: Orden;
  setOrden: (o: Orden) => void;
  recargar: () => Promise<void>;
}) {
  const [respondiendo, setRespondiendo] = useState<string | null>(null);
  const [denunciando, setDenunciando] = useState<{ tipo: "comentario"; id: string } | { tipo: "hilo" } | null>(null);
  const puede = !!yo && yo.cedula && !!yo.nombre && yo.normas && !yo.suspendido_hasta;

  const arbol = useMemo(() => construir(hilo.lista, orden), [hilo.lista, orden]);

  return (
    <div className="mt-5">
      <Participar referencia={referencia} yo={yo} hay={hay} volver={volver} onListo={recargar} />

      {arbol.raices.length === 0 ? (
        <p className="mt-5 border-t border-hairline pt-4 text-sm text-ink-soft">
          Nadie ha comentado todavía.{" "}
          {puede ? "Empieza tú: una pregunta concreta sobre el registro abre mejor que una opinión." : ""}
        </p>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink" aria-live="polite">
              <IconChat className="h-4 w-4 text-ink-soft" />
              <span className="font-mono tabular-nums">{hilo.comentarios}</span>
              {hilo.comentarios === 1 ? "comentario" : "comentarios"}
            </p>
            <ToggleGroup type="single" value={orden} onValueChange={(v) => v && setOrden(v as Orden)} aria-label="Ordenar comentarios">
              <ToggleGroupItem value="mejores">Mejores</ToggleGroupItem>
              <ToggleGroupItem value="recientes">Recientes</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <ol className="mt-3 space-y-1">
            {arbol.raices.map((c) => (
              <Nodo
                key={c.id}
                c={c}
                hijos={arbol.hijos}
                prof={0}
                referencia={referencia}
                hay={hay}
                puede={puede}
                respondiendo={respondiendo}
                setRespondiendo={setRespondiendo}
                onDenunciar={(id) => setDenunciando({ tipo: "comentario", id })}
                recargar={recargar}
              />
            ))}
          </ol>
        </>
      )}

      {hay && (
        <p className="mt-5 text-xs text-ink-soft">
          ¿El título o el tema de esta conversación engañan?{" "}
          <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => setDenunciando({ tipo: "hilo" })}>
            Denunciar la conversación
          </Button>
        </p>
      )}

      <Denunciar
        abierto={denunciando !== null}
        onCerrar={() => setDenunciando(null)}
        objetivo={
          denunciando?.tipo === "comentario"
            ? { tipo: "comentario", id: denunciando.id }
            : denunciando?.tipo === "hilo"
              ? { tipo: "hilo", hilo: referencia }
              : null
        }
        onHecho={recargar}
      />
    </div>
  );
}

/* ------------------------------------------------------------- el árbol */

interface Arbol {
  raices: Comentario[];
  hijos: Map<string, Comentario[]>;
}

/**
 * Los comentarios en árbol. «Mejores»: más puntos primero y, a igual, el más
 * antiguo; «Recientes»: lo último arriba, y las respuestas en el orden en que
 * se dijeron. Lo que no está visible solo se muestra si tiene respuestas
 * visibles, para que no floten sin contexto.
 */
function construir(lista: Comentario[], orden: Orden): Arbol {
  const hijos = new Map<string, Comentario[]>();
  const raices: Comentario[] = [];
  for (const c of lista) {
    if (c.padre) hijos.set(c.padre, [...(hijos.get(c.padre) ?? []), c]);
    else raices.push(c);
  }
  const vive = new Map<string, boolean>();
  const tieneVida = (c: Comentario): boolean => {
    const k = vive.get(c.id);
    if (k !== undefined) return k;
    const v = c.estado === "visible" || (hijos.get(c.id) ?? []).some(tieneVida);
    vive.set(c.id, v);
    return v;
  };
  const porPuntos = (a: Comentario, b: Comentario) => b.puntos - a.puntos || a.creado.localeCompare(b.creado);
  const porFecha = (a: Comentario, b: Comentario) => a.creado.localeCompare(b.creado);
  for (const [k, v] of hijos) hijos.set(k, v.filter(tieneVida).sort(orden === "mejores" ? porPuntos : porFecha));
  const top = raices.filter(tieneVida).sort(orden === "mejores" ? porPuntos : (a, b) => b.creado.localeCompare(a.creado));
  return { raices: top, hijos };
}

const PROFUNDIDAD_MAXIMA = 5;

function Nodo({
  c,
  hijos,
  prof,
  referencia,
  hay,
  puede,
  respondiendo,
  setRespondiendo,
  onDenunciar,
  recargar,
}: {
  c: Comentario;
  hijos: Map<string, Comentario[]>;
  prof: number;
  referencia: ReferenciaHilo;
  hay: boolean;
  puede: boolean;
  respondiendo: string | null;
  setRespondiendo: (id: string | null) => void;
  onDenunciar: (id: string) => void;
  recargar: () => Promise<void>;
}) {
  const [puntos, setPuntos] = useState(c.puntos);
  const [miVoto, setMiVoto] = useState(c.mi_voto);
  const [error, setError] = useState<string | null>(null);
  const [borrar, setBorrar] = useState(false);
  const respuestas = hijos.get(c.id) ?? [];

  useEffect(() => {
    setPuntos(c.puntos);
    setMiVoto(c.mi_voto);
  }, [c.puntos, c.mi_voto]);

  async function votar(v: -1 | 1) {
    if (!hay) return setError("Entra para votar.");
    const nuevo = miVoto === v ? 0 : v;
    const antes = { puntos, miVoto };
    setMiVoto(nuevo);
    setPuntos(puntos - miVoto + nuevo);
    const cl = await import("@/lib/espacios-cliente");
    const r = await cl.votarComentario(c.id, nuevo);
    if (!r.ok) {
      setPuntos(antes.puntos);
      setMiVoto(antes.miVoto);
      return setError(r.error);
    }
    setError(null);
    setPuntos(r.datos);
  }

  async function borrarlo() {
    const cl = await import("@/lib/espacios-cliente");
    const r = await cl.borrarComentario(c.id);
    if (!r.ok) return setError(r.error);
    await recargar();
  }

  return (
    <li className={cn(prof > 0 && prof <= PROFUNDIDAD_MAXIMA && "ml-3 border-l border-hairline pl-3 sm:ml-4 sm:pl-4")}>
      <article className="py-2.5" aria-label={c.estado === "visible" ? `Comentario de ${c.autor}` : "Comentario no disponible"}>
        {c.estado === "visible" ? (
          <>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-soft">
              <span className="font-semibold text-ink">{c.autor}</span>
              {c.mio && <span className="rotulo text-brand-700">tú</span>}
              <span aria-hidden>·</span>
              <Antiguedad iso={c.creado} />
            </p>
            <p className="mt-1 whitespace-pre-line break-words text-[15px] leading-relaxed text-ink">{c.cuerpo}</p>
            <div className="-ml-2 mt-1 flex flex-wrap items-center gap-x-1 gap-y-1">
              <span className="inline-flex items-center">
                <Button type="button" variant="ghost" size="icon" aria-pressed={miVoto === 1} aria-label="Votar a favor" onClick={() => void votar(1)} className={cn(miVoto === 1 && "text-brand-700")}>
                  <IconVoto className="h-4 w-4" />
                </Button>
                <span className="min-w-6 text-center font-mono text-xs tabular-nums text-ink" aria-label={`${puntos} puntos`}>
                  {puntos}
                </span>
                <Button type="button" variant="ghost" size="icon" aria-pressed={miVoto === -1} aria-label="Votar en contra" onClick={() => void votar(-1)} className={cn(miVoto === -1 && "text-sello-700")}>
                  <IconVoto className="h-4 w-4 rotate-180" />
                </Button>
              </span>
              {puede && (
                <Button type="button" variant="ghost" size="sm" className="h-11 sm:h-9" onClick={() => setRespondiendo(respondiendo === c.id ? null : c.id)}>
                  Responder
                </Button>
              )}
              {hay && !c.mio && (
                <Button type="button" variant="ghost" size="sm" className="h-11 text-ink-soft sm:h-9" onClick={() => onDenunciar(c.id)}>
                  <IconFlag className="h-3.5 w-3.5" />
                  Denunciar
                </Button>
              )}
              {c.mio &&
                (borrar ? (
                  <span className="inline-flex items-center gap-1">
                    <Button type="button" variant="destructive" size="sm" className="h-11 sm:h-9" onClick={() => void borrarlo()}>
                      Sí, borrarlo
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-11 sm:h-9" onClick={() => setBorrar(false)}>
                      No
                    </Button>
                  </span>
                ) : (
                  <Button type="button" variant="ghost" size="sm" className="h-11 text-ink-soft sm:h-9" onClick={() => setBorrar(true)}>
                    <IconTrash className="h-3.5 w-3.5" />
                    Borrar
                  </Button>
                ))}
            </div>
            {error && <p role="status" className="text-xs text-alerta-700">{error}</p>}
            {respondiendo === c.id && (
              <Redactar
                referencia={referencia}
                padre={c.id}
                etiqueta={`Responder a ${c.autor}`}
                onListo={async () => {
                  setRespondiendo(null);
                  await recargar();
                }}
                onCancelar={() => setRespondiendo(null)}
              />
            )}
          </>
        ) : (
          <p className="text-sm italic text-ink-soft">
            {c.estado === "oculto"
              ? "Comentario oculto mientras se revisan denuncias."
              : c.estado === "retirado"
                ? "Comentario retirado por moderación."
                : "Comentario borrado por su autor."}
          </p>
        )}
      </article>
      {respuestas.length > 0 && (
        <ol>
          {respuestas.map((h) => (
            <Nodo
              key={h.id}
              c={h}
              hijos={hijos}
              prof={prof + 1}
              referencia={referencia}
              hay={hay}
              puede={puede}
              respondiendo={respondiendo}
              setRespondiendo={setRespondiendo}
              onDenunciar={onDenunciar}
              recargar={recargar}
            />
          ))}
        </ol>
      )}
    </li>
  );
}

/* ------------------------------------------------------------ participar */

/**
 * Lo que el lector puede hacer ahora, o el único paso que le falta: entrar,
 * registrar la cédula, poner su nombre de firma, aceptar las normas. Una
 * cuenta suspendida lo lee dicho, con la fecha.
 */
function Participar({
  referencia,
  yo,
  hay,
  volver,
  onListo,
}: {
  referencia: ReferenciaHilo;
  yo: EstadoConversacion | null;
  hay: boolean;
  volver: string;
  onListo: () => Promise<void>;
}) {
  if (!hay || !yo) {
    return (
      <Paso
        texto="Entra para decir que esto importa y votar comentarios. Para comentar, además, registra tu cédula una vez."
        accion={
          <Button asChild variant="secondary">
            <Link href={`/cuenta?volver=${encodeURIComponent(volver)}`}>Entrar o crear cuenta</Link>
          </Button>
        }
      />
    );
  }
  if (yo.suspendido_hasta) {
    return (
      <Alert variant="aviso" className="px-4 py-3 text-sm">
        Tu cuenta no puede comentar ni votar hasta el{" "}
        {new Date(yo.suspendido_hasta).toLocaleDateString("es-DO", { timeZone: "America/Santo_Domingo" })}.
      </Alert>
    );
  }
  if (!yo.cedula) {
    return (
      <Paso
        icono
        texto="Para comentar hace falta registrar tu cédula una vez: la misma del piloto de voto. Se guarda cifrada y nadie la ve; en la conversación sale solo tu nombre de firma. Votar no la necesita."
        accion={
          <Button asChild variant="secondary">
            <Link href={`/democracia/registro?volver=${encodeURIComponent(volver)}`}>Registrar mi cédula</Link>
          </Button>
        }
      />
    );
  }
  if (!yo.nombre || !yo.normas) return <Primera nombre={yo.nombre} onListo={onListo} />;
  return <Redactar referencia={referencia} padre={null} etiqueta="Tu comentario" onListo={onListo} />;
}

function Paso({ texto, accion, icono = false }: { texto: string; accion: React.ReactNode; icono?: boolean }) {
  return (
    <Card className="flex flex-col gap-3 bg-canvas px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm leading-relaxed text-ink-soft">
        {icono && <IconShield className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />}
        {texto}
      </p>
      <div className="shrink-0">{accion}</div>
    </Card>
  );
}

/** El primer comentario: nombre de firma y normas, una sola vez. */
function Primera({ nombre: inicial, onListo }: { nombre: string | null; onListo: () => Promise<void> }) {
  const [nombre, setNombre] = useState(inicial ?? "");
  const [acepto, setAcepto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function seguir(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !acepto) return;
    setCargando(true);
    const c = await import("@/lib/espacios-cliente");
    const u = await c.sesionActual();
    if (!u) {
      setCargando(false);
      return setError("Tu sesión venció. Vuelve a entrar.");
    }
    if (nombre.trim() !== inicial) {
      const r = await c.guardarNombre(u, nombre);
      if (!r.ok) {
        setCargando(false);
        return setError(r.error);
      }
    }
    const n = await c.aceptarNormas();
    setCargando(false);
    if (!n.ok) return setError(n.error);
    await onListo();
  }

  return (
    <Card asChild className="space-y-3 bg-canvas p-4">
      <form onSubmit={seguir}>
        <CardTitle className="text-base">Antes de tu primer comentario</CardTitle>
        <div className="space-y-1.5">
          <Label htmlFor="firma-conversacion">El nombre con que firmas</Label>
          <Input id="firma-conversacion" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre o el de tu medio" autoComplete="name" />
          <p className="text-xs text-ink-soft">Sale junto a cada comentario tuyo. Nadie ve tu correo ni tu cédula.</p>
        </div>
        <ol className="space-y-2 border-t border-hairline pt-3">
          {NORMAS.map((n, i) => (
            <li key={n.titulo} className="text-sm leading-relaxed">
              <span className="font-mono text-xs tabular-nums text-ink-soft">{i + 1}. </span>
              <span className="font-semibold text-ink">{n.titulo}.</span> <span className="text-ink-soft">{n.texto}</span>
            </li>
          ))}
        </ol>
        <Label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-normal text-ink">
          <Checkbox checked={acepto} onCheckedChange={(v) => setAcepto(v === true)} />
          Acepto las normas de la conversación
        </Label>
        {error && <p role="status" className="text-xs text-alerta-700">{error}</p>}
        {(!nombre.trim() || !acepto) && (
          <p className="text-xs text-ink-soft">{!nombre.trim() ? "Escribe tu nombre de firma" : "Marca que aceptas las normas"} para seguir.</p>
        )}
        <Button type="submit" disabled={!nombre.trim() || !acepto || cargando}>
          {cargando ? "Guardando…" : "Seguir"}
        </Button>
      </form>
    </Card>
  );
}

function Redactar({
  referencia,
  padre,
  etiqueta,
  onListo,
  onCancelar,
}: {
  referencia: ReferenciaHilo;
  padre: string | null;
  etiqueta: string;
  onListo: () => Promise<void>;
  onCancelar?: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const id = `redactar-${padre ?? "hilo"}`;
  const largo = texto.trim().length;

  async function publicar(e: React.FormEvent) {
    e.preventDefault();
    if (largo < 2) return;
    setCargando(true);
    const c = await import("@/lib/espacios-cliente");
    const r = await c.comentar(referencia, texto, padre);
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setTexto("");
    setError(null);
    await onListo();
  }

  return (
    <form onSubmit={publicar} className={cn("space-y-2", padre && "mt-2")}>
      <Label htmlFor={id} className={padre ? "sr-only" : "text-sm font-semibold"}>
        {etiqueta}
      </Label>
      <Textarea
        id={id}
        rows={padre ? 3 : 4}
        maxLength={4000}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={padre ? "Tu respuesta" : "Una pregunta concreta, un dato que falta, de dónde sale lo que dices."}
        className="text-base sm:text-[15px]"
      />
      {error && <p role="status" className="text-xs text-alerta-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={largo < 2 || cargando}>
          {cargando ? "Publicando…" : "Publicar"}
        </Button>
        {onCancelar && (
          <Button type="button" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
        <span className="ml-auto font-mono text-xs tabular-nums text-ink-soft">{texto.length}/4000</span>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------ denunciar */

function Denunciar({
  abierto,
  onCerrar,
  objetivo,
  onHecho,
}: {
  abierto: boolean;
  onCerrar: () => void;
  objetivo: { tipo: "comentario"; id: string } | { tipo: "hilo"; hilo: ReferenciaHilo } | null;
  onHecho: () => Promise<void>;
}) {
  const [motivo, setMotivo] = useState<MotivoDenuncia | "">("");
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);
  const [motivos, setMotivos] = useState<Record<string, { nombre: string; ayuda: string }> | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setMotivo("");
    setDetalle("");
    setError(null);
    setHecho(false);
    void import("@/lib/espacios-cliente").then((c) => setMotivos(c.MOTIVOS_DENUNCIA));
  }, [abierto]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!objetivo || !motivo) return;
    const c = await import("@/lib/espacios-cliente");
    const r = await c.denunciar(objetivo, motivo, detalle);
    if (!r.ok) return setError(r.error);
    setHecho(true);
    await onHecho();
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{objetivo?.tipo === "hilo" ? "Denunciar la conversación" : "Denunciar el comentario"}</DialogTitle>
          <DialogDescription>
            Lo revisa una persona. Con tres denuncias de cuentas distintas se oculta mientras tanto.
          </DialogDescription>
        </DialogHeader>
        {hecho ? (
          <div className="space-y-3">
            <p className="text-sm text-ink">Recibido. Gracias por cuidar la conversación.</p>
            <Button type="button" onClick={onCerrar}>Cerrar</Button>
          </div>
        ) : (
          <form onSubmit={enviar} className="space-y-3">
            <Select value={motivo} onValueChange={(v) => setMotivo(v as MotivoDenuncia)}>
              <SelectTrigger aria-label="Motivo">
                <SelectValue placeholder="¿Qué pasa?" />
              </SelectTrigger>
              <SelectContent>
                {motivos &&
                  Object.entries(motivos).map(([k, m]) => (
                    <SelectItem key={k} value={k} ayuda={m.ayuda}>
                      {m.nombre}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Label htmlFor="detalle-denuncia" className="sr-only">Detalle</Label>
            <Textarea id="detalle-denuncia" rows={3} maxLength={500} value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Detalle (opcional)" className="text-base sm:text-sm" />
            {error && <p role="status" className="text-xs text-alerta-700">{error}</p>}
            {!motivo && <p className="text-xs text-ink-soft">Elige un motivo para enviar.</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={!motivo}>Enviar denuncia</Button>
              <Button type="button" variant="ghost" onClick={onCerrar}>Cancelar</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
