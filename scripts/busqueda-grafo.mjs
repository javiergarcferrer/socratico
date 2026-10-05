#!/usr/bin/env node
/**
 * El puente entre el grafo compilado (`datos/grafo/`) y el buscador.
 *
 * Sin opciones, escribe las entradas del buscador que salen del grafo:
 *  · cada decreto, ley y resolución con ficha propia, leída de su nodo —el
 *    mismo número, título, fecha y enlace que dicen su ficha, el explorador
 *    y el servidor MCP—, en la forma de las demás normas del corpus (`t`
 *    «norma», `x` y `d` «Decreto 641-26», `h` la ficha, `f` la fecha). Así el
 *    buscador encuentra por sus palabras los 27 mil decretos del registro
 *    completo, no solo los de la instantánea reciente;
 *  · cada proveedor que la historia de contratos desde 2015 no trae y del
 *    que el grafo dice algo más que su inscripción: medidas de la DGCP o
 *    contratos de obra (`t` «proveedor», `r` el RPE, `c` el RNC de la
 *    empresa inscrita, `d` lo que tiene).
 * Van a la salida estándar como JSON (`{generado, cortes, entradas}`,
 * `cortes` la fecha de corte de cada grafo de fuente que las trae); las lee
 * `scripts/busqueda_grafo.py` para `scripts/build-busqueda.py`, que las
 * repara y les quita la cédula como a todas. Corre después de
 * `scripts/build-grafo.mjs`.
 *
 * Con `--comprobar`, dice si el corpus (`public/data/busqueda/corpus.json`) y
 * el grafo dicen lo mismo: cada entrada que lleva a la ficha de un nodo lleva
 * a un nodo del compilado, y a uno que ninguna otra entrada nombra; cada nodo
 * de un tipo que el buscador trae tiene su entrada, salvo los que el alcance
 * del buscador deja fuera a sabiendas (`FUERA`), que se reconocen por los
 * grafos de fuente que los afirman. Lo corre `.claude/hooks/verificar.sh
 * --completo`; sale con 1 si algo no casa.
 *
 * Uso: node scripts/busqueda-grafo.mjs [--comprobar]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registrarTs } from "./cargador-ts.mjs";

registrarTs();

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(RAIZ);
const lib = (m) => import(pathToFileURL(path.join(RAIZ, "lib", `${m}.ts`)).href);
const C = await lib("grafo-compilado");
const N = await lib("grafo-nodo");
const G = await lib("grafo");
const RDF = await lib("rdf");

const V = {
  titulo: RDF.expandir("dct:title"),
  numero: RDF.expandir("soc:numero"),
  fecha: RDF.expandir("soc:fecha"),
  mismo: RDF.expandir("owl:sameAs"),
  medida: RDF.expandir("soc:tieneMedida"),
  contratista: RDF.expandir("soc:contratista"),
  inscrita: RDF.expandir("soc:inscritaComo"),
};
const NOMBRE = { decreto: "Decreto", ley: "Ley", resolucion: "Resolución" };
/** Los grafos de fuente de las entradas, de los que se lee su fecha de corte. */
const FUENTES = ["decretos", "leyes", "resoluciones", "medidas", "obras"];

const meta = await C.metaGrafo();
if (!meta) throw new Error("no hay grafo compilado: node scripts/build-grafo.mjs");

const fmt = (n) => n.toLocaleString("en-US");

