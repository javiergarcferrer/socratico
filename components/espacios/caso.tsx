"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useMemo, useState } from "react";
import {
  anotar,
  editarEnlace,
  enlazar,
  fechar,
  mover,
  narrativaDe,
  quitarEnlace,
  quitarEntrada,
  type Enlace,
  type Entrada,
} from "@/lib/espacios-cliente";
import { ENLACES_PRIVADOS, FECHA_CASO, TIPOS_ENLACE, VERBO_ENLACE, esTipoEnlace, type NodoNarrativa, type TipoEnlace } from "@/lib/espacios";
import { formatFecha } from "@/lib/format";
import Antiguedad from "@/components/antiguedad";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorCampo } from "@/components/ui/error-campo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { IconTrash, IconX } from "@/components/icons";
import { enviarConModificador } from "@/components/teclas";
import Evidencia from "./evidencia";
import LineaDeTiempo, { type HitoTiempo } from "./linea-tiempo";
import NarrativaLectura, { narrativaConTexto } from "./narrativa-lectura";
import { EnlaceRegistro, MarcaTipo } from "./registro";
import TableroDiferido, { type Seleccion } from "./tablero-diferido";
import { AvisoDeshacer, type Deshacible } from "./deshacer";

/**
 * El caso: la misma investigación vista de cuatro maneras (docs/PLAN-ESPACIOS.md §7).
 *
 *  · Tablero: dónde está cada registro y qué los une, con el verbo en la flecha.
 *  · Línea de tiempo: los registros a los que se les anotó una fecha, en orden.
 *  · Evidencia: el cuadro, que se ordena y se filtra.
 *  · Narración: lo que el investigador escribe, citando registros con «@».
 *
 * Elegir un registro o un enlace —en el tablero o en el cuadro— abre su panel
 * debajo: ahí se anota, se fecha, se enlaza y se quita. Todo lo que el tablero
 * hace con el ratón se puede hacer desde ese panel con el teclado.
 */

const NarracionDiferida = dynamic(() => import("./narracion"), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full" />,
});

