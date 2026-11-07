#!/usr/bin/env node
/**
 * El texto íntegro de lo que el grafo ya conoce por su título
 * (docs/INFRAESTRUCTURA.md §5.12): las sentencias del Tribunal Constitucional
 * y del Tribunal Superior Electoral, las leyes con ficha y los documentos de
 * las bibliotecas institucionales. Baja cada archivo, saca su texto
 * (`scripts/textos-trabajador.mjs`) y escribe lo que `lib/texto-extraccion.ts`
 * lee en él —el dispositivo y el sentido de una sentencia, sus precedentes,
 * lo que cada artículo de una ley le hace a otras normas, las normas,
 * procesos, obras y RNC que nombra un documento—, nunca el texto mismo:
 *
 *     public/data/textos/sentencias.json   (clave de la sentencia)
 *     public/data/textos/leyes.json        (número de la ley)
 *     public/data/textos/documentos.json   (clave del documento)
 *
 * Cada fila dice su estado (`ok`, `sin-texto` si es un escaneo sin capa de
 * texto, `sin-archivo` si la ficha no enlaza ninguno, `no-existe`, `grande`,
 * `formato`, `robots`, `bloqueado`, `error`). Una fila con un estado final no
 * se vuelve a pedir; `bloqueado`, `error` y `robots` sí, en la corrida
 * siguiente. Así una corrida con tope de tiempo avanza y la siguiente sigue.
 *
 * Higiene (`.claude/rules/fuentes.md`): `robots.txt` primero en cada host
 * (un 4xx es «sin robots»; un 5xx o un fallo vetan el host en esta corrida,
 * RFC 9309 §2.3.1), User-Agent identificable, solo GET, una petición a la vez
 * por host y un segundo entre una y otra, un reintento, el tipo validado por
 * los primeros bytes del archivo. Un 401, 403, 429, 451 o 470, o un desafío
 * («cf-mitigated», captcha), detiene el host entero: no se rodea.
 *
 * El texto bajado se guarda en `.cache/textos/` (ignorado por git; el flujo
 * de refresco lo conserva entre corridas): si una regla de
 * `lib/texto-extraccion.ts` cambia (`VERSION_TEXTOS`), las filas se vuelven a
 * leer de ahí sin volver a pedir nada.
 *
 * Uso:
 *     node --no-warnings scripts/build-textos.mjs [--corpus tc,tse,leyes,documentos] [--minutos 300] [--rehacer] [--cache DIR] [--trabajadores N]
 *     node --no-warnings scripts/build-textos.mjs --muestra 8 [--corpus …]   # no escribe: imprime extractos para revisar las reglas
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import { registrarTs } from "./cargador-ts.mjs";

registrarTs();
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(RAIZ);
const lib = (m) => import(pathToFileURL(path.join(RAIZ, "lib", `${m}.ts`)).href);
const T = await lib("texto-extraccion");
const { getSentencias } = await lib("sentencias");
const { leyesConFicha } = await lib("normativa");
const { todosLosDocumentos } = await lib("biblioteca");
const { claveDocumento } = await lib("grafo");
const { sinCedula } = await lib("padron");

/* ---------------------------------------------------------- argumentos */

const arg = (n, o) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : o;
};
const CORPUS = arg("corpus", "tc,tse,leyes,documentos").split(",").map((s) => s.trim()).filter(Boolean);
const MINUTOS = Number(arg("minutos", "300"));
const MUESTRA = Number(arg("muestra", "0"));
const REHACER = process.argv.includes("--rehacer");
const CACHE = path.resolve(arg("cache", path.join(RAIZ, ".cache", "textos")));
const TRABAJADORES = Number(arg("trabajadores", String(Math.max(1, Math.min(4, availableParallelism() - 1)))));
for (const c of CORPUS) if (!["tc", "tse", "leyes", "documentos"].includes(c)) throw new Error(`corpus desconocido: ${c}`);
/** Para depurar una regla o un host: una sola dirección por el mismo camino, como `--como` (la ficha de una sentencia, una ley o un documento). Imprime la fila; no escribe. */
const PROBAR = arg("probar", null);
const COMO = arg("como", "documentos");
/** Con `--muestra`, estas claves en lugar de una muestra repartida (separadas por coma). */
const CLAVES = arg("claves", "").split(",").map((x) => x.trim()).filter(Boolean);

