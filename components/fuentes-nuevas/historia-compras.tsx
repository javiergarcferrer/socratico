import Link from "next/link";
import {
  historiaDeInstitucion,
  historiaDeProveedor,
  nContratos,
  prefijoSinAsignar,
  sumar,
  type HistoriaProveedor,
} from "@/lib/historico";
import { hrefInstitucion, institucionPorId } from "@/lib/instituciones";
import { desdeMayusculas } from "@/lib/congreso";
import { formatFecha, formatPesos } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { Sankey, SerieTemporal } from "@/components/graficos";
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
import { enlace } from "@/lib/grafo";

/**
 * La historia de un proveedor o de una institución en el sistema de compras,
 * desde 2015 (`lib/historico.ts`). Complementa la ventana reciente que las
 * fichas leen en vivo: aquella dice lo último, esta dice todo lo registrado.
 *
 * Si la instantánea falta o el RPE/unidad no aparece en ella, no pinta nada:
 * la ficha sigue diciendo lo suyo. Cada año se lee también en una tabla
 * desplegable: el `<title>` de una barra exige apuntar con el ratón.
 */

function nota(corte: string) {
  return (
    <p className="mt-3 text-xs leading-relaxed text-ink-soft">
      Valor contratado en pesos según el registro completo de contratos de la DGCP
      hasta el {formatFecha(corte)}; sin cancelados y sin los contratos de RD$&nbsp;10 mil
      millones o más, que se revisan aparte en{" "}
      <Link href="/historico" className="font-medium text-brand-700 hover:underline">
        la historia de las compras
      </Link>
      . Instantánea, no consulta en vivo.
    </p>
  );
}

function Atipicos({ a }: { a: [number, number] | null }) {
  if (!a || a[0] === 0) return null;
  return (
    <p className="mt-3 text-sm leading-relaxed text-ink-soft">
      Además, {a[0] === 1 ? "un contrato" : `${formatInt(a[0])} contratos`} de RD$&nbsp;10 mil millones
      o más ({formatPesos(a[1])}) que no entra{a[0] === 1 ? "" : "n"} en estas sumas: pueden ser
      obras grandes o errores de captura, y se revisan uno a uno en{" "}
      <Link href="/historico" className="font-medium text-brand-700 hover:underline">
        la historia de las compras
      </Link>
      .
    </p>
  );
}

/**
 * Lo que queda fuera de los nombrados, agregado: el total menos lo nombrado,
 * con cuántos son. `null` si no queda nada (o si redondeos lo dejan negativo).
 */
function otrosFlujos(total: number, nombrados: number[], cuantos: number, uno: string, varios: string) {
  // `uno` y `varios` ya traen su artículo: «Otra institución», «Otros N proveedores».
  const valor = total - nombrados.reduce((s, v) => s + v, 0);
  if (valor <= 0 || cuantos <= 0) return null;
  return { nombre: cuantos === 1 ? uno : varios.replace("N", formatInt(cuantos)), valor };
}

