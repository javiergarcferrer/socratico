"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { HighlightStyle, StreamLanguage, bracketMatching, syntaxHighlighting } from "@codemirror/language";
import { sparql } from "@codemirror/legacy-modes/mode/sparql";
import { autocompletion, completionKeymap, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import { tags } from "@lezer/highlight";
import type { TerminosSparql } from "@/lib/consultas";

/**
 * El campo de la consulta: CodeMirror 6 con la gramática de SPARQL, los
 * prefijos y los términos de la ontología para autocompletar
 * (`/sparql/terminos`), y ⌘↵ o Ctrl+↵ para correr. Se carga solo en el
 * navegador (`next/dynamic` con `ssr: false`, en `sparql.tsx`). Tab no se
 * atrapa: sale del campo, como en cualquier otro.
 *
 * Los colores salen de los tokens (`--color-*`), así que el tema del banco
 * (`.tema-blueprint`) los toma solo: la tinta de trabajo (`brand`) y la tinta,
 * nunca los de estado. El color de la sintaxis ayuda a leer; no dice nada que
 * el texto no diga.
 */

const PALABRAS = [
  "SELECT", "DISTINCT", "REDUCED", "WHERE", "ASK", "CONSTRUCT", "DESCRIBE", "PREFIX", "BASE", "FROM", "NAMED", "GRAPH",
  "OPTIONAL", "UNION", "MINUS", "FILTER", "BIND", "VALUES", "AS", "GROUP BY", "HAVING", "ORDER BY", "ASC", "DESC",
  "LIMIT", "OFFSET", "EXISTS", "NOT EXISTS", "COUNT", "SUM", "AVG", "MIN", "MAX", "SAMPLE", "GROUP_CONCAT", "STR",
  "LANG", "LANGMATCHES", "DATATYPE", "IRI", "BOUND", "IF", "COALESCE", "CONTAINS", "STRSTARTS", "STRENDS", "LCASE",
  "UCASE", "REGEX", "YEAR", "MONTH", "NOW", "ROUND", "xsd:integer", "xsd:decimal", "xsd:date",
];

const estilo = HighlightStyle.define([
  // Solo la tinta de trabajo y la tinta: el verde, el ocre y el sello dicen estados, no sintaxis.
  { tag: [tags.keyword, tags.operatorKeyword], color: "var(--color-brand-500)", fontWeight: "600" },
  { tag: [tags.variableName, tags.special(tags.variableName)], color: "var(--color-ink)", fontWeight: "600" },
  { tag: [tags.atom, tags.url, tags.link, tags.meta], color: "var(--color-brand-700)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--color-ink-soft)" },
  { tag: [tags.comment, tags.lineComment], color: "var(--color-ink-soft)", fontStyle: "italic" },
  { tag: [tags.number, tags.bool], color: "var(--color-ink)" },
]);

const tema = EditorView.theme({
  "&": {
    backgroundColor: "var(--color-canvas)",
    color: "var(--color-ink)",
    fontSize: "inherit",
    border: "1px solid var(--color-hairline)",
    borderRadius: "8px",
  },
  "&.cm-focused": { outline: "2px solid var(--color-brand-500)", outlineOffset: "1px" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.55", minHeight: "12rem", maxHeight: "28rem" },
  ".cm-content": { caretColor: "var(--color-ink)", padding: "8px 0" },
  ".cm-gutters": { backgroundColor: "var(--color-surface)", color: "var(--color-ink-soft)", borderRight: "1px solid var(--color-hairline)", borderRadius: "8px 0 0 8px" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--color-brand-100)" },
  ".cm-placeholder": { color: "var(--color-ink-soft)" },
  ".cm-matchingBracket": { outline: "1px solid var(--color-ink-soft)", backgroundColor: "transparent" },
  ".cm-tooltip": { backgroundColor: "var(--color-surface)", color: "var(--color-ink)", border: "1px solid var(--color-hairline)", borderRadius: "8px" },
  ".cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-mono)", fontSize: "13px", maxHeight: "16rem" },
  ".cm-tooltip-autocomplete > ul > li": { padding: "4px 8px" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--color-brand-500)", color: "var(--color-canvas)" },
  ".cm-completionDetail": { fontFamily: "var(--font-sans)", fontStyle: "normal", color: "inherit", opacity: "0.8", marginLeft: "8px" },
});

function fuenteDeTerminos(terminos: TerminosSparql | undefined) {
  const opciones: Completion[] = [
    ...PALABRAS.map((p) => ({ label: p, type: "keyword" })),
    ...Object.keys(terminos?.prefijos ?? {}).map((p) => ({ label: `${p}:`, type: "namespace", detail: terminos!.prefijos[p] })),
    ...(terminos?.terminos ?? []).map((t) => ({
      label: t.curie,
      type: t.tipo === "clase" ? "class" : t.tipo === "propiedad" ? "property" : "constant",
      detail: t.etiqueta,
    })),
  ];
  return (ctx: CompletionContext) => {
    const palabra = ctx.matchBefore(/[A-Za-z_][\w-]*:?[\w-]*/);
    if (!palabra || (palabra.from === palabra.to && !ctx.explicit)) return null;
    return { from: palabra.from, options: opciones, validFor: /^[\w-]*:?[\w-]*$/ };
  };
}

export default function EditorSparql({
  valor,
  onCambio,
  onCorrer,
  terminos,
  id,
  describidoPor,
}: {
  valor: string;
  onCambio: (v: string) => void;
  onCorrer: () => void;
  terminos: TerminosSparql | undefined;
  id: string;
  describidoPor: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const vista = useRef<EditorView | null>(null);
  // Los manejadores cambian en cada pintada; el editor se arma una vez y los lee de aquí.
  const actual = useRef({ onCambio, onCorrer });
  actual.current = { onCambio, onCorrer };

  useEffect(() => {
    if (!caja.current) return;
    const v = new EditorView({
      parent: caja.current,
      state: EditorState.create({
        doc: valor,
        extensions: [
          lineNumbers(),
          history(),
          bracketMatching(),
          StreamLanguage.define(sparql),
          syntaxHighlighting(estilo),
          autocompletion({ override: [fuenteDeTerminos(terminos)], icons: false }),
          placeholder("SELECT ?s WHERE { ?s a soc:Institucion } LIMIT 10"),
          keymap.of([
            { key: "Mod-Enter", run: () => (actual.current.onCorrer(), true), preventDefault: true },
            ...completionKeymap,
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ id, "aria-label": "La consulta SPARQL", "aria-describedby": describidoPor, spellcheck: "false", autocapitalize: "off", autocorrect: "off" }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) actual.current.onCambio(u.state.doc.toString());
          }),
          tema,
        ],
      }),
    });
    vista.current = v;
    return () => {
      v.destroy();
      vista.current = null;
    };
    // El editor se arma de nuevo solo si llegan los términos: el texto vive en él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminos, id, describidoPor]);

  // Un ejemplo elegido fuera reemplaza el texto.
  useEffect(() => {
    const v = vista.current;
    if (v && v.state.doc.toString() !== valor) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: valor } });
  }, [valor]);

  // 16 px en el teléfono (si no, iOS acerca el campo al enfocarlo); 14 desde `sm`.
  return <div ref={caja} className="text-base sm:text-sm" />;
}
