import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { leerPublicado, NOMBRE_TIPO, type EntradaPublicada } from "@/lib/espacios";
import { formatFecha } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EstadoVacio } from "@/components/estado-vacio";
import { Rotulo } from "@/components/papel";
import { IconArrowRight, IconExternal, IconLink } from "@/components/icons";

/*
  Un proyecto publicado por un lector (docs/PLAN-ESPACIOS.md). Se sirve en el
  servidor para que se pueda compartir y leer sin cuenta y sin JavaScript. Lo
  que dice es del autor —su selección, sus notas—; lo que enlaza son las
  fichas vivas de la plataforma, que leen cada cifra de su fuente.
*/

const cargar = cache((slug: string) => leerPublicado(slug));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await cargar(slug);
  if (r.estado !== "ok") return { title: "Investigación publicada", robots: { index: false, follow: true } };
  return {
    title: r.proyecto.titulo,
    description: r.proyecto.descripcion.slice(0, 200) || `Una investigación de ${r.proyecto.autor} sobre registros del Estado dominicano.`,
    alternates: { canonical: `/p/${slug}` },
    // Es la obra de un lector, no de la plataforma: se comparte, no se indexa.
    robots: { index: false, follow: true },
  };
}

export default async function PublicadoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await cargar(slug);

  if (r.estado === "caida") {
    return (
      <EstadoVacio
        como="h1"
        variante="caida"
        className="mx-auto max-w-2xl"
        titulo="No pudimos abrir esta investigación"
        accion={<Button asChild variant="secondary"><Link href="/buscar">Buscar en la plataforma</Link></Button>}
      >
        El servidor de cuentas no respondió. La investigación sigue ahí: vuelve a intentarlo en un momento.
      </EstadoVacio>
    );
  }
  if (r.estado === "no-existe") {
    return (
      <EstadoVacio
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="Esta investigación no está publicada"
        accion={<Button asChild variant="secondary"><Link href="/">Ir a la portada</Link></Button>}
      >
        Puede que su autor la haya retirado, o que la dirección tenga un error.
      </EstadoVacio>
    );
  }

  const p = r.proyecto;
  const porId = new Map(p.entradas.map((e) => [e.id, e]));
  return (
    <article className="mx-auto max-w-3xl space-y-5">
      <header>
        <Rotulo>Investigación publicada · por {p.autor} · actualizada el {formatFecha(p.actualizado)}</Rotulo>
        <h1 className="font-display mt-1 text-3xl text-ink sm:text-4xl">{p.titulo}</h1>
        {p.descripcion && <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink">{p.descripcion}</p>}
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          La selección y las notas son de su autor, no de Socrático ni del Estado. Cada registro
          abre su ficha, que lee la cifra de su fuente oficial.
        </p>
      </header>

      <Card as="section" className="p-5">
        <CardTitle>
          Registros <span className="font-mono text-sm font-normal tabular-nums text-ink-soft">{p.entradas.length}</span>
        </CardTitle>
        {p.entradas.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">Todavía no tiene registros.</p>
        ) : (
          <ul className="mt-2 divide-y divide-hairline">
            {p.entradas.map((e) => (
              <li key={e.id} className="py-3">
                <Registro e={e} />
                <p className="mt-0.5">
                  <Badge variant="neutro">{NOMBRE_TIPO[e.tipo]}</Badge>
                </p>
                {e.nota && (
                  <p className="mt-2 whitespace-pre-line border-l-2 border-hairline pl-3 text-sm leading-relaxed text-ink">{e.nota}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {p.enlaces.length > 0 && (
        <Card as="section" className="p-5">
          <CardTitle>Lo que los une</CardTitle>
          <ul className="mt-2 divide-y divide-hairline">
            {p.enlaces.map((l, k) => {
              const a = porId.get(l.desde);
              const b = porId.get(l.hasta);
              if (!a || !b) return null;
              return (
                <li key={k} className="flex items-start gap-2 py-3 text-sm leading-relaxed">
                  <IconLink className="mt-1 h-4 w-4 shrink-0 text-ink-soft" />
                  <p>
                    <Registro e={a} />
                    <span className="mx-1.5 text-ink-soft">—{l.nota ? ` ${l.nota} ` : " "}→</span>
                    <Registro e={b} />
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="max-w-md text-sm leading-relaxed text-ink-soft">
          ¿Investigas algo del Estado? Con una cuenta guardas registros, los enlazas, los anotas
          y lo publicas así.
        </p>
        <Button asChild>
          <Link href="/cuenta">
            Crear tu cuenta
            <IconArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </Card>
    </article>
  );
}

function Registro({ e }: { e: EntradaPublicada }) {
  const clase = "font-medium text-ink hover:text-brand-700 hover:underline";
  return e.href.startsWith("https://") ? (
    <a href={e.href} target="_blank" rel="noopener noreferrer" className={clase}>
      {e.titulo}
      <IconExternal className="ml-1 inline h-3.5 w-3.5 align-[-2px] text-ink-soft" />
    </a>
  ) : (
    <Link href={e.href} className={clase}>
      {e.titulo}
    </Link>
  );
}
