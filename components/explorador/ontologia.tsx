"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Plegable from "@/components/plegable";
import { RedVecinos, type VecinoRed } from "@/components/graficos";
import { formatInt } from "@/lib/nomina";
import { cn } from "@/lib/cn";
import { tipoDeClase } from "@/lib/objetos";
import type { ClaseVista, FuentesVista, OntologiaVista, PropiedadVista } from "@/lib/explorar-tipos";
import { FuentesDeClase } from "./fuentes";

/** Un término de la ontología como se lee en llano, si es de aquí; el nombre corto, si es de fuera (`org:Organization`, `xsd:date`). */
function nombreDe(o: OntologiaVista, curie: string): string {
  return o.clases.find((c) => c.curie === curie)?.etiqueta ?? curie;
}

const esDeAqui = (o: OntologiaVista, curie: string) => o.clases.some((c) => c.curie === curie);

/** Las clases de las que es un caso, de la más general a ella. */
function linaje(o: OntologiaVista, c: ClaseVista): ClaseVista[] {
  const salida: ClaseVista[] = [c];
  let actual = c;
  while (actual.padre) {
    const p = o.clases.find((x) => x.curie === actual.padre);
    if (!p || salida.includes(p)) break;
    salida.unshift(p);
    actual = p;
  }
  return salida;
}

/** Las propiedades que valen para una clase: las suyas y las de las clases de las que es un caso. */
function propiedadesDe(o: OntologiaVista, c: ClaseVista) {
  const arriba = new Set(linaje(o, c).map((x) => x.curie));
  const salen = o.propiedades.filter((p) => p.tipo === "objeto" && p.dominio.some((d) => arriba.has(d)));
  const llegan = o.propiedades.filter((p) => p.tipo === "objeto" && p.rango.some((r) => r === c.curie));
  const datos = o.propiedades.filter((p) => p.tipo === "dato" && p.dominio.some((d) => arriba.has(d)));
  return { salen, llegan, datos, heredadas: (p: PropiedadVista) => !p.dominio.includes(c.curie) };
}

/**
 * El árbol de clases: cada clase bajo la de la que es un caso, con cuántos
 * nodos tiene en el grafo compilado. Es el panel izquierdo del recorrido de
 * la ontología (y, en el teléfono, la lista de encima).
 */
export function ArbolDeClases({ ontologia, clase, hrefClase }: { ontologia: OntologiaVista; clase: string | null; hrefClase: (curie: string) => string }) {
  const hijos = new Map<string | null, ClaseVista[]>();
  for (const c of ontologia.clases) {
    const p = c.padre && esDeAqui(ontologia, c.padre) ? c.padre : null;
    hijos.set(p, [...(hijos.get(p) ?? []), c]);
  }
  const rama = (padre: string | null, nivel: number): ReactNode => {
    const lista = hijos.get(padre);
    if (!lista) return null;
    return (
      <ul className={cn(nivel > 0 && "ml-3 border-l border-hairline pl-2")}>
        {lista.map((c) => (
          <li key={c.curie}>
            <Link
              href={hrefClase(c.curie)}
              aria-current={c.curie === clase ? "true" : undefined}
              className={cn(
                "flex min-h-11 items-center justify-between gap-2 rounded-md px-2 py-1 text-[13px] leading-snug hover:bg-brand-50 hover:text-brand-700 sm:min-h-10",
                "aria-[current=true]:bg-brand-100 aria-[current=true]:font-semibold aria-[current=true]:text-brand-700",
                c.enUso ? "text-ink" : "text-ink-soft",
              )}
            >
              <span className="min-w-0">{c.etiqueta}</span>
              {c.nodos != null ? (
                <span className="font-mono text-xs tabular-nums text-ink-soft">{formatInt(c.nodos)}</span>
              ) : (
                !c.enUso && <span className="text-xs text-ink-soft">definida</span>
              )}
            </Link>
            {rama(c.curie, nivel + 1)}
          </li>
        ))}
      </ul>
    );
  };
  return (
    <nav aria-label="Clases de la ontología">
      {rama(null, 0)}
      <p className="mt-2 px-2 text-xs leading-relaxed text-ink-soft">
        «Definida»: una clase del modelo que el grafo todavía no llena. La cifra: sus nodos en el compilado.
      </p>
    </nav>
  );
}

