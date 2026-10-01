#!/usr/bin/env node
/**
 * La evaluación del servidor MCP (`/mcp`, `lib/mcp.ts`): docs/PLAN-ACCESO.md
 * §6 sexies, M5.
 *
 * Cada caso es una pregunta que le hace a Socrático quien investiga —«la
 * compra más grande de 2026», «las licitaciones de mobiliario abiertas»,
 * «cuánto le ha contratado el Estado a su mayor proveedor», «quién dirige el
 * MINERD»— hecha como la haría un asistente, con la herramienta que le toca.
 * La respuesta correcta (el oráculo) se calcula aquí, aparte, leyendo las
 * instantáneas de `public/data` (`procesos.json`, `historico/`,
 * `busqueda/corpus.json`), no con el código del servidor: un cambio que rompa
 * la forma de una herramienta, o un script que cambie la forma del corpus que
 * `lib/busqueda.ts` vuelve a separar, deja su caso en rojo.
 *
 * Además de lo que pide cada caso, toda respuesta se revisa por las reglas
 * que no se relajan (docs/ARQUITECTURA.md, el servidor MCP): ninguna cadena
 * con forma de cédula, y el aviso de herramienta independiente y no oficial
 * en cada respuesta que no es de `search`, cuyos resultados dicen cada uno la
 * fecha de su instantánea.
 *
 * Habla el protocolo a mano —JSON-RPC sobre HTTP «streamable», revisión
 * 2025-06-18, sin sesión, como Claude y ChatGPT hoy—: sin dependencias.
 * `verificar.sh --completo` la corre contra `next start` después del build.
 *
 * Uso:
 *     node scripts/eval-mcp.mjs                                   # http://localhost:3000/mcp
 *     node scripts/eval-mcp.mjs --url https://socratico.vercel.app/mcp
 * Sale con 1 si un caso falla.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATOS = path.join(RAIZ, "public", "data");
const i = process.argv.indexOf("--url");
const URL_MCP = i > 0 ? process.argv[i + 1] : "http://localhost:3000/mcp";
const leer = (ruta) => JSON.parse(readFileSync(path.join(DATOS, ruta), "utf8"));
const SITIO = /SITIO = "([^"]+)"/.exec(readFileSync(path.join(RAIZ, "lib", "sitio.ts"), "utf8"))[1];
// Los espacios de nombres de la ontología (lib/rdf.ts): el núcleo y el módulo dominicano.
const W3ID = /W3ID = "([^"]+)"/.exec(readFileSync(path.join(RAIZ, "lib", "rdf.ts"), "utf8"))[1];
const SOC = `${W3ID}/def/core#`;
const DO = `${W3ID}/def/do#`;

/* ---------------------------------------------------------------- cliente */

let siguiente = 0;

async function rpc(method, params = {}) {
  const res = await fetch(URL_MCP, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++siguiente, method, params }),
    signal: AbortSignal.timeout(90_000),
  });
  const texto = await res.text();
  // Una respuesta en SSE trae el mensaje en su línea `data:`.
  const cuerpo = texto.split("\n").find((l) => l.startsWith("data: "))?.slice(6) ?? texto;
  return JSON.parse(cuerpo);
}

/** Todas las respuestas, para las reglas que valen para cualquiera. */
const vistas = [];

/** Llama una herramienta: `{ datos }` si respondió, `{ error }` si la rechazó (validación o aviso). */
async function llamar(nombre, args = {}) {
  const r = await rpc("tools/call", { name: nombre, arguments: args });
  if (r.error) return { error: r.error.message ?? JSON.stringify(r.error) };
  const res = r.result;
  vistas.push({ nombre, res });
  if (res.isError) return { error: res.content?.map((c) => c.text).join(" ") ?? "isError" };
  return { datos: res.structuredContent };
}

/* ---------------------------------------------------------------- oráculo */

