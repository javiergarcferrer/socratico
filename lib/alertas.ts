/**
 * Alertas meteorológicas — Instituto Dominicano de Meteorología (INDOMET).
 *
 * Mecánica verificada en docs/INFRAESTRUCTURA.md §5.4 (2026-09-24): INDOMET emite sus
 * avisos en el estándar internacional CAP 1.2 y los publica, en dominio
 * público, en el repositorio de fuentes CAP que alimenta a los agregadores de
 * alertas:
 *
 *   https://cap-sources.s3.amazonaws.com/do-indomet-es/rss.xml
 *
 * → 200 `text/xml`, las 20 alertas más recientes; cada `<item><link>` es el XML
 * CAP de una alerta (`application/xml`) con evento, severidad, urgencia,
 * `onset`, `expires` y la provincia (`areaDesc`). Una alerta publicada no
 * cambia: su XML se cachea un día; el índice, 15 minutos.
 *
 * Vigente = no expirada y no cancelada. Una misma alerta se reemite (misma
 * cabecera, misma provincia) cada vez que se actualiza: se queda la más
 * reciente. Lectura acotada: a lo sumo las 20 del índice.
 *
 * Esto son **alertas**, no el pronóstico: sin alertas vigentes no quiere decir
 * buen tiempo.
 */

import { desentidadesXml } from "@/lib/html";
import { pedirTexto } from "@/lib/pedir";

const URL_RSS = "https://cap-sources.s3.amazonaws.com/do-indomet-es/rss.xml";
const PREFIJO = "https://cap-sources.s3.amazonaws.com/do-indomet-es/";
const USER_AGENT = "Socratico-Inteligencia/1.0 (alertas meteorologicas; herramienta independiente)";
const TOPE = 20;

export type Severidad = "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";

export interface Alerta {
  id: string;
  titulo: string;
  evento: string;
  severidad: Severidad;
  descripcion: string;
  instruccion: string;
  zona: string;
  /** ISO con zona horaria, tal como lo emite INDOMET. */
  enviada: string;
  desde: string | null;
  hasta: string | null;
  url: string;
}

export interface Alertas {
  vigentes: Alerta[];
  /** La alerta más reciente publicada, vigente o no: dice que la fuente vive. */
  ultimaEmitida: string | null;
  fuente: string;
}

function pedir(url: string, revalidate: number): Promise<string | null> {
  return pedirTexto(url, { fuente: "alertas", ua: USER_AGENT, tipo: /xml/i, revalidate });
}

function campo(xml: string, nombre: string): string {
  const m = new RegExp(`<cap:${nombre}>([\\s\\S]*?)</cap:${nombre}>`).exec(xml);
  return m
    ? m[1]
        // Un CDATA es texto literal; fuera de él, las entidades de XML.
        .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)
        .map((t) => (t.startsWith("<![CDATA[") ? t.slice(9, -3) : desentidadesXml(t)))
        .join("")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

const SEVERIDADES: Severidad[] = ["Extreme", "Severe", "Moderate", "Minor", "Unknown"];

export async function getAlertas(): Promise<Alertas | null> {
  const rss = await pedir(URL_RSS, 900);
  if (!rss || !rss.includes("<item>")) return null;
  const enlaces = [...rss.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/g)]
    .map((m) => m[1].trim())
    .filter((u) => u.startsWith(PREFIJO) && u.endsWith(".xml"))
    .slice(0, TOPE);

  const xmls = await Promise.all(enlaces.map((u) => pedir(u, 86_400)));
  const ahora = Date.now();
  const todas: (Alerta & { tipo: string; estado: string })[] = [];
  xmls.forEach((xml, i) => {
    if (!xml || !xml.includes("<cap:alert")) return;
    const sev = campo(xml, "severity") as Severidad;
    todas.push({
      id: campo(xml, "identifier"),
      titulo: campo(xml, "headline") || campo(xml, "event"),
      evento: campo(xml, "event"),
      severidad: SEVERIDADES.includes(sev) ? sev : "Unknown",
      descripcion: campo(xml, "description"),
      instruccion: campo(xml, "instruction"),
      zona: campo(xml, "areaDesc"),
      enviada: campo(xml, "sent"),
      desde: campo(xml, "onset") || null,
      hasta: campo(xml, "expires") || null,
      url: enlaces[i],
      tipo: campo(xml, "msgType"),
      estado: campo(xml, "status"),
    });
  });
  if (todas.length === 0) return null;

  todas.sort((a, b) => Date.parse(b.enviada) - Date.parse(a.enviada));
  const vistas = new Set<string>();
  const vigentes: Alerta[] = [];
  for (const a of todas) {
    const clave = `${a.titulo}|${a.zona}`;
    if (vistas.has(clave)) continue; // la reemisión más reciente manda
    vistas.add(clave);
    if (a.estado !== "Actual" || a.tipo === "Cancel") continue;
    if (!a.hasta || Date.parse(a.hasta) <= ahora) continue;
    const { tipo: _t, estado: _e, ...alerta } = a;
    vigentes.push(alerta);
  }
  vigentes.sort((a, b) => SEVERIDADES.indexOf(a.severidad) - SEVERIDADES.indexOf(b.severidad));
  return { vigentes, ultimaEmitida: todas[0]?.enviada ?? null, fuente: URL_RSS };
}
