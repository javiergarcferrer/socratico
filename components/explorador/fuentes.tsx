"use client";

import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Cifra, TiraDeCifras } from "@/components/papel";
import Plegable from "@/components/plegable";
import { BarrasHorizontales, MatrizCruzada, RedVecinos, VerComoTabla, type ColumnaCruzada, type FilaCruzada, type VecinoRed } from "@/components/graficos";
import { IconExternal } from "@/components/icons";
import { SITIO } from "@/lib/sitio";
import { formatFecha } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { cn } from "@/lib/cn";
import type { FuenteVista, FuentesVista, OntologiaVista } from "@/lib/explorar-tipos";
import type { PasoRastro } from "./inspector";
import { clicSimple } from "./clic";

/**
 * La sección «Fuentes» del banco: **qué aporta cada fuente al grafo**. Cada
 * grafo con nombre —una fuente del Estado con su corte, o una regla de
 * Socrático que deduce de otras— con lo que el compilador contó que afirma
 * (`porFuente`, `lib/grafo-fuentes.ts`): las clases que llena, las
 * relaciones con que liga una clase con otra, dónde se cruza con otras
 * fuentes y un nodo real donde se ve el cruce.
 *
 * Sin fuente abierta: la matriz fuente × clase, de un vistazo, y las clases
 * donde se juntan varias fuentes. Con fuente: su esquema (la red de las
 * clases que liga, con la tabla entera debajo), sus clases, sus cruces, su
 * ejemplo y su procedencia.
 */

const DATO = "dato";
const FUERA = "fuera";

/** Lo que se lee de un término de la ontología: su etiqueta si es de aquí, el nombre corto si no. */
function nombres(o: OntologiaVista | undefined) {
  const clases = new Map(o?.clases.map((c) => [c.curie, c.etiqueta]) ?? []);
  const props = new Map(o?.propiedades.map((p) => [p.curie, p.etiqueta]) ?? []);
  return {
    clase: (c: string) => (c === DATO ? "un valor" : c === FUERA ? "algo de fuera" : (clases.get(c) ?? c)),
    prop: (p: string) => props.get(p) ?? p,
    esClase: (c: string) => clases.has(c),
  };
}

const esFuente = (f: FuenteVista) => !f.deriva;
const parte = (n: number, total: number) => (total ? `${((100 * n) / total).toLocaleString("es-DO", { maximumFractionDigits: n / total < 0.01 ? 2 : 1 })} %` : "—");

