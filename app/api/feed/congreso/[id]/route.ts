import { NextRequest } from "next/server";
import {
  desdeMayusculas,
  leerHistoricos,
  getIniciativa,
  limpiarTexto,
  normalizarIniciativa,
} from "@/lib/congreso";

export const dynamic = "force-dynamic";

function esc(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * El historial de una iniciativa de Diputados como RSS: un elemento por cada
 * estado por el que pasó, el más reciente arriba.
 *
 * Es el aviso de «se movió» que la plataforma puede dar **sin servidor ni
 * cuenta**: quien quiera enterarse sin volver a `/seguimiento` se suscribe en
 * su lector y el lector pregunta. Las notificaciones push exigirían guardar
 * suscripciones, que es una decisión abierta del dueño
 * (`docs/PLAN-ACCESO.md` §6).
 *
 * Lee lo mismo que la ficha (`getIniciativa`, `leerHistoricos`), con su caché
 * de cinco minutos.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) {
    return new Response("Id de iniciativa inválido", { status: 400 });
  }

  try {
    const [raw, historicos] = await Promise.all([
      getIniciativa(Number(id)),
      leerHistoricos(Number(id)),
    ]);
    if (!raw || !historicos) return new Response("El SIL de la Cámara no contestó", { status: 502 });

    const ini = normalizarIniciativa(raw);
    const origen = req.nextUrl.origin;
    const link = `${origen}/congreso/${ini.id}`;
    const titulo = desdeMayusculas(ini.titulo);
    const numero = ini.numero?.completo ?? `#${ini.id}`;

    const tramites = historicos.results
      .filter((h) => limpiarTexto(h.estado))
      .sort((a, b) => (b.inicio ?? "").localeCompare(a.inicio ?? ""));

    const items = tramites
      .map((h) => {
        const estado = limpiarTexto(h.estado);
        const fecha = h.inicio ? new Date(h.inicio) : null;
        return `    <item>
      <title>${esc(`${numero}: ${estado}`)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${esc(`sil-${ini.id}-${h.id}`)}</guid>
${fecha && !Number.isNaN(fecha.getTime()) ? `      <pubDate>${fecha.toUTCString()}</pubDate>\n` : ""}      <description>${esc(`${titulo}: pasó a «${estado}».`)}</description>
    </item>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(`Iniciativa ${numero} · Socrático`)}</title>
    <link>${esc(link)}</link>
    <description>${esc(`Cada cambio de estado de «${titulo}» en la Cámara de Diputados, según el SIL. Herramienta independiente y no oficial.`)}</description>
    <language>es-do</language>
    <ttl>60</ttl>
${items}
  </channel>
</rss>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=1800",
      },
    });
  } catch {
    return new Response("Error consultando el SIL de la Cámara", { status: 502 });
  }
}
