import { getBanca, URL_SIMBAD, type IndicadorBanca } from "@/lib/banca";
import { puntos, variacion } from "@/lib/cifras";
import { formatPesos, SIN_DATO } from "@/lib/format";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { IconChartBar, IconExternal } from "@/components/icons";

/**
 * Cuatro cifras del sistema financiero, del tablero público SIMBAD de la
 * Superintendencia de Bancos (`lib/banca.ts`): morosidad, cartera de
 * créditos, solvencia y la tasa de los préstamos nuevos.
 *
 * Componente de servidor; quien lo coloque lo envuelve en su `Suspense` con
 * una `Esqueleto` de la misma altura. Cada cifra se degrada por su cuenta y
 * se compara solo con el mismo mes del año anterior, y solo si la ventana de
 * 24 meses que devuelve SIMBAD lo trae.
 */

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
/** «2026-07» → «julio 2026». */
const mes = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const mayuscula = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;
const decimal = (n: number, d: number) =>
  n.toLocaleString("es-DO", { minimumFractionDigits: d, maximumFractionDigits: d });
const porciento = (n: number) => `${decimal(n, 2)} %`;
const pesosDeMillones = (millones: number) => formatPesos(millones * 1e6);

const SIN_COMPARAR = "La ventana de SIMBAD no trae el mismo mes del año anterior; aquí no se compara.";

/** Un porcentaje contra el del año anterior, en puntos. */
function comparacionPct(i: IndicadorBanca, verbo: string) {
  if (!i.anterior) return SIN_COMPARAR;
  const d = i.valor - i.anterior.valor;
  const cambio =
    Math.abs(d) < 0.05 ? "prácticamente igual" : `${d > 0 ? "subió" : "bajó"} ${puntos(i.valor, i.anterior.valor).slice(1)}`;
  return `En ${mes(i.anterior.periodo)} ${verbo} ${porciento(i.anterior.valor)}: ${cambio}.`;
}

/** Un monto contra el del año anterior, en %. */
function comparacionMonto(i: IndicadorBanca) {
  if (!i.anterior) return SIN_COMPARAR;
  const v = variacion(i.valor, i.anterior.valor);
  const cambio =
    v?.pct == null
      ? ""
      : Math.abs(v.pct) < 0.05
        ? ": prácticamente igual"
        : `: ${decimal(Math.abs(v.pct), 1)} % ${v.pct > 0 ? "más" : "menos"}`;
  return `En ${mes(i.anterior.periodo)} era ${pesosDeMillones(i.anterior.valor)}${cambio}.`;
}

function Casilla({
  etiqueta,
  indicador,
  valor,
  comparacion,
  explicacion,
}: {
  etiqueta: string;
  indicador: IndicadorBanca | null;
  valor: (i: IndicadorBanca) => string;
  comparacion: (i: IndicadorBanca) => string;
  explicacion: string;
}) {
  if (!indicador) {
    return (
      <div>
        <Cifra
          etiqueta={etiqueta}
          valor={SIN_DATO}
          tono="text-ink-soft"
          nota={<span className="text-alerta-700">SIMBAD no devolvió esta serie. No mostramos una cifra que no leímos.</span>}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Cifra etiqueta={etiqueta} valor={valor(indicador)} nota={`${mayuscula(mes(indicador.periodo))} · SIMBAD`} />
      <p className="text-sm leading-snug text-ink-soft">{comparacion(indicador)}</p>
      <p className="text-xs leading-snug text-ink-soft">{explicacion}</p>
    </div>
  );
}

export async function IndicadoresBanca() {
  const { morosidad, cartera, solvencia, tasaNuevos } = await getBanca();
  const leidos = [morosidad, cartera, solvencia, tasaNuevos].filter((i): i is IndicadorBanca => i !== null);
  const desde = leidos.map((i) => i.desde).sort()[0];
  return (
    <Card as="section" className="flex h-full flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <IconChartBar className="h-4 w-4 text-ink-soft" />
            ¿Cómo está la banca?
          </CardTitle>
          <p className="mt-0.5 text-xs text-ink-soft">
            Cuatro cifras del sistema financiero que publica la Superintendencia de Bancos
          </p>
        </div>
        <Button asChild variant="link" className="-my-2 -mr-2 px-2 text-xs">
          <a href={URL_SIMBAD} target="_blank" rel="noopener noreferrer">
            SIMBAD
            <IconExternal className="h-3.5 w-3.5" />
            <span className="sr-only">(se abre en otra pestaña)</span>
          </a>
        </Button>
      </div>
      {leidos.length === 0 ? (
        <p className="mt-4 text-sm text-alerta-700">
          El tablero SIMBAD de la Superintendencia de Bancos no contestó. No mostramos
          cifras que no pudimos leer; siguen publicadas en su sitio.
        </p>
      ) : (
        <>
          <TiraDeCifras className="-mx-5 mt-4">
            <Casilla
              etiqueta="Préstamos con pagos atrasados"
              indicador={morosidad}
              valor={(i) => porciento(i.valor)}
              comparacion={(i) => comparacionPct(i, "era")}
              explicacion="Morosidad: la parte de lo prestado que tiene cuotas vencidas."
            />
            <Casilla
              etiqueta="Lo que la banca tiene prestado"
              indicador={cartera}
              valor={(i) => pesosDeMillones(i.valor)}
              comparacion={comparacionMonto}
              explicacion="Saldo de la cartera de créditos de todas las entidades, en pesos corrientes."
            />
            <Casilla
              etiqueta="Colchón de capital de los bancos"
              indicador={solvencia}
              valor={(i) => porciento(i.valor)}
              comparacion={(i) => comparacionPct(i, "era")}
              explicacion="Índice de solvencia: capital frente a los activos ponderados por riesgo; la Ley 183-02 exige al menos 10 %."
            />
            <Casilla
              etiqueta="Tasa de los préstamos nuevos"
              indicador={tasaNuevos}
              valor={(i) => porciento(i.valor)}
              comparacion={(i) => comparacionPct(i, "estaba en")}
              explicacion="Promedio ponderado, en % nominal anual, de los créditos otorgados en el mes."
            />
          </TiraDeCifras>
          <p className="mt-auto pt-3 text-xs leading-relaxed text-ink-soft">
            Son las cifras del tablero público SIMBAD de la Superintendencia de Bancos,
            para el conjunto de las entidades, sin ajustes nuestros. SIMBAD solo
            devuelve una ventana de 24 meses{desde ? ` (desde ${mes(desde)})` : ""}: la
            comparación es con el mismo mes del año anterior cuando la ventana lo trae,
            y los porcentajes se comparan en puntos. Cada serie llega hasta el último mes
            que la SB ha publicado, que no es el mismo para todas. Se consulta una vez
            al día.
          </p>
        </>
      )}
    </Card>
  );
}
