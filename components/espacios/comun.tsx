"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { alCambiarSesion, sesionActual, type Usuario } from "@/lib/espacios-cliente";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EstadoVacio } from "@/components/estado-vacio";
import { IconArrowRight } from "@/components/icons";

/**
 * Piezas que comparten las pantallas del espacio (`/espacio`, la mesa de un
 * proyecto): quién está dentro, qué se dice sin sesión y qué se dice mientras
 * el esquema no esté abierto, y cómo se pinta un registro guardado.
 */

export type EstadoUsuario = { estado: "cargando" } | { estado: "fuera" } | { estado: "dentro"; usuario: Usuario };

/** La sesión de Supabase, con sus cambios (entrar o salir en otra pestaña). */
export function useUsuario(): EstadoUsuario {
  const [e, setE] = useState<EstadoUsuario>({ estado: "cargando" });
  useEffect(() => {
    let vivo = true;
    sesionActual().then((u) => vivo && setE(u ? { estado: "dentro", usuario: u } : { estado: "fuera" }));
    const dejar = alCambiarSesion((u) => setE(u ? { estado: "dentro", usuario: u } : { estado: "fuera" }));
    return () => {
      vivo = false;
      dejar();
    };
  }, []);
  return e;
}

/** Sin sesión: qué hay detrás y la única acción útil. */
export function SinSesion({ volver, que }: { volver: string; que: string }) {
  return (
    <EstadoVacio
      como="h1"
      titulo={que}
      accion={
        <Button asChild>
          <Link href={`/cuenta?volver=${encodeURIComponent(volver)}`}>
            Entrar con tu correo
            <IconArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      }
    >
      Tu espacio es privado: para verlo hay que entrar. Es un código al correo, o tu contraseña si ya la creaste.
    </EstadoVacio>
  );
}

/**
 * El esquema aún no está abierto en el API (docs/PLAN-ESPACIOS.md §5). No es
 * una caída ni un vacío: se dice qué pasa y qué sí funciona ya.
 */
export function Cerrado({ h1 = false }: { h1?: boolean }) {
  const titulo = "Los proyectos se abren pronto";
  return (
    <Alert role="note" variant="aviso" className="p-4">
      {/* Cuando es lo único de la página, su título es el h1 (docs/DESIGN.md §7). */}
      {h1 ? <h1 className="font-sans text-sm font-semibold tracking-normal">{titulo}</h1> : <AlertTitle>{titulo}</AlertTitle>}
      <p className="mt-1 text-sm leading-relaxed">
        Tu cuenta ya existe y entrar funciona, pero guardar registros y armar
        investigaciones todavía no está abierto en esta plataforma. Mientras tanto,
        «Seguir» en cada ficha guarda lo que sigues en este navegador.{" "}
        <Link href="/seguimiento" className="font-medium underline">
          Ver lo que sigues
        </Link>
        .
      </p>
    </Alert>
  );
}

export { EnlaceRegistro, MarcaTipo } from "./registro";