const UA = "Socratico-Inteligencia/1.0 (texto de documentos publicos; herramienta independiente)";
/** Pausa entre el fin de una petición y el inicio de la siguiente al mismo host. */
const PAUSA_MS = 1000;
/**
 * Hosts que piden más calma. El sitio del TC (Umbraco en Azure) responde 504
 * a muchas fichas cuando se le piden seguidas (muestra del 2026-11-07: 10 de
 * 12): más pausa, y un 502, 503 o 504 se reintenta dos veces con espera
 * creciente antes de dejarlo para la corrida siguiente.
 */
const PAUSA_HOST = { "tc.gob.do": 3000 };
const ESPERAS_5XX = [15_000, 45_000];
const PLAZO_MS = 90_000;
const TOPE_BYTES = 40 * 1024 * 1024;
/** Lo que tarda pdf.js con un documento antes de darlo por colgado. */
const PLAZO_EXTRAER_MS = 180_000;
const SALIDA = path.join(RAIZ, "public", "data", "textos");
const ARCHIVO = { sentencias: "sentencias.json", leyes: "leyes.json", documentos: "documentos.json" };
const FINALES = new Set(["ok", "sin-texto", "sin-archivo", "no-existe", "grande", "formato"]);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const huella = (b) => createHash("sha256").update(b).digest("hex").slice(0, 16);

/* ------------------------------------------------------------- hosts */

/** Por host: la cola (una petición a la vez), cuándo puede ir la siguiente, si se bloqueó, sus reglas de robots y cuántas se le hicieron. */
const HOSTS = new Map();
const host = (h) => {
  if (!HOSTS.has(h)) HOSTS.set(h, { cola: Promise.resolve(), siguiente: 0, bloqueado: null, robots: null, pedidos: 0, estados: {} });
  return HOSTS.get(h);
};

async function turno(h) {
  const e = host(h);
  const antes = e.cola;
  let soltar;
  e.cola = new Promise((r) => (soltar = r));
  await antes;
  const espera = e.siguiente - Date.now();
  if (espera > 0) await dormir(espera);
  return () => {
    e.siguiente = Date.now() + (PAUSA_HOST[h] ?? PAUSA_MS);
    soltar();
  };
}

async function leerConTope(cuerpo) {
  const trozos = [];
  let n = 0;
  for await (const t of cuerpo) {
    n += t.length;
    if (n > TOPE_BYTES) return null;
    trozos.push(t);
  }
  return Buffer.concat(trozos);
}

/** Un desafío en lugar del archivo. En una página HTML solo cuentan las marcas de Cloudflare: un formulario de contacto puede traer un captcha. */
const DESAFIO = /cf-chl|challenge-platform|Attention Required|captcha|Request Blocked|Access Denied/i;
const DESAFIO_HTML = /cf-chl|challenge-platform|Attention Required|Just a moment\.\.\./i;

/**
 * Una petición GET con el contrato de la plataforma. `{ estado: "ok", bytes,
 * tipo, url }` o `{ estado, nota }`; no lanza.
 */
