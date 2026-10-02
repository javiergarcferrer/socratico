#!/usr/bin/env node
/**
 * El compilador del grafo (docs/PLAN-GRAFO.md, F2): corre los constructores
 * (`lib/grafo-constructores.ts`) sobre todas las instantáneas, para cada nodo
 * de cada tipo, y escribe lo que afirman en `datos/grafo/`. El servidor ya no
 * arma una descripción al pedirla: la lee de ahí (`lib/grafo-compilado.ts`,
 * y el schema.org de cada ficha, `lib/grafo-ld.ts`).
 *
 *   datos/grafo/meta.json                  conteos, huella, inventario y la primera clave de cada fragmento
 *   datos/grafo/nodos/<tipo>/NNN.json.br   la descripción entera de cada nodo
 *   datos/grafo/ld/<tipo>/NNN.json.br      el schema.org de cada ficha
 *   datos/grafo/ld/meta.json               la primera clave de cada fragmento de schema.org
 *   datos/grafo/vecinos/<tipo>/NNN.json.br las aristas de cada nodo hacia otros (lo que recorre `camino()`)
 *   datos/grafo/compras.json               lo publicado por cada institución en la tabla de procesos
 *
 * Los nodos de cada tipo se reparten en fragmentos en orden de clave, como
 * las filas del padrón; `meta.json` guarda la primera clave de cada uno, así
 * que leer un nodo es una búsqueda binaria y abrir un archivo. Cada fragmento
 * trae su tabla de términos y cada nodo, sus triples como índices en ella
 * (`lib/grafo-nodo.ts`), en brotli.
 *
 * Una empresa que el grafo no liga a nada no se escribe: su descripción es la
 * plantilla sobre su fila del padrón (`describirEmpresaSola`), y el
 * compilador comprueba que lo es.
 *
 * Cada triple lleva el grafo con nombre de donde sale —una fuente y su corte,
 * o una regla de Socrático— (`grafosEnVivo`, guardados en `meta.json`).
 *
 * Antes de darlo por bueno, lo **relee por los módulos del servidor** y lo
 * compara nodo a nodo, triple a triple y grafo a grafo, con lo que dicen los
 * constructores; el schema.org de cada ficha con el de la descripción
 * ligera; los vecinos con las aristas de la descripción; lo publicado con la
 * tabla de procesos; y pasa cada nodo por el esquema zod de su clase
 * (`lib/ontologia-esquemas.ts`). Si algo difiere, sale con 1.
 *
 * Uso:
 *     node scripts/build-grafo.mjs              # compila y comprueba (tras las demás instantáneas)
 *     node scripts/build-grafo.mjs --comprobar  # solo comprueba lo escrito (el gate)
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { brotliCompress, constants, gunzipSync } from "node:zlib";
import { registrarTs } from "./cargador-ts.mjs";

registrarTs();
// La compresión corre en el pool de libuv: tantos hilos como núcleos (antes de su primer uso).
process.env.UV_THREADPOOL_SIZE ??= String(availableParallelism());
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Los módulos leen las instantáneas desde process.cwd(), como en el servidor.
process.chdir(RAIZ);
const SALIDA = path.join(RAIZ, "datos", "grafo");
const DATOS = path.join(RAIZ, "public", "data");
const COMPROBAR = process.argv.includes("--comprobar");
const W3ID = /W3ID = "([^"]+)"/.exec(readFileSync(path.join(RAIZ, "lib", "rdf.ts"), "utf8"))[1];
const lib = (m) => import(pathToFileURL(path.join(RAIZ, "lib", `${m}.ts`)).href);

// Cuánto lleva un fragmento: lo bastante para que haya pocos archivos y lo
// bastante poco para que abrir uno en frío cueste milisegundos.
const BYTES_POR_FRAGMENTO = 160_000;
const BYTES_POR_FRAGMENTO_LD = 96_000;

const C = await lib("grafo-constructores");
const N = await lib("grafo-nodo");
const LD = await lib("grafo-ld");
const F = await lib("funcionarios");
const I = await lib("instituciones");
const B = await lib("financieras");
const D = await lib("decretos");
const P = await lib("provincias");
const E = await lib("empresas");
const R = await lib("grafo-rdf");
const GC = await lib("grafo-compilado");
const T = await lib("tablas-compras");
const ESQ = await lib("ontologia-esquemas");
const O = await lib("ontologia");

const t0 = performance.now();
const segundos = () => `${Math.round((performance.now() - t0) / 1000)} s`;

/* ------------------------------------------------------------ los nodos */

