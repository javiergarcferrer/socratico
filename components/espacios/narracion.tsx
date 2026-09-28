"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { guardarNarrativa, narrativaDe } from "@/lib/espacios-cliente";
import type { NodoNarrativa } from "@/lib/espacios";
import { hace } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { CLASE_NARRATIVA, type RegistroMencionable } from "./narrativa-lectura";
import { MarcaTipo } from "./registro";
import type { TipoEntrada } from "@/lib/espacios";

/**
 * La narración del caso: lo que el investigador sabe, sospecha y falta
 * probar, escrito con los registros a la mano —«@» y el nombre de uno lo
 * cita, y en `/p` esa cita abre su ficha (docs/PLAN-ESPACIOS.md §7).
 *
 * El editor es Tiptap (MIT, sobre ProseMirror). Se guarda solo, un momento
 * después de dejar de escribir, sobre la versión que se leyó
 * (`espacios.guardar_narrativa`): si alguien más guardó entretanto, no se
 * pisa su texto en silencio; se dice y se elige.
 */

export interface Mencionable extends RegistroMencionable {
  tipo: TipoEntrada;
}

type Estado =
  | { e: "cargando" }
  | { e: "guardado"; cuando: string | null }
  | { e: "pendiente" }
  | { e: "guardando" }
  | { e: "conflicto" }
  | { e: "grande" }
  | { e: "error"; error: string };

const ESPERA = 1200;
// La base acepta 200 000 bytes del documento como lo escribe Postgres
// (`jsonb::text`, con un espacio tras cada «:» y cada «,»). Aquí se mide igual
// y se corta un poco antes.
const TOPE = 195_000;

function bytesComoPostgres(doc: NodoNarrativa): number {
  return new TextEncoder().encode(JSON.stringify(doc).replace(/([:,])/g, "$1 ")).length;
}

