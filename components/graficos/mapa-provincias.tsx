import Link from "next/link";
import { cn } from "@/lib/cn";
import type { GeoMapa } from "@/lib/mapa";
import { Leyenda } from "./leyenda";
import { SECUENCIAL, SECUENCIAL_RELLENO } from "./paleta";
import { formatearValor, type FormatoValor } from "./formato";

/**
 * El mapa de provincias — **dónde** pasa algo: cuántas obras, cuánto dinero,
 * qué provincia es la elegida. Un coropleta sobre los límites oficiales de la
 * ONE (`lib/mapa.ts`), pintado en el servidor como SVG: sin teselas, sin clave
 * y sin librería.
 *
 * Reglas que trae puestas (docs/IDENTIDAD.md §Gráficos):
 *  - color **ordinal** en tramos de la secuencial, pasos 3 a 6 (los que el
 *    validador deja pasar como tramos); el paso 1 es «ninguno» y casi se funde
 *    con el papel a propósito;
 *  - tramos por cuantiles de los valores mayores que cero, con el rango de
 *    cada uno escrito en la leyenda: el color nunca es la única lectura;
 *  - 1.5 px de papel entre provincias; la elegida, encima de todas, con halo
 *    de papel y filete de tinta;
 *  - cada provincia es su enlace (regla 6: cada marca lleva a su nodo), con
 *    `title` para el puntero y `aria-label` con la cifra para el lector;
 *  - el Distrito Nacional (92 km², un punto a esta escala) lleva además un
 *    círculo que se puede tocar.
 *
 * Con `ubicar`, el mapa no pinta una cifra: dice **dónde está** la
 * provincia elegida (paso 6) entre las demás (paso 2), y sirve de índice
 * para llegar a cada ficha con el puntero. Sin leyenda, porque no hay escala
 * que leer, y fuera del tabulador y del lector de pantalla: repetiría 32
 * paradas antes del contenido, y la página ya tiene la lista o la ruta.
 *
 * La atribución de los límites (ONE, CC BY-IGO) la escribe el mapa mismo:
 * la licencia la exige dondequiera que se pinte.
 *
 * El mapa no sustituye a la lista: la página conserva la lista de provincias
 * con su cifra, que es la tabla equivalente y el camino del teléfono.
 */
export interface ZonaMapa {
  /** Slug de `lib/provincias.ts`. */
  slug: string;
  valor: number;
  href?: string;
}

/** Superficie bajo la cual una provincia se dibuja además como punto tocable. */
const KM2_PUNTO = 200;

