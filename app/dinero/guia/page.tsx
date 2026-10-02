import Link from "next/link";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Rotulo } from "@/components/papel";
import { Termino } from "@/components/termino";
import { OtrasGuias } from "@/components/otras-guias";

export const metadata: Metadata = {
  alternates: { canonical: "/dinero/guia" },
  title: "Cómo funciona el dinero",
  description:
    "El sistema financiero dominicano en llano: qué hace el Banco Central, qué es la tasa de política monetaria, por qué los bancos cobran más de lo que pagan, qué es un bono y por qué tu pensión termina prestada al Estado.",
};

/*
  Esta guía no lee ninguna fuente: explica lo que muestran /dinero, /dinero/tasas,
  /dinero/bonos y /dinero/banco-central, y por eso sigue en pie aunque el Banco
  Central o Crédito Público no contesten. Las cifras de ejemplo son aritmética
  redonda, dicha como ejemplo; las de verdad están en esas páginas, con su fecha.
*/

function Paso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card as="section" className="p-5 sm:p-6">
      <CardTitle className="text-[15px]">{titulo}</CardTitle>
      <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink-soft">{children}</div>
    </Card>
  );
}

function Ejemplo({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-canvas px-4 py-3 text-sm leading-relaxed">
      <p className="rotulo text-ink-soft">Un ejemplo</p>
      <div className="mt-1 text-ink">{children}</div>
    </div>
  );
}

