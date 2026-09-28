// Prueba de la sincronización de lo seguido entre el navegador y la cuenta
// (`sincronizarSeguidos`, `reflejarSeguidos`, `salir` en
// lib/espacios-cliente.ts), sin red ni Supabase. Transpila los módulos reales
// a un directorio temporal, cambia el cliente de Supabase por una tabla en
// memoria con ganchos entre llamadas —para tocar la lista *mientras* la
// sincronización espera a la red— y recorre los casos. Debe imprimir
// `FALLOS: 0`. Uso: node supabase/pruebas/sincronizar_seguidos.cjs
// (docs/PLAN-ESPACIOS.md §3).
const fs = require("fs");
const os = require("os");
const path = require("path");

const raiz = path.resolve(__dirname, "../..");
const ts = require(path.join(raiz, "node_modules/typescript"));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-"));

/** El cliente de Supabase de mentira: una tabla `seguimientos` en memoria. */
function falso() {
  const db = { rows: new Map(), falla: false, antes: null, signOutError: null };
  const k = (r) => `${r.tipo}:${r.ref}`;
  const tick = async () => {
    await new Promise((r) => setTimeout(r, 1));
    if (db.antes) {
      const f = db.antes;
      db.antes = null;
      await f();
    }
  };
  function builder() {
    const q = { op: null, filtros: {} };
    const api = {
      select() { q.op = q.op ?? "select"; return api; },
      upsert(filas) { q.op = "upsert"; q.filas = filas; return api; },
      delete() { q.op = "delete"; return api; },
      eq(c, v) { q.filtros[c] = v; return api; },
      then(res, rej) {
        return (async () => {
          await tick();
          if (db.falla && q.op !== "select") return { data: null, error: { code: "08000", message: "red" } };
          if (q.op === "select") return { data: [...db.rows.values()].map((r) => ({ ...r })), error: null };
          if (q.op === "upsert") { for (const f of q.filas) db.rows.set(k(f), { ...f }); return { data: null, error: null }; }
          db.rows.delete(`${q.filtros.tipo}:${q.filtros.ref}`);
          return { data: null, error: null };
        })().then(res, rej);
      },
    };
    return api;
  }
  return {
    db,
    espacios: () => ({ from: () => builder(), rpc: () => builder() }),
    supabase: () => ({
      auth: {
        getSession: async () => ({ data: { session: { user: { id: "u1", email: "a@b.c" } } } }),
        signOut: async () => ({ error: db.signOutError }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    }),
  };
}

for (const f of ["espacios-cliente", "seguimiento", "espacios"]) {
  const src = fs.readFileSync(path.join(raiz, "lib", f + ".ts"), "utf8");
  const out = ts
    .transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
    .outputText.replace(/require\("@\/lib\/([a-z-]+)"\)/g, (_, n) => `require("./${n}.cjs")`)
    .replace('require("zod/mini")', `require(${JSON.stringify(path.join(raiz, "node_modules/zod/mini"))})`);
  fs.writeFileSync(path.join(dir, f + ".cjs"), out);
}
fs.writeFileSync(path.join(dir, "grafo.cjs"), "exports.enlace = { proceso: (c) => `/procesos/${c}` };\n");
fs.writeFileSync(path.join(dir, "supabase-config.cjs"), 'exports.SUPABASE_URL = "x";\nexports.SUPABASE_ANON_KEY = "x";\n');
fs.writeFileSync(path.join(dir, "supabase.cjs"), `module.exports = (${falso.toString()})();\n`);

const store = new Map();
const listeners = new Map();
global.window = {
  localStorage: { getItem: (x) => store.get(x) ?? null, setItem: (x, v) => store.set(x, String(v)), removeItem: (x) => store.delete(x) },
  addEventListener: (t, f) => { (listeners.get(t) ?? listeners.set(t, new Set()).get(t)).add(f); },
  removeEventListener: (t, f) => listeners.get(t)?.delete(f),
  dispatchEvent: (e) => { for (const f of listeners.get(e.type) ?? []) f(e); },
};
global.Event = class { constructor(t) { this.type = t; } };
const { db } = require(path.join(dir, "supabase.cjs"));
const seg = require(path.join(dir, "seguimiento.cjs"));
const c = require(path.join(dir, "espacios-cliente.cjs"));
const u = { id: "u1", email: "a@b.c" };
const P = (id) => ({ tipo: "proceso", id, titulo: id, href: `/procesos/${id}` });
const F = (id) => ({ usuario: "u1", tipo: "proceso", ref: id, titulo: id, href: `/procesos/${id}`, huella: null, desde: "2026-01-01T00:00:00.000Z", visto: null });
const local = () => seg.getSeguidos().map((s) => s.id).sort().join(",");
const remoto = () => [...db.rows.values()].map((r) => r.ref).sort().join(",");
const espera = () => new Promise((r) => setTimeout(r, 30));
let fallos = 0;
function ver(n, a, b) { const ok = a === b; if (!ok) fallos++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : `→ ${a} ≠ ${b}`); }
function reset(loc, rem, comun) {
  store.clear(); db.rows.clear(); db.falla = false; db.antes = null; db.signOutError = null;
  seg.reemplazarSeguidos(loc.map(P));
  for (const r of rem) db.rows.set(`proceso:${r}`, F(r));
  if (comun) store.set(`lrd:seguimiento-cuenta:u1`, JSON.stringify(comun.map((x) => `proceso:${x}`)));
}
(async () => {
  reset(["a", "b"], ["b", "c"], null);
  await c.sincronizarSeguidos(u);
  ver("primera vez une", local() + "|" + remoto(), "a,b,c|a,b,c");

  reset(["a", "b", "d"], ["a", "b", "c"], ["a", "b"]);
  await c.sincronizarSeguidos(u);
  ver("nuevo aquí sube, nuevo allá baja", local() + "|" + remoto(), "a,b,c,d|a,b,c,d");

  reset(["a"], ["a", "b"], ["a", "b"]);
  await c.sincronizarSeguidos(u);
  ver("quitado aquí se borra allá", local() + "|" + remoto(), "a|a");

  reset(["a", "b"], ["a"], ["a", "b"]);
  await c.sincronizarSeguidos(u);
  ver("quitado allá se quita aquí", local() + "|" + remoto(), "a|a");

  // B1: seguir durante la sincronización
  const enLlamada = (n, f) => { let i = 0; const h = async () => { i++; if (i === n) f(); else db.antes = h; }; db.antes = h; };
  reset(["a", "n"], ["a", "c"], ["a"]);
  enLlamada(2, () => seg.toggleSeguido(P("z")));
  await c.sincronizarSeguidos(u);
  ver("seguir durante la sync no se pierde", local() + "|" + remoto(), "a,c,n,z|a,c,n,z");

  // B1: dejar de seguir durante la sync
  reset(["a", "b", "n"], ["a", "b"], ["a", "b"]);
  enLlamada(2, () => seg.toggleSeguido(P("b")));
  await c.sincronizarSeguidos(u);
  ver("dejar de seguir durante la sync no resucita", local() + "|" + remoto(), "a,n|a,n");

  // Primera vez: se sube x y el lector lo quita durante la subida.
  reset(["a", "x"], ["a", "r"], null);
  enLlamada(2, () => seg.toggleSeguido(P("x")));
  await c.sincronizarSeguidos(u);
  ver("primera vez: subido y quitado a mitad no resucita; lo de la cuenta llega", local() + "|" + remoto(), "a,r|a,r");

  // escritura fallida no avanza la lista común
  reset(["a", "n"], ["a"], ["a"]);
  db.falla = true;
  const r = await c.sincronizarSeguidos(u);
  ver("fallo devuelve error", r.ok, false);
  db.falla = false;
  await c.sincronizarSeguidos(u);
  ver("tras el fallo, se sube", local() + "|" + remoto(), "a,n|a,n");

  // reflejar: cambios encolados
  reset(["a"], ["a"], ["a"]);
  const dejar = c.reflejarSeguidos(u);
  seg.toggleSeguido(P("p")); seg.toggleSeguido(P("q")); seg.toggleSeguido(P("a"));
  await espera(); await espera();
  ver("reflejo encola cambios concurrentes", local() + "|" + remoto(), "p,q|p,q");

  // salir con error no borra nada
  db.signOutError = { message: "500" };
  const s1 = await c.salir();
  await espera();
  ver("salir con error no vacía", s1.ok + "|" + local() + "|" + remoto(), "false|p,q|p,q");
  db.signOutError = null;
  const s2 = await c.salir();
  await espera();
  ver("salir vacía el navegador, no la cuenta", s2.ok + "|" + local() + "|" + remoto(), "true||p,q");
  dejar();
  console.log("FALLOS:", fallos);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exitCode = fallos ? 1 : 0;
})();
