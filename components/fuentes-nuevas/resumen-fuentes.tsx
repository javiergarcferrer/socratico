import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getObras } from "@/lib/obras";
import { getCombustibles } from "@/lib/combustibles";
import { getTasa } from "@/lib/tasa";
import { getResumenHistorico } from "@/lib/historico";
import { getIndiceBiblioteca } from "@/lib/biblioteca";
import { getCatalogo } from "@/lib/catalogo";
import { formatFecha } from "@/lib/format";
import { formatInt } from "@/lib/nomina";

/**
 * Las cifras vivas de cada instantánea nueva, para `/fuentes`: cuántos
 * registros trae y a qué fecha corresponde. Viven aquí y no en la página para
 * que declarar una fuente sea una línea en `app/fuentes/page.tsx`.
 */
export async function ResumenObras() {
  const d = await getObras();
  if (!d) return <>La instantánea no está disponible ahora mismo.</>;
  const conContratos = d.proyectos.filter((o) => o.nContratos > 0).length;
  const conInstitucion = d.proyectos.filter((o) => o.uc !== null).length;
  return (
    <>
      Instantánea con corte al {formatFecha(d.corte)}: {formatInt(d.proyectos.length)} proyectos,{" "}
      {formatInt(conContratos)} con contratos asociados y {formatInt(conInstitucion)} atados a
      una institución de la plataforma.
    </>
  );
}

export async function ResumenRnc() {
  try {
    const m = JSON.parse(
      await readFile(join(process.cwd(), "public", "data", "rnc", "meta.json"), "utf8"),
    ) as { corteDgii: string | null; proveedores: number; conRnc: number; enPadron: number; padron: number };
    return (
      <>
        Padrón{m.corteDgii ? ` al ${formatFecha(m.corteDgii)}` : ""} ({formatInt(m.padron)}{" "}
        contribuyentes): {formatInt(m.enPadron)} de los {formatInt(m.conRnc)} proveedores con RNC
        de empresa están en él, de {formatInt(m.proveedores)} inscritos en el registro.
      </>
    );
  } catch {
    return <>La instantánea no está disponible ahora mismo.</>;
  }
}

/**
 * El padrón de empresas (`scripts/build-empresas.py`). Lee solo su `meta.json`
 * con la ruta entera, no `lib/empresas.ts`: así el trazado de Next no mete los
 * 16 MB de la instantánea en la función de `/fuentes`.
 */
export async function ResumenEmpresas() {
  try {
    const m = JSON.parse(
      await readFile(join(process.cwd(), "public", "data", "empresas", "meta.json"), "utf8"),
    ) as {
      corteDgii: string | null;
      contribuyentes: number;
      empresas: number;
      conRpe: number;
      fuera: Record<string, number>;
    };
    const f = (clave: string) => formatInt(m.fuera[clave] ?? 0);
    return (
      <>
        Padrón{m.corteDgii ? ` al ${formatFecha(m.corteDgii)}` : ""} ({formatInt(m.contribuyentes)}{" "}
        contribuyentes): {formatInt(m.empresas)} personas jurídicas publicadas,{" "}
        {formatInt(m.conRpe)} de ellas inscritas como proveedoras del Estado. Fuera quedan{" "}
        {f("cedula")} cédulas, {f("rncDePersona")} RNC de nueve cifras de personas,{" "}
        {f("sucesion")} sucesiones y {formatInt((m.fuera["lote2009"] ?? 0) + (m.fuera["nombre"] ?? 0))}{" "}
        personas físicas inscritas con RNC de empresa.
      </>
    );
  } catch {
    return <>La instantánea no está disponible ahora mismo.</>;
  }
}

export async function ResumenCombustibles() {
  const c = await getCombustibles();
  if (!c) return <>Ahora mismo la portada no contestó o cambió de forma.</>;
  return (
    <>
      Última lectura: {c.precios.length} precios
      {c.semana ? `, semana del ${c.semana}` : ""}.
    </>
  );
}

export async function ResumenTasa() {
  const t = await getTasa();
  if (!t) return <>Ahora mismo el archivo no contestó.</>;
  return <>Último dato: {formatFecha(t.ultimo.fecha)}.</>;
}

export async function ResumenHistorico() {
  const d = await getResumenHistorico();
  if (!d) return <>La instantánea no está disponible ahora mismo.</>;
  return (
    <>
      Instantánea del {formatFecha(d.generado)}: {formatInt(d.contratosLeidos)} contratos y{" "}
      {formatInt(d.procesosLeidos)} procesos, hasta el {formatFecha(d.corte)}.
    </>
  );
}

export async function ResumenBiblioteca() {
  const d = await getIndiceBiblioteca();
  if (!d) return <>El índice no está disponible ahora mismo.</>;
  const con = d.fuentes.filter((f) => f.documentos > 0).length;
  return (
    <>
      Índice del {formatFecha(d.generado)}: {formatInt(d.total)} documentos de {formatInt(con)}{" "}
      instituciones.
    </>
  );
}

export async function ResumenCatalogo() {
  const d = await getCatalogo();
  if (!d) return <>El catálogo no está disponible ahora mismo.</>;
  return (
    <>
      Catálogo del {formatFecha(d.generado)}: {formatInt(d.total)} conjuntos de{" "}
      {formatInt(d.organizaciones)} organizaciones.
    </>
  );
}
