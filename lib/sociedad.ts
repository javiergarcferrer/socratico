import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Indicadores sociales en una instantánea: denuncias de robo y armas
 * (Ministerio de Interior y Policía), matrícula escolar (MINERD) y licencias
 * de construcción (MIVHED).
 *
 * Mecánica verificada en docs/INFRAESTRUCTURA.md §5.9: ninguno de los tres orígenes publica un nombre de archivo
 * predecible —el MIP sube a una carpeta por mes con sufijos `-v2`, el MINERD
 * antepone prefijos aleatorios, el MIVHED cambia la carpeta al actualizar—, así
 * que `scripts/build-sociedad.py` descubre cada archivo en su listado (la
 * biblioteca de WordPress del MIP, el listado de transparencia del MINERD, la
 * página de datos abiertos del MIVHED), lo interpreta, lo valida bloque a
 * bloque y escribe `public/data/sociedad.json`. Son series anuales o
 * semestrales: leerlas en vivo en cada visita sería pedir 700 KB para servir
 * lo mismo que ayer.
 *
 * Lo que cada cifra es, y lo que no:
 * - Robos: **denuncias** recibidas por la Policía Nacional, no delitos
 *   ocurridos. Solo vehículos, motocicletas y armas de fuego vienen desde
 *   2018; el resto de los tipos, desde 2024.
 * - Matrícula: estudiantes inscritos por nivel; el total nacional sale de las
 *   18 regionales (los distritos las repiten desglosadas y no se suman).
 * - Licencias: permisos de construcción emitidos, no obras empezadas ni
 *   terminadas.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

export interface AnioRobos {
  anio: number;
  /** Los tipos presentes todos los años (vehículos, motocicletas, armas). */
  serieLarga: number;
  /** Todos los tipos; `null` en los años en que el origen no los trae todos. */
  todos: number | null;
  porTipo: Record<string, number>;
}

export interface Robos {
  anios: [number, number];
  ultimoAnio: number;
  tiposSerieLarga: string[];
  aniosCompletos: number[];
  porAnio: AnioRobos[];
  mesesUltimoAnio: number[];
  porTipoUltimoAnio: { tipo: string; denuncias: number }[];
  porProvinciaUltimoAnio: { provincia: string; denuncias: number }[];
  /** Denuncias sin provincia (`#N/D` en el origen). */
  sinProvinciaUltimoAnio: number;
  totalUltimoAnio: number;
  archivo: string;
  publicado: string;
  heredadoDe?: string;
}

export interface ArmasIncautadas {
  porAnio: { anio: number; total: number; trimestres: number }[];
  anioReferencia: number;
  porOrganismo: { organismo: string; armas: number }[];
  archivo: string;
  publicado: string;
}

export interface ArmasRegistradas {
  /** Acumulado al último trimestre publicado de cada año. */
  porAnio: { anio: number; trimestre: number; masculino: number; femenino: number }[];
  ultimo: { anio: number; trimestre: number };
  porTipo: { tipo: string; masculino: number; femenino: number }[];
  archivo: string;
  publicado: string;
}

export interface PeriodoMatricula {
  /** «2023-24». */
  periodo: string;
  total: number;
  niveles: Record<NivelEscolar, number>;
}

export type NivelEscolar = "Inicial" | "Primario" | "Secundario" | "Adultos";

export interface Matricula {
  periodos: [string, string];
  ultimoPeriodo: string;
  porPeriodo: PeriodoMatricula[];
  porNivelUltimo: { nivel: NivelEscolar; estudiantes: number }[];
  porRegionalUltimo: {
    codigo: string;
    regional: string;
    total: number;
    niveles: Record<NivelEscolar, number>;
  }[];
  archivo: string;
  codificacion: string;
  heredadoDe?: string;
}

export interface FilaLicencias {
  nombre: string;
  licencias: number;
  metros2: number;
  /** Pesos dominicanos, como los declara el registro. */
  inversion: number;
}

export interface Licencias {
  /** Última fecha de emisión del archivo. */
  corte: string;
  anios: [number, number];
  porAnio: {
    anio: number;
    licencias: number;
    metros2: number;
    inversion: number;
    completo: boolean;
    /** Último mes con licencias ese año. */
    meses: number;
  }[];
  /** El último año completo: sobre él van los desgloses. */
  anioReferencia: number;
  porProvincia: FilaLicencias[];
  porMunicipio: (FilaLicencias & { provincia: string })[];
  porTipologia: FilaLicencias[];
  mayorLicencia: {
    fecha: string;
    provincia: string;
    municipio: string;
    tipologia: string;
    metros2: number;
    inversion: number;
  };
  archivo: string;
  heredadoDe?: string;
}

export interface Sociedad {
  generado: string;
  fuentes: Partial<Record<"mip" | "minerd" | "mivhed", string>>;
  robos?: Robos;
  armas?: { incautadas?: ArmasIncautadas; registradas?: ArmasRegistradas };
  matricula?: Matricula;
  licencias?: Licencias;
}

let memo: Promise<Sociedad | null> | null = null;

export function getSociedad(): Promise<Sociedad | null> {
  memo ??= readFile(join(process.cwd(), "public", "data", "sociedad.json"), "utf8")
    .then((t) => JSON.parse(t) as Sociedad)
    .catch((err) => {
      console.error("[sociedad]", err);
      memo = null;
      return null;
    });
  return memo;
}
