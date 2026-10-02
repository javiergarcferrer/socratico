import {
  mesLargo,
  valorEn,
  type ClaveActiva,
  type ClavePasiva,
  type PoliticaMonetaria,
  type SerieTasas,
} from "@/lib/banco-central";
import { BarrasHorizontales, type Barra } from "@/components/graficos";
import { Termino } from "@/components/termino";
import { enPuntos, porciento } from "./formato";

/**
 * La escalera de las tasas: cuánto cuesta el dinero según quién lo pide, todas
 * **del mismo mes** para que se comparen. Abajo, lo que el banco paga por el
 * ahorro; arriba, lo que cobra por prestar; en medio, la tasa del Banco
 * Central y la de los bancos entre sí.
 *
 * Una sola serie en la firma (docs/INFRAESTRUCTURA.md §11): el escalón no se
 * colorea por quién paga, se rotula. El mes es el último cerrado que traen a
 * la vez las dos hojas del BCRD; la TPM se lee en ese mismo mes, y si ya
 * cambió después, la nota lo dice.
 */

export function mesComun(
  activas: SerieTasas<ClaveActiva> | null,
  pasivas: SerieTasas<ClavePasiva> | null,
): string | null {
  const a = activas?.meses.at(-1)?.periodo;
  const p = pasivas?.meses.at(-1)?.periodo;
  if (!a || !p) return a ?? p ?? null;
  return a < p ? a : p;
}

export function EscaleraTasas({
  politica,
  activas,
  pasivas,
}: {
  politica: PoliticaMonetaria | null;
  activas: SerieTasas<ClaveActiva> | null;
  pasivas: SerieTasas<ClavePasiva> | null;
}) {
  const mes = mesComun(activas, pasivas);
  if (!mes) return null;
  const mesActivas = activas?.meses.find((m) => m.periodo === mes);
  const mesPasivas = pasivas?.meses.find((m) => m.periodo === mes);
  const act = mesActivas?.valores ?? {};
  const pas = mesPasivas?.valores ?? {};
  const preliminar = Boolean(mesActivas?.preliminar || mesPasivas?.preliminar);
  const tpm = politica ? valorEn(politica.serie, mes) : null;

  const filas: (Omit<Barra, "cifra" | "valor"> & { valor: number | undefined })[] = [
    {
      clave: "ahorros",
      etiqueta: "Una cuenta de ahorro",
      valor: pas.ahorros,
      detalle: "Lo que el banco te paga por el dinero que tienes ahí",
    },
    {
      clave: "pasiva",
      etiqueta: "Un certificado o depósito a plazo",
      valor: pas.ponderado,
      detalle: "Lo que el banco te paga si le dejas el dinero un tiempo fijo, en promedio",
    },
    {
      clave: "tpm",
      etiqueta: "La tasa del Banco Central",
      valor: tpm?.valor,
      detalle: "La referencia para el dinero a un día entre el Banco Central y los bancos",
    },
    {
      clave: "interbancaria",
      etiqueta: "Entre bancos",
      valor: pas.interbancaria,
      detalle: "Lo que se cobran los bancos cuando uno le presta a otro por pocos días",
    },
    {
      clave: "hipotecario",
      etiqueta: "Un préstamo para vivienda",
      valor: act.hipotecario,
      detalle: "Hipotecarios y de desarrollo, en promedio",
    },
    {
      clave: "comercio",
      etiqueta: "Un préstamo a un negocio",
      valor: act.comercio,
      detalle: "Préstamos al comercio, en promedio",
    },
    {
      clave: "activa",
      etiqueta: "Un préstamo cualquiera",
      valor: act.ponderado,
      detalle: "Lo que cobran los bancos por prestar, en promedio de todo lo prestado",
    },
    {
      clave: "consumo",
      etiqueta: "Un préstamo personal",
      valor: act.consumo,
      detalle: "Préstamos de consumo y personales, en promedio",
    },
  ];
  const barras: Barra[] = filas
    .filter((f): f is typeof f & { valor: number } => f.valor !== undefined)
    .sort((a, b) => a.valor - b.valor)
    .map((f) => ({ ...f, cifra: porciento(f.valor), titulo: `${f.etiqueta}: ${porciento(f.valor)}` }));

  const margen = act.ponderado !== undefined && pas.ponderado !== undefined ? act.ponderado - pas.ponderado : null;
  const ultimoCambio = politica?.cambios[0] ?? null;
  const tpmCambio = politica && tpm && ultimoCambio && ultimoCambio.periodo > mes && politica.vigente.tpm !== tpm.valor;

  return (
    <div>
      <BarrasHorizontales
        barras={barras}
        etiqueta={`Tasas de interés en pesos de ${mesLargo(mes)}, de la más baja a la más alta`}
        filas
        className="-mx-5 mt-3 border-y border-hairline sm:-mx-6"
      />
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
        {margen !== null && (
          <p>
            Entre lo que los bancos cobran por prestar ({porciento(act.ponderado)}) y lo que pagan por un
            depósito a plazo ({porciento(pas.ponderado)}) hay {enPuntos(margen)}: es el{" "}
            <Termino clave="margenFinanciero">margen de intermediación</Termino>.
          </p>
        )}
        {tpmCambio && (
          <p>
            Desde {mesLargo(ultimoCambio.periodo)} la tasa del Banco Central es{" "}
            {porciento(politica.vigente.tpm)}; las de los bancos de ese mes todavía no se publican cerradas.
          </p>
        )}
        <p className="text-xs">
          {mesLargo(mes)}, % nominal anual en pesos. Promedios ponderados por monto de los bancos múltiples,
          según el Banco Central; la tasa entre bancos sale de la misma hoja.
          {preliminar && " El Banco Central las marca como preliminares."}
        </p>
      </div>
    </div>
  );
}
