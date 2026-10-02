import Link from "next/link";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Rotulo } from "@/components/papel";
import { Termino } from "@/components/termino";
import { OtrasGuias } from "@/components/otras-guias";

export const metadata: Metadata = {
  alternates: { canonical: "/finanzas/guia/deuda" },
  title: "Qué es la deuda pública",
  description:
    "Qué mide la deuda del Sector Público No Financiero que publica Crédito Público, qué es deuda interna y externa, y qué no es deuda pública.",
};

/*
  La cifra que enseña la plataforma es la de `lib/deuda.ts`: el saldo de la
  deuda del SPNF, en millones de dólares, del XLSX mensual de la Dirección
  General de Crédito Público. Esta guía explica esa cifra y no otra. El
  porcentaje del PIB solo existe para los cierres de año que publica el propio
  origen (`/deuda`); para un mes suelto no hay ancla y no se inventa una
  comparación (docs/INFRAESTRUCTURA.md §11, ergonomía §1).
*/

export default function GuiaDeudaPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card as="section" className="p-5 sm:p-6">
        <Rotulo>Guía · Finanzas públicas</Rotulo>
        <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">
          ¿Qué es la deuda pública?
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          Es el dinero que el Estado ha tomado prestado y todavía tiene que
          devolver, con intereses. Se pide prestado sobre todo para cubrir la
          diferencia cuando gasta más de lo que recauda en el año (el
          déficit) y para pagar deuda vieja que vence.
        </p>
      </Card>

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle className="text-[15px]">De quién es la deuda que se mide</CardTitle>
        <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink-soft">
          <p>
            La cifra que publica la Dirección General de Crédito Público, y la
            que enseña esta plataforma, es la del{" "}
            <Termino clave="spnf">Sector Público No Financiero</Termino> (SPNF):
            el gobierno central, las instituciones descentralizadas, la
            seguridad social, los ayuntamientos y las empresas públicas que no
            son bancos.
          </p>
          <p>
            Deja fuera al Banco Central y a la banca pública. La deuda del Banco
            Central se informa aparte; por eso, cuando se lee una cifra de deuda
            en la prensa, conviene mirar si habla del SPNF o del sector público
            con el Banco Central incluido: no son la misma.
          </p>
        </div>
      </Card>

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle className="text-[15px]">Interna y externa</CardTitle>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="rounded-lg bg-canvas px-4 py-3">
            <dt className="font-semibold text-ink">
              <Termino clave="deudaExterna" />
            </dt>
            <dd className="mt-0.5 text-[15px] leading-relaxed text-ink-soft">
              La que se debe a acreedores de fuera del país: organismos como el
              BID o el Banco Mundial, otros gobiernos, y quienes compraron
              bonos dominicanos en los mercados internacionales.
            </dd>
          </div>
          <div className="rounded-lg bg-canvas px-4 py-3">
            <dt className="font-semibold text-ink">
              <Termino clave="deudaInterna" />
            </dt>
            <dd className="mt-0.5 text-[15px] leading-relaxed text-ink-soft">
              La que se debe a acreedores del país: bancos locales, fondos de
              pensiones y quienes compraron bonos de Hacienda aquí.
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Lo que decide si es interna o externa es quién es el acreedor, no el
          tamaño del préstamo.
        </p>
      </Card>

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle className="text-[15px]">Cómo leer la cifra</CardTitle>
        <ul className="mt-2 list-inside list-disc space-y-1.5 text-[15px] leading-relaxed text-ink-soft">
          <li>
            Es un <strong>saldo</strong>: lo que se debe en una fecha, no lo que
            se pidió prestado en el año. Cada mes cambia porque entran préstamos
            nuevos y se pagan los que vencen.
          </li>
          <li>
            Está en <strong>dólares</strong>, porque así la publica Crédito
            Público, también la parte que se contrató en pesos.
          </li>
          <li>
            Un saldo solo no dice si es mucho o poco. La comparación habitual es
            con el tamaño de la economía (el PIB). Crédito Público publica ese
            porcentaje al cierre de cada año, y así lo enseña esta plataforma;
            para los meses del año en curso todavía no hay PIB, y el saldo va
            sin porcentaje en vez de inventar uno.
          </li>
        </ul>
      </Card>

      <Alert role="note" variant="neutro" className="p-5 sm:p-6">
        <p className="text-[15px] font-semibold text-ink">Lo que no es deuda pública</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Lo que el Estado ya recibió de sus proveedores y no les ha pagado es{" "}
          <Termino clave="deudaAdministrativa">deuda administrativa</Termino>,
          y no entra en esta cifra. Se lee en la distancia entre lo devengado y
          lo pagado de cada institución.{" "}
          <Link href="/finanzas/guia" className="font-medium text-brand-700 hover:underline">
            Cómo leer el presupuesto
          </Link>
          .
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/deuda">Ver el saldo de hoy</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/finanzas">Ver la ejecución del presupuesto</Link>
          </Button>
        </div>
      </Alert>

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuente: estadísticas de la deuda del SPNF de la Dirección General de
        Crédito Público (Ministerio de Hacienda). Esta guía resume; las
        definiciones oficiales son las de Crédito Público.
      </p>

      <OtrasGuias actual="/finanzas/guia/deuda" />
    </div>
  );
}
