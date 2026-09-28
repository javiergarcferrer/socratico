import Link from "next/link";
import type { Metadata } from "next";
import { getResumenHistorico, nContratos, type ResumenHistorico } from "@/lib/historico";
import { hrefInstitucion, institucionPorId } from "@/lib/instituciones";
import { desdeMayusculas } from "@/lib/congreso";
import { formatFecha, formatPesos, SIN_DATO } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { SerieTemporal } from "@/components/graficos";
import { Card, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EstadoVacio } from "@/components/estado-vacio";
import Plegable from "@/components/plegable";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";
import { enlace } from "@/lib/grafo";

export const metadata: Metadata = {
  alternates: { canonical: "/historico" },
  title: "Historia de las compras públicas desde 2015",
  description:
    "Todo lo que el Estado dominicano ha contratado por el sistema de compras desde 2015: año por año, sus mayores proveedores y las instituciones que más compran.",
};

/** Instantánea regenerada a mano: un día basta. */
export const revalidate = 86400;

const VISIBLES = 20;

/** El umbral de atípicos dicho sin decimales: «RD$ 10 mil millones». */
function umbral(pesos: number): string {
  return `RD$\u00A0${(pesos / 1e9).toLocaleString("es-DO")} mil millones`;
}

function nombreInstitucion(uc: number | null, crudo: string | null): { nombre: string; href: string | null } {
  const i = uc != null ? institucionPorId(uc) : null;
  if (i) return { nombre: i.nombre, href: hrefInstitucion(i) };
  return { nombre: crudo ? desdeMayusculas(crudo) : "Sin institución asignada", href: null };
}

/**
 * ¿Cuánto ha contratado el Estado, y con quién, desde 2015? — la historia
 * entera del registro de la DGCP, agregada en build (`lib/historico.ts`).
 *
 * El orden es el de la comprensión: la cifra y su serie, quién se llevó más,
 * quién compró más, y lo que se dejó fuera de las sumas y por qué.
 */
