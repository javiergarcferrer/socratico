import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Rotulo } from "@/components/papel";
import { Termino } from "@/components/termino";
import { OtrasGuias } from "@/components/otras-guias";

export const metadata: Metadata = {
  alternates: { canonical: "/congreso/guia" },
  title: "Cómo nace una ley",
  description:
    "El camino de una ley en República Dominicana según la Constitución de 2015: quién puede proponerla, las dos cámaras, la promulgación u observación del Presidente, la Gaceta Oficial y la perención.",
};

/*
  Lo que dice esta guía sale de la Constitución de 2015 y solo de lo que es
  seguro: quién tiene iniciativa, las dos discusiones, el paso por las dos
  cámaras, el plazo del Ejecutivo y la mayoría para superar una observación.
  Los reglamentos internos de cada cámara detallan mucho más —plazos de
  comisión, turnos de palabra— y no se resumen aquí para no afirmar lo que no
  se ha comprobado. Si algo cambia, se corrige aquí y en `lib/glosario.ts`.
*/

function Paso({ n, titulo, children }: { n: number; titulo: ReactNode; children: ReactNode }) {
  return (
    <Card as="section" className="p-5 sm:p-6">
      <CardTitle className="text-[15px]">
        <span className="font-mono text-brand-700">{n}</span> · {titulo}
      </CardTitle>
      <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink-soft">{children}</div>
    </Card>
  );
}

