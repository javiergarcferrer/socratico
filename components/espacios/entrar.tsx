"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { rutaPropia } from "@/lib/espacios";
import { abrirSesion, correoValido, leerEntrada, pedirCodigo } from "@/lib/sesion";
import {
  alEntrar,
  guardarNombre,
  miNombre,
  misInvitaciones,
  salir,
  sesionActual,
  type Usuario,
} from "@/lib/espacios-cliente";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { avisarCambioDeSesion } from "./presencia";

type Paso = "cargando" | "correo" | "codigo" | "dentro";

/** Solo una ruta de esta plataforma: `?volver=` no puede mandar a otro sitio. */
function volverSeguro(v: string | null): string | null {
  return rutaPropia(v) && !v.startsWith("/cuenta") ? v : null;
}

/**
 * Entrar o crear la cuenta: el mismo correo con código que `/democracia`
 * (`lib/sesion.ts`). No hay contraseña que olvidar ni que filtrar: cada
 * entrada es un código de un solo uso que llega al correo.
 *
 * Al entrar, lo que el navegador ya seguía pasa a la cuenta (`alEntrar`) y,
 * si hay invitaciones a ese correo, se avisa: se aceptan o no en «Tu
 * espacio», nunca solas. Después, si la visita venía de guardar algo
 * (`?volver=`), vuelve ahí; si no, se queda para ofrecer el nombre con que
 * firma y el camino a su espacio.
 */