/** Cada nodo que los constructores saben describir, por tipo, en orden estable. */
async function claves() {
  const [f, fin, ind] = await Promise.all([F.getFuncionarios(), B.getFinancieras(), D.indiceDecretos()]);
  if (!f || !fin || !ind) throw new Error("falta una instantánea: funcionarios.json, banca.json o decretos/indice.json");
  // Un decreto es nodo si su número resuelve una ficha (`decretoPorNumero`):
  // las filas que la resuelven, de todos los archivos del registro.
  const numeros = new Set();
  for (const a of readdirSync(path.join(DATOS, "decretos")).sort()) {
    const m = /^(\d{4}|sin-fecha)\.json$/.exec(a);
    if (!m) continue;
    for (const d of await D.decretosDelAnio(m[1] === "sin-fecha" ? m[1] : Number(m[1]))) if (d.ficha && d.numero) numeros.add(d.numero);
  }
  // Las empresas del padrón: el RNC encabeza cada fila de `empresas/filas/`.
  const rncs = [];
  for (const a of readdirSync(path.join(DATOS, "empresas", "filas")).sort()) {
    for (const linea of gunzipSync(readFileSync(path.join(DATOS, "empresas", "filas", a))).toString("utf8").split("\n")) {
      if (linea) rncs.push(linea.slice(0, linea.indexOf("\t")));
    }
  }
  // En el orden de los fragmentos: así se escriben y así se recorren.
  const orden = (xs) => [...xs].sort(N.compararClaves);
  return {
    provincia: orden(P.PROVINCIAS.map((p) => p.slug)),
    institucion: orden(I.INSTITUCIONES.map((i) => String(i.id))),
    "entidad-financiera": orden(fin.entidades.map((e) => e.slug)),
    funcionario: orden(f.personas.map((p) => p.id)),
    decreto: orden(numeros),
    empresa: orden(rncs),
  };
}

/* ---------------------------------------------------------- comparar */

const mismoTermino = (x, y) => x.tipo === y.tipo && x.valor === y.valor && (x.idioma ?? null) === (y.idioma ?? null) && (x.datatype ?? null) === (y.datatype ?? null);

/** `null` si dicen lo mismo, triple a triple y en el mismo orden; si no, qué difiere. */
function diferencia(a, b) {
  if (!a || !b) return a === b ? null : `${a ? "" : "no hay compilado"}${b ? "" : "no hay constructor"}`;
  if (a.titulo !== b.titulo) return `título «${a.titulo}» ≠ «${b.titulo}»`;
  if ((a.nota ?? null) !== (b.nota ?? null)) return `nota «${a.nota}» ≠ «${b.nota}»`;
  if (a.triples.length !== b.triples.length) return `${a.triples.length} triples ≠ ${b.triples.length}`;
  if ((a.grafos?.length ?? -1) !== a.triples.length || (b.grafos?.length ?? -1) !== b.triples.length) return "un triple sin grafo";
  for (let i = 0; i < a.triples.length; i++) {
    if (a.grafos[i] !== b.grafos[i]) return `triple ${i}: grafo ${a.grafos[i]} ≠ ${b.grafos[i]}`;
    const x = a.triples[i];
    const y = b.triples[i];
    if (x.p !== y.p || !mismoTermino(x.s, y.s) || !mismoTermino(x.o, y.o)) return `triple ${i}: <${x.s.valor}> <${x.p}> «${x.o.valor}» ≠ <${y.s.valor}> <${y.p}> «${y.o.valor}»`;
  }
  return null;
}

