"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EstadoVacio } from "@/components/estado-vacio";
import { EsqueletoFilas } from "@/components/esqueleto";
import { formatFecha } from "@/lib/format";
import { enlace } from "@/lib/grafo";
import { formatInt } from "@/lib/nomina";
import type { CaminoVisto, PasoVisto } from "@/lib/explorar-tipos";
import { clicSimple } from "./clic";
import type { PasoRastro } from "./inspector";

/**
 * El camino del lienzo, en lista (docs/INFRAESTRUCTURA.md §7.6): el primero
 * que se encontró y sus alternos con aristas disjuntas (`/api/grafo/camino`), cada salto con
 * su verbo, la ficha que lo dice y su fuente con el corte. El lienzo resalta
 * el elegido; esta lista es lo que se lee, con o sin dibujo.
 */
export function CaminoEnBanco({
  de,
  a,
  visto,
  error,
  elegido,
  onElegir,
  onQuitar,
  hrefNodo,
  onAbrir,
}: {
  de: PasoRastro;
  a: PasoRastro;
  visto: CaminoVisto | undefined;
  error: Error | null;
  elegido: number;
  onElegir: (i: number) => void;
  onQuitar: () => void;
  hrefNodo: (ruta: string) => string;
  onAbrir: (p: PasoRastro) => void;
}) {
  const pasos = visto?.caminos[Math.min(elegido, (visto?.caminos.length ?? 1) - 1)];
  return (
    <Card as="section" aria-labelledby="camino-banco">
      <div className="flex flex-col gap-2 border-b border-hairline px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0" aria-live="polite">
          <CardTitle id="camino-banco">
            ¿Cómo se liga {de.titulo} con {a.titulo}?
          </CardTitle>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
            {!visto
              ? error
                ? "No se pudo buscar el camino."
                : "Buscando desde los dos extremos. La primera vez de un par puede tardar unos segundos."
              : visto.caminos.length
                ? `${visto.caminos.length === 1 ? (visto.exploradasConAlternos >= visto.tope.fichas ? "Un camino; ninguno más sin repetir sus aristas dentro del tope de fichas" : "Un camino, y ninguno más sin repetir sus aristas") : `${visto.caminos.length} caminos sin aristas repetidas entre ellos`}; se abrieron ${formatInt(visto.exploradasConAlternos)} fichas, con un tope de ${formatInt(visto.tope.fichas)} y ${visto.tope.saltos} saltos por camino.`
                : `Sin camino: se abrieron ${formatInt(visto.exploradas)} fichas.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {visto && (
            <Button asChild variant="secondary" size="sm">
              <Link href={visto.pagina} rel="nofollow">
                Abrir su página
              </Link>
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onQuitar}>
            Quitar el camino
          </Button>
        </div>
      </div>

      {!visto ? (
        error ? (
          <EstadoVacio
            variante="caida"
            titulo="El camino no se pudo buscar."
            className="m-4"
            accion={
              <Button asChild variant="secondary">
                <Link href={enlace.caminoGrafo(de.ruta, a.ruta)} rel="nofollow">
                  Buscarlo en su página
                </Link>
              </Button>
            }
          >
            {error.message} El lienzo y el inspector siguen en pie.
          </EstadoVacio>
        ) : (
          <div role="status" aria-busy="true" className="p-4">
            <span className="sr-only">Buscando el camino…</span>
            <EsqueletoFilas n={4} />
          </div>
        )
      ) : !pasos ? (
        <EstadoVacio titulo={visto.motivo === "agotado" ? "No encontramos un camino entre estas dos fichas." : "No encontramos un camino antes del tope."} className="m-4">
          {visto.motivo === "agotado"
            ? "Se abrieron todas las fichas a las que se llega desde ellas y ninguna cadena las une."
            : `No hay una cadena de hasta ${visto.tope.saltos} saltos entre las dos dentro de ${formatInt(visto.tope.fichas)} fichas: prueba desde una ficha intermedia.`}
        </EstadoVacio>
      ) : (
        <>
          {visto.caminos.length > 1 && (
            <div className="border-b border-hairline px-4 py-2">
              <ToggleGroup
                type="single"
                value={String(elegido)}
                onValueChange={(v) => v && onElegir(Number(v))}
                aria-label="El camino que se resalta en el lienzo"
                className="flex-wrap"
              >
                {visto.caminos.map((c, i) => (
                  <ToggleGroupItem key={i} value={String(i)} className="min-h-11 text-xs sm:min-h-9">
                    {i === 0 ? "El primero" : `Alterno ${i}`}
                    <span className="font-mono">{c.length - 1} saltos</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}
          <ol className="px-4 py-3">
            {pasos.map((p, i) => (
              <li key={p.ruta}>
                {p.via && <Salto paso={p} anterior={pasos[i - 1]} />}
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs tabular-nums text-ink-soft" aria-hidden>
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={hrefNodo(p.ruta)}
                      className="inline-flex min-h-11 items-center text-sm font-medium leading-snug text-ink hover:text-brand-700 sm:min-h-0"
                      onClick={(e) => {
                        if (!clicSimple(e)) return;
                        e.preventDefault();
                        onAbrir({ ruta: p.ruta, titulo: p.nombre });
                      }}
                    >
                      {p.nombre}
                    </Link>
                    <p className="text-xs text-ink-soft">{p.clase}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <p className="border-t border-hairline px-4 py-2 text-xs leading-relaxed text-ink-soft">
            Un camino dice que una cadena de registros del Estado toca las dos fichas, no que haya una relación personal entre ellas. Herramienta independiente y no
            oficial.
          </p>
        </>
      )}
    </Card>
  );
}

/** La arista entre dos pasos: lo que dice, quién lo dice y de qué fuente y corte. */
function Salto({ paso, anterior }: { paso: PasoVisto; anterior: PasoVisto }) {
  const a = paso.arista;
  return (
    <p className="border-l-2 border-hairline py-1.5 pl-4 text-xs leading-relaxed text-ink-soft">
      {paso.via}
      {a && (
        <span className="block">
          {a.dice ? `«${a.verbo}», según la ficha de ${a.dice === "anterior" ? anterior.nombre : paso.nombre}` : "Ninguna de las dos fichas la trae como relación"}
          {a.fuente ? ` · ${a.derivada ? "Regla de Socrático" : "Fuente"}: ${a.fuente}` : ""}
          {a.corte ? `, corte del ${formatFecha(a.corte)}` : ""}
        </span>
      )}
    </p>
  );
}
