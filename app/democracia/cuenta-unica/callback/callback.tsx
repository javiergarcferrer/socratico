"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { IconArrowLeft, IconCheck, IconShield } from "@/components/icons";
import { FUNCION_VINCULAR, borrarFlujo, leerFlujo } from "../cliente";

/**
 * Vuelta del flujo de Cuenta Única. En orden:
 *   1. `state` debe ser el de un flujo iniciado en este navegador (y no vencido).
 *   2. Hace falta la sesión de votante: Cuenta Única verifica identidad,
 *      Supabase sigue siendo la sesión.
 *   3. El código se canjea por el ID token en `../token` (transporte).
 *   4. El ID token va a la Edge Function, que lo verifica —firma, emisor,
 *      cliente, vigencia y el `nonce` atado a esta sesión— y vincula.
 * Cada fallo dice qué pasó y qué hacer; ninguno se disfraza de otro.
 */
type Estado =
  | { fase: "verificando" }
  | { fase: "listo"; repetido: boolean }
  | { fase: "error"; mensaje: string };

const ERRORES: Record<string, string> = {
  identidad_en_uso:
    "Esa Cuenta Única ya está vinculada a otro registro de este sitio. Cada persona vota una sola vez.",
  cedula_declarada_en_uso:
    "La cédula que Cuenta Única confirmó ya la escribió otra persona en un registro por correo, sin verificar. No podemos vincularla hasta resolverlo; escríbenos desde la página de seguridad.",
  token_invalido:
    "Cuenta Única devolvió una credencial que no pudimos verificar. Vuelve a intentarlo desde el registro.",
  sesion_requerida:
    "Tu sesión de votante no está abierta en este navegador. Entra con tu correo en el registro y vuelve a verificar.",
  cliente_no_configurado:
    "La verificación con Cuenta Única todavía no está activa en este sitio.",
  sujeto_invalido:
    "Cuenta Única no devolvió un identificador utilizable. Vuelve a intentarlo.",
  emisor_no_contesto: "Cuenta Única no contestó a tiempo. Vuelve a intentarlo en un momento.",
};

export default function Callback() {
  const params = useSearchParams();
  const [estado, setEstado] = useState<Estado>({ fase: "verificando" });
  // El efecto corre dos veces en desarrollo (modo estricto); el canje, una.
  const corrido = useRef(false);

  useEffect(() => {
    if (corrido.current) return;
    corrido.current = true;
    const fallar = (mensaje: string) => setEstado({ fase: "error", mensaje });

    (async () => {
      const errorOAuth = params.get("error");
      if (errorOAuth) {
        borrarFlujo();
        fallar(
          errorOAuth === "access_denied"
            ? "Cancelaste la verificación en Cuenta Única. No se cambió nada en tu registro."
            : `Cuenta Única no completó la verificación y no se cambió nada en tu registro. Vuelve a intentarlo desde el registro (código del emisor: ${errorOAuth.replace(/[^a-z_]/gi, "")}).`,
        );
        return;
      }

      const code = params.get("code");
      const state = params.get("state");
      const flujo = leerFlujo();
      if (!code || !state || !flujo || flujo.estado !== state) {
        fallar(
          "Esta respuesta no corresponde a una verificación iniciada en este navegador, o pasaron más de diez minutos. Vuelve a empezar desde el registro.",
        );
        return;
      }
      borrarFlujo();

      const { data: sesion } = await supabase().auth.getSession();
      if (!sesion.session) {
        fallar(ERRORES.sesion_requerida);
        return;
      }

      const canje = await fetch("/democracia/cuenta-unica/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          code_verifier: flujo.verificador,
          redirect_uri: flujo.redirectUri,
        }),
      })
        .then((r) => r.json() as Promise<{ ok: boolean; id_token?: string; error?: string }>)
        .catch(() => null);
      if (!canje?.ok || !canje.id_token) {
        fallar(ERRORES[canje?.error ?? ""] ?? "No se pudo completar el canje con Cuenta Única. Vuelve a intentarlo.");
        return;
      }

      const { data, error } = await supabase().functions.invoke(FUNCION_VINCULAR, {
        body: { id_token: canje.id_token },
      });
      const r = (data ?? null) as { ok?: boolean; estado?: string; error?: string } | null;
      if (error || !r || r.ok === false) {
        fallar(ERRORES[r?.error ?? ""] ?? "No se pudo vincular tu identidad. Vuelve a intentarlo en un momento.");
        return;
      }
      setEstado({ fase: "listo", repetido: r.estado === "ya_vinculado" });
    })();
  }, [params]);

  return (
    <div className="mx-auto max-w-lg">
      <Link
        href="/democracia/registro"
        className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink sm:min-h-0 sm:px-0"
      >
        <IconArrowLeft className="h-3.5 w-3.5" />
        Registro
      </Link>

      <header className="mb-5 mt-3 sm:mt-4">
        <div className="flex items-center gap-2 rotulo text-ink-soft">
          <IconShield className="h-4 w-4 shrink-0" />
          Cuenta Única · OGTIC
        </div>
        <h1 className="font-display mt-2 text-3xl leading-[1.1] text-ink sm:text-4xl">
          Verificación con Cuenta Única
        </h1>
      </header>

      {estado.fase === "verificando" && (
        <Card className="p-5" role="status" aria-busy="true">
          <p className="text-sm text-ink">Comprobando la respuesta de Cuenta Única…</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            La credencial se verifica dentro de Supabase, junto a la base de datos,
            y se vincula a tu sesión. No guardamos tu cédula ni tu nombre.
          </p>
        </Card>
      )}

      {estado.fase === "listo" && (
        <Alert variant="firma" role="status" className="border-brand-200/60 bg-brand-50/70 p-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-500 text-canvas">
            <IconCheck className="h-6 w-6" />
          </span>
          <CardTitle className="mt-3 text-lg">
            {estado.repetido ? "Ya estabas verificado" : "Identidad verificada"}
          </CardTitle>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-soft">
            Tu registro de votante queda vinculado a tu identidad de Cuenta Única.
            Guardamos solo un código irreversible: de tu cédula si Cuenta Única la
            incluyó, y si no, de tu identificador. Nunca la cédula en claro.
          </p>
          <Button asChild size="lg" className="mt-4 w-full bg-brand-600 hover:bg-brand-700 sm:w-auto">
            <Link href="/congreso">Ir a las iniciativas</Link>
          </Button>
        </Alert>
      )}

      {/*
        Pantalla de una sola acción: el botón ocupa el ancho en el teléfono
        porque no compite con nada, y desde `sm` vuelve a su tamaño natural.
      */}
      {estado.fase === "error" && (
        <Alert variant="aviso" className="border-alerta-100/60 bg-alerta-50/60 p-5">
          <p className="text-sm font-medium text-ink">No se completó la verificación</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{estado.mensaje}</p>
          <Button asChild variant="secondary" size="lg" className="mt-4 w-full sm:w-auto">
            <Link href="/democracia/registro">Volver al registro</Link>
          </Button>
        </Alert>
      )}

      <p className="mt-4 text-xs leading-relaxed text-ink-soft">
        Herramienta independiente y no oficial. Cuenta Única es un servicio de la
        OGTIC; lo que este piloto guarda de él no permite recuperar tu cédula.
      </p>
    </div>
  );
}
