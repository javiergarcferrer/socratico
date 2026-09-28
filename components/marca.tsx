/**
 * La marca: el contrasello.
 *
 * Un contrasello es el sello que valida a otro sello. Este no certifica
 * aprobación —certifica que se preguntó—: el aro lleva el registro y el centro,
 * la «¿», que en español anuncia que la pregunta apenas empieza.
 *
 * Desde el 2026-09-24 (decisión del dueño) la marca es una sola palabra,
 * «socrático», sin «.do»: el acento de la «á» es el sello, la única marca roja.
 * El ícono es la «s» con ese mismo acento. La circular (`Sello`) queda como
 * sello de firma —pie de página, tarjeta social—, con «¿» al centro.
 *
 * Tres formas:
 *  - `Sello` — la circular completa, con el aro de texto. Es la marca de
 *    verdad: pie de página, tarjeta social, momentos de firma.
 *  - `SelloCompacto` — la «s» con su acento en una plaquita: cabecera,
 *    favicon, ícono de la app.
 *  - `Logotipo` — «socrático» en serif, el acento en rojo.
 *
 * Regla invariable: **la marca roja es el sello**: el acento del logotipo y del
 * ícono, y el punto de la «¿» de la circular. Nada más va en rojo.
 */

const PAPEL = "#f7f3ea";
const TINTA = "#171d2e";
const SELLO = "#a63a2a";
/** El azul de la marca y el rojo claro del acento sobre él (`--color-marca*`). */
const MARCA = "#0b2d6b";
const ACENTO_CLARO = "#ff5a5f";

/** La «¿»: el signo de cierre girado media vuelta. */
function Interrogacion({ trazo, punto = SELLO, grosor = 13 }: { trazo: string; punto?: string; grosor?: number }) {
  return (
    <g transform="rotate(180 100 96)">
      <path
        d="M 74 72 C 74 42 126 42 126 72 C 126 94 103 93 103 114"
        fill="none"
        stroke={trazo}
        strokeWidth={grosor}
        strokeLinecap="round"
      />
      <circle cx="103" cy="143" r="9" fill={punto} />
    </g>
  );
}

export function Sello({
  className = "h-20 w-20",
  trazo = TINTA,
  /** El punto de la «¿»: `sello` sobre papel, `marca-acento` sobre azul. */
  punto = trazo === PAPEL ? ACENTO_CLARO : SELLO,
  /** El aro de texto se omite por debajo de ~72px: no se leería. */
  conAro = true,
  id = "aro",
}: {
  className?: string;
  trazo?: string;
  punto?: string;
  conAro?: boolean;
  id?: string;
}) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label="Socrático"
    >
      <circle cx="100" cy="100" r="96" fill="none" stroke={trazo} strokeWidth="3" />
      <circle cx="100" cy="100" r="84" fill="none" stroke={trazo} strokeWidth="1" />
      <circle cx="100" cy="100" r="56" fill="none" stroke={trazo} strokeWidth="1" />
      {conAro && (
        <>
          <defs>
            <path
              id={id}
              d="M 100,100 m 0,-70 a 70,70 0 1,1 0,140 a 70,70 0 1,1 0,-140"
            />
          </defs>
          <text
            fontFamily="var(--font-plex-mono), ui-monospace, monospace"
            fontSize="10"
            letterSpacing="1.3"
            fill={trazo}
          >
            <textPath href={`#${id}`}>
              SOCRÁTICO · PREGÚNTALE AL ESTADO · REPÚBLICA DOMINICANA ·{" "}
            </textPath>
          </text>
        </>
      )}
      <g transform="translate(100 100) scale(0.62) translate(-100 -96)">
        <Interrogacion trazo={trazo} punto={punto} />
      </g>
    </svg>
  );
}

/**
 * El acento del sello sobre una letra: un trazo rojo inclinado, en `em` para
 * que escale con el cuerpo de la letra.
 */
function Acento({ className = "left-[0.24em]", color = "bg-sello-600" }: { className?: string; color?: string }) {
  return (
    <span
      aria-hidden
      className={`absolute top-[0.1em] h-[0.19em] w-[0.07em] origin-bottom rotate-[38deg] rounded-[0.015em] ${color} ${className}`}
    />
  );
}

export function SelloCompacto({
  className = "h-9 w-9",
  fondo = MARCA,
  trazo = PAPEL,
  acento = fondo === PAPEL ? SELLO : ACENTO_CLARO,
}: {
  className?: string;
  fondo?: string;
  trazo?: string;
  /** El rojo del sello; sobre tinta se aclara para no perderse. */
  acento?: string;
}) {
  // La «s» de Instrument Serif con su acento; en SVG para que escale igual a
  // 18 px que a 180. El acento es un trazo inclinado como el del logotipo.
  return (
    <svg viewBox="0 0 96 96" className={className} role="img" aria-label="Socrático">
      <rect width="96" height="96" rx="21" fill={fondo} />
      <text
        x="48"
        y="80"
        textAnchor="middle"
        fontFamily="var(--font-instrument-serif), Georgia, serif"
        fontSize="96"
        fill={trazo}
      >
        s
      </text>
      <rect x="51" y="6" width="6.5" height="19" rx="1.5" fill={acento} transform="rotate(38 54.25 25)" />
    </svg>
  );
}

/**
 * La palabra «socrático». Vive solo sobre el azul `marca` (decisión del dueño,
 * 2026-09-25): sobre papel la marca es la placa del ícono, nunca la palabra.
 * Por eso lleva siempre el acento claro y el color lo pone el fondo que la
 * contiene (`text-canvas` sobre `bg-marca`).
 */
export function Logotipo({ className = "text-[19px]" }: { className?: string }) {
  return (
    <span translate="no" className={`font-marca leading-none tracking-[-0.035em] whitespace-nowrap ${className}`}>
      <span className="sr-only">Socrático</span>
      <span aria-hidden>
        socr
        <span className="relative inline-block">
          a
          <Acento color="bg-marca-acento" />
        </span>
        tico
      </span>
    </span>
  );
}
