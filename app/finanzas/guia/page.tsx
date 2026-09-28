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
  alternates: { canonical: "/finanzas/guia" },
  title: "Cómo leer el presupuesto",
  description:
    "Qué significan presupuesto inicial, vigente, comprometido, devengado y pagado en el Presupuesto General del Estado dominicano; qué es un capítulo y qué es la deuda administrativa.",
};

/*
  Las etapas del gasto son las que registra el SIGEF bajo la Ley 423-06
  Orgánica de Presupuesto para el Sector Público, y son las mismas columnas que
  `public/data/fiscal.json` guarda por institución. El ejemplo del pupitre es
  ilustrativo y lo dice. Nada aquí afirma plazos ni montos de la ley que no se
  hayan comprobado.
*/

function Etapa({
  n,
  termino,
  ejemplo,
  children,
}: {
  n: number;
  termino: ReactNode;
  ejemplo: string;
  children: ReactNode;
}) {
  return (
    <li className="rounded-lg bg-canvas px-4 py-3">
      <p className="font-semibold text-ink">
        <span className="font-mono text-brand-700">{n}</span> · {termino}
      </p>
      <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{children}</p>
      <p className="mt-1.5 text-xs text-ink-soft">
        <span className="rotulo">En el ejemplo</span> {ejemplo}
      </p>
    </li>
  );
}

export default function GuiaPresupuestoPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card as="section" className="p-5 sm:p-6">
        <Rotulo>Guía · Finanzas públicas</Rotulo>
        <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">
          ¿Cómo se lee el presupuesto?
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          El presupuesto dice cuánto puede gastar cada institución del Estado en
          el año. Pero entre «puede gastar» y «ya pagó» hay varias etapas, y
          cada cifra de{" "}
          <Link href="/finanzas" className="font-medium text-brand-700 hover:underline">
            Finanzas
          </Link>{" "}
          mide una distinta. Confundirlas es el error más común al leer las
          cuentas públicas.
        </p>
      </Card>

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle className="text-[15px]">De dónde sale</CardTitle>
        <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink-soft">
          <p>
            Cada año el Poder Ejecutivo prepara el proyecto de Presupuesto
            General del Estado y el Congreso lo aprueba como ley. Las reglas de
            cómo se formula, se aprueba, se ejecuta y se evalúa están en la Ley
            423-06 Orgánica de Presupuesto para el Sector Público.
          </p>
          <p>
            Cada paso del gasto queda registrado en el{" "}
            <Termino clave="sigef">SIGEF</Termino>, el sistema de gestión
            financiera del Ministerio de Hacienda. De ahí salen las cifras de
            esta plataforma.
          </p>
        </div>
      </Card>

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle className="text-[15px]">Las cinco cifras, en orden</CardTitle>
        <p className="mt-1 text-sm text-ink-soft">
          Un ejemplo para seguirlas: un ministerio que va a comprar pupitres
          para sus escuelas. Es ilustrativo, no un caso real.
        </p>
        <ol className="mt-4 space-y-2">
          <Etapa
            n={1}
            termino={<Termino clave="presupuestoInicial" />}
            ejemplo="la ley de presupuesto le asigna al ministerio una partida para mobiliario escolar."
          >
            Lo que el Congreso aprobó al abrir el año.
          </Etapa>
          <Etapa
            n={2}
            termino={<Termino clave="vigente" />}
            ejemplo="a mitad de año le trasladan más fondos a esa partida, o se los recortan."
          >
            El inicial más los cambios que se hicieron después. Es contra esta
            cifra que se mide cuánto ha ejecutado una institución.
          </Etapa>
          <Etapa
            n={3}
            termino={<Termino clave="comprometido" />}
            ejemplo="el ministerio firma el contrato con el fabricante de pupitres."
          >
            El Estado se obligó por escrito, pero todavía no ha recibido nada.
          </Etapa>
          <Etapa
            n={4}
            termino={<Termino clave="devengado" />}
            ejemplo="los pupitres llegan a las escuelas y el ministerio da conformidad."
          >
            Ya recibió el bien o el servicio: nació la obligación de pagar. Es
            la medida honesta de cuánto gastó, y la que usa esta plataforma.
          </Etapa>
          <Etapa
            n={5}
            termino={<Termino clave="pagado" />}
            ejemplo="la Tesorería le transfiere el dinero al fabricante."
          >
            El dinero salió de la cuenta.
          </Etapa>
        </ol>
      </Card>

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle className="text-[15px]">La distancia entre devengado y pagado</CardTitle>
        <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink-soft">
          <p>
            Si una institución devengó más de lo que pagó, le debe dinero a
            quien ya le entregó. Esa diferencia es la{" "}
            <Termino clave="deudaAdministrativa">deuda administrativa</Termino>:
            no es deuda con bancos ni bonos (esa es la{" "}
            <Link href="/finanzas/guia/deuda" className="font-medium text-brand-700 hover:underline">
              deuda pública
            </Link>
            ), sino con sus propios proveedores y contratistas. Una distancia
            grande y sostenida significa que el Estado les está pagando tarde.
          </p>
          <p>
            La ficha de cada institución en Finanzas dice cuánto hay entre una
            y otra en el año en curso.
          </p>
        </div>
      </Card>

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle className="text-[15px]">Capítulos: cómo se llama cada institución</CardTitle>
        <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink-soft">
          <p>
            En el presupuesto una institución no se busca por nombre sino por su{" "}
            <Termino clave="capitulo">capítulo</Termino>, un código de cuatro
            cifras: 0206 es el Ministerio de Educación, 0101 el Senado. Los
            capítulos se agrupan en tres secciones: la Administración Central,
            las instituciones descentralizadas y autónomas no financieras, y
            las de la seguridad social.
          </p>
          <p>
            La <Termino clave="ejecucion">ejecución</Termino> de cada capítulo
            es lo devengado entre su presupuesto vigente, en porcentaje.
          </p>
        </div>
      </Card>

      <Alert role="note" variant="neutro" className="p-5 sm:p-6">
        <p className="text-[15px] font-semibold text-ink">Lo que estas cifras no cubren</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          La ejecución que publica Finanzas es la del Presupuesto General del
          Estado: no incluye los ayuntamientos ni las empresas públicas
          financieras. Y es una instantánea con fecha de corte, que la página
          declara arriba: el mes en curso todavía no está cerrado en el SIGEF.
        </p>
        <Button asChild className="mt-4">
          <Link href="/finanzas">Ver la ejecución por institución</Link>
        </Button>
      </Alert>

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuentes: Ley 423-06 Orgánica de Presupuesto para el Sector Público;
        catálogo de capítulos del Portal de Transparencia Fiscal del Ministerio
        de Hacienda. Esta guía resume; el texto que obliga es el de la ley.
      </p>

      <OtrasGuias actual="/finanzas/guia" />
    </div>
  );
}
