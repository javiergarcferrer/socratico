import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Entrar from "@/components/espacios/entrar";
import { Card, CardTitle } from "@/components/ui/card";
import { Rotulo } from "@/components/papel";

export const metadata: Metadata = {
  title: "Tu cuenta",
  description:
    "Entra con tu correo para guardar registros del Estado, armar investigaciones que los enlacen, anotarlas, publicarlas y trabajarlas con otras personas.",
  alternates: { canonical: "/cuenta" },
  robots: { index: false, follow: true },
};

/**
 * Entrar o crear la cuenta (docs/PLAN-ESPACIOS.md). El formulario es de
 * cliente; lo que se guarda y lo que no se dice aquí, en el servidor, para que
 * se lea antes de dar el correo.
 */
export default async function CuentaPage({ searchParams }: { searchParams: Promise<{ volver?: string }> }) {
  const { volver } = await searchParams;
  return (
    <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1fr_20rem]">
      <div>
        <header className="mb-5">
          <Rotulo>Tu cuenta</Rotulo>
          <h1 className="font-display mt-1 text-3xl text-ink sm:text-4xl">¿Qué quieres seguirle al Estado?</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            Con una cuenta guardas lo que encuentras —una compra, una ley, un proveedor—,
            lo juntas en investigaciones que enlazan registros distintos, lo anotas, lo
            publicas o lo trabajas con otras personas, y ves qué cambió en cualquier
            dispositivo.
          </p>
        </header>
        <Suspense>
          <Entrar volver={volver ?? null} />
        </Suspense>
      </div>

      <aside className="space-y-4">
        <Card className="p-5">
          <CardTitle className="text-sm">Qué guardamos</CardTitle>
          <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-ink-soft">
            <li>Tu correo, para enviarte el código de entrada.</li>
            <li>El nombre con que firmas, si lo das.</li>
            <li>
              Lo que eliges guardar: <strong className="font-medium text-ink">la referencia</strong> al
              registro —su tipo, su número, su título y su enlace—, tus notas y tus enlaces.
              Una búsqueda guardada guarda el texto que buscaste.
            </li>
            <li>
              Lo que sigues, con la marca de cuándo lo miraste por última vez, para decirte
              qué cambió desde entonces.
            </li>
            <li>
              Los correos que invitas a una investigación, hasta que la acepten o retires la
              invitación.
            </li>
            <li>
              Si participas en la{" "}
              <Link href="/comunidad/normas" className="font-medium text-brand-700 hover:underline">
                conversación
              </Link>
              : tus comentarios (públicos, con tu nombre de firma), tus votos y tus denuncias (estos
              dos, privados), cuándo aceptaste las normas y, junto a lo que escribes, la huella
              cifrada de tu cédula —nunca la cédula—, que sirve para los topes de ritmo y para que
              una suspensión no se esquive con otra cuenta.
            </li>
            <li>
              Lo que el servicio de cuentas (Supabase) registra cada vez que inicias sesión: fecha,
              dirección IP y navegador.
            </li>
          </ul>
          <CardTitle className="mt-4 text-sm">Qué no</CardTitle>
          <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-ink-soft">
            <li>
              Ninguna cifra del Estado: cada registro se sigue leyendo de su fuente oficial,
              igual que para quien no tiene cuenta.
            </li>
            <li>Ni contraseña ni lo que buscas, salvo la búsqueda que tú guardes.</li>
            <li>
              La cédula solo la pide el{" "}
              <Link href="/democracia/seguridad" className="font-medium text-brand-700 hover:underline">
                piloto de voto
              </Link>
              , y nunca en claro.
            </li>
          </ul>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-soft">
            Lo tuyo es privado hasta que lo publiques o invites a alguien. Herramienta
            independiente y no oficial —{" "}
            <Link href="/seguridad" className="font-medium text-brand-700 hover:underline">
              cómo tratamos los datos
            </Link>
            .
          </p>
        </Card>
      </aside>
    </div>
  );
}
