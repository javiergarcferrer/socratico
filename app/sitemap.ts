import type { MetadataRoute } from "next";
import { INSTITUCIONES, hrefInstitucion } from "@/lib/instituciones";
import { CAPITULOS } from "@/lib/capitulos";
import { SECCIONES } from "@/lib/secciones";
import { INDICE } from "@/lib/indice";
import { PROVINCIAS } from "@/lib/provincias";
import { getObras } from "@/lib/obras";
import { getDirectorioLegisladores } from "@/lib/congreso";
import { getFuncionarios } from "@/lib/funcionarios";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { SITIO } from "@/lib/sitio";
import { enlace } from "@/lib/grafo";

// Se rehace una vez al día: los legisladores y las normas nuevas entran solos.
export const revalidate = 86400;

/** Lo que no se indexa (páginas personales o de resultados) no va al mapa. */
const FUERA_DEL_MAPA = new Set(["/buscar", "/seguimiento"]);

const RUTA_NORMA: Record<number, string> = { 1: "ley", 3: "decreto", 4: "reglamento", 7: "resolucion" };

/** Las normas de la instantánea que tienen ficha propia (tipo y número válidos). */
async function rutasDeNormas(): Promise<string[]> {
  try {
    const crudo = JSON.parse(
      await readFile(path.join(process.cwd(), "public", "data", "normativa.json"), "utf8"),
    ) as { busquedas: Record<string, { TipoDocumento?: number; Numero?: string }[]> };
    const rutas = new Set<string>();
    for (const filas of Object.values(crudo.busquedas)) {
      for (const f of filas) {
        const tipo = RUTA_NORMA[f.TipoDocumento ?? 0];
        const numero = (f.Numero ?? "").trim();
        const ruta = tipo ? enlace.norma(tipo, numero) : null;
        if (ruta) rutas.add(ruta);
      }
    }
    return [...rutas];
  } catch {
    return [];
  }
}

/**
 * El mapa del sitio: las vistas de cada vertical, las páginas transversales y
 * las fichas que se pueden enumerar —instituciones, provincias, obras,
 * capítulos del presupuesto, las normas de la instantánea y los legisladores
 * del período—. Procesos, iniciativas y proveedores son cientos de miles y
 * cambian a diario: el buscador los encuentra por sus enlaces desde estas.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [obrasInst, normas, directorio, funcionarios] = await Promise.all([
    getObras(),
    rutasDeNormas(),
    getDirectorioLegisladores().catch(() => null),
    getFuncionarios(),
  ]);
  const obras = obrasInst?.proyectos ?? [];
  const vistas = SECCIONES.flatMap((s) => s.vistas.map((v) => v.href));
  const indice = INDICE.map((d) => d.href);
  const rutas = [...new Set([...indice, ...vistas])].filter(
    (r) => !FUERA_DEL_MAPA.has(r),
  );
  return [
    ...rutas.map((r) => ({ url: `${SITIO}${r}`, changeFrequency: "daily" as const })),
    ...INSTITUCIONES.map((i) => ({
      url: `${SITIO}${hrefInstitucion(i)}`,
      changeFrequency: "weekly" as const,
    })),
    ...PROVINCIAS.map((p) => ({
      url: `${SITIO}/provincias/${p.slug}`,
      changeFrequency: "weekly" as const,
    })),
    ...obras.map((o) => ({
      url: `${SITIO}/obras/${o.snip}`,
      changeFrequency: "monthly" as const,
    })),
    ...normas.map((r) => ({ url: `${SITIO}${r}`, changeFrequency: "yearly" as const })),
    ...(directorio?.legisladores ?? []).map((l) => ({
      url: `${SITIO}/congreso/legisladores/${l.id}`,
      changeFrequency: "weekly" as const,
    })),
    ...CAPITULOS.map((c) => ({
      url: `${SITIO}/finanzas/${c.codigo}`,
      changeFrequency: "monthly" as const,
    })),
    // Solo las personas con cargo obligado a declarar patrimonio (PEP): la
    // ficha de un servidor sin ese cargo se lee aquí y no se indexa
    // (app/funcionarios/[slug]/page.tsx, proporcionalidad de la Ley 172-13).
    ...(funcionarios?.personas ?? [])
      .filter((p) => p.pep.length > 0)
      .map((p) => ({
        url: `${SITIO}${enlace.funcionario(p.id)}`,
        changeFrequency: "monthly" as const,
      })),
  ];
}
