"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { EstadoVacio } from "@/components/estado-vacio";
import { EsqueletoFilas, EsqueletoLineas } from "@/components/esqueleto";
import { Paginador } from "@/components/paginador";
import Antiguedad from "@/components/antiguedad";
import { useRebotado } from "@/components/rebotado";
import { IconChevronDown, IconChevronUpDown, IconX } from "@/components/icons";
import { claves, consultarTablas, type RespuestaSql } from "@/lib/consultas";
import { formatFecha, formatPesos, nombrePropio, tituloLegible } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { cn } from "@/lib/cn";
import {
  FILAS_POR_PAGINA,
  TIPOS_OBJETO,
  categoriaLegible,
  sqlFacetas,
  sqlFilas,
  sqlResumen,
  type ColumnaObjeto,
  type PedidoObjetos,
  type TipoObjeto,
} from "@/lib/objetos";
import type { PasoRastro } from "./inspector";
import { clicSimple } from "./clic";

/** Las tablas solo cambian con un despliegue: lo leído vale mientras la pestaña siga abierta. */
const FRESCO = 60 * 60 * 1000;

/** Una respuesta de `/api/sql` como objetos, columna → valor. */
function comoObjetos(r: RespuestaSql): Record<string, unknown>[] {
  return r.filas.map((f) => Object.fromEntries(r.columnas.map((c, i) => [c, f[i]])));
}

function useSql(sql: string | null, previa = false) {
  return useQuery({
    queryKey: claves.sql(sql ?? ""),
    queryFn: ({ signal }) => consultarTablas(sql!, signal),
    enabled: sql != null,
    staleTime: FRESCO,
    placeholderData: previa ? keepPreviousData : undefined,
  });
}

/** Los valores de cada faceta con su cuenta, para el pedido: los lee el panel izquierdo y la hoja del teléfono, con la misma clave. */
function useFacetas(p: PedidoObjetos) {
  const consulta = useSql(sqlFacetas(p), true);
  const porFaceta = new Map<string, { valor: string; n: number }[]>();
  if (consulta.data) {
    for (const f of comoObjetos(consulta.data)) {
      const lista = porFaceta.get(String(f.faceta)) ?? [];
      lista.push({ valor: f.valor == null ? "" : String(f.valor), n: Number(f.n) });
      porFaceta.set(String(f.faceta), lista);
    }
  }
  return { consulta, porFaceta };
}

/**
 * Las clases que tienen tabla: el selector del explorador de objetos. En el
 * panel izquierdo, una columna; en el teléfono, una fila que se desliza.
 */