function TablaAnios({ filas }: { filas: { anio: number; contratos: number; monto: number }[] }) {
  return (
    <Plegable
      className="-mx-5 mt-3 border-t border-hairline sm:-mx-6"
      etiqueta={`Ver los ${filas.length} años en una tabla`}
      etiquetaCerrar="Ocultar la tabla"
    >
      <div className="px-5 py-3 sm:px-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Año</TableHead>
              <TableHead className="text-right">Contratado</TableHead>
              <TableHead className="text-right">Contratos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...filas].reverse().map((f) => (
              <TableRow key={f.anio}>
                <TableCell className="font-mono tabular-nums">{f.anio}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatPesos(f.monto)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatInt(f.contratos)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Plegable>
  );
}

export async function HistoriaDeProveedor({ rpe }: { rpe: string }) {
  const r = await historiaDeProveedor(rpe);
  if (!r || r.historia.serie.length === 0) return null;
  const { historia: h, corte } = r;
  const total = sumar(h.serie, 2);
  const contratos = sumar(h.serie, 1);
  const mejor = [...h.serie].sort((a, b) => b[2] - a[2])[0];

  return (
    <Card as="section" className="p-5 sm:p-6">
      <CardTitle className="text-[15px]">Toda su historia con el Estado</CardTitle>
      <p className="mt-1 text-xs text-ink-soft">
        Desde su primer contrato registrado, el {formatFecha(h.desde)}, hasta el último,
        el {formatFecha(h.hasta)}.
      </p>
      <TiraDeCifras className="mt-4 lg:grid-cols-3">
        <Cifra etiqueta="Contratado en total" valor={formatPesos(total)} ancla={{ alcance: "instantanea", periodo: `${h.desde.slice(0, 4)}–${h.hasta.slice(0, 4)}` }} />
        <Cifra etiqueta="Contratos" valor={formatInt(contratos)} />
        <Cifra etiqueta="Instituciones clientes" valor={formatInt(h.totalClientes)} />
      </TiraDeCifras>
      <Atipicos a={h.atipicos} />
      {h.serie.length > 1 && (
        <>
          <SerieTemporal
            forma="columnas"
            formato="pesos"
            etiqueta={`Valor contratado por año; su mejor año fue ${mejor[0]}, con ${formatPesos(mejor[2])}`}
            puntos={h.serie.map(([anio, n, monto], i) => ({
              clave: String(anio),
              valor: monto,
              lectura: `${anio}: ${formatPesos(monto)} en ${nContratos(n)}`,
              marca: i === 0 || i === h.serie.length - 1 ? String(anio) : undefined,
            }))}
          />
          <TablaAnios filas={h.serie.map(([anio, n, monto]) => ({ anio, contratos: n, monto }))} />
        </>
      )}
      {h.clientes.length > 0 && <SusClientes h={h} />}
      {nota(corte)}
    </Card>
  );
}

/** Quién le compra a un proveedor: sus mayores clientes y el resto agregado. */
function SusClientes({ h, rotulo = true }: { h: HistoriaProveedor; rotulo?: boolean }) {
  const total = sumar(h.serie, 2);
  return (
    <>
      {rotulo && <h3 className="rotulo mt-4 text-ink-soft">¿Quién le compra?</h3>}
      <Sankey
        sentido="entra"
        nodo="Este proveedor"
        contraparte="Institución"
        nombreTabla="instituciones"
        etiqueta={`De ${formatPesos(total)} contratados, sus ${h.clientes.length} mayores clientes y el resto agregado`}
        flujos={h.clientes.map(([uc, n, monto]) => {
          const i = institucionPorId(uc);
          return {
            clave: String(uc),
            nombre: i?.nombre ?? `Unidad de compra ${uc}`,
            valor: monto,
            detalle: nContratos(n),
            href: i ? hrefInstitucion(i) : undefined,
          };
        })}
        otros={otrosFlujos(total, h.clientes.map((c) => c[2]), h.totalClientes - h.clientes.length, "Otra institución", "Otras N instituciones")}
      />
    </>
  );
}

/**
 * Para la ficha de una empresa: quién le compra a su registro de proveedor,
 * sin repetir la historia entera, que está en la ficha del proveedor.
 */
export async function QuienLeCompra({ rpe }: { rpe: string }) {
  const r = await historiaDeProveedor(rpe);
  if (!r || r.historia.clientes.length === 0) return null;
  return (
    <Card as="section" className="p-5 sm:p-6">
      <CardTitle>¿Qué instituciones le compran?</CardTitle>
      <p className="mt-1 text-xs text-ink-soft">
        Como proveedora del Estado (<Link href={enlace.proveedor(rpe)} className="font-medium text-brand-700 hover:underline">RPE {rpe}</Link>),
        del {formatFecha(r.historia.desde)} al {formatFecha(r.historia.hasta)}.
      </p>
      <SusClientes h={r.historia} rotulo={false} />
      {nota(r.corte)}
    </Card>
  );
}

export async function HistoriaDeInstitucion({ uc, nombre }: { uc: number; nombre: string }) {
  const r = await historiaDeInstitucion(uc);
  if (!r || r.historia.serie.every((f) => f[1] === 0)) {
    // Sin serie porque su prefijo lo comparte otra unidad: se dice, no se calla.
    const sp = await prefijoSinAsignar(nombre);
    if (!sp) return null;
    return (
      <Card as="section" id="historia" className="p-5 sm:p-6">
        <CardTitle>Lo que ha contratado desde 2015</CardTitle>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Sus contratos llevan el prefijo «{sp.prefijo}», que también usa{" "}
          {sp.unidades.filter((u) => u.trim().toLowerCase() !== nombre.trim().toLowerCase()).join(" y ") ||
            "otra unidad de compra"}
          . El registro de contratos no dice cuál de las dos firmó cada uno, así que
          no los atribuimos: son {formatInt(sp.contratos)} contratos por{" "}
          {formatPesos(sp.monto)} entre ambas, contados en{" "}
          <Link href="/historico" className="font-medium text-brand-700 hover:underline">
            la historia de las compras
          </Link>{" "}
          pero en ninguna ficha.
        </p>
      </Card>
    );
  }
  const { historia: h, corte } = r;
  const total = sumar(h.serie, 2);
  const primero = h.serie[0][0];
  const ultimo = h.serie.at(-1)![0];

  return (
    <Card as="section" id="historia" className="p-5 sm:p-6">
      <CardTitle>Lo que ha contratado desde {primero}</CardTitle>
      <TiraDeCifras className="mt-4 lg:grid-cols-3">
        <Cifra etiqueta="Contratado en total" valor={formatPesos(total)} ancla={{ alcance: "instantanea", periodo: `${primero}–${ultimo}` }} />
        <Cifra etiqueta="Contratos" valor={formatInt(sumar(h.serie, 1))} />
        <Cifra etiqueta="Proveedores distintos" valor={formatInt(h.proveedores)} />
      </TiraDeCifras>
      <Atipicos a={h.atipicos} />
      {h.serie.length > 1 && (
        <>
          <SerieTemporal
            forma="columnas"
            formato="pesos"
            etiqueta={`Valor contratado por año, ${primero}–${ultimo}`}
            puntos={h.serie.map(([anio, n, monto, procesos], i) => ({
              clave: String(anio),
              valor: monto,
              lectura: `${anio}: ${formatPesos(monto)} en ${nContratos(n)}; ${formatInt(procesos)} procesos publicados`,
              marca: i === 0 || i === h.serie.length - 1 ? String(anio) : undefined,
            }))}
          />
          <TablaAnios filas={h.serie.map(([anio, n, monto]) => ({ anio, contratos: n, monto }))} />
        </>
      )}
      {h.top.length > 0 && (
        <>
          <h3 className="rotulo mt-4 text-ink-soft">¿A quién le ha contratado más?</h3>
          <Sankey
            sentido="sale"
            nodo="Esta institución"
            contraparte="Proveedor"
            nombreTabla="proveedores"
            etiqueta={`De ${formatPesos(total)} contratados, sus ${h.top.length} mayores proveedores y el resto agregado`}
            flujos={h.top.map(([rpe, nombreProv, n, monto]) => ({
              clave: rpe,
              nombre: desdeMayusculas(nombreProv) || `RPE ${rpe}`,
              valor: monto,
              detalle: nContratos(n),
              href: enlace.proveedor(rpe),
            }))}
            otros={otrosFlujos(total, h.top.map((t) => t[3]), h.proveedores - h.top.length, "Otro proveedor", "Otros N proveedores")}
          />
        </>
      )}
      {nota(corte)}
    </Card>
  );
}