export default function GuiaLeyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card as="section" className="p-6">
        <Rotulo>Guía · Congreso Nacional</Rotulo>
        <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">
          ¿Cómo nace una ley?
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          Una ley no aparece de golpe: alguien la propone, cada una de las dos
          cámaras la estudia y la vota, el Presidente la firma o la devuelve, y
          se publica. Cada paso deja un rastro que se puede seguir en esta
          plataforma. Esto es lo que manda la Constitución de 2015, en siete
          pasos.
        </p>
      </Card>

      <Paso n={1} titulo="Alguien la propone">
        <p>
          Una <Termino clave="iniciativa">iniciativa</Termino> la pueden
          presentar los senadores y los diputados, el Presidente de la
          República, la Suprema Corte de Justicia en asuntos judiciales y la
          Junta Central Electoral en asuntos electorales. La Constitución
          también abre la iniciativa legislativa popular: un grupo de
          ciudadanos inscritos en el registro electoral puede presentar un
          proyecto.
        </p>
        <p>
          Se deposita en una de las dos cámaras, la Cámara de Diputados o el
          Senado, que recibe el nombre de <em>cámara de origen</em>. En ese
          momento recibe un número de expediente.
        </p>
      </Paso>

      <Paso n={2} titulo="Una comisión la estudia">
        <p>
          La cámara envía la pieza a una{" "}
          <Termino clave="comision">comisión</Termino>: un grupo pequeño de
          legisladores especializado en el tema. La comisión puede escuchar a
          expertos y a los afectados, cambiar el texto, y rinde un informe al
          pleno recomendando aprobarla, modificarla o rechazarla.
        </p>
        <p>
          Es el paso donde más piezas se quedan. Muchas nunca salen de
          comisión, y eso no se ve en ninguna votación: se ve en que la pieza
          deja de moverse.
        </p>
      </Paso>

      <Paso n={3} titulo="La primera cámara la vota">
        <p>
          El pleno la discute <strong>dos veces, en días distintos</strong>,
          salvo que la declare de urgencia, en cuyo caso puede hacerlo en
          sesiones seguidas. La mayoría que hace falta depende de la ley: las
          leyes <strong>orgánicas</strong> (las que desarrollan derechos
          fundamentales, la organización de los poderes del Estado o el
          régimen electoral, entre otras) necesitan las dos terceras partes de
          los presentes en cada cámara; las ordinarias, la mayoría absoluta de
          los presentes.
        </p>
      </Paso>

      <Paso n={4} titulo="La otra cámara hace lo mismo">
        <p>
          Aprobada en la cámara de origen, pasa a la otra, que vuelve a
          estudiarla en comisión y a votarla. Si la aprueba tal cual, la ley
          queda <em>sancionada</em> por el Congreso. Si le hace cambios, la
          pieza vuelve a la cámara de origen para que los acepte o no, y la
          Constitución regula ese ir y venir.
        </p>
        <p>
          Por eso la misma pieza tiene dos expedientes: uno en Diputados y otro
          en el Senado. En esta plataforma se ven en{" "}
          <Link href="/congreso" className="font-medium text-brand-700 hover:underline">
            Diputados
          </Link>{" "}
          y en el{" "}
          <Link href="/congreso/senado" className="font-medium text-brand-700 hover:underline">
            Senado
          </Link>
          .
        </p>
      </Paso>

      <Paso n={5} titulo="El Presidente la promulga o la observa">
        <p>
          El Congreso envía la ley al Poder Ejecutivo. El Presidente tiene diez
          días para hacer una de dos cosas (cinco si se declaró de urgencia):
        </p>
        <ul className="list-inside list-disc space-y-1.5">
          <li>
            <Termino clave="promulgacion">Promulgarla</Termino>: firmarla y
            ordenar que se publique. Desde ese momento es ley.
          </li>
          <li>
            <Termino clave="observacion">Observarla</Termino>: devolverla a la
            cámara de origen con sus reparos. El Congreso puede aceptarlos, o
            insistir en su texto si lo vuelven a aprobar las dos terceras
            partes de los presentes en cada cámara; entonces el Presidente
            está obligado a promulgarla.
          </li>
        </ul>
        <p>
          Si deja pasar el plazo sin hacer ninguna de las dos cosas, la
          Constitución da la ley por promulgada.
        </p>
      </Paso>

      <Paso n={6} titulo="Se publica en la Gaceta Oficial">
        <p>
          Una ley promulgada se publica en la{" "}
          <Termino clave="gacetaOficial">Gaceta Oficial</Termino> y es
          obligatoria para todos una vez pasan los plazos que la ley fija para
          que se considere conocida. Recibe un número con el año: «Ley 47-25»
          es la ley 47 de 2025. Las leyes y decretos publicados se consultan en{" "}
          <Link href="/normativa" className="font-medium text-brand-700 hover:underline">
            Normativa
          </Link>
          .
        </p>
      </Paso>

      <Paso n={7} titulo="O se archiva sin llegar: la perención">
        <p>
          El Congreso trabaja por{" "}
          <Termino clave="legislatura">legislaturas</Termino>: dos al año, de
          150 días cada una, que empiezan el 27 de febrero y el 16 de agosto. Una
          pieza que queda pendiente al cerrarse una legislatura sigue su
          trámite en la siguiente; si tampoco termina ahí, se considera no
          iniciada. Eso es la <Termino clave="perencion">perención</Termino>: la
          pieza perime y, para revivirla, hay que depositarla otra vez desde
          cero.
        </p>
        <p>
          Cada <Termino clave="cuatrienio">cuatrienio</Termino>, el período de
          cuatro años entre elecciones, el Senado guarda sus expedientes en una
          colección aparte.
        </p>
      </Paso>

      <Alert variant="firma" role="note" className="p-5 sm:p-6">
        <p className="text-[15px] font-semibold text-brand-900">
          Sigue una pieza y entérate cuando se mueva
        </p>
        <p className="mt-1 text-sm text-brand-900/80">
          En la ficha de cualquier iniciativa, toca «Seguir». Cuando vuelvas a{" "}
          <Link href="/seguimiento" className="font-medium underline">
            Mi seguimiento
          </Link>
          , la plataforma te dirá si cambió de estado desde tu última visita.
          Las de Diputados tienen además su RSS.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/congreso/perencion">¿Qué está por perimir?</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/congreso">Buscar iniciativas</Link>
          </Button>
        </div>
      </Alert>

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuente: Constitución de la República Dominicana de 2015 (capítulo del
        Poder Legislativo: formación y efecto de las leyes). Esta guía resume;
        el texto que obliga es el de la Constitución y los reglamentos de cada
        cámara.
      </p>

      <OtrasGuias actual="/congreso/guia" />
    </div>
  );
}
