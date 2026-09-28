import Link from "next/link";
import type { Metadata } from "next";
import { getRanking, type RankingItem } from "@/lib/democracia";
import { IconArrowRight, IconShield } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Portada } from "@/components/portada";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EstadoVacio } from "@/components/estado-vacio";
import { enlace } from "@/lib/grafo";

export const metadata: Metadata = {
  alternates: { canonical: "/democracia" },
  title: "Democracia Legislativa",
  description:
    "Vota a favor o en contra sobre las iniciativas del Congreso Nacional dominicano y mira el apoyo ciudadano en tiempo real. Piloto independiente, registro por cédula, voto privado.",
};

export const revalidate = 60;

export default async function DemocraciaPage() {
  const ranking = await getRanking(40);
  const conVotos = ranking.filter((r) => r.total > 0);
  const totalVotos = conVotos.reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-6">
      {/* Hero */}
      {/*
        La portada de Democracia decía lo mismo que las demás y se pintaba de
        otra manera: su rótulo era una plaquita con icono en vez del epígrafe
        con el punto de sello, y su pregunta iba en sans. Ahora usa la misma
        pieza que el resto — la excepción de esta vertical es la base de datos,
        no la identidad.
      */}
      <Portada
        principal
        rotulo="Piloto ciudadano · independiente y no oficial"
        titulo="¿Qué opinas de lo que se legisla?"
        descripcion={
          <p className="sm:text-base">
            Vota a favor o en contra de las iniciativas reales que se discuten en
            la Cámara de Diputados y el Senado, y mira cómo opina la ciudadanía. Un
            registro por cédula para que cada voto cuente una vez; tu voto es
            secreto y solo se publican los totales.
          </p>
        }
      >
        {/*
          En el teléfono los dos botones ocupan el ancho: puestos en fila a su
          tamaño natural quedaban dos cajas desiguales arrimadas a la izquierda,
          y la acción principal de la vertical —registrarse— no merece un
          objetivo de 200 px en una pantalla de 390.
        */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
          <Button asChild size="lg" className="bg-brand-600 hover:bg-brand-700">
            <Link href="/democracia/registro">Regístrate para votar</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="tinta"
            className="bg-canvas/10 text-canvas ring-1 ring-inset ring-canvas/20 hover:bg-canvas/20"
          >
            <Link href="/congreso">Ver iniciativas</Link>
          </Button>
        </div>
      </Portada>

      {/* Cómo funciona / seguridad */}
      <section className="grid gap-4 sm:grid-cols-3">
        <Paso n={1} titulo="Regístrate">
          Con tu cédula y tu correo. La cédula se guarda cifrada, nunca en claro, y
          no pedimos tu nombre.
        </Paso>
        <Paso n={2} titulo="Vota">
          A favor o en contra en la ficha de cada iniciativa. Puedes cambiar tu voto cuando
          quieras; solo cuenta el último.
        </Paso>
        <Paso n={3} titulo="Mira el consenso">
          Los totales son públicos y en vivo. Quién votó qué, nunca: tu voto es
          privado por diseño.
        </Paso>
      </section>

      {/* Ranking */}
      <section>
        {/*
          A 390 px el titular y el enlace no caben en la misma línea: el
          titular se partía en dos para dejarle el hueco. Apilados, el enlace
          gana además su propio objetivo táctil de 44 px.
        */}
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg">
              ¿Qué dice la ciudadanía?
            </CardTitle>
            <p className="mt-0.5 text-sm text-ink-soft">
              {totalVotos > 0
                ? `${totalVotos.toLocaleString("es-DO")} votos sobre ${conVotos.length} iniciativas`
                : "Aún no hay votos. Sé quien empiece."}
            </p>
          </div>
          <Link
            href="/congreso"
            className="-ml-1 inline-flex min-h-11 shrink-0 items-center px-1 text-xs font-medium text-brand-700 hover:underline sm:ml-0 sm:min-h-0 sm:px-0"
          >
            Buscar iniciativas →
          </Link>
        </div>

        {conVotos.length > 0 ? (
          <Card>
            <ul>
              {conVotos.map((r) => (
                <FilaRanking key={`${r.camara}:${r.ref}`} item={r} />
              ))}
            </ul>
          </Card>
        ) : (
          <EstadoVacio titulo="El tablero está en blanco">
            Cuando la gente empiece a votar en las fichas de las iniciativas, aquí
            aparecerá el ranking de apoyo ciudadano.
          </EstadoVacio>
        )}
      </section>

      {/* franja de seguridad */}
      {/* La tarjeta que es un enlace toma el relieve sola (app/globals.css). */}
      <Card asChild>
        <Link
          href="/democracia/seguridad"
          className="flex items-center gap-4 px-5 py-4"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <IconShield className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Cómo protegemos tu identidad y tu voto</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              Cédula cifrada con clave que no sale de la base, voto privado a nivel de
              base de datos, minimización de datos según la Ley 172-13.
            </p>
          </div>
          <IconArrowRight className="h-4 w-4 shrink-0 text-ink-soft" />
        </Link>
      </Card>

      <p className="px-1 text-xs leading-relaxed text-ink-soft">
        Herramienta independiente y no oficial. Este piloto no es un canal formal
        de participación del Estado y sus resultados no obligan a ninguna
        institución; mide y muestra la opinión de quienes participan.{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          Estado y límites de las fuentes
        </Link>
        .
      </p>
    </div>
  );
}

/**
 * Los tres pasos. En el teléfono las tarjetas se apilan y el número deja de
 * ser una fila propia: puesto al lado del título, cada paso ocupa dos
 * renglones en vez de cuatro y los tres caben de una mirada. Desde `sm`
 * vuelven a ser tres columnas y el número encabeza su tarjeta.
 */
function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <Card className="flex gap-3 p-4 sm:block sm:p-5">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-alerta-100 text-xs font-bold text-alerta-600">
        {n}
      </span>
      <div className="min-w-0 sm:mt-3">
        {/* h2 y no h3: la página salta de la portada (h1) a los pasos. */}
        <h2 className="font-sans text-sm font-semibold text-ink">{titulo}</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">{children}</p>
      </div>
    </Card>
  );
}