const sinTildes = (s) => s.normalize("NFD").replace(/\p{M}/gu, "");
/** Como `plano()` de lib/raiz.ts: minúsculas, sin tildes, palabras separadas por un espacio y rodeadas de uno. */
const plano = (s) => ` ${sinTildes(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

const procesosJson = leer("procesos.json");
/** Las etapas cortas del índice (scripts/busqueda_procesos.py), desde el literal de la DGCP. */
const ETAPA = {
  "Proceso publicado": "Abierto a ofertas",
  "Proceso con etapa cerrada": "Recepción cerrada",
  "Sobres estan abriendose": "En evaluación",
  "Sobres abiertos o aperturados": "En evaluación",
  "Proceso adjudicado y celebrado": "Adjudicado",
  "Proceso desierto": "Desierto",
  Cancelado: "Cancelado",
  Suspendido: "Suspendido",
};
const procesos = procesosJson.filas.map(([codigo, iu, im, ie, io, caratula, fecha, monto]) => ({
  codigo,
  unidad: procesosJson.unidades[iu],
  modalidad: procesosJson.modalidades[im],
  estado: procesosJson.estados[ie],
  objeto: procesosJson.objetos[io],
  caratula,
  fecha,
  valor: monto || null,
}));
/** De mayor a menor valor y, a igual valor, el más reciente: el orden de `procurement`. */
const porMonto = (a, b) => (b.valor ?? -1) - (a.valor ?? -1) || b.fecha.localeCompare(a.fecha);
const de2026 = procesos.filter((p) => p.fecha.startsWith("2026")).sort(porMonto);

const resumen = leer("historico/resumen.json");
const historicoInstituciones = leer("historico/instituciones.json").filas;
const mayorProveedor = resumen.proveedores[0];
const filaProveedor = leer(`historico/proveedores/${mayorProveedor.rpe.slice(-1)}.json`).filas[mayorProveedor.rpe];
const suma = (serie, k) => serie.reduce((s, f) => s + f[k], 0);
const corpus = leer("busqueda/corpus.json");
const rncMayor = corpus.docs.find((d) => d.t === "proveedor" && d.r === mayorProveedor.rpe)?.c ?? null;
const instituciones = leer("instituciones.json").instituciones;
const MINERD = instituciones.find((x) => x.acronimo === "MINERD");
const INAPA = instituciones.find((x) => x.acronimo === "INAPA");
const MESCYT = instituciones.find((x) => x.acronimo === "MESCYT");

// El cruce RPE → RNC con que el grafo ata una contratación a su empresa.
const rncDe = leer("historico/rnc.json").rnc;
const topMinerd = historicoInstituciones[String(MINERD.id)].top;

// Homónimos: dos registros de proveedor con el mismo nombre, sin la forma
// jurídica. Pueden ser dos personas o dos empresas; la herramienta no elige.
const FORMAS = new Set(["srl", "sa", "sas", "eirl", "cxa", "spa", "ltda", "inc", "s", "a", "c", "x", "por"]);
const claveNombre = (x) => plano(x).trim().split(" ").filter((w) => !FORMAS.has(w)).join(" ");
const proveedoresCorpus = corpus.docs.filter((d) => d.t === "proveedor" && d.r);
const porNombre = new Map();
for (const d of proveedoresCorpus) {
  const k = claveNombre(d.ti);
  porNombre.set(k, [...(porNombre.get(k) ?? []), d]);
}
const homonimo = [...porNombre.values()].filter((v) => v.length > 1).sort((a, b) => a[0].ti.localeCompare(b[0].ti))[0] ?? null;
const porRnc = new Map();
for (const d of proveedoresCorpus) if (d.c) porRnc.set(d.c, [...(porRnc.get(d.c) ?? []), d]);
const rncDoble = [...porRnc.entries()].find(([, v]) => v.length > 1)?.[0] ?? null;
// Una unidad que comparte prefijo (la OPRET con el MOPC) pero tiene su serie.
const compartidaConSerie =
  resumen.sinAsignar
    .flatMap((x) => x.unidades)
    .map((u) => instituciones.find((x) => plano(x.nombre) === plano(u)))
    .find((x) => x && historicoInstituciones[String(x.id)]?.serie.some((f) => f[1] > 0)) ?? null;

/* ------------------------------------------------------------------ casos */

class Fallo extends Error {}
function exigir(condicion, mensaje) {
  if (!condicion) throw new Fallo(mensaje);
}
const pesos = (n) => `RD$ ${Number(n).toLocaleString("en-US")}`;

const CASOS = [
  {
    pregunta: "¿Qué herramientas ofrece el servidor, y son de solo lectura?",
    async correr() {
      const ini = await rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "eval-mcp", version: "1" },
      });
      exigir(ini.result?.instructions?.includes("procurement"), "las instrucciones no nombran procurement");
      const { result } = await rpc("tools/list");
      const nombres = result.tools.map((t) => t.name);
      for (const n of ["retrieve", "search", "fetch", "procurement", "contracting_history", "query", "path", "signed_decrees", "ontology"]) {
        exigir(nombres.includes(n), `falta la herramienta ${n}`);
      }
      // Los argumentos van en inglés, como los nombres de las herramientas (y el `query` e `id` que ChatGPT exige).
      const CASTELLANO = /^(pregunta|tipo|pagina|anio|texto|institucion|proveedor|persona|desde|hasta|consulta|nodos|vecinos|grupo|orden|estado|modalidad|objeto|materia|limite|montoMinimo|montoMaximo)$/;
      for (const t of result.tools) {
        exigir(t.outputSchema, `${t.name} sin outputSchema`);
        exigir(t.annotations?.readOnlyHint === true, `${t.name} no se declara de solo lectura`);
        const enCastellano = Object.keys(t.inputSchema?.properties ?? {}).filter((k) => CASTELLANO.test(k));
        exigir(enCastellano.length === 0, `${t.name} pide ${enCastellano.join(", ")} en castellano`);
      }
      return `${nombres.length} herramientas, servidor ${ini.result.serverInfo.version}`;
    },
  },
  {
    pregunta: "¿Cuál es la compra pública más grande de 2026?",
    async correr() {
      const { datos, error } = await llamar("procurement", { year: 2026 });
      exigir(!error, error);
      const top = de2026[0];
      exigir(datos.procesos[0].codigo === top.codigo, `la primera es ${datos.procesos[0].codigo}; debía ser ${top.codigo} (${pesos(top.valor)})`);
      exigir(datos.total === de2026.length, `total ${datos.total}; debía ser ${de2026.length}`);
      const sumaOraculo = de2026.reduce((s, p) => s + (p.valor ?? 0), 0);
      exigir(datos.suma === sumaOraculo, `suma ${datos.suma}; debía ser ${sumaOraculo}`);
      exigir(datos.notas.some((n) => n.includes("estimado")), "no dice que el valor es estimado");
      exigir(datos.notas.some((n) => n.includes("Quién ganó")), "no dice que el adjudicatario no está");
      return `${top.codigo}, ${pesos(top.valor)} (de ${datos.total.toLocaleString("en-US")})`;
    },
  },
  {
    pregunta: "¿Cuáles son las cinco mayores compras adjudicadas de 2026?",
    async correr() {
      const { datos, error } = await llamar("procurement", { year: 2026, status: ["adjudicado"] });
      exigir(!error, error);
      const esperadas = de2026.filter((p) => p.estado === "Proceso adjudicado y celebrado").slice(0, 5).map((p) => p.codigo);
      const dadas = datos.procesos.slice(0, 5).map((p) => p.codigo);
      exigir(JSON.stringify(dadas) === JSON.stringify(esperadas), `dio ${dadas.join(", ")}; debía ser ${esperadas.join(", ")}`);
      exigir(datos.procesos.every((p) => p.estado === "Adjudicado"), "trae procesos que no están adjudicados");
      return esperadas.join(", ");
    },
  },
  {
    pregunta: "¿Qué licitaciones de mobiliario o muebles están abiertas ahora? (Alcover)",
    async correr() {
      const { datos, error } = await llamar("procurement", { text: "mobiliario | muebles", status: ["abierto"] });
      exigir(!error, error);
      const esperados = procesos.filter(
        (p) => p.estado === "Proceso publicado" && / (mobiliari|muebl)/.test(plano(p.caratula)),
      );
      exigir(datos.total === esperados.length, `total ${datos.total}; debía ser ${esperados.length}`);
      exigir(datos.procesos.every((p) => p.estado === "Abierto a ofertas"), "trae procesos que no están abiertos");
      const mayor = esperados.sort(porMonto)[0];
      exigir(!mayor || datos.procesos[0].codigo === mayor.codigo, `la mayor es ${datos.procesos[0]?.codigo}; debía ser ${mayor?.codigo}`);
      return `${datos.total} abiertas; la mayor, ${mayor?.codigo} (${pesos(mayor?.valor ?? 0)})`;
    },
  },
  {
    pregunta: "¿Qué ha publicado el MINERD en 2026, lo más reciente primero?",
    async correr() {
      const { datos, error } = await llamar("procurement", { institution: "MINERD", year: 2026, sort: "fecha" });
      exigir(!error, error);
      const esperados = procesos.filter((p) => p.fecha.startsWith("2026") && plano(p.unidad) === plano(MINERD.nombre));
      exigir(datos.total === esperados.length, `total ${datos.total}; debía ser ${esperados.length}`);
      exigir(datos.procesos.every((p) => p.institucion.id === `/instituciones/${MINERD.id}`), "trae procesos de otra institución");
      exigir(datos.procesos.every((p, k, a) => k === 0 || a[k - 1].fecha >= p.fecha), "no están de la más reciente a la más vieja");
      return `${datos.total} procesos`;
    },
  },
  {
    pregunta: "La segunda página sigue a la primera, sin repetir",
    async correr() {
      const [a, b] = await Promise.all([llamar("procurement", { year: 2026 }), llamar("procurement", { year: 2026, page: 2 })]);
      exigir(!a.error && !b.error, a.error ?? b.error);
      const primera = new Set(a.datos.procesos.map((p) => p.codigo));
      exigir(b.datos.procesos.every((p) => !primera.has(p.codigo)), "la página 2 repite procesos de la 1");
      exigir(b.datos.procesos[0].valorEstimado <= a.datos.procesos.at(-1).valorEstimado, "la página 2 no sigue el orden");
      return "ok";
    },
  },
  {
    pregunta: "Una página más allá de la última viene vacía, no repite",
    async correr() {
      const { datos, error } = await llamar("procurement", { institution: "MINERD", year: 2026, page: 999 });
      exigir(!error, error);
      exigir(datos.procesos.length === 0, `la página 999 de ${datos.paginas} trae ${datos.procesos.length} procesos`);
      return `${datos.paginas} páginas`;
    },
  },
  {
    pregunta: "¿Qué se compró en 2020? (fuera de la instantánea: lo tiene que decir)",
    async correr() {
      const { datos, error } = await llamar("procurement", { year: 2020 });
      exigir(!error, error);
      exigir(datos.total === 0, `trae ${datos.total} procesos de 2020`);
      exigir(datos.notas.some((n) => n.includes("cubre lo publicado")), "no dice qué cubre la instantánea");
      return `cubre ${datos.cobertura.desde} → ${datos.cobertura.hasta}`;
    },
  },
  {
    pregunta: "Un pedido imposible se rechaza con un aviso (año 1900, institución que no existe)",
    async correr() {
      const a = await llamar("procurement", { year: 1900 });
      exigir(a.error, "aceptó el año 1900");
      const b = await llamar("procurement", { institution: "zzqqxx" });
      exigir(b.error?.includes("Ninguna institución"), `no avisó: ${b.error ?? "respondió"}`);
      return "rechazados";
    },
  },
  {
    pregunta: `¿Cuánto le ha contratado el Estado a ${mayorProveedor.nombre}, su mayor proveedor?`,
    async correr() {
      const { datos, error } = await llamar("contracting_history", { supplier: mayorProveedor.nombre });
      exigir(!error, error);
      const p = datos.proveedor;
      exigir(p.rpe === mayorProveedor.rpe, `resolvió el RPE ${p.rpe}; debía ser ${mayorProveedor.rpe}`);
      exigir(p.monto === suma(filaProveedor.s, 2), `monto ${p.monto}; debía ser ${suma(filaProveedor.s, 2)}`);
      exigir(p.contratos === suma(filaProveedor.s, 1), `contratos ${p.contratos}; debía ser ${suma(filaProveedor.s, 1)}`);
      exigir(datos.notas.some((n) => n.includes("no es lo pagado")), "no dice que es valor contratado, no pagado");
      return `${pesos(p.monto)} en ${p.contratos} contratos`;
    },
  },
  {
    pregunta: "El mismo proveedor, por su RNC",
    async correr() {
      exigir(rncMayor, "el oráculo no encontró su RNC en el corpus");
      const { datos, error } = await llamar("contracting_history", { supplier: rncMayor });
      exigir(!error, error);
      exigir(datos.proveedor.rpe === mayorProveedor.rpe, `resolvió el RPE ${datos.proveedor.rpe}`);
      return `RNC ${rncMayor} → RPE ${datos.proveedor.rpe}`;
    },
  },
  {
    pregunta: "¿Cuánto le contrató su mayor cliente?",
    async correr() {
      const [uc, contratos, monto] = filaProveedor.c[0];
      const { datos, error } = await llamar("contracting_history", {
        supplier: `/proveedores/${mayorProveedor.rpe}`,
        institution: `/instituciones/${uc}`,
      });
      exigir(!error, error);
      exigir(datos.alcance === "par" && datos.par.encontrado, "no encontró el par");
      exigir(datos.par.monto === monto && datos.par.contratos === contratos, `par ${datos.par.monto}/${datos.par.contratos}; debía ser ${monto}/${contratos}`);
      return `${datos.institucion.nombre}: ${pesos(monto)}`;
    },
  },
  {
    pregunta: "¿Cuánto ha contratado el MINERD desde 2015?",
    async correr() {
      const { datos, error } = await llamar("contracting_history", { institution: `/instituciones/${MINERD.id}` });
      exigir(!error, error);
      const serie = historicoInstituciones[String(MINERD.id)].serie;
      exigir(datos.institucion.monto === suma(serie, 2), `monto ${datos.institucion.monto}; debía ser ${suma(serie, 2)}`);
      exigir(datos.institucion.serie.length === serie.length, "la serie no tiene todos los años");
      return pesos(datos.institucion.monto);
    },
  },
  {
    pregunta: "¿Y el MOPC? (su prefijo es compartido: lo tiene que decir, no dar cero)",
    async correr() {
      const { datos, error } = await llamar("contracting_history", { institution: "MOPC" });
      exigir(!error, error);
      exigir(datos.institucion.sinAsignar, "no declara el prefijo sin asignar");
      return "declarado";
    },
  },
  {
    pregunta: "¿Quiénes son los mayores proveedores del Estado?",
    async correr() {
      const { datos, error } = await llamar("contracting_history", {});
      exigir(!error, error);
      exigir(datos.pais.mayoresProveedores[0].id === `/proveedores/${mayorProveedor.rpe}`, "el primero no es el del resumen");
      const total = resumen.anios.reduce((s, a) => s + a.monto, 0);
      exigir(datos.pais.monto === total, `monto ${datos.pais.monto}; debía ser ${total}`);
      return `${datos.pais.mayoresProveedores[0].nombre}; país ${pesos(total)}`;
    },
  },
  {
    pregunta: "Dos proveedores con el mismo nombre: no elige uno por su cuenta",
    async correr() {
      exigir(homonimo, "el oráculo no encontró homónimos");
      const { error } = await llamar("contracting_history", { supplier: homonimo[0].ti });
      exigir(error?.includes("registros distintos"), `no avisó de los homónimos de «${homonimo[0].ti}»: ${error ?? "respondió con uno"}`);
      return `«${homonimo[0].ti}»: ${homonimo.length} registros`;
    },
  },
  {
    pregunta: "Un RNC con dos registros de proveedor los nombra a los dos",
    async correr() {
      if (!rncDoble) return "ninguno en la instantánea";
      const { error } = await llamar("contracting_history", { supplier: rncDoble });
      exigir(error?.includes("registros de proveedor"), `no avisó: ${error ?? "respondió con uno"}`);
      return `RNC ${rncDoble}`;
    },
  },
  {
    pregunta: "Una institución que comparte prefijo pero tiene su serie (la OPRET) sí la da",
    async correr() {
      if (!compartidaConSerie) return "ninguna en la instantánea";
      const { datos, error } = await llamar("contracting_history", { institution: `/instituciones/${compartidaConSerie.id}` });
      exigir(!error, error);
      const serie = historicoInstituciones[String(compartidaConSerie.id)].serie;
      exigir(datos.institucion.sinAsignar === null, "la marca como sin asignar");
      exigir(datos.institucion.monto === suma(serie, 2), `monto ${datos.institucion.monto}; debía ser ${suma(serie, 2)}`);
      return `${compartidaConSerie.acronimo || compartidaConSerie.nombre}: ${pesos(datos.institucion.monto)}`;
    },
  },
  {
    pregunta: "El año del corte se marca parcial y la subida de 2015–2018 se explica",
    async correr() {
      const { datos, error } = await llamar("contracting_history", { institution: `/instituciones/${MINERD.id}` });
      exigir(!error, error);
      const anioCorte = Number(resumen.corte.slice(0, 4));
      exigir(datos.institucion.serie.every((a) => a.parcial === (a.anio === anioCorte)), "parcial no marca solo el año del corte");
      exigir(datos.notas.some((n) => n.includes("cobertura, no gasto nuevo")), "no explica la subida de los primeros años");
      return `${anioCorte} parcial`;
    },
  },
  {
    pregunta: "Un nombre de muchos proveedores pide el id",
    async correr() {
      const { error } = await llamar("contracting_history", { supplier: "Constructora" });
      exigir(error?.includes("proveedores que se llaman así"), `no pidió elegir: ${error ?? "respondió"}`);
      return "pidió el id";
    },
  },
  {
    pregunta: "Abrir la compra más grande de 2026: su estado, su institución y lo que no trae",
    async correr() {
      const top = de2026[0];
      const { datos, error } = await llamar("fetch", { id: `/procesos/${encodeURIComponent(top.codigo)}` });
      exigir(!error, error);
      exigir(datos.metadata.valorEstimado === top.valor, `valor ${datos.metadata.valorEstimado}; debía ser ${top.valor}`);
      exigir(datos.metadata.estado === ETAPA[top.estado], `estado ${datos.metadata.estado}; debía ser ${ETAPA[top.estado]}`);
      exigir(datos.metadata.objeto === top.objeto, `objeto ${datos.metadata.objeto}; debía ser ${top.objeto}`);
      exigir(datos.text.includes("Lo que esta instantánea no trae"), "no dice lo que no trae");
      exigir(datos.metadata.institucion?.startsWith("/instituciones/"), "no enlaza la institución");
      return `${datos.metadata.estado}, ${datos.metadata.institucion}`;
    },
  },
  {
    pregunta: "Abrir al mayor proveedor: lo contratado viene con el registro",
    async correr() {
      const { datos, error } = await llamar("fetch", { id: `/proveedores/${mayorProveedor.rpe}` });
      exigir(!error, error);
      exigir(datos.metadata.contratado?.monto === suma(filaProveedor.s, 2), "no trae lo contratado, o no cuadra");
      return pesos(datos.metadata.contratado.monto);
    },
  },
  {
    pregunta: "Abrir el MINERD: sus compras y quién lo dirige",
    async correr() {
      const { datos, error } = await llamar("fetch", { id: `/instituciones/${MINERD.id}` });
      exigir(!error, error);
      exigir(datos.text.includes("## Compras públicas (DGCP)"), "no trae sus compras");
      exigir(datos.text.includes("La dirige:"), "no dice quién la dirige");
      const serie = historicoInstituciones[String(MINERD.id)].serie;
      exigir(datos.metadata.compras?.contratado?.monto === suma(serie, 2), "lo contratado no cuadra");
      return "ok";
    },
  },
  {
    pregunta: "Buscar solo procesos: «puente basculante»",
    async correr() {
      const { datos, error } = await llamar("search", { query: "puente basculante", type: "proceso" });
      exigir(!error, error);
      exigir(datos.results.length > 0, "no encontró nada");
      exigir(datos.results.every((r) => r.id.startsWith("/procesos/")), "trae resultados que no son procesos");
      return `${datos.total} procesos`;
    },
  },
  {
    pregunta: "Las páginas de search siguen una a otra, con y sin tipo",
    async correr() {
      for (const [args, porPagina] of [
        [{ query: "mobiliario" }, 20],
        [{ query: "mobiliario", type: "proceso" }, 30],
      ]) {
        const [a, b] = await Promise.all([llamar("search", args), llamar("search", { ...args, page: 2 })]);
        exigir(!a.error && !b.error, a.error ?? b.error);
        exigir(a.datos.paginas === b.datos.paginas, `${JSON.stringify(args)}: ${a.datos.paginas} páginas en la 1 y ${b.datos.paginas} en la 2`);
        exigir(a.datos.paginas === Math.max(1, Math.ceil(a.datos.total / porPagina)), `${JSON.stringify(args)}: ${a.datos.paginas} páginas para ${a.datos.total}`);
        const primera = new Set(a.datos.results.map((r) => r.id));
        exigir(b.datos.results.every((r) => !primera.has(r.id)), `${JSON.stringify(args)}: la página 2 repite resultados`);
      }
      return "ok";
    },
  },
  {
    pregunta: "El grafo: ¿a quién le ha contratado más el MINERD? (fetch con group compras)",
    async correr() {
      const { datos, error } = await llamar("fetch", { id: `/instituciones/${MINERD.id}`, group: "compras" });
      exigir(!error, error);
      const [rpe, nombre, , monto] = topMinerd[0];
      const primera = datos.metadata.relaciones[0];
      const destino = rncDe[rpe] ? `/empresas/${rncDe[rpe]}` : `/proveedores/${rpe}`;
      exigir(datos.metadata.total === topMinerd.length, `${datos.metadata.total} contrataciones; debían ser ${topMinerd.length}`);
      exigir(datos.text.includes(nombre), "el texto no nombra al mayor proveedor");
      exigir(primera?.id === destino, `la primera va a ${primera?.id}; debía ir a ${destino} (${nombre})`);
      exigir(primera.monto === monto, `el monto es ${primera.monto}; debía ser ${monto}`);
      return `${nombre}: ${pesos(monto)} → ${destino}`;
    },
  },
  {
    pregunta: "El grafo: la empresa del mayor proveedor llega a su mayor cliente en un salto",
    async correr() {
      const rnc = rncDe[mayorProveedor.rpe];
      exigir(rnc, "el oráculo no tiene su RNC");
      const uc = filaProveedor.c[0][0];
      const { datos, error } = await llamar("path", { from: `/empresas/${rnc}`, to: `/instituciones/${uc}` });
      exigir(!error, error);
      exigir(datos.encontrado && datos.saltos === 1, `${datos.encontrado ? `${datos.saltos} saltos` : datos.explicacion}`);
      return datos.pasos.map((x) => x.nombre).join(" → ");
    },
  },
  {
    pregunta: "La ontología declara la contratación, en sus dos módulos, con sus formas SHACL y su perfil para Fabric",
    async correr() {
      const { datos, error } = await llamar("ontology", {});
      exigir(!error, error);
      exigir(datos.espacio === SOC && datos.espacioDominicano === DO, `espacios ${datos.espacio} y ${datos.espacioDominicano}`);
      exigir(datos.clases.some((c) => c.id === "soc:Contratacion" && c.estado === "en-uso"), "no declara soc:Contratacion en uso");
      exigir(datos.clases.some((c) => c.id === "do:MedidaDGCP"), "no declara do:MedidaDGCP");
      for (const p of ["soc:contratante", "soc:contratista", "soc:montoContratado", "soc:numeroDeContratos", "do:rpe", "do:rnc"]) {
        exigir(datos.propiedades.some((x) => x.id === p), `no declara ${p}`);
      }
      for (const url of [datos.descargas.shacl, datos.descargas.fabric]) {
        const r = await fetch(url.replace(SITIO, URL_MCP.replace(/\/mcp$/, "")), { signal: AbortSignal.timeout(30_000) });
        exigir(r.ok && /turtle/.test(r.headers.get("content-type") ?? ""), `${url} responde ${r.status}`);
        exigir((await r.text()).includes(SOC), `${url} no usa el núcleo`);
      }
      return `versión ${datos.version}`;
    },
  },
  {
    pregunta: "SQL: ¿cuánto contrató el MINERD desde 2015, y a quién más?",
    async correr() {
      const { datos, error } = await llamar("query", {
        sql: `SELECT i.monto_contratado, i.contratos, c.proveedor_rpe, c.monto FROM instituciones i JOIN contrataciones c ON c.institucion_id = i.id WHERE i.id = ${MINERD.id} ORDER BY c.monto DESC LIMIT 1`,
      });
      exigir(!error, error);
      const [total, contratos, rpe, monto] = datos.filas[0] ?? [];
      const oraculo = resumen.instituciones.find((x) => x.uc === MINERD.id);
      exigir(total === oraculo.monto && contratos === oraculo.contratos, `dice ${total} en ${contratos}; debía ser ${oraculo.monto} en ${oraculo.contratos}`);
      const mayor = topMinerd.find(([r]) => rncDe[r]);
      exigir(rpe === mayor[0] && monto === mayor[3], `el mayor es ${rpe} con ${monto}; debía ser ${mayor[0]} con ${mayor[3]}`);
      exigir(datos.tablas.some((t) => t.tabla === "contrataciones" && t.corte), "no dice la fuente y el corte de las tablas");
      return `${pesos(total)}; el mayor, ${mayor[1]} (${pesos(monto)})`;
    },
  },
  {
    pregunta: "SQL: los procesos de 2026, el mayor y su suma, contra procesos.json",
    async correr() {
      const { datos, error } = await llamar("query", {
        sql: "SELECT count(*) n, sum(valor_estimado) suma, arg_max(codigo, valor_estimado) mayor FROM procesos WHERE year(fecha) = 2026",
      });
      exigir(!error, error);
      const [n, sumaSql, mayor] = datos.filas[0];
      exigir(n === de2026.length, `${n} procesos; debían ser ${de2026.length}`);
      exigir(sumaSql === de2026.reduce((t, p) => t + (p.valor ?? 0), 0), `suma ${sumaSql}`);
      exigir(mayor === de2026[0].codigo, `el mayor es ${mayor}; debía ser ${de2026[0].codigo}`);
      return `${n.toLocaleString("en-US")} procesos; el mayor, ${mayor}`;
    },
  },
  {
    pregunta: "SQL: el MOPC no da cero (sus contratos comparten prefijo), y una celda enorme se recorta",
    async correr() {
      const m = await llamar("query", { sql: "SELECT contratos, monto_contratado, sin_asignar FROM instituciones WHERE siglas = 'MOPC'" });
      exigir(!m.error, m.error);
      const [contratos, monto, prefijo] = m.datos.filas[0] ?? [];
      exigir(contratos === null && monto === null && prefijo === "MOPC", `dice ${contratos}, ${monto}, ${prefijo}`);
      const g = await llamar("query", { sql: "SELECT string_agg(titulo, ' ') FROM procesos" });
      exigir(!g.error, g.error);
      exigir(g.datos.truncada && g.datos.filas[0][0].length <= 2_001, `una celda de ${g.datos.filas[0][0].length} caracteres`);
      return "NULL con su prefijo; la celda, a 2 000";
    },
  },
  {
    pregunta: "SQL: una cadena que se multiplica no tumba el motor: se mata el proceso a tiempo y el siguiente responde",
    async correr() {
      const s = `'${"x".repeat(400)}'`;
      const t0 = performance.now();
      // 400⁴ caracteres: veinticinco mil millones, si nadie lo para.
      const { error } = await llamar("query", { sql: `SELECT length(replace(replace(replace(${s}, 'x', ${s}), 'x', ${s}), 'x', ${s}))` });
      const seg = Math.round((performance.now() - t0) / 1000);
      exigir(error?.includes("se detuvo"), `no se detuvo: ${error ?? "respondió"}`);
      exigir(seg <= 15, `tardó ${seg} s`);
      const b = await llamar("query", { sql: "SELECT length(bitstring('1', 2000000000)::VARCHAR)" });
      exigir(b.error, "aceptó bitstring");
      const despues = await llamar("query", { sql: "SELECT count(*) FROM medidas" });
      exigir(despues.datos?.filas?.[0]?.[0] > 0, `el motor no volvió: ${despues.error ?? JSON.stringify(despues.datos)}`);
      return `detenida en ${seg} s; el motor volvió`;
    },
  },
  {
    pregunta: "SQL: una lista enorme se recorta, y una fila de 300 columnas se recorta o se para",
    async correr() {
      const l = await llamar("query", { sql: "SELECT list(titulo) FROM procesos" });
      exigir(!l.error, l.error);
      const celda = l.datos.filas[0][0];
      exigir(l.datos.truncada && typeof celda === "string" && celda.length <= 2_001, `una celda de ${JSON.stringify(celda).length} caracteres`);
      const cols = Array.from({ length: 300 }, (_, k) => `s c${k}`).join(", ");
      // 300 copias de una cadena de 6 MB: o sale recortada, o el vigía de memoria la para; nunca entera.
      const w = await llamar("query", { sql: `WITH t AS (SELECT string_agg(titulo, '') s FROM procesos) SELECT ${cols} FROM t` });
      const largo = w.datos ? JSON.stringify(w.datos.filas).length : 0;
      exigir(w.error?.includes("se detuvo") || (w.datos?.truncada && largo <= 62_000), `${w.error ?? `${largo} caracteres en una fila`}`);
      const despues = await llamar("query", { sql: "SELECT count(*) FROM provincias" });
      exigir(despues.datos?.filas?.[0]?.[0] === 32, `el motor no volvió: ${despues.error ?? JSON.stringify(despues.datos)}`);
      return `celda a ${celda.length}; la fila ancha, ${w.error ? "detenida" : `a ${largo.toLocaleString("en-US")}`}`;
    },
  },
  {
    pregunta: "Un argumento que no existe es un error, no una respuesta sin filtro",
    async correr() {
      const { datos, error } = await llamar("contracting_history", { institucion: `/instituciones/${MINERD.id}` });
      exigir(error, `respondió ${datos?.alcance ?? "algo"} con un argumento que no existe`);
      return "rechazado";
    },
  },
  {
    pregunta: "SQL: las tablas no guardan personas naturales",
    async correr() {
      const t = await llamar("query", { sql: "SELECT table_name FROM information_schema.tables ORDER BY 1" });
      exigir(!t.error, t.error);
      const tablas = t.datos.filas.map((f) => f[0]).join(",");
      exigir(tablas === "contrataciones,empresas,equivalencias,financieras,instituciones,medidas,procesos,proveedores,provincias", `tablas: ${tablas}`);
      const p = await llamar("query", { sql: "SELECT count(*) FROM proveedores WHERE rnc IS NULL OR NOT regexp_matches(rnc, '^[0-9]{9}$')" });
      exigir(!p.error && p.datos.filas[0][0] === 0, `${p.datos?.filas?.[0]?.[0] ?? p.error} proveedores sin empresa`);
      return "9 tablas; cada proveedor, atado a una empresa";
    },
  },
  {
    pregunta: "SQL: una escritura, un archivo, la red, dos consultas o una función que toca la instancia se rechazan",
    async correr() {
      const vetadas = [
        "DROP TABLE procesos",
        "COPY procesos TO '/tmp/x.csv'",
        "SELECT * FROM read_csv('/etc/passwd')",
        "SELECT * FROM 'https://example.com/x.parquet'",
        "SELECT 1; SELECT 2",
        "SET threads = 8",
        // Funciones de tabla que cambian la instancia que todos comparten, o corren SQL escondido.
        "SELECT * FROM enable_logging('QueryLog')",
        "SELECT * FROM enable_logging(storage='file', storage_path='/tmp/p')",
        "SELECT message FROM duckdb_logs()",
        "SELECT * FROM query('SELECT * FROM enable_logging(''QueryLog'')')",
        "SELECT * FROM pragma_version()",
        // Una cadena del tamaño que se pida no la para el techo de memoria.
        "SELECT length(repeat('x', 2000000000))",
        "SELECT len(range(1000000000))",
      ];
      for (const sql of vetadas) {
        const { error } = await llamar("query", { sql });
        exigir(error, `aceptó ${sql}`);
      }
      const despues = await llamar("query", { sql: "SELECT count(*) FROM provincias" });
      exigir(despues.datos?.filas?.[0]?.[0] === 32, `el motor quedó mal: ${despues.error ?? JSON.stringify(despues.datos)}`);
      return `rechazadas las ${vetadas.length}; el motor sigue`;
    },
  },
  {
    pregunta: "El grafo entero se descarga, sin personas naturales, y ontology lo anuncia",
    async correr() {
      const meta = leer("grafo/meta.json");
      const r = await fetch(URL_MCP.replace(/\/mcp$/, "/data/grafo/grafo.nt.gz"), { signal: AbortSignal.timeout(90_000) });
      exigir(r.ok, `el volcado responde ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      // Un servidor puede mandarlo ya descomprimido (Content-Encoding): se acepta de las dos formas.
      const nt = (buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf).toString("utf8");
      const lineas = nt.split("\n").filter(Boolean);
      exigir(lineas.length === meta.triples, `${lineas.length} triples; meta.json dice ${meta.triples}`);
      exigir(!nt.includes(`${SITIO}/funcionarios/`), "toca a una persona con cargo");
      exigir(!nt.includes(`${SOC}DeclaracionJurada`), "trae declaraciones juradas");
      exigir(!nt.includes(`${SITIO}/normativa/decreto/`), "trae decretos");
      const [rpe, , , monto] = topMinerd[0];
      const arista = `<${SITIO}/proveedores/${rpe}#contratacion-${MINERD.id}> <${SOC}montoContratado> "${monto}"`;
      if (rncDe[rpe]) exigir(nt.includes(arista), "no trae la mayor contratación del MINERD");
      const { datos, error } = await llamar("ontology", {});
      exigir(!error, error);
      exigir(datos.descargas.grafo?.triples === meta.triples, "ontology no anuncia el volcado, o con otra cuenta");
      return `${meta.triples.toLocaleString("en-US")} triples, ${(meta.bytes / 1e6).toFixed(1)} MB, del ${meta.generado}`;
    },
  },
  {
    pregunta: "retrieve: «¿Cuál es la compra pública más grande de 2026?» en una llamada",
    async correr() {
      const { datos, error } = await llamar("retrieve", { query: "¿Cuál es la compra pública más grande de 2026?" });
      exigir(!error, error);
      exigir(datos.compras?.total === de2026.length, `corrió procurement con ${datos.compras?.total ?? "nada"}; debían ser ${de2026.length}`);
      exigir(datos.evidencias[0]?.id === `/procesos/${encodeURIComponent(de2026[0].codigo)}`, `la primera evidencia es ${datos.evidencias[0]?.id}`);
      return `${datos.evidencias[0].titulo.slice(0, 60)}…`;
    },
  },
  {
    pregunta: `retrieve: «¿Cuánto le ha contratado el Estado a ${mayorProveedor.nombre}?»`,
    async correr() {
      const { datos, error } = await llamar("retrieve", { query: `¿Cuánto le ha contratado el Estado a ${mayorProveedor.nombre}?` });
      exigir(!error, error);
      const ev = datos.evidencias.find((e) => e.clase === "Lo contratado desde 2015");
      exigir(ev, "no trajo lo contratado");
      exigir(ev.texto.replace(/[^\d]/g, "").startsWith(String(suma(filaProveedor.s, 2))), `dice «${ev.texto.slice(0, 80)}»`);
      return ev.texto.slice(0, 60);
    },
  },
  {
    pregunta: "retrieve: «¿Quién dirige el MINERD?» ata la institución por sus siglas",
    async correr() {
      const { datos, error } = await llamar("retrieve", { query: "¿Quién dirige el MINERD?" });
      exigir(!error, error);
      const e = datos.entidades[0];
      exigir(e?.id === `/instituciones/${MINERD.id}`, `la primera entidad es ${e?.id}`);
      exigir(e.relaciones.some((r) => r.includes("La dirige")), "no dice quién la dirige");
      return e.relaciones.find((r) => r.includes("La dirige")).slice(0, 70);
    },
  },
  {
    pregunta: "SQL: un producto cruzado se corta a tiempo y el motor sigue",
    async correr() {
      const t0 = performance.now();
      const { error } = await llamar("query", { sql: "SELECT count(*) FROM procesos a, procesos b, procesos c WHERE a.titulo || b.titulo = c.titulo" });
      const s = Math.round((performance.now() - t0) / 1000);
      exigir(error?.includes("se detuvo"), `no se cortó: ${error ?? "respondió"}`);
      exigir(s <= 15, `tardó ${s} s`);
      const b = await llamar("query", { sql: "SELECT count(*) FROM contrataciones" });
      exigir(b.datos?.filas?.[0]?.[0] > 0, `la siguiente consulta falló: ${b.error ?? JSON.stringify(b.datos)}`);
      return `cortada en ${s} s; la siguiente responde`;
    },
  },
  {
    pregunta: "retrieve: «Muéstrame lo contratado por el INAPA» no ata a otra empresa por la sigla",
    async correr() {
      const { datos, error } = await llamar("retrieve", { query: "Muéstrame lo contratado por el INAPA" });
      exigir(!error, error);
      exigir(datos.entidades[0]?.id === `/instituciones/${INAPA.id}`, `la primera entidad es ${datos.entidades[0]?.id}`);
      const ev = datos.evidencias.find((e) => e.clase === "Lo contratado desde 2015");
      exigir(ev?.id === `/instituciones/${INAPA.id}`, `lo contratado es de ${ev?.id ?? "nadie"}`);
      return ev.titulo;
    },
  },
  {
    pregunta: "retrieve: «Proveedores que más le venden al MINERD» no ata un proveedor por la palabra que abre",
    async correr() {
      const { datos, error } = await llamar("retrieve", { query: "Proveedores que más le venden al MINERD" });
      exigir(!error, error);
      exigir(!datos.entidades.some((e) => e.id.startsWith("/empresas/") && e.por.includes("nombra al proveedor")), "ató un proveedor");
      exigir(datos.entidades[0]?.id === `/instituciones/${MINERD.id}`, `la primera entidad es ${datos.entidades[0]?.id}`);
      return "MINERD";
    },
  },
  {
    pregunta: "retrieve: un nombre de dos proveedores no se resuelve por su cuenta",
    async correr() {
      exigir(homonimo, "el oráculo no encontró homónimos");
      const { datos, error } = await llamar("retrieve", { query: `¿Cuánto le ha contratado el Estado a ${homonimo[0].ti}?` });
      exigir(!error, error);
      exigir(datos.notas.some((n) => n.includes("registros de proveedor distintos")), "no avisó de los homónimos");
      exigir(!datos.evidencias.some((e) => e.clase === "Lo contratado desde 2015" && e.id?.startsWith("/proveedores/")), "eligió a uno");
      return `«${homonimo[0].ti}»`;
    },
  },
  {
    pregunta: "retrieve: «las compras más grandes del Ministerio de Educación Superior» no filtra por el MINERD",
    async correr() {
      const { datos, error } = await llamar("retrieve", { query: "¿Cuáles son las compras más grandes del Ministerio de Educación Superior?" });
      exigir(!error, error);
      const filtro = datos.compras?.filtros?.institution ?? null;
      exigir(filtro !== `/instituciones/${MINERD.id}`, "filtró por el MINERD");
      exigir(!filtro || filtro === `/instituciones/${MESCYT.id}`, `filtró por ${filtro}`);
      exigir(filtro || datos.notas.some((n) => n.includes("no se corrió procurement")), "corrió sin filtro y sin decirlo");
      return filtro ? `filtra por ${filtro} (${datos.compras.total})` : "no corrió, y lo dice";
    },
  },
  {
    pregunta: "retrieve: «la compra más grande de 2019» (antes de la instantánea) lleva a la historia",
    async correr() {
      const { datos, error } = await llamar("retrieve", { query: "¿Cuál fue la compra más grande de 2019?" });
      exigir(!error, error);
      exigir(datos.compras === null, "corrió procurement para 2019");
      exigir(datos.notas.some((n) => n.includes("2019 no está")), "no dice que 2019 no está");
      exigir(datos.siguientes.some((x) => x.herramienta === "contracting_history"), "no sugiere contracting_history");
      return "lleva a contracting_history";
    },
  },
  {
    pregunta: "retrieve: «materiales de trabajo» en minúsculas no es la sigla de una institución",
    async correr() {
      const { datos, error } = await llamar("retrieve", { query: "compras de materiales de trabajo abiertas" });
      exigir(!error, error);
      exigir(!datos.entidades.some((e) => e.por.includes("siglas")), `ató por siglas: ${datos.entidades.map((e) => e.titulo).join(", ")}`);
      exigir(!datos.compras?.filtros?.institution, `filtró por ${datos.compras?.filtros?.institution}`);
      return `${datos.compras?.total ?? 0} abiertas`;
    },
  },
  {
    pregunta: "retrieve: «¿Cuánto debe el país?» no ata entidades por la palabra «país»",
    async correr() {
      const { datos, error } = await llamar("retrieve", { query: "¿Cuánto debe el país?" });
      exigir(!error, error);
      exigir(datos.entidades.length === 0, `ató ${datos.entidades.map((x) => x.titulo).join(", ")}`);
      exigir(datos.pantallas.some((x) => x.url.endsWith("/deuda")), "no lleva a /deuda");
      return "lleva a /deuda";
    },
  },
  {
    pregunta: "¿Quién dirige el Ministerio de Educación?",
    async correr() {
      const { datos, error } = await llamar("fetch", { id: `/instituciones/${MINERD.id}`, group: "cargos" });
      exigir(!error, error);
      const dirige = datos.metadata.relaciones.find((r) => r.verbo === "La dirige");
      exigir(dirige?.id?.startsWith("/funcionarios/"), "no dice quién la dirige");
      return dirige.nombre;
    },
  },
  {
    pregunta: "El Decreto 497-25, por su número",
    async correr() {
      const { datos, error } = await llamar("fetch", { id: "Decreto 497-25" });
      exigir(!error, error);
      exigir(datos.id.includes("497-25") && datos.text.includes("## Fuente"), "no abrió el decreto con su fuente");
      return datos.title.slice(0, 60);
    },
  },
  {
    pregunta: "Los decretos que firmó Luis Abinader en 2025",
    async correr() {
      const { datos, error } = await llamar("signed_decrees", { person: "/funcionarios/luis-rodolfo-abinader-corona", year: 2025 });
      exigir(!error, error);
      exigir(datos.total > 0, "ninguno");
      exigir(datos.decretos.every((d) => !d.fecha || d.fecha.startsWith("2025")), "trae decretos de otro año");
      return `${datos.total} decretos`;
    },
  },
  {
    pregunta: "¿Cómo se liga Luis Abinader con el Ministerio de Educación?",
    async correr() {
      const { datos, error } = await llamar("path", { from: "/funcionarios/luis-rodolfo-abinader-corona", to: `/instituciones/${MINERD.id}` });
      exigir(!error, error);
      exigir(datos.encontrado, datos.explicacion);
      return `${datos.saltos} saltos`;
    },
  },
  {
    pregunta: "Una cédula no se busca en ninguna herramienta",
    async correr() {
      const cedula = "001-1234567-8";
      for (const [n, args] of [
        ["search", { query: cedula }],
        ["procurement", { text: cedula }],
        ["contracting_history", { supplier: cedula }],
        ["contracting_history", { supplier: "00112345678" }],
        ["retrieve", { query: `¿De quién es la cédula ${cedula}?` }],
        ["query", { sql: `SELECT * FROM empresas WHERE rnc = '${cedula}'` }],
      ]) {
        const { error } = await llamar(n, args);
        exigir(error, `${n} aceptó ${JSON.stringify(args)}`);
      }
      return "rechazada en las seis";
    },
  },
];

