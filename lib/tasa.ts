/**
 * Tasa de cambio del dólar — referencia del mercado spot del Banco Central.
 *
 * Sin credenciales: la API del BCRD (`api.bancentral.gov.do`) exige clave
 * (docs/INFRAESTRUCTURA.md §5.11); esto lee el **archivo público
 * del CDN** que el propio BCRD publica (§5.4), verificado el 2026-09-23:
 *
 *   https://cdn.bancentral.gov.do/documents/estadisticas/mercado-cambiario/documents/TASA_DOLAR_REFERENCIA_MC.xlsx
 *
 * → 200, 357 KB, `last-modified` del día hábil anterior. Hoja «Diaria»
 * (`xl/worksheets/sheet1.xml`): Año | Mes («Ene»…) | Día | Compra | Venta, desde
 * 1991. **Ojo**: el `.xls` del mismo nombre que citaba la auditoría también
 * responde 200, pero está congelado desde el 19-jul-2022; el vigente es el
 * `.xlsx`.
 *
 * Fuente viva, caché de 1 h (precio). Solo servidor: lee con `lib/xlsx.ts`.
 * La hoja trae ~9,000 filas desde 1991 y leerla entera cuesta ~0,5 s, así que
 * el resultado —no solo la descarga— se guarda una hora con `unstable_cache`.
 */

import { unstable_cache } from "next/cache";
import { delDiaBcrd, pedirBytes } from "@/lib/pedir";
import { filasDe, leerHoja } from "@/lib/xlsx";
import { numeroMes } from "@/lib/format";

export const URL_TASA =
  "https://cdn.bancentral.gov.do/documents/estadisticas/mercado-cambiario/documents/TASA_DOLAR_REFERENCIA_MC.xlsx";
const USER_AGENT = "Socratico-Inteligencia/1.0 (tasa de cambio de referencia; herramienta independiente)";

export interface PuntoTasa {
  /** Fecha ISO del día hábil. */
  fecha: string;
  compra: number;
  venta: number;
}

export interface Tasa {
  ultimo: PuntoTasa;
  /** El día hábil más cercano a 30 días antes, para comparar con la misma serie. */
  haceUnMes: PuntoTasa | null;
  fuente: string;
}


function bajar(): Promise<ArrayBuffer | null> {
  return pedirBytes(delDiaBcrd(URL_TASA), {
    fuente: "tasa",
    ua: USER_AGENT,
    tipo: /octet-stream|spreadsheetml|excel/i,
    // La hora la cuenta `unstable_cache` sobre el resultado; guardar también
    // la descarga otra hora dejaría la tasa hasta dos horas atrás.
    cache: "no-store",
    firma: "zip",
  });
}

/** Error que no se guarda en la caché: un fallo no se sirve una hora entera. */
class SinTasa extends Error {}

const leerTasa = unstable_cache(
  async (): Promise<Tasa> => {
    const buf = await bajar();
    if (!buf) throw new SinTasa("el CDN no entregó la hoja");
    const hoja = leerHoja(buf);
    if (!hoja) throw new SinTasa("la hoja no se pudo leer");
    const puntos: PuntoTasa[] = [];
    for (const { celdas } of filasDe(hoja)) {
      const anio = Number(celdas.get("A"));
      const mes = numeroMes(celdas.get("B") ?? "", { abreviado: true });
      const dia = Number(celdas.get("C"));
      const compra = Number(celdas.get("D"));
      const venta = Number(celdas.get("E"));
      if (!anio || !mes || !dia || !(compra > 0) || !(venta > 0)) continue;
      puntos.push({
        fecha: `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
        compra: Math.round(compra * 10_000) / 10_000,
        venta: Math.round(venta * 10_000) / 10_000,
      });
    }
    puntos.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const ultimo = puntos.at(-1);
    if (!ultimo) throw new SinTasa("la hoja no trae ningún día");
    const objetivo = new Date(`${ultimo.fecha}T12:00:00Z`);
    objetivo.setUTCDate(objetivo.getUTCDate() - 30);
    const iso = objetivo.toISOString().slice(0, 10);
    const haceUnMes = [...puntos].reverse().find((p) => p.fecha <= iso) ?? null;
    return { ultimo, haceUnMes, fuente: URL_TASA };
  },
  ["tasa-bcrd-v3"],
  { revalidate: 3600 },
);

export async function getTasa(): Promise<Tasa | null> {
  try {
    return await leerTasa();
  } catch (err) {
    console.error(`[tasa] ${String(err)}`);
    return null;
  }
}
