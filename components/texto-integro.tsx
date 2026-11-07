import { describir, iriDe, relacionesDesdeTriples, type Relacion } from "@/lib/grafo-rdf";
import { metaGrafo } from "@/lib/grafo-compilado";
import type { NodoRdf } from "@/lib/grafo";
import { expandir } from "@/lib/rdf";
import { formatFecha } from "@/lib/format";
import { Card, CardTitle } from "@/components/ui/card";
import { Aristas } from "@/components/aristas";

/**
 * Lo que el grafo sabe por el texto íntegro de las sentencias, las leyes y los
 * documentos (grafo con nombre `texto`, `scripts/build-textos.mjs`,
 * docs/INFRAESTRUCTURA.md §5.12), en la ficha de quien lo recibe o lo dice.
 * Componentes de servidor: leen el nodo del grafo compilado, como la ficha de
 * una sentencia; si el nodo no está o su texto no dice nada, no pintan nada.
 */

const P = { vecesCitada: expandir("soc:vecesCitada"), paginas: expandir("soc:paginas") };

async function leer(n: NodoRdf) {
  const [d, meta] = await Promise.all([describir(n), metaGrafo()]);
  if (!d) return null;
  const s = iriDe(n);
  const literal = (p: string) => d.triples.find((x) => x.s.valor === s && x.p === p)?.o.valor ?? null;
  return {
    relaciones: relacionesDesdeTriples(d.triples, s, d.grafos).filter((r) => r.grafo === "texto"),
    vecesCitada: Number(literal(P.vecesCitada) ?? 0),
    paginas: Number(literal(P.paginas) ?? 0),
    nota: d.nota ?? null,
    corte: meta?.grafos.find((g) => g.clave === "texto")?.corte ?? null,
  };
}

const Fuente = ({ corte }: { corte: string | null }) => (
  <p className="mt-3 text-xs leading-relaxed text-ink-soft">
    Leído con reglas fijas sobre la redacción oficial del texto íntegro de cada archivo{corte ? `, en la lectura del ${formatFecha(corte)}` : ""}. El
    texto oficial manda: ábrelo antes de citar.
  </p>
);

/**
 * En la ficha de una ley, un decreto o una resolución: lo que cambia su texto
 * (artículo por artículo, si es una ley) y quién la declara, la cambia o la
 * nombra en el suyo.
 */
export async function CitasDelTexto({ nodo }: { nodo: NodoRdf }) {
  const x = await leer(nodo);
  if (!x || !x.relaciones.length) return null;
  const r = x.relaciones;
  const cambia = r.filter((a) => a.grupo === "normas" && (a.verbo === "Deroga" || a.verbo === "Modifica"));
  const cita = r.filter((a) => a.grupo === "normas" && a.verbo === "Cita");
  const declaran = r.filter((a) => a.verbo.includes("declara"));
  const laCambian = r.filter((a) => a.grupo === "normas" && /^L[ao] (deroga|modifica)$/.test(a.verbo));
  const laNombran = r.filter((a) => !declaran.includes(a) && !laCambian.includes(a) && (/^L[ao] cita$/.test(a.verbo) || a.verbo.startsWith("Un documento") || a.verbo.startsWith("Una sentencia")));
  const bloque = (titulo: string, lista: Relacion[], cuantas: string) =>
    lista.length > 0 && (
      <div className="mt-4">
        <p className="text-sm font-bold text-ink">{titulo}</p>
        <Aristas lista={lista} visibles={6} cuantas={cuantas} />
      </div>
    );
  return (
    <Card as="section" className="mt-5 p-5 sm:p-6">
      <CardTitle>¿Qué dice su texto y quién la nombra en el suyo?</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        {x.paginas > 0 ? `Su texto (${x.paginas.toLocaleString("es-DO")} páginas) se leyó entero. ` : ""}
        {x.vecesCitada > 0
          ? `La nombra el texto de ${x.vecesCitada.toLocaleString("es-DO")} ${x.vecesCitada === 1 ? "sentencia, ley o documento" : "sentencias, leyes y documentos"}.`
          : ""}
        {x.nota ? ` ${x.nota}` : ""}
      </p>
      {bloque("Lo que el tribunal declara sobre ella", declaran, "sentencias")}
      {bloque("Lo que su texto deroga o modifica", cambia, "normas")}
      {bloque("Quién la deroga o la modifica en su texto", laCambian, "leyes")}
      {bloque("Lo que su texto cita", cita, "normas")}
      {bloque("Quién la nombra en su texto", laNombran, "textos")}
      <Fuente corte={x.corte} />
    </Card>
  );
}

/** En la ficha de un proceso, una obra o una empresa: los documentos de las instituciones cuyo texto lo nombra. */
export async function DocumentosQueLoNombran({ nodo, className }: { nodo: NodoRdf; className?: string }) {
  const x = await leer(nodo);
  const lista = x?.relaciones.filter((a) => a.verbo === "Un documento lo nombra en su texto") ?? [];
  if (!x || !lista.length) return null;
  const que = nodo.tipo === "proceso" ? "su código" : nodo.tipo === "obra" ? "su número SNIP" : "su RNC";
  return (
    <Card as="section" className={className ?? "p-5 sm:p-6"}>
      <CardTitle>¿Qué documentos lo nombran?</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Los que las instituciones publican en sus portales y nombran {que} en su texto. {x.nota ?? ""}
      </p>
      <Aristas lista={lista} visibles={5} cuantas="documentos" />
      <Fuente corte={x.corte} />
    </Card>
  );
}

/** En la ficha de un documento: lo que nombra su texto (normas, procesos, obras, empresas proveedoras) y cuántas páginas leímos. */
export async function LoQueNombraElDocumento({ nodo }: { nodo: NodoRdf }) {
  const x = await leer(nodo);
  if (!x || (!x.relaciones.length && !x.paginas)) return null;
  const normas = x.relaciones.filter((a) => a.grupo === "normas");
  const procesos = x.relaciones.filter((a) => a.grupo === "procesos");
  const obras = x.relaciones.filter((a) => a.grupo === "obras");
  const empresas = x.relaciones.filter((a) => a.grupo === "entidades");
  const bloque = (titulo: string, lista: Relacion[], cuantas: string) =>
    lista.length > 0 && (
      <div className="mt-4">
        <p className="text-sm font-bold text-ink">{titulo}</p>
        <Aristas lista={lista} visibles={6} cuantas={cuantas} />
      </div>
    );
  return (
    <Card as="section" className="p-5 sm:p-6">
      <CardTitle>¿Qué nombra su texto?</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        {x.paginas > 0 ? `Se leyeron sus ${x.paginas.toLocaleString("es-DO")} ${x.paginas === 1 ? "página" : "páginas"}. ` : ""}
        Una norma, por su número; un proceso de compra, por su código; una obra, por su SNIP; una empresa, por su RNC escrito junto a su sigla o
        en la columna «RNC» de una planilla, y solo si está inscrita como proveedora del Estado. Un documento no cambia una norma: solo la nombra.
      </p>
      {!x.relaciones.length && <p className="mt-3 text-sm text-ink-soft">Su texto no nombra ninguna norma, proceso, obra ni empresa proveedora que el grafo tenga.</p>}
      {bloque("Normas", normas, "normas")}
      {bloque("Procesos de compra", procesos, "procesos")}
      {bloque("Obras", obras, "obras")}
      {bloque("Empresas proveedoras del Estado", empresas, "empresas")}
      <Fuente corte={x.corte} />
    </Card>
  );
}