/** Sin tildes ni mayúsculas: «Inapa» encuentra «INAPA» y «adjudicación» «adjudicacion». */
function plano(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

interface Menu {
  items: Mencionable[];
  rect: DOMRect | null;
  elegir: (m: Mencionable) => void;
}

export default function Narracion({ proyecto, registros }: { proyecto: string; registros: Mencionable[] }) {
  const [estado, setEstado] = useState<Estado>({ e: "cargando" });
  const [menu, setMenu] = useState<Menu | null>(null);
  const [activo, setActivo] = useState(0);
  const version = useRef(0);
  const temporizador = useRef<number | null>(null);
  const enVuelo = useRef(false);
  const otraVez = useRef(false);
  // Cuántas ediciones van: si llega una mientras se guarda, lo guardado ya no
  // es lo que está en pantalla y no se dice «guardada».
  const cambios = useRef(0);
  // Lo que la sugerencia necesita en cada tecla, sin rehacer el editor.
  const registrosRef = useRef(registros);
  registrosRef.current = registros;
  const menuRef = useRef<Menu | null>(null);
  menuRef.current = menu;
  const activoRef = useRef(0);
  activoRef.current = activo;

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editable: false,
    extensions: [
      StarterKit.configure({
        // h1 es el título del caso y h2 sus secciones: la narración usa h3 y h4.
        heading: { levels: [3, 4] },
        code: false,
        codeBlock: false,
        // Los enlaces de la narración son a registros del caso (menciones), que
        // se resuelven al pintar; un enlace libre sería una puerta a cualquier sitio.
        link: false,
      }),
      Mention.configure({
        HTMLAttributes: { class: "rounded-sm bg-brand-50 px-0.5 font-medium text-brand-700" },
        renderText: ({ node }) => `@${node.attrs.label ?? ""}`,
        renderHTML: ({ node, options }) => ["span", options.HTMLAttributes, `@${node.attrs.label ?? ""}`],
        suggestion: {
          char: "@",
          allowSpaces: true,
          items: ({ query }) => {
            const q = plano(query.trim());
            return registrosRef.current.filter((r) => !q || plano(r.titulo).includes(q)).slice(0, 8);
          },
          command: ({ editor: ed, range, props }) => {
            const m = props as unknown as Mencionable;
            ed.chain()
              .focus()
              .insertContentAt(range, [
                { type: "mention", attrs: { id: m.id, label: m.titulo.slice(0, 200) } },
                { type: "text", text: " " },
              ])
              .run();
          },
          render: () => {
            const abrir = (p: SuggestionProps<Mencionable>) => {
              setActivo(0);
              setMenu({ items: p.items, rect: p.clientRect?.() ?? null, elegir: (m) => p.command(m as never) });
            };
            return {
              onStart: abrir,
              onUpdate: abrir,
              onExit: () => setMenu(null),
              onKeyDown: ({ event }: SuggestionKeyDownProps) => {
                const m = menuRef.current;
                if (!m) return false;
                if (event.key === "Escape") {
                  setMenu(null);
                  return true;
                }
                if (!m.items.length) return false;
                if (event.key === "ArrowDown") {
                  setActivo((activoRef.current + 1) % m.items.length);
                  return true;
                }
                if (event.key === "ArrowUp") {
                  setActivo((activoRef.current + m.items.length - 1) % m.items.length);
                  return true;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  m.elegir(m.items[activoRef.current] ?? m.items[0]);
                  return true;
                }
                return false;
              },
            };
          },
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: cn(CLASE_NARRATIVA, "min-h-64 px-4 py-3 outline-none"),
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Narración del caso",
      },
    },
    onUpdate: () => programar(),
  });

  const guardar = useCallback(async () => {
    if (!editor) return;
    if (enVuelo.current) {
      otraVez.current = true;
      return;
    }
    let doc: NodoNarrativa;
    try {
      doc = editor.getJSON() as NodoNarrativa;
    } catch {
      return; // el editor ya se destruyó
    }
    if (bytesComoPostgres(doc) > TOPE) {
      setEstado({ e: "grande" });
      return;
    }
    const vistos = cambios.current;
    enVuelo.current = true;
    setEstado({ e: "guardando" });
    const r = await guardarNarrativa(proyecto, doc, version.current);
    enVuelo.current = false;
    // El `check` de tamaño de la base (23514) es «demasiado grande», no un fallo que se reintente.
    if (!r.ok) return setEstado(r.error.startsWith("Eso no cabe") ? { e: "grande" } : { e: "error", error: r.error });
    if (r.datos === null) return setEstado({ e: "conflicto" });
    version.current = r.datos;
    setEstado(cambios.current === vistos ? { e: "guardado", cuando: new Date().toISOString() } : { e: "pendiente" });
    if (otraVez.current) {
      otraVez.current = false;
      void guardar();
    }
  }, [editor, proyecto]);

  const guardarRef = useRef(guardar);
  guardarRef.current = guardar;
  function programar() {
    cambios.current++;
    setEstado((s) => (s.e === "conflicto" ? s : { e: "pendiente" }));
    if (temporizador.current) window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => void guardarRef.current(), ESPERA);
  }

  // Leer la versión vigente y ponerla en el editor.
  const traer = useCallback(async () => {
    if (!editor) return;
    const r = await narrativaDe(proyecto);
    if (!r.ok) return setEstado({ e: "error", error: r.error });
    version.current = r.datos.version;
    editor.commands.setContent(r.datos.doc ?? { type: "doc", content: [{ type: "paragraph" }] }, { emitUpdate: false });
    editor.setEditable(true);
    setEstado({ e: "guardado", cuando: null });
  }, [editor, proyecto]);

  useEffect(() => {
    void traer();
  }, [traer]);

  // Salir con cambios sin guardar se pregunta; el navegador pone el texto.
  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => {
      if (["pendiente", "guardando", "conflicto", "error", "grande"].includes(estado.e)) e.preventDefault();
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [estado.e]);

  // Cambiar de pestaña desmonta el editor: lo que esperaba su turno se guarda
  // ya. `guardar` lee el documento antes de su primera espera, y Tiptap
  // destruye el editor un instante después.
  useEffect(
    () => () => {
      if (temporizador.current) {
        window.clearTimeout(temporizador.current);
        temporizador.current = null;
        void guardarRef.current();
      }
    },
    [],
  );

  async function guardarEncima() {
    const r = await narrativaDe(proyecto);
    if (!r.ok) return setEstado({ e: "error", error: r.error });
    version.current = r.datos.version;
    void guardar();
  }

  if (!editor || estado.e === "cargando") return <Skeleton className="h-72 w-full" />;
  return (
    <div className="space-y-3">
      <BarraFormato editor={editor} />
      <div className="rounded-lg border border-hairline bg-surface focus-within:border-brand-600">
        <EditorContent editor={editor} />
      </div>
      <Popover open={!!menu}>
        <PopoverAnchor virtualRef={{ current: { getBoundingClientRect: () => menu?.rect ?? new DOMRect() } }} />
        <PopoverContent
          align="start"
          side="bottom"
          className="w-80 p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {menu && menu.items.length === 0 ? (
            <p className="px-2 py-2 text-sm text-ink-soft">Ningún registro del caso se llama así. Agrégalo primero.</p>
          ) : (
            <ul role="listbox" aria-label="Registros del caso">
              {menu?.items.map((m, i) => (
                <li key={m.id} role="option" aria-selected={i === activo}>
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn("h-auto w-full flex-col items-start gap-1 whitespace-normal px-2 py-2 text-left", i === activo && "bg-brand-50")}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => menu.elegir(m)}
                  >
                    <span className="block w-full text-sm font-medium leading-snug text-ink">{m.titulo}</span>
                    <MarcaTipo tipo={m.tipo} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
      <EstadoGuardado estado={estado} onTraer={traer} onEncima={guardarEncima} onReintentar={() => void guardar()} />
    </div>
  );
}

function BarraFormato({ editor }: { editor: Editor }) {
  const botones: { etiqueta: string; activo: boolean; hacer: () => void }[] = [
    { etiqueta: "Negrita", activo: editor.isActive("bold"), hacer: () => editor.chain().focus().toggleBold().run() },
    { etiqueta: "Cursiva", activo: editor.isActive("italic"), hacer: () => editor.chain().focus().toggleItalic().run() },
    { etiqueta: "Título", activo: editor.isActive("heading", { level: 3 }), hacer: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { etiqueta: "Subtítulo", activo: editor.isActive("heading", { level: 4 }), hacer: () => editor.chain().focus().toggleHeading({ level: 4 }).run() },
    { etiqueta: "Lista", activo: editor.isActive("bulletList"), hacer: () => editor.chain().focus().toggleBulletList().run() },
    { etiqueta: "Numerada", activo: editor.isActive("orderedList"), hacer: () => editor.chain().focus().toggleOrderedList().run() },
    { etiqueta: "Cita", activo: editor.isActive("blockquote"), hacer: () => editor.chain().focus().toggleBlockquote().run() },
  ];
  return (
    <div role="toolbar" aria-label="Formato de la narración" className="flex flex-wrap gap-2">
      {botones.map((b) => (
        <Button key={b.etiqueta} type="button" variant="outline" size="sm" aria-pressed={b.activo} onClick={b.hacer}>
          {b.etiqueta}
        </Button>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => editor.chain().focus().insertContent("@").run()}>
        Citar un registro
      </Button>
    </div>
  );
}

function EstadoGuardado({
  estado,
  onTraer,
  onEncima,
  onReintentar,
}: {
  estado: Estado;
  onTraer: () => void;
  onEncima: () => void;
  onReintentar: () => void;
}) {
  if (estado.e === "conflicto") {
    return (
      <Alert variant="aviso" className="px-4 py-3 text-sm">
        <p>
          Alguien que colabora guardó la narración mientras escribías. No se pisó nada: elige
          con cuál versión seguir.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onTraer}>
            Traer la suya (pierdes lo tuyo sin guardar)
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onEncima}>
            Guardar la mía encima
          </Button>
        </div>
      </Alert>
    );
  }
  const texto =
    estado.e === "guardado"
      ? estado.cuando
        ? `Guardada ${hace(estado.cuando)}.`
        : "Se guarda sola mientras escribes. Escribe «@» para citar un registro del caso."
      : estado.e === "pendiente"
        ? "Cambios sin guardar…"
        : estado.e === "guardando"
          ? "Guardando…"
          : estado.e === "grande"
            ? "La narración pasa del tope (unas 30 000 palabras): no se guardó. Recórtala o divídela en otro caso."
            : estado.e === "error"
              ? `No se guardó: ${estado.error}`
              : "";
  return (
    <p role="status" aria-live="polite" className={cn("text-xs", estado.e === "error" || estado.e === "grande" ? "text-alerta-700" : "text-ink-soft")}>
      {texto}
      {estado.e === "error" && (
        <Button type="button" variant="link" size="sm" className="ml-1" onClick={onReintentar}>
          Reintentar
        </Button>
      )}
    </p>
  );
}