async function pedir(url, { html = false, sinRobots = false } = {}) {
  const u = new URL(url);
  const e = host(u.host);
  if (e.bloqueado) return { estado: "bloqueado", nota: e.bloqueado };
  if (!sinRobots && !(await permitido(u))) return { estado: "robots", nota: "robots.txt lo veta" };
  for (let intento = 0; intento <= ESPERAS_5XX.length; intento++) {
    const soltar = await turno(u.host);
    try {
      e.pedidos++;
      const r = await fetch(url, {
        headers: { "User-Agent": UA, Accept: html ? "text/html,application/xhtml+xml" : "application/pdf,application/octet-stream,*/*;q=0.5" },
        redirect: "follow",
        signal: AbortSignal.timeout(PLAZO_MS),
      });
      const st = r.status;
      e.estados[st] = (e.estados[st] ?? 0) + 1;
      if (r.headers.get("cf-mitigated") || [401, 403, 429, 451, 470].includes(st)) {
        await r.body?.cancel();
        e.bloqueado ??= `HTTP ${st}${r.headers.get("cf-mitigated") ? ` (cf-mitigated: ${r.headers.get("cf-mitigated")})` : ""}`;
        return { estado: "bloqueado", nota: e.bloqueado, status: st };
      }
      if (st === 404 || st === 410) {
        await r.body?.cancel();
        return { estado: "no-existe", nota: `HTTP ${st}`, status: st };
      }
      if (st >= 500 && intento < ESPERAS_5XX.length && (intento === 0 || [502, 503, 504].includes(st))) {
        await r.body?.cancel();
        await dormir(ESPERAS_5XX[intento]);
        continue;
      }
      if (!r.ok) {
        await r.body?.cancel();
        return { estado: "error", nota: `HTTP ${st}`, status: st };
      }
      if (Number(r.headers.get("content-length") ?? 0) > TOPE_BYTES) {
        await r.body?.cancel();
        return { estado: "grande", nota: `${r.headers.get("content-length")} bytes` };
      }
      const bytes = r.body ? await leerConTope(r.body) : Buffer.alloc(0);
      if (!bytes) return { estado: "grande", nota: `más de ${TOPE_BYTES} bytes` };
      const tipo = r.headers.get("content-type") ?? "";
      if (/text\/html/i.test(tipo) && (html ? DESAFIO_HTML : DESAFIO).test(bytes.subarray(0, 20_000).toString("latin1"))) {
        e.bloqueado ??= "desafío en lugar de la página";
        return { estado: "bloqueado", nota: e.bloqueado };
      }
      return { estado: "ok", bytes, tipo, url: r.url, status: st };
    } catch (err) {
      if (intento === 0) {
        await dormir(ESPERAS_5XX[0]);
        continue;
      }
      return { estado: "error", nota: String(err?.name === "TimeoutError" ? "plazo vencido" : (err?.cause?.code ?? err?.message ?? err)).slice(0, 120) };
    } finally {
      soltar();
    }
  }
  return { estado: "error", nota: "sin respuesta" };
}

/* ------------------------------------------------------------ robots */

