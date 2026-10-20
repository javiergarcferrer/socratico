import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Las votaciones del pleno de la Cámara de Diputados de la instantánea
 * `public/data/votaciones.json` (`scripts/build-votaciones.py`,
 * docs/INFRAESTRUCTURA.md §5.5): las de las sesiones de 2020-2024 y 2024-2028
 * en el SIL, con lo que se sometió, su resultado y las iniciativas sobre las
 * que se votó. El voto de cada diputado no está: lo lee en vivo la ficha
 * `/congreso/votaciones/[id]` (`getVotacion` de `lib/congreso.ts`).
 *
 * La lee el compilador del grafo (`lib/grafo-constructores.ts`) y nada más:
 * la instantánea no viaja en ninguna función.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

export interface VotacionPleno {
  /** El número del SIL: la clave del nodo. */
  id: number;
  /** «Sesión 014, Votación 001». */
  titulo: string;
  /** Qué se sometió, en las palabras del acta. */
  mocion: string;
  fecha: string | null;
  si: number;
  no: number;
  abstencion: number;
  presentes: number | null;
  miembros: number | null;
  /** «00014-2026-SLO». */
  sesion: string;
  /** «2026-SLO». */
  legislatura: string;
  /** «2024-2028». */
  periodo: string;
  /** Los números del SIL de las iniciativas sobre las que se votó. */
  iniciativas: number[];
}

export interface Votaciones {
  generado: string;
  fuente: string;
  /** En orden de número. */
  lista: VotacionPleno[];
}

let memo: Promise<Votaciones | null> | null = null;

export function getVotaciones(): Promise<Votaciones | null> {
  memo ??= readFile(join(process.cwd(), "public", "data", "votaciones.json"), "utf8")
    .then((t) => {
      const j = JSON.parse(t) as { generado: string; fuente: string; votaciones: VotacionPleno[] };
      const lista = [...j.votaciones].sort((a, b) => a.id - b.id);
      const doble = lista.find((v, i) => i > 0 && v.id === lista[i - 1].id);
      if (doble) throw new Error(`dos votaciones con el mismo número en votaciones.json: ${doble.id}`);
      return { generado: j.generado, fuente: j.fuente, lista };
    })
    .catch((e: NodeJS.ErrnoException) => {
      memo = null;
      if (e.code === "ENOENT") return null;
      throw e;
    });
  return memo;
}

let porIdMemo: Promise<Map<number, VotacionPleno>> | null = null;

export async function votacionPorId(id: number): Promise<VotacionPleno | null> {
  porIdMemo ??= getVotaciones().then((v) => new Map((v?.lista ?? []).map((x) => [x.id, x])));
  return (await porIdMemo).get(id) ?? null;
}