/** Un valor de triple como se lee: la ruta de un nodo de aquí, el texto, o la dirección de fuera recortada. */
function valor(v: string): string {
  const s = v.startsWith(SITIO) ? v.slice(SITIO.length).replace(/#id$/, "") : v;
  return s.length > 80 ? `${s.slice(0, 79)}…` : s;
}

/* ----------------------------------------------------------- panel lateral */

/** Las fuentes y las reglas, para elegir una: el panel izquierdo (y, en el teléfono, la lista de encima). */
export function ListaDeFuentes({ datos, activa, hrefFuente }: { datos: FuentesVista; activa: string | null; hrefFuente: (clave: string | null) => string }) {
  const grupo = (titulo: string, lista: FuenteVista[]) => (
    <section aria-label={titulo}>
      <p className="rotulo mb-1 px-1 text-ink-soft">{titulo}</p>
      <ul>
        {lista.map((f) => (
          <li key={f.clave}>
            <Link
              href={hrefFuente(f.clave)}
              aria-current={f.clave === activa ? "true" : undefined}
              className={cn(
                "flex min-h-11 items-center justify-between gap-2 rounded-md px-2 py-1 text-[13px] leading-snug text-ink hover:bg-brand-50 hover:text-brand-700 sm:min-h-10",
                "aria-[current=true]:bg-brand-100 aria-[current=true]:font-semibold aria-[current=true]:text-brand-700",
              )}
            >
              <span className="min-w-0">{f.etiqueta}</span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-ink-soft">{formatInt(f.aporte?.triples ?? 0)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <nav aria-label="Fuentes del grafo" className="space-y-4">
      <Link
        href={hrefFuente(null)}
        aria-current={activa == null ? "true" : undefined}
        className="flex min-h-11 items-center rounded-md px-2 text-[13px] font-medium text-ink hover:bg-brand-50 hover:text-brand-700 aria-[current=true]:bg-brand-100 aria-[current=true]:text-brand-700 sm:min-h-10"
      >
        Todas, de un vistazo
      </Link>
      {grupo("Fuentes", datos.fuentes.filter(esFuente))}
      {grupo("Reglas de Socrático", datos.fuentes.filter((f) => !esFuente(f)))}
      <p className="px-2 text-xs leading-relaxed text-ink-soft">La cifra: los triples que afirma en el grafo compilado el {formatFecha(datos.compilado)}.</p>
    </nav>
  );
}

/* ------------------------------------------------------------------ centro */

export function Fuentes({
  datos,
  ontologia,
  fuente,
  hrefFuente,
  hrefClase,
  hrefNodo,
  onAbrir,
}: {
  datos: FuentesVista;
  ontologia: OntologiaVista | undefined;
  fuente: string | null;
  hrefFuente: (clave: string | null) => string;
  hrefClase: (curie: string) => string;
  hrefNodo: (ruta: string) => string;
  onAbrir: (p: PasoRastro) => void;
}) {
  const f = fuente ? datos.fuentes.find((x) => x.clave === fuente) : null;
  return (
    <div className="space-y-3 lg:space-y-4">
      {/* En el teléfono no hay panel izquierdo: la lista va plegada encima. */}
      <Card as="section" aria-label="Elegir una fuente" className="overflow-hidden lg:hidden">
        <Plegable etiqueta={`Ver las ${datos.fuentes.length} fuentes y reglas`} etiquetaCerrar="Ocultar la lista">
          <div className="px-2 py-2">
            <ListaDeFuentes datos={datos} activa={fuente} hrefFuente={hrefFuente} />
          </div>
        </Plegable>
      </Card>
      {f ? (
        <FichaDeFuente datos={datos} f={f} ontologia={ontologia} hrefFuente={hrefFuente} hrefClase={hrefClase} hrefNodo={hrefNodo} onAbrir={onAbrir} />
      ) : (
        <Panorama datos={datos} ontologia={ontologia} hrefFuente={hrefFuente} hrefClase={hrefClase} />
      )}
    </div>
  );
}

/** Las clases de nodo que llena alguna fuente, de la más llenada a la menos. */
function clasesDeNodo(datos: FuentesVista, n: ReturnType<typeof nombres>) {
  const total = new Map<string, number>();
  for (const f of datos.fuentes.filter(esFuente)) for (const [c, v] of f.aporte?.clases ?? []) if (n.esClase(c)) total.set(c, (total.get(c) ?? 0) + v);
  return [...total.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

/** Las clases que llenan dos fuentes o más, con quiénes: donde el grafo junta lo que el Estado publica por separado. */
function uniones(datos: FuentesVista, n: ReturnType<typeof nombres>) {
  const por = new Map<string, { f: FuenteVista; triples: number }[]>();
  for (const f of datos.fuentes.filter(esFuente)) {
    for (const [c, v] of f.aporte?.clases ?? []) {
      if (!n.esClase(c)) continue;
      por.set(c, [...(por.get(c) ?? []), { f, triples: v }]);
    }
  }
  return [...por.entries()]
    .filter(([, xs]) => xs.length > 1)
    .map(([c, xs]) => ({ clase: c, fuentes: xs.sort((a, b) => b.triples - a.triples) }))
    .sort((a, b) => b.fuentes.length - a.fuentes.length || a.clase.localeCompare(b.clase));
}

function Panorama({
  datos,
  ontologia,
  hrefFuente,
  hrefClase,
}: {
  datos: FuentesVista;
  ontologia: OntologiaVista | undefined;
  hrefFuente: (clave: string | null) => string;
  hrefClase: (curie: string) => string;
}) {
  const n = nombres(ontologia);
  const fuentes = datos.fuentes.filter(esFuente);
  const reglas = datos.fuentes.filter((f) => !esFuente(f));
  const columnas: ColumnaCruzada[] = clasesDeNodo(datos, n).map((c) => ({ clave: c, etiqueta: n.clase(c) }));
  const filas: FilaCruzada[] = fuentes.map((f) => {
    const por = new Map(f.aporte?.clases ?? []);
    return {
      clave: f.clave,
      etiqueta: f.etiqueta,
      href: hrefFuente(f.clave),
      valores: columnas.map((c) => por.get(c.clave) ?? null),
      hrefs: columnas.map(() => hrefFuente(f.clave)),
    };
  });
  const juntas = uniones(datos, n);
  const deFuentes = fuentes.reduce((s, f) => s + (f.aporte?.triples ?? 0), 0);

  return (
    <>
      <Card as="section" aria-labelledby="fuentes-titulo" className="px-4 py-4">
        <p className="rotulo text-ink-soft">Grafo compilado el {formatFecha(datos.compilado)}</p>
        <CardTitle id="fuentes-titulo" className="mt-0.5">
          ¿Qué aporta cada fuente al grafo?
        </CardTitle>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-soft">
          Cada triple del grafo lleva la fuente de donde sale, con su fecha de corte, o la regla que lo deduce de otras. Cada fila es
          una fuente; cada columna, una clase de nodo; el tono, cuántos triples afirma esa fuente sobre esa clase. Una fuente sola dice
          poco; donde dos tocan la misma clase, el grafo junta lo que el Estado publica por separado.
        </p>
      </Card>
      <TiraDeCifras className="rounded-lg border border-hairline bg-surface">
        <Cifra etiqueta="Fuentes" valor={formatInt(fuentes.length)} nota={`${formatInt(deFuentes)} triples, el ${parte(deFuentes, datos.triples)} del grafo`} />
        <Cifra
          etiqueta="Reglas de Socrático"
          valor={formatInt(reglas.length)}
          nota={`${formatInt(datos.triples - deFuentes)} triples deducidos de las fuentes`}
        />
        <Cifra etiqueta="Clases donde se cruzan" valor={formatInt(juntas.length)} nota="las llenan dos fuentes o más" />
        <Cifra etiqueta="Triples distintos" valor={formatInt(datos.triples)} nota="cada uno contado una vez, con su fuente" />
      </TiraDeCifras>

      <Card as="section" aria-labelledby="fuentes-matriz" className="px-4 py-4">
        <CardTitle id="fuentes-matriz">Qué clases llena cada fuente</CardTitle>
        <p className="mt-0.5 text-xs text-ink-soft">Cada fila abre su fuente. Una columna es la clase del sujeto del triple.</p>
        <MatrizCruzada
          filas={filas}
          columnas={columnas}
          etiqueta="Triples que cada fuente afirma sobre cada clase de nodo"
          lectura={(fila, col, v) => `${fila.etiqueta}, en ${col.etiqueta}: ${v == null ? "no la toca" : `${formatInt(v)} triples`}`}
        />
        <VerComoTabla
          className="-mx-4 sm:-mx-4"
          nombre="fuentes"
          columnas={[{ titulo: "Fuente" }, { titulo: "Clases que llena" }, { titulo: "Triples", numerica: true }]}
          filas={fuentes.map((f) => ({
            clave: f.clave,
            celdas: [
              f.etiqueta,
              (f.aporte?.clases ?? [])
                .filter(([c]) => n.esClase(c))
                .map(([c, v]) => `${n.clase(c)} (${formatInt(v)})`)
                .join(", ") || "—",
              formatInt(f.aporte?.triples ?? 0),
            ],
          }))}
        />
      </Card>

      {juntas.length > 0 && (
        <Card as="section" aria-labelledby="fuentes-uniones" className="px-4 py-4">
          <CardTitle id="fuentes-uniones">Dónde se juntan</CardTitle>
          <p className="mt-0.5 text-xs text-ink-soft">Las clases que llenan dos fuentes o más, con los triples de cada una.</p>
          <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
            {juntas.map((u) => (
              <li key={u.clase} className="py-2.5">
                <Link href={hrefClase(u.clase)} className="text-[13px] font-semibold text-ink hover:text-brand-700 hover:underline">
                  {n.clase(u.clase)}
                </Link>
                <span className="ml-2 font-mono text-xs text-ink-soft">{formatInt(u.fuentes.length)} fuentes</span>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                  {u.fuentes.map((x, i) => (
                    <span key={x.f.clave}>
                      {i > 0 && " · "}
                      <Link href={hrefFuente(x.f.clave)} className="text-brand-700 hover:underline">
                        {x.f.etiqueta}
                      </Link>{" "}
                      <span className="font-mono tabular-nums">{formatInt(x.triples)}</span>
                    </span>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function FichaDeFuente({
  datos,
  f,
  ontologia,
  hrefFuente,
  hrefClase,
  hrefNodo,
  onAbrir,
}: {
  datos: FuentesVista;
  f: FuenteVista;
  ontologia: OntologiaVista | undefined;
  hrefFuente: (clave: string | null) => string;
  hrefClase: (curie: string) => string;
  hrefNodo: (ruta: string) => string;
  onAbrir: (p: PasoRastro) => void;
}) {
  const n = nombres(ontologia);
  const a = f.aporte;
  const porClave = new Map(datos.fuentes.map((x) => [x.clave, x]));
  const clasesPropias = (a?.clases ?? []).filter(([c]) => n.esClase(c));

  // El esquema: la clase que más llena en el centro, y las clases que liga con ella.
  const centro = clasesPropias[0]?.[0] ?? null;
  const vecinos: VecinoRed[] = [];
  const vistos = new Set<string>();
  for (const [s, p, o, v] of a?.aristas ?? []) {
    if (!centro || s === o) continue;
    const otra = s === centro && n.esClase(o) ? o : o === centro && n.esClase(s) ? s : null;
    if (!otra || vistos.has(otra)) continue;
    vistos.add(otra);
    vecinos.push({
      clave: otra,
      nombre: n.clase(otra),
      arista: `${n.prop(p)} · ${formatInt(v)}`,
      grupo: s === centro ? "Liga con" : "La nombran",
      href: hrefClase(otra),
    });
  }
  // Con quién se cruza: por cada clase que llena, las otras fuentes que también la llenan.
  const cruces = clasesPropias
    .map(([c]) => ({
      clase: c,
      otras: datos.fuentes.filter((x) => x.clave !== f.clave && esFuente(x) && x.aporte?.clases.some(([y]) => y === c)),
    }))
    .filter((x) => x.otras.length > 0);
  const cruce = a?.cruce ?? null;
  const otraDelCruce = cruce ? porClave.get(cruce.otra) : null;

  return (
    <>
      <Card as="section" aria-labelledby="fuente-titulo" className="px-4 py-4">
        <nav aria-label="Dónde estás" className="text-xs text-ink-soft">
          <Link href={hrefFuente(null)} className="inline-flex min-h-11 items-center underline hover:text-brand-700 sm:min-h-0">
            Todas las fuentes
          </Link>
          <span aria-hidden> › </span>
          <span>{f.deriva ? "Regla de Socrático" : f.corte ? `Fuente, corte del ${formatFecha(f.corte)}` : "Fuente, sin corte"}</span>
        </nav>
        <CardTitle id="fuente-titulo" className="mt-1 text-base">
          {f.etiqueta}
        </CardTitle>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink">{f.descripcion}</p>
        {f.deriva && f.deriva.length > 0 && (
          <p className="mt-2 text-xs text-ink-soft">
            Deduce de:{" "}
            {f.deriva.map((d, i) => (
              <span key={d}>
                {i > 0 && ", "}
                <Link href={hrefFuente(d)} className="text-brand-700 underline">
                  {porClave.get(d)?.etiqueta ?? d}
                </Link>
              </span>
            ))}
          </p>
        )}
      </Card>

      {a ? (
        <TiraDeCifras className="rounded-lg border border-hairline bg-surface">
          <Cifra etiqueta="Triples que afirma" valor={formatInt(a.triples)} nota={`el ${parte(a.triples, datos.triples)} del grafo`} />
          <Cifra etiqueta="Nodos que describe" valor={formatInt(a.nodos)} nota="sujetos distintos de sus triples" />
          <Cifra etiqueta="Clases que llena" valor={formatInt(clasesPropias.length)} nota={centro ? `sobre todo ${n.clase(centro)}` : undefined} />
          <Cifra etiqueta="Predicados que usa" valor={formatInt(a.predicados.length)} nota={`compilado el ${formatFecha(datos.compilado)}`} />
        </TiraDeCifras>
      ) : (
        <p className="text-sm text-ink-soft">El grafo compilado no le cuenta ningún triple a esta fuente.</p>
      )}

      {a && centro && (
        <Card as="section" aria-labelledby="fuente-esquema" className="px-4 py-4">
          <CardTitle id="fuente-esquema">Su esquema</CardTitle>
          <p className="mt-0.5 text-xs text-ink-soft">
            Qué clases liga y con qué relación: en el centro, la clase que más llena. Cada clase abre su lugar en la ontología.
          </p>
          <RedVecinos
            className="mx-auto mt-3 max-w-4xl"
            centro={n.clase(centro)}
            vecinos={vecinos.slice(0, 18)}
            total={vecinos.length}
            etiqueta={`Las clases que ${f.etiqueta} liga con ${n.clase(centro)}`}
          />
          {/* Por debajo de `sm`, una línea por combinación; desde `sm`, la tabla. */}
          <ul className="mt-3 divide-y divide-hairline border-t border-hairline sm:hidden">
            {a.aristas.slice(0, 40).map(([s, p, o, v]) => (
              <li key={`${s} ${p} ${o}`} className="py-2 text-[13px] leading-snug">
                <span className="font-medium text-ink">{n.clase(s)}</span> <span className="text-ink-soft">{n.prop(p)}</span>{" "}
                <span className="font-medium text-ink">{n.clase(o)}</span>
                <span className="block font-mono text-xs tabular-nums text-ink-soft">{formatInt(v)} triples</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 hidden sm:block">
            <Table className="tabla-densa">
              <TableHeader>
                <TableRow>
                  <TableHead>De</TableHead>
                  <TableHead>Relación o dato</TableHead>
                  <TableHead>A</TableHead>
                  <TableHead className="text-right">Triples</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.aristas.slice(0, 40).map(([s, p, o, v]) => (
                  <TableRow key={`${s} ${p} ${o}`}>
                    <TableCell className="py-1.5 text-[13px]">
                      {n.esClase(s) ? (
                        <Link href={hrefClase(s)} className="text-brand-700 hover:underline">
                          {n.clase(s)}
                        </Link>
                      ) : (
                        n.clase(s)
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 text-[13px]">
                      {n.prop(p)} <span className="font-mono text-xs text-ink-soft">{p}</span>
                    </TableCell>
                    <TableCell className="py-1.5 text-[13px]">
                      {n.esClase(o) ? (
                        <Link href={hrefClase(o)} className="text-brand-700 hover:underline">
                          {n.clase(o)}
                        </Link>
                      ) : (
                        <span className="text-ink-soft">{n.clase(o)}</span>
                      )}
                    </TableCell>
                    <TableCell numerica className="py-1.5 text-[13px]">
                      {formatInt(v)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {a.aristas.length > 40 && (
            <p className="mt-2 text-xs text-ink-soft">
              Las 40 combinaciones con más triples, de {formatInt(a.aristas.length)}.
            </p>
          )}
        </Card>
      )}

      <div className="grid items-start gap-3 lg:gap-4 xl:grid-cols-2">
        {clasesPropias.length > 0 && (
          <Card as="section" aria-labelledby="fuente-clases" className="px-4 py-4">
            <CardTitle id="fuente-clases">Qué clases llena</CardTitle>
            <BarrasHorizontales
              className="mt-3"
              etiqueta={`Triples de ${f.etiqueta} por clase del sujeto`}
              barras={clasesPropias.map(([c, v]) => ({ clave: c, etiqueta: n.clase(c), valor: v, cifra: formatInt(v), href: hrefClase(c) }))}
              lineas={1}
            />
          </Card>
        )}

        {cruces.length > 0 && !f.deriva && (
          <Card as="section" aria-labelledby="fuente-cruces" className="px-4 py-4">
            <CardTitle id="fuente-cruces">Con quién se cruza</CardTitle>
            <p className="mt-0.5 text-xs text-ink-soft">Las otras fuentes que llenan sus mismas clases: ahí el grafo las junta.</p>
            <ul className="mt-2 divide-y divide-hairline border-t border-hairline">
              {cruces.map((x) => (
                <li key={x.clase} className="py-2">
                  <Link href={hrefClase(x.clase)} className="text-[13px] font-semibold text-ink hover:text-brand-700 hover:underline">
                    {n.clase(x.clase)}
                  </Link>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                    {x.otras.map((o, i) => (
                      <span key={o.clave}>
                        {i > 0 && " · "}
                        <Link href={hrefFuente(o.clave)} className="text-brand-700 hover:underline">
                          {o.etiqueta}
                        </Link>
                      </span>
                    ))}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {cruce && otraDelCruce && (
        <Card as="section" aria-labelledby="fuente-ejemplo" className="px-4 py-4">
          <CardTitle id="fuente-ejemplo">Un nodo donde se ve</CardTitle>
          <p className="mt-0.5 text-xs text-ink-soft">
            Un nodo real con un triple de esta fuente y otro de {otraDelCruce.etiqueta}: el mismo registro, dicho por dos.
          </p>
          <Link
            href={hrefNodo(cruce.ruta)}
            onClick={(e) => {
              if (!clicSimple(e)) return;
              e.preventDefault();
              onAbrir({ ruta: cruce.ruta, titulo: cruce.titulo });
            }}
            className="mt-3 inline-flex min-h-11 items-center text-[15px] font-semibold text-brand-700 hover:underline sm:min-h-0"
          >
            {cruce.titulo}
          </Link>
          <dl className="mt-2 grid gap-2 text-[13px] sm:grid-cols-2">
            {[
              { de: f.etiqueta, t: cruce.este },
              { de: otraDelCruce.etiqueta, t: cruce.aquel },
            ].map((x) => (
              <div key={x.de} className="rounded-md border border-hairline px-3 py-2">
                <dt className="text-xs text-ink-soft">Según {x.de}</dt>
                <dd className="mt-0.5">
                  <span className="font-medium text-ink">{n.prop(x.t[0])}</span>{" "}
                  <span className="break-words font-mono text-xs text-ink-soft">{valor(x.t[1])}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {f.urls.length > 0 && (
        <Card as="section" aria-labelledby="fuente-origen" className="px-4 py-4">
          <CardTitle id="fuente-origen">De dónde se lee</CardTitle>
          <ul className="mt-2 space-y-1">
            {f.urls.map((u) => (
              <li key={u} className="min-w-0">
                <a href={u} rel="noopener noreferrer" target="_blank" className="inline-flex min-h-11 max-w-full items-center gap-1 break-all text-xs text-brand-700 underline sm:min-h-0">
                  <span className="min-w-0 truncate">{u}</span>
                  <IconExternal className="h-3.5 w-3.5 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-soft">
            Su estado y sus límites de cobertura:{" "}
            <Link href="/fuentes" className="text-brand-700 underline">
              Fuentes y límites
            </Link>
            .
          </p>
        </Card>
      )}
    </>
  );
}

/** Las fuentes que llenan una clase, para la ficha de la clase en el recorrido de la ontología. */
export function FuentesDeClase({ datos, curie, hrefFuente }: { datos: FuentesVista; curie: string; hrefFuente: (clave: string) => string }) {
  const filas = datos.fuentes
    .map((f) => ({ f, v: f.aporte?.clases.find(([c]) => c === curie)?.[1] ?? 0 }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v);
  if (filas.length === 0) return null;
  return (
    <Card as="section" aria-labelledby="onto-fuentes" className="px-4 py-4">
      <CardTitle id="onto-fuentes">Qué fuentes la llenan</CardTitle>
      <p className="mt-0.5 text-xs text-ink-soft">Los triples que cada fuente o regla afirma sobre esta clase; cada una abre lo que aporta.</p>
      <BarrasHorizontales
        className="mt-3"
        etiqueta="Triples de cada fuente sobre esta clase"
        barras={filas.map(({ f, v }) => ({
          clave: f.clave,
          etiqueta: f.deriva ? `${f.etiqueta} (regla)` : f.etiqueta,
          valor: v,
          cifra: formatInt(v),
          href: hrefFuente(f.clave),
        }))}
        lineas={1}
      />
    </Card>
  );
}
