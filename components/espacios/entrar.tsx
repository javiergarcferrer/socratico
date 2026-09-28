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
import { ErrorCampo } from "@/components/ui/error-campo";
import { enviarConEnter } from "@/components/teclas";
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
  // Qué campo falló al pulsar. Los botones no se apagan por un campo a
  // medias: pulsar es preguntar qué falta, y la respuesta va junto al campo.
  const [falta, setFalta] = useState<"correo" | "contrasena" | "codigo" | "nombre" | "nueva" | null>(null);
  const [codigoMal, setCodigoMal] = useState("");
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
    // Con el envío en curso, un segundo Enter no pide otro código.
    if (cargando) return;
    const correo = email.trim();
    const mal = !correoValido(correo) ? "correo" : modo === "contrasena" && !contrasena ? "contrasena" : null;
    setFalta(mal);
    if (mal) {
      document.getElementById(mal === "correo" ? "correo-cuenta" : "contrasena-cuenta")?.focus();
      return;
    }
    setEmail(correo);
    if (modo === "contrasena") return entrarConClave();
    setError(null);
    setCargando(true);
    const fallo = await pedirCodigo(correo, "/cuenta");
    setCargando(false);
    if (fallo) setError(fallo);
    else setPaso("codigo");
  }

  async function entrarConClave() {
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
    if (nueva.length < LARGO_MINIMO) {
      setFalta("nueva");
      document.getElementById("contrasena-nueva")?.focus();
      return;
    }
    setFalta(null);
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
    if (cargando) return;
    const entrada = leerEntrada(codigo);
    if (!entrada) {
      setCodigoMal(
        codigo.trim()
          ? "Eso no parece ni un código de seis dígitos ni una dirección de verificación. Pega la dirección completa, la que empieza por «http»."
          : "Escribe el código de 6 dígitos o pega la dirección del correo.",
      );
      document.getElementById("codigo-cuenta")?.focus();
      return;
    }
    setCodigoMal("");
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
    const firma = nombre.trim();
    if (!usuario) return;
    if (!firma) {
      setFalta("nombre");
      document.getElementById("nombre-firma")?.focus();
      return;
    }
    // Ya guardado tal cual: el botón dice «Guardado» y no hay nada que enviar.
    if (firma === nombreGuardado) return;
    setFalta(null);
    setCargando(true);
    const r = await guardarNombre(usuario, firma);
    setCargando(false);
    if (r.ok) setNombreGuardado(firma);
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
                name="name"
                value={nombre}
                maxLength={80}
                onChange={(e) => {
                  setNombre(e.target.value);
                  if (falta === "nombre") setFalta(null);
                }}
                placeholder="Tu nombre o el de tu medio…"
                autoComplete="name"
                aria-invalid={falta === "nombre" || undefined}
                aria-describedby={falta === "nombre" ? "nombre-firma-error" : undefined}
              />
              <Button type="submit" variant="secondary" disabled={cargando}>
                {nombreGuardado && nombre.trim() === nombreGuardado ? "Guardado" : "Guardar"}
              </Button>
            </div>
            <ErrorCampo id="nombre-firma-error">
              {falta === "nombre" ? "Escribe el nombre con que firmas." : ""}
            </ErrorCampo>
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
                name="password"
                type="password"
                autoComplete="new-password"
                value={nueva}
                onChange={(e) => {
                  setNueva(e.target.value);
                  setContrasenaGuardada(false);
                  if (falta === "nueva") setFalta(null);
                }}
                placeholder="Crea o cambia tu contraseña…"
                aria-invalid={falta === "nueva" || undefined}
                aria-describedby={falta === "nueva" ? "contrasena-nueva-error" : "contrasena-nueva-cuenta"}
              />
              <Button type="submit" variant="secondary" disabled={cargando}>
                {contrasenaGuardada ? "Guardada" : "Guardar"}
              </Button>
            </div>
            {/* La cuenta atrás se ve mientras se teclea, sin anunciarse a cada
                tecla; solo el intento de guardar corto se anuncia. */}
            {falta !== "nueva" && nueva.length > 0 && nueva.length < LARGO_MINIMO && (
              <p id="contrasena-nueva-cuenta" className="text-xs text-ink-soft">
                Faltan {LARGO_MINIMO - nueva.length} caracteres.
              </p>
            )}
            <ErrorCampo id="contrasena-nueva-error">
              {falta === "nueva" ? `Faltan ${LARGO_MINIMO - nueva.length} caracteres: al menos ${LARGO_MINIMO}.` : ""}
            </ErrorCampo>
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
              setFalta(null);
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
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (falta === "correo") setFalta(null);
            }}
            placeholder="tu@correo.com"
            aria-invalid={falta === "correo" || undefined}
            aria-describedby={falta === "correo" ? "entrar-error" : undefined}
          />
          {modo === "contrasena" && (
            <>
              <Label htmlFor="contrasena-cuenta" className="sr-only">Contraseña</Label>
              <Input
                id="contrasena-cuenta"
                name="password"
                type="password"
                autoComplete="current-password"
                value={contrasena}
                onChange={(e) => {
                  setContrasena(e.target.value);
                  if (falta === "contrasena") setFalta(null);
                }}
                placeholder="Tu contraseña…"
                aria-invalid={falta === "contrasena" || undefined}
                aria-describedby={falta === "contrasena" ? "entrar-error" : undefined}
              />
            </>
          )}
          {error && <Alert variant="aviso" className="px-3.5 py-2.5 text-xs leading-relaxed">{error}</Alert>}
          <ErrorCampo id="entrar-error">
            {falta === "correo"
              ? "Escribe un correo completo: nombre@dominio."
              : falta === "contrasena"
                ? "Escribe tu contraseña."
                : ""}
          </ErrorCampo>
          {modo === "codigo" ? (
            <Button type="submit" className="w-full" disabled={cargando}>
              {cargando ? "Enviando…" : "Enviarme el código"}
            </Button>
          ) : (
            <>
              <Button type="submit" className="w-full" disabled={cargando}>
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
          {/* `one-time-code`: iOS ofrece el código encima del teclado. Enter
              envía: un código o una dirección pegada no llevan saltos de línea. */}
          <Textarea
            id="codigo-cuenta"
            name="codigo"
            rows={codigo.length > 40 ? 3 : 1}
            value={codigo}
            onChange={(e) => {
              setCodigo(e.target.value);
              if (codigoMal) setCodigoMal("");
            }}
            onKeyDown={enviarConEnter}
            placeholder="000000 — o pega la dirección del correo"
            autoComplete="one-time-code"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Código de verificación o enlace del correo"
            aria-invalid={codigoMal ? true : undefined}
            aria-describedby={codigoMal ? "codigo-cuenta-error" : undefined}
            className="min-h-11 resize-none bg-canvas px-3 py-3 font-mono tabular-nums"
          />
          <ErrorCampo id="codigo-cuenta-error">{codigoMal}</ErrorCampo>
          {error && <Alert variant="aviso" className="px-3.5 py-2.5 text-xs leading-relaxed">{error}</Alert>}
          <Button type="submit" className="w-full" disabled={cargando}>
            {cargando ? "Verificando…" : "Entrar"}
          </Button>
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setPaso("correo");
              setCodigo("");
              setCodigoMal("");
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
