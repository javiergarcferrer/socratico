"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { rutaPropia } from "@/lib/espacios";
import {
  abrirSesion,
  correoValido,
  entrarConContrasena,
  entrarConGoogle,
  googleDisponible,
  LARGO_MINIMO,
  leerEntrada,
  mensajeDeGoogle,
  pedirCodigo,
  ponerContrasena,
  vueltaDeGoogle,
} from "@/lib/sesion";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { IconArrowRight, IconCheck, IconGoogle } from "@/components/icons";
import { avisarCambioDeSesion } from "./presencia";

type Paso = "cargando" | "correo" | "codigo" | "dentro";
type Modo = "codigo" | "contrasena";

/** Solo una ruta de esta plataforma: `?volver=` no puede mandar a otro sitio. */
function volverSeguro(v: string | null): string | null {
  return rutaPropia(v) && !v.startsWith("/cuenta") ? v : null;
}

/**
 * Entrar o crear la cuenta: con Google, cuando el proveedor está activo en el
 * proyecto, o con el mismo correo con código que `/democracia`
 * (`lib/sesion.ts`): Google responde por quien entra, o llega al correo un
 * código de un solo uso.
 * La contraseña es opcional y se crea **dentro**, tras probar el correo con
 * el código: por qué no hay alta con contraseña, en `lib/sesion.ts`.
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
  const [conGoogle, setConGoogle] = useState(false);
  const [modo, setModo] = useState<Modo>("codigo");
  const [contrasena, setContrasena] = useState("");
  const [nueva, setNueva] = useState("");
  const [contrasenaGuardada, setContrasenaGuardada] = useState(false);
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
    const deGoogle = vueltaDeGoogle();
    googleDisponible().then(setConGoogle);
    (async () => {
      let u = await sesionActual();
      // supabase-js ya consumió el fragmento de una vuelta de Google o del
      // correo al inicializarse: la sesión existe, pero es recién llegada.
      let nueva = Boolean(u && llegada && llegada.via !== "fallo");
      if (llegada?.via === "fallo" && deGoogle) {
        setError(mensajeDeGoogle(llegada.codigo));
      } else if (llegada && !u) {
        const fallo = await abrirSesion("", llegada);
        if (fallo) setError(fallo);
        u = await sesionActual();
        nueva = Boolean(u);
      }
      if (llegada) {
        // Solo `?volver=` sobrevive: el `?error=`/`?code=` de la vuelta ya se leyó.
        const v = new URLSearchParams(window.location.search).get("volver");
        const q = v ? `?${new URLSearchParams({ volver: v })}` : "";
        window.history.replaceState(null, "", window.location.pathname + q);
      }
      if (u) await dentro(u, nueva);
      else setPaso("correo");
    })();
    // Solo al montar: es el rescate de la vuelta del correo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!correoValido(email)) return;
    if (modo === "contrasena") return entrarConClave();
    setError(null);
    setCargando(true);
    const fallo = await pedirCodigo(email.trim(), "/cuenta");
    setCargando(false);
    if (fallo) setError(fallo);
    else setPaso("codigo");
  }

  async function entrarConClave() {
    if (!contrasena) return;
    setError(null);
    setCargando(true);
    const fallo = await entrarConContrasena(email.trim(), contrasena);
    const u = fallo ? null : await sesionActual();
    setCargando(false);
    if (fallo || !u) {
      setError(fallo ?? "No quedó la sesión abierta. Vuelve a intentarlo.");
      return;
    }
    setContrasena("");
    await dentro(u, true);
  }

  async function guardarContrasena(e: React.FormEvent) {
    e.preventDefault();
    if (nueva.length < LARGO_MINIMO) return;
    setError(null);
    setCargando(true);
    const fallo = await ponerContrasena(nueva);
    setCargando(false);
    if (fallo) return setError(fallo);
    setNueva("");
    setContrasenaGuardada(true);
  }

  async function google() {
    setError(null);
    setCargando(true);
    // Vuelve aquí con el mismo `?volver=`: la llegada se resuelve al montar.
    const fallo = await entrarConGoogle(window.location.pathname + window.location.search);
    if (fallo) {
      setCargando(false);
      setError(fallo);
    }
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
    setNueva("");
    setContrasenaGuardada(false);
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
        <Card className="p-5">
          <form onSubmit={guardarContrasena} className="space-y-2.5">
            <Label htmlFor="contrasena-nueva">Tu contraseña</Label>
            <p className="text-xs leading-relaxed text-ink-soft">
              Opcional. Con ella entras sin esperar el código; si la olvidas, entras con el código y
              pones otra aquí. Al menos {LARGO_MINIMO} caracteres.
            </p>
            {/* El correo, para que el gestor de contraseñas la guarde con su cuenta. */}
            <input type="email" name="username" autoComplete="username" value={usuario.email} readOnly hidden />
            <div className="flex gap-2">
              <Input
                id="contrasena-nueva"
                type="password"
                autoComplete="new-password"
                value={nueva}
                onChange={(e) => {
                  setNueva(e.target.value);
                  setContrasenaGuardada(false);
                }}
                placeholder="Crea o cambia tu contraseña"
              />
              <Button type="submit" variant="secondary" disabled={cargando || nueva.length < LARGO_MINIMO}>
                {contrasenaGuardada ? "Guardada" : "Guardar"}
              </Button>
            </div>
            {nueva.length > 0 && nueva.length < LARGO_MINIMO && (
              <p className="text-xs text-ink-soft">Faltan {LARGO_MINIMO - nueva.length} caracteres.</p>
            )}
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
          <CardTitle>{conGoogle ? "Entra o crea tu cuenta" : "Entra o crea tu cuenta con tu correo"}</CardTitle>
          <p className="text-sm leading-relaxed text-ink-soft">
            {conGoogle
              ? "Entras con tu cuenta de Google o con tu correo: un código de seis dígitos, o la contraseña si ya la creaste. Si ya votaste en el piloto de democracia con ese mismo correo, es la misma cuenta."
              : "Te enviamos un código de seis dígitos, o entras con tu contraseña si ya la creaste. La cuenta se crea con el código; la contraseña se pone dentro. Si ya votaste en el piloto de democracia, es la misma cuenta."}
          </p>
          {conGoogle && (
            <>
              <Button type="button" variant="outline" size="lg" className="w-full" disabled={cargando} onClick={google}>
                <IconGoogle className="h-4 w-4" />
                Continuar con Google
              </Button>
              <p className="pt-1 text-center text-xs text-ink-soft">o con tu correo</p>
            </>
          )}
          <ToggleGroup
            type="single"
            value={modo}
            onValueChange={(v) => {
              if (!v) return;
              setModo(v as Modo);
              setError(null);
            }}
            aria-label="Cómo entrar con tu correo"
            className="w-full p-0.5"
          >
            <ToggleGroupItem value="codigo" className="min-h-11 flex-1 text-xs sm:min-h-9">
              Con código
            </ToggleGroupItem>
            <ToggleGroupItem value="contrasena" className="min-h-11 flex-1 text-xs sm:min-h-9">
              Con contraseña
            </ToggleGroupItem>
          </ToggleGroup>
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
          {modo === "contrasena" && (
            <>
              <Label htmlFor="contrasena-cuenta" className="sr-only">Contraseña</Label>
              <Input
                id="contrasena-cuenta"
                type="password"
                autoComplete="current-password"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                placeholder="Tu contraseña"
              />
            </>
          )}
          {error && <Alert variant="aviso" className="px-3.5 py-2.5 text-xs leading-relaxed">{error}</Alert>}
          {/* Apagado explica por qué antes del toque (docs/IDENTIDAD.md §6). */}
          {!correoValido(email) && email.length > 3 && (
            <p className="text-xs text-ink-soft">Escribe un correo completo: nombre@dominio.</p>
          )}
          {modo === "codigo" ? (
            <Button type="submit" className="w-full" disabled={!correoValido(email) || cargando}>
              {cargando ? "Enviando…" : "Enviarme el código"}
            </Button>
          ) : (
            <>
              <Button type="submit" className="w-full" disabled={!correoValido(email) || !contrasena || cargando}>
                {cargando ? "Entrando…" : "Entrar"}
              </Button>
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setModo("codigo");
                  setError(null);
                }}
                className="h-11 w-full text-xs font-medium text-ink-soft hover:text-ink"
              >
                ¿Sin contraseña o la olvidaste? Entra con el código y créala dentro
              </Button>
            </>
          )}
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
