"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { alCambiarSesion, sesionActual, type Usuario } from "@/lib/espacios-cliente";
import { hrefValido, NOMBRE_TIPO, rutaPropia, type TipoEntrada } from "@/lib/espacios";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EstadoVacio } from "@/components/estado-vacio";
import { IconArrowRight, IconExternal } from "@/components/icons";

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
export function Cerrado() {
  return (
    <Alert variant="aviso" className="p-4">
      <AlertTitle>Los proyectos se abren pronto</AlertTitle>
      <p className="mt-1 text-sm leading-relaxed">
        Tu cuenta ya existe y entrar funciona, pero guardar registros y armar
        investigaciones todavía no está abierto en esta plataforma. Mientras tanto,
        «Seguir» en cada ficha guarda lo que sigues en este navegador —{" "}
        <Link href="/seguimiento" className="font-medium underline">
          ver lo que sigues
        </Link>
        .
      </p>
    </Alert>
  );
}

/** La marca de tipo de un registro: grafito, porque informa y no pide nada. */
export function MarcaTipo({ tipo }: { tipo: TipoEntrada }) {
  return <Badge variant="neutro">{NOMBRE_TIPO[tipo]}</Badge>;
}

/**
 * El título de un registro, como enlace a su ficha viva. Un documento vive en
 * el sitio de la institución: pestaña nueva y su icono.
 */
export function EnlaceRegistro({ titulo, href, className }: { titulo: string; href: string; className?: string }) {
  const clase = className ?? "font-medium text-ink hover:text-brand-700 hover:underline";
  // Lo que no pasa el mismo `check` de la tabla se lee, no se pulsa.
  if (!hrefValido(href)) return <span className="font-medium text-ink">{titulo}</span>;
  return !rutaPropia(href) ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={clase}>
      {titulo}
      <IconExternal className="ml-1 inline h-3.5 w-3.5 align-[-2px] text-ink-soft" />
    </a>
  ) : (
    <Link href={href} className={clase}>
      {titulo}
    </Link>
  );
}
