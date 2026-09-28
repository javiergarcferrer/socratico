"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  crearProyecto,
  entradasDe,
  guardar,
  misProyectos,
  quitarEntrada,
  type Entrada,
  type ProyectoConCuenta,
  type Usuario,
} from "@/lib/espacios-cliente";
import { getSeguidos, onSeguimientoCambio } from "@/lib/seguimiento";
import Antiguedad from "@/components/antiguedad";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Rotulo } from "@/components/papel";
import { IconArrowRight, IconBell, IconFolder, IconPlus, IconTrash } from "@/components/icons";
import { Cerrado, EnlaceRegistro, MarcaTipo, SinSesion, useUsuario } from "./comun";

const ROL: Record<ProyectoConCuenta["rol"], string> = { dueno: "Tuyo", editor: "Editas", lector: "Lees" };

/**
 * El espacio del lector: lo que sigue, sus investigaciones (propias y
 * compartidas) y lo guardado sin ordenar. El orden es el de la pregunta con
 * que se abre: ¿qué cambió? → ¿en qué estoy trabajando? → ¿qué dejé sin
 * ordenar? (docs/IDENTIDAD.md §4).
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

  const cargar = useCallback(async () => {
    const [p, e] = await Promise.all([misProyectos(u), entradasDe(u, null)]);
    if ((!p.ok && p.cerrado) || (!e.ok && e.cerrado)) {
      setCerrado(true);
      return;
    }
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
        <h1 className="font-display mt-1 text-3xl text-ink sm:text-4xl">¿En qué estás investigando?</h1>
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
          <Proyectos proyectos={proyectos} onCreado={cargar} />
          <Guardado sueltas={sueltas} proyectos={proyectos} onCambio={cargar} />
        </>
      )}
    </div>
  );
}

function Proyectos({ proyectos, onCreado }: { proyectos: ProyectoConCuenta[] | null; onCreado: () => void }) {
  const router = useRouter();
  const [titulo, setTitulo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    setCargando(true);
    const r = await crearProyecto(titulo);
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setTitulo("");
    setError(null);
    onCreado();
    router.push(`/espacio/proyecto?id=${r.datos.id}`);
  }

  return (
    <Card as="section" className="p-5">
      <CardTitle>Tus investigaciones</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Una investigación junta registros de toda la plataforma —compras, contratistas, normas,
        iniciativas, sentencias, documentos— con tus notas y lo que los une.
      </p>
      <form onSubmit={crear} className="mt-3 flex gap-2">
        <Label htmlFor="nueva-investigacion" className="sr-only">Título de la nueva investigación</Label>
        <Input
          id="nueva-investigacion"
          value={titulo}
          maxLength={140}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ej.: Compras de INAPA en 2026"
        />
        <Button type="submit" disabled={!titulo.trim() || cargando} className="shrink-0">
          <IconPlus className="h-4 w-4" />
          Crear
        </Button>
      </form>
      {error && <p className="mt-2 text-xs text-alerta-700">{error}</p>}

      {proyectos === null ? (
        <Skeleton className="mt-4 h-24 w-full" />
      ) : proyectos.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">
          Aún no tienes ninguna. Crea una arriba o guarda un registro desde su ficha.
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
                  <Antiguedad iso={p.actualizado} prefijo="editada" />
                  <Badge variant={p.rol === "dueno" ? "neutro" : "firma"}>{ROL[p.rol]}</Badge>
                  {p.publico && <Badge variant="valido">Publicada</Badge>}
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

  async function mover(e: Entrada, proyecto: string) {
    const r = await guardar(e, proyecto);
    if (!r.ok) return setAviso(r.error);
    await quitarEntrada(e.id);
    setAviso(null);
    onCambio();
  }

  async function quitar(e: Entrada) {
    const r = await quitarEntrada(e.id);
    if (!r.ok) return setAviso(r.error);
    onCambio();
  }

  return (
    <Card as="section" className="p-5">
      <CardTitle>Guardado sin ordenar</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Lo que guardaste con «Guardar» sin elegir investigación. Llévalo a una cuando sepas dónde va.
      </p>
      {aviso && <p className="mt-2 text-xs text-alerta-700">{aviso}</p>}
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
                    <SelectTrigger className="w-44" aria-label={`Llevar «${e.titulo}» a una investigación`}>
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
                <Button type="button" variant="ghost" size="icon" onClick={() => quitar(e)} aria-label={`Quitar «${e.titulo}»`}>
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
