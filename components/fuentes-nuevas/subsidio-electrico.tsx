import { getSubsidioElectrico } from "@/lib/subsidio";
import { variacion } from "@/lib/cifras";
import { formatFecha, formatPesos } from "@/lib/format";
import { SerieTemporal } from "@/components/graficos";
import { Cifra, TiraDeCifras } from "@/components/papel";
import Plegable from "@/components/plegable";
import { Card, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];

/**
 * ¿Cuánto le pone el Tesoro a la electricidad? — las transferencias del
 * Tesoro a las empresas eléctricas del Estado, año por año (`lib/subsidio.ts`).
 * La comparación del año en curso se hace contra el año anterior completo solo
 * como referencia, y lo dice: el año no ha terminado.
 */
export async function SubsidioElectrico() {
  const d = await getSubsidioElectrico();
  if (!d || d.anios.length === 0) return null;
  const cerrados = d.anios.filter((a) => a.hastaMes === 12);
  const ultimoCerrado = cerrados.at(-1);
  const penultimo = cerrados.at(-2);
  const enCurso = d.anios.find((a) => a.hastaMes < 12) ?? null;
  const cambio = ultimoCerrado && penultimo ? variacion(ultimoCerrado.devengado, penultimo.devengado) : null;
  const empresas = (a: (typeof d.anios)[number]) =>
    Object.entries(a.empresas)
      .filter(([, v]) => v.devengado > 0)
      .sort((x, y) => y[1].devengado - x[1].devengado);

  return (
    <Card as="section" id="subsidio-electrico" className="p-5 sm:p-6">
      <CardTitle>¿Cuánto le pone el Tesoro a la electricidad?</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Transferencias del Tesoro a las empresas eléctricas del Estado, devengadas cada
        año: las tres distribuidoras, la transmisora y la hidroeléctrica (hasta 2023
        las recibía la CDEEE y las repartía). Es lo que pasa por el Tesoro, no
        todo el costo del sector eléctrico.
      </p>
      <TiraDeCifras className="mt-4 lg:grid-cols-3">
        {ultimoCerrado && (
          <Cifra etiqueta={`En ${ultimoCerrado.anio}`} valor={formatPesos(ultimoCerrado.devengado)} ancla={{ alcance: "instantanea", periodo: String(ultimoCerrado.anio) }} />
        )}
        {penultimo && <Cifra etiqueta={`En ${penultimo.anio}`} valor={formatPesos(penultimo.devengado)} />}
        {enCurso && (
          <Cifra
            etiqueta={`En ${enCurso.anio}, hasta ${MESES[enCurso.hastaMes - 1]}`}
            valor={formatPesos(enCurso.devengado)}
            nota="el año no ha terminado"
          />
        )}
      </TiraDeCifras>
      {cambio && cambio.pct != null && ultimoCerrado && penultimo && (
        <p className="mt-3 text-sm text-ink-soft">
          De {penultimo.anio} a {ultimoCerrado.anio}, {cambio.abs >= 0 ? "subió" : "bajó"}{" "}
          {Math.abs(cambio.pct).toFixed(1)} %. En {d.anios[0].anio} fueron{" "}
          {formatPesos(d.anios[0].devengado)}.
        </p>
      )}
      <SerieTemporal
        forma="columnas"
        formato="pesos"
        etiqueta={`Transferencias del Tesoro a las eléctricas por año, de ${formatPesos(d.anios[0].devengado)} en ${d.anios[0].anio} a ${formatPesos(d.anios.at(-1)!.devengado)} en ${d.anios.at(-1)!.anio}`}
        puntos={d.anios.map((a, i) => ({
          clave: String(a.anio),
          valor: a.devengado,
          lectura: `${a.anio}${a.hastaMes < 12 ? ` (hasta ${MESES[a.hastaMes - 1]})` : ""}: ${formatPesos(a.devengado)}`,
          marca: i === 0 || i === d.anios.length - 1 || a.anio % 2 === 0 ? String(a.anio) : undefined,
        }))}
      />
      <Plegable
        className="-mx-5 mt-3 border-t border-hairline sm:-mx-6"
        etiqueta={`Ver los ${d.anios.length} años por empresa`}
        etiquetaCerrar="Ocultar la tabla"
      >
        <div className="px-5 py-3 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Año</TableHead>
                <TableHead className="text-right">Transferido</TableHead>
                <TableHead>Por empresa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...d.anios].reverse().map((a) => (
                <TableRow key={a.anio}>
                  <TableCell className="font-mono tabular-nums">
                    {a.anio}
                    {a.hastaMes < 12 ? "*" : ""}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatPesos(a.devengado)}</TableCell>
                  <TableCell className="text-xs text-ink-soft">
                    {empresas(a)
                      .map(([k, v]) => `${k} ${formatPesos(v.devengado)}`)
                      .join(" · ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {enCurso && (
            <p className="mt-2 text-xs text-ink-soft">* Hasta {MESES[enCurso.hastaMes - 1]}; el año no ha terminado.</p>
          )}
        </div>
      </Plegable>
      <p className="mt-3 text-xs leading-relaxed text-ink-soft">
        Fuente: transferencias del capítulo de Obligaciones del Tesoro en la API de
        datos abiertos del SIGEF (Ministerio de Hacienda), leídas el{" "}
        {formatFecha(d.generado)}. Valor devengado. Instantánea, no consulta en vivo.
      </p>
    </Card>
  );
}
