import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getSociedad, type Licencias, type Matricula, type Robos, type Sociedad } from "@/lib/sociedad";
import { provinciaDeTexto } from "@/lib/provincias";
import { formatFecha, formatPesos, SIN_DATO } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { variacion } from "@/lib/cifras";
import { cn } from "@/lib/cn";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { FilaBarra, SerieTemporal } from "@/components/graficos";
import { enlace } from "@/lib/grafo";

export const metadata: Metadata = {
  alternates: { canonical: "/pais" },
  title: "Seguridad, escuela y vivienda",
  description:
    "Denuncias de robo por tipo y provincia, armas incautadas y registradas, estudiantes matriculados por nivel y regional, y licencias de construcción por provincia y municipio, según el Ministerio de Interior y Policía, el MINERD y el MIVHED.",
};

/** Series anuales en una instantánea: un día basta. */
export const revalidate = 86400;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const TRIMESTRE = ["", "enero–marzo", "abril–junio", "julio–septiembre", "octubre–diciembre"];
const HASTA_MES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «+1,234 (+5.6 %)» / «−1,234 (−5.6 %)» — la dirección no es valencia. */
function cambio(actual: number, anterior: number | null | undefined): string | null {
  const v = variacion(actual, anterior);
  if (!v) return null;
  const s = v.abs >= 0 ? "+" : "−";
  const abs = `${s}${formatInt(Math.abs(v.abs))}`;
  return v.pct == null ? abs : `${abs} (${s}${Math.abs(v.pct).toFixed(1)} %)`;
}

function pct(parte: number, total: number): string {
  return total > 0 ? `${((parte / total) * 100).toFixed(1)} %` : SIN_DATO;
}

/**
 * Una fila «nombre … cifra» con su barra: la primitiva `FilaBarra`, en filas a
 * sangre. Con `provincia`, el nombre se reconoce y la fila entera lleva a su
 * ficha; si no se reconoce, se escribe tal cual y no enlaza.
 */
function Fila({ nombre, provincia, valor, detalle, max, actual }: {
  nombre?: ReactNode;
  provincia?: string;
  valor: string;
  detalle?: string;
  max: number;
  actual: number;
}) {
  const p = provincia ? provinciaDeTexto(provincia) : null;
  return (
    <FilaBarra
      filas
      lineas={2}
      puesto={0}
      maximo={Math.max(1, max)}
      barra={{
        clave: provincia ?? "",
        etiqueta: p ? p.nombre : (nombre ?? provincia),
        valor: actual,
        cifra: valor,
        detalle,
        href: p ? enlace.provincia(p.slug) : undefined,
      }}
    />
  );
}

/** Una lista larga: las primeras `visibles` siempre, el resto a un toque. */
function ListaPlegable<T>({ filas, visibles, render, etiqueta }: {
  filas: T[];
  visibles: number;
  render: (f: T) => ReactNode;
  etiqueta: (resto: number) => string;
}) {
  const resto = filas.length - visibles;
  const cabeza = <ol className="divide-y divide-hairline">{filas.slice(0, visibles).map(render)}</ol>;
  if (resto <= 0) return <div className="-mx-5 mt-3 border-t border-hairline sm:-mx-6">{cabeza}</div>;
  return (
    <Plegable
      className="-mx-5 mt-3 border-t border-hairline sm:-mx-6"
      resumen={cabeza}
      etiqueta={etiqueta(resto)}
      etiquetaCerrar="Ocultar"
    >
      <ol className="divide-y divide-hairline">{filas.slice(visibles).map(render)}</ol>
    </Plegable>
  );
}

