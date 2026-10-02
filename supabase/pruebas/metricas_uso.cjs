// Prueba de la lectura de Vercel Web Analytics que hace la Edge Function
// `metricas-uso` (supabase/functions/metricas-uso/normalizar.ts), sin red ni
// Deno: transpila el módulo real a un directorio temporal y recorre las URL y
// las respuestas con la forma que documenta la API (OpenAPI de Vercel,
// 2026-10-02) y con formas rotas. Debe imprimir `FALLOS: 0`.
// Uso: node supabase/pruebas/metricas_uso.cjs (docs/INFRAESTRUCTURA.md §10.11).
const fs = require("fs");
const os = require("os");
const path = require("path");

const raiz = path.resolve(__dirname, "../..");
const ts = require(path.join(raiz, "node_modules/typescript"));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uso-"));
const fuente = fs.readFileSync(path.join(raiz, "supabase/functions/metricas-uso/normalizar.ts"), "utf8");
const { outputText } = ts.transpileModule(fuente, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
fs.writeFileSync(path.join(dir, "normalizar.js"), outputText);
const n = require(path.join(dir, "normalizar.js"));

let fallos = 0;
function ver(nombre, obtenido, esperado) {
  const a = JSON.stringify(obtenido);
  const b = JSON.stringify(esperado);
  const ok = a === b;
  if (!ok) fallos++;
  console.log(ok ? "PASS" : "FAIL", nombre, ok ? "" : `→ ${a} ≠ ${b}`);
}

const ahora = new Date("2026-10-02T15:30:00.000Z");

// Los días se parten en UTC: a las 22:00 de Santo Domingo ya es el día siguiente.
ver("inicio de hoy", n.inicioDeDia(ahora, 0).toISOString(), "2026-10-02T00:00:00.000Z");
ver("treinta días contando hoy", n.inicioDeDia(ahora, 29).toISOString(), "2026-09-03T00:00:00.000Z");
ver("día UTC, no dominicano", n.inicioDeDia(new Date("2026-10-03T02:00:00.000Z"), 0).toISOString(), "2026-10-03T00:00:00.000Z");

const desde = n.inicioDeDia(ahora, 29);
const conteo = new URL(n.urlConteo(desde, ahora));
ver("conteo: ruta", conteo.origin + conteo.pathname, "https://api.vercel.com/v1/query/web-analytics/visits/count");
ver("conteo: proyecto y equipo", [conteo.searchParams.get("projectId"), conteo.searchParams.get("teamId")], [n.PROYECTO, n.EQUIPO]);
ver("conteo: período", [conteo.searchParams.get("since"), conteo.searchParams.get("until")], ["2026-09-03T00:00:00.000Z", "2026-10-02T15:30:00.000Z"]);
ver("conteo: sin dimensión", conteo.searchParams.has("by"), false);

const porDia = new URL(n.urlAgregado("day", desde, ahora, 31));
ver("agregado: ruta", porDia.pathname, "/v1/query/web-analytics/visits/aggregate");
ver("agregado: una dimensión", porDia.searchParams.getAll("by"), ["day"]);
ver("agregado: límite", porDia.searchParams.get("limit"), "31");

// /count: `data` con las dos cifras; puede traer además las dimensiones.
ver("conteo leído", n.leerConteo({ data: { pageviews: 120, visitors: 41 }, query: {}, version: 1 }), { paginas: 120, visitantes: 41 });
ver(
  "conteo con dimensiones al lado",
  n.leerConteo({ data: { browserName: "", country: "", projectId: n.PROYECTO, pageviews: 3, visitors: 2 } }),
  { paginas: 3, visitantes: 2 },
);
ver("conteo cero", n.leerConteo({ data: { pageviews: 0, visitors: 0 } }), { paginas: 0, visitantes: 0 });
ver("conteo sin visitantes", n.leerConteo({ data: { pageviews: 5 } }), null);
ver("conteo con texto", n.leerConteo({ data: { pageviews: "5", visitors: 1 } }), null);
ver("conteo negativo", n.leerConteo({ data: { pageviews: -1, visitors: 1 } }), null);
ver("conteo sin data", n.leerConteo({ error: { code: "not_found" } }), null);
ver("conteo nulo", n.leerConteo(null), null);

// /aggregate por una dimensión: de mayor a menor, empate por nombre.
ver(
  "rutas ordenadas",
  n.leerAgregado(
    {
      data: [
        { requestPath: "/licitaciones", pageviews: 10, visitors: 4 },
        { requestPath: "/", pageviews: 30, visitors: 20 },
        { requestPath: "/deuda", pageviews: 10, visitors: 9 },
      ],
    },
    "requestPath",
  ),
  [
    { clave: "/", paginas: 30, visitantes: 20 },
    { clave: "/deuda", paginas: 10, visitantes: 9 },
    { clave: "/licitaciones", paginas: 10, visitantes: 4 },
  ],
);
ver(
  "referente ausente o nulo es la clave vacía",
  n.leerAgregado({ data: [{ referrerHostname: null, pageviews: 2, visitors: 2 }, { pageviews: 1, visitors: 1 }] }, "referrerHostname"),
  [
    { clave: "", paginas: 2, visitantes: 2 },
    { clave: "", paginas: 1, visitantes: 1 },
  ],
);
ver("agregado vacío", n.leerAgregado({ data: [] }, "country"), []);
ver("agregado sin lista", n.leerAgregado({ data: { pageviews: 1, visitors: 1 } }, "country"), null);
ver("agregado con fila sin cifras", n.leerAgregado({ data: [{ country: "DO", pageviews: 1, visitors: 1 }, { country: "US" }] }, "country"), null);
ver("agregado con clave no textual", n.leerAgregado({ data: [{ country: 7, pageviews: 1, visitors: 1 }] }, "country"), null);

// by=day: los treinta días en orden, con cero donde Vercel no trae fila.
const tres = n.inicioDeDia(ahora, 2);
ver(
  "días completados",
  n.leerDias(
    {
      data: [
        { timestamp: "2026-10-02T00:00:00Z", pageviews: 7, visitors: 3 },
        { timestamp: "2026-09-30T00:00:00.000Z", pageviews: 4, visitors: 2 },
      ],
    },
    tres,
    3,
  ),
  [
    { clave: "2026-09-30", paginas: 4, visitantes: 2 },
    { clave: "2026-10-01", paginas: 0, visitantes: 0 },
    { clave: "2026-10-02", paginas: 7, visitantes: 3 },
  ],
);
ver("días: un mes entero", n.leerDias({ data: [] }, desde, 30).length, 30);
ver("días: el último es hoy", n.leerDias({ data: [] }, desde, 30).at(-1).clave, "2026-10-02");
ver("días: fila fuera del período no entra", n.leerDias({ data: [{ timestamp: "2026-08-01T00:00:00Z", pageviews: 9, visitors: 9 }] }, tres, 3).map((d) => d.paginas), [0, 0, 0]);
ver("días: momento ilegible", n.leerDias({ data: [{ timestamp: "ayer", pageviews: 1, visitors: 1 }] }, tres, 3), null);
ver("días: sin momento", n.leerDias({ data: [{ pageviews: 1, visitors: 1 }] }, tres, 3), null);
ver("días: sin cifras", n.leerDias({ data: [{ timestamp: "2026-10-02T00:00:00Z" }] }, tres, 3), null);

// «Others» (lo que pasa del límite) va al final aunque sume más; una cifra null es cero.
ver(
  "Others al final aunque sume más",
  n.leerAgregado({ data: [{ requestPath: "Others", pageviews: 90, visitors: 50 }, { requestPath: "/", pageviews: 30, visitors: 20 }] }, "requestPath").map((f) => f.clave),
  ["/", "Others"],
);
ver("cifra null es cero", n.leerConteo({ data: { pageviews: 4, visitors: null } }), { paginas: 4, visitantes: 0 });
ver(
  "fila con cifra null",
  n.leerAgregado({ data: [{ country: "DO", pageviews: 4, visitors: null }] }, "country"),
  [{ clave: "DO", paginas: 4, visitantes: 0 }],
);
ver("cifra ausente sigue siendo forma rota", n.leerConteo({ data: { pageviews: 4 } }), null);

// --- usoDePlataforma: la decisión que importa para la seguridad ---------------
// Transpila el cliente real con un `supabase().functions.invoke` de mentira que
// imita a supabase-js: 2xx → `data`; otro estado → `error.context` con la Response.
for (const f of ["espacios-cliente", "seguimiento", "espacios"]) {
  const src = fs.readFileSync(path.join(raiz, "lib", f + ".ts"), "utf8");
  const out = ts
    .transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
    .outputText.replace(/require\("@\/lib\/([a-z-]+)"\)/g, (_, x) => `require("./${x}.cjs")`)
    .replace('require("zod/mini")', `require(${JSON.stringify(path.join(raiz, "node_modules/zod/mini"))})`);
  fs.writeFileSync(path.join(dir, f + ".cjs"), out);
}
fs.writeFileSync(path.join(dir, "grafo.cjs"), "exports.enlace = { proceso: (c) => `/procesos/${c}` };\n");
fs.writeFileSync(path.join(dir, "supabase-config.cjs"), 'exports.SUPABASE_URL = "x";\nexports.SUPABASE_ANON_KEY = "x";\n');
fs.writeFileSync(
  path.join(dir, "supabase.cjs"),
  `const mod = { respuesta: null };
exports.__mod = mod;
exports.espacios = () => ({});
exports.supabase = () => ({ functions: { invoke: async () => mod.respuesta() } });
`,
);
const sup = require(path.join(dir, "supabase.cjs"));
const cliente = require(path.join(dir, "espacios-cliente.cjs"));

const http = (status, cuerpo) => () =>
  status < 300
    ? { data: cuerpo, error: null }
    : { data: null, error: { name: "FunctionsHttpError", context: new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } }) } };
