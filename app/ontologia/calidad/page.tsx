import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Cifra, Rotulo, TiraDeCifras } from "@/components/papel";
import { formatFecha } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { metaGrafo } from "@/lib/grafo-compilado";
import { INFORME } from "@/lib/grafo-informe";
import { CLASES, PROPIEDADES, curie } from "@/lib/ontologia";

/**
 * La calidad del grafo contra su ontología (docs/INFRAESTRUCTURA.md §7.2 y
 * §7.4), en llano: el informe SHACL que el gate exige al día
 * (`datos/grafo/informe-shacl.json`, publicado en `/ontologia.calidad.ttl`) y
 * la completitud de cada clase medida sobre el grafo compilado entero
 * (`calidad` de `datos/grafo/meta.json`). Sale de archivos del repositorio:
 * cambia solo con un despliegue.
 */

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Calidad del grafo",
  description:
    "Si el grafo de Socrático.do cumple las formas SHACL de su ontología, cuántos nodos validó cada forma y qué parte de cada clase tiene cada dato y cada relación.",
  alternates: { canonical: "/ontologia/calidad", types: { "text/turtle": "/ontologia.calidad.ttl" } },
};

const ETIQUETA_CLASE = new Map(CLASES.map((c) => [curie(c), c.etiqueta]));
const ETIQUETA_PROP = new Map(PROPIEDADES.map((p) => [curie(p), p.etiqueta]));
const PORCIENTO = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 1 });

/** «98.4 %»; «100 %» solo si son todas, y «menos de 0.1 %» si hay alguna. */
function porciento(con: number, de: number): string {
  if (con === de) return "100 %";
  const p = (100 * con) / de;
  if (con > 0 && p < 0.1) return "menos de 0.1 %";
  return `${PORCIENTO.format(Math.min(p, 99.9))} %`;
}

const ancla = (c: string) => `/ontologia#${c.split(":")[1]}`;

