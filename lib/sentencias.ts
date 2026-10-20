import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { claveSentencia } from "@/lib/grafo";

/**
 * Las sentencias del Tribunal Constitucional y del Tribunal Superior Electoral
 * de la instantánea `public/data/sentencias.json` (`scripts/build-sentencias.py`,
 * docs/INFRAESTRUCTURA.md §5.6): las que los dos tribunales publican en sus
 * listados, con su número, su fecha, sus expedientes y de qué tratan.
 *
 * La leen el compilador del grafo (`lib/grafo-constructores.ts`) y nada más:
 * la instantánea no viaja en ninguna función (`outputFileTracingExcludes` de
 * `next.config.ts`), y la ficha de una sentencia lee su nodo del compilado.
 * `/constitucional` y `/tse` leen los listados en vivo (`lib/tc.ts`,
 * `lib/tse.ts`).
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

export type Tribunal = "tc" | "tse";

export interface Sentencia {
  /** `claveSentencia`: «TC-0986-26», «TSE-<ficha>». */
  clave: string;
  tribunal: Tribunal;
  /** Como lo escribe el listado: «TC/0986/26», «TSE/0028/2026». */
  numero: string;
  fecha: string | null;
  /**
   * El «Relativo a» del listado, recortado: la acción, las partes y lo
   * atacado, tal como lo escribe el tribunal (muchos empiezan «Relativo al…»),
   * sin las etiquetas HTML que trae en 206 filas («<span>Relativo al…», o abierta al final por el recorte).
   */
  relativo: string;
  /**
   * Los números de expediente que trae su referencia («TC-05-2023-0048»). Si
   * ninguno tiene esa forma —el listado escribe algunos a su manera:
   * «TSE-01-280-2023», «TC-04 2025-0969», «2011-5745»—, la referencia tal cual,
   * sin «Expediente núm.»; ninguno si no trae referencia.
   */
  expedientes: string[];
  /** Su ficha en el sitio del tribunal: el camino a su texto, que ningún listado trae. */
  ficha: string;
}

interface Instantanea {
  generado: string;
  fuentes: Record<Tribunal, string>;
  ficha_tc: string;
  tc: { n: string; f?: string; r: string; x?: string; u?: string }[];
  tse: { n: string; f?: string; r: string; x?: string; u: string }[];
}

export interface Sentencias {
  generado: string;
  fuentes: Record<Tribunal, string>;
  /** En orden de clave. */
  lista: Sentencia[];
}

/** Los expedientes de un tribunal dominicano: «TC-05-2023-0048», «TSE-05-0009-2026». */
const EXPEDIENTE = /\b(?:TC|TSE)-\d{2}-\d{4}-\d{4}\b/g;

/** «<span>Relativo al recurso…</span>» → «Relativo al recurso…»; también la que el recorte dejó abierta al final («…de las <span»). */
const sinEtiquetas = (texto: string) => texto.replace(/<[^>]*(?:>|$)/g, " ").replace(/\s+/g, " ").trim();

function expedientesDe(referencia: string | undefined): string[] {
  const x = referencia?.trim() ?? "";
  const canonicos = [...new Set(x.match(EXPEDIENTE) ?? [])];
  if (canonicos.length) return canonicos;
  const tal = x.replace(/^Expedientes?\b\s*(?:n[uú]m(?:ero)?s?\.?|No\.?)?\s*/i, "").trim();
  return tal ? [tal] : [];
}

const DIR = join(process.cwd(), "public", "data");
let memo: Promise<Sentencias | null> | null = null;

export function getSentencias(): Promise<Sentencias | null> {
  memo ??= readFile(join(DIR, "sentencias.json"), "utf8")
    .then((t) => {
      const j = JSON.parse(t) as Instantanea;
      const lista: Sentencia[] = [];
      const leer = (tribunal: Tribunal, s: Instantanea["tc"][number], ficha: string) => {
        const clave = claveSentencia({ n: s.n, u: tribunal === "tse" ? s.u : null });
        if (!clave) throw new Error(`una sentencia sin clave en sentencias.json: ${s.n}`);
        lista.push({
          clave,
          tribunal,
          numero: s.n.trim(),
          fecha: s.f ?? null,
          relativo: sinEtiquetas(s.r),
          expedientes: expedientesDe(s.x),
          ficha,
        });
      };
      // La ficha del TC se deriva del número («TC/0002/12» → «…/tc000212») salvo que la instantánea diga otra.
      for (const s of j.tc) leer("tc", s, s.u ?? j.ficha_tc.replace("{}", `${s.n.slice(3, 7)}${s.n.slice(8, 10)}`));
      for (const s of j.tse) leer("tse", s, s.u);
      lista.sort((a, b) => (a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0));
      const doble = lista.find((s, i) => i > 0 && s.clave === lista[i - 1].clave);
      if (doble) throw new Error(`dos sentencias con la misma clave en sentencias.json: ${doble.clave}`);
      return { generado: j.generado, fuentes: j.fuentes, lista };
    })
    .catch((e: NodeJS.ErrnoException) => {
      memo = null;
      if (e.code === "ENOENT") return null;
      throw e;
    });
  return memo;
}

let porClaveMemo: Promise<Map<string, Sentencia>> | null = null;

export async function sentenciaPorClave(clave: string): Promise<Sentencia | null> {
  porClaveMemo ??= getSentencias().then((s) => new Map((s?.lista ?? []).map((x) => [x.clave, x])));
  return (await porClaveMemo).get(clave) ?? null;
}