export function MapaProvincias({
  geo,
  zonas,
  actual,
  etiqueta,
  unidad = "",
  formato = "entero",
  tramos: nTramos = 4,
  ubicar = false,
  className,
}: {
  geo: GeoMapa;
  zonas: ZonaMapa[];
  /** Slug de la provincia elegida: filete de tinta y `aria-current`. */
  actual?: string | null;
  /** Qué pinta el mapa, para el lector de pantalla: «Obras por provincia». */
  etiqueta: string;
  /** Lo que se cuenta, en plural: «obras». Va en la etiqueta de cada provincia. */
  unidad?: string;
  formato?: FormatoValor;
  tramos?: number;
  /** Mapa de ubicación: sin cifra ni leyenda, la elegida en tinta de firma. */
  ubicar?: boolean;
  className?: string;
}) {
  const porSlug = new Map(zonas.map((z) => [z.slug, z]));
  const positivos = zonas.map((z) => z.valor).filter((v) => v > 0).sort((a, b) => a - b);

  // Cortes por cuantiles; un empate nunca se parte entre dos tramos.
  const cortes: number[] = [];
  for (let j = 1; j < nTramos; j++) {
    const c = positivos[Math.floor((j * positivos.length) / nTramos)];
    if (c !== undefined && c > (cortes.at(-1) ?? 0) && c > positivos[0]) cortes.push(c);
  }
  const tramoDe = (v: number) => cortes.filter((c) => v >= c).length;
  const nUsados = cortes.length + 1;
  // Los tramos usados, siempre terminando en el paso 6: tres tramos son 4, 5 y 6.
  const paso = (t: number) => 5 - (nUsados - 1) + t;
  const rango = Array.from({ length: nUsados }, (_, t) => {
    const del = positivos.filter((v) => tramoDe(v) === t);
    return { t, min: del[0], max: del.at(-1) };
  });

  const [x0, y0, ancho, alto] = geo.viewBox;
  const elegida = geo.provincias.find((p) => p.slug === actual);
  const ceros = zonas.some((z) => z.valor <= 0) || geo.provincias.some((p) => !porSlug.has(p.slug));

  return (
    <figure className={cn("space-y-3", className)}>
      <svg
        viewBox={`${x0} ${y0} ${ancho} ${alto}`}
        role={ubicar ? undefined : "group"}
        aria-label={ubicar ? undefined : etiqueta}
        aria-hidden={ubicar || undefined}
        className="h-auto w-full"
      >
        {geo.provincias.map((p) => {
          const z = porSlug.get(p.slug);
          const valor = z?.valor ?? 0;
          const relleno = ubicar
            ? SECUENCIAL_RELLENO[p.slug === actual ? 5 : 1]
            : valor > 0
              ? SECUENCIAL_RELLENO[paso(tramoDe(valor))]
              : SECUENCIAL_RELLENO[0];
          const texto = ubicar ? p.nombre : `${p.nombre}: ${formatearValor(valor, formato)} ${unidad}`;
          const forma = (
            <>
              <title>{texto}</title>
              <path
                d={p.d}
                fillRule="evenodd"
                vectorEffect="non-scaling-stroke"
                className={cn(
                  relleno,
                  "stroke-canvas [stroke-width:1.5] transition-[stroke] duration-(--dur-toque) ease-firma",
                  z?.href && "group-hover:stroke-ink group-focus-visible:stroke-ink",
                  z?.href && ubicar && p.slug !== actual && "group-hover:fill-grafico-sec-3 group-focus-visible:fill-grafico-sec-3",
                )}
              />
              {p.km2 < KM2_PUNTO && (
                <circle
                  cx={p.centro[0]}
                  cy={p.centro[1]}
                  r={11}
                  vectorEffect="non-scaling-stroke"
                  className={cn(relleno, "stroke-ink [stroke-width:1.5]")}
                />
              )}
            </>
          );
          return z?.href ? (
            <Link
              key={p.slug}
              href={z.href}
              aria-label={texto}
              aria-current={p.slug === actual ? "page" : undefined}
              tabIndex={ubicar ? -1 : undefined}
              className="group outline-none"
            >
              {forma}
            </Link>
          ) : (
            <g key={p.slug}>{forma}</g>
          );
        })}
        {elegida && !ubicar && (
          // Encima de todas: un halo de papel y el filete de tinta, que se ven
          // igual sobre el tramo más claro que sobre el más oscuro.
          <g aria-hidden className="pointer-events-none fill-none">
            <path d={elegida.d} vectorEffect="non-scaling-stroke" className="stroke-canvas [stroke-width:6]" />
            <path d={elegida.d} vectorEffect="non-scaling-stroke" className="stroke-ink [stroke-width:2.5]" />
            {elegida.km2 < KM2_PUNTO && (
              <circle
                cx={elegida.centro[0]}
                cy={elegida.centro[1]}
                r={16}
                vectorEffect="non-scaling-stroke"
                className="stroke-ink [stroke-width:2.5]"
              />
            )}
          </g>
        )}
      </svg>
      <figcaption className="space-y-1.5">
        {!ubicar && (
          <Leyenda
            entradas={[
              ...(ceros ? [{ clave: "cero", etiqueta: formatearValor(0, formato), clase: SECUENCIAL[0] }] : []),
              ...rango.map(({ t, min, max }) => ({
                clave: String(t),
                etiqueta:
                  min === max
                    ? formatearValor(min ?? 0, formato)
                    : `${formatearValor(min ?? 0, formato)} a ${formatearValor(max ?? 0, formato)}`,
                clase: SECUENCIAL[paso(t)],
              })),
            ]}
          />
        )}
        <p className="text-xs text-ink-soft">
          Límites:{" "}
          <a href={geo.fuente} target="_blank" rel="noopener noreferrer" className="hover:text-brand-700 hover:underline">
            Oficina Nacional de Estadística
          </a>{" "}
          ({geo.licencia}).
        </p>
      </figcaption>
    </figure>
  );
}
