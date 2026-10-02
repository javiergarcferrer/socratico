import Link from "next/link";
import { Fragment } from "react";
import { reconocerPorForma } from "@/lib/grafo";
import { reconocerTodo } from "@/lib/grafo-servidor";

/**
 * Un texto oficial con sus menciones convertidas en enlaces: la norma que
 * cita, la institución que nombra, el proceso o la obra por su código
 * (docs/INFRAESTRUCTURA.md §7: todo lo que se ve se puede investigar).
 *
 * El enlace va subrayado en fino y en la tinta del texto, no en azul: dentro
 * de un párrafo el azul entero convertiría el título en una fila de botones.
 * Al pasar o tocar, el subrayado se vuelve de firma. `excluir` evita que la
 * ficha se enlace a sí misma.
 *
 * Solo servidor: el reconocimiento de instituciones carga el cruce. En una
 * lista larga (mil sentencias del TC) se pasa `soloForma`: normas, procesos y
 * obras por su forma, que cuesta microsegundos; los nombres de institución se
 * reconocen en las fichas, donde el texto es uno.
 */
export function TextoEnlazado({
  texto,
  excluir,
  soloForma = false,
}: {
  texto: string;
  excluir?: string;
  soloForma?: boolean;
}) {
  const menciones = (soloForma ? reconocerPorForma(texto) : reconocerTodo(texto)).filter((m) => m.href !== excluir);
  if (menciones.length === 0) return <>{texto}</>;
  const trozos: React.ReactNode[] = [];
  let desde = 0;
  for (const m of menciones) {
    if (m.inicio > desde) trozos.push(<Fragment key={`t${desde}`}>{texto.slice(desde, m.inicio)}</Fragment>);
    trozos.push(
      <Link
        key={`e${m.inicio}`}
        href={m.href}
        className="relative z-10 underline decoration-ink-soft/40 decoration-1 underline-offset-[3px] hover:text-brand-700 hover:decoration-brand-700"
      >
        {texto.slice(m.inicio, m.fin)}
      </Link>,
    );
    desde = m.fin;
  }
  if (desde < texto.length) trozos.push(<Fragment key={`t${desde}`}>{texto.slice(desde)}</Fragment>);
  return <>{trozos}</>;
}
