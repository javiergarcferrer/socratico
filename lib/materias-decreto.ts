/**
 * La materia de un decreto, leída de su título y de la etiqueta de institución
 * que le pone la Consultoría Jurídica. La usan la vertical de normativa
 * (`lib/normativa.ts`, que re-exporta todo esto) y el registro completo de
 * decretos (`lib/decretos.ts`). Vive aparte para que los dos la importen sin
 * importarse entre sí.
 */

/**
 * ¿De qué trata un decreto? El origen no lo dice: da el título y la etiqueta
 * `Institucion`. Pero los títulos son de fórmula —«QUE CONCEDE PENSIONES…»,
 * «QUE DECLARA DE UTILIDAD PÚBLICA…»— y la etiqueta lo termina de decidir, así
 * que la materia se lee con reglas, no con un modelo: son auditables, corren
 * sobre la lectura en vivo sin clave ni secreto. Medidas sobre los 2.729
 * decretos de 2023–2026 de la instantánea (24-09-2026), dejan 5 % en «Otros
 * asuntos»; se revisaron muestras de cada materia y la lista completa de lo
 * que solo reconoce la etiqueta.
 *
 * El orden importa: gana la primera regla que casa. Las emergencias van
 * primero porque la Consultoría etiqueta con la Cámara de Cuentas también
 * decretos que no nombran a nadie; por eso esa etiqueta (`esDesignacion`)
 * decide un nombramiento solo al final, cuando ninguna materia más precisa
 * reconoció el título. Un embajador designado es un nombramiento antes que
 * relaciones exteriores; las condecoraciones van antes que Defensa y
 * Exteriores, que las tramitan, y un ascenso es militar aunque lo etiquete
 * Exteriores. `t` es el título plano, sin «que» inicial;
 * `i`, la etiqueta de institución plana.
 */
