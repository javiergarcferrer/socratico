import { formatFecha, hace, SIN_DATO } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * La antigüedad de algo, calculada aquí y no en la cabeza del lector.
 *
 * `docs/INFRAESTRUCTURA.md` §11 lo pide por su nombre: «una fecha absoluta obliga a
 * restar; en una lista de veinte, nadie resta y se deja de comparar». La
 * plataforma tenía `hace()` desde hace tiempo y lo usaba **solo en las
 * fichas** —donde hay una fecha y sobra el espacio para pensarla—; las filas
 * de listado, que son justo donde se compara, seguían imprimiendo «Creada 3
 * sept 2026» veinte veces seguidas. Veinte restas que nadie hace.
 *
 * Ninguna se pierde: la fecha exacta sigue estando en el `title` y en el
 * atributo `dateTime`, y la ficha la muestra entera. Se cambia cuál de las dos
 * ocupa el sitio que el ojo barre.
 *
 * Además es el primer `<time>` semántico de la plataforma: hasta ahora todas
 * las fechas eran `<span>`, invisibles como fechas para un lector de pantalla
 * o para cualquier cosa que lea el HTML.
 */
export default function Antiguedad({
  iso,
  prefijo,
  className,
}: {
  /** La fecha del origen. `null`/`undefined` ⇒ no se pinta nada. */
  iso: string | null | undefined;
  /** «Depositada», «Publicado», «Creada»… Concuerda con el sustantivo. */
  prefijo?: string;
  className?: string;
}) {
  if (!iso) return null;

  const exacta = formatFecha(iso);
  if (exacta === SIN_DATO) return null;

  /*
    `hace()` devuelve `null` para una fecha futura —un plazo, no una
    antigüedad—. Ahí la relativa mentiría («hace -3 días»), así que manda la
    absoluta: mejor la fecha desnuda que un cálculo que no aplica.
  */
  const relativa = hace(iso);

  return (
    <time
      dateTime={iso}
      title={exacta}
      suppressHydrationWarning
      className={cn("tabular-nums", className)}
    >
      {prefijo ? `${prefijo} ${relativa ?? exacta}` : (relativa ?? exacta)}
    </time>
  );
}