/**
 * El recorrido de la ontología: la clase abierta —qué es, de qué es un caso,
 * cuántos nodos tiene—, la red de las clases con que se liga (cada una abre
 * su ficha aquí mismo), las relaciones que salen y las que llegan con la
 * clase del otro lado, y los datos que lleva. Sin clase abierta, el resumen y
 * las clases con más nodos. Todo sale de `lib/ontologia.ts`, la misma que se
 * sirve en `/ontologia` y en Turtle.
 */
export function Ontologia({
  ontologia,
  fuentes,
  clase,
  hrefClase,
  hrefFuente,
  onObjetos,
}: {
  ontologia: OntologiaVista;
  /** Lo que aporta cada fuente, si ya llegó: la ficha de una clase dice cuáles la llenan. */
  fuentes?: FuentesVista;
  clase: string | null;
  hrefClase: (curie: string) => string;
  hrefFuente: (clave: string) => string;
  /** Abre la clase en el explorador de objetos, si tiene tabla. */
  onObjetos: (tipo: string) => void;
}) {
  const c = clase ? ontologia.clases.find((x) => x.curie === clase) : null;
  return (
    <div className="space-y-3 lg:space-y-4">
      {/* En el teléfono no hay panel izquierdo: el árbol va plegado encima. */}
      <Card as="section" aria-label="Clases" className="overflow-hidden lg:hidden">
        <Plegable etiqueta={`Ver las ${ontologia.clases.length} clases`} etiquetaCerrar="Ocultar las clases">
          <div className="px-2 py-2">
            <ArbolDeClases ontologia={ontologia} clase={clase} hrefClase={hrefClase} />
          </div>
        </Plegable>
      </Card>
      {c ? (
        <>
          <FichaDeClase ontologia={ontologia} c={c} hrefClase={hrefClase} onObjetos={onObjetos} />
          {fuentes && <FuentesDeClase datos={fuentes} curie={c.curie} hrefFuente={hrefFuente} />}
        </>
      ) : (
        <Resumen ontologia={ontologia} hrefClase={hrefClase} />
      )}
    </div>
  );
}