export function ClasesDeObjeto({ tipo, onTipo, vertical = false }: { tipo: TipoObjeto; onTipo: (id: string) => void; vertical?: boolean }) {
  const item = cn("min-h-11 justify-start whitespace-nowrap text-left sm:min-h-9", vertical && "w-full whitespace-normal");
  return (
    <ToggleGroup
      type="single"
      value={tipo.id}
      onValueChange={(v) => v && onTipo(v)}
      aria-label="Clase de objeto"
      className={cn(
        "flex w-full",
        vertical ? "flex-col items-stretch border-0 bg-transparent p-0 shadow-none" : "overflow-x-auto [scrollbar-width:none]",
      )}
    >
      {TIPOS_OBJETO.map((t) => (
        <ToggleGroupItem key={t.id} value={t.id} className={item}>
          {t.etiqueta}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * Los filtros de categoría del tipo abierto, cada valor con cuántos objetos
 * lo tienen con los demás filtros puestos. Una elección por faceta; «Todos»
 * la quita.
 */
export function FiltrosDeObjeto({
  pedido,
  onFiltro,
}: {
  pedido: PedidoObjetos;
  onFiltro: (col: string, valor: string | null) => void;
}) {
  const { consulta, porFaceta } = useFacetas(pedido);
  if (pedido.tipo.facetas.length === 0) return null;
  if (consulta.isPending) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Contando los filtros…</span>
        <EsqueletoLineas n={5} />
      </div>
    );
  }
  if (consulta.isError) return <p className="px-1 text-xs text-ink-soft">No se pudieron contar los filtros: {consulta.error.message}</p>;
  const item = "min-h-11 w-full justify-between gap-3 whitespace-normal text-left sm:min-h-9";
  return (
    <div className="space-y-4">
      {pedido.tipo.facetas.map((f) => {
        const valores = porFaceta.get(f.col) ?? [];
        const puesto = pedido.filtros[f.col];
        return (
          <section key={f.col} aria-labelledby={`faceta-${f.col}`}>
            <h3 id={`faceta-${f.col}`} className="rotulo mb-1.5 px-1 text-ink-soft">
              {f.etiqueta}
            </h3>
            <ToggleGroup
              type="single"
              value={puesto ?? "__todos"}
              onValueChange={(v) => v && onFiltro(f.col, v === "__todos" ? null : v)}
              aria-label={`Filtrar por ${f.etiqueta.toLocaleLowerCase("es")}`}
              className="flex flex-col items-stretch border-0 bg-transparent p-0 shadow-none"
            >
              <ToggleGroupItem value="__todos" className={item}>
                Todos
              </ToggleGroupItem>
              {valores.map((v) => (
                <ToggleGroupItem key={v.valor} value={v.valor} className={item}>
                  <span className="min-w-0">{categoriaLegible(v.valor)}</span>
                  <span className="font-mono text-xs tabular-nums">{formatInt(v.n)}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {valores.length === 14 && <p className="mt-1 px-1 text-xs text-ink-soft">Los 14 valores con más objetos.</p>}
          </section>
        );
      })}
    </div>
  );
}

/**
 * El explorador de objetos: una clase del grafo como tabla, con el filtro de
 * texto, los de categoría (en el panel izquierdo), el orden por columna, la
 * cuenta y la suma de lo filtrado, y cada fila abriendo su nodo en el
 * inspector. Lo arma el SQL de `lib/objetos.ts` contra `/api/sql`, el mismo
 * motor de solo lectura que sirve al servidor MCP: la tabla entera, no una
 * muestra, y cada cifra con su tabla y su fecha.
 */
export function Objetos({
  pedido,
  nodo,
  hrefNodo,
  onTexto,
  onOrden,
  onFiltro,
  onHoja,
  onTipo,
  onAbrir,
}: {
  pedido: PedidoObjetos;
  nodo: string | null;
  hrefNodo: (ruta: string) => string;
  onTexto: (t: string) => void;
  onOrden: (col: string, dir: "asc" | "desc") => void;
  onFiltro: (col: string, valor: string | null) => void;
  onHoja: (h: number) => void;
  onTipo: (id: string) => void;
  onAbrir: (p: PasoRastro) => void;
}) {
  const { tipo } = pedido;
  const [texto, setTexto] = useState(pedido.texto);
  const enviado = useRef(pedido.texto);
  useEffect(() => {
    enviado.current = pedido.texto;
    setTexto(pedido.texto);
  }, [pedido.texto, tipo.id]);
  const rebotado = useRebotado(texto.trim(), 250);
  useEffect(() => {
    if (rebotado === enviado.current) return;
    enviado.current = rebotado;
    onTexto(rebotado);
  }, [rebotado, onTexto]);

  const filas = useSql(sqlFilas(pedido), true);
  const resumen = useSql(sqlResumen(pedido), true);
  const r = resumen.data ? comoObjetos(resumen.data)[0] : null;
  const total = r ? Number(r.n) : null;
  const suma = r && r.suma != null ? Number(r.suma) : null;
  const paginas = total != null ? Math.max(1, Math.ceil(total / FILAS_POR_PAGINA)) : 1;
  const puestos = tipo.facetas.filter((f) => pedido.filtros[f.col] != null);
  const generadas = filas.data?.generadas ?? resumen.data?.generadas ?? null;
  const ordenada = tipo.columnas.find((c) => c.col === pedido.orden && c.ordena) ?? tipo.columnas.find((c) => c.col === tipo.orden.col)!;

  return (
    <div className="space-y-3">
      {/* En el teléfono no hay panel izquierdo: la clase se elige aquí. */}
      <nav aria-label="Clases de objeto" className="lg:hidden">
        <ClasesDeObjeto tipo={tipo} onTipo={onTipo} />
      </nav>

      {/* Un contenedor: las columnas secundarias salen según el ancho de la tabla, no el de la ventana (el inspector se lo come). */}
      <Card as="section" aria-labelledby="objetos-titulo" className="@container overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-hairline px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="rotulo text-ink-soft">{tipo.clase}</p>
            <CardTitle id="objetos-titulo" className="mt-0.5">
              {tipo.etiqueta}
            </CardTitle>
            <p className="mt-0.5 text-xs text-ink-soft">
              La tabla entera, de {tipo.fuente}
              {generadas ? `, generada el ${formatFecha(generadas)}` : ""}. Cada fila abre su nodo en el inspector.
            </p>
          </div>
          <div className="w-full lg:w-80">
            <Label htmlFor="objetos-filtro" className="sr-only">
              Filtrar {tipo.etiqueta.toLocaleLowerCase("es")}
            </Label>
            <Input
              id="objetos-filtro"
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={`Filtrar por ${tipo.busca.map((c) => tipo.columnas.find((x) => x.col === c)?.etiqueta.toLocaleLowerCase("es") ?? (c === "codigo" ? "código" : c.toUpperCase())).join(", ")}`}
              autoComplete="off"
            />
          </div>
        </div>

        <TiraDeCifras className={cn("border-0 border-b border-hairline", tipo.suma ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
          <Cifra
            etiqueta={puestos.length || pedido.texto ? `${tipo.etiqueta} que cumplen el filtro` : `${tipo.etiqueta} en la tabla`}
            valor={total != null ? formatInt(total) : resumen.isError ? "—" : "…"}
            nota={resumen.isError ? "El motor no contestó" : total != null && total > FILAS_POR_PAGINA ? `${FILAS_POR_PAGINA} por página` : undefined}
          />
          {tipo.suma && (
            <Cifra
              etiqueta={`Suma: ${tipo.columnas.find((c) => c.col === tipo.suma!.col)?.etiqueta.toLocaleLowerCase("es") ?? tipo.suma.col}`}
              valor={suma != null ? formatPesos(suma) : resumen.isError ? "—" : "…"}
              nota={tipo.suma.es}
            />
          )}
          <Cifra etiqueta="Orden" valor={<span className="font-sans text-base">{ordenada.etiqueta}</span>} nota={sentido(ordenada, pedido.dir)} />
        </TiraDeCifras>

        {/* Los filtros puestos, cada uno con su forma de quitarlo: el valor por defecto se ve, no se adivina. */}
        {(puestos.length > 0 || pedido.texto) && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline px-4 py-2" aria-label="Filtros puestos">
            {pedido.texto && (
              <Button variant="outline" size="sm" onClick={() => onTexto("")} aria-label={`Quitar el filtro «${pedido.texto}»`}>
                «{pedido.texto}»
                <IconX className="h-3.5 w-3.5" />
              </Button>
            )}
            {puestos.map((f) => (
              <Button key={f.col} variant="outline" size="sm" onClick={() => onFiltro(f.col, null)} aria-label={`Quitar ${f.etiqueta}: ${categoriaLegible(pedido.filtros[f.col])}`}>
                <span className="text-ink-soft">{f.etiqueta}:</span> {categoriaLegible(pedido.filtros[f.col])}
                <IconX className="h-3.5 w-3.5" />
              </Button>
            ))}
          </div>
        )}

        {filas.isPending ? (
          <div role="status" aria-busy="true" className="p-4">
            <span className="sr-only">Leyendo la tabla…</span>
            <EsqueletoFilas n={10} />
          </div>
        ) : filas.isError ? (
          <div className="p-4">
            <EstadoVacio
              variante="caida"
              titulo="El motor de las tablas no contestó."
              accion={
                <Button variant="secondary" onClick={() => void filas.refetch()}>
                  Intentar de nuevo
                </Button>
              }
            >
              {filas.error.message} La búsqueda de arriba y el inspector siguen en pie: leen el grafo, no las tablas.
            </EstadoVacio>
          </div>
        ) : filas.data.filas.length === 0 ? (
          <div className="p-4">
            <EstadoVacio titulo={`Ningún objeto de ${tipo.etiqueta.toLocaleLowerCase("es")} cumple el filtro.`}>
              Quita un filtro o prueba con menos letras: el filtro busca la cadena dentro del nombre, sin tildes ni mayúsculas.
            </EstadoVacio>
          </div>
        ) : (
          <Rejilla
            tipo={tipo}
            datos={filas.data}
            pedido={pedido}
            nodo={nodo}
            hrefNodo={hrefNodo}
            onOrden={onOrden}
            onAbrir={onAbrir}
            actualizando={filas.isFetching}
          />
        )}
      </Card>

      {paginas > 1 && <Paginador pagina={pedido.pagina} paginas={paginas} onPage={onHoja} pendiente={filas.isFetching} etiqueta={`Páginas de ${tipo.etiqueta.toLocaleLowerCase("es")}`} />}

      {/* En el teléfono, los filtros de categoría van debajo de la tabla. */}
      {tipo.facetas.length > 0 && (
        <Card as="section" aria-label="Filtros de categoría" className="px-3 py-3 lg:hidden">
          <FiltrosDeObjeto pedido={pedido} onFiltro={onFiltro} />
        </Card>
      )}
    </div>
  );
}

/** Una celda según el formato de su columna. */
function Valor({ c, v }: { c: ColumnaObjeto; v: unknown }) {
  if (v == null || v === "") return <span className="text-ink-soft">—</span>;
  switch (c.formato) {
    case "pesos":
      return <>{formatPesos(Number(v))}</>;
    case "entero":
      return <>{formatInt(Number(v))}</>;
    case "porcentaje":
      return <>{`${Math.round(Number(v))} %`}</>;
    case "fecha":
      return <Antiguedad iso={String(v)} />;
    case "categoria":
      return <>{categoriaLegible(v)}</>;
    case "codigo":
      return <span className="font-mono">{String(v)}</span>;
    default:
      return <>{String(v)}</>;
  }
}

/** El sentido del orden en llano, según lo que se ordena. */
function sentido(c: ColumnaObjeto, dir: "asc" | "desc"): string {
  if (c.formato === "fecha") return dir === "asc" ? "De la más antigua a la más reciente" : "De la más reciente a la más antigua";
  if (numerica(c)) return dir === "asc" ? "De menor a mayor" : "De mayor a menor";
  return dir === "asc" ? "De la A a la Z" : "De la Z a la A";
}

const numerica = (c: ColumnaObjeto) => c.formato === "pesos" || c.formato === "entero" || c.formato === "porcentaje";

function Rejilla({
  tipo,
  datos,
  pedido,
  nodo,
  hrefNodo,
  onOrden,
  onAbrir,
  actualizando,
}: {
  tipo: TipoObjeto;
  datos: RespuestaSql;
  pedido: PedidoObjetos;
  nodo: string | null;
  hrefNodo: (ruta: string) => string;
  onOrden: (col: string, dir: "asc" | "desc") => void;
  onAbrir: (p: PasoRastro) => void;
  actualizando: boolean;
}) {
  const filas = comoObjetos(datos);
  const resto = tipo.columnas.slice(1);
  const ordenActual = tipo.columnas.some((c) => c.col === pedido.orden && c.ordena) ? pedido.orden : tipo.orden.col;

  /** El nombre de la fila: abre el nodo en el inspector; con ctrl o en otra pestaña, el banco con el nodo abierto. */
  const nombreDe = (f: Record<string, unknown>, className: string) => {
    const ruta = tipo.ruta(f);
    const original = String(f._titulo ?? "");
    const titulo = tipo.caja === "nombre" ? nombrePropio(original) : tipo.caja === "oracion" ? tituloLegible(original) : original;
    const comoVino = titulo !== original ? original : undefined;
    if (!ruta) return <span className={className} title={comoVino}>{titulo}</span>;
    return (
      <Link
        href={hrefNodo(ruta)}
        aria-current={ruta === nodo ? "true" : undefined}
        title={comoVino}
        className={className}
        onClick={(e) => {
          if (!clicSimple(e)) return;
          e.preventDefault();
          onAbrir({ ruta, titulo });
        }}
      >
        {titulo}
      </Link>
    );
  };

  const cabeza = (c: ColumnaObjeto) => {
    const activa = ordenActual === c.col;
    const dir = activa ? pedido.dir : null;
    if (!c.ordena) return <TableHead key={c.col} className={cn(numerica(c) && "text-right", c.ancha && "hidden @3xl:table-cell")}>{c.etiqueta}</TableHead>;
    const siguiente = activa ? (dir === "asc" ? "desc" : "asc") : numerica(c) || c.formato === "fecha" ? "desc" : "asc";
    return (
      <TableHead
        key={c.col}
        aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
        className={cn("p-0", numerica(c) && "text-right", c.ancha && "hidden @3xl:table-cell")}
      >
        <button
          type="button"
          onClick={() => onOrden(c.col, siguiente)}
          className={cn(
            "rotulo inline-flex min-h-9 w-full items-center gap-1 px-3 py-2 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            numerica(c) && "justify-end",
            activa ? "text-ink" : "text-ink-soft",
          )}
        >
          {c.etiqueta}
          {activa ? (
            <IconChevronDown className={cn("h-3.5 w-3.5 shrink-0", dir === "asc" && "rotate-180")} />
          ) : (
            <IconChevronUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          )}
          <span className="sr-only">{activa ? (dir === "asc" ? ", de menor a mayor" : ", de mayor a menor") : ", ordenar"}</span>
        </button>
      </TableHead>
    );
  };

  return (
    <div aria-busy={actualizando || undefined} className={cn(actualizando && "opacity-70")}>
      {/* Desde `sm`: la rejilla. */}
      <div className="hidden sm:block">
        <Table className="tabla-densa">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-right">#</TableHead>
              {tipo.columnas.map(cabeza)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f, i) => {
              const ruta = tipo.ruta(f);
              return (
                <TableRow key={ruta ?? `${pedido.pagina}-${i}`} className="relative" data-state={ruta && ruta === nodo ? "selected" : undefined}>
                  <TableCell numerica className="py-1.5 align-top text-xs text-ink-soft">
                    {formatInt((pedido.pagina - 1) * FILAS_POR_PAGINA + i + 1)}
                  </TableCell>
                  <TableCell className="min-w-[14rem] py-1.5 align-top">
                    {nombreDe(f, "estira line-clamp-2 text-[13px] font-medium leading-snug text-ink hover:text-brand-700")}
                  </TableCell>
                  {resto.map((c) => (
                    <TableCell
                      key={c.col}
                      numerica={numerica(c)}
                      className={cn(
                        "py-1.5 align-top text-[13px]",
                        numerica(c) && "whitespace-nowrap",
                        c.formato === "fecha" && "whitespace-nowrap text-xs text-ink-soft",
                        c.formato === "categoria" && "text-xs",
                        c.formato === "texto" && "max-w-[18rem]",
                        c.ancha && "hidden @3xl:table-cell",
                      )}
                    >
                      <span className={cn(c.formato === "texto" && "line-clamp-2")}>
                        <Valor c={c} v={f[c.col]} />
                      </span>
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {/* Por debajo de `sm`: tarjetas, con las columnas como renglones. */}
      <ul className="sm:hidden">
        {filas.map((f, i) => {
          const ruta = tipo.ruta(f);
          return (
            <li key={ruta ?? `${pedido.pagina}-${i}`} className="relative border-b border-hairline px-4 py-3 last:border-0">
              {nombreDe(f, "estira block text-[15px] font-medium leading-snug text-ink hover:text-brand-700")}
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                {resto.map((c) =>
                  f[c.col] == null || f[c.col] === "" ? null : (
                    <div key={c.col} className="contents">
                      <dt className="text-ink-soft">{c.etiqueta}</dt>
                      <dd className={cn("min-w-0 break-words text-ink", numerica(c) && "font-mono tabular-nums")}>
                        <Valor c={c} v={f[c.col]} />
                      </dd>
                    </div>
                  ),
                )}
              </dl>
            </li>
          );
        })}
      </ul>
      {datos.truncada && (
        <p className="border-t border-hairline px-4 py-2 text-xs text-ink-soft">
          El motor recortó la respuesta: esta página trae menos filas de las que cumplen el filtro. Afina el filtro.
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {`${formatInt(filas.length)} filas en esta página`}
      </p>
    </div>
  );
}
