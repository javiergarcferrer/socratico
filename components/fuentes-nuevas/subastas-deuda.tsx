import { getSubastas, vecesCubierta, type FilaSubasta } from "@/lib/subastas";
import { puntos } from "@/lib/cifras";
import { formatFecha, formatPesos, SIN_DATO } from "@/lib/format";
import { Cifra, TiraDeCifras } from "@/components/papel";
import Plegable from "@/components/plegable";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconCoins, IconExternal } from "@/components/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * A qué tasa coloca Hacienda sus bonos en pesos y cuánta demanda encuentra:
 * el consolidado de subastas de Crédito Público (`lib/subastas.ts`,
 * instantánea de `scripts/build-subastas.py`).
 *
 * Componente de servidor. Si la instantánea falta, no pinta nada. La cifra
 * principal es la **última subasta competitiva** —la segunda ronda repite su
 * tasa y no dice nada nuevo del mercado—; todas las filas, marcadas las que el
 * archivo publica con un dato dudoso, van en la tabla desplegable.
 */

const decimal = (n: number, d: number) =>
  n.toLocaleString("es-DO", { minimumFractionDigits: d, maximumFractionDigits: d });
const porciento = (n: number) => `${decimal(n, 2)} %`;
const veces = (n: number | null) => (n == null ? SIN_DATO : `${decimal(n, 2)} veces`);

const RONDA: Record<FilaSubasta["ronda"], string> = {
  competitiva: "Competitiva",
  segunda: "Segunda ronda",
};