async function exportar() {
  const cortes = {};
  for (const clave of FUENTES) {
    const g = meta.grafos.find((x) => x.clave === clave);
    if (!g?.corte) throw new Error(`el grafo compilado no declara el corte de la fuente «${clave}»`);
    cortes[clave] = g.corte;
  }
  const entradas = [];
  for (const tipo of Object.keys(NOMBRE)) {
    for (const clave of await C.clavesCompiladas(tipo)) {
      const n = { tipo, id: clave };
      const d = await C.leerDescripcion(n);
      if (!d) throw new Error(`${tipo}:${clave} está en el índice del compilado y no se lee`);
      const s = N.iriDe(n);
      const de = (p) => d.triples.find((x) => x.s.valor === s && x.p === p && x.o.tipo === "literal")?.o.valor ?? null;
      // El número como lo escribe la Consultoría («15-2000»), como las demás normas del corpus.
      const cita = `${NOMBRE[tipo]} ${de(V.numero) ?? clave}`;
      const e = { t: "norma", ti: de(V.titulo) ?? cita, x: cita, d: cita, h: G.rutaDeNodo(n) };
      const f = de(V.fecha);
      if (f) e.f = f;
      entradas.push(e);
    }
  }
  // De la más reciente a la más vieja, como la instantánea de la Consultoría; a igual fecha, por ficha.
  entradas.sort((a, b) => (b.f ?? "").localeCompare(a.f ?? "") || (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));

  for (const clave of await C.clavesCompiladas("proveedor")) {
    const n = { tipo: "proveedor", id: clave };
    const d = await C.leerDescripcion(n);
    if (!d) throw new Error(`proveedor:${clave} está en el índice del compilado y no se lee`);
    // Con contratos desde 2015, lo trae la historia (`proveedores()` de build-busqueda.py).
    if (d.grafos.includes("contratos")) continue;
    const s = N.iriDe(n);
    const tiene = [
      d.triples.some((t) => t.s.valor === s && t.p === V.medida) && "Medidas de la DGCP",
      d.triples.some((t) => t.p === V.contratista && t.o.valor === s) && "Contratos de obra",
    ].filter(Boolean);
    if (!tiene.length) continue;
    // El RNC solo si la inscripción es de una empresa del padrón (persona jurídica): nunca una cédula.
    const rnc = d.triples
      .filter((t) => t.p === V.inscrita && t.o.valor === s)
      .map((t) => /\/empresas\/(\d{9})#id$/.exec(t.s.valor)?.[1])
      .find(Boolean);
    const e = { t: "proveedor", ti: d.titulo, r: clave, d: tiene.join(" · "), p: 1 };
    if (rnc) e.c = rnc;
    entradas.push(e);
  }
  process.stdout.write(JSON.stringify({ generado: meta.generado, cortes, entradas }));
}

/**
 * Lo que el buscador deja fuera a sabiendas, por tipo de nodo. Un nodo sin
 * entrada se reconoce por los grafos que afirman sus cuádruplos (todos de
 * `grafos`) o por su propia regla (`es`); el que no cae en ninguno es un
 * hueco del buscador.
 */
const FUERA = {
  funcionario: {
    porque: "legisladores (los encuentra su entrada de legislador)",
    // Su owl:sameAs lleva a la ficha de legislador que el corpus trae.
    es: (d, legisladores) =>
      d.triples.some((t) => {
        const m = t.p === V.mismo && /\/congreso\/legisladores\/(\d+)#id$/.exec(t.o.valor);
        return m && legisladores.has(`/congreso/legisladores/${m[1]}`);
      }),
  },
  proceso: {
    porque: "procesos de obra fuera de la tabla de doce meses",
    // El buscador trae los procesos de la tabla de los doce meses de la DGCP,
    // el grafo «procesos»; los demás los nombran los contratos de obra.
    es: (d) => !d.grafos.includes("procesos"),
  },
  proveedor: {
    porque: "proveedores solo inscritos",
    // Sin contratos desde 2015, medidas de la DGCP ni contratos de obra.
    grafos: new Set(["proveedores", "padron", "plataforma"]),
  },
};
/** Tipos del grafo que el buscador no trae: los abren su mapa y la vertical de empresas, que busca el padrón. */
const NO_BUSCABLES = { provincia: "provincias", empresa: "empresas del padrón" };

async function comprobar() {
  const t0 = Date.now();
  const corpus = JSON.parse(readFileSync(path.join(RAIZ, "public", "data", "busqueda", "corpus.json"), "utf8"));
  // Cada entrada que lleva a la ficha de un nodo, por tipo y clave compilada:
  // el mismo enlace que deriva el servidor (`lib/busqueda.ts`).
  const enCorpus = new Map();
  const legisladores = new Set();
  const fallas = [];
  const fallar = (que, ejemplo) => fallas.push(`${que}: ${ejemplo}`);
  let enlazan = 0;
  for (const d of corpus.docs) {
    const h = d.t === "proveedor" && d.r ? G.enlace.proveedor(d.r) : d.t === "proceso" && d.r ? G.enlace.proceso(d.r) : d.h;
    if (typeof h !== "string" || !h.startsWith("/")) continue;
    if (d.t === "legislador") legisladores.add(h);
    const n = G.nodoDeRuta(h);
    const clave = n && N.claveCompilada(n);
    if (!clave) continue;
    enlazan++;
    const k = `${n.tipo}:${clave}`;
    if (enCorpus.has(k)) fallar("dos entradas llevan al mismo nodo", `${k} (${enCorpus.get(k).ti} · ${d.ti})`);
    enCorpus.set(k, d);
  }
  const vistos = new Set();
  const fuera = {};
  const resumen = [];
  for (const [tipo, t] of Object.entries(meta.tipos)) {
    const claves = await C.clavesCompiladas(tipo);
    for (const clave of claves) vistos.add(`${tipo}:${clave}`);
    if (NO_BUSCABLES[tipo]) {
      resumen.push(`${fmt(claves.length)} ${NO_BUSCABLES[tipo]}`);
      continue;
    }
    const regla = FUERA[tipo];
    for (const clave of claves) {
      if (enCorpus.has(`${tipo}:${clave}`)) continue;
      const d = regla && (await C.leerDescripcion({ tipo, id: clave }));
      const afuera = d && (regla.es ? regla.es(d, legisladores) : d.grafos.every((g) => regla.grafos.has(g)));
      if (afuera) fuera[tipo] = (fuera[tipo] ?? 0) + 1;
      else fallar(`un nodo de ${tipo} sin entrada en el buscador`, `${clave}${d ? ` (grafos: ${[...new Set(d.grafos)].join(", ")})` : ""}`);
    }
    if (claves.length !== t.nodos) fallar(`el índice de ${tipo} no cuenta sus nodos`, `${claves.length} ≠ ${t.nodos}`);
  }
  for (const k of enCorpus.keys()) if (!vistos.has(k)) fallar("una entrada lleva a un nodo que el grafo no tiene", `${k} (${enCorpus.get(k).ti})`);

  if (fallas.length) {
    const porQue = new Map();
    for (const f of fallas) {
      const [que] = f.split(": ");
      porQue.set(que, [...(porQue.get(que) ?? []), f.slice(que.length + 2)]);
    }
    for (const [que, ej] of porQue) console.log(`${fmt(ej.length)} × ${que} — ${ej.slice(0, 4).join("; ")}`);
    process.exit(1);
  }
  const afuera = Object.entries(fuera).map(([tipo, n]) => `${fmt(n)} ${FUERA[tipo].porque}`);
  console.log(
    `de acuerdo: ${fmt(enlazan)} entradas, cada una con su nodo; fuera por alcance, ${afuera.join(", ")}; no buscables, ${resumen.join(" y ")} · ${Math.round((Date.now() - t0) / 1000)} s`,
  );
}

if (process.argv.includes("--comprobar")) await comprobar();
else await exportar();
