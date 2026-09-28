"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, db } from "@/lib/supabase";
import { abrirSesion as abrirSesionCon, correoValido, leerEntrada, mensajeDeEnvio, type Entrada } from "@/lib/sesion";
import { cedulaValida, formatearCedula, limpiarCedula } from "@/lib/cedula";
import { rutaPropia } from "@/lib/espacios";
import { IconArrowLeft, IconCheck, IconShield } from "@/components/icons";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ErrorCampo } from "@/components/ui/error-campo";
import { enviarConEnter } from "@/components/teclas";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cuentaUnicaHabilitada, iniciarFlujo } from "@/app/democracia/cuenta-unica/cliente";

/**
 * `cedula-pendiente` cubre el caso del **enlace**: quien pulsa el enlace del
 * correo en vez de teclear el código vuelve con sesión abierta, pero en otra
 * pestaña, sin la cédula que escribió. En vez de dejarlo en un callejón, se le
 * pide solo la cédula y se completa el registro. La cédula nunca se guarda en
 * el navegador para «recordarla»: se vuelve a pedir.
 */
type Paso =
  | "datos"
  | "codigo"
  | "cedula-pendiente"
  | "registrando"
  | "listo"
  | "sesion";

export default function Registro() {
  const [paso, setPaso] = useState<Paso>("datos");
  // A dónde volver al terminar: la conversación desde la que se vino a
  // registrar la cédula (`?volver=`), solo si es una ruta de esta plataforma.
  const [volver, setVolver] = useState<string | null>(null);
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("volver");
    if (rutaPropia(v)) setVolver(v);
  }, []);
  const [cedula, setCedula] = useState("");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  // Qué campo falló al pulsar enviar. El botón no se apaga por un campo a
  // medias: pulsarlo es la manera de preguntar qué falta, y la respuesta va
  // junto al campo.
  const [cedulaMal, setCedulaMal] = useState(false);
  const [emailMal, setEmailMal] = useState(false);
  const [codigoMal, setCodigoMal] = useState<string | null>(null);
  /** De dónde viene la identidad del votante: cédula tecleada o Cuenta Única. */
  const [origen, setOrigen] = useState<"declarada" | "cuenta_unica" | null>(null);

  /** Abre sesión con lo que haya llegado (`lib/sesion.ts`); `null` si quedó abierta. */
  const abrirSesion = (entrada: Entrada) => abrirSesionCon(email.trim(), entrada);

  // Si ya hay sesión con votante, saltar directo al estado final. Y si la URL
  // trae la respuesta del enlace, consumirla antes de nada.
  useEffect(() => {
    // Leído antes de tocar el cliente: supabase-js limpia el fragmento en
    // cuanto se inicializa, así que después ya no estaría.
    const llegada = leerEntrada(window.location.href);
    (async () => {
      // `getSession()` espera a la inicialización, que es la que consume el
      // fragmento cuando trae una sesión válida.
      let sesion = (await supabase().auth.getSession()).data.session;
      if (llegada) {
        if (!sesion) {
          const fallo = await abrirSesion(llegada);
          if (fallo) setError(fallo);
          sesion = (await supabase().auth.getSession()).data.session;
        }
        // Que un recargado no reintente un token ya gastado.
        window.history.replaceState(null, "", window.location.pathname);
      }
      if (!sesion) return;
      // `*` y no `id, origen`: hasta que se aplique la migración 20260902 la
      // columna no existe, y pedirla por nombre haría fallar la consulta y
      // mandaría a quien ya está registrado a teclear la cédula otra vez.
      const { data: votante } = await db().from("votantes").select("*").maybeSingle();
      // Con sesión pero sin votante, el registro quedó a medias: falta la cédula.
      setPaso(votante ? "sesion" : "cedula-pendiente");
      const v = votante as { origen?: "declarada" | "cuenta_unica" } | null;
      setOrigen(v?.origen ?? null);
      if (sesion.user.email) setEmail(sesion.user.email);
    })();
    // Solo al montar: es el rescate de la vuelta del correo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cedulaOk = cedulaValida(cedula);
  const correo = email.trim();
  const emailOk = correoValido(correo);

  async function enviarCodigo(e: React.FormEvent) {
    e.preventDefault();
    // Con el envío en curso, un segundo Enter no pide otro código.
    if (cargando) return;
    setCedulaMal(!cedulaOk);
    setEmailMal(!emailOk);
    if (!cedulaOk || !emailOk) {
      document.getElementById(cedulaOk ? "registro-correo" : "registro-cedula")?.focus();
      return;
    }
    setEmail(correo);
    setError(null);
    setCargando(true);
    /*
      Se pide la vuelta a esta misma página aunque hoy no esté en la lista de
      redirecciones del proyecto. Comprobado el 2026-09-04 contra este GoTrue:
      `POST /auth/v1/otp?redirect_to=https://socratico.vercel.app/…` pasa la
      validación (falla después, por política de altas), y `/auth/v1/verify` con
      esa misma redirección responde 303 al Site URL. Es decir: pedirla no
      rompe nada hoy —el enlace sigue aterrizando en el Site URL— y el día que
      el dominio entre en la lista, el enlace vuelve aquí y el registro se
      completa solo, sin pegar nada.
    */
    const { error: err } = await supabase().auth.signInWithOtp({
      email: correo,
      options: {
        shouldCreateUser: true,
        // La vuelta del correo conserva a dónde regresar al terminar (ya
        // validado con `rutaPropia`): quien vino de una conversación vuelve a ella.
        emailRedirectTo: `${window.location.origin}/democracia/registro${volver ? `?volver=${encodeURIComponent(volver)}` : ""}`,
      },
    });
    setCargando(false);
    if (err) {
      // Decir qué pasó de verdad. «Revisa el correo» ante un límite de envío
      // manda al usuario a mirar una bandeja donde no hay nada, y a reintentar
      // justo lo que agotó la cuota.
      setError(mensajeDeEnvio(err));
      return;
    }
    setPaso("codigo");
  }

  async function verificar(e: React.FormEvent) {
    e.preventDefault();
    if (cargando || paso === "registrando") return;
    const entrada = leerEntrada(codigo);
    if (!entrada) {
      // El callejón sin salida era un botón apagado sin explicación.
      setCodigoMal(
        codigo.trim()
          ? "Eso no parece ni un código de seis dígitos ni una dirección de verificación. Pega la dirección completa, la que empieza por «http»."
          : "Escribe el código de 6 dígitos o pega la dirección del correo.",
      );
      document.getElementById("registro-codigo")?.focus();
      return;
    }
    setCodigoMal(null);
    setError(null);
    setCargando(true);
    const fallo = await abrirSesion(entrada);
    setCargando(false);
    if (fallo) {
      setError(fallo);
      return;
    }
    await completarRegistro("codigo");
  }

  /**
   * Cierra el registro con la sesión ya abierta. `volverA` es el paso al que
   * regresar si la cédula no pasa: el que la pidió.
   */
  async function completarRegistro(volverA: Paso) {
    setPaso("registrando");
    setCargando(true);
    const { data, error: errReg } = await db().rpc("registrar_votante", {
      p_cedula: limpiarCedula(cedula),
    });
    setCargando(false);
    const r = data as { ok?: boolean; error?: string } | null;
    if (errReg || r?.ok === false) {
      const mapa: Record<string, string> = {
        cedula_invalida: "La cédula no es válida.",
        cedula_en_uso: "Esa cédula ya tiene un registro. Cada cédula vota una sola vez.",
        sesion_requerida: "Sesión no encontrada. Reinicia el registro.",
      };
      setError(mapa[r?.error ?? ""] ?? "No se pudo completar el registro.");
      setPaso(volverA);
      return;
    }
    setPaso("listo");
  }

  /**
   * Identidad v2: Cuenta Única verifica quién eres; Supabase sigue siendo la
   * sesión. Por eso solo se ofrece con sesión abierta. La vuelta la atiende
   * `/democracia/cuenta-unica/callback`.
   */
  async function irACuentaUnica() {
    setError(null);
    setCargando(true);
    try {
      const { data } = await supabase().auth.getSession();
      window.location.assign(await iniciarFlujo(data.session?.user.id ?? ""));
    } catch {
      setCargando(false);
      setError("No se pudo iniciar la verificación con Cuenta Única. Vuelve a intentarlo.");
    }
  }

  async function registrarConSesion(e: React.FormEvent) {
    e.preventDefault();
    if (cargando) return;
    setCedulaMal(!cedulaOk);
    if (!cedulaOk) {
      document.getElementById("cedula-pendiente")?.focus();
      return;
    }
    setError(null);
    await completarRegistro("cedula-pendiente");
  }

  if (paso === "sesion" || paso === "listo") {
    return (
      <div className="mx-auto max-w-lg">
        <VolverCongreso />
        <Alert variant="firma" className="mt-4 border-brand-200/60 bg-brand-50/70 p-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-500 text-canvas">
            <IconCheck className="h-6 w-6" />
          </span>
          <h1 className="font-display mt-3 text-lg text-ink">
            {paso === "listo" ? "Registro completo" : "Ya estás registrado"}
          </h1>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-soft">
            Tu cédula quedó vinculada a tu sesión de forma privada. Ya puedes votar
            sobre cualquier iniciativa; tu voto es secreto y solo se publican los
            totales.
          </p>
          {/* Solo cuando la vía existe: un déficit sin remedio no se enseña. */}
          {cuentaUnicaHabilitada() && (
            <p className="rotulo mt-3 text-ink-soft">
              {origen === "cuenta_unica"
                ? "Identidad verificada · Cuenta Única"
                : "Registro por cédula y correo · sin verificar"}
            </p>
          )}
          {/* Pantalla de una sola acción: en el teléfono el botón ocupa el
              ancho, porque no compite con nada. */}
          <Button asChild size="lg" className="mt-4 w-full bg-brand-600 hover:bg-brand-700 sm:w-auto">
            <Link href={volver ?? "/congreso"}>{volver ? "Volver a la conversación" : "Ir a las iniciativas"}</Link>
          </Button>
        </Alert>
        {cuentaUnicaHabilitada() && origen !== "cuenta_unica" && (
          <CuentaUnica onClick={irACuentaUnica} cargando={cargando} error={error} />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <VolverCongreso />
      <header className="mb-5 mt-4">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          Regístrate para votar
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          Un registro por cédula para que cada voto cuente una vez. Tu cédula se
          guarda cifrada, nunca en claro, y tu voto es privado.{" "}
          <Link href="/democracia/seguridad" className="font-medium text-brand-700 hover:underline">
            Cómo protegemos tus datos
          </Link>
          .
        </p>
      </header>

      {paso === "datos" && (
        <Card asChild className="p-5">
          <form onSubmit={enviarCodigo} className="space-y-4">
          <Campo
            etiqueta="Cédula"
            hint={cedula && !cedulaOk ? "Cédula inválida" : "11 dígitos"}
            hintError={!!cedula && !cedulaOk}
            error={<ErrorCampo id="registro-cedula-error" className="mt-1.5">{cedulaMal ? MENSAJE_CEDULA : ""}</ErrorCampo>}
          >
            {/*
              El teclado del teléfono es parte del formulario: `inputMode`
              numérico abre el teclado de cifras, y `autoComplete="off"` con
              `autoCorrect`/`autoCapitalize` apagados impiden que iOS «corrija»
              una cédula a medio teclear. El formato se pone solo.
            */}
            <Input
              id="registro-cedula"
              name="cedula"
              inputMode="numeric"
              value={formatearCedula(cedula)}
              onChange={(e) => {
                setCedula(limpiarCedula(e.target.value).slice(0, 11));
                if (cedulaMal) setCedulaMal(false);
              }}
              placeholder="001-0000000-0"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={cedulaMal || undefined}
              aria-describedby={cedulaMal ? "registro-cedula-error" : undefined}
              className="h-11 bg-canvas font-mono tabular-nums"
            />
          </Campo>
          <Campo
            etiqueta="Correo electrónico"
            hint="Te enviaremos un código de un solo uso"
            error={
              <ErrorCampo id="registro-correo-error" className="mt-1.5">
                {emailMal ? "Escribe un correo completo, como tu@correo.do." : ""}
              </ErrorCampo>
            }
          >
            {/*
              `inputMode="email"` pone la arroba en el teclado, y sin
              `autoCapitalize="off"` iOS escribe «Tu@correo.do» y el envío
              falla por una mayúscula que el visitante no tecleó.
            */}
            <Input
              id="registro-correo"
              name="email"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailMal) setEmailMal(false);
              }}
              placeholder="tu@correo.do"
              autoComplete="email"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={emailMal || undefined}
              aria-describedby={emailMal ? "registro-correo-error" : undefined}
              className="h-11 bg-canvas"
            />
          </Campo>
          {error && (
            <Alert variant="aviso" className="px-3.5 py-2.5 text-xs leading-relaxed">
              {error}
            </Alert>
          )}
          <Button
            type="submit"
            disabled={cargando}
            className="h-11 w-full bg-brand-600 hover:bg-brand-700"
          >
            {cargando ? "Enviando…" : "Enviar código"}
            </Button>
          </form>
        </Card>
      )}

      {paso === "cedula-pendiente" && cuentaUnicaHabilitada() && (
        <CuentaUnica onClick={irACuentaUnica} cargando={cargando} error={null} className="mb-4" />
      )}

      {paso === "cedula-pendiente" && (
        <Card asChild className="p-5">
          <form onSubmit={registrarConSesion} className="space-y-4">
          <p className="text-sm text-ink-soft">
            Tu correo ya está verificado
            {email && (
              <>
                {" "}
                (<span className="font-medium text-ink">{email}</span>)
              </>
            )}
            . Falta la cédula para completar el registro.
          </p>
          <div>
            <label htmlFor="cedula-pendiente" className="rotulo text-ink-soft">
              Cédula
            </label>
            <Input
              id="cedula-pendiente"
              name="cedula"
              inputMode="numeric"
              value={formatearCedula(cedula)}
              onChange={(e) => {
                setCedula(limpiarCedula(e.target.value).slice(0, 11));
                if (cedulaMal) setCedulaMal(false);
              }}
              placeholder="000-0000000-0"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={cedulaMal || undefined}
              aria-describedby={cedulaMal ? "cedula-pendiente-error" : undefined}
              className="mt-1.5 h-11 bg-canvas font-mono tabular-nums"
            />
            <ErrorCampo id="cedula-pendiente-error" className="mt-1.5">{cedulaMal ? MENSAJE_CEDULA : ""}</ErrorCampo>
          </div>
          {error && (
            <Alert variant="aviso" className="px-3.5 py-2.5 text-xs leading-relaxed">
              {error}
            </Alert>
          )}
          <Button
            type="submit"
            disabled={cargando}
            className="h-11 w-full bg-brand-600 hover:bg-brand-700"
          >
            Completar el registro
            </Button>
          </form>
        </Card>
      )}

      {(paso === "codigo" || paso === "registrando") && (
        <Card asChild className="p-5">
          <form onSubmit={verificar} className="space-y-4">
          <p className="text-sm leading-relaxed text-ink-soft">
            Revisa el correo que enviamos a{" "}
            <span className="font-medium text-ink">{email}</span>.
          </p>
          <ul className="space-y-1.5 text-xs leading-relaxed text-ink-soft">
            <li className="flex gap-2">
              <span aria-hidden className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-sello-600" />
              <span>
                Si trae un <strong className="font-medium text-ink">código de 6 dígitos</strong>,
                escríbelo aquí.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-sello-600" />
              <span>
                Si trae un <strong className="font-medium text-ink">enlace</strong>, no lo
                pulses: mantén pulsado (o clic derecho), «Copiar dirección», y pégala aquí.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-sello-600" />
              <span>
                <strong className="font-medium text-ink">¿Ya lo pulsaste</strong> y quedaste
                en una página que no carga (<span className="font-mono">localhost:3000</span>)?
                Copia la dirección de la barra del navegador y pégala aquí: esa
                dirección ya trae tu sesión y sirve igual.
              </span>
            </li>
          </ul>
          {/*
            `one-time-code` es lo que hace que iOS ofrezca el código del SMS o
            del correo encima del teclado, que es la diferencia entre teclear
            seis cifras y tocar una vez. Y sin `autoCapitalize`/`autoCorrect`
            apagados, iOS pone en mayúscula la primera letra de una dirección
            pegada y la deja inservible.
          */}
          {/*
            Enter envía aunque sea un área de texto: un código o una dirección
            pegada no llevan saltos de línea.
          */}
          <Textarea
            id="registro-codigo"
            name="codigo"
            rows={codigo.length > 40 ? 3 : 1}
            value={codigo}
            onChange={(e) => {
              setCodigo(e.target.value);
              if (codigoMal) setCodigoMal(null);
            }}
            onKeyDown={enviarConEnter}
            placeholder="000000 — o pega aquí la dirección del correo"
            autoComplete="one-time-code"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Código de verificación o enlace del correo"
            aria-invalid={codigoMal ? true : undefined}
            aria-describedby={codigoMal ? "registro-codigo-error" : undefined}
            className="min-h-11 resize-none bg-canvas px-3 py-3 font-mono tabular-nums"
          />
          <ErrorCampo id="registro-codigo-error">{codigoMal ?? ""}</ErrorCampo>
          {error && (
            <Alert variant="aviso" className="px-3.5 py-2.5 text-xs leading-relaxed">
              {error}
            </Alert>
          )}
          <Button
            type="submit"
            disabled={cargando || paso === "registrando"}
            className="h-11 w-full bg-brand-600 hover:bg-brand-700"
          >
            {paso === "registrando"
              ? "Registrando…"
              : cargando
                ? "Verificando…"
                : "Verificar y registrar"}
          </Button>
          <Button
            type="button"
            variant="link"
            onClick={() => { setPaso("datos"); setCodigo(""); setCodigoMal(null); setError(null); }}
            // Es la puerta de atrás del paso más frágil del registro: 44 px.
            className="h-11 w-full text-xs font-medium text-ink-soft hover:text-ink"
          >
            Cambiar cédula o correo
            </Button>
          </form>
        </Card>
      )}

      <Alert className="mt-4 flex items-start gap-2.5 bg-canvas/60 p-3.5">
        <IconShield className="mt-0.5 h-4 w-4 shrink-0 text-alerta-600" />
        <p className="text-xs leading-relaxed text-ink-soft">
          No guardamos tu cédula en claro: se convierte en un código irreversible
          con una clave que vive solo en la base de datos. Tampoco guardamos tu
          nombre. Puedes borrar tu registro y tus votos cuando quieras.
        </p>
      </Alert>
    </div>
  );
}

/**
 * La vía verificada. Solo aparece cuando el cliente OAuth existe
 * (`cuentaUnicaHabilitada`): un botón que no puede llevar a ningún sitio no
 * se muestra apagado, se omite.
 */
function CuentaUnica({
  onClick,
  cargando,
  error,
  className,
}: {
  onClick: () => void;
  cargando: boolean;
  error: string | null;
  className?: string;
}) {
  return (
    <Card className={cn("p-5", className)}>
      <p className="rotulo text-ink-soft">Cuenta Única · OGTIC</p>
      <CardTitle className="mt-1.5">¿Tienes Cuenta Única?</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Es la identidad digital ciudadana del Estado: ya comprobó tu cédula contra
        el padrón y que eres tú. Al verificar, este sitio no guarda tu cédula ni
        tu nombre: si Cuenta Única incluye la cédula, se convierte en el mismo
        código irreversible que en el registro por correo; si no, guardamos el
        código de tu identificador. Tu voto cuenta como identidad verificada. Te
        lleva a cuentaunica.gob.do y vuelves aquí.
      </p>
      {error && <p className="mt-2 text-xs font-medium text-alerta-700">{error}</p>}
      <Button
        type="button"
        variant="outline"
        onClick={onClick}
        disabled={cargando}
        className="mt-3 h-11 w-full border-brand-500 bg-surface text-brand-700"
      >
        {cargando ? "Abriendo Cuenta Única…" : "Verificar con Cuenta Única"}
      </Button>
    </Card>
  );
}

/**
 * La salida del formulario. Era un enlace de 16 px de alto pegado al borde
 * superior del contenido: el objetivo táctil de una migaja de pan cuenta
 * tanto como el de un botón, porque es lo que se pulsa cuando uno se arrepiente
 * a mitad del registro. El texto no crece; crece su área.
 */
function VolverCongreso() {
  return (
    <Link
      href="/democracia"
      className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink sm:min-h-0 sm:px-0"
    >
      <IconArrowLeft className="h-3.5 w-3.5" />
      Democracia Legislativa
    </Link>
  );
}

function Campo({
  etiqueta,
  hint,
  hintError,
  error,
  children,
}: {
  etiqueta: string;
  hint?: string;
  hintError?: boolean;
  /** Fuera de la `label`: dentro, el lector lo leería dos veces (nombre y descripción). */
  error?: React.ReactNode;
  children: React.ReactNode;
}) {
  /*
    La etiqueta y la pista compartían línea con `justify-between`, y a 390 px
    «Correo electrónico» y «Te enviaremos un código de un solo uso» no caben:
    las dos se partían en dos renglones cruzados y el campo quedaba debajo de
    un revoltijo. Con `flex-wrap` la pista baja entera a su propio renglón
    cuando no cabe, y comparte línea cuando sí.
  */
  return (
    <div>
      <label className="block">
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="text-xs font-semibold text-ink">{etiqueta}</span>
          {hint && (
            <span className={cn("text-xs", hintError ? "text-alerta-700" : "text-ink-soft")}>{hint}</span>
          )}
        </div>
        {children}
      </label>
      {error}
    </div>
  );
}

const MENSAJE_CEDULA = "Revisa la cédula: son 11 dígitos, como 001-0000000-0.";
