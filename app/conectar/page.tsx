import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardTitle } from "@/components/ui/card";
import { Rotulo } from "@/components/papel";
import { IconExternal } from "@/components/icons";
import { enlace } from "@/lib/grafo";
import { DIRECCION_MCP, HERRAMIENTAS_MCP } from "@/lib/mcp-herramientas";

/**
 * Cómo se conecta un asistente de IA a la plataforma: la dirección del
 * servidor MCP (`/mcp`, `lib/mcp.ts`), los pasos en Claude y en ChatGPT, lo
 * que el asistente puede hacer y lo que no. Es también adonde va quien abre
 * `/mcp` en un navegador.
 */

export const metadata: Metadata = {
  title: "Conectar tu asistente de IA",
  description:
    "Conecta Claude, ChatGPT o cualquier cliente del Model Context Protocol a Socrático.do: busca, lee fichas y recorre el grafo de datos públicos del Estado dominicano, con la fuente y la fecha de cada dato. Sin cuenta ni clave.",
  alternates: { canonical: "/conectar" },
};

/** Un enlace a la guía de otro sitio: se dice que sale y se abre aparte. */
function Fuera({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-700 underline">
      {children}
      <IconExternal className="h-3.5 w-3.5 shrink-0" />
      <span className="sr-only"> (abre en otra pestaña)</span>
    </a>
  );
}

function Codigo({ children }: { children: string }) {
  return (
    <Card>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed text-ink">{children}</pre>
    </Card>
  );
}