export default function Entrar({ volver }: { volver: string | null }) {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>("cargando");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [nombre, setNombre] = useState("");
  const [nombreGuardado, setNombreGuardado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const destino = volverSeguro(volver);

  async function dentro(u: Usuario, recienLlegado: boolean) {
    setUsuario(u);
    setPaso("dentro");
    avisarCambioDeSesion();
    if (recienLlegado) {
      const [, inv] = await Promise.all([alEntrar(u), misInvitaciones()]);
      const n = inv.ok ? inv.datos.length : 0;
      if (n > 0) {
        setAviso(n === 1 ? "Tienes una invitación a un proyecto: la aceptas o no en tu espacio." : `Tienes ${n} invitaciones a proyectos: las aceptas o no en tu espacio.`);
        // Con una invitación pendiente, el camino es el espacio, no la vuelta.
        return nombrar(u);
      }
      if (destino) {
        router.replace(destino);
        return;
      }
    }
    await nombrar(u);
  }

  async function nombrar(u: Usuario) {
    const n = await miNombre(u);
    if (n.ok && n.datos) {
      setNombre(n.datos);
      setNombreGuardado(n.datos);
    }
  }

  // Al montar: la sesión que ya hay, o la que traiga la dirección (el enlace
  // del correo). Se lee antes de tocar el cliente: supabase-js limpia el
  // fragmento en cuanto se inicializa.
  useEffect(() => {
    const llegada = leerEntrada(window.location.href);
    (async () => {
      let u = await sesionActual();
      let nueva = false;
      if (llegada && !u) {
        const fallo = await abrirSesion("", llegada);
        if (fallo) setError(fallo);
        u = await sesionActual();
        nueva = Boolean(u);
      }
      if (llegada) window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (u) await dentro(u, nueva);
      else setPaso("correo");
    })();
    // Solo al montar: es el rescate de la vuelta del correo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!correoValido(email)) return;
    setError(null);
    setCargando(true);
    const fallo = await pedirCodigo(email.trim(), "/cuenta");
    setCargando(false);
    if (fallo) setError(fallo);
    else setPaso("codigo");
  }

  async function verificar(e: React.FormEvent) {
    e.preventDefault();
    const entrada = leerEntrada(codigo);
    if (!entrada) {
      setError("Eso no parece ni un código de seis dígitos ni una dirección de verificación. Pega la dirección completa, la que empieza por «http».");
      return;
    }
    setError(null);
    setCargando(true);
    const fallo = await abrirSesion(email.trim(), entrada);
    const u = fallo ? null : await sesionActual();
    setCargando(false);
    if (fallo || !u) {
      setError(fallo ?? "No quedó la sesión abierta. Pide un código nuevo.");
      return;
    }
    await dentro(u, true);
  }

  async function firmarComo(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario || !nombre.trim()) return;
    setCargando(true);
    const r = await guardarNombre(usuario, nombre);
    setCargando(false);
    if (r.ok) setNombreGuardado(nombre.trim());
    else setError(r.error);
  }

  async function cerrar() {
    const r = await salir();
    if (!r.ok) return setError(r.error);
    // El cliente borra su clave; la cabecera se entera en esta pestaña.
    avisarCambioDeSesion();
    setUsuario(null);
    setPaso("correo");
  }

  if (paso === "cargando") {
    return <Card className="h-[260px] p-5" aria-busy="true" />;
  }

  if (paso === "dentro" && usuario) {
    return (
      <div className="space-y-4">
        <Alert variant="valido" className="flex items-start gap-3 p-4">
          <IconCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold text-ink">Entraste como {usuario.email}</p>
            {aviso && <p className="mt-0.5">{aviso}</p>}
          </div>
        </Alert>
        <Card className="p-5">
          <form onSubmit={firmarComo} className="space-y-2.5">
            <Label htmlFor="nombre-firma">El nombre con que firmas</Label>
            <p className="text-xs leading-relaxed text-ink-soft">
              Lo ven quienes colaboran contigo y, si publicas un proyecto, quien lo lea.
              Sin nombre, colaboradores ven tu correo enmascarado y lo publicado dice «Anónimo».
            </p>
            <div className="flex gap-2">
              <Input
                id="nombre-firma"
                value={nombre}
                maxLength={80}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre o el de tu medio"
                autoComplete="name"
              />
              <Button type="submit" variant="secondary" disabled={cargando || !nombre.trim() || nombre.trim() === nombreGuardado}>
                {nombreGuardado && nombre.trim() === nombreGuardado ? "Guardado" : "Guardar"}
              </Button>
            </div>
          </form>
        </Card>
        {error && <Alert variant="aviso" className="px-3.5 py-2.5 text-xs">{error}</Alert>}
        <div className="flex flex-wrap gap-2.5">
          <Button asChild size="lg">
            <Link href={destino && !aviso ? destino : "/espacio"}>
              {destino && !aviso ? "Volver a donde estabas" : "Ir a tu espacio"}
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={cerrar}>
            Salir
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      {paso === "correo" ? (
        <form onSubmit={enviar} className="space-y-3">
          <CardTitle>Entra o crea tu cuenta con tu correo</CardTitle>
          <p className="text-sm leading-relaxed text-ink-soft">
            Te enviamos un código de seis dígitos. No hay contraseña: cada vez que entres
            llega uno nuevo. Si ya votaste en el piloto de democracia, es la misma cuenta.
          </p>
          <Label htmlFor="correo-cuenta" className="sr-only">Correo</Label>
          <Input
            id="correo-cuenta"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
          />
          {error && <Alert variant="aviso" className="px-3.5 py-2.5 text-xs leading-relaxed">{error}</Alert>}
          {/* Apagado explica por qué antes del toque (docs/IDENTIDAD.md §6). */}
          {!correoValido(email) && email.length > 3 && (
            <p className="text-xs text-ink-soft">Escribe un correo completo: nombre@dominio.</p>
          )}
          <Button type="submit" className="w-full" disabled={!correoValido(email) || cargando}>
            {cargando ? "Enviando…" : "Enviarme el código"}
          </Button>
        </form>
      ) : (
        <form onSubmit={verificar} className="space-y-3">
          <CardTitle>Revisa tu correo</CardTitle>
          <p className="text-sm leading-relaxed text-ink-soft">
            Enviamos un código a <strong className="font-medium text-ink">{email}</strong>. Escríbelo
            aquí. Si el correo trae un enlace en vez de un código, no lo pulses: copia su dirección y
            pégala aquí.
          </p>
          {/* `one-time-code`: iOS ofrece el código encima del teclado. */}
          <Textarea
            rows={codigo.length > 40 ? 3 : 1}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="000000 — o pega la dirección del correo"
            autoComplete="one-time-code"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Código de verificación o enlace del correo"
            className="min-h-11 resize-none bg-canvas px-3 py-3 font-mono tabular-nums"
          />
          {error && <Alert variant="aviso" className="px-3.5 py-2.5 text-xs leading-relaxed">{error}</Alert>}
          <Button type="submit" className="w-full" disabled={!codigo.trim() || cargando}>
            {cargando ? "Verificando…" : "Entrar"}
          </Button>
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setPaso("correo");
              setCodigo("");
              setError(null);
            }}
            className="h-11 w-full text-xs font-medium text-ink-soft hover:text-ink"
          >
            Cambiar de correo o pedir otro código
          </Button>
        </form>
      )}
    </Card>
  );
}