export default function Caso({
  proyecto,
  entradas,
  enlaces,
  edita,
  onCambio,
  onMovida,
}: {
  proyecto: string;
  entradas: Entrada[];
  enlaces: Enlace[];
  edita: boolean;
  /** Algo cambió en la base: volver a leer. */
  onCambio: () => void;
  /** Una tarjeta cambió de sitio: basta con actualizarla en memoria. */
  onMovida: (id: string, x: number, y: number) => void;
}) {
  const [vista, setVista] = useState("tablero");
  const [sel, setSel] = useState<Seleccion>(null);
  const [conectar, setConectar] = useState<{ desde: string; hasta: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deshacible, setDeshacible] = useState<Deshacible | null>(null);

  const porId = useMemo(() => new Map(entradas.map((e) => [e.id, e])), [entradas]);
  const cuantos = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of enlaces) {
      m.set(l.desde, (m.get(l.desde) ?? 0) + 1);
      m.set(l.hasta, (m.get(l.hasta) ?? 0) + 1);
    }
    return m;
  }, [enlaces]);
  const fechados = entradas.filter((e) => e.fecha).length;

  // Si lo elegido desaparece (se quitó, otra persona lo borró), se cierra su panel.
  useEffect(() => {
    if (sel?.que === "tarjeta" && !porId.has(sel.id)) setSel(null);
    if (sel?.que === "lazo" && !enlaces.some((l) => l.id === sel.id)) setSel(null);
  }, [sel, porId, enlaces]);

  async function alMover(id: string, x: number, y: number): Promise<boolean> {
    const r = await mover(id, x, y);
    setError(r.ok ? null : r.error);
    if (r.ok) onMovida(id, x, y);
    return r.ok;
  }

  const panel =
    sel?.que === "tarjeta" && porId.get(sel.id) ? (
      <PanelRegistro
        key={sel.id}
        e={porId.get(sel.id)!}
        entradas={entradas}
        enlaces={enlaces}
        edita={edita}
        proyecto={proyecto}
        onCambio={onCambio}
        onElegirEnlace={(id) => setSel({ que: "lazo", id })}
        onCerrar={() => setSel(null)}
      />
    ) : sel?.que === "lazo" ? (
      <PanelEnlace
        key={sel.id}
        l={enlaces.find((l) => l.id === sel.id)}
        porId={porId}
        edita={edita}
        onCambio={onCambio}
        onQuitado={(l) => {
          const a = porId.get(l.desde);
          const b = porId.get(l.hasta);
          setDeshacible({
            texto: a && b ? `Quitaste el enlace «${a.titulo}» ${VERBO_ENLACE[l.tipo]} «${b.titulo}».` : "Quitaste el enlace.",
            deshacer: async () => {
              const r = await enlazar(proyecto, l.desde, l.hasta, l.nota, l.tipo);
              if (!r.ok) return r;
              onCambio();
              return { ok: true };
            },
          });
        }}
        onCerrar={() => setSel(null)}
      />
    ) : null;

  const vacio = (
    <p className="py-6 text-sm text-ink-soft">
      {edita ? "Todavía no hay registros. Búscalos arriba o usa «Guardar» en la ficha de cada uno." : "Todavía no tiene registros."}
    </p>
  );

  return (
    <Card as="section" className="p-5">
      <CardTitle>El proyecto</CardTitle>
      <Tabs value={vista} onValueChange={setVista} className="mt-2">
        <TabsList>
          <TabsTrigger value="tablero">Tablero</TabsTrigger>
          <TabsTrigger value="tiempo">
            Línea de tiempo <span className="font-mono text-xs tabular-nums text-ink-soft">{fechados}</span>
          </TabsTrigger>
          <TabsTrigger value="evidencia">
            Registros <span className="font-mono text-xs tabular-nums text-ink-soft">{entradas.length}</span>
          </TabsTrigger>
          <TabsTrigger value="narracion">Texto</TabsTrigger>
        </TabsList>

        <TabsContent value="tablero" className="space-y-3">
          {entradas.length === 0 ? (
            vacio
          ) : (
            <>
              <p className="text-xs leading-relaxed text-ink-soft">
                {edita
                  ? "Arrastra las tarjetas a donde te sirvan; para unir dos, tira una flecha del punto derecho de una al izquierdo de otra, o abre una y usa «Enlazar con otro registro». Toca una tarjeta o una flecha para abrirla abajo."
                  : "Toca una tarjeta o una flecha para ver su nota abajo."}
              </p>
              <TableroDiferido
                tarjetas={entradas}
                lazos={enlaces}
                edita={edita}
                seleccion={sel}
                onSeleccion={setSel}
                onMover={alMover}
                onConectar={(desde, hasta) => setConectar({ desde, hasta })}
              />
              {error && <p role="alert" className="text-xs text-alerta-700">{error}</p>}
              {panel}
            </>
          )}
        </TabsContent>

        <TabsContent value="tiempo" className="space-y-5">
          {entradas.length === 0 ? vacio : <Tiempo entradas={entradas} edita={edita} onCambio={onCambio} />}
        </TabsContent>

        <TabsContent value="evidencia" className="space-y-4">
          {entradas.length === 0 ? (
            vacio
          ) : (
            <>
              <Evidencia
                filas={entradas.map((e) => ({ ...e, enlaces: cuantos.get(e.id) ?? 0 }))}
                elegida={sel?.que === "tarjeta" ? sel.id : null}
                onElegir={(id) => setSel({ que: "tarjeta", id })}
              />
              {panel}
            </>
          )}
        </TabsContent>

        <TabsContent value="narracion">
          {edita ? (
            <NarracionDiferida proyecto={proyecto} registros={entradas} />
          ) : (
            <NarracionLeida proyecto={proyecto} registros={entradas} />
          )}
        </TabsContent>
      </Tabs>

      <AvisoDeshacer aviso={deshacible} onCerrar={() => setDeshacible(null)} className="mt-3" />

      {conectar && porId.get(conectar.desde) && porId.get(conectar.hasta) && (
        <DialogoConectar
          proyecto={proyecto}
          desde={porId.get(conectar.desde)!}
          hasta={porId.get(conectar.hasta)!}
          onCerrar={() => setConectar(null)}
          onHecho={(id) => {
            setConectar(null);
            onCambio();
            if (id) setSel({ que: "lazo", id });
          }}
        />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------ verbos */

function SelectVerbo({ value, onChange, etiqueta }: { value: TipoEnlace; onChange: (t: TipoEnlace) => void; etiqueta: string }) {
  return (
    <Select value={value} onValueChange={(v) => esTipoEnlace(v) && onChange(v)}>
      <SelectTrigger aria-label={etiqueta}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TIPOS_ENLACE.map((t) => (
          <SelectItem key={t} value={t} ayuda={ENLACES_PRIVADOS.includes(t) ? "Queda en el proyecto: no se publica" : undefined}>
            {VERBO_ENLACE[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Soltar una flecha en el tablero pregunta qué los une antes de guardarla. */
function DialogoConectar({
  proyecto,
  desde: a,
  hasta: b,
  onCerrar,
  onHecho,
}: {
  proyecto: string;
  desde: Entrada;
  hasta: Entrada;
  onCerrar: () => void;
  onHecho: (id: string | null) => void;
}) {
  const [tipo, setTipo] = useState<TipoEnlace>("relaciona");
  const [nota, setNota] = useState("");
  const [alReves, setAlReves] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState(false);
  const idNota = useId();
  const [x, y] = alReves ? [b, a] : [a, b];

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    setEnCurso(true);
    const r = await enlazar(proyecto, x.id, y.id, nota, tipo);
    setEnCurso(false);
    if (!r.ok) return setError(r.error);
    onHecho(r.datos.id);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent>
        <form onSubmit={guardar} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>¿Qué los une?</DialogTitle>
            <DialogDescription className="sr-only">Elige el verbo que se lee de un registro al otro.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
            <p className="text-sm leading-relaxed">
              <span className="font-semibold">{x.titulo}</span>
              <span className="mx-1.5 text-brand-700">{VERBO_ENLACE[tipo]} <span aria-hidden="true">→</span></span>
              <span className="font-semibold">{y.titulo}</span>
            </p>
            <SelectVerbo value={tipo} onChange={setTipo} etiqueta="Qué hace uno con el otro" />
            <div className="flex items-center gap-2">
              <Checkbox id={`${idNota}-reves`} checked={alReves} onCheckedChange={(v) => setAlReves(v === true)} />
              <Label htmlFor={`${idNota}-reves`} className="text-sm font-normal">Al revés: se lee del segundo al primero</Label>
            </div>
            <Label htmlFor={idNota} className="sr-only">Nota del enlace</Label>
            <Input
              id={idNota}
              value={nota}
              maxLength={1000}
              onChange={(e) => setNota(e.target.value)}
              placeholder="De dónde lo sabes (opcional): «acta del 12 de marzo», «registro mercantil»"
            />
            {error && <p role="alert" className="text-xs text-alerta-700">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
            <Button type="submit" disabled={enCurso}>Enlazar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------------------------- paneles */

function Cabeza({ children, onCerrar }: { children: React.ReactNode; onCerrar: () => void }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">{children}</div>
      <Button type="button" variant="ghost" size="icon" onClick={onCerrar} aria-label="Cerrar este panel">
        <IconX className="h-4 w-4" />
      </Button>
    </div>
  );
}

function PanelRegistro({
  e,
  entradas,
  enlaces,
  edita,
  proyecto,
  onCambio,
  onElegirEnlace,
  onCerrar,
}: {
  e: Entrada;
  entradas: Entrada[];
  enlaces: Enlace[];
  edita: boolean;
  proyecto: string;
  onCambio: () => void;
  onElegirEnlace: (id: string) => void;
  onCerrar: () => void;
}) {
  const [nota, setNota] = useState(e.nota);
  const [otro, setOtro] = useState("");
  const [tipo, setTipo] = useState<TipoEnlace>("relaciona");
  const [alReves, setAlReves] = useState(false);
  const [por, setPor] = useState("");
  const [seguro, setSeguro] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const id = useId();
  const otras = entradas.filter((x) => x.id !== e.id);
  const porId = new Map(entradas.map((x) => [x.id, x]));
  const suyos = enlaces.filter((l) => l.desde === e.id || l.hasta === e.id);

  async function hacer(p: Promise<{ ok: true } | { ok: false; error: string }>, hecho: string) {
    const r = await p;
    setError(r.ok ? null : r.error);
    setAviso(r.ok ? hecho : null);
    if (r.ok) onCambio();
    return r.ok;
  }

  const [sinOtro, setSinOtro] = useState(false);
  async function unir(ev: React.FormEvent) {
    ev.preventDefault();
    if (!otro) {
      setSinOtro(true);
      document.getElementById(`${id}-otro`)?.focus();
      return;
    }
    setSinOtro(false);
    const [d, h] = alReves ? [otro, e.id] : [e.id, otro];
    if (await hacer(enlazar(proyecto, d, h, por.trim(), tipo), "Enlace guardado.")) {
      setOtro("");
      setPor("");
    }
  }

  return (
    <Card as="section" aria-label={`Registro: ${e.titulo}`} className="space-y-4 bg-canvas p-4">
      <Cabeza onCerrar={onCerrar}>
        <MarcaTipo tipo={e.tipo} />
        <p className="mt-1 text-[15px] leading-snug">
          <EnlaceRegistro titulo={e.titulo} href={e.href} />
        </p>
        <p className="mt-0.5 text-xs text-ink-soft">
          <Antiguedad iso={e.creado} prefijo="agregado" />
        </p>
      </Cabeza>

      <div>
        <p className="text-sm font-semibold">Fecha en la línea de tiempo</p>
        {edita ? (
          <CampoFecha e={e} onGuardar={(f) => hacer(fechar(e.id, f), f ? "Fecha guardada." : "Fecha quitada.")} />
        ) : (
          <p className="mt-1 font-mono text-sm">{e.fecha ? formatFecha(e.fecha) : "Sin fecha"}</p>
        )}
      </div>

      {edita ? (
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            void hacer(anotar(e.id, nota.trim()), "Nota guardada.");
          }}
          className="space-y-2"
        >
          <Label htmlFor={`${id}-nota`} className="text-sm font-semibold">Nota</Label>
          <Textarea
            id={`${id}-nota`}
            name="nota"
            rows={3}
            maxLength={5000}
            value={nota}
            onChange={(ev) => setNota(ev.target.value)}
            onKeyDown={enviarConModificador}
            placeholder="Qué encontraste aquí, qué falta verificar, de dónde sale…"
          />
          <Button type="submit" size="sm" disabled={nota.trim() === e.nota}>Guardar nota</Button>
        </form>
      ) : (
        e.nota && <p className="whitespace-pre-line border-l-2 border-hairline pl-3 text-sm leading-relaxed">{e.nota}</p>
      )}

      <div>
        <p className="text-sm font-semibold">
          Lo que lo une <span className="font-mono text-xs font-normal tabular-nums text-ink-soft">{suyos.length}</span>
        </p>
        {suyos.length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft">Nada todavía.</p>
        ) : (
          <ul className="mt-1 divide-y divide-hairline">
            {suyos.map((l) => {
              const a = porId.get(l.desde);
              const b = porId.get(l.hasta);
              if (!a || !b) return null;
              return (
                <li key={l.id} className="flex items-start gap-2 py-2 text-sm leading-relaxed">
                  <p className="min-w-0 flex-1">
                    <span className={a.id === e.id ? "text-ink-soft" : "font-medium"}>{a.id === e.id ? "Este" : a.titulo}</span>
                    <span className="mx-1.5 text-brand-700">{VERBO_ENLACE[l.tipo]} <span aria-hidden="true">→</span></span>
                    <span className={b.id === e.id ? "text-ink-soft" : "font-medium"}>{b.id === e.id ? "este" : b.titulo}</span>
                    {l.nota && <span className="block text-xs text-ink-soft">{l.nota}</span>}
                  </p>
                  <Button type="button" variant="ghost" size="sm" onClick={() => onElegirEnlace(l.id)}>
                    Abrir
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {edita && otras.length > 0 && (
        <form onSubmit={unir} className="space-y-2 border-t border-hairline pt-4">
          <p className="text-sm font-semibold">Enlazar con otro registro</p>
          <SelectVerbo value={tipo} onChange={setTipo} etiqueta="Qué hace uno con el otro" />
          <Select
            name="otro"
            value={otro}
            onValueChange={(v) => {
              setOtro(v);
              setSinOtro(false);
            }}
          >
            <SelectTrigger
              id={`${id}-otro`}
              aria-label="El otro registro"
              aria-invalid={sinOtro || undefined}
              aria-describedby={sinOtro ? `${id}-otro-error` : undefined}
            >
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
          <div className="flex items-center gap-2">
            <Checkbox id={`${id}-reves`} checked={alReves} onCheckedChange={(v) => setAlReves(v === true)} />
            <Label htmlFor={`${id}-reves`} className="text-sm font-normal">
              Al revés: el otro {VERBO_ENLACE[tipo]} este
            </Label>
          </div>
          <Label htmlFor={`${id}-por`} className="sr-only">Nota del enlace</Label>
          <Input id={`${id}-por`} name="por" autoComplete="off" value={por} maxLength={1000} onChange={(ev) => setPor(ev.target.value)} placeholder="De dónde lo sabes (opcional)…" />
          <ErrorCampo id={`${id}-otro-error`}>
            {sinOtro ? "Elige con cuál registro enlazarlo." : ""}
          </ErrorCampo>
          <Button type="submit" size="sm" variant="secondary">Enlazar</Button>
        </form>
      )}

      {edita && (
        <div className="border-t border-hairline pt-4">
          {seguro ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={quitando}
                onClick={async () => {
                  setQuitando(true);
                  await hacer(quitarEntrada(e.id), "Quitado del proyecto.");
                  setQuitando(false);
                }}
              >
                {quitando ? "Quitando…" : "Sí, quitarlo del proyecto con sus enlaces"}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={quitando} onClick={() => setSeguro(false)}>No</Button>
            </div>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setSeguro(true)}>
              <IconTrash className="h-3.5 w-3.5" />
              Quitar del proyecto
            </Button>
          )}
          <p className="mt-1.5 text-xs text-ink-soft">Se va con su nota, su fecha y sus enlaces. El registro sigue en la plataforma.</p>
        </div>
      )}
      <p role="status" aria-live="polite" className="text-xs empty:sr-only">
        {error ? <span className="text-alerta-700">{error}</span> : aviso && <span className="text-ink-soft">{aviso}</span>}
      </p>
    </Card>
  );
}

function PanelEnlace({
  l,
  porId,
  edita,
  onCambio,
  onQuitado,
  onCerrar,
}: {
  l: Enlace | undefined;
  porId: Map<string, Entrada>;
  edita: boolean;
  onCambio: () => void;
  /** El enlace se quitó: el caso ofrece «Deshacer», que lo vuelve a tender con su verbo y su nota. */
  onQuitado: (l: Enlace) => void;
  onCerrar: () => void;
}) {
  const [nota, setNota] = useState(l?.nota ?? "");
  const [error, setError] = useState<string | null>(null);
  /*
    Un enlace se restaura entero (sus dos extremos, su verbo, su nota), así que
    no se pregunta antes: se quita y el caso ofrece «Deshacer» (docs/DESIGN.md
    §4.1). Quitar un registro sí pregunta: se lleva sus enlaces y sus menciones.
  */
  const [quitando, setQuitando] = useState(false);
  const id = useId();
  const a = l && porId.get(l.desde);
  const b = l && porId.get(l.hasta);
  if (!l || !a || !b) return null;

  async function hacer(p: Promise<{ ok: true } | { ok: false; error: string }>) {
    const r = await p;
    setError(r.ok ? null : r.error);
    if (r.ok) onCambio();
  }

  return (
    <Card as="section" aria-label="Enlace entre dos registros" className="space-y-4 bg-canvas p-4">
      <Cabeza onCerrar={onCerrar}>
        <p className="text-[15px] leading-relaxed">
          <EnlaceRegistro titulo={a.titulo} href={a.href} />
          <span className="mx-1.5 text-brand-700">{VERBO_ENLACE[l.tipo]} <span aria-hidden="true">→</span></span>
          <EnlaceRegistro titulo={b.titulo} href={b.href} />
        </p>
      </Cabeza>
      {edita ? (
        <>
          <SelectVerbo value={l.tipo} onChange={(t) => void hacer(editarEnlace(l.id, { tipo: t }))} etiqueta="Qué hace uno con el otro" />
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              void hacer(editarEnlace(l.id, { nota: nota.trim() }));
            }}
            className="space-y-2"
          >
            <Label htmlFor={`${id}-nota`} className="text-sm font-semibold">De dónde lo sabes</Label>
            <Input id={`${id}-nota`} name="nota" autoComplete="off" value={nota} maxLength={1000} onChange={(ev) => setNota(ev.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={nota.trim() === l.nota}>Guardar nota</Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={quitando}
                onClick={async () => {
                  setQuitando(true);
                  const r = await quitarEnlace(l.id);
                  setQuitando(false);
                  if (!r.ok) return setError(r.error);
                  onQuitado(l);
                  onCambio();
                }}
              >
                <IconTrash className="h-3.5 w-3.5" />
                {quitando ? "Quitando…" : "Quitar el enlace"}
              </Button>
            </div>
          </form>
        </>
      ) : (
        l.nota && <p className="text-sm leading-relaxed text-ink-soft">{l.nota}</p>
      )}
      <p role="status" aria-live="polite" className="text-xs text-alerta-700 empty:sr-only">{error}</p>
    </Card>
  );
}

/* ----------------------------------------------------- línea de tiempo */

function CampoFecha({ e, onGuardar }: { e: Entrada; onGuardar: (f: string | null) => Promise<boolean> }) {
  const [valor, setValor] = useState(e.fecha ?? "");
  const id = useId();
  useEffect(() => setValor(e.fecha ?? ""), [e.fecha]);
  const [mal, setMal] = useState(false);
  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        const f = valor.trim();
        const valida = FECHA_CASO.test(f) && f >= "1844-01-01" && f <= "2100-12-31";
        setMal(!valida);
        if (!valida) {
          document.getElementById(id)?.focus();
          return;
        }
        // La misma fecha ya guardada: no hay nada que enviar.
        if (f !== e.fecha) void onGuardar(f);
      }}
      className="mt-1 flex flex-wrap items-center gap-2"
    >
      <Label htmlFor={id} className="sr-only">Fecha de «{e.titulo}»</Label>
      <Input
        id={id}
        name="fecha"
        type="date"
        min="1844-01-01"
        max="2100-12-31"
        value={valor}
        onChange={(ev) => {
          setValor(ev.target.value);
          if (mal) setMal(false);
        }}
        aria-invalid={mal || undefined}
        aria-describedby={mal ? `${id}-error` : undefined}
        className="w-44"
      />
      <Button type="submit" size="sm" variant="secondary">
        Guardar fecha
      </Button>
      {e.fecha && (
        <Button type="button" size="sm" variant="ghost" onClick={() => void onGuardar(null)}>
          Quitar
        </Button>
      )}
      <ErrorCampo id={`${id}-error`} className="w-full">
        {mal ? "Elige una fecha entre 1844 y 2100." : ""}
      </ErrorCampo>
    </form>
  );
}

function Tiempo({ entradas, edita, onCambio }: { entradas: Entrada[]; edita: boolean; onCambio: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const sinFecha = entradas.filter((e) => !e.fecha);
  const porId = new Map(entradas.map((e) => [e.id, e]));

  async function guardar(id: string, f: string | null) {
    const r = await fechar(id, f);
    setError(r.ok ? null : r.error);
    if (r.ok) onCambio();
    return r.ok;
  }

  const hitos: HitoTiempo[] = entradas;
  return (
    <>
      <p className="text-xs leading-relaxed text-ink-soft">
        La fecha de cada registro la pones tú: cuándo pasó lo que te importa de él (se adjudicó, se
        firmó, se pagó). No se copia de la fuente; la ficha sigue diciendo la suya.
      </p>
      {error && <p role="alert" className="text-xs text-alerta-700">{error}</p>}
      {sinFecha.length === entradas.length ? (
        <p className="text-sm text-ink-soft">Ningún registro tiene fecha todavía.</p>
      ) : (
        <LineaDeTiempo
          hitos={hitos}
          accion={edita ? (h) => <CampoFecha e={porId.get(h.id)!} onGuardar={(f) => guardar(h.id, f)} /> : undefined}
        />
      )}
      {sinFecha.length > 0 && (
        <section className="border-t border-hairline pt-4">
          <h3 className="text-sm font-semibold">
            Sin fecha <span className="font-mono text-xs font-normal tabular-nums text-ink-soft">{sinFecha.length}</span>
          </h3>
          <ul className="mt-1 divide-y divide-hairline">
            {sinFecha.map((e) => (
              <li key={e.id} className="py-2.5">
                <EnlaceRegistro titulo={e.titulo} href={e.href} />
                <p className="mt-0.5">
                  <MarcaTipo tipo={e.tipo} />
                </p>
                {edita && <CampoFecha e={e} onGuardar={(f) => guardar(e.id, f)} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------ narración */

/** Quien solo lee ve la narración pintada, sin cargar el editor. */
function NarracionLeida({ proyecto, registros }: { proyecto: string; registros: Entrada[] }) {
  const [doc, setDoc] = useState<NodoNarrativa | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    narrativaDe(proyecto).then((r) => {
      if (!vivo) return;
      if (r.ok) setDoc(r.datos.doc);
      else setError(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [proyecto]);
  if (error) return <p className="text-sm text-alerta-700">No se pudo leer el texto: {error}</p>;
  if (doc === undefined) return <Skeleton className="h-40 w-full" />;
  if (!narrativaConTexto(doc)) return <p className="text-sm text-ink-soft">Quienes editan este proyecto todavía no escribieron su texto.</p>;
  return <NarrativaLectura doc={doc!} registros={registros} />;
}
