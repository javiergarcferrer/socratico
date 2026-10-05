import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import type { Metadata } from "next";
import { IconArrowLeft, IconCheck, IconShield } from "@/components/icons";
import { cuentaUnicaHabilitada } from "@/app/democracia/cuenta-unica/cliente";

export const metadata: Metadata = {
  alternates: { canonical: "/democracia/seguridad" },
  title: "Seguridad y privacidad",
  description:
    "Cómo Democracia Legislativa protege la identidad y el voto: cédula cifrada con clave que no sale de la base, voto privado a nivel de base de datos, minimización de datos según la Ley 172-13.",
};

export const revalidate = 3600;

export default function SeguridadPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/democracia"
        className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink sm:min-h-0 sm:px-0"
      >
        <IconArrowLeft className="h-3.5 w-3.5" />
        Democracia Legislativa
      </Link>

      <header className="mb-6 mt-2 sm:mt-3">
        <div className="flex items-center gap-2 rotulo text-alerta-600">
          <IconShield className="h-4 w-4 shrink-0" />
          Dossier de seguridad y privacidad
        </div>
        {/*
          El titular va en la letra de titular como el resto de los h1 de la plataforma: era
          el único de la vertical escrito en sans, y una página que promete
          rigor no puede desafinar en su primera línea.
        */}
        <h1 className="font-display mt-2 text-3xl leading-[1.1] text-ink sm:text-4xl">
          Cómo protegemos tu identidad y tu voto
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          Un voto ciudadano solo vale si la gente confía en él. Estas son las
          medidas concretas, en lenguaje llano y verificables en el código. El
          principio rector es de la Ley 172-13 de protección de datos:
          recolectar lo mínimo, protegerlo bien y dejarte el control.
        </p>
      </header>

      <div className="space-y-4">
        <Medida titulo="Tu cédula nunca se guarda en claro">
          Al registrarte, tu cédula se convierte en un código irreversible
          (HMAC-SHA256) usando una clave secreta que <strong>vive solo dentro de
          la base de datos</strong> y que ninguna parte de la aplicación puede
          leer. Guardamos ese código, no tu cédula. Aunque alguien obtuviera la
          tabla de registros, no podría recuperar ninguna cédula ni probarlas por
          fuerza bruta sin esa clave.
        </Medida>

        <Medida titulo="No pedimos tu nombre ni datos personales">
          El registro necesita tu cédula (para un voto por persona) y un correo
          (para enviarte un código de un solo uso que confirma que el correo es
          tuyo). Nada más. No hay nombres, ni teléfono, ni dirección: minimización
          de datos por diseño.
        </Medida>

        <Medida titulo="Tu voto es privado a nivel de base de datos">
          Quién votó qué no lo puede leer nadie más que tú, y esa regla la impone
          la base de datos (Row Level Security), no solo la interfaz. Lo único
          público son los <strong>totales agregados</strong> (cuántos a favor,
          cuántos en contra), que salen de una vista que solo expone conteos y
          jamás filas individuales.
        </Medida>

        <Medida titulo="Un voto por cédula, verificado en el servidor">
          El dígito verificador de la cédula (algoritmo público de la JCE) y la
          unicidad se comprueban en el servidor, no en tu navegador. Una misma
          cédula no puede registrarse dos veces, y cada iniciativa admite un solo
          voto por persona, cambiable pero no acumulable.
        </Medida>

        <Medida titulo="Puedes borrar tu registro cuando quieras">
          Un botón en{" "}
          <Link href="/democracia/registro" className="font-medium text-brand-700 hover:underline">
            la página del registro
          </Link>
          , con tu sesión abierta, elimina tu registro y, en cascada, todos tus
          votos, sin dejar rastro reversible a tu cédula. Tus comentarios en la
          conversación se borran aparte, uno a uno. Es el derecho al olvido de la
          Ley 172-13, implementado como una función de la base.
        </Medida>

        {cuentaUnicaHabilitada() && (
          <Medida titulo="Identidad verificada con Cuenta Única, sin ver tu cédula">
            Si tienes Cuenta Única (la identidad digital ciudadana de la OGTIC),
            puedes verificar tu registro con ella. Cuenta Única ya comprobó tu
            cédula contra el padrón y que eres tú; este sitio recibe una
            credencial firmada que se verifica <strong>dentro de Supabase, junto
            a la base de datos</strong>, y guarda solo un código irreversible: de
            la cédula si la credencial la incluye, y si no, del identificador.
            Los totales dicen cuántos votos vienen de identidad verificada.
          </Medida>
        )}

        <Medida titulo="La aplicación no guarda secretos">
          El sitio solo lleva claves publicables, pensadas para viajar en el
          navegador; la protección real vive en la base de datos. El material
          sensible (la clave del cifrado de cédula) nunca sale de Postgres ni pasa
          por el código del sitio.
        </Medida>
      </div>

      <Alert variant="aviso" role="note" className="mt-8 border-alerta-100/50 bg-alerta-50/60 p-5">
        <CardTitle>Lo que este piloto todavía no hace</CardTitle>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Honestidad sobre los límites: con el registro por correo verificamos que
          la cédula sea <strong>válida</strong> y que controles un correo, pero no
          que la cédula sea <strong>tuya</strong>. La vía para eso es Cuenta
          Única, la identidad digital ciudadana de la OGTIC, que ya hace esa
          comprobación contra el padrón.{" "}
          {cuentaUnicaHabilitada()
            ? "Está activa: cualquier votante puede verificar su registro con ella, y los totales distinguen cuántos votos vienen de identidad verificada."
            : "La integración está construida y espera el cliente que emite la OGTIC; hasta entonces todos los registros cuentan como cédula declarada."}
        </p>
      </Alert>

      <p className="mt-6 text-xs leading-relaxed text-ink-soft">
        Herramienta independiente y no oficial, sin afiliación con el Estado
        dominicano. Marco normativo de referencia: Ley 172-13 (protección de
        datos personales) y las normas NORTIC de la OGTIC sobre seguridad web y
        datos abiertos.{" "}
        <Link href="/democracia" className="font-medium text-brand-700 hover:underline">
          Volver a Democracia Legislativa
        </Link>
        .
      </p>
    </div>
  );
}

/**
 * Una medida del dossier. En el teléfono el párrafo **no** se sangra bajo el
 * título: los 28 px de `pl-7` se comían casi el 10 % del ancho de línea y el
 * texto largo se descosía en renglones de cinco palabras. La marca de verificado
 * ya alinea la columna; la sangría solo sirve donde sobra ancho.
 */
function Medida({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card as="section" className="p-4 sm:p-5">
      <CardTitle className="flex items-start gap-2.5 text-base">
        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-valido-600 text-canvas">
          <IconCheck className="h-3.5 w-3.5" />
        </span>
        {titulo}
      </CardTitle>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft sm:pl-7">{children}</p>
    </Card>
  );
}