/* ---------------------------------------------------- contra la ontología */

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const SOC = `${W3ID}/def/core#`;
const DO = `${W3ID}/def/do#`;
const XSD = "http://www.w3.org/2001/XMLSchema#";
const curieDe = (v) => (v.startsWith(SOC) ? `soc:${v.slice(SOC.length)}` : v.startsWith(DO) ? `do:${v.slice(DO.length)}` : null);
const funcional = new Set(O.PROPIEDADES.filter((p) => p.funcional).map((p) => O.curie(p)));
const esquemas = new Map();
const esquemaDe = (clase) => {
  if (!esquemas.has(clase)) esquemas.set(clase, O.CLASES.some((c) => O.curie(c) === clase) ? ESQ.esquemaClase(clase) : null);
  return esquemas.get(clase);
};
/** Un valor de RDF en el JSON de un nodo: un número, un sí o un no, o un texto (un IRI, un día, un año). */
const valorJson = (o) => {
  if (o.tipo !== "literal") return o.valor;
  if (o.datatype === `${XSD}integer` || o.datatype === `${XSD}decimal`) return Number(o.valor);
  if (o.datatype === `${XSD}boolean`) return o.valor === "true";
  return o.valor;
};

/**
 * Cada sujeto de una descripción con un tipo de la ontología, contra el
 * esquema zod de su clase (`esquemaClase`, de la misma definición que el
 * SHACL): sus propiedades de aquí, con su tipo y su cardinalidad. Devuelve lo
 * que no cabe.
 */
