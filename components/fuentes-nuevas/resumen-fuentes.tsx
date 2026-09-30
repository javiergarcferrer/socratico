import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getObras } from "@/lib/obras";
import { getCombustibles } from "@/lib/combustibles";
import { getTasa } from "@/lib/tasa";
import { getResumenHistorico } from "@/lib/historico";
import { getIndiceBiblioteca } from "@/lib/biblioteca";
import { getCatalogo } from "@/lib/catalogo";
import { SECTORES_EIF, getFinancieras, type Sector, faltanDeLaSb } from "@/lib/financieras";
import { formatFecha } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { metaSanciones } from "@/lib/sanciones";

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

export async function ResumenSanciones() {
  const m = await metaSanciones();
  if (!m) return <>La instantánea no está disponible ahora mismo.</>;
  const d = m.fuentes.dgcp;
  return (
    <>
      Tabla descargada el {formatFecha(m.generado)}
      {d.corte ? `, con registros hasta el ${formatFecha(d.corte)}` : ""}: {formatInt(d.filas)} filas
      sobre {formatInt(d.rpe)} registros de proveedor. Se publican {formatInt(d.eventos)} medidas
      sobre {formatInt(d.juridicas)} empresas y entidades y {formatInt(d.personasFisicas)} personas
      físicas (estas, sin cédula).
    </>
  );
}

export async function ResumenOfac() {
  const m = await metaSanciones();
  if (!m) return <>La instantánea no está disponible ahora mismo.</>;
  const o = m.fuentes.ofac;
  return (
    <>
      Lista{o.fecha ? ` publicada el ${formatFecha(o.fecha)}` : ""}: {formatInt(o.entradas)}{" "}
      entradas, {formatInt(o.ligadasRd)} ligadas al país, de las que{" "}
      {formatInt(o.ligadasRd - o.individuosOmitidos)} son entidades y{" "}
      {formatInt(o.individuosOmitidos)} personas que no se guardan.
    </>
  );
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

/** El registro de entidades financieras: lo que trae de la Superintendencia de Bancos. */
export async function ResumenFinancierasSb() {
  const d = await getFinancieras();
  if (!d) return <>La instantánea no está disponible ahora mismo.</>;
  const eif = SECTORES_EIF.reduce((t, s) => t + (d.resumen.porSector[s] ?? 0), 0);
  // Las demás categorías de la SB, solo si la instantánea las trae.
  const otras = (
    [
      ["cambiaria", "agentes de cambio y de remesas"],
      ["fiduciaria", "fiduciarias"],
      ["informacion-crediticia", "burós de crédito"],
      ["oficina-representacion", "oficinas de representación"],
    ] as [Sector, string][]
  )
    .filter(([s]) => (d.resumen.porSector[s] ?? 0) > 0)
    .map(([s, nombre]) => `${formatInt(d.resumen.porSector[s] ?? 0)} ${nombre}`);
  return (
    <>
      Instantánea del {formatFecha(d.generado)}: {formatInt(eif)} entidades de intermediación
      financiera{otras.length ? `, ${otras.join(", ")}` : ""}
      {d.cortes.sb
        ? `, con fichas actualizadas entre el ${formatFecha(d.cortes.sb.desde)} y el ${formatFecha(d.cortes.sb.hasta)}`
        : ""}
      .
    </>
  );
}

/**
 * Lo que la SB supervisa y la instantánea no trae, dicho desde la instantánea:
 * cuando una corrida lo lea todo, la frase desaparece sola.
 */
export async function ResumenFaltanSb() {
  const d = await getFinancieras();
  const faltan = d ? faltanDeLaSb(d) : "";
  if (!faltan) return null;
  return (
    <>
      {" "}
      Esta instantánea no trae {faltan}: al leer las fichas de la primera de esas categorías, el
      cortafuegos respondió con su desafío y no se le pidió nada más a la SB. La vía para leerlas es
      pedirle que admita el User-Agent de la plataforma.
    </>
  );
}

/** Lo que trae de la SIPEN, la Superintendencia de Seguros y el IDECOOP. */
export async function ResumenFinancierasOtras() {
  const d = await getFinancieras();
  if (!d) return <>La instantánea no está disponible ahora mismo.</>;
  const n = (s: Sector) => formatInt(d.resumen.porSector[s] ?? 0);
  return (
    <>
      Instantánea del {formatFecha(d.generado)}: {n("afp")} AFP, {n("aseguradora")} compañías de
      seguros y reaseguros, y {formatInt(d.resumen.cooperativasIncluidas)} cooperativas de las{" "}
      {formatInt(d.resumen.cooperativasIncorporadas)} incorporadas.
    </>
  );
}