const REGLAS_MATERIA: { slug: string; nombre: string; casa: (t: string, i: string) => boolean }[] = [
  {
    slug: "emergencias",
    nombre: "Emergencias y compras de excepción",
    casa: (t) =>
      /declara de emergencia|emergencia nacional|situacion de desastre|articulo 23 de la ley (num\.? )?147-02|procedimientos? de excepcion/.test(t),
  },
  {
    slug: "nombramientos",
    nombre: "Nombramientos y ceses",
    casa: (t) =>
      /^(nombra|designa|confirma|encarga a)\b(?! como organizacion)/.test(t) ||
      /^(deroga|deja sin efecto)\b.{0,240}\b(designo|designaron|nombro|nombraron)\b/.test(t) ||
      // «QUE MODIFICA EL ARTÍCULO 1 DEL DECRETO… DESIGNA A LA SEÑORA…».
      /\b(designa (a|al)|se designa|queda designad[oa]|mantiene la designacion)\b/.test(t),
  },
  {
    slug: "pensiones",
    nombre: "Pensiones",
    casa: (t, i) => /\bpension/.test(t) || i.includes("jubilaciones y pensiones"),
  },
  { slug: "exequatur", nombre: "Exequátur", casa: (t) => t.includes("exequatur") },
  {
    slug: "naturalizaciones",
    nombre: "Naturalizaciones",
    casa: (t) => /naturaliz|nacionalidad dominicana/.test(t),
  },
  { slug: "extradiciones", nombre: "Extradiciones", casa: (t) => t.includes("extradicion") },
  { slug: "expropiaciones", nombre: "Expropiaciones", casa: (t) => t.includes("utilidad publica") },
  {
    slug: "honores",
    nombre: "Condecoraciones y conmemoraciones",
    casa: (t) =>
      /condecora|medalla|orden (del? |al )merito|\bdia nacional|\bdia de\b|como (el )?ano\b|\bano (nacional|de la|del)\b|duelo oficial|\bpremios?\b|\bheroe|aniversario|reconoce a/.test(t),
  },
  {
    slug: "militares",
    nombre: "Militares y policías",
    casa: (t, i) =>
      /ministerio de defensa|policia nacional|armada|ejercito|fuerza aerea/.test(i) ||
      /\basciend|\bascenso|fuerzas armadas/.test(t),
  },
  {
    slug: "exteriores",
    nombre: "Relaciones exteriores",
    casa: (t, i) =>
      i.includes("relaciones exteriores") || /\b(vice)?consul(es|ados?|ar(es)?)?\b|embajad/.test(t),
  },
  {
    slug: "zonas-francas",
    nombre: "Zonas francas",
    casa: (t, i) => i.includes("zonas francas") || /zonas? francas?/.test(t),
  },
  {
    slug: "bienes",
    nombre: "Bienes del Estado",
    casa: (t, i) =>
      i.includes("bienes nacionales") || /\binmueble|\bterreno|\bparcela|designacion catastral/.test(t),
  },
  {
    slug: "cooperativas",
    nombre: "Cooperativas y asociaciones",
    casa: (t) => /incorporacion|cooperativ|personalidad juridica/.test(t),
  },
  {
    slug: "recursos-naturales",
    nombre: "Costas, áreas protegidas y minería",
    casa: (t) => /franja maritima|area protegida|parque nacional|hidrocarburo|miner[ai]/.test(t),
  },
  {
    slug: "reglamentos",
    nombre: "Reglamentos",
    casa: (t) => /^(aprueba|establece|dicta|emite|instituye|modifica)\b.{0,120}\breglamento/.test(t),
  },
  {
    slug: "organizacion",
    nombre: "Organización del Estado",
    casa: (t) =>
      /^(crea|integra|suprime|adscribe|fusiona|reestructura|constituye|conforma|instruye)\b/.test(t) ||
      /^dispone la (fusion|readecuacion|reorganizacion|formalizacion)\b/.test(t) ||
      /fideicomiso|\bcomision\b|\bconsejo\b|\bgabinete\b|\bcomite\b/.test(t),
  },
  {
    // La etiqueta del origen, cuando ninguna materia más precisa reconoció el
    // título: la Consultoría la pone también a decretos que no nombran a nadie
    // —emergencias, aumentos de pensión, unidades nuevas, fe de errata—, y esos
    // ya cayeron arriba o se excluyen aquí.
    slug: "nombramientos",
    nombre: "Nombramientos y ceses",
    casa: (t, i) => i.includes("camara de cuentas") && !t.startsWith("fe de errata"),
  },
];

export const OTROS_ASUNTOS = { slug: "otros", nombre: "Otros asuntos" } as const;

export interface Materia {
  slug: string;
  nombre: string;
}

/** Las materias en el orden de sus reglas, con «Otros asuntos» al final. */
export const MATERIAS: readonly Materia[] = [
  // Una materia puede tener dos reglas (nombramientos: el título y, al final,
  // la etiqueta); se lista una vez, en el sitio de la primera.
  ...REGLAS_MATERIA.filter((r, k) => REGLAS_MATERIA.findIndex((o) => o.slug === r.slug) === k).map(
    ({ slug, nombre }) => ({ slug, nombre }),
  ),
  OTROS_ASUNTOS,
];

const plano = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * La materia por el título y la etiqueta de institución de un decreto: la
 * usa también el registro completo (`lib/decretos.ts`). Las reglas se midieron
 * sobre 2023–2026; en decretos de otras épocas, lo que no reconocen cae en
 * «Otros asuntos».
 */
export function materiaDeDecreto(titulo: string, institucion?: string | null): Materia {
  const t = plano(titulo)
    .replace(/\s+/g, " ")
    .replace(/^(del\s+)?(que|mediante el cual|por el cual|el cual)\s+(se\s+)?/, "");
  const i = plano(institucion);
  const regla = REGLAS_MATERIA.find((r) => r.casa(t, i));
  return regla ? { slug: regla.slug, nombre: regla.nombre } : OTROS_ASUNTOS;
}

/** `slug` válido de materia, o `undefined`. */
export function materiaPorSlug(slug: string | null | undefined): Materia | undefined {
  return MATERIAS.find((m) => m.slug === slug);
}
