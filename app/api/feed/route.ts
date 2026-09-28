import { NextRequest } from "next/server";
import { listProcesos } from "@/lib/dgcp";
import { ETAPAS, etapaDe, etapaPorClave, type Etapa } from "@/lib/estados";
import { formatMonto } from "@/lib/format";

export const dynamic = "force-dynamic";

function esc(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hoyMenosDias(dias: number): string {
  return new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
}

/**
 * La etapa que pide el querystring, o `null` para «todas».
 *
 * `?etapa=` **presente y vacío** es «todas las etapas» y no es lo mismo que
 * ausente, que es el feed de siempre —lo abierto a ofertar—. Distinguirlos
 * importa: el buscador siempre escribe el parámetro, así que un RSS suscrito
 * desde «todas las etapas» tiene que traer todas y no volver a lo abierto.
 * `?estado=` es el vocabulario literal de la DGCP que llevan los enlaces
 * anteriores a las etapas: se traduce en vez de romperse.
 */
function etapaPedida(sp: URLSearchParams): Etapa | null {
  const clave = sp.get("etapa");
  if (clave !== null) return etapaPorClave(clave);
  const estado = sp.get("estado");
  if (estado !== null) return estado ? etapaDe(estado) : null;
  return ETAPAS[0];
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? undefined;
  const modalidad = sp.get("modalidad") ?? undefined;
  const mipyme = sp.get("mipyme") ?? undefined;
  const uc = sp.get("uc") ?? undefined;
  const etapa = etapaPedida(sp);

  try {
    const r = await listProcesos({
      q,
      etapa: etapa?.clave,
      modalidad,
      mipyme: mipyme === "1" ? "true" : undefined,
      unidad_compra: uc ? Number(uc) : undefined,
      startdate: hoyMenosDias(30),
      limit: 50,
    });

    const origen = req.nextUrl.origin;
    const partes = [
      q && `“${q}”`,
      etapa === null
        ? "todas las etapas"
        : etapa.clave !== "abiertos" && etapa.label.toLowerCase(),
      modalidad,
      uc && `institución ${uc}`,
      mipyme === "1" && "MIPYMES",
    ].filter(Boolean);
    const titulo = `Licitaciones RD${partes.length ? ": " + partes.join(" · ") : ""}`;

    const items = r.content
      .slice(0, 50)
      .map((p) => {
        const link = `${origen}/procesos/${encodeURIComponent(p.codigo_proceso)}`;
        const desc = `${p.unidad_compra} · ${p.modalidad} · ${formatMonto(
          p.monto_estimado,
          p.divisa
        )} · cierre de ofertas: ${p.fecha_fin_recepcion_ofertas?.slice(0, 10) ?? "n/d"}`;
        return `    <item>
      <title>${esc(p.titulo || p.codigo_proceso)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${esc(p.codigo_proceso)}</guid>
      <pubDate>${new Date(p.fecha_publicacion).toUTCString()}</pubDate>
      <description>${esc(desc)}</description>
    </item>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(titulo)}</title>
    <link>${esc(origen)}</link>
    <description>Procesos de compras públicas de República Dominicana (datos abiertos DGCP), publicados en los últimos 30 días. Suscríbete para recibir los nuevos automáticamente.</description>
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
    return new Response("Error consultando la API de la DGCP", { status: 502 });
  }
}