function Resumen({ ontologia, hrefClase }: { ontologia: OntologiaVista; hrefClase: (curie: string) => string }) {
  const enUso = ontologia.clases.filter((c) => c.enUso).length;
  const objeto = ontologia.propiedades.filter((p) => p.tipo === "objeto");
  const pobladas = ontologia.clases.filter((c) => c.nodos != null).sort((a, b) => (b.nodos ?? 0) - (a.nodos ?? 0));
  return (
    <Card as="section" aria-labelledby="onto-resumen" className="px-4 py-4">
      <p className="rotulo text-ink-soft">Ontología {ontologia.version}</p>
      <CardTitle id="onto-resumen" className="mt-0.5">
        ¿De qué está hecho el grafo?
      </CardTitle>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-soft">
        {formatInt(ontologia.clases.length)} clases ({formatInt(enUso)} con datos), {formatInt(objeto.length)} relaciones entre ellas y{" "}
        {formatInt(ontologia.propiedades.length - objeto.length)} datos que llevan. Elige una clase para ver qué es, con qué se liga y
        cuáles de sus objetos hay; de clase en clase se recorre el modelo entero.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {pobladas.map((c) => (
          <li key={c.curie}>
            <Card className="relative px-3 py-2 hover:bg-brand-50">
              <Link href={hrefClase(c.curie)} className="estira text-[13px] font-semibold text-ink hover:text-brand-700">
                {c.etiqueta}
              </Link>
              <span className="block font-mono text-xs tabular-nums text-ink-soft">
                {formatInt(c.nodos ?? 0)} nodos · {c.curie}
              </span>
            </Card>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-soft">
        <Link href="/ontologia" className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-0">
          La ontología entera, para descargar en Turtle, JSON-LD y SHACL
        </Link>
      </p>
    </Card>
  );
}

function FichaDeClase({
  ontologia,
  c,
  hrefClase,
  onObjetos,
}: {
  ontologia: OntologiaVista;
  c: ClaseVista;
  hrefClase: (curie: string) => string;
  onObjetos: (tipo: string) => void;
}) {
  const { salen, llegan, datos, heredadas } = propiedadesDe(ontologia, c);
  const tipo = tipoDeClase(c.curie);
  const subclases = ontologia.clases.filter((x) => x.padre === c.curie);

  // La red: una arista por clase vecina de aquí, la primera relación es la que se escribe.
  const vecinos: VecinoRed[] = [];
  const vistos = new Set([c.curie]);
  const sumar = (curie: string, p: PropiedadVista, grupo: string) => {
    if (vistos.has(curie) || !esDeAqui(ontologia, curie)) return;
    vistos.add(curie);
    vecinos.push({ clave: curie, nombre: nombreDe(ontologia, curie), arista: p.etiqueta, grupo, href: hrefClase(curie) });
  };
  for (const p of salen) for (const r of p.rango) sumar(r, p, "Se liga con");
  for (const p of llegan) for (const d of p.dominio) sumar(d, p, "La nombran");

  return (
    <>
      <Card as="section" aria-labelledby="onto-clase" className="px-4 py-4">
        <nav aria-label="De qué es un caso" className="flex flex-wrap items-center gap-1 text-xs text-ink-soft">
          {linaje(ontologia, c).map((x, i, todos) => (
            <span key={x.curie} className="inline-flex items-center gap-1">
              {i < todos.length - 1 ? (
                <Link href={hrefClase(x.curie)} className="inline-flex min-h-11 items-center underline hover:text-brand-700 sm:min-h-0">
                  {x.etiqueta}
                </Link>
              ) : (
                <span className="font-mono">{x.curie}</span>
              )}
              {i < todos.length - 1 && <span aria-hidden>›</span>}
            </span>
          ))}
        </nav>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <CardTitle id="onto-clase" className="text-base">
            {c.etiqueta}
          </CardTitle>
          {tipo && (
            <Button onClick={() => onObjetos(tipo.id)}>
              Ver sus objetos
            </Button>
          )}
        </div>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink">{c.comentario.replace(/`/g, "")}</p>
        <p className="mt-2 text-xs text-ink-soft">
          {c.nodos != null
            ? `${formatInt(c.nodos)} nodos en el grafo compilado.`
            : c.enUso
              ? "Tiene datos en el grafo, contados en sus clases más estrechas."
              : "Definida: el grafo todavía no tiene objetos de esta clase."}
          {!tipo && c.enUso ? " Sin tabla propia: sus objetos se buscan por nombre arriba." : ""}
        </p>
        {subclases.length > 0 && (
          <p className="mt-2 text-xs text-ink-soft">
            Sus casos:{" "}
            {subclases.map((s, i) => (
              <span key={s.curie}>
                {i > 0 && ", "}
                <Link href={hrefClase(s.curie)} className="text-brand-700 underline">
                  {s.etiqueta}
                </Link>
              </span>
            ))}
          </p>
        )}
      </Card>

      {vecinos.length > 0 && (
        <Card as="section" aria-labelledby="onto-red" className="hidden px-4 py-4 lg:block">
          <CardTitle id="onto-red">Con qué clases se liga</CardTitle>
          <RedVecinos
            className="mx-auto mt-3 max-w-4xl"
            centro={c.etiqueta}
            vecinos={vecinos.slice(0, 18)}
            total={vecinos.length}
            etiqueta={`Las clases que una relación de la ontología liga con ${c.etiqueta}; cada una abre su ficha aquí`}
          />
        </Card>
      )}

      <div className="grid items-start gap-3 lg:gap-4 xl:grid-cols-2">
        <TablaRelaciones
          id="onto-salen"
          titulo="Relaciones que salen"
          vacio="Ninguna relación de la ontología sale de esta clase."
          filas={salen.map((p) => ({ p, otras: p.rango, heredada: heredadas(p) }))}
          otra="Hacia"
          ontologia={ontologia}
          hrefClase={hrefClase}
        />
        <TablaRelaciones
          id="onto-llegan"
          titulo="Relaciones que llegan"
          vacio="Ninguna relación de la ontología llega a esta clase."
          filas={llegan.map((p) => ({ p, otras: p.dominio, heredada: false }))}
          otra="Desde"
          ontologia={ontologia}
          hrefClase={hrefClase}
        />
      </div>

      {datos.length > 0 && (
        <Card as="section" aria-labelledby="onto-datos">
          <div className="px-4 pb-2 pt-3">
            <CardTitle id="onto-datos">Datos que lleva</CardTitle>
          </div>
          <Table className="tabla-densa">
            <TableHeader>
              <TableRow>
                <TableHead>Dato</TableHead>
                <TableHead className="hidden sm:table-cell">Qué es</TableHead>
                <TableHead className="text-right">Tipo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datos.map((p) => (
                <TableRow key={p.curie}>
                  <TableCell className="py-1.5 align-top text-[13px]">
                    <span className={cn("font-medium", !p.enUso && "text-ink-soft")}>{p.etiqueta}</span>
                    <span className="block font-mono text-xs text-ink-soft">{p.curie}</span>
                  </TableCell>
                  <TableCell className="hidden py-1.5 align-top text-xs leading-relaxed text-ink-soft sm:table-cell">{p.comentario.replace(/`/g, "")}</TableCell>
                  <TableCell className="whitespace-nowrap py-1.5 text-right align-top font-mono text-xs text-ink-soft">{p.rango.join(", ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}

function TablaRelaciones({
  id,
  titulo,
  vacio,
  filas,
  otra,
  ontologia,
  hrefClase,
}: {
  id: string;
  titulo: string;
  vacio: string;
  filas: { p: PropiedadVista; otras: string[]; heredada: boolean }[];
  otra: string;
  ontologia: OntologiaVista;
  hrefClase: (curie: string) => string;
}) {
  return (
    <Card as="section" aria-labelledby={id} className="min-w-0">
      <div className="px-4 pb-2 pt-3">
        <CardTitle id={id}>
          {titulo} <span className="font-mono text-xs font-normal text-ink-soft">{formatInt(filas.length)}</span>
        </CardTitle>
      </div>
      {filas.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-ink-soft">{vacio}</p>
      ) : (
        <Table className="tabla-densa">
          <TableHeader>
            <TableRow>
              <TableHead>Relación</TableHead>
              <TableHead>{otra}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map(({ p, otras, heredada }) => (
              <TableRow key={p.curie}>
                <TableCell className="py-1.5 align-top text-[13px]">
                  <span className={cn("font-medium", !p.enUso && "text-ink-soft")} title={p.comentario.replace(/`/g, "")}>
                    {p.etiqueta}
                  </span>
                  <span className="block font-mono text-xs text-ink-soft">
                    {p.curie}
                    {heredada ? " · heredada" : ""}
                  </span>
                </TableCell>
                <TableCell className="py-1.5 align-top text-[13px]">
                  {otras.map((o, i) => (
                    <span key={o}>
                      {i > 0 && <span className="text-ink-soft"> · </span>}
                      {esDeAqui(ontologia, o) ? (
                        <Link href={hrefClase(o)} className="inline-flex min-h-11 items-center text-brand-700 hover:underline sm:min-h-0">
                          {nombreDe(ontologia, o)}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-ink-soft">{o}</span>
                      )}
                    </span>
                  ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
