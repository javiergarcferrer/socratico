import type { Metadata } from "next";
import Link from "next/link";
import { Rotulo } from "@/components/papel";
import { Card } from "@/components/ui/card";
import { NORMAS } from "@/components/espacios/normas";

export const metadata: Metadata = {
  title: "Normas de la conversación",
  description: "Qué se puede decir en la conversación de Socrático, quién puede comentar y cómo se modera.",
  alternates: { canonical: "/comunidad/normas" },
};

/**
 * Las normas, en público: las mismas que acepta quien comenta por primera vez
 * (`components/espacios/normas.ts`), más cómo se modera y qué se guarda.
 */
export default function NormasPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <Rotulo>Comunidad · normas</Rotulo>
        <h1 className="font-display mt-1 text-3xl text-ink sm:text-4xl">¿Cómo se conversa aquí?</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          Aquí se habla de dinero público y de personas con nombre y apellido que lo manejan. Por
          eso comentar pide más que votar: una cédula registrada y un nombre con que firmar.
        </p>
      </header>

      <Card as="section" className="p-5 sm:p-6">
        <ol className="space-y-4">
          {NORMAS.map((n, i) => (
            <li key={n.titulo} className="flex gap-3">
              <span className="w-5 shrink-0 font-mono text-sm tabular-nums text-ink-soft">{i + 1}.</span>
              <div>
                <p className="font-semibold text-ink">{n.titulo}</p>
                <p className="mt-0.5 text-[15px] leading-relaxed text-ink-soft">{n.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card as="section" className="space-y-3 p-5 text-[15px] leading-relaxed text-ink-soft sm:p-6">
        <h2 className="text-base font-semibold text-ink">Quién puede qué</h2>
        <p>
          <strong className="font-medium text-ink">Votar</strong> —decir que un registro importa,
          votar un comentario— lo hace cualquier cuenta con el correo verificado.
        </p>
        <p>
          <strong className="font-medium text-ink">Comentar</strong> lo hace quien registró su
          cédula una vez, la misma del{" "}
          <Link href="/democracia/seguridad" className="font-medium text-brand-700 hover:underline">
            piloto de voto
          </Link>
          . Hoy ese registro comprueba que la cédula es válida y que nadie más la usó; todavía no la
          coteja con la Junta Central Electoral. La cédula se guarda cifrada y nunca se muestra: en
          la conversación sale solo tu nombre de firma, que tú escribes y nadie verifica.
        </p>
        <p>
          <strong className="font-medium text-ink">Se modera después.</strong> Lo que publicas sale
          enseguida. Tres denuncias de cuentas distintas lo ocultan hasta que una persona lo revise;
          si rompe las normas se retira y queda marcado como retirado, y la cuenta puede ser
          suspendida. Cada decisión de moderación queda registrada.
        </p>
        <p>
          <strong className="font-medium text-ink">Lo tuyo es tuyo.</strong> Puedes borrar tus
          comentarios cuando quieras: el texto se elimina de verdad y queda la marca «borrado por su
          autor» para que las respuestas no pierdan el hilo.
        </p>
      </Card>

      <p className="px-1 text-xs leading-relaxed text-ink-soft">
        Herramienta independiente y no oficial. Lo que se dice en la conversación es de quien lo
        firma, no de Socrático ni del Estado.{" "}
        <Link href="/comunidad" className="font-medium text-brand-700 hover:underline">
          Ir a la comunidad
        </Link>
      </p>
    </div>
  );
}