function contraLaOntologia(d) {
  const porSujeto = new Map();
  for (const x of d.triples) {
    if (x.s.tipo !== "iri") continue;
    let e = porSujeto.get(x.s.valor);
    if (!e) porSujeto.set(x.s.valor, (e = { tipos: new Set(), props: {} }));
    if (x.p === RDF_TYPE) {
      const c = x.o.tipo === "iri" ? curieDe(x.o.valor) : null;
      if (c) e.tipos.add(c);
    } else {
      // Un grafo es un conjunto: el mismo triple dos veces es uno (como cuenta SHACL).
      const c = curieDe(x.p);
      const v = valorJson(x.o);
      if (c && !(e.props[c] ??= []).includes(v)) e.props[c].push(v);
    }
  }
  const fallos = [];
  for (const [sujeto, { tipos, props }] of porSujeto) {
    const obj = Object.fromEntries(Object.entries(props).map(([k, vs]) => [k, funcional.has(k) && vs.length === 1 ? vs[0] : vs]));
    for (const clase of tipos) {
      const r = esquemaDe(clase)?.safeParse(obj);
      if (r && !r.success) fallos.push(`${sujeto} (${clase}): ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    }
  }
  return fallos;
}

/* ---------------------------------------------------------- compilar */

/**
 * Los fragmentos de un tipo: los registros, ya en orden de clave, en tramos
 * de unos `bytesPorFragmento`; `limites` es la primera clave de cada tramo.
 */
function repartir(registros, bytesPorFragmento) {
  const cubetas = [];
  let peso = Infinity;
  for (const r of registros) {
    if (peso >= bytesPorFragmento) {
      cubetas.push([]);
      peso = 0;
    }
    cubetas.at(-1).push(r);
    peso += r.peso;
  }
  return { limites: cubetas.map((c) => c[0].clave), cubetas };
}

/** El índice de cada grafo en `meta.grafos`: lo fija `compilar` antes de codificar. */
let indiceGrafo = new Map();

function codificarNodos(cubeta) {
  const terminos = [];
  const indice = new Map();
  const id = (c) => {
    const k = JSON.stringify(c);
    let i = indice.get(k);
    if (i === undefined) {
      i = terminos.length;
      terminos.push(c);
      indice.set(k, i);
    }
    return i;
  };
  const nodos = {};
  for (const { clave, d } of cubeta) {
    const ints = [];
    d.triples.forEach((x, i) => {
      const g = indiceGrafo.get(d.grafos[i]);
      if (g === undefined) throw new Error(`${clave}: el grafo «${d.grafos[i]}» no está en grafosEnVivo()`);
      ints.push(id(N.codificarTermino(x.s)), id(x.p), id(N.codificarTermino(x.o)), g);
    });
    nodos[clave] = [d.titulo, d.nota ?? null, ints];
  }
  return { terminos, nodos };
}

// Brotli al máximo es lento (~1 MB/s): los fragmentos se comprimen a la vez, uno por núcleo.
const comprimir = promisify(brotliCompress);
const brotli = (texto) =>
  comprimir(texto, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: Buffer.byteLength(texto) } });

/** Las aristas de un nodo hacia otros nodos, como las lee `camino()`: `[destino, vía, nombre]`. */
const vecinosDe = (d, n) =>
  R.relacionesDesdeTriples(d.triples, N.iriDe(n)).flatMap((r) => (r.nodo ? [[R.claveNodo(r.nodo), r.neutro, r.nombre]] : []));

/** Un fragmento del índice de vecinos, en filas comprimidas (`FragmentoVecinos`). */
function codificarVecinos(cubeta, tipo) {
  const cadenas = [];
  const indice = new Map();
  const id = (c) => {
    let i = indice.get(c);
    if (i === undefined) {
      i = cadenas.length;
      cadenas.push(c);
      indice.set(c, i);
    }
    return i;
  };
  const f = { cadenas, claves: [], titulos: [], inicio: [0], aristas: [] };
  for (const { clave, d } of cubeta) {
    f.claves.push(clave);
    f.titulos.push(id(d.titulo));
    for (const [destino, via, nombre] of vecinosDe(d, { tipo, id: clave })) f.aristas.push(id(destino), id(via), id(nombre));
    f.inicio.push(f.aristas.length / 3);
  }
  return f;
}

/** Escribe los archivos de un directorio y borra los que ya no tocan (un tipo con menos fragmentos). */
function escribirDirectorio(dir, archivos) {
  mkdirSync(dir, { recursive: true });
  for (const [nombre, bytes] of archivos) writeFileSync(path.join(dir, nombre), bytes);
  const vigentes = new Set(archivos.map(([n]) => n));
  for (const a of readdirSync(dir)) if (!vigentes.has(a)) unlinkSync(path.join(dir, a));
}

/**
 * Los grafos con nombre, con su IRI: el de una fuente lleva su corte
 * (`…/fuente/padron/2026-09-19`); el de una regla, el día en que se compiló.
 */
function conIri(definiciones, generado) {
  return definiciones.map((g) => ({
    ...g,
    iri: g.derivado ? `${W3ID}/derivado/${g.clave}/${generado}` : `${W3ID}/fuente/${g.clave}${g.corte ? `/${g.corte}` : ""}`,
  }));
}

async function compilar(todas) {
  const generado = new Date().toISOString().slice(0, 10);
  const grafos = conIri(await C.grafosEnVivo(), generado);
  indiceGrafo = new Map(grafos.map((g, i) => [g.clave, i]));
  const tipos = {};
  const limitesLd = {};
  const escritos = [];
  let empresasSolas = 0;
  let triplesTotal = 0;
  for (const tipo of N.TIPOS_COMPILADOS) {
    const nodos = [];
    const lds = [];
    const fuera = [];
    let triples = 0;
    for (const clave of todas[tipo]) {
      const n = { tipo, id: clave };
      const d = await C.describirEnVivo(n);
      if (!d) continue;
      for (const f of contraLaOntologia(d)) fuera.push(f);
      const ld = LD.aSchemaOrg((await C.describirEnVivo(n, true)).triples, N.iriDe(n));
      let conRegistro = true;
      let conLd = true;
      if (tipo === "empresa") {
        // La que es solo su fila no se escribe; su schema.org, tampoco si es el de la plantilla.
        const sola = N.describirEmpresaSola(await E.empresaPorRnc(clave));
        conRegistro = diferencia(d, sola) !== null;
        conLd = JSON.stringify(ld) !== JSON.stringify(LD.aSchemaOrg(sola.triples, N.iriDe(n)));
        if (!conRegistro) empresasSolas++;
      }
      if (conRegistro) {
        // Lo que pesa en el fragmento, más o menos: la mitad de los términos se repiten dentro de él.
        nodos.push({ clave, d, peso: 12 * d.triples.length + JSON.stringify(d.triples.map((x) => x.o.valor)).length / 2 });
        triples += d.triples.length;
      }
      if (conLd) lds.push({ clave, ld, peso: JSON.stringify(ld).length });
    }
    if (fuera.length) {
      for (const f of fuera.slice(0, 8)) console.log(`NO CABE ${f}`);
      throw new Error(`${fuera.length} nodos de ${tipo} no caben en el esquema de su clase (lib/ontologia-esquemas.ts): no se escribe nada`);
    }
    const { limites, cubetas } = repartir(nodos, BYTES_POR_FRAGMENTO);
    const archivos = await Promise.all(cubetas.map(async (c, i) => [N.archivoFragmento(i), await brotli(JSON.stringify(codificarNodos(c)))]));
    escribirDirectorio(path.join(SALIDA, "nodos", tipo), archivos);
    // El índice de vecinos, con los mismos fragmentos que las descripciones.
    const archivosVecinos = await Promise.all(cubetas.map(async (c, i) => [N.archivoFragmento(i), await brotli(JSON.stringify(codificarVecinos(c, tipo)))]));
    escribirDirectorio(path.join(SALIDA, "vecinos", tipo), archivosVecinos);
    const ld = repartir(lds, BYTES_POR_FRAGMENTO_LD);
    const archivosLd = await Promise.all(
      ld.cubetas.map(async (c, i) => [N.archivoFragmento(i), await brotli(JSON.stringify(Object.fromEntries(c.map((r) => [r.clave, r.ld]))))]),
    );
    escribirDirectorio(path.join(SALIDA, "ld", tipo), archivosLd);
    for (const [nombre, bytes] of archivos) escritos.push([`nodos/${tipo}/${nombre}`, bytes]);
    for (const [nombre, bytes] of archivosLd) escritos.push([`ld/${tipo}/${nombre}`, bytes]);
    for (const [nombre, bytes] of archivosVecinos) escritos.push([`vecinos/${tipo}/${nombre}`, bytes]);
    tipos[tipo] = { nodos: nodos.length, triples, limites };
    limitesLd[tipo] = ld.limites;
    triplesTotal += triples;
    const mb = (xs) => (xs.reduce((s, [, b]) => s + b.length, 0) / 1e6).toFixed(2);
    console.log(
      `${tipo}: ${nodos.length.toLocaleString("en-US")} nodos, ${triples.toLocaleString("en-US")} triples, ` +
        `${limites.length} fragmentos (${mb(archivos)} MB; vecinos ${mb(archivosVecinos)} MB); schema.org de ${lds.length.toLocaleString("en-US")} fichas en ${ld.limites.length} (${mb(archivosLd)} MB) · ${segundos()}`,
    );
  }
  const huella = createHash("sha256");
  for (const [ruta, bytes] of escritos.sort((a, b) => (a[0] < b[0] ? -1 : 1))) huella.update(ruta).update(bytes);
  const f = await F.getFuncionarios();
  const meta = {
    formato: N.FORMATO_GRAFO,
    generado,
    aFecha: f?.generado ?? null,
    grafos,
    tipos,
    empresasSolas,
    triples: triplesTotal,
    huella: huella.digest("hex"),
    inventario: await C.inventarioEnVivo(),
    wikidata: await C.enlacesWikidataEnVivo(),
  };
  writeFileSync(path.join(SALIDA, "ld", "meta.json"), `${JSON.stringify({ formato: N.FORMATO_GRAFO, limites: limitesLd })}\n`);
  // Lo publicado por cada institución en la tabla de procesos: lo que dice `fetch` (`lib/mcp.ts`).
  writeFileSync(path.join(SALIDA, "compras.json"), `${JSON.stringify(await T.publicadoPorInstitucion(I.INSTITUCIONES))}\n`);
  writeFileSync(path.join(SALIDA, "meta.json"), `${JSON.stringify(meta)}\n`);
}

/* ---------------------------------------------------------- comprobar */

/**
 * Relee el compilado por los módulos del servidor y lo compara con los
 * constructores, nodo a nodo. Devuelve cuántos nodos difieren.
 */
async function comprobar(todas) {
  const meta = JSON.parse(readFileSync(path.join(SALIDA, "meta.json"), "utf8"));
  const metaLd = JSON.parse(readFileSync(path.join(SALIDA, "ld", "meta.json"), "utf8"));
  const malos = [];
  const anotar = (k, por) => {
    if (malos.length < 8) console.log(`DIFIERE ${k}: ${por}`);
    malos.push(k);
  };
  if (meta.formato !== N.FORMATO_GRAFO || metaLd.formato !== N.FORMATO_GRAFO) anotar("meta", `formato ${meta.formato}, se esperaba ${N.FORMATO_GRAFO}`);
  let nodos = 0;
  let fichas = 0;
  for (const tipo of N.TIPOS_COMPILADOS) {
    // La descripción entera, por el mismo `describir()` que llama el servidor.
    let conRegistro = 0;
    // En orden de clave, el de los fragmentos y el del padrón: cada archivo se abre una vez.
    for (const clave of todas[tipo]) {
      const n = { tipo, id: clave };
      const vivo = await C.describirEnVivo(n);
      if (!vivo) continue;
      nodos++;
      const por = diferencia(await R.describir(n), vivo);
      if (por) anotar(`${tipo}:${clave}`, por);
      for (const f of contraLaOntologia(vivo)) anotar(`${tipo}:${clave} (ontología)`, f);
      const conRegistroEste = tipo !== "empresa" || diferencia(vivo, N.describirEmpresaSola(await E.empresaPorRnc(clave))) !== null;
      if (conRegistroEste) conRegistro++;
      // Sus vecinos, como los recorre `camino()`: los del índice, los de su descripción.
      const indice = await GC.leerVecinos(n);
      const esperado = conRegistroEste ? { titulo: vivo.titulo, vecinos: vecinosDe(vivo, n) } : undefined;
      const leido = indice && { titulo: indice.titulo, vecinos: indice.vecinos.map((v) => [R.claveNodo(v.nodo), v.via, v.nombre]) };
      if (JSON.stringify(leido) !== JSON.stringify(esperado)) anotar(`${tipo}:${clave} (vecinos)`, "el índice de vecinos difiere");
    }
    // Ni uno de más: el compilado no puede traer nodos que los constructores ya no describen.
    if (conRegistro !== meta.tipos[tipo]?.nodos) anotar(tipo, `${meta.tipos[tipo]?.nodos} nodos compilados, ${conRegistro} hoy`);
    // El schema.org de cada ficha; la de una empresa le pasa su fila, como la página.
    for (const clave of todas[tipo]) {
      const n = { tipo, id: clave };
      const ligero = await C.describirEnVivo(n, true);
      if (!ligero) continue;
      fichas++;
      const empresa = tipo === "empresa" ? await E.empresaPorRnc(clave) : undefined;
      const ld = await LD.schemaOrgDe(n, empresa);
      if (JSON.stringify(ld) !== JSON.stringify(LD.aSchemaOrg(ligero.triples, N.iriDe(n)))) anotar(`${tipo}:${clave} (schema.org)`, "el JSON-LD difiere");
    }
    console.log(`comprobado ${tipo} · ${segundos()}`);
  }
  const [inventario, wikidata] = [await C.inventarioEnVivo(), await C.enlacesWikidataEnVivo()];
  if (JSON.stringify(inventario) !== JSON.stringify(meta.inventario)) anotar("inventario", "los conteos por clase cambiaron");
  if (JSON.stringify(conIri(await C.grafosEnVivo(), meta.generado)) !== JSON.stringify(meta.grafos)) anotar("grafos", "las fuentes o los cortes de los grafos con nombre cambiaron");
  const compras = JSON.parse(readFileSync(path.join(SALIDA, "compras.json"), "utf8"));
  if (JSON.stringify(compras) !== JSON.stringify(await T.publicadoPorInstitucion(I.INSTITUCIONES))) anotar("compras", "lo publicado por institución cambió");
  if (JSON.stringify(wikidata) !== JSON.stringify(meta.wikidata)) anotar("wikidata", "los enlaces a Wikidata cambiaron");
  return { malos: malos.length, nodos, fichas, triples: meta.triples };
}

const todas = await claves();
if (!COMPROBAR) {
  await compilar(todas);
} else if (!existsSync(path.join(SALIDA, "meta.json"))) {
  console.log("no hay grafo compilado: node scripts/build-grafo.mjs");
  process.exit(1);
}
const r = await comprobar(todas);
const resumen = `${r.nodos.toLocaleString("en-US")} nodos y el schema.org de ${r.fichas.toLocaleString("en-US")} fichas, ${r.triples.toLocaleString("en-US")} triples compilados`;
if (r.malos) {
  console.log(`no conforme: ${r.malos.toLocaleString("en-US")} diferencias entre el compilado y los constructores — node scripts/build-grafo.mjs`);
  process.exit(1);
}
console.log(`idéntico a los constructores: ${resumen} · ${segundos()}`);