export default async function CalidadDelGrafo() {
  const meta = await metaGrafo();
  const calidad = meta?.calidad ?? null;
  const validadas = INFORME.formas.filter((f) => f.focos > 0);
  const violacionesShacl = INFORME.formas.reduce((s, f) => s + f.violaciones, 0);
  const violacionesCompilado = calidad?.violaciones.reduce((s, v) => s + v.nodos, 0) ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <Rotulo>Ontología · calidad</Rotulo>
        <h1 className="mt-1.5 font-display text-3xl leading-tight text-ink sm:text-4xl">¿Cumple el grafo su ontología?</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
          Cada clase de{" "}
          <Link href="/ontologia" className="text-brand-700 underline">
            la ontología
          </Link>{" "}
          tiene una forma SHACL: qué datos y relaciones admite, de qué tipo, cuántos y cuáles son obligatorios. Antes de cada
          despliegue se validan contra ellas el volcado entero y una muestra de lo demás, y no se despliega si no cumplen; este
          informe es el de esa validación, con la huella de lo validado.
        </p>
        <p className="mt-3 text-sm text-ink-soft">
          El informe en{" "}
          <a href="/ontologia.calidad.ttl" className="text-brand-700 underline">
            Turtle (sh:ValidationReport)
          </a>
          ; las formas, en{" "}
          <a href="/ontologia.shacl.ttl" className="text-brand-700 underline">
            SHACL
          </a>
          . Huella <code className="break-all font-mono text-[13px] text-ink">sha256:{INFORME.huella.slice(0, 16)}…</code>
        </p>
      </header>

      <TiraDeCifras>
        <Cifra
          etiqueta="Resultado"
          valor={INFORME.conforme ? "Conforme" : "No conforme"}
          nota={`Grafo compilado el ${formatFecha(INFORME.grafo)}, ontología ${INFORME.ontologia ?? "—"}`}
        />
        <Cifra etiqueta="Violaciones SHACL" valor={formatInt(violacionesShacl)} nota={`En ${formatInt(validadas.length)} formas con nodos validados`} />
        <Cifra
          etiqueta="Triples validados"
          valor={formatInt(INFORME.triples)}
          nota={`De ${formatInt(INFORME.nodos)} nodos: el volcado entero y una muestra`}
        />
        <Cifra
          etiqueta="Obligatorios ausentes o únicos repetidos"
          valor={calidad ? formatInt(violacionesCompilado) : "—"}
          nota={calidad && meta ? `En las ${formatInt(calidad.instancias)} instancias del grafo entero, compilado el ${formatFecha(meta.generado)}` : "El compilado no trae la medida"}
        />
      </TiraDeCifras>

      <section aria-labelledby="formas" className="space-y-3">
        <h2 id="formas" className="font-display text-xl text-ink">
          ¿Qué validó cada forma?
        </h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          La columna «Nodos» cuenta los que validó cada forma. Lo validado: el volcado sin personas naturales{INFORME.volcado ? ` del ${formatFecha(INFORME.volcado)}` : ""}, entero, y una
          muestra pedida nodo a nodo de lo que el volcado no trae: {formatInt(INFORME.muestra.personas)} personas,{" "}
          {formatInt(INFORME.muestra.decretos)} decretos que las nombran, {formatInt(INFORME.muestra.iniciativas)} iniciativas y{" "}
          {formatInt(INFORME.muestra.normas)} normas que nombran, {formatInt(INFORME.muestra.documentos)} documentos,{" "}
          {formatInt(INFORME.muestra.sentencias)} sentencias y {formatInt(INFORME.muestra.votaciones)} votaciones. Un nodo de una
          clase cuenta también en la forma de la clase de la que es un caso.
        </p>
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Forma</TableHead>
                <TableHead className="text-right">Nodos</TableHead>
                <TableHead className="text-right">Violaciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {validadas.map((f) => (
                <TableRow key={f.forma}>
                  <TableCell>
                    <a href={ancla(f.clase)} className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-10">
                      {ETIQUETA_CLASE.get(f.clase) ?? f.clase}
                    </a>
                    <code className="block font-mono text-xs text-ink-soft">{f.clase}</code>
                  </TableCell>
                  <TableCell numerica>{formatInt(f.focos)}</TableCell>
                  <TableCell numerica>{formatInt(f.violaciones)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        {INFORME.formas.length > validadas.length && (
          <p className="text-sm text-ink-soft">
            Las otras {formatInt(INFORME.formas.length - validadas.length)} formas no tienen nodos en lo validado: son clases
            definidas para lo que viene o que el volcado y la muestra no traen.
          </p>
        )}
      </section>

      <section aria-labelledby="completitud" className="space-y-3">
        <h2 id="completitud" className="font-display text-xl text-ink">
          ¿Qué parte de cada clase tiene cada dato?
        </h2>
        {!calidad || !meta ? (
          <p className="text-sm text-ink-soft">El grafo compilado no trae esta medida.</p>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-ink-soft">
              Medido sobre el grafo compilado entero del {formatFecha(meta.generado)}, con personas: cada clase con sus
              instancias (y las de sus casos) y, por cada dato o relación de su forma, cuántos nodos lo tienen y qué parte son. Lo obligatorio que
              falta y lo que debe ser uno y es más, son violaciones. Un dato ausente no es una falta del Estado: es lo que las
              fuentes cruzadas no dicen.
            </p>
            {calidad.completitud.map((c) => (
              <Card as="section" key={c.clase} aria-labelledby={`calidad-${c.clase}`} className="overflow-hidden">
                <div className="px-5 pb-2 pt-4 sm:px-6">
                  <CardTitle as="h3" id={`calidad-${c.clase}`}>
                    {ETIQUETA_CLASE.get(c.clase) ?? c.clase}
                  </CardTitle>
                  <p className="mt-0.5 font-mono text-xs text-ink-soft">
                    {c.clase} · {formatInt(c.instancias)} instancias
                  </p>
                </div>
                {c.propiedades.length === 0 ? (
                  <p className="border-t border-hairline px-5 py-3 text-sm text-ink-soft sm:px-6">
                    Su forma no tiene datos propios: los de la clase de la que es un caso.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-t border-hairline">
                        <TableHead>Dato</TableHead>
                        <TableHead className="text-right">Nodos</TableHead>
                        <TableHead className="text-right">Parte</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {c.propiedades.map((p) => (
                        <TableRow key={p.propiedad}>
                          <TableCell>
                            <a href={ancla(p.propiedad)} className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-10">
                              {ETIQUETA_PROP.get(p.propiedad) ?? p.propiedad}
                            </a>
                            <span className="block text-xs text-ink-soft">
                              {[p.obligatoria ? "obligatorio" : null, p.funcional ? "uno solo" : null].filter(Boolean).join(" · ")}
                            </span>
                          </TableCell>
                          <TableCell numerica>{formatInt(p.con)}</TableCell>
                          <TableCell numerica>{porciento(p.con, c.instancias)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            ))}
            {calidad.violaciones.length > 0 && (
              <Card as="section" aria-labelledby="violaciones" className="px-5 py-4 sm:px-6">
                <CardTitle as="h3" id="violaciones">
                  Violaciones de cardinalidad en el grafo entero
                </CardTitle>
                <ul className="mt-2 space-y-1 text-sm text-ink">
                  {calidad.violaciones.map((v) => (
                    <li key={`${v.clase}-${v.propiedad}-${v.restriccion}`}>
                      {ETIQUETA_CLASE.get(v.clase) ?? v.clase}, {ETIQUETA_PROP.get(v.propiedad) ?? v.propiedad}:{" "}
                      {v.restriccion === "sh:minCount" ? "le falta a" : "tiene más de uno en"}{" "}
                      <span className="font-mono tabular-nums">{formatInt(v.nodos)}</span> {v.nodos === 1 ? "nodo" : "nodos"}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </section>
    </div>
  );
}
