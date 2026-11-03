import { SITIO } from "@/lib/sitio";
import { FORMAS } from "@/lib/ontologia";
import { booleano, entero, expandir, fecha, iri, lit, t, type Termino, type Triple } from "@/lib/rdf";
import informe from "@/datos/grafo/informe-shacl.json";

/**
 * El informe de la validación SHACL del grafo (docs/INFRAESTRUCTURA.md §7.2):
 * lo escribe `scripts/validar-grafo.mjs --escribir` en
 * `datos/grafo/informe-shacl.json` y el paso 6c del gate exige que el
 * publicado sea el que sale de validar el árbol que se empuja (misma huella).
 * Aquí se lee y se pasa a `sh:ValidationReport` (`/ontologia.calidad.ttl`).
 * Módulo puro: el JSON viaja en el bundle de la ruta estática.
 */

export interface FormaValidada {
  /** El nombre local de la forma: `Institucion` (`…/def/formas#Institucion`). */
  forma: string;
  clase: string;
  /** Nodos de esa clase, o de una que es un caso de ella, en lo validado. */
  focos: number;
  violaciones: number;
}

export interface InformeShacl {
  conforme: boolean;
  ontologia: string | null;
  /** El día del grafo compilado validado (`datos/grafo/meta.json`). */
  grafo: string;
  /** El día del volcado validado (`public/data/grafo/meta.json`). */
  volcado: string | null;
  /** sha256 de las formas, la ontología, el volcado y la muestra validados. */
  huella: string;
  triples: number;
  nodos: number;
  muestra: Record<"personas" | "decretos" | "iniciativas" | "normas" | "documentos" | "sentencias" | "votaciones", number>;
  fueraDeMuestra: number;
  formas: FormaValidada[];
  sinDeclarar: string[];
  resultados: { donde: string; n: number; ejemplos: string[] }[];
}

export const INFORME: InformeShacl = informe as InformeShacl;

/** El IRI del informe. */
export const IRI_INFORME = `${SITIO}/ontologia.calidad.ttl#informe`;

/** El informe como `sh:ValidationReport`, con una parte por forma (también un informe, con sus nodos validados). */
export function triplesInforme(x: InformeShacl = INFORME): Triple[] {
  const r = IRI_INFORME;
  const blanco = (v: string): Termino => ({ tipo: "blanco", valor: v });
  const m = x.muestra;
  const salida: Triple[] = [
    t(r, "rdf:type", iri("sh:ValidationReport")),
    t(r, "rdf:type", iri("prov:Entity")),
    t(r, "rdfs:label", lit("Informe de validación SHACL del grafo de Socrático.do", "es")),
    t(r, "sh:conforms", booleano(x.conforme)),
    t(r, "dct:date", fecha(x.grafo)),
    t(r, "dct:identifier", lit(`sha256:${x.huella}`)),
    t(r, "dct:conformsTo", iri(`${SITIO}/ontologia.shacl.ttl`)),
    t(r, "prov:used", iri(`${SITIO}/ontologia.ttl`)),
    t(r, "prov:used", iri(`${SITIO}/data/grafo/grafo.nt.gz`)),
    t(
      r,
      "rdfs:comment",
      lit(
        `Validados ${x.triples.toLocaleString("es-DO")} triples de ${x.nodos.toLocaleString("es-DO")} nodos: el volcado entero sin personas naturales` +
          `${x.volcado ? ` (del ${x.volcado})` : ""} y una muestra pedida a /api/grafo de ${m.personas} personas, ${m.decretos} decretos que las nombran, ` +
          `${m.iniciativas} iniciativas y ${m.normas} normas que nombran, ${m.documentos} documentos, ${m.sentencias} sentencias y ${m.votaciones} votaciones, ` +
          `unidos con la ontología ${x.ontologia ?? ""} contra sus formas SHACL. Grafo compilado el ${x.grafo}.`,
        "es",
      ),
    ),
  ];
  for (const f of x.formas) {
    const b = blanco(`forma-${f.forma}`);
    salida.push(
      t(r, "dct:hasPart", b),
      { s: b, p: expandir("rdf:type"), o: iri("sh:ValidationReport") },
      { s: b, p: expandir("sh:conforms"), o: booleano(f.violaciones === 0) },
      { s: b, p: expandir("dct:conformsTo"), o: iri(FORMAS + f.forma) },
      { s: b, p: expandir("void:class"), o: iri(f.clase) },
      { s: b, p: expandir("void:entities"), o: entero(f.focos) },
    );
  }
  x.resultados.forEach((v, i) => {
    const b = blanco(`resultado-${i}`);
    salida.push(
      t(r, "sh:result", b),
      { s: b, p: expandir("rdf:type"), o: iri("sh:ValidationResult") },
      { s: b, p: expandir("sh:resultSeverity"), o: iri("sh:Violation") },
      { s: b, p: expandir("sh:resultMessage"), o: lit(`${v.donde}: ${v.n} casos`, "es") },
    );
  });
  return salida;
}
