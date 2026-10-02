/**
 * Generación eléctrica del sistema interconectado — Organismo Coordinador del
 * Sistema Eléctrico Nacional Interconectado (OC).
 *
 * Mecánica verificada en docs/INFRAESTRUCTURA.md §5.4 (2026-09-24): la portada del OC
 * pinta sus gráficos con un servicio JSON público, sin clave, que acepta una
 * fecha (`MM/DD/YYYY`) y responde también días pasados:
 *
 *  - `GET https://apps.oc.org.do/wsOCWebsiteChart/Service.asmx/GetGeneracionReprogramadaJSon?Fecha=…`
 *    → 24 filas horarias {PERIODO, PROGRAMADO, GENERACION, DESVIACION} en MW
 *    medios (la suma del día es MWh).
 *  - `…/GetCentralMarginalPonderadaJSon?Fecha=…` → por período, la central que
 *    fijó el costo marginal. Cuando la marginal es «DESABASTECIMIENTO», el OC
 *    está registrando que en esa hora la oferta no cubrió la demanda. Este
 *    servicio **a veces devuelve menos de 24 períodos** y en otros pone «P-7»
 *    en vez de una planta: se cuentan solo las horas que declara, y se dice
 *    sobre cuántas.
 *
 * Se lee **el día de ayer** (hora de Santo Domingo), que ya está cerrado:
 * caché de una hora. El `robots` de `www.oc.org.do` veta `/Portals/`; este
 * host (`apps.`) no tiene esa regla. Si el día viene incompleto (menos de 24
 * horas de generación), `null`: no se pinta un día a medias como si fuera uno.
 */

import { z } from "zod";
import { filas, pedirJson } from "@/lib/pedir";

const BASE = "https://apps.oc.org.do/wsOCWebsiteChart/Service.asmx";
const USER_AGENT = "Socratico-Inteligencia/1.0 (generacion electrica del OC; herramienta independiente)";

export interface DiaElectrico {
  /** ISO del día leído. */
  fecha: string;
  /** MWh generados y programados en el día. */
  generado: number;
  programado: number;
  /** La hora de mayor generación (1–24) y su potencia media (MW). */
  pico: { periodo: number; mw: number };
  /** Horas en que el OC registró «desabastecimiento» como marginal, sobre las declaradas. */
  desabastecimiento: { horas: number; declaradas: number } | null;
  fuente: string;
}

function pedir<T>(ruta: string, esquema: z.ZodType<T>): Promise<T | null> {
  return pedirJson(`${BASE}/${ruta}`, {
    fuente: "energia",
    ua: USER_AGENT,
    tipo: /application\/json/i,
    revalidate: 3600,
    esquema,
  });
}

/*
  La forma de las dos respuestas del OC, validada: un campo renombrado deja
  la tarjeta en «no disponible» con su motivo en el registro. Una hora rara
  se descarta sola (`filas`); la cuenta de 24 horas completas decide.
*/
const GENERACION = z.looseObject({
  GetGeneracionReprogramada: filas(
    z.looseObject({ PERIODO: z.number(), PROGRAMADO: z.number().nullish(), GENERACION: z.number().nullish() }),
  ).nullish(),
});
const MARGINAL = z.looseObject({
  GetCentralMarginalPonderada: filas(z.looseObject({ PERIODO: z.number(), CENTRAL: z.string().nullish() })).nullish(),
});

/** Ayer en Santo Domingo, como ISO y como `MM/DD/YYYY` para el servicio. */
function ayer(): { iso: string; oc: string } {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santo_Domingo" });
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const iso = d.toISOString().slice(0, 10);
  const [a, m, dd] = iso.split("-");
  return { iso, oc: `${m}/${dd}/${a}` };
}

export async function getDiaElectrico(): Promise<DiaElectrico | null> {
  const { iso, oc } = ayer();
  const fecha = encodeURIComponent(oc);
  const [gen, marg] = await Promise.all([
    pedir(`GetGeneracionReprogramadaJSon?Fecha=${fecha}`, GENERACION),
    pedir(`GetCentralMarginalPonderadaJSon?Fecha=${fecha}`, MARGINAL),
  ]);
  const filas = (gen?.GetGeneracionReprogramada ?? []).flatMap((f) =>
    typeof f.GENERACION === "number" &&
    Number.isFinite(f.GENERACION) &&
    typeof f.PROGRAMADO === "number" &&
    Number.isFinite(f.PROGRAMADO) &&
    f.PERIODO >= 1 &&
    f.PERIODO <= 24
      ? [{ PERIODO: f.PERIODO, GENERACION: f.GENERACION, PROGRAMADO: f.PROGRAMADO }]
      : [],
  );
  if (new Set(filas.map((f) => f.PERIODO)).size !== 24) return null;
  const pico = filas.reduce((a, b) => (b.GENERACION > a.GENERACION ? b : a));
  const marginales = marg?.GetCentralMarginalPonderada ?? [];
  const periodos = new Map<number, string>();
  for (const m of marginales) if (m.PERIODO >= 1 && m.PERIODO <= 24) periodos.set(m.PERIODO, m.CENTRAL ?? "");
  const horas = [...periodos.values()].filter((c) => /desabastecimiento/i.test(c)).length;
  return {
    fecha: iso,
    generado: filas.reduce((s, f) => s + f.GENERACION, 0),
    programado: filas.reduce((s, f) => s + f.PROGRAMADO, 0),
    pico: { periodo: pico.PERIODO, mw: pico.GENERACION },
    desabastecimiento: periodos.size > 0 ? { horas, declaradas: periodos.size } : null,
    fuente: "https://www.oc.org.do/",
  };
}