function Fuente({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-xs leading-relaxed text-ink-soft">{children}</p>;
}

function Advertencias({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-soft">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

function BloqueCaido({ que, origen, enlace }: { que: string; origen: string; enlace: string }) {
  return (
    <EstadoVacio
      variante="caida"
      como="h2"
      titulo={`No pudimos leer ${que}`}
      accion={
        <Button asChild variant="secondary">
          <a href={enlace} target="_blank" rel="noopener noreferrer">
            Ir a {origen}
            <span className="sr-only">(se abre en otra pestaña)</span>
          </a>
        </Button>
      }
    >
      El archivo no cuadró al generar la instantánea y preferimos no mostrar una cifra
      que no pudimos comprobar. Las demás secciones de esta página siguen en pie.
    </EstadoVacio>
  );
}

/* ------------------------------------------------------------ seguridad */

function SeccionRobos({ r, armas }: { r: Robos; armas: Sociedad["armas"] }) {
  const ult = r.porAnio[r.porAnio.length - 1];
  const prev = r.porAnio.find((a) => a.anio === r.ultimoAnio - 1);
  const primero = r.porAnio[0];
  const maxProv = r.porProvinciaUltimoAnio[0]?.denuncias ?? 1;
  const maxTipo = r.porTipoUltimoAnio[0]?.denuncias ?? 1;
  const cambioTodos = ult.todos != null && prev?.todos != null ? cambio(ult.todos, prev.todos) : null;
  const tiposLargos = r.tiposSerieLarga.map((t) => t.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " y $1");
  const mesMax = r.mesesUltimoAnio.indexOf(Math.max(...r.mesesUltimoAnio));
  const mesMin = r.mesesUltimoAnio.indexOf(Math.min(...r.mesesUltimoAnio));

  return (
    <section id="seguridad-ciudadana" className="scroll-mt-24 space-y-5">
      <Card className="p-5 sm:p-6">
        <CardTitle as="h2">¿Cuántos robos se denuncian?</CardTitle>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          En {r.ultimoAnio} la Policía Nacional recibió{" "}
          <span className="font-mono font-semibold tabular-nums text-ink">{formatInt(r.totalUltimoAnio)}</span>{" "}
          denuncias de robo de todos los tipos
          {cambioTodos && prev ? `, ${cambioTodos} frente a ${prev.anio}` : ""}. Cada mes entraron entre{" "}
          {formatInt(r.mesesUltimoAnio[mesMin])} ({MESES[mesMin]}) y {formatInt(r.mesesUltimoAnio[mesMax])} ({MESES[mesMax]}).
        </p>

        <p className="mt-4 text-xs leading-relaxed text-ink-soft">
          La serie que viene desde {primero.anio} solo cubre {tiposLargos}: de{" "}
          {formatInt(primero.serieLarga)} denuncias en {primero.anio} a {formatInt(ult.serieLarga)} en {ult.anio}.
        </p>
        <SerieTemporal
          forma="columnas"
          formato="entero"
          etiqueta={`Denuncias de robo de ${tiposLargos} por año, de ${formatInt(primero.serieLarga)} en ${primero.anio} a ${formatInt(ult.serieLarga)} en ${ult.anio}`}
          puntos={r.porAnio.map((a, i) => ({
            clave: String(a.anio),
            valor: a.serieLarga,
            lectura: `${a.anio}: ${formatInt(a.serieLarga)} denuncias`,
            marca: i === 0 || i === r.porAnio.length - 1 || a.anio % 2 === 0 ? String(a.anio) : undefined,
          }))}
        />
        <Plegable
          className="-mx-5 mt-4 border-t border-hairline sm:-mx-6"
          etiqueta={`Ver los ${r.porAnio.length} años por tipo en una tabla`}
          etiquetaCerrar="Ocultar la tabla"
        >
          <div className="px-5 py-3 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Año</TableHead>
                  {r.tiposSerieLarga.map((t) => (
                    <TableHead key={t} className={t === "Motocicletas" ? "text-right" : "hidden text-right sm:table-cell"}>
                      {t}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Todos los tipos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...r.porAnio].reverse().map((a) => (
                  <TableRow key={a.anio}>
                    <TableCell className="font-mono tabular-nums">{a.anio}</TableCell>
                    {r.tiposSerieLarga.map((t) => (
                      <TableCell
                        key={t}
                        className={cn("text-right font-mono tabular-nums", t !== "Motocicletas" && "hidden sm:table-cell")}
                      >
                        {formatInt(a.porTipo[t] ?? 0)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-mono tabular-nums">
                      {a.todos != null ? formatInt(a.todos) : "no publicado"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Plegable>

        <Advertencias
          items={[
            <>Son <strong className="font-semibold text-ink">denuncias</strong>, no robos ocurridos: un robo que nadie denuncia no está, y más denuncias pueden querer decir más confianza en denunciar tanto como más robos.</>,
            <>Los demás tipos (robo simple, asalto, arrebato, roturas) solo vienen desde 2024; por eso el total de todos los tipos empieza ahí. El origen aclara que esa base no incluye los robos de vehículos ni de armas: se suman sin contar dos veces.</>,
            <>En el último trimestre de 2024 la «rotura (escalamiento)» se partió en rotura a negocio, a residencia y a vehículo: comparar esos tipos entre 2024 y {r.ultimoAnio} no es comparar lo mismo.</>,
            <>La serie larga salta en 2024, sobre todo por las motocicletas, y el origen no explica si cambió la forma de registrar. Las cifras son provisionales, según el propio archivo.</>,
          ]}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <CardTitle as="h3">¿Qué se roba?</CardTitle>
          <p className="mt-1 text-xs text-ink-soft">Denuncias de {r.ultimoAnio} por tipo de robo.</p>
          <ol className="-mx-5 mt-3 divide-y divide-hairline border-t border-hairline sm:-mx-6">
            {r.porTipoUltimoAnio.map((t) => (
              <Fila
                key={t.tipo}
                nombre={t.tipo}
                valor={formatInt(t.denuncias)}
                detalle={pct(t.denuncias, r.totalUltimoAnio)}
                max={maxTipo}
                actual={t.denuncias}
              />
            ))}
          </ol>
        </Card>

        <Card className="p-5 sm:p-6">
          <CardTitle as="h3">¿Dónde se denuncia?</CardTitle>
          <p className="mt-1 text-xs text-ink-soft">
            Denuncias de {r.ultimoAnio} por provincia, todos los tipos. Son números absolutos:
            una provincia más poblada tiene más denuncias.
            {r.sinProvinciaUltimoAnio > 0 &&
              ` Otras ${formatInt(r.sinProvinciaUltimoAnio)} llegaron sin provincia («#N/D» en el origen).`}
          </p>
          <ListaPlegable
            filas={r.porProvinciaUltimoAnio}
            visibles={8}
            etiqueta={(n) => `Ver las otras ${n} provincias`}
            render={(p) => (
              <Fila
                key={p.provincia}
                provincia={p.provincia}
                valor={formatInt(p.denuncias)}
                max={maxProv}
                actual={p.denuncias}
              />
            )}
          />
        </Card>
      </div>

      {armas && (armas.incautadas || armas.registradas) && (
        <div className="grid gap-5 lg:grid-cols-2">
          {armas.incautadas && (() => {
            const inc = armas.incautadas;
            const completos = inc.porAnio.filter((a) => a.trimestres === 4);
            const parcial = inc.porAnio.find((a) => a.trimestres < 4);
            const ref = inc.porAnio.find((a) => a.anio === inc.anioReferencia)!;
            return (
              <Card className="p-5 sm:p-6">
                <CardTitle as="h3">¿Cuántas armas se incautan?</CardTitle>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  Armas incautadas por año, por organismo de seguridad, según el Ministerio:{" "}
                  {formatInt(ref.total)} en {ref.anio}.
                  {parcial && ` De ${parcial.anio} solo está publicado ${parcial.trimestres === 1 ? "el primer trimestre" : `hasta el trimestre ${parcial.trimestres}`} (${formatInt(parcial.total)}), fuera del gráfico.`}
                </p>
                <SerieTemporal
                  forma="columnas"
                  formato="entero"
                  etiqueta={`Armas incautadas por año, ${completos[0]?.anio}–${completos[completos.length - 1]?.anio}`}
                  alto="bajo"
                  puntos={completos.map((a, i) => ({
                    clave: String(a.anio),
                    valor: a.total,
                    lectura: `${a.anio}: ${formatInt(a.total)} armas`,
                    marca: i === 0 || i === completos.length - 1 ? String(a.anio) : undefined,
                  }))}
                />
                <p className="mt-3 text-xs text-ink-soft">Por organismo, {inc.anioReferencia}:</p>
                <ol className="-mx-5 mt-2 divide-y divide-hairline border-t border-hairline sm:-mx-6">
                  {inc.porOrganismo.map((o) => (
                    <Fila
                      key={o.organismo}
                      nombre={o.organismo}
                      valor={formatInt(o.armas)}
                      max={inc.porOrganismo[0].armas}
                      actual={o.armas}
                    />
                  ))}
                </ol>
                <Advertencias
                  items={[
                    "Suben y bajan a saltos: una sola operación grande mueve el año entero, así que la serie no dice por sí sola si hay más o menos armas en la calle.",
                  ]}
                />
              </Card>
            );
          })()}

          {armas.registradas && (() => {
            const reg = armas.registradas;
            const u = reg.porAnio[reg.porAnio.length - 1];
            const total = u.masculino + u.femenino;
            const hueco = reg.porAnio.find((a, i) => i > 0 && a.masculino + a.femenino < reg.porAnio[i - 1].masculino + reg.porAnio[i - 1].femenino);
            return (
              <Card className="p-5 sm:p-6">
                <CardTitle as="h3">¿Cuántas armas tienen registro?</CardTitle>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  Armas registradas, por sexo del titular, acumuladas a {TRIMESTRE[reg.ultimo.trimestre]} de{" "}
                  {reg.ultimo.anio}:{" "}
                  <span className="font-mono font-semibold tabular-nums text-ink">{formatInt(total)}</span>, de las que{" "}
                  {pct(u.femenino, total)} están a nombre de mujeres.
                </p>
                <ol className="-mx-5 mt-3 divide-y divide-hairline border-t border-hairline sm:-mx-6">
                  {reg.porTipo.map((t) => (
                    <Fila
                      key={t.tipo}
                      nombre={t.tipo}
                      valor={formatInt(t.masculino + t.femenino)}
                      detalle={`${formatInt(t.femenino)} a nombre de mujeres`}
                      max={reg.porTipo[0].masculino + reg.porTipo[0].femenino}
                      actual={t.masculino + t.femenino}
                    />
                  ))}
                </ol>
                <Plegable
                  className="-mx-5 border-t border-hairline sm:-mx-6"
                  etiqueta={`Ver el acumulado de los ${reg.porAnio.length} años`}
                  etiquetaCerrar="Ocultar la tabla"
                >
                  <div className="px-5 py-3 sm:px-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Corte</TableHead>
                          <TableHead className="text-right">Hombres</TableHead>
                          <TableHead className="text-right">Mujeres</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...reg.porAnio].reverse().map((a) => (
                          <TableRow key={a.anio}>
                            <TableCell className="font-mono tabular-nums">
                              {a.anio}
                              {a.trimestre < 4 && <span className="text-ink-soft"> · {TRIMESTRE[a.trimestre]}</span>}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{formatInt(a.masculino)}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{formatInt(a.femenino)}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{formatInt(a.masculino + a.femenino)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Plegable>
                <Advertencias
                  items={[
                    "Es un acumulado: crece con cada registro nuevo; no son las armas que entraron en el año.",
                    ...(hueco
                      ? [`El cierre de ${hueco.anio} baja frente al anterior y el siguiente vuelve a subir: es una cifra del origen que no cuadra con su propia serie, y así se muestra.`]
                      : []),
                  ]}
                />
              </Card>
            );
          })()}
        </div>
      )}

      <Fuente>
        Fuente: Ministerio de Interior y Policía, con datos de la Dirección General de la
        Policía Nacional (archivo «{r.archivo.split("/").pop()}», publicado el {formatFecha(r.publicado)}
        {armas?.incautadas ? ", y sus tablas de armas incautadas y registradas" : ""}). El Ministerio
        no publica los homicidios en un formato legible por máquina (solo en imagen).{" "}
        <a href={r.archivo} className="text-brand-700 hover:underline" target="_blank" rel="noopener noreferrer">
          Descargar el archivo original
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
        .
      </Fuente>
    </section>
  );
}

/* ------------------------------------------------------------ matrícula */

function SeccionMatricula({ m }: { m: Matricula }) {
  const serie = m.porPeriodo;
  const ult = serie[serie.length - 1];
  const prev = serie[serie.length - 2];
  const primero = serie[0];
  const maxReg = Math.max(...m.porRegionalUltimo.map((r) => r.total));
  const regionales = [...m.porRegionalUltimo].sort((a, b) => b.total - a.total);
  const pandemia = serie.find((p) => p.periodo === "2020-21");

  return (
    <section id="matricula" className="scroll-mt-24 space-y-5">
      <Card className="p-5 sm:p-6">
        <CardTitle as="h2">¿Cuántos estudiantes hay en las aulas?</CardTitle>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          En el año escolar {ult.periodo} había{" "}
          <span className="font-mono font-semibold tabular-nums text-ink">{formatInt(ult.total)}</span>{" "}
          estudiantes matriculados
          {prev ? `, ${cambio(ult.total, prev.total)} frente a ${prev.periodo}` : ""}; en {primero.periodo} eran{" "}
          {formatInt(primero.total)}.
        </p>
        <SerieTemporal
          forma="linea"
          formato="entero"
          etiqueta={`Estudiantes matriculados por año escolar, de ${formatInt(primero.total)} en ${primero.periodo} a ${formatInt(ult.total)} en ${ult.periodo}`}
          puntos={serie.map((p, i) => ({
            clave: p.periodo,
            valor: p.total,
            lectura: `${p.periodo}: ${formatInt(p.total)} estudiantes`,
            marca: i === 0 || i === serie.length - 1 || i === Math.floor(serie.length / 2) ? p.periodo : undefined,
          }))}
        />
        <Plegable
          className="-mx-5 mt-4 border-t border-hairline sm:-mx-6"
          etiqueta={`Ver los ${serie.length} años escolares por nivel`}
          etiquetaCerrar="Ocultar la tabla"
        >
          <div className="px-5 py-3 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Año escolar</TableHead>
                  <TableHead className="text-right">Inicial</TableHead>
                  <TableHead className="text-right">Primario</TableHead>
                  <TableHead className="text-right">Secundario</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Adultos</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...serie].reverse().map((p) => (
                  <TableRow key={p.periodo}>
                    <TableCell className="font-mono tabular-nums">{p.periodo}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatInt(p.niveles.Inicial)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatInt(p.niveles.Primario)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatInt(p.niveles.Secundario)}</TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">{formatInt(p.niveles.Adultos)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatInt(p.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Plegable>
        <Advertencias
          items={[
            <>El último año escolar publicado es {m.ultimoPeriodo}: el MINERD no ha subido los siguientes a su portal de datos abiertos.</>,
            <>Entre 2015-16 y 2016-17 la primaria pierde cerca de 390 mil estudiantes y la secundaria gana unos 350 mil. Lo más probable es que refleje el cambio de estructura de los niveles (primaria y secundaria de seis grados cada una) y no un movimiento de estudiantes; compara niveles desde 2016-17.</>,
            ...(pandemia
              ? [<>El año escolar 2020-21, el de la pandemia, cae a {formatInt(pandemia.total)}; el nivel inicial es el que más baja.</>]
              : []),
            <>El archivo no separa escuelas públicas de colegios privados, ni trae una fila nacional: el total se suma aquí desde las 18 regionales.</>,
          ]}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <CardTitle as="h3">¿En qué nivel?</CardTitle>
          <p className="mt-1 text-xs text-ink-soft">Estudiantes de {m.ultimoPeriodo} por nivel.</p>
          <ol className="-mx-5 mt-3 divide-y divide-hairline border-t border-hairline sm:-mx-6">
            {m.porNivelUltimo.map((n) => (
              <Fila
                key={n.nivel}
                nombre={n.nivel === "Adultos" ? "Educación de adultos" : `Nivel ${n.nivel.toLowerCase()}`}
                valor={formatInt(n.estudiantes)}
                detalle={pct(n.estudiantes, ult.total)}
                max={Math.max(...m.porNivelUltimo.map((x) => x.estudiantes))}
                actual={n.estudiantes}
              />
            ))}
          </ol>
        </Card>

        <Card className="p-5 sm:p-6">
          <CardTitle as="h3">¿En qué regional educativa?</CardTitle>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Estudiantes de {m.ultimoPeriodo} por regional del MINERD. Una regional no es una
            provincia: agrupa distritos educativos de varias, y Santo Domingo tiene dos (10 y 15).
          </p>
          <ListaPlegable
            filas={regionales}
            visibles={8}
            etiqueta={(n) => `Ver las otras ${n} regionales`}
            render={(r) => (
              <Fila
                key={r.codigo}
                nombre={
                  <>
                    <span className="font-mono text-xs tabular-nums text-ink-soft">{r.codigo}</span> {r.regional}
                  </>
                }
                valor={formatInt(r.total)}
                detalle={`Inicial ${formatInt(r.niveles.Inicial)} · primario ${formatInt(r.niveles.Primario)} · secundario ${formatInt(r.niveles.Secundario)} · adultos ${formatInt(r.niveles.Adultos)}`}
                max={maxReg}
                actual={r.total}
              />
            )}
          />
        </Card>
      </div>

      <Fuente>
        Fuente: Ministerio de Educación (MINERD), conjunto de datos abiertos «Estudiantes
        matriculados por nivel según regional y distrito», años escolares {m.periodos[0]} a{" "}
        {m.periodos[1]}. El archivo dice estar en UTF-8 y viene en Windows-1252; trae un período
        mal escrito («202120222», leído como 2021-22).{" "}
        <a href={m.archivo} className="text-brand-700 hover:underline" target="_blank" rel="noopener noreferrer">
          Descargar el CSV original
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
        .
      </Fuente>
    </section>
  );
}

/* ------------------------------------------------------------ licencias */

function SeccionLicencias({ l }: { l: Licencias }) {
  const ref = l.porAnio.find((a) => a.anio === l.anioReferencia)!;
  const prev = l.porAnio.find((a) => a.anio === l.anioReferencia - 1);
  const parcial = l.porAnio.find((a) => !a.completo);
  const maxProv = l.porProvincia[0]?.licencias ?? 1;
  const maxMun = l.porMunicipio[0]?.licencias ?? 1;
  const porM2 = ref.metros2 > 0 ? ref.inversion / ref.metros2 : 0;
  const mayor = l.mayorLicencia;
  const provMayor = l.porProvincia.find((p) => p.nombre === mayor.provincia);

  return (
    <section id="licencias" className="scroll-mt-24 space-y-5">
      <Card className="p-5 sm:p-6">
        <CardTitle as="h2">¿Cuánto se autoriza construir?</CardTitle>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          En {ref.anio} el Ministerio de Vivienda emitió{" "}
          <span className="font-mono font-semibold tabular-nums text-ink">{formatInt(ref.licencias)}</span>{" "}
          licencias de construcción
          {prev ? ` (${cambio(ref.licencias, prev.licencias)} frente a ${prev.anio})` : ""}, por{" "}
          {formatInt(ref.metros2)} m² y {formatPesos(ref.inversion)} de inversión declarada.
          {parcial &&
            ` De ${parcial.anio}, hasta ${HASTA_MES[parcial.meses]}, van ${formatInt(parcial.licencias)}.`}
        </p>
        <SerieTemporal
          forma="columnas"
          formato="entero"
          etiqueta={`Licencias de construcción emitidas por año, ${l.anios[0]}–${l.anios[1]}${parcial ? ` (${parcial.anio} hasta ${HASTA_MES[parcial.meses]})` : ""}`}
          puntos={l.porAnio.map((a) => ({
            clave: String(a.anio),
            valor: a.licencias,
            lectura: `${a.anio}${a.completo ? "" : ` (enero–${HASTA_MES[a.meses]})`}: ${formatInt(a.licencias)} licencias`,
            marca: a.completo ? String(a.anio) : `${a.anio}*`,
          }))}
        />
        {parcial && (
          <p className="mt-1 text-xs text-ink-soft">
            * {parcial.anio} va de enero a {HASTA_MES[parcial.meses]}: la barra no es comparable con los años enteros.
          </p>
        )}
        <Plegable
          className="-mx-5 mt-4 border-t border-hairline sm:-mx-6"
          etiqueta={`Ver los ${l.porAnio.length} años con metros e inversión`}
          etiquetaCerrar="Ocultar la tabla"
        >
          <div className="px-5 py-3 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Año</TableHead>
                  <TableHead className="text-right">Licencias</TableHead>
                  <TableHead className="text-right">Metros²</TableHead>
                  <TableHead className="text-right">Inversión declarada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...l.porAnio].reverse().map((a) => (
                  <TableRow key={a.anio}>
                    <TableCell className="font-mono tabular-nums">
                      {a.anio}
                      {!a.completo && <span className="text-ink-soft"> · hasta {HASTA_MES[a.meses]}</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatInt(a.licencias)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatInt(a.metros2)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatPesos(a.inversion)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Plegable>
        <Advertencias
          items={[
            <>Una licencia es un <strong className="font-semibold text-ink">permiso</strong> para construir, no una obra empezada ni terminada: hay licencias que nunca se ejecutan.</>,
            <>La inversión es la que consta en el registro de la licencia, y ronda los {formatPesos(porM2)} por metro cuadrado en casi todas: parece calculada a partir de los metros, no medida. Léela como orden de magnitud.</>,
            <>Una sola licencia pesa mucho: la mayor de {ref.anio} ({mayor.tipologia.toLowerCase()} en {mayor.municipio}, {formatInt(mayor.metros2)} m², {formatPesos(mayor.inversion)})
              {provMayor && provMayor.inversion > 0
                ? ` es el ${pct(mayor.inversion, provMayor.inversion)} de la inversión declarada en ${provMayor.nombre} ese año.`
                : "."}</>,
          ]}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <CardTitle as="h3">¿En qué provincias?</CardTitle>
          <p className="mt-1 text-xs text-ink-soft">
            Licencias de {l.anioReferencia}, el último año completo, por provincia.
          </p>
          <ListaPlegable
            filas={l.porProvincia}
            visibles={8}
            etiqueta={(n) => `Ver las otras ${n} provincias`}
            render={(p) => (
              <Fila
                key={p.nombre}
                provincia={p.nombre}
                valor={formatInt(p.licencias)}
                detalle={`${formatInt(p.metros2)} m² · ${formatPesos(p.inversion)}`}
                max={maxProv}
                actual={p.licencias}
              />
            )}
          />
        </Card>

        <Card className="p-5 sm:p-6">
          <CardTitle as="h3">¿En qué municipios?</CardTitle>
          <p className="mt-1 text-xs text-ink-soft">
            Licencias de {l.anioReferencia} por municipio ({formatInt(l.porMunicipio.length)} con al menos una).
          </p>
          <ListaPlegable
            filas={l.porMunicipio}
            visibles={8}
            etiqueta={(n) => `Ver los otros ${n} municipios`}
            render={(m) => (
              <Fila
                key={`${m.provincia}-${m.nombre}`}
                nombre={
                  <>
                    <span className="text-ink">{m.nombre}</span>{" "}
                    <span className="text-xs text-ink-soft">· {m.provincia}</span>
                  </>
                }
                valor={formatInt(m.licencias)}
                detalle={`${formatInt(m.metros2)} m²`}
                max={maxMun}
                actual={m.licencias}
              />
            )}
          />
        </Card>
      </div>

      <Card className="p-5 sm:p-6">
        <CardTitle as="h3">¿Para qué?</CardTitle>
        <p className="mt-1 text-xs text-ink-soft">Licencias de {l.anioReferencia} por tipo de edificación.</p>
        <ol className="-mx-5 mt-3 divide-y divide-hairline border-t border-hairline sm:-mx-6">
          {l.porTipologia.map((t) => (
            <Fila
              key={t.nombre}
              nombre={t.nombre}
              valor={formatInt(t.licencias)}
              detalle={`${formatInt(t.metros2)} m² · ${pct(t.licencias, ref.licencias)} de las licencias`}
              max={l.porTipologia[0].licencias}
              actual={t.licencias}
            />
          ))}
        </ol>
      </Card>

      <Fuente>
        Fuente: Ministerio de Vivienda, Hábitat y Edificaciones (MIVHED), datos abiertos
        «Licencias emitidas 2022–2026», con licencias hasta el {formatFecha(l.corte)}.{" "}
        <a href={l.archivo} className="text-brand-700 hover:underline" target="_blank" rel="noopener noreferrer">
          Descargar el CSV original
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
        .
      </Fuente>
    </section>
  );
}

/* ------------------------------------------------------------ página */

/**
 * ¿Cómo va el país en seguridad, escuela y vivienda? — tres series sociales
 * del Estado en una página, desde la instantánea de `lib/sociedad.ts`. Cada
 * sección dice su fuente, su corte y lo que la cifra no es.
 */
export default async function PaisPage() {
  const d = await getSociedad();
  if (!d || (!d.robos && !d.matricula && !d.licencias)) {
    return (
      <EstadoVacio
        variante="caida"
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="No pudimos leer los indicadores sociales"
        accion={
          <Button asChild variant="secondary">
            <Link href="/fuentes">Ver el estado de las fuentes</Link>
          </Button>
        }
      >
        La instantánea de denuncias, matrícula y licencias no está disponible en este
        momento. No es que no haya datos: es que no pudimos mirar.
      </EstadoVacio>
    );
  }

  const { robos, matricula, licencias } = d;
  const refLic = licencias?.porAnio.find((a) => a.anio === licencias.anioReferencia);
  const heredados = [robos, matricula, licencias].filter((b) => b?.heredadoDe).length;

  return (
    <div className="space-y-8">
      <Portada
        rotulo={`Seguridad, escuela y vivienda · MIP, MINERD, MIVHED · instantánea del ${formatFecha(d.generado)}`}
        titulo="¿Cómo va el país en seguridad, escuela y vivienda?"
        descripcion={
          <>
            Tres registros del Estado, año a año: las denuncias de robo que recibe la
            Policía, los estudiantes inscritos en las escuelas y los permisos para
            construir. Ninguno de los tres mide todo lo que su nombre sugiere; cada
            sección dice qué cuenta, hasta cuándo llega y qué no es.
          </>
        }
        aviso={
          heredados > 0
            ? "Una de las secciones viene de una instantánea anterior: su archivo no cuadró en la última lectura"
            : undefined
        }
      >
        <PortadaCifras>
          {robos && (
            <PortadaCifra
              etiqueta={`Denuncias de robo en ${robos.ultimoAnio}`}
              valor={formatInt(robos.totalUltimoAnio)}
              destacar
            />
          )}
          {matricula && (
            <PortadaCifra
              etiqueta={`Estudiantes en ${matricula.ultimoPeriodo}`}
              valor={formatInt(matricula.porPeriodo[matricula.porPeriodo.length - 1].total)}
            />
          )}
          {licencias && refLic && (
            <PortadaCifra etiqueta={`Licencias de construcción en ${refLic.anio}`} valor={formatInt(refLic.licencias)} />
          )}
          {licencias && refLic && (
            <PortadaCifra etiqueta={`Metros autorizados en ${refLic.anio}`} valor={`${formatInt(refLic.metros2)} m²`} />
          )}
        </PortadaCifras>
      </Portada>

      <nav aria-label="Secciones de la página" className="flex flex-wrap gap-x-5 text-sm">
        <a className="inline-flex min-h-11 items-center font-medium text-brand-700 hover:underline sm:min-h-6" href="#seguridad-ciudadana">Seguridad ciudadana</a>
        <a className="inline-flex min-h-11 items-center font-medium text-brand-700 hover:underline sm:min-h-6" href="#matricula">Matrícula escolar</a>
        <a className="inline-flex min-h-11 items-center font-medium text-brand-700 hover:underline sm:min-h-6" href="#licencias">Licencias de construcción</a>
      </nav>

      {robos ? (
        <SeccionRobos r={robos} armas={d.armas} />
      ) : (
        <section id="seguridad-ciudadana" className="scroll-mt-24">
          <BloqueCaido que="las denuncias de robo" origen="el Ministerio de Interior y Policía" enlace="https://mip.gob.do/" />
        </section>
      )}

      {matricula ? (
        <SeccionMatricula m={matricula} />
      ) : (
        <section id="matricula" className="scroll-mt-24">
          <BloqueCaido
            que="la matrícula escolar"
            origen="los datos abiertos del MINERD"
            enlace="https://minerd.gob.do/transparencia/datos-abiertos/listados"
          />
        </section>
      )}

      {licencias ? (
        <SeccionLicencias l={licencias} />
      ) : (
        <section id="licencias" className="scroll-mt-24">
          <BloqueCaido que="las licencias de construcción" origen="los datos abiertos del MIVHED" enlace="https://mivhed.gob.do/" />
        </section>
      )}

      <p className="text-xs leading-relaxed text-ink-soft">
        Instantánea generada el {formatFecha(d.generado)} con{" "}
        <span className="font-mono">python3 scripts/build-sociedad.py</span>, que busca cada
        archivo en el listado de su ministerio (ninguno tiene una dirección fija), lo
        interpreta y comprueba que sus sumas cuadren antes de publicarlo.
      </p>
    </div>
  );
}