/** Las reglas que se aplican a este agente: el grupo que nos nombra o, si no hay, el de «*». */
function reglasDeRobots(texto) {
  const grupos = [];
  let actual = null;
  let enAgentes = false;
  for (const crudo of texto.split(/\r?\n/)) {
    const linea = crudo.replace(/#.*/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(linea);
    if (!m) continue;
    const campo = m[1].toLowerCase();
    const valor = m[2].trim();
    if (campo === "user-agent") {
      if (!enAgentes) grupos.push((actual = { agentes: [], reglas: [] }));
      actual.agentes.push(valor.toLowerCase());
      enAgentes = true;
    } else if (campo === "allow" || campo === "disallow") {
      enAgentes = false;
      if (actual && valor) actual.reglas.push([campo === "allow", valor]);
    }
  }
  const nuestro = grupos.find((g) => g.agentes.some((a) => a !== "*" && "socratico-inteligencia".includes(a)));
  return (nuestro ?? grupos.find((g) => g.agentes.includes("*")))?.reglas ?? [];
}

const casa = (patron, ruta) => {
  const re = new RegExp(`^${patron.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")}`);
  return re.test(ruta);
};

async function permitido(u) {
  const e = host(u.host);
  if (!e.robots) {
    e.robots = (async () => {
      const r = await pedir(`${u.protocol}//${u.host}/robots.txt`, { html: true, sinRobots: true });
      if (r.estado === "ok") return { estado: "leído", reglas: reglasDeRobots(r.bytes.toString("utf8")) };
      if (r.estado === "no-existe" || (r.status >= 400 && r.status < 500 && r.estado !== "bloqueado")) return { estado: `sin robots (${r.nota})`, reglas: [] };
      return { estado: `vetado en esta corrida (${r.nota})`, reglas: [[false, "/"]] };
    })();
  }
  const { reglas, estado } = await e.robots;
  e.robotsEstado = estado;
  const ruta = u.pathname + u.search;
  let mejor = null;
  for (const [permite, patron] of reglas) {
    if (casa(patron, ruta) && (!mejor || patron.length > mejor[1].length || (patron.length === mejor[1].length && permite))) mejor = [permite, patron];
  }
  return !mejor || mejor[0];
}

/* ------------------------------------------------------- trabajadores */

class Trabajadores {
  constructor(n) {
    this.libres = [];
    this.esperando = [];
    this.siguiente = 0;
    for (let i = 0; i < n; i++) this.libres.push(this.nuevo());
  }
  nuevo() {
    return new Worker(new URL("./textos-trabajador.mjs", import.meta.url));
  }
  async tomar() {
    if (this.libres.length) return this.libres.pop();
    return new Promise((r) => this.esperando.push(r));
  }
  soltar(w) {
    const r = this.esperando.shift();
    if (r) r(w);
    else this.libres.push(w);
  }
  async extraer(tipo, bytes) {
    const w = await this.tomar();
    const id = ++this.siguiente;
    const datos = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return new Promise((resolver) => {
      const plazo = setTimeout(() => {
        w.off("message", oir);
        w.terminate();
        this.soltar(this.nuevo());
        resolver({ error: "pdf.js pasó su plazo" });
      }, PLAZO_EXTRAER_MS);
      const oir = (m) => {
        if (m.id !== id) return;
        clearTimeout(plazo);
        w.off("message", oir);
        this.soltar(w);
        resolver(m);
      };
      w.on("message", oir);
      w.postMessage({ id, tipo, datos }, [datos]);
    });
  }
  cerrar() {
    for (const w of this.libres) w.terminate();
  }
}

/* -------------------------------------------------------------- caché */

const rutaCache = (corpus, clave) => path.join(CACHE, corpus, `${createHash("sha1").update(clave).digest("hex")}.json.br`);
function guardarCache(corpus, clave, paginas) {
  mkdirSync(path.join(CACHE, corpus), { recursive: true });
  writeFileSync(rutaCache(corpus, clave), brotliCompressSync(Buffer.from(JSON.stringify(paginas)), { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }));
}
function leerCache(corpus, clave) {
  const r = rutaCache(corpus, clave);
  return existsSync(r) ? JSON.parse(brotliDecompressSync(readFileSync(r)).toString("utf8")) : null;
}

/* ---------------------------------------------------- lo que se lee */

/** Los caracteres de un PDF que se lee: menos es un escaneo sin capa de texto. Un DOCX o un XLSX, solo si está vacío. */
const MINIMO_TEXTO = 300;

function hechos(corpus, clave, paginas, tipo = "pdf") {
  const { texto, inicios } = T.unirPaginas(paginas);
  const base = { p: paginas.length, c: texto.length };
  if (texto.replace(/\s+/g, "").length < (tipo === "pdf" ? MINIMO_TEXTO : 1)) return { e: "sin-texto", ...base };
  if (corpus === "tc" || corpus === "tse") {
    const fila = { e: "ok", ...base };
    const d = T.dispositivoDe(texto);
    if (d) {
      fila.s = T.sentidoDe(d);
      fila.d = sinCedula(d.texto);
      fila.dp = T.paginaDe(d.inicio, inicios);
      fila.n = T.normasDelDispositivo(d);
    }
    fila.t = T.sentenciasCitadas(texto, corpus === "tc" ? clave : null).slice(0, 300);
    return fila;
  }
  if (corpus === "leyes") return { e: "ok", ...base, n: T.cambiosDeLey(texto).slice(0, 400) };
  const m = T.mencionesDe(texto);
  return { e: "ok", ...base, n: m.normas, x: m.procesos, o: m.snip, r: m.rnc };
}

/* -------------------------------------------------------- los corpus */

/** Lo que se pide de cada cosa: su clave, su host principal, y cómo llegar a su archivo. */
async function elementos(corpus) {
  if (corpus === "tc" || corpus === "tse") {
    const s = await getSentencias();
    if (!s) throw new Error("falta public/data/sentencias.json");
    return s.lista.filter((x) => x.tribunal === corpus).map((x) => ({ corpus, clave: x.clave, ficha: x.ficha, host: new URL(x.ficha).host }));
  }
  if (corpus === "leyes") {
    const l = await leyesConFicha();
    if (!l) throw new Error("falta public/data/leyes.json");
    return [...l.normas].filter(([, d]) => d.url).map(([n, d]) => ({ corpus, clave: n, url: d.url, host: new URL(d.url).host }));
  }
  const docs = await todosLosDocumentos();
  return docs
    .map((d) => ({ corpus, clave: claveDocumento(d.url), url: d.url, ext: d.tipo, host: (() => { try { return new URL(d.url).host; } catch { return "?"; } })() }))
    .filter((x) => x.clave);
}

/** La dirección del archivo en la ficha de una sentencia. */
function archivoDeFicha(corpus, html, ficha) {
  const limpio = html.replace(/&amp;/g, "&");
  if (corpus === "tc") {
    const m =
      /https?:\/\/tribunalsitestorage\.blob\.core\.windows\.net\/media\/[^"'<>\s]+?\.pdf/i.exec(limpio) ??
      /(?:href|src)\s*=\s*["']([^"']+?\.pdf)(?:[?#][^"']*)?["']/i.exec(limpio);
    if (!m) return null;
    return new URL(m[1] ?? m[0], ficha).href;
  }
  const m = /(?:src|href)\s*=\s*["']([^"']*file-upload\/[^"']+?\.(?:pdf|docx))["']/i.exec(limpio) ?? /<iframe[^>]+src\s*=\s*["']([^"']+)["']/i.exec(limpio);
  return m ? new URL(m[1], ficha).href : null;
}

const tipoDeArchivo = (bytes) => {
  const cabeza = bytes.subarray(0, 1024).toString("latin1");
  if (cabeza.includes("%PDF-")) return "pdf";
  if (cabeza.startsWith("PK\u0003\u0004")) return "zip";
  return null;
};

/** Pide, extrae y lee una cosa. Devuelve su fila. */
async function procesar(el, trabajadores, extractos) {
  let url = el.url;
  const usados = hostsDe(ARCHIVO_DE(el.corpus));
  if (el.ficha) {
    usados.add(new URL(el.ficha).host);
    const r = await pedir(el.ficha, { html: true });
    if (r.estado !== "ok") return { e: r.estado, nota: r.nota };
    const html = r.bytes.toString("utf8");
    url = archivoDeFicha(el.corpus, html, el.ficha);
    if (!url) {
      // Una ficha de verdad nombra su sentencia; si no, la página es otra cosa (un error, una portada) y se vuelve a pedir.
      const numero = el.corpus === "tc" ? el.clave.replace(/^TC-(\d{4})-(\d{2})$/, "TC/$1/$2") : null;
      return numero && !html.includes(numero) ? { e: "error", nota: "la ficha no nombra su sentencia" } : { e: "sin-archivo" };
    }
  }
  if (el.corpus === "documentos" && !["pdf", "docx", "xlsx"].includes(el.ext)) return { e: "formato", nota: el.ext };
  usados.add(new URL(url).host);
  const r = await pedir(url);
  if (r.estado !== "ok") return { e: r.estado, nota: r.nota, u: el.ficha ? url : undefined };
  const clase = tipoDeArchivo(r.bytes);
  const tipo = clase === "pdf" ? "pdf" : clase === "zip" ? (/\.xlsx(?:$|\?)/i.test(url) || el.ext === "xlsx" ? "xlsx" : "docx") : null;
  if (!tipo) return { e: "formato", nota: (r.tipo || "sin tipo").slice(0, 60), u: el.ficha ? url : undefined };
  const x = await trabajadores.extraer(tipo, r.bytes);
  if (x.error) return { e: "error", nota: x.error, h: huella(r.bytes), u: el.ficha ? url : undefined };
  const paginas = x.paginas.map((p) => p);
  guardarCache(el.corpus, el.clave, { tipo, paginas });
  const fila = { ...hechos(el.corpus, el.clave, paginas, tipo), h: huella(r.bytes) };
  if (x.recortado) fila.recortado = true;
  if (el.ficha) fila.u = url;
  if (extractos) extractos.push({ el, fila, paginas });
  return fila;
}

/* ------------------------------------------------------- instantánea */

const ARCHIVO_DE = (corpus) => (corpus === "tc" || corpus === "tse" ? "sentencias" : corpus);
/** Los hosts que tocó cada instantánea en esta corrida. */
const HOSTS_DE = new Map();
const hostsDe = (nombre) => {
  if (!HOSTS_DE.has(nombre)) HOSTS_DE.set(nombre, new Set());
  return HOSTS_DE.get(nombre);
};

function leerInstantanea(nombre) {
  const r = path.join(SALIDA, ARCHIVO[nombre]);
  return existsSync(r) ? JSON.parse(readFileSync(r, "utf8")) : null;
}

/** Una fila por renglón y en orden de clave: el mismo contenido da los mismos bytes, y un cambio se lee en el diff. */
function escribirInstantanea(nombre, inst) {
  mkdirSync(SALIDA, { recursive: true });
  const claves = Object.keys(inst.filas).sort();
  const cuerpo = claves.map((k) => `${JSON.stringify(k)}:${JSON.stringify(inst.filas[k])}`).join(",\n");
  const total = Object.values(inst.totales).reduce((a, b) => a + b, 0);
  const cabeza = JSON.stringify({ generado: inst.generado, version: inst.version, total, totales: inst.totales, hosts: inst.hosts, cuenta: inst.cuenta });
  writeFileSync(path.join(SALIDA, ARCHIVO[nombre]), `${cabeza.slice(0, -1)},"filas":{\n${cuerpo}\n}}\n`);
}

/* -------------------------------------------------------------- main */

const t0 = Date.now();
const limite = t0 + MINUTOS * 60_000;
const trabajadores = new Trabajadores(TRABAJADORES);

if (PROBAR) {
  const u = new URL(PROBAR);
  const el = COMO === "tc" || COMO === "tse"
    ? { corpus: COMO, clave: arg("clave", "TC-0000-00"), ficha: u.href, host: u.host }
    : { corpus: COMO, clave: arg("clave", "prueba"), url: u.href, ext: (/\.(\w+)(?:$|\?)/.exec(u.pathname)?.[1] ?? "pdf").toLowerCase(), host: u.host };
  const fila = await procesar(el, trabajadores, null);
  console.log(JSON.stringify(fila, null, 1));
  for (const [h, e] of HOSTS) console.log(`${h}: ${e.pedidos} pedidos ${JSON.stringify(e.estados)} robots ${e.robotsEstado ?? "—"}${e.bloqueado ? ` BLOQUEADO ${e.bloqueado}` : ""}`);
  trabajadores.cerrar();
  process.exit(0);
}
const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santo_Domingo" });

const porArchivo = new Map();
for (const c of CORPUS) {
  const nombre = ARCHIVO_DE(c);
  if (!porArchivo.has(nombre)) {
    const previa = REHACER ? null : leerInstantanea(nombre);
    porArchivo.set(nombre, {
      generado: previa?.generado ?? hoy,
      version: T.VERSION_TEXTOS,
      // Por corpus, cuántas cosas tiene en su fuente (las sentencias de cada tribunal, las leyes con ficha, los documentos), se lean o no.
      totales: { ...(previa?.totales ?? {}) },
      hosts: previa?.hosts ?? {},
      cuenta: {},
      filas: previa?.filas ?? {},
      previa,
      cambiada: false,
    });
  }
}

let pendientes = [];
let releidas = 0;
const extractos = MUESTRA ? [] : null;
for (const c of CORPUS) {
  const lista = await elementos(c);
  const inst = porArchivo.get(ARCHIVO_DE(c));
  if (MUESTRA) {
    const pedidas = lista.filter((x) => CLAVES.includes(x.clave));
    // Repartidas a lo largo de la lista (que va por clave: años y sitios distintos), además de las pedidas.
    const paso = Math.max(1, Math.floor(lista.length / MUESTRA));
    pendientes.push(...pedidas, ...lista.filter((x, i) => i % paso === 0 && !CLAVES.includes(x.clave)).slice(0, MUESTRA));
    continue;
  }
  const vigentes = new Set(lista.map((x) => x.clave));
  // Cuántas cosas tiene este corpus en su fuente, se lean o no: el denominador de la cobertura.
  if (inst.totales[c] !== lista.length) inst.cambiada = true;
  inst.totales[c] = lista.length;
  // Lo que ya no está en la lista de origen sale de la instantánea.
  for (const k of Object.keys(inst.filas)) {
    if (k.startsWith(c === "tse" ? "TSE-" : c === "tc" ? "TC-" : "") && !vigentes.has(k)) {
      delete inst.filas[k];
      inst.cambiada = true;
    }
  }
  for (const el of lista) {
    const previa = inst.filas[el.clave];
    const deOtraVersion = inst.previa && inst.previa.version !== T.VERSION_TEXTOS;
    if (previa && FINALES.has(previa.e) && !deOtraVersion) continue;
    if (previa && FINALES.has(previa.e) && deOtraVersion) {
      const guardado = leerCache(c, el.clave);
      if (guardado) {
        inst.filas[el.clave] = { ...previa, ...hechos(c, el.clave, guardado.paginas, guardado.tipo) };
        inst.cambiada = true;
        releidas++;
        continue;
      }
    }
    pendientes.push(el);
  }
}

// Intercaladas por host: cada host trabaja a su paso y ninguno espera a otro.
const porHost = new Map();
for (const el of pendientes) porHost.set(el.host, [...(porHost.get(el.host) ?? []), el]);
const colas = [...porHost.values()];
const orden = [];
for (let i = 0; orden.length < pendientes.length; i++) for (const q of colas) if (i < q.length) orden.push(q[i]);
pendientes = orden;

console.log(
  `textos: ${pendientes.length} por pedir en ${porHost.size} hosts (${CORPUS.join(", ")})${releidas ? `, ${releidas} releídas de la caché` : ""}; tope ${MINUTOS} min, ${TRABAJADORES} trabajadores`,
);

const cuentaCorrida = {};
let hechas = 0;
let ultimoAviso = Date.now();
let ultimoGuardado = Date.now();
const guardar = () => {
  if (MUESTRA) return;
  for (const [nombre, inst] of porArchivo) {
    // Sin una fila nueva, la instantánea queda como estaba: una corrida que no encontró nada no deja un cambio.
    if (!inst.cambiada) continue;
    inst.generado = hoy;
    const usados = hostsDe(nombre);
    inst.hosts = Object.fromEntries(
      [...HOSTS]
        .filter(([h]) => usados.has(h))
        .sort()
        .map(([h, e]) => [h, { pedidos: e.pedidos, estados: e.estados, robots: e.robotsEstado ?? null, bloqueado: e.bloqueado }]),
    );
    inst.cuenta = {};
    for (const f of Object.values(inst.filas)) inst.cuenta[f.e] = (inst.cuenta[f.e] ?? 0) + 1;
    const { previa: _p, cambiada: _c, ...sin } = inst;
    escribirInstantanea(nombre, sin);
  }
  ultimoGuardado = Date.now();
};

let i = 0;
const CONCURRENCIA = Math.min(64, Math.max(4, porHost.size * 3));
async function hilo() {
  while (i < pendientes.length) {
    if (Date.now() > limite) return;
    const el = pendientes[i++];
    if (host(el.host).bloqueado) {
      cuentaCorrida.saltadas = (cuentaCorrida.saltadas ?? 0) + 1;
      continue;
    }
    let fila;
    try {
      fila = await procesar(el, trabajadores, extractos);
    } catch (err) {
      fila = { e: "error", nota: String(err?.message ?? err).slice(0, 120) };
    }
    hechas++;
    cuentaCorrida[fila.e] = (cuentaCorrida[fila.e] ?? 0) + 1;
    if (!MUESTRA) {
      for (const k of Object.keys(fila)) if (fila[k] === undefined) delete fila[k];
      const inst = porArchivo.get(ARCHIVO_DE(el.corpus));
      inst.filas[el.clave] = fila;
      inst.cambiada = true;
    }
    if (Date.now() - ultimoAviso > 120_000) {
      ultimoAviso = Date.now();
      console.log(`  ${Math.round((Date.now() - t0) / 60_000)} min · ${hechas}/${pendientes.length} · ${JSON.stringify(cuentaCorrida)}`);
    }
    if (Date.now() - ultimoGuardado > 300_000) guardar();
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, pendientes.length) }, hilo));
trabajadores.cerrar();
guardar();

