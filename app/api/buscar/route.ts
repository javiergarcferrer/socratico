import { NextResponse } from "next/server";
import { buscarEnTodo, buscarPantallas, EN_MAYUSCULAS, esTipoResultado, TIPOS_RESULTADO } from "@/lib/busqueda";
import { formatFecha, formatPesos, SIN_DATO } from "@/lib/format";
import { desdeMayusculas } from "@/lib/congreso";
import { recortar } from "@/lib/raiz";

/** La fecha de la instantánea, o null si falta o no se lee (como en /buscar). */
function fechaDeCorte(iso: string | undefined): string | null {
  if (!iso) return null;
  const f = formatFecha(iso);
  return f === SIN_DATO ? null : f;
}

export const dynamic = "force-dynamic";

const ETIQUETA = Object.fromEntries(TIPOS_RESULTADO.map((t) => [t.clave, t.etiqueta]));

/**
 * El índice de `lib/busqueda.ts` para la paleta ⌘K: las primeras filas de
 * lo tecleado, de cualquier tipo, ya ordenadas. El corpus (~44 MB) y el
 * modelo no viajan al navegador; aquí se busca y salen `n` filas.
 *
 * `?q=` (2 a 120 caracteres), `?n=` (1 a 20, por defecto 6) y `?tipo=`
 * (allowlist de `TIPOS_RESULTADO`).
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = recortar(params.get("q"), 120);
  if (q.length < 2) return NextResponse.json({ resultados: [], total: 0 });
  const n = Math.min(20, Math.max(1, Number.parseInt(params.get("n") ?? "6", 10) || 6));
  const tipo = params.get("tipo");
  if (tipo !== null && !esTipoResultado(tipo)) {
    return NextResponse.json({ error: "tipo desconocido" }, { status: 400 });
  }
  try {
    // Se piden de más para poder variar: seis cargos de «salud mental»
    // taparían la norma que crea el centro. Sin tipo elegido, a lo sumo la
    // mitad de las filas son de un mismo tipo, sin romper el orden.
    const [h, pantallas] = await Promise.all([
      buscarEnTodo(q, { tipo: tipo ?? undefined, porPagina: tipo ? n : n * 4 }),
      tipo ? Promise.resolve([]) : buscarPantallas(q, 3),
    ]);
    if (!h) return NextResponse.json({ error: "El índice de búsqueda no cargó" }, { status: 502 });
    const tope = tipo ? n : Math.ceil(n / 2);
    const cuenta = new Map<string, number>();
    // Los primeros de cada tipo (`grupos`) entran también al reparto: entre
    // los 24 primeros de «chofer» solo hay cargos, y los choferes que son
    // proveedores quedaban fuera aunque la regla los quisiera.
    const vistos = new Set(h.resultados.map((r) => r.href));
    const numerados = [
      ...h.resultados,
      ...(tipo ? [] : h.grupos.flatMap((g) => g.resultados).filter((r) => !vistos.has(r.href))),
    ].map((r, rango) => ({ r, rango }));
    const elegidos = numerados.filter(({ r }) => {
      const c = cuenta.get(r.tipo) ?? 0;
      if (c >= tope) return false;
      cuenta.set(r.tipo, c + 1);
      return true;
    });
    const rangos = new Set(elegidos.map((e) => e.rango));
    const filas = [...elegidos, ...numerados.filter((e) => !rangos.has(e.rango))]
      .slice(0, n)
      .sort((a, b) => a.rango - b.rango)
      .map((e) => e.r);
    return NextResponse.json(
      {
        resultados: filas.map((r) => ({
          tipo: r.tipo,
          etiqueta: ETIQUETA[r.tipo],
          titulo: EN_MAYUSCULAS.has(r.tipo) ? desdeMayusculas(r.titulo) : r.titulo,
          detalle:
            [
              // El estado de un proceso o una iniciativa es el del día de la
              // instantánea: se dice al lado.
              (r.tipo === "proceso" || r.tipo === "iniciativa") && r.detalle && fechaDeCorte(h.instantaneas[r.tipo])
                ? `${r.detalle} al ${fechaDeCorte(h.instantaneas[r.tipo])}`
                : r.detalle,
              r.origen,
              r.sueldo && `${formatPesos(r.sueldo.mediana)} de mediana al mes`,
            ]
              .filter(Boolean)
              .join(" · ") || null,
          href: r.href,
          externo: r.externo,
          via: r.via,
        })),
        pantallas: (pantallas ?? []).map((p) => ({ href: p.href, titulo: p.titulo, nota: p.nota, pregunta: p.pregunta })),
        total: h.total,
        generado: h.generado,
      },
      // El índice solo cambia con un despliegue.
      { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
    );
  } catch {
    return NextResponse.json({ error: "No se pudo buscar" }, { status: 502 });
  }
}
