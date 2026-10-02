/**
 * Cargar módulos de `lib/` desde un script de Node, sin Next ni compilar:
 * quita los tipos de cada `.ts` (`module.stripTypeScriptTypes`), resuelve el
 * alias `@/` a la raíz del repositorio, importa un JSON como su valor y
 * cambia `next/cache` por un `unstable_cache` que no guarda nada (fuera de
 * Next no hay caché de datos). Lo usa `scripts/build-grafo.mjs` para correr
 * los constructores del grafo tal cual los escribe la plataforma.
 *
 * `cargados` guarda la ruta de cada `.ts` que se importó.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = `data:text/javascript,${encodeURIComponent(
  "export const unstable_cache = (fn) => fn; export const revalidateTag = () => {}; export const revalidatePath = () => {};",
)}`;

export const cargados = new Set();

const archivo = (base) => [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((c) => existsSync(c) && statSync(c).isFile());

export function registrarTs() {
  // `stripTypeScriptTypes` avisa en cada proceso que es experimental: aquí se sabe.
  const avisar = process.emitWarning;
  process.emitWarning = (w, ...resto) => (String(w).includes("stripTypeScriptTypes") ? undefined : avisar.call(process, w, ...resto));
  registerHooks({
    resolve(especificador, contexto, siguiente) {
      if (especificador === "next/cache") return { url: CACHE, shortCircuit: true };
      let base = null;
      if (especificador.startsWith("@/")) base = path.join(RAIZ, especificador.slice(2));
      else if (/^\.\.?\//.test(especificador) && contexto.parentURL?.endsWith(".ts")) {
        base = path.resolve(path.dirname(fileURLToPath(contexto.parentURL)), especificador);
      }
      const hallado = base && archivo(base);
      if (hallado) return { url: pathToFileURL(hallado).href, shortCircuit: true };
      return siguiente(especificador, contexto);
    },
    load(url, contexto, siguiente) {
      if (url.startsWith("file:") && url.endsWith(".ts")) {
        const ruta = fileURLToPath(url);
        cargados.add(path.relative(RAIZ, ruta));
        return { format: "module", source: stripTypeScriptTypes(readFileSync(ruta, "utf8")), shortCircuit: true };
      }
      if (url.startsWith("file:") && url.endsWith(".json") && !contexto.importAttributes?.type) {
        return { format: "module", source: `export default ${readFileSync(fileURLToPath(url), "utf8")};`, shortCircuit: true };
      }
      return siguiente(url, contexto);
    },
  });
}
