"use client";

import Link from "next/link";
import type { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EstadoVacio } from "@/components/estado-vacio";
import { EsqueletoFilas } from "@/components/esqueleto";
import { Paginador } from "@/components/paginador";
import Antiguedad from "@/components/antiguedad";
import { IconExternal } from "@/components/icons";
import { enlace } from "@/lib/grafo";
import { formatFecha, formatPesos } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { cn } from "@/lib/cn";
import type { ClaveFacetaPedida, Exploracion, FilaExplorada } from "@/lib/explorar-tipos";
import type { PasoRastro } from "./inspector";
import { clicSimple } from "./clic";

type Consulta = ReturnType<typeof useQuery<Exploracion>>;

/**
 * Las clases del grafo con su cuenta para lo tecleado: el árbol del panel
 * izquierdo del banco (desde `lg`) y una fila de conmutadores encima de la
 * tabla en el teléfono. Una sola elección, «Todo» por defecto; las cuentas
 * no cambian al filtrar (`lib/explorar.ts`).
 */
export function Facetas({
  datos,
  faceta,
  onFaceta,
  vertical = false,
}: {
  datos: Exploracion;
  faceta: ClaveFacetaPedida | null;
  onFaceta: (f: ClaveFacetaPedida | null) => void;
  vertical?: boolean;
}) {
  const total = datos.facetas.reduce((s, f) => s + f.total, 0);
  const item = cn("min-h-11 justify-between gap-3 whitespace-normal text-left sm:min-h-9", vertical && "w-full");
  return (
    <ToggleGroup
      type="single"
      value={faceta ?? "todo"}
      onValueChange={(v) => v && onFaceta(v === "todo" ? null : (v as ClaveFacetaPedida))}
      aria-label="Filtrar por clase del grafo"
      className={cn("flex w-full flex-wrap", vertical && "flex-col items-stretch border-0 bg-transparent p-0 shadow-none")}
    >
      <ToggleGroupItem value="todo" className={item}>
        Todo <span className="font-mono text-xs tabular-nums">{formatInt(total)}</span>
      </ToggleGroupItem>
      {datos.facetas.map((f) => (
        <ToggleGroupItem key={f.clave} value={f.clave} className={item}>
          <span className="min-w-0">{f.etiqueta}</span>
          <span className="font-mono text-xs tabular-nums">{formatInt(f.total)}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * Lo hallado: una tabla densa a rayas —clase, nombre, detalle, valor,
 * fecha—, como el HTMLTable de Blueprint. La fila de un nodo abre el nodo en
 * el inspector y queda hundida mientras está abierto; la de un registro que
 * no es nodo lleva a su ficha o a su fuente. Por debajo de `sm` la tabla se
 * apila en tarjetas (`.claude/rules/identidad.md`).
 */
export function Resultados({
  consulta,
  faceta,
  nodo,
  onFaceta,
  onPagina,
  onAbrir,
}: {
  consulta: Consulta;
  faceta: ClaveFacetaPedida | null;
  nodo: string | null;
  onFaceta: (f: ClaveFacetaPedida | null) => void;
  onPagina: (p: number) => void;
  onAbrir: (p: PasoRastro) => void;
}) {
  if (consulta.isPending) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Buscando en el grafo…</span>
        <EsqueletoFilas n={10} />
      </div>
    );
  }
  if (consulta.isError) {
    return (
      <EstadoVacio
        variante="caida"
        titulo="No pudimos buscar en el grafo."
        accion={
          <Button variant="secondary" onClick={() => void consulta.refetch()}>
            Intentar de nuevo
          </Button>
        }
      >
        {consulta.error.message} Cada vertical sigue en pie con su propio buscador; el menú lleva a todas.
      </EstadoVacio>
    );
  }
  const r = consulta.data;
  if (r.cedula) {
    return (
      <EstadoVacio titulo="A una persona no se la busca por su número">
        Lo tecleado lleva una cédula. El banco no busca por ella, y la plataforma no la enseña aunque un título oficial la
        traiga: busca por el nombre, la institución o el tema.
      </EstadoVacio>
    );
  }
  const elegida = r.facetas.find((f) => f.clave === faceta);
  const total = r.facetas.reduce((s, f) => s + f.total, 0);

  return (
    <div className="space-y-3">
      <nav aria-label="Clases del grafo" className="lg:hidden">
        <Facetas datos={r} faceta={faceta} onFaceta={onFaceta} />
      </nav>

      {/* La cuenta se anuncia cuando cambia la búsqueda, no mientras se actualiza. */}
      <p className="text-xs leading-relaxed text-ink-soft" aria-live="polite">
        {r.filas.length > 0 &&
          [
            elegida
              ? `${formatInt(r.total)} en ${elegida.etiqueta.toLocaleLowerCase("es")} para «${r.consulta}»`
              : `${formatInt(total)} registros para «${r.consulta}» en ${r.facetas.length === 1 ? "una clase" : `${r.facetas.length} clases`}: primero los nodos que se llaman así y lo más pertinente de cada una; cada clase entera, en su filtro`,
            r.truncado ? "las cuentas son del índice; la lista recorre las más pertinentes" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
      </p>

      {r.filas.length === 0 ? (
        <EstadoVacio titulo={`Nada en el grafo para «${r.consulta}»${elegida ? ` entre ${elegida.etiqueta.toLocaleLowerCase("es")}` : ""}.`}>
          Prueba con menos palabras, con el nombre como lo escribe el Estado, con unas siglas (INAPA) o con un número: un RNC,
          «Ley 87-01», un código de proceso.
        </EstadoVacio>
      ) : (
        <Card as="section" aria-label={`Resultados para «${r.consulta}»`} className="overflow-hidden">
          {/* Desde `sm`: la tabla. */}
          <div className="hidden sm:block">
            {/* Anchos fijos: la clase no le quita al nombre el espacio que necesita. */}
            <Table className="tabla-densa table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[9.5rem]">Clase</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="w-[8.5rem] text-right">Valor</TableHead>
                  <TableHead className="w-[9rem] text-right">Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.filas.map((f) => (
                  <FilaTabla key={f.clave} f={f} abierta={f.ruta != null && f.ruta === nodo} onAbrir={onAbrir} />
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Por debajo de `sm`: tarjetas. */}
          <ul className="sm:hidden">
            {r.filas.map((f) => (
              <FilaTarjeta key={f.clave} f={f} abierta={f.ruta != null && f.ruta === nodo} onAbrir={onAbrir} />
            ))}
          </ul>
        </Card>
      )}

      {r.paginas > 1 && <Paginador pagina={r.pagina} paginas={r.paginas} onPage={onPagina} pendiente={consulta.isFetching} />}

      <Cortes cortes={r.cortes} />
    </div>
  );
}

/** El nombre de una fila: abre el nodo en el inspector, o lleva a su ficha o a su fuente. */
function Nombre({ f, abierta, onAbrir, className }: { f: FilaExplorada; abierta: boolean; onAbrir: (p: PasoRastro) => void; className: string }) {
  if (f.ruta) {
    return (
      <Link
        href={enlace.explorar({ nodo: f.ruta })}
        aria-current={abierta ? "true" : undefined}
        className={className}
        onClick={(e) => {
          if (!clicSimple(e)) return;
          e.preventDefault();
          onAbrir({ ruta: f.ruta!, titulo: f.titulo });
        }}
      >
        {f.titulo}
      </Link>
    );
  }
  if (f.href && f.externo) {
    return (
      <a href={f.href} target="_blank" rel="noopener noreferrer" className={cn(className, "inline-flex items-center gap-1")}>
        {f.titulo}
        <IconExternal className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
      </a>
    );
  }
  if (f.href) {
    return (
      <Link href={f.href} className={className}>
        {f.titulo}
      </Link>
    );
  }
  return <span className="font-medium text-ink">{f.titulo}</span>;
}

/** Lo que vale un proceso es lo estimado al publicarlo; una obra, lo que declara MapaInversiones. Nunca lo pagado. */
const valorEs = (f: FilaExplorada) => (f.faceta === "proceso" ? "estimado" : "declarado");

function FilaTabla({ f, abierta, onAbrir }: { f: FilaExplorada; abierta: boolean; onAbrir: (p: PasoRastro) => void }) {
  return (
    <TableRow className="relative" data-state={abierta ? "selected" : undefined}>
      <TableCell className="py-1.5 align-top">
        {/* `etiqueta` y no `sello`: la clase en versalitas espaciadas no cabe en la columna y se cortaba. */}
        <Badge forma="etiqueta" variant={f.ruta ? "firma" : "neutro"} className="whitespace-normal font-medium leading-snug">
          {f.clase}
        </Badge>
      </TableCell>
      <TableCell className="min-w-0 py-1.5">
        <Nombre f={f} abierta={abierta} onAbrir={onAbrir} className="estira line-clamp-2 text-[13px] font-medium leading-snug text-ink hover:text-brand-700" />
        {(f.detalle || f.origen) && (
          <span className="mt-0.5 line-clamp-1 block text-xs text-ink-soft">
            {[f.detalle, f.origen].filter(Boolean).join(" · ")}
            {f.via === "tema" ? " · por su tema" : ""}
          </span>
        )}
      </TableCell>
      <TableCell numerica className="whitespace-nowrap py-1.5 align-top text-[13px]">
        {f.valor != null ? (
          <>
            {formatPesos(f.valor)}
            <span className="block font-sans text-xs text-ink-soft">{valorEs(f)}</span>
          </>
        ) : (
          <span className="text-ink-soft">—</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap py-1.5 text-right align-top text-xs text-ink-soft">
        <Antiguedad iso={f.fecha} />
      </TableCell>
    </TableRow>
  );
}

function FilaTarjeta({ f, abierta, onAbrir }: { f: FilaExplorada; abierta: boolean; onAbrir: (p: PasoRastro) => void }) {
  return (
    <li className="relative border-b border-hairline px-4 py-3 last:border-0">
      <Badge forma="sello" variant={f.ruta ? "firma" : "neutro"}>
        {f.clase}
      </Badge>
      <div className="mt-1 break-words">
        <Nombre f={f} abierta={abierta} onAbrir={onAbrir} className="estira text-[15px] font-medium leading-snug text-ink hover:text-brand-700" />
      </div>
      {(f.detalle || f.origen || f.fecha || f.valor != null) && (
        <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
          {f.valor != null && (
            <span className="font-mono tabular-nums text-ink">
              {formatPesos(f.valor)} {valorEs(f)}
              {" · "}
            </span>
          )}
          {[f.detalle, f.origen].filter(Boolean).join(" · ")}
          {(f.detalle || f.origen) && f.fecha ? " · " : ""}
          <Antiguedad iso={f.fecha} />
        </p>
      )}
    </li>
  );
}

/** Las fechas de corte de lo que alimenta el índice: los registros son instantáneas, no tiempo real. */
function Cortes({ cortes }: { cortes: Record<string, string> }) {
  const lista = Object.entries(cortes);
  if (lista.length === 0) return null;
  const fechas = lista.map(([, f]) => f).sort();
  const desde = formatFecha(fechas[0]);
  const hasta = formatFecha(fechas[fechas.length - 1]);
  return (
    <p className="text-xs leading-relaxed text-ink-soft">
      Instantáneas de las fuentes del Estado, con cortes {desde === hasta ? `del ${desde}` : `entre el ${desde} y el ${hasta}`}: lo
      publicado después no está aquí todavía; el inspector lee en vivo lo que tiene fuente en vivo.{" "}
      <Link href="/fuentes" className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-0">
        Qué alimenta el grafo
      </Link>
    </p>
  );
}
