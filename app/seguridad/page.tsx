import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardTitle } from "@/components/ui/card";
import { IconArrowRight, IconCheck, IconShield } from "@/components/icons";

export const metadata: Metadata = {
  alternates: { canonical: "/seguridad" },
  title: "Seguridad y cumplimiento",
  description:
    "Postura de seguridad, privacidad y cumplimiento normativo de Socrático: minimización de datos según la Ley 172-13, acceso a información pública bajo la Ley 200-04 y estándares NORTIC de la OGTIC.",
};

export const revalidate = 3600;

export default function SeguridadPlataformaPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <div className="flex items-center gap-2 rotulo text-brand-700">
          <IconShield className="h-4 w-4" />
          Seguridad y cumplimiento
        </div>
        <h1 className="font-display mt-2 text-3xl text-ink sm:text-4xl">
          ¿Cómo cuidamos los datos y a quién le rendimos cuentas?
        </h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft sm:text-sm">
          Socrático es una herramienta independiente y no oficial, pero se
          construye con los estándares que una institución del Estado exigiría.
          Esta página declara la postura de seguridad, privacidad y cumplimiento
          de toda la plataforma, con el marco normativo dominicano como
          referencia.
        </p>
      </header>

      {/* Los tres marcos */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Marco norma="Ley 172-13" titulo="Protección de datos personales">
          Minimización, cifrado y derecho al olvido.
        </Marco>
        <Marco norma="Ley 200-04" titulo="Acceso a la información pública">
          Fuentes oficiales, sin evadir bloqueos.
        </Marco>
        <Marco norma="NORTIC (OGTIC)" titulo="Estándares web del Estado">
          A2 de seguridad y E1 de datos abiertos.
        </Marco>
      </div>

      <div className="mt-6 space-y-4">
        <Medida titulo="Las superficies de inteligencia no guardan datos personales">
          Licitaciones, Congreso, Normativa, Nómina y los indicadores del panorama
          se leen <strong>en vivo</strong> de fuentes oficiales y se cachean unos
          minutos; no hay base de datos ni rastreo de quién consulta, y se leen
          igual con cuenta que sin ella. La forma más fuerte de proteger un dato
          personal es no recolectarlo, y en toda esta parte de la plataforma
          sencillamente no existe.
        </Medida>

        <Medida titulo="Tu cuenta guarda lo que eliges, nunca los datos del Estado">
          La cuenta es opcional y se abre con un código al correo; la contraseña
          también es opcional, se crea después, y el servicio de cuentas guarda
          solo su huella cifrada (bcrypt), nunca la contraseña. Guarda tu correo, el nombre con que firmas si lo das, y lo
          que eliges: la <strong>referencia</strong> a cada registro —tipo,
          número, título, enlace—, tus notas, tus enlaces y lo que sigues. Ninguna
          cifra del Estado entra en la base: cada registro se sigue leyendo de su
          fuente. Lo tuyo es privado a nivel de base de datos hasta que lo
          publiques o invites a alguien, y quien lee lo publicado no ve tu correo
          ni quién colabora.{" "}
          <Link href="/cuenta" className="font-medium text-brand-700 hover:underline">
            Qué guarda la cuenta
          </Link>
          .
        </Medida>

        <Medida titulo="La nómina se publica sin nombres ni identificadores">
          El explorador de nómina estatal trabaja con plaza, cargo, área y sueldo
          por institución — nunca con el nombre del servidor público. Es
          información de gasto público, no de personas.
        </Medida>

        <Medida titulo="En Democracia, la cédula se cifra y el voto es privado">
          El voto aplica minimización estricta: la
          cédula se convierte en un código irreversible con una clave que{" "}
          <strong>vive solo dentro de la base de datos</strong>, el voto es
          privado a nivel de base de datos (no solo de interfaz), y solo se
          publican los totales agregados. Cada persona puede borrar su registro y
          sus votos cuando quiera (derecho al olvido de la Ley 172-13).{" "}
          <Link href="/democracia/seguridad" className="font-medium text-brand-700 hover:underline">
            Ver el dossier completo del voto
          </Link>
          .
        </Medida>

        <Medida titulo="Leemos las fuentes con respeto y de forma identificable">
          Toda petición lleva un agente identificable, respeta el{" "}
          <code className="rounded bg-canvas px-1 py-0.5 font-mono text-[0.85em]">robots.txt</code>{" "}
          de cada sitio, no evade bloqueos ni challenges, y jamás toca rutas de
          autenticación ajena. Cuando una fuente nos bloquea, lo declaramos en{" "}
          <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
            el estado de las fuentes
          </Link>{" "}
          en vez de forzarla. El acceso se apoya en la Ley 200-04 de libre acceso
          a la información pública.
        </Medida>

        <Medida titulo="La aplicación no guarda secretos">
          El sitio solo porta claves publicables, pensadas para viajar en el
          navegador; la protección real vive en la base de datos y en la
          configuración del servidor. El material sensible nunca pasa por el
          código del sitio ni por el repositorio.
        </Medida>

        <Medida titulo="Transporte cifrado y despliegue reproducible">
          HTTPS de extremo a extremo, sin contenido mixto. Todo el código es
          auditable en el repositorio, incluidas las migraciones de base de datos
          y las reglas de acceso, de modo que cualquiera puede verificar estas
          afirmaciones en lugar de creerlas.
        </Medida>
      </div>

      {/*
        La hoja entera es el enlace, así que el objetivo táctil es la tarjeta:
        `items-start` mantiene el sello arriba cuando el título se parte en dos
        líneas a 390 px, donde `items-center` lo dejaba a media altura.
      */}
      <Card asChild className="mt-6 hover:bg-canvas/60">
        <Link
          href="/democracia/seguridad"
          className="flex items-start gap-4 px-5 py-4 sm:items-center"
        >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
          <IconShield className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">
            Dossier de seguridad del voto ciudadano
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">
            El detalle técnico de cómo se protege la identidad y el voto en
            Democracia Legislativa.
          </p>
        </div>
          <IconArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-soft sm:mt-0" />
        </Link>
      </Card>

      <p className="mt-6 text-[13px] leading-relaxed text-ink-soft sm:text-xs">
        Herramienta independiente y no oficial, sin afiliación con el Estado
        dominicano. Marco normativo de referencia: Ley 172-13 (protección de
        datos personales), Ley 200-04 (libre acceso a la información pública) y
        las normas NORTIC de la OGTIC sobre seguridad web (A2) y datos abiertos
        (E1). Para reportar una vulnerabilidad, abre un issue en el repositorio.
      </p>
    </div>
  );
}

function Marco({
  norma,
  titulo,
  children,
}: {
  norma: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="font-mono text-xs font-semibold text-ink">{norma}</div>
      <div className="mt-1.5 text-sm font-semibold text-ink">{titulo}</div>
      {/* En teléfono las tres tarjetas se apilan a ancho completo: cabe a 13 px. */}
      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft sm:text-xs">{children}</p>
    </Card>
  );
}

function Medida({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card as="section" className="p-5">
      <CardTitle className="flex items-start gap-2.5 text-base">
        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-valido-600 text-canvas">
          <IconCheck className="h-3.5 w-3.5" />
        </span>
        {titulo}
      </CardTitle>
      {/*
        Página larga de lectura: el cuerpo sube a 15 px en teléfono. La sangría
        bajo el sello se suelta a 390 px —28 px de los 326 disponibles son casi
        un diez por ciento de la columna— y vuelve desde `sm`, donde alinear el
        párrafo con el titular sí sobra ancho.
      */}
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft sm:pl-7 sm:text-sm">
        {children}
      </p>
    </Card>
  );
}