export default async function HistoricoPage() {
  const d = await getResumenHistorico();
  if (!d || d.anios.length === 0) {
    return (
      <EstadoVacio
        variante="caida"
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="No pudimos leer la historia de las compras"
        accion={
          <Link href="/fuentes" className="text-sm font-medium text-brand-700 hover:underline">
            Ver el estado de las fuentes
          </Link>
        }
      >
        La copia agregada del registro no está disponible en este momento. No es que
        el Estado no haya contratado: es que no pudimos mirar.
      </EstadoVacio>
    );
  }

  const anioCorte = Number(d.corte.slice(0, 4));
  const completos = d.anios.filter((a) => a.anio < anioCorte && a.anio >= 2016);
  const total = d.anios.reduce((s, a) => s + a.monto, 0);
  const contratos = d.anios.reduce((s, a) => s + a.contratos, 0);
  const ultimoCompleto = completos.at(-1);
  const primero = d.anios[0];
  const enCurso = d.anios.find((a) => a.anio === anioCorte);
  const sumaAtipicos = d.atipicos.reduce((s, a) => s + a.valor, 0);
  // Un prefijo sin asignar que pese más de RD$1 mil millones cambia el ranking:
  // se dice junto al ranking, no solo en el pie.
  const mayorSinAsignar = d.sinAsignar?.find((x) => x.monto >= 1e9 && x.unidades.length > 0) ?? null;

  return (
    <div className="space-y-5">
      <Portada
        rotulo={`Compras públicas · DGCP · registro completo al ${formatFecha(d.corte)}`}
        titulo="¿Cuánto ha contratado el Estado desde 2015?"
        descripcion={
          <>
            Todos los contratos que el sistema de compras registra desde que existe,
            sumados por año, por proveedor y por institución. Es valor
            <strong className="font-medium text-canvas"> contratado</strong>, no
            pagado: lo que se firmó, en pesos, sin los contratos cancelados. Los
            contratos de {umbral(d.umbralAtipico)} o más se muestran aparte y no
            entran en ninguna suma.
          </>
        }
        aviso={`Instantánea del ${formatFecha(d.generado)}: ${formatInt(d.contratosLeidos)} contratos y ${formatInt(d.procesosLeidos)} procesos leídos`}
      >
        <PortadaCifras>
          <PortadaCifra etiqueta={`Contratado ${primero.anio}–${anioCorte}`} valor={formatPesos(total)} destacar />
          <PortadaCifra etiqueta="Contratos sumados" valor={formatInt(contratos)} />
          {ultimoCompleto && (
            <PortadaCifra etiqueta={`En ${ultimoCompleto.anio}, año completo`} valor={formatPesos(ultimoCompleto.monto)} />
          )}
          {enCurso && (
            <PortadaCifra etiqueta={`En ${anioCorte}, hasta ${formatFecha(d.corte)}`} valor={formatPesos(enCurso.monto)} />
          )}
        </PortadaCifras>
      </Portada>

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle>Año por año</CardTitle>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          Valor contratado por año de adjudicación. El sistema arrancó en 2015 con
          pocas instituciones y fue sumando las demás hasta 2018: la subida de esos
          años es sobre todo cobertura, no gasto nuevo. {anioCorte} va hasta el{" "}
          {formatFecha(d.corte)}.
        </p>
        <SerieTemporal
          forma="columnas"
          formato="pesos"
          etiqueta={`Valor contratado por año, de ${formatPesos(primero.monto)} en ${primero.anio} a ${formatPesos(d.anios.at(-1)!.monto)} en ${d.anios.at(-1)!.anio}`}
          puntos={d.anios.map((a, i) => ({
            clave: String(a.anio),
            valor: a.monto,
            lectura: `${a.anio}: ${formatPesos(a.monto)} en ${nContratos(a.contratos)}`,
            marca: i === 0 || i === d.anios.length - 1 || a.anio % 3 === 0 ? String(a.anio) : undefined,
          }))}
        />
        <Plegable
          className="-mx-5 mt-4 border-t border-hairline sm:-mx-6"
          etiqueta={`Ver los ${d.anios.length} años en una tabla`}
          etiquetaCerrar="Ocultar la tabla"
        >
          <div className="px-5 py-3 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Año</TableHead>
                  <TableHead className="text-right">Contratado</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Contratos</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Procesos</TableHead>
                  <TableHead className="text-right">Por excepción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...d.anios].reverse().map((a) => (
                  <TableRow key={a.anio}>
                    <TableCell className="font-mono tabular-nums">{a.anio}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatPesos(a.monto)}</TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">{formatInt(a.contratos)}</TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">{formatInt(a.procesos)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {a.procesos > 0 ? `${((a.excepcion / a.procesos) * 100).toFixed(1)} %` : SIN_DATO}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              «Por excepción» es la parte de los procesos publicados ese año que no
              siguió el procedimiento ordinario, según el tipo de excepción que
              declara cada proceso. Las más frecuentes en todo el registro son
              «Pasajes aéreos, reparaciones y combustibles» y «Publicidad», seguidas
              de proveedor único, exclusividad, urgencia y emergencia.
            </p>
          </div>
        </Plegable>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Ranking
          titulo="Quién se ha llevado más"
          nota={`Los ${d.proveedores.length} proveedores con más valor contratado en todo el período. Cada uno lleva a su ficha.`}
          filas={d.proveedores.map((p) => ({
            clave: p.rpe,
            nombre: p.nombre,
            href: enlace.proveedor(p.rpe),
            monto: p.monto,
            detalle: `${nContratos(p.contratos)} · ${
              p.desde.slice(0, 4) === p.hasta.slice(0, 4)
                ? `en ${p.desde.slice(0, 4)}`
                : `${p.desde.slice(0, 4)}–${p.hasta.slice(0, 4)}`
            }`,
          }))}
        />
        <Ranking
          titulo="Quién ha comprado más"
          nota={`Las ${d.instituciones.length} unidades de compra con más valor contratado en todo el período.${
            mayorSinAsignar
              ? ` No aparece ${mayorSinAsignar.unidades[0] ?? mayorSinAsignar.prefijo}: sus ${formatInt(mayorSinAsignar.contratos)} contratos (${formatPesos(mayorSinAsignar.monto)}) comparten prefijo con ${mayorSinAsignar.unidades.slice(1).join(" y ") || "otra unidad"} y no se asignan sin adivinar.`
              : ""
          }`}
          filas={d.instituciones.map((i) => {
            const n = nombreInstitucion(i.uc, i.nombre);
            return {
              clave: String(i.uc),
              nombre: n.nombre,
              href: n.href,
              monto: i.monto,
              detalle: `${nContratos(i.contratos)}`,
            };
          })}
        />
      </div>

      {d.atipicos.length > 0 && <Atipicos d={d} suma={sumaAtipicos} />}

      <p className="text-xs leading-relaxed text-ink-soft">
        Fuente: las tablas de{" "}
        <a href={d.fuentes[0]} className="font-medium text-brand-700 hover:underline">contratos</a> (CSV de
        unos 115 MB) y{" "}
        <a href={d.fuentes[1]} className="font-medium text-brand-700 hover:underline">procesos</a> (unos
        245 MB){" "}
        de datos abiertos de la Dirección General de Contrataciones Públicas,
        descargadas enteras el {formatFecha(d.generado)}. La institución de cada
        contrato se deduce del prefijo de su código, que es el de la unidad que lo
        firmó; {formatInt(d.sinInstitucion)} contratos
        {d.sinInstitucionMonto ? ` (${formatPesos(d.sinInstitucionMonto)})` : ""} no se pueden
        asignar sin adivinar y cuentan en los años pero no en ninguna institución. Quedan fuera{" "}
        {formatInt(d.cancelados)} contratos cancelados y{" "}
        {formatInt(Object.values(d.otrasMonedas).reduce((s, n) => s + n, 0))} en otras
        monedas. Ver{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          el estado de las fuentes
        </Link>
        .
      </p>
    </div>
  );
}

function Ranking({
  titulo,
  nota,
  filas,
}: {
  titulo: string;
  nota: string;
  filas: { clave: string; nombre: string; href: string | null; monto: number; detalle: string }[];
}) {
  /*
    En el teléfono el monto baja bajo el nombre: en la misma línea, «RD$ 19.5
    mil millones» se comía la mitad del ancho y los nombres se partían en
    cuatro renglones. Desde `sm` vuelve a su columna, alineada a la derecha.
  */
  const fila = (f: (typeof filas)[number], i: number) => (
    <li
      key={f.clave}
      className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 px-5 py-2.5 sm:grid-cols-[1.75rem_minmax(0,1fr)_auto] sm:px-6"
    >
      <span className="row-span-3 font-mono text-xs tabular-nums text-ink-soft sm:row-span-2">{i + 1}</span>
      {f.href ? (
        <Link href={f.href} className="block break-words text-sm leading-snug text-ink estira hover:text-brand-700">
          {f.nombre}
        </Link>
      ) : (
        <span className="block break-words text-sm leading-snug text-ink">{f.nombre}</span>
      )}
      <span className="font-mono text-sm tabular-nums sm:col-start-3 sm:row-start-1 sm:text-right">
        {formatPesos(f.monto)}
      </span>
      <span className="block text-xs text-ink-soft sm:col-start-2">{f.detalle}</span>
    </li>
  );
  const resto = filas.length - VISIBLES;
  const primeras = (
    <ol className="divide-y divide-hairline border-t border-hairline">{filas.slice(0, VISIBLES).map(fila)}</ol>
  );
  return (
    <Card as="section" className="overflow-hidden">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <CardTitle>{titulo}</CardTitle>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">{nota}</p>
      </div>
      {resto > 0 ? (
        <Plegable
          className="mt-3"
          resumen={primeras}
          etiqueta={`Ver los ${resto} siguientes`}
          etiquetaCerrar={`Ocultar los ${resto} siguientes`}
        >
          <ol className="divide-y divide-hairline">{filas.slice(VISIBLES).map((f, i) => fila(f, i + VISIBLES))}</ol>
        </Plegable>
      ) : (
        <div className="mt-3">{primeras}</div>
      )}
    </Card>
  );
}

function Atipicos({ d, suma }: { d: ResumenHistorico; suma: number }) {
  return (
    <Card as="section" className="p-5 sm:p-6">
      <CardTitle>Lo que no se sumó</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        {formatInt(d.atipicos.length)} contratos registrados por {umbral(d.umbralAtipico)}{" "}
        o más, vigentes o cerrados, que juntos declaran {formatPesos(suma)}. Algunos
        parecen errores de captura (un monto de diez mil millones y un peso exactos);
        otros pueden ser obras grandes reales, como una autopista o una línea de
        teleférico. Sin el expediente no se distinguen, así que no se suman: una sola
        cifra mal tecleada movería la serie entera. Tampoco se esconden: aquí están,
        tal como los publica el registro, para que cada uno se juzgue por separado.
      </p>
      <ol className="mt-3 divide-y divide-hairline">
        {d.atipicos.map((a) => {
          const inst = nombreInstitucion(a.uc, a.institucion);
          return (
            <li
              key={a.codigo}
              className="grid grid-cols-[minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <span className="contents">
                <span className="block min-w-0 break-words text-sm leading-snug text-ink">
                  {a.rpe ? (
                    <Link href={enlace.proveedor(a.rpe)} className="hover:text-brand-700 hover:underline">
                      {a.proveedor}
                    </Link>
                  ) : (
                    a.proveedor
                  )}
                </span>
                <span className="row-start-3 block min-w-0 text-xs text-ink-soft sm:row-start-2">
                  {inst.href ? (
                    <Link href={inst.href} className="hover:text-brand-700 hover:underline">
                      {inst.nombre}
                    </Link>
                  ) : (
                    inst.nombre
                  )}{" "}
                  · {formatFecha(a.fecha)} ·{" "}
                  <span className="whitespace-nowrap font-mono">{a.codigo}</span> · {a.estado.toLowerCase()}
                </span>
              </span>
              <span className="row-start-2 font-mono text-sm tabular-nums sm:col-start-2 sm:row-start-1 sm:text-right">
                {formatPesos(a.valor)}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
