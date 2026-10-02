import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { leerPublicado, VERBO_ENLACE } from "@/lib/espacios";
import { formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EstadoVacio } from "@/components/estado-vacio";
import Conversacion from "@/components/espacios/conversacion";
import ExportarFtm from "@/components/espacios/exportar-ftm";
import LineaDeTiempo from "@/components/espacios/linea-tiempo";
import NarrativaLectura, { narrativaConTexto } from "@/components/espacios/narrativa-lectura";
import { EnlaceRegistro, MarcaTipo } from "@/components/espacios/registro";
import TableroDiferido from "@/components/espacios/tablero-diferido";
import { Rotulo } from "@/components/papel";
import { IconArrowRight, IconLink } from "@/components/icons";

/*
  Un proyecto publicado por un lector (docs/INFRAESTRUCTURA.md §10). Se sirve en el
  servidor para que se pueda compartir y leer sin cuenta y sin JavaScript. Lo
  que dice es del autor —su selección, sus notas, su narración, sus fechas—;
  lo que enlaza son las fichas vivas de la plataforma, que leen cada cifra de
  su fuente.

  El orden es el de entender (docs/INFRAESTRUCTURA.md §11): los datos responden y el
  lector concluye. Primero cómo se conectan las piezas (tablero), en qué
  orden pasaron (línea de tiempo), cada pieza con su nota y lo que las une;
  después lo que sostiene el autor (narración), y al final la conversación.
  El tablero es lo único que necesita JavaScript, y lo que dice está entero
  en las listas.
*/

const cargar = cache((slug: string) => leerPublicado(slug));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await cargar(slug);
  if (r.estado !== "ok") return { title: "Proyecto publicado", robots: { index: false, follow: false } };
  return {
    title: r.proyecto.titulo,
    description: r.proyecto.descripcion.slice(0, 200) || `Un proyecto de ${r.proyecto.autor} sobre registros del Estado dominicano.`,
    alternates: { canonical: `/p/${slug}` },
    // Es la obra de un lector, no de la plataforma: se comparte, no se indexa,
    // y sus enlaces no llevan el aval del sitio.
    robots: { index: false, follow: false },
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
        titulo="No pudimos abrir este proyecto"
        accion={<Button asChild variant="secondary"><Link href="/buscar">Buscar en la plataforma</Link></Button>}
      >
        El servidor de cuentas no respondió, así que no sabemos si sigue publicado. Vuelve a intentarlo en un momento; los registros que reúne siguen en sus fichas.
      </EstadoVacio>
    );
  }
  if (r.estado === "no-existe") {
    return (
      <EstadoVacio
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="Este proyecto no está publicado"
        accion={<Button asChild variant="secondary"><Link href="/">Ir a la portada</Link></Button>}
      >
        Puede que su autor lo haya retirado, o que la dirección tenga un error.
      </EstadoVacio>
    );
  }

  const p = r.proyecto;
  const porId = new Map(p.entradas.map((e) => [e.id, e]));
  const hayNarrativa = narrativaConTexto(p.narrativa);
  const fechados = p.entradas.filter((e) => e.fecha).length;
  const lazos = p.enlaces.map((l, k) => ({ ...l, id: `l${k}` }));
  return (
    <article className="mx-auto max-w-3xl space-y-5">
      <header>
        <Rotulo>Proyecto publicado · por {p.autor} · actualizado el {formatFecha(p.actualizado)}</Rotulo>
        <h1 className="font-display mt-1 text-3xl text-ink sm:text-4xl">{p.titulo}</h1>
        {p.descripcion && <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink">{p.descripcion}</p>}
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          La selección, el texto, las fechas, lo que une a cada registro y las notas son
          afirmaciones de su autor, no de Socrático ni del Estado: una flecha que dice «pagó a» es
          lo que él sostiene, no un dato verificado. «{p.autor}» es
          el nombre de firma que escribió quien lo publica: Socrático no lo verifica. Cada registro
          abre su ficha, que lee la cifra de su fuente oficial.
        </p>
      </header>

      {p.entradas.length > 1 && p.enlaces.length > 0 && (
        <Card as="section" className="space-y-3 p-5">
          <CardTitle>El tablero</CardTitle>
          <p className="text-xs leading-relaxed text-ink-soft">
            Como lo armó su autor. Cada flecha se lee con su verbo; lo mismo está en «Lo que los une», más abajo.
          </p>
          {/* Al tablero solo lo que pinta: las notas ya viajan una vez, con la lista. */}
          <TableroDiferido
            tarjetas={p.entradas.map(({ id, tipo, titulo, href, fecha, x, y }) => ({ id, tipo, titulo, href, fecha, x, y }))}
            lazos={lazos}
            ajeno
          />
        </Card>
      )}

      {fechados > 0 && (
        <Card as="section" className="space-y-3 p-5">
          <CardTitle>
            En orden <span className="font-mono text-sm font-normal tabular-nums text-ink-soft">{fechados}</span>
          </CardTitle>
          <p className="text-xs leading-relaxed text-ink-soft">
            Las fechas las anotó su autor: cuándo pasó lo que le importa de cada registro. La ficha dice la suya.
          </p>
          <LineaDeTiempo hitos={p.entradas} ajeno />
        </Card>
      )}

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
                <EnlaceRegistro titulo={e.titulo} href={e.href} ajeno />
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                  <MarcaTipo tipo={e.tipo} />
                  {e.fecha && <span className="font-mono">{formatFecha(e.fecha)}</span>}
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
                  {/* Los títulos los escribe el lector: uno sin espacios no empuja la fila fuera del papel. */}
                  <p className="min-w-0 break-words">
                    <EnlaceRegistro titulo={a.titulo} href={a.href} ajeno />
                    <span className="mx-1.5 text-brand-700">{VERBO_ENLACE[l.tipo]} <span aria-hidden="true">→</span></span>
                    <EnlaceRegistro titulo={b.titulo} href={b.href} ajeno />
                    {l.nota && <span className="block text-xs text-ink-soft">{l.nota}</span>}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {hayNarrativa && p.narrativa && (
        <Card as="section" className="p-5">
          <CardTitle>Lo que sostiene su autor</CardTitle>
          <div className="mt-2">
            <NarrativaLectura doc={p.narrativa} registros={p.entradas} ajeno />
          </div>
        </Card>
      )}

      {p.entradas.length > 0 && (
        <Card as="section" className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="max-w-md text-sm leading-relaxed text-ink-soft">
            Los registros, las notas y los enlaces de este proyecto en un archivo JSON de formato
            abierto, para abrirlo en otras herramientas.
          </p>
          <ExportarFtm titulo={p.titulo} entradas={p.entradas} enlaces={p.enlaces} variant="secondary" />
        </Card>
      )}

      <Conversacion referencia={{ tipo: "investigacion", ref: slug, titulo: p.titulo, href: `/p/${slug}` }} />

      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="max-w-md text-sm leading-relaxed text-ink-soft">
          ¿Trabajas en un tema del Estado? Con una cuenta guardas registros, los enlazas, los anotas
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