function FilaRanking({ item }: { item: RankingItem }) {
  const pct = Math.round(item.apoyo * 100);
  const href =
    item.camara === "senado"
      ? enlace.expedienteSenado(item.ref.split(":")[0], item.ref.split(":")[1] ?? "")
      : enlace.iniciativa(item.ref);
  return (
    <li className="relative border-b border-hairline px-4 py-3.5 last:border-0 sm:px-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-mono font-semibold tabular-nums text-brand-700">
          {item.numero ?? `${item.camara}·${item.ref}`}
        </span>
        <Badge forma="etiqueta" variant="contorno" className="bg-canvas font-medium">
          {item.camara === "senado" ? "Senado" : "Diputados"}
        </Badge>
        {item.grupo && <span className="text-ink-soft">{item.grupo}</span>}
      </div>
      {/* El titular es el enlace y se estira sobre la fila; el recorte a dos
          renglones se declara con el título entero en `title`. */}
      <Link
        href={href}
        title={item.titulo ?? undefined}
        className="estira mt-1.5 line-clamp-2 break-words text-[15px] leading-snug text-ink hover:text-brand-700"
      >
        {item.titulo ?? "Iniciativa sin título en el registro"}
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <Progress
          value={pct}
          aria-label={`${pct} % a favor`}
          className="flex-1 bg-ink-soft/30 ring-1 ring-inset ring-hairline"
        />
        <span className="font-mono shrink-0 text-xs tabular-nums text-ink-soft">
          <span className="font-semibold text-brand-600">{pct}&nbsp;%</span> a favor ·{" "}
          {item.total.toLocaleString("es-DO")} {item.total === 1 ? "voto" : "votos"}
        </span>
      </div>
    </li>
  );
}
