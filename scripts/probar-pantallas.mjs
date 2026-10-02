#!/usr/bin/env node
/**
 * La batería de pantallas (docs/INFRAESTRUCTURA.md §8.7): cada pregunta en llano de
 * `scripts/bateria-pantallas.json` tiene que llevar a su pantalla entre los
 * tres primeros resultados de `buscarPantallas` (`lib/busqueda.ts`). Sin red:
 * lee el modelo y el corpus de `public/data/busqueda/`.
 *
 * Uso (tras tocar `lib/pantallas.ts`, `lib/menu.ts` o el modelo):
 *     node --no-warnings scripts/probar-pantallas.mjs
 *
 * Sale con 1 si alguna falla, y dice cuáles y adónde llevaron.
 */
import { readFileSync, existsSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// El alias `@/` del proyecto, los JSON como módulos y `next/cache` fuera de
// Next (aquí no hay caché que pedir).
const ganchos = `
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
const RAIZ = ${JSON.stringify(RAIZ)};
export async function resolve(spec, ctx, next) {
  if (spec === "next/cache") return { url: "data:text/javascript,export const unstable_cache=(f)=>f;export const revalidateTag=()=>{};", shortCircuit: true };
  if (spec.startsWith("@/")) {
    for (const ext of ["", ".ts", ".tsx"]) {
      const f = RAIZ + "/" + spec.slice(2) + ext;
      if (existsSync(f) && (ext || /\\.[a-z]+$/.test(f))) return { url: pathToFileURL(f).href, shortCircuit: true };
    }
  }
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (url.startsWith("file:") && url.endsWith(".json")) {
    return { format: "module", source: "export default " + readFileSync(fileURLToPath(url), "utf8") + ";", shortCircuit: true };
  }
  return next(url, ctx);
}`;
register(`data:text/javascript,${encodeURIComponent(ganchos)}`);

const { buscarPantallas } = await import(pathToFileURL(path.join(RAIZ, "lib/busqueda.ts")).href);
const { preguntas } = JSON.parse(readFileSync(path.join(RAIZ, "scripts/bateria-pantallas.json"), "utf8"));

let bien = 0;
for (const [pregunta, esperada] of preguntas) {
  const lista = (await buscarPantallas(pregunta, 3)) ?? [];
  const puesto = lista.findIndex((p) => p.href === esperada);
  if (puesto >= 0) bien++;
  else console.log(`✗ «${pregunta}» → esperaba ${esperada}; llevó a ${lista.map((p) => p.href).join(", ") || "ninguna"}`);
}
console.log(`${bien}/${preguntas.length} preguntas llegan a su pantalla entre las tres primeras`);
if (!existsSync(path.join(RAIZ, "public/data/busqueda/corpus.json"))) console.log("(sin corpus: corre scripts/build-busqueda.py)");
process.exit(bien === preguntas.length ? 0 : 1);
