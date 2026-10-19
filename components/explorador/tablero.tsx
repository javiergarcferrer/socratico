"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { MarcaEstado } from "@/components/marca-estado";
import { BarrasHorizontales } from "@/components/graficos";
import { EsqueletoLineas } from "@/components/esqueleto";
import Antiguedad from "@/components/antiguedad";
import { abiertosAhora, claves } from "@/lib/consultas";
import { formatFecha, formatHora, formatPesos } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import type { AbiertosAhora, Pulso } from "@/lib/explorar-tipos";

/**
 * La consulta de lo abierto ahora en todo el Estado: la comparten el tablero
 * y la barra de estado del banco, así que se pide una vez.
 */
export function useAbiertos() {
  return useQuery({
    queryKey: claves.abiertos,
    queryFn: ({ signal }) => abiertosAhora<AbiertosAhora>(signal),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * El tablero de inicio del banco de trabajo: lo que hay en el grafo y lo que
 * pasa ahora, antes de buscar nada. Cuatro cifras (los nodos y los triples
 * del compilado, lo abierto a ofertas hoy según la DGCP, las fuentes), los
 * nodos por clase, las licitaciones abiertas más recientes —en vivo— y cada
 * fuente con su fecha de corte. Cada cifra dice de dónde sale y a qué fecha:
 * las del grafo son de su compilación; la de la DGCP, de la lectura de hace
 * un momento.
 */
export function Tablero({ pulso }: { pulso: Pulso | null }) {
  const abiertos = useAbiertos();
  const conCorte = pulso?.fuentes.filter((f) => !f.derivado) ?? [];

  return (
    <div className="space-y-3 lg:space-y-4">
      <Card as="section" aria-label="El grafo en cifras">
        <TiraDeCifras className="border-0">
          <Cifra
            etiqueta="Nodos en el grafo"
            valor={pulso ? formatInt(pulso.nodos) : "—"}
            nota={pulso?.compilado ? `${pulso.clases} clases · compilado el ${formatFecha(pulso.compilado)}` : undefined}
          />
          <Cifra
            etiqueta="Triples RDF"
            valor={pulso ? formatInt(pulso.triples) : "—"}
            nota="Cada uno con su fuente y su corte, o su regla"
          />
          <Cifra
            etiqueta="Abiertos a ofertas ahora"
            valor={abiertos.data ? formatInt(abiertos.data.total) : abiertos.isError ? "—" : "…"}
            href={abiertos.data ? "/licitaciones" : undefined}
            nota={
              abiertos.data
                ? `DGCP en vivo, leída a las ${formatHora(abiertos.data.leido)}`
                : abiertos.isError
                  ? "La DGCP no contestó"
                  : "Leyendo la DGCP…"
            }
          />
          <Cifra
            etiqueta="Fuentes con corte"
            valor={formatInt(conCorte.length)}
            nota={pulso ? `y ${formatInt(pulso.fuentes.length - conCorte.length)} reglas que derivan de ellas` : undefined}
          />
        </TiraDeCifras>
      </Card>

      <Card as="section" aria-labelledby="tablero-abiertos" className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-2 pt-3">
          <div>
            <CardTitle id="tablero-abiertos" className="flex items-center gap-2">
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              Abierto a ofertas ahora
            </CardTitle>
            <p className="mt-0.5 text-xs text-ink-soft">Lo más reciente que publicó el Estado y todavía recibe ofertas, de la DGCP en vivo.</p>
          </div>
          <Link href="/licitaciones" className="inline-flex min-h-11 items-center text-xs text-brand-700 underline sm:min-h-0">
            Todas, con filtros
          </Link>
        </div>
        {abiertos.isPending ? (
          <div role="status" aria-busy="true" className="px-4 pb-4">
            <span className="sr-only">Leyendo la DGCP…</span>
            <EsqueletoLineas n={6} />
          </div>
        ) : abiertos.isError ? (
          <div className="space-y-2 px-4 pb-4 text-xs text-ink-soft">
            <p>{abiertos.error.message}</p>
            <Button variant="secondary" size="sm" onClick={() => void abiertos.refetch()}>
              Leerla otra vez
            </Button>
          </div>
        ) : (
          <Table className="tabla-densa">
            <TableHeader>
              <TableRow>
                <TableHead>Estado</TableHead>
                <TableHead>Qué se compra</TableHead>
                <TableHead className="text-right">Estimado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {abiertos.data.filas.map((f) => (
                <TableRow key={f.href ?? f.titulo} className="relative">
                  <TableCell className="py-2 align-top">
                    {f.marca && (
                      <MarcaEstado tono={f.marca.tono} title={f.marca.original ?? undefined}>
                        {f.marca.texto}
                      </MarcaEstado>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[14rem] py-2">
                    {f.href ? (
                      <Link href={f.href} className="estira line-clamp-2 text-[13px] font-medium leading-snug text-ink hover:text-brand-700">
                        {f.titulo}
                      </Link>
                    ) : (
                      <span className="line-clamp-2 text-[13px] font-medium leading-snug">{f.titulo}</span>
                    )}
                    <span className="mt-0.5 block text-xs text-ink-soft">
                      {f.detalle}
                      {f.fecha ? " · " : ""}
                      <Antiguedad iso={f.fecha} prefijo={f.prefijoFecha ?? undefined} />
                    </span>
                  </TableCell>
                  <TableCell numerica className="whitespace-nowrap py-2 align-top text-[13px]">
                    {f.monto != null ? formatPesos(f.monto) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <div className="grid items-start gap-3 lg:gap-4 xl:grid-cols-2">
        {pulso && (
          <Card as="section" aria-labelledby="tablero-clases" className="px-4 py-3">
            <CardTitle id="tablero-clases">Nodos por clase</CardTitle>
            <p className="mt-0.5 text-xs text-ink-soft">Cuántos registros de cada clase son nodos del grafo compilado.</p>
            <BarrasHorizontales
              className="mt-3"
              etiqueta="Nodos del grafo por clase"
              barras={pulso.porClase.map((c) => ({ clave: c.tipo, etiqueta: c.clase, valor: c.nodos, cifra: formatInt(c.nodos) }))}
              lineas={1}
            />
          </Card>
        )}

        {pulso && (
          <Card as="section" aria-labelledby="tablero-fuentes">
            <div className="px-4 pb-2 pt-3">
              <CardTitle id="tablero-fuentes">De dónde sale el grafo</CardTitle>
              <p className="mt-0.5 text-xs text-ink-soft">
                Cada triple vive en el grafo con nombre de su fuente y su corte, o de la regla que lo deduce de otras.
              </p>
            </div>
            <Table className="tabla-densa">
              <TableHeader>
                <TableRow>
                  <TableHead>Fuente o regla</TableHead>
                  <TableHead className="text-right">Corte</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pulso.fuentes.map((f) => (
                  <TableRow key={f.clave}>
                    <TableCell className="py-1.5 text-[13px]">{f.etiqueta}</TableCell>
                    <TableCell numerica className="whitespace-nowrap py-1.5 text-[13px] text-ink-soft">
                      {f.derivado ? "regla" : f.corte ? formatFecha(f.corte) : "sin corte"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="border-t border-hairline px-4 py-2 text-xs text-ink-soft">
              <Link href="/fuentes" className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-0">
                Qué alimenta la plataforma, con sus límites
              </Link>
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