export default function GuiaDineroPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card as="section" className="p-5 sm:p-6">
        <Rotulo>Guía · Dinero</Rotulo>
        <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">¿Cómo funciona el dinero en el país?</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          Tres actores mueven casi todo: el Banco Central, que cuida el valor del peso; los bancos, que reciben
          ahorros y prestan; y el Estado, que cuando gasta más de lo que cobra pide prestado. Esta guía cuenta qué
          hace cada uno y qué tiene que ver contigo.
        </p>
      </Card>

      <Paso titulo="1. El Banco Central: el banco de los bancos">
        <p>
          No le presta a la gente ni a las empresas. Emite los billetes y monedas, guarda las{" "}
          <Termino clave="reservasInternacionales">reservas internacionales</Termino>, y es el banco donde los bancos
          tienen su propia cuenta. Lo dirige la Junta Monetaria, que preside el gobernador.
        </p>
        <p>
          Su tarea principal, por ley, es que los precios se mantengan estables: que la{" "}
          <Termino clave="inflacion">inflación</Termino> sea baja y predecible. Para eso se pone una meta de
          inflación al año y mueve su tasa para acercarse a ella.
        </p>
        <p>
          A los bancos no los vigila el Banco Central sino la Superintendencia de Bancos, que publica su salud: cuánto
          prestan, cuánto no se les paga y cuánto capital tienen.
        </p>
      </Paso>

      <Paso titulo="2. La tasa de política monetaria: el termostato">
        <p>
          La <Termino clave="tpm">tasa de política monetaria</Termino> es el precio del dinero de un día entre el
          Banco Central y los bancos. Cuando el Banco Central la sube, a los bancos les cuesta más conseguir pesos y les
          conviene más dejarlos guardados; con el tiempo, suben lo que cobran por prestar y lo que pagan por tu ahorro.
          Se presta menos, se gasta menos, y los precios suben más despacio. Cuando la baja, pasa lo contrario.
        </p>
        <p>
          No cambia de golpe tu préstamo a tasa fija: se nota en los préstamos nuevos, en los que se revisan y en lo
          que te ofrecen por un certificado.
        </p>
        <Ejemplo>
          Si debes RD$ 100,000 todo un año, al 14 % pagas unos RD$ 14,000 de intereses; al 13 %, unos RD$ 13,000. Un
          punto de tasa es un uno por ciento de lo que debes, cada año.
        </Ejemplo>
      </Paso>

      <Paso titulo="3. Cómo saca y mete pesos cada día">
        <p>
          Para que la tasa de corto plazo se quede cerca de la suya, el Banco Central regula cuántos pesos hay en los
          bancos:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-ink">Los saca</strong> recibiendo depósitos de un día y vendiendo sus propios
            títulos: <Termino clave="valoresBcrd">certificados, notas y letras</Termino>. Quien los compra le entrega
            pesos hoy y cobra intereses. Es una <Termino clave="contraccion">operación de contracción</Termino>.
          </li>
          <li>
            <strong className="text-ink">Los mete</strong> prestándoles a los bancos que los necesitan, con títulos de
            garantía: un <Termino clave="repo">repo</Termino>.
          </li>
          <li>
            <strong className="text-ink">Los inmoviliza</strong> con el <Termino clave="encajeLegal">encaje legal</Termino>:
            una parte de cada depósito que el banco no puede prestar y deja en el Banco Central.
          </li>
        </ul>
        <p>
          Por eso el Banco Central tiene deuda propia: sus títulos en circulación. No aparece en la deuda del sector
          público no financiero que publica Crédito Público, y sus intereses son un costo del Banco Central. Parte de
          sus pérdidas las cubre Hacienda con bonos de recapitalización (Ley 167-07), que sí están en esa deuda.
        </p>
      </Paso>

      <Paso titulo="4. Los bancos viven de la diferencia">
        <p>
          Un banco te paga una <Termino clave="tasaPasiva">tasa pasiva</Termino> por tu dinero y lo presta a una{" "}
          <Termino clave="tasaActiva">tasa activa</Termino> más alta. La diferencia es su{" "}
          <Termino clave="margenFinanciero">margen</Termino>: de ahí pagan sus costos, cubren los préstamos que no se
          pagan y sacan su ganancia.
        </p>
        <p>
          La tasa no es una sola. Un préstamo personal cuesta más que uno para vivienda, que tiene una casa de
          garantía; una cuenta de ahorro paga mucho menos que un certificado, porque puedes sacar el dinero cuando
          quieras.
        </p>
        <Ejemplo>
          Si un certificado paga 7 % y la inflación del año es 5 %, tu dinero rinde unos 2 puntos más que lo que
          suben los precios: esa es su <Termino clave="tasaReal">tasa real</Termino>. Una cuenta de ahorro al medio
          por ciento, con esa misma inflación, pierde valor.
        </Ejemplo>
      </Paso>

      <Paso titulo="5. Cuando al Estado le falta, vende bonos">
        <p>
          Cuando el Gobierno gasta más de lo que recauda, el Ministerio de Hacienda y Economía pide prestado. Tiene tres
          caminos:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-ink">Bonos en pesos, en el país.</strong> Los subasta: dice cuánto quiere, los
            inversionistas ofrecen a qué rendimiento lo prestarían, y Hacienda acepta las ofertas más baratas hasta
            completar el monto.
          </li>
          <li>
            <strong className="text-ink"><Termino clave="bonoGlobal">Bonos en el exterior</Termino></strong>, casi
            siempre en dólares, a fondos de todo el mundo.
          </li>
          <li>
            <strong className="text-ink">Préstamos</strong> de <Termino clave="multilateral">organismos</Termino> como
            el BID o el Banco Mundial, y de otros gobiernos.
          </li>
        </ul>
        <p>
          Un <Termino clave="bono">bono</Termino> paga un interés fijo, el cupón, y se puede revender. Por eso quien lo
          compró en la subasta no siempre es quien lo tiene hoy: el que cobra es su{" "}
          <Termino clave="tenedor">tenedor</Termino>, y el registro de quién es lo lleva{" "}
          <Termino clave="cevaldom">CEVALDOM</Termino>.
        </p>
        <Ejemplo>
          Un bono con un cupón de 12 % que se subasta a un rendimiento de 10.5 % se vende por encima de su valor: los
          compradores pagan más hoy por cobrar ese 12 % durante años. Cuanta más demanda hay, más bajo el rendimiento
          que acepta Hacienda.
        </Ejemplo>
      </Paso>

      <Paso titulo="6. Tu pensión le presta al Estado">
        <p>
          Lo que tú y tu empleador aportan cada mes a tu cuenta de pensión lo invierte una{" "}
          <Termino clave="afp">AFP</Termino>. Una parte grande de esos fondos está en bonos del Estado: los fondos de
          pensiones están entre los mayores tenedores de los bonos internos, junto a los bancos. Tu retiro depende, en
          parte, de que el Estado pague lo que debe.{" "}
          <Link href="/dinero/bonos" className="font-medium text-brand-700 hover:underline">
            Cuánto tienen hoy
          </Link>
          .
        </p>
      </Paso>

      <Alert role="note" variant="neutro" className="p-5 sm:p-6">
        <p className="text-[15px] font-semibold text-ink">Dónde verlo con las cifras más recientes</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Cada página dice de qué archivo sale cada cifra y de qué fecha es.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/dinero">El costo del dinero</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/dinero/bonos">Quién compra los bonos</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/dinero/tasas">Las tasas, mes a mes</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/dinero/banco-central">El Banco Central por dentro</Link>
          </Button>
        </div>
      </Alert>

      <p className="text-xs leading-relaxed text-ink-soft">
        Esta guía resume con palabras llanas; las definiciones oficiales son las de la Ley Monetaria y Financiera
        (183-02), el Banco Central y la Dirección General de Crédito Público. Los ejemplos son aritmética redonda, no
        cifras publicadas.
      </p>

      <OtrasGuias actual="/dinero/guia" />
    </div>
  );
}
