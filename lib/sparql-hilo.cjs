/*
  El hilo de `sparql` (lib/mcp.ts): N3.js y Comunica corren aquí, no en el
  hilo del servidor. Una consulta mal acotada (un producto cruzado con ORDER BY
  o COUNT) crece con el cuadrado de los triples y no se puede interrumpir
  desde dentro: en un hilo aparte se la mata por tiempo (`terminate`) y su
  memoria tiene techo (`resourceLimits`), y el servidor sigue atendiendo.

  Recibe { id, triples, consulta, tope } y responde { id, ok, resultado } o
  { id, ok: false, motivo, mensaje }. Los triples llegan como términos
  (`{ tipo, valor, datatype?, idioma? }`, los de lib/rdf.ts) y se arman aquí;
  el almacén vive lo que dura la consulta. CommonJS a propósito: se carga de
  disco tal cual, sin pasar por el empaquetado, y requiere N3 y Comunica por
  las rutas que le pasa `lib/mcp.ts` (`workerData`).
*/
const { parentPort, workerData } = require("node:worker_threads");
// Las rutas que resolvió el hilo del servidor: las mismas que lleva el trazado.
const { Store, DataFactory: F } = require(workerData.n3);
const { QueryEngine } = require(workerData.comunica);

const motor = new QueryEngine();

const termino = (x) =>
  x.tipo === "iri"
    ? F.namedNode(x.valor)
    : x.tipo === "blanco"
      ? F.blankNode(x.valor)
      : F.literal(x.valor, x.idioma ?? (x.datatype ? F.namedNode(x.datatype) : undefined));

const aTermino = (x) => ({
  tipo: x.termType === "NamedNode" ? "iri" : x.termType === "Literal" ? "literal" : "blanco",
  valor: x.value,
  datatype: x.termType === "Literal" && x.datatype && !x.language ? x.datatype.value : null,
  idioma: x.language || null,
});

const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";
const nt = (x) =>
  x.termType === "NamedNode"
    ? `<${x.value}>`
    : x.termType === "BlankNode"
      ? `_:${x.value}`
      : `${JSON.stringify(x.value)}${x.language ? `@${x.language}` : x.datatype && x.datatype.value !== XSD_STRING ? `^^<${x.datatype.value}>` : ""}`;

async function correr({ triples, consulta, tope }) {
  const store = new Store();
  for (const x of triples) store.addQuad(F.quad(termino(x.s), F.namedNode(x.p), termino(x.o)));
  let r;
  try {
    r = await motor.query(consulta, { sources: [store] });
  } catch (err) {
    return { ok: false, motivo: "sintaxis", mensaje: String((err && err.message) || err) };
  }
  // Una actualización no se ejecuta: el tipo se sabe antes de correrla.
  if (r.resultType === "void") return { ok: false, motivo: "actualizacion", mensaje: "" };
  const base = { triples: store.size };
  if (r.resultType === "boolean") return { ok: true, resultado: { ...base, forma: "ask", booleano: await r.execute() } };
  if (r.resultType === "quads") {
    const quads = await (await r.execute()).toArray({ limit: tope + 1 });
    return {
      ok: true,
      resultado: {
        ...base,
        forma: "construct",
        lineas: quads.slice(0, tope).map((q) => `${nt(q.subject)} ${nt(q.predicate)} ${nt(q.object)} .`),
        truncado: quads.length > tope,
      },
    };
  }
  const filas = await (await r.execute()).toArray({ limit: tope + 1 });
  return {
    ok: true,
    resultado: {
      ...base,
      forma: "select",
      filas: filas.slice(0, tope).map((b) => Object.fromEntries([...b].map(([k, v]) => [k.value, aTermino(v)]))),
      truncado: filas.length > tope,
    },
  };
}

parentPort.on("message", async (pedido) => {
  let respuesta;
  try {
    respuesta = await correr(pedido);
  } catch (err) {
    respuesta = { ok: false, motivo: "fallo", mensaje: String((err && err.message) || err) };
  }
  parentPort.postMessage({ id: pedido.id, ...respuesta });
});
