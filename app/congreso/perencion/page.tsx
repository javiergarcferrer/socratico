import Link from "next/link";
import type { Metadata } from "next";
import IniciativaCard from "@/components/iniciativa-card";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EstadoVacio } from "@/components/estado-vacio";
import {
  DURACION_LEGISLATURA_DIAS,
  VENTANA_ALERTA_DIAS,
  diffDias,
  evaluarPerencion,
  legislaturaVigente,
  muestrearIniciativas,
} from "@/lib/congreso";
import { formatFecha } from "@/lib/format";
import { IconArrowLeft } from "@/components/icons";

export const metadata: Metadata = {
  alternates: { canonical: "/congreso/perencion" },
  title: "Por archivarse",
  description:
    "Qué iniciativas del Congreso están por perimir antes del cierre de la legislatura.",
};

export const revalidate = 900;

/** Muestra amplia: aquí el recall importa más que la latencia. */
const PAGINAS_MUESTRA = 25;

export default async function PerencionPage() {
  const muestra = await muestrearIniciativas(PAGINAS_MUESTRA);
  /*
    `total` solo queda en `null` cuando **ninguna** de las páginas de la muestra
    contestó: es la señal de que el SIL está caído. Sin ella, esta vista
    respondía «ninguna pieza está en riesgo» —una afirmación sobre el Congreso—
    cuando lo cierto era que no pudimos mirar ni una sola.
  */
  const silCaido = muestra.total === null;
  const legislatura = legislaturaVigente();
  const diasParaCierre = legislatura ? diffDias(new Date(), legislatura.cierre) : null;

  const vivas = muestra.iniciativas.filter((i) => i.viva);
  const enRiesgo = vivas
    .map((ini) => ({ ini, p: evaluarPerencion(ini.legislatura) }))
    .filter((x) => x.p.estado === "en-riesgo")
    .sort((a, b) => {
      const da = a.p.estado === "en-riesgo" ? a.p.diasRestantes : 0;
      const db = b.p.estado === "en-riesgo" ? b.p.diasRestantes : 0;
      return da - db;
    });

  const transcurridos =
    diasParaCierre !== null ? DURACION_LEGISLATURA_DIAS - diasParaCierre : 0;
  const progreso = Math.max(
    0,
    Math.min(100, (transcurridos / DURACION_LEGISLATURA_DIAS) * 100),
  );

  return (
    <div className="mx-auto max-w-4xl">
      {/*
        Volver era un renglón de 16 px: se le da la altura de un mando (44 px)
        en el teléfono, con un margen negativo que deja el texto donde estaba.
      */}
      <Link
        href="/congreso"
        className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink sm:min-h-0 sm:py-1"
      >
        <IconArrowLeft className="h-3.5 w-3.5" />
        Congreso
      </Link>

      <header className="mb-6 mt-1 sm:mt-3">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          ¿Qué se muere cuando cierra la legislatura?
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Cada legislatura ordinaria dura {DURACION_LEGISLATURA_DIAS} días. Las piezas
          que sigan pendientes al cierre se perimen. Esta vista avisa con{" "}
          {VENTANA_ALERTA_DIAS} días de anticipación.
        </p>
      </header>

      {legislatura && diasParaCierre !== null && (
        <Card as="section" className="mb-6 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-ink">
                {legislatura.nombre} {legislatura.anio}
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">
                {formatFecha(legislatura.inicio.toISOString().slice(0, 10))} a{" "}
                {formatFecha(legislatura.cierre.toISOString().slice(0, 10))}
              </p>
            </div>
            <p className="font-mono text-2xl font-bold tabular-nums text-ink">
              {diasParaCierre}
              <span className="ml-1 font-sans text-sm font-medium text-ink-soft">
                {diasParaCierre === 1 ? "día restante" : "días restantes"}
              </span>
            </p>
          </div>
          {/*
            Lo que corre no es un logro sino un plazo: por eso la barra va en
            ocre —el color del aviso— y no en la firma.
          */}
          <Progress
            value={progreso}
            aria-label={`Legislatura consumida al ${Math.round(progreso)} %`}
            className="mt-4 h-1.5 border border-hairline bg-canvas"
            indicadorClassName="bg-alerta-500"
          />
        </Card>
      )}

      {/*
        El alcance va antes de la lista, no al pie: quien lee «ninguna pieza»
        tiene que saber que es una muestra antes de concluir nada.
      */}
      {!silCaido && (
        <p className="mb-3 text-xs leading-relaxed text-ink-soft">
          Cobertura parcial: se evalúan las {muestra.muestra} iniciativas más recientes
          del registro, no el corpus completo. El SIL pagina de 10 en 10 y barrer sus
          cerca de 622 páginas en cada carga no es viable.{" "}
          <Link href="/fuentes" className="text-brand-700 underline">
            Ver el estado de las fuentes
          </Link>
          .
        </p>
      )}

      {enRiesgo.length > 0 ? (
        <Card as="section">
          <CardHeader>
            <CardTitle>Piezas en la ventana de aviso</CardTitle>
            <CardAction className="font-mono tabular-nums">
              {enRiesgo.length}
            </CardAction>
          </CardHeader>
          <ul>
            {enRiesgo.map(({ ini }) => (
              <IniciativaCard key={ini.id} iniciativa={ini} />
            ))}
          </ul>
        </Card>
      ) : silCaido ? (
        <EstadoVacio
          variante="caida"
          rotulo="Piezas en la ventana de aviso"
          titulo="El SIL de la Cámara no respondió"
          accion={
            <Button asChild variant="secondary">
              <Link href="/fuentes">Ver el estado de las fuentes</Link>
            </Button>
          }
        >
          Ninguna de las {PAGINAS_MUESTRA} páginas de la muestra llegó, así que
          no se pudo evaluar una sola pieza. Decir aquí que no hay nada en
          riesgo sería afirmar algo que no miramos.
        </EstadoVacio>
      ) : (
        <EstadoVacio
          rotulo="Piezas en la ventana de aviso"
          titulo={`Ninguna pieza entra hoy en la ventana de ${VENTANA_ALERTA_DIAS} días`}
          accion={
            <Button asChild variant="secondary">
              <Link href="/congreso">Buscar iniciativas</Link>
            </Button>
          }
        >
          Se revisaron {vivas.length} piezas vigentes dentro de una muestra de{" "}
          {muestra.muestra}. La alerta se activa cuando el cierre de la legislatura
          queda a {VENTANA_ALERTA_DIAS} días o menos.
        </EstadoVacio>
      )}

    </div>
  );
}