const fila = (c, p, v) => ({ clave: c, paginas: p, visitantes: v });
const total = { paginas: 5, visitantes: 2 };
const bueno = { ok: true, autorizado: true, desde: "2026-09-03", hasta: "2026-10-02", consultado: "2026-10-02T21:00:00.000Z", semana: total, mes: total, dias: [fila("2026-10-02", 5, 2)], rutas: [fila("/", 5, 2)], referentes: [], paises: [fila("DO", 5, 2)] };

async function uso(nombre, respuesta, esperado) {
  sup.__mod.respuesta = respuesta;
  const r = await cliente.usoDePlataforma();
  ver(nombre, r.estado === "ok" ? { estado: "ok" } : r, esperado);
}

(async () => {
  await uso("autorizado y con forma → ok", http(200, bueno), { estado: "ok" });
  await uso("403 sin permiso → ajeno", http(403, { ok: false, error: "sin_permiso" }), { estado: "ajeno" });
  await uso("401 sin sesión → ajeno", http(401, { ok: false, error: "sesion_requerida" }), { estado: "ajeno" });
  await uso("404 de la puerta de enlace (sin desplegar) → ajeno", http(404, { code: "NOT_FOUND", message: "Requested function was not found" }), { estado: "ajeno" });
  await uso("cuerpo que no es JSON → ajeno", () => ({ data: null, error: { name: "FunctionsHttpError", context: new Response("<html>", { status: 502 }) } }), { estado: "ajeno" });
  await uso("error de red (sin context) → ajeno", () => ({ data: null, error: { name: "FunctionsFetchError", context: new TypeError("fetch failed") } }), { estado: "ajeno" });
  await uso("la llamada lanza → ajeno", () => { throw new Error("sin red"); }, { estado: "ajeno" });
  await uso("autorizado: false con ok → ajeno", http(200, { ...bueno, autorizado: false }), { estado: "ajeno" });
  await uso("sin la marca autorizado → ajeno", http(200, { ok: true }), { estado: "ajeno" });
  await uso("autorizado, sin datos → sin_datos", http(404, { ok: false, autorizado: true, error: "sin_datos" }), { estado: "fallo", error: "sin_datos" });
  await uso("autorizado, sin token → token_no_configurado", http(503, { ok: false, autorizado: true, error: "token_no_configurado" }), { estado: "fallo", error: "token_no_configurado" });
  await uso("autorizado, rechazo de Vercel → vercel_rechazo", http(502, { ok: false, autorizado: true, error: "vercel_rechazo" }), { estado: "fallo", error: "vercel_rechazo" });
  await uso("autorizado, error desconocido → vercel_caida", http(502, { ok: false, autorizado: true, error: "algo_nuevo" }), { estado: "fallo", error: "vercel_caida" });
  await uso("autorizado y ok, forma rota → forma", http(200, { ...bueno, mes: { paginas: "5" } }), { estado: "fallo", error: "forma" });
  await uso("autorizado y ok, falta una lista → forma", http(200, { ...bueno, rutas: undefined }), { estado: "fallo", error: "forma" });
  console.log("FALLOS:", fallos);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exitCode = fallos ? 1 : 0;
})();