export default function ConectarPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <Rotulo>Para asistentes de IA</Rotulo>
        <h1 className="mt-1.5 font-display text-3xl leading-tight text-ink sm:text-4xl">
          ¿Cómo le doy a mi asistente los datos de Socrático?
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
          Con una dirección. Claude, ChatGPT y cualquier programa que hable el Model Context Protocol (MCP) pueden
          buscar en la plataforma, leer sus fichas y recorrer{" "}
          <Link href={enlace.grafo()} className="text-brand-700 underline">
            el grafo
          </Link>
          , y citar la fuente y la fecha de cada dato. Sin cuenta ni clave: el asistente lee lo mismo que tú lees aquí,
          con las mismas reglas.
        </p>
      </header>

      <section aria-labelledby="direccion" className="space-y-3">
        <h2 id="direccion" className="font-display text-xl text-ink">
          ¿Cuál es la dirección?
        </h2>
        <Codigo>{DIRECCION_MCP}</Codigo>
        <p className="text-sm leading-relaxed text-ink-soft">
          Un servidor MCP remoto por HTTP, de solo lectura y sin autenticación. Si se abre en el navegador, trae aquí.
        </p>
      </section>

      <section aria-labelledby="como" className="space-y-3">
        <h2 id="como" className="font-display text-xl text-ink">
          ¿Cómo se conecta?
        </h2>
        <Card as="article" className="px-5 py-4 sm:px-6">
          <CardTitle as="h3">En Claude</CardTitle>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            En la web o en la aplicación de escritorio: <span className="text-ink">Customize › Connectors</span>, el
            botón «+» y <span className="text-ink">Add custom connector</span>; pega la dirección y confirma. El plan
            gratuito admite un conector personalizado. En Team y Enterprise lo agrega el dueño de la organización en{" "}
            <span className="text-ink">Organization settings › Connectors</span>, y cada miembro lo activa después.{" "}
            <Fuera href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp">
              La guía de Claude
            </Fuera>
          </p>
        </Card>
        <Card as="article" className="px-5 py-4 sm:px-6">
          <CardTitle as="h3">En ChatGPT</CardTitle>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            En la web, con Plus, Pro, Business, Enterprise o Education: activa el modo de desarrollador en{" "}
            <span className="text-ink">Settings › Security and login › Developer mode</span>, crea una aplicación con la
            dirección y elige <span className="text-ink">No authentication</span>. Las herramientas{" "}
            <code className="font-mono text-[13px] text-ink">search</code> y{" "}
            <code className="font-mono text-[13px] text-ink">fetch</code> tienen la forma que ChatGPT pide para
            investigar.{" "}
            <Fuera href="https://developers.openai.com/api/docs/guides/developer-mode">La guía de OpenAI</Fuera>
          </p>
        </Card>
        <Card as="article">
          <div className="px-5 pt-4 sm:px-6">
            <CardTitle as="h3">En Claude Code y otros clientes</CardTitle>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
              Desde la terminal, con Claude Code, una línea. En Cursor, VS Code y los demás, la dirección va como
              servidor HTTP en su configuración de MCP.
            </p>
          </div>
          <pre className="mt-3 overflow-x-auto border-t border-hairline px-5 py-3 font-mono text-[13px] leading-relaxed text-ink sm:px-6">
            {`claude mcp add --transport http socratico ${DIRECCION_MCP}`}
          </pre>
        </Card>
        <p className="text-sm leading-relaxed text-ink-soft">
          Los menús se nombran como los muestra cada programa en inglés al 30 de septiembre de 2026; cambian con sus
          versiones, y sus guías dicen el camino vigente.
        </p>
      </section>

      <section aria-labelledby="que-hace" className="space-y-3">
        <h2 id="que-hace" className="font-display text-xl text-ink">
          ¿Qué puede hacer el asistente?
        </h2>
        <Card as="section" aria-label="Herramientas del servidor">
          <dl className="divide-y divide-hairline">
            {HERRAMIENTAS_MCP.map((h) => (
              <div key={h.nombre} className="grid gap-x-4 gap-y-0.5 px-5 py-3 sm:grid-cols-[11rem_1fr] sm:px-6">
                <dt className="text-sm font-semibold text-ink">
                  {h.titulo}
                  <span className="block font-mono text-xs font-normal text-ink-soft">{h.nombre}</span>
                </dt>
                <dd className="text-sm leading-relaxed text-ink-soft">{h.llano}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <p className="text-sm leading-relaxed text-ink-soft">
          Cada respuesta dice de qué fuente sale y de qué fecha es su instantánea, y recuerda que Socrático es una
          herramienta independiente y no oficial.
        </p>
      </section>

      <section aria-labelledby="que-no" className="space-y-3">
        <h2 id="que-no" className="font-display text-xl text-ink">
          ¿Qué no hace?
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-ink-soft marker:text-ink-soft">
          <li>
            No escribe ni consulta en vivo: lee las instantáneas de la plataforma, y cada respuesta dice su fecha de
            corte. Lo que cambió después no está.
          </li>
          <li>
            No da cédulas, parentescos, biografías ni fotos. «Persona expuesta políticamente» se afirma solo mientras
            dura (Ley 155-17): un cargo obligado a declarar hoy o en los últimos tres años. Es una categoría legal, no
            una acusación.
          </li>
          <li>
            No consulta el rol de audiencias ni los expedientes del Registro Inmobiliario: se buscan aquí, por número
            exacto. Tampoco lee tu cuenta ni tus espacios.
          </li>
          <li>
            De los contratos de un proveedor, el detalle de un proceso o el texto de una ley, el asistente recibe el
            resumen del índice y la dirección de la ficha; la ficha entera sigue en la plataforma.
          </li>
        </ul>
      </section>

      <section aria-labelledby="maquinas" className="space-y-2 text-sm leading-relaxed text-ink-soft">
        <h2 id="maquinas" className="text-sm font-bold text-ink">
          ¿Y sin un asistente?
        </h2>
        <p>
          El mismo grafo se lee en RDF: cada ficha remite a su descripción en Turtle o JSON-LD, con el vocabulario de{" "}
          <Link href="/ontologia" className="text-brand-700 underline">
            la ontología
          </Link>
          . El explorador de{" "}
          <Link href={enlace.grafo()} className="text-brand-700 underline">
            el grafo
          </Link>{" "}
          explica cómo, y{" "}
          <Link href="/fuentes" className="text-brand-700 underline">
            el estado de las fuentes
          </Link>{" "}
          dice qué cubre cada una.
        </p>
      </section>
    </div>
  );
}