function TablaSubastas({ filas }: { filas: FilaSubasta[] }) {
  return (
    <Plegable
      className="-mx-5 mt-3 border-t border-hairline"
      etiqueta={`Ver las ${filas.length} rondas en una tabla`}
      etiquetaCerrar="Ocultar la tabla"
    >
      <div className="px-5 py-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Bono</TableHead>
              <TableHead className="text-right">Tasa de corte</TableHead>
              <TableHead className="text-right">Demandado</TableHead>
              <TableHead className="text-right">Adjudicado</TableHead>
              <TableHead className="text-right">Demanda / adjudicado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...filas].reverse().map((f) => (
              <TableRow key={`${f.fecha}-${f.instrumento}-${f.ronda}`}>
                <TableCell className="font-mono tabular-nums whitespace-nowrap">{formatFecha(f.fecha)}</TableCell>
                <TableCell>
                  <span className="font-mono">{f.instrumento}</span>
                  <span className="block text-xs text-ink-soft">{RONDA[f.ronda]}</span>
                  {f.alerta && (
                    <Badge variant="alerta" forma="etiqueta" className="mt-1" title={f.alerta}>
                      Vencimiento dudoso
                    </Badge>
                  )}
                </TableCell>
                <TableCell numerica>{porciento(f.tasaCorte)}</TableCell>
                <TableCell numerica className="whitespace-nowrap">{formatPesos(f.demandado)}</TableCell>
                <TableCell numerica className="whitespace-nowrap">{formatPesos(f.adjudicado)}</TableCell>
                <TableCell numerica>{veces(vecesCubierta(f))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Plegable>
  );
}

export async function SubastasDeuda() {
  const d = await getSubastas();
  if (!d) return null;

  const competitivas = d.subastas.filter((f) => f.ronda === "competitiva");
  const ultima = competitivas.at(-1);
  if (!ultima) return null;
  const previa = competitivas.at(-2) ?? null;
  const cubierta = vecesCubierta(ultima);

  const anio = Number(ultima.fecha.slice(0, 4));
  const delAnio = d.subastas.filter((f) => f.fecha.startsWith(String(anio)));
  const adjudicadoAnio = delAnio.reduce((s, f) => s + f.adjudicado, 0);
  const demandadoAnio = delAnio.reduce((s, f) => s + f.demandado, 0);
  const archivoAnio = d.archivos.find((a) => a.anio === anio);
  const restante = archivoAnio?.restanteCuadra ? archivoAnio.restantePorColocar : null;

  const alertas = d.subastas.filter((f) => f.alerta);
  const anios = [...new Set(d.archivos.map((a) => a.anio))].sort();

  return (
    <Card as="section" className="flex h-full flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <IconCoins className="h-4 w-4 text-ink-soft" />
            ¿A qué tasa se endeuda el Estado en pesos?
          </CardTitle>
          <p className="mt-0.5 text-xs text-ink-soft">
            Las subastas de bonos de Hacienda en el mercado local, según Crédito Público
          </p>
        </div>
        <Button asChild variant="link" className="-my-2 -mr-2 px-2 text-xs">
          <a href={d.pagina} target="_blank" rel="noopener noreferrer">
            Crédito Público
            <IconExternal className="h-3.5 w-3.5" />
            <span className="sr-only">(se abre en otra pestaña)</span>
          </a>
        </Button>
      </div>

      <TiraDeCifras className="-mx-5 mt-4 sm:grid-cols-3 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Cifra
            etiqueta="Tasa de la última subasta"
            valor={porciento(ultima.tasaCorte)}
            nota={`${formatFecha(ultima.fecha)} · bono ${ultima.instrumento} · instantánea`}
          />
          <p className="text-sm leading-snug text-ink-soft">
            {previa
              ? `En la subasta anterior (${formatFecha(previa.fecha)}, ${previa.instrumento}) fue ${porciento(previa.tasaCorte)}: ${
                  Math.abs(ultima.tasaCorte - previa.tasaCorte) < 0.05
                    ? "prácticamente igual"
                    : `${ultima.tasaCorte > previa.tasaCorte ? "subió" : "bajó"} ${puntos(ultima.tasaCorte, previa.tasaCorte).slice(1)}`
                }.`
              : "Es la única subasta competitiva de la instantánea; aquí no se compara."}
          </p>
          <p className="text-xs leading-snug text-ink-soft">
            Tasa de corte: el rendimiento anual que paga el Estado a quienes compraron
            {ultima.cupon != null ? `; el bono paga un cupón de ${porciento(ultima.cupon)}` : ""}
            {ultima.plazoAnios != null ? ` y vence en ${decimal(ultima.plazoAnios, 0)} años` : ""}.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Cifra
            etiqueta="Demanda frente a lo aceptado"
            valor={veces(cubierta)}
            nota={`${formatFecha(ultima.fecha)} · ronda competitiva`}
          />
          <p className="text-sm leading-snug text-ink-soft">
            Los inversionistas pidieron {formatPesos(ultima.demandado)} y Hacienda aceptó{" "}
            {formatPesos(ultima.adjudicado)}.
          </p>
          {cubierta != null && cubierta > 1 && (
            <p className="text-xs leading-snug text-ink-soft">
              Más de una vez quiere decir que sobró demanda: Hacienda eligió las ofertas
              de menor tasa hasta llenar el monto.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Cifra
            etiqueta={`Colocado en subastas en ${anio}`}
            valor={formatPesos(adjudicadoAnio)}
            nota={`${delAnio.length} rondas · instantánea`}
          />
          <p className="text-sm leading-snug text-ink-soft">
            La demanda sumó {formatPesos(demandadoAnio)} en esas rondas.
          </p>
          {restante != null && (
            <p className="text-xs leading-snug text-ink-soft">
              {restante === 0
                ? "Con eso quedan colocadas completas las emisiones que se subastaron este año."
                : `De las emisiones subastadas quedan ${formatPesos(restante)} por colocar.`}
            </p>
          )}
        </div>
      </TiraDeCifras>

      <TablaSubastas filas={d.subastas} />

      {alertas.length > 0 && (
        <p className="mt-3 text-xs leading-relaxed text-alerta-700">
          {alertas.length === 1 ? "Una fila" : `${alertas.length} filas`} del archivo de
          Crédito Público {alertas.length === 1 ? "trae" : "traen"} un dato dudoso y{" "}
          {alertas.length === 1 ? "va marcada" : "van marcadas"} en la tabla: {alertas[0].alerta}
        </p>
      )}

      <p className="mt-auto pt-3 text-xs leading-relaxed text-ink-soft">
        Consolidado anual de subastas de la Dirección General de Crédito Público
        ({anios.join(" y ")}), en pesos dominicanos, tal como lo publica. Cada subasta
        competitiva va seguida de una segunda ronda no competitiva a la misma tasa, donde
        lo demandado es igual a lo ofrecido; por eso la demanda frente a lo aceptado se
        mide en la ronda competitiva. Son solo las subastas de bonos en el mercado local:
        no incluye los bonos en dólares ni los préstamos. Es una instantánea que regenera
        un script, generada el {formatFecha(d.generado)}.
      </p>
    </Card>
  );
}
