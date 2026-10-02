import type { ReactNode } from "react";
import type { NodoNarrativa } from "@/lib/espacios";
import { EnlaceRegistro } from "./registro";

/**
 * La narración de un caso, pintada para leer (`/p` y quien solo lee en la
 * mesa). El documento viene de la base tal como lo guardó el editor, y aquí no
 * se confía en su forma: solo se pintan los nodos y marcas que el editor
 * produce (`narracion.tsx`), con elementos de React —nunca HTML crudo—, y
 * hasta una profundidad fija. Lo desconocido se lee como su texto.
 *
 * Una mención (`@registro`) guarda solo el id de la entrada: el título y el
 * enlace salen del registro vivo del caso, que ya pasó `hrefValido`. Si el
 * registro se quitó, queda su nombre como texto, sin enlace.
 */

/** Los estilos de la narración: los mismos en el editor y en la lectura. */
export const CLASE_NARRATIVA = [
  "text-[15px] leading-relaxed text-ink",
  // La letra de titular es de h1 y h2 (docs/INFRAESTRUCTURA.md §11): los títulos de la narración van en sans.
  "[&_p]:my-2.5 [&_h3]:mt-5 [&_h3]:mb-1.5 [&_h3]:text-lg [&_h3]:font-bold [&_h4]:mt-4 [&_h4]:mb-1 [&_h4]:text-base [&_h4]:font-semibold",
  "[&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_li>p]:my-1",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-hairline [&_blockquote]:pl-3 [&_blockquote]:text-ink-soft",
  "[&_hr]:my-5 [&_hr]:border-hairline",
].join(" ");

const PROFUNDIDAD = 24;

export interface RegistroMencionable {
  id: string;
  titulo: string;
  href: string;
}

export default function NarrativaLectura({
  doc,
  registros,
  ajeno = false,
}: {
  doc: NodoNarrativa;
  registros: RegistroMencionable[];
  /** En `/p`: la lee un tercero (enlaces `ugc nofollow`). */
  ajeno?: boolean;
}) {
  const porId = new Map(registros.map((r) => [r.id, r]));
  return <div className={CLASE_NARRATIVA}>{hijos(doc, 0, porId, ajeno)}</div>;
}

/** ¿Tiene la narración algo que leer? Un documento vacío no merece sección. */
export function narrativaConTexto(doc: NodoNarrativa | null): boolean {
  if (!doc) return false;
  const pila: NodoNarrativa[] = [doc];
  for (let n = 0; pila.length && n < 5000; n++) {
    const x = pila.pop();
    if (!x || typeof x !== "object") continue;
    if ((x.type === "text" && typeof x.text === "string" && x.text.trim()) || x.type === "mention") return true;
    if (Array.isArray(x.content)) pila.push(...x.content);
  }
  return false;
}

function hijos(n: NodoNarrativa, nivel: number, porId: Map<string, RegistroMencionable>, ajeno: boolean): ReactNode {
  if (!Array.isArray(n.content) || nivel >= PROFUNDIDAD) return null;
  return n.content.map((h, i) => nodo(h, i, nivel + 1, porId, ajeno));
}

function nodo(n: NodoNarrativa, k: number, nivel: number, porId: Map<string, RegistroMencionable>, ajeno: boolean): ReactNode {
  if (!n || typeof n !== "object") return null;
  const c = () => hijos(n, nivel, porId, ajeno);
  switch (n.type) {
    case "paragraph":
      return <p key={k}>{c()}</p>;
    case "heading":
      // h1 es el título del caso y h2 sus secciones: el editor solo da h3 y h4.
      return n.attrs?.level === 4 ? <h4 key={k}>{c()}</h4> : <h3 key={k}>{c()}</h3>;
    case "bulletList":
      return <ul key={k}>{c()}</ul>;
    case "orderedList": {
      const inicio = typeof n.attrs?.start === "number" && Number.isInteger(n.attrs.start) ? n.attrs.start : undefined;
      return <ol key={k} start={inicio}>{c()}</ol>;
    }
    case "listItem":
      return <li key={k}>{c()}</li>;
    case "blockquote":
      return <blockquote key={k}>{c()}</blockquote>;
    case "horizontalRule":
      return <hr key={k} />;
    case "hardBreak":
      return <br key={k} />;
    case "text":
      return typeof n.text === "string" ? <Marcado key={k} texto={n.text} marcas={n.marks} /> : null;
    case "mention": {
      const id = typeof n.attrs?.id === "string" ? n.attrs.id : "";
      const r = porId.get(id);
      if (r) {
        return (
          <EnlaceRegistro
            key={k}
            titulo={r.titulo}
            href={r.href}
            ajeno={ajeno}
            className="font-medium text-brand-700 underline decoration-hairline underline-offset-2 hover:decoration-brand-700"
          />
        );
      }
      const etiqueta = typeof n.attrs?.label === "string" ? n.attrs.label.slice(0, 200) : "";
      return etiqueta ? <span key={k} className="text-ink-soft">{etiqueta}</span> : null;
    }
    default:
      // Un nodo que no se conoce no se pinta como tal: se lee lo que tenga dentro.
      return <span key={k}>{c()}</span>;
  }
}

function Marcado({ texto, marcas }: { texto: string; marcas?: { type: string }[] }) {
  // Cada marca se aplica una vez, aunque el documento la repita mil: así el
  // anidamiento tiene tope (cuatro) y un documento hecho a mano no ahoga el servidor.
  const tiene = new Set((Array.isArray(marcas) ? marcas : []).map((m) => m?.type));
  let r: ReactNode = texto;
  if (tiene.has("bold")) r = <strong>{r}</strong>;
  if (tiene.has("italic")) r = <em>{r}</em>;
  if (tiene.has("strike")) r = <s>{r}</s>;
  if (tiene.has("underline")) r = <u>{r}</u>;
  return <>{r}</>;
}