/* ------------------------------------------------ reglas de toda respuesta */

const CEDULA = /(?<!\d)\d{3}[-‐‑–—]\d{7}[-‐‑–—]\d(?!\d)/;

function reglasGenerales() {
  const fallos = [];
  for (const { nombre, res } of vistas) {
    const texto = JSON.stringify(res);
    if (CEDULA.test(texto)) fallos.push(`${nombre}: una respuesta trae algo con forma de cédula`);
    // Una pista que nombra un argumento viejo lleva al modelo a pedir sin filtro (la revisión del 30-09-2026).
    const vieja = /\b(con|e) (institucion|proveedor|persona|grupo|pagina|texto|anio|tipo|desde|hasta) «|\b(neighbors|sparql)\b/.exec(texto);
    if (vieja) fallos.push(`${nombre}: una respuesta nombra «${vieja[0]}», que ya no es una herramienta ni un argumento`);
    if (res.isError) continue;
    const d = res.structuredContent ?? {};
    if (nombre === "search") {
      const sinFecha = d.results?.filter((r) => !/\d{4}-\d{2}-\d{2}|límites de la ONE/.test(r.text)) ?? [];
      if (sinFecha.length) fallos.push(`search: ${sinFecha.length} resultados sin fecha de instantánea (${sinFecha[0].id})`);
    } else if (!(d.aviso ?? d.metadata?.aviso)) {
      fallos.push(`${nombre}: una respuesta sin el aviso de herramienta independiente y no oficial`);
    }
  }
  return fallos;
}

/* ------------------------------------------------------------------ correr */

console.log(`eval-mcp — ${URL_MCP}`);
let rojos = 0;
for (const caso of CASOS) {
  const t0 = performance.now();
  try {
    const dicho = await caso.correr();
    console.log(`  ok    ${caso.pregunta} — ${dicho} (${Math.round(performance.now() - t0)} ms)`);
  } catch (err) {
    rojos++;
    console.log(`  FAIL  ${caso.pregunta} — ${err instanceof Fallo ? err.message : String(err)}`);
  }
}
const generales = reglasGenerales();
for (const f of generales) console.log(`  FAIL  regla general — ${f}`);
rojos += generales.length;
console.log(`${CASOS.length - (rojos - generales.length)}/${CASOS.length} casos; ${generales.length ? `${generales.length} reglas generales en rojo` : "reglas generales en verde"} (${vistas.length} respuestas revisadas)`);
process.exit(rojos ? 1 : 0);