console.log(`textos: ${hechas} pedidas en ${Math.round((Date.now() - t0) / 60_000)} min · ${JSON.stringify(cuentaCorrida)}${i < pendientes.length ? ` · ${pendientes.length - i} quedan para la corrida siguiente (tope de tiempo)` : ""}`);
for (const [h, e] of [...HOSTS].sort()) {
  const robots = e.robots ? (await e.robots).estado : "—";
  console.log(`  ${h}: ${e.pedidos} pedidos ${JSON.stringify(e.estados)} · robots ${robots}${e.bloqueado ? ` · BLOQUEADO ${e.bloqueado}` : ""}`);
}

/* ----------------------------------------------------------- muestra */

if (MUESTRA) {
  const recorte = (t, n) => (t.length > n ? `${t.slice(0, n)}…` : t);
  for (const { el, fila, paginas } of extractos) {
    const { texto } = T.unirPaginas(paginas);
    console.log(`\n===== ${el.corpus} ${el.clave} · ${fila.e} · ${fila.p} págs · ${fila.c} caracteres${fila.u ? ` · ${fila.u}` : ""}`);
    if (el.corpus === "tc" || el.corpus === "tse") {
      console.log(`--- inicio\n${sinCedula(recorte(texto, 900))}`);
      const d = T.dispositivoDe(texto);
      if (d) {
        console.log(`--- antes del dispositivo\n${sinCedula(texto.slice(Math.max(0, d.inicio - 400), d.inicio))}`);
        console.log(`--- dispositivo leído\n${d.ordinales.map((o) => `${o.ordinal} [${o.principal ?? "?"}; ${o.verbos.join(",")}] ${sinCedula(recorte(o.texto, 500))}`).join("\n")}`);
      } else {
        console.log(`--- sin dispositivo; el final:\n${sinCedula(texto.slice(-2500))}`);
      }
      console.log(`--- leído: sentido ${fila.s ?? "—"} · normas ${JSON.stringify(fila.n ?? [])} · precedentes ${JSON.stringify((fila.t ?? []).slice(0, 12))}`);
    } else if (el.corpus === "leyes") {
      console.log(`--- inicio\n${sinCedula(recorte(texto, 700))}`);
      const lineas = texto.split("\n").filter((l) => /derog|modific|sustitu|Art[íi]culo\s+\d+\s*\.?\s*-/i.test(l)).slice(0, 30);
      console.log(`--- renglones\n${sinCedula(lineas.join("\n"))}`);
      console.log(`--- leído: ${JSON.stringify(fila.n ?? []).slice(0, 1500)}`);
    } else {
      console.log(`--- leído: normas ${JSON.stringify(fila.n ?? [])} · procesos ${JSON.stringify(fila.x ?? [])} · snip ${JSON.stringify(fila.o ?? [])} · rnc ${(fila.r ?? []).length}`);
    }
  }
  const sinLeer = pendientes.length - extractos.length;
  if (sinLeer) console.log(`\n(${sinLeer} de la muestra sin texto: ver los estados arriba)`);
}
process.exit(0);
