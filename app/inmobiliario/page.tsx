import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { BuscadorUrl } from "@/components/buscador-url";
import { EstadoVacio } from "@/components/estado-vacio";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CONSULTA_PUBLICA,
  consultarExpediente,
  validarExpediente,
  type ConsultaExpediente,
  type Expediente,
} from "@/lib/inmobiliario";
import { formatFecha, SIN_DATO } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { recortar } from "@/lib/raiz";

const METADATA: Metadata = {
  alternates: { canonical: "/inmobiliario" },
  title: "Expedientes del Registro Inmobiliario",
  description:
    "En qué va un trámite del Registro Inmobiliario, por el número exacto de su expediente: en qué órgano está, cuándo se solicitó, su resultado y su estado, según la consulta pública del Registro.",
};

type Props = { searchParams: Promise<{ q?: string }> };

/** Con un número la página es la consulta de un trámite ajeno: no se indexa ni se siguen sus enlaces. */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  return q?.trim() ? { ...METADATA, robots: { index: false, follow: false } } : METADATA;
}

/**
 * ¿En qué va un expediente del Registro Inmobiliario? — su consulta pública de
 * expedientes (`lib/inmobiliario.ts`), en vivo, por el número exacto que
 * escribe el lector. El número vive en la URL (`?q=`, el de `BuscadorUrl`).
 *
 * ⚠️ La forma de una respuesta con datos no se ha visto (docs/INFRAESTRUCTURA.md
 * §5.6): las siete columnas salen del JS de la página del Registro, y la
 * página lo dice junto a la tabla.
 */
export default async function InmobiliarioPage({ searchParams }: Props) {
  const { q: crudo } = await searchParams;
  const q = recortar(crudo, 60).trim();
  const validado = q ? validarExpediente(q) : null;
  const error = validado && "error" in validado ? validado.error : null;
  const numero = validado && "numero" in validado ? validado.numero : null;
  const consulta = numero ? await consultarExpediente(numero) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          ¿En qué va un expediente del Registro Inmobiliario?
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          Con el número del expediente, la consulta pública del Registro Inmobiliario dice en qué órgano está el
          trámite, cuándo se solicitó, qué resultado tiene y en qué estado va. Se consulta en vivo y solo por el
          número exacto.
        </p>
      </header>

      <Suspense>
        <BuscadorUrl
          etiqueta="Buscar un expediente del Registro Inmobiliario por su número"
          placeholder="Número de expediente"
          ayuda="Solo por el número exacto del expediente, de al menos 5 caracteres, tal como te lo dio el Registro. No se busca por nombre, cédula, matrícula ni parcela. Se consulta en vivo el Registro Inmobiliario."
          error={error}
        />
      </Suspense>

      {!numero ? (
        <DondeEstaElNumero />
      ) : !consulta ? (
        <EstadoVacio
          variante="caida"
          titulo="No pudimos consultar el Registro Inmobiliario"
          accion={
            <Button asChild variant="secondary">
              <a href={CONSULTA_PUBLICA} target="_blank" rel="noopener noreferrer">
                Consultar en la página del Registro
              </a>
            </Button>
          }
        >
          La consulta de expedientes del Registro no contestó a tiempo o devolvió otra cosa. No es que el
          expediente no exista: es que no pudimos mirar. El resto de la plataforma sigue en pie.
        </EstadoVacio>
      ) : consulta.expedientes.length === 0 ? (
        <EstadoVacio titulo={`El Registro no tiene un expediente con el número «${consulta.numero}»`}>
          La consulta es exacta: revisa que el número esté completo, con sus guiones o barras, tal como te lo
          dio el Registro.
        </EstadoVacio>
      ) : (
        <Resultado consulta={consulta} />
      )}

      <p className="px-1 text-xs leading-relaxed text-ink-soft">
        Fuente:{" "}
        <a href={CONSULTA_PUBLICA} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
          consulta de expedientes del Registro Inmobiliario
        </a>
        {consulta
          ? `, consultada el ${formatFecha(consulta.consultado, true)} y guardada una hora`
          : ", consultada en vivo y guardada una hora por número"}
        . Se pregunta solo por el número exacto que escribes y esta página no se ofrece a los buscadores. El
        parcelario (con reCAPTCHA) y las certificaciones de estado jurídico (con cuenta y pago) no se
        consultan. Ver{" "}
        <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
          el estado de las fuentes
        </Link>
        .
      </p>
    </div>
  );
}

/** Antes de buscar, o con un texto que no vale: qué número es y dónde está. */
function DondeEstaElNumero() {
  return (
    <Card as="section">
      <CardHeader>
        <CardTitle>¿Qué número es?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-[15px] leading-relaxed text-ink-soft sm:text-sm">
        <p>
          El que el Registro Inmobiliario le da a un trámite cuando se deposita: una transferencia, una
          hipoteca, una mensura. Suele venir en el recibo del depósito. Escríbelo completo, tal como aparece.
        </p>
        <p>
          La consulta dice lo mismo que la página del Registro: la fecha de la solicitud, el órgano, el número
          del expediente y el original, el resultado, el estado y el trámite. No dice quién es el dueño ni
          muestra el título.
        </p>
      </CardContent>
    </Card>
  );
}

/** Una fecha ISO del Registro se escribe en llano; cualquier otra forma, como llegó. */
function fecha(v: string | null): string {
  if (!v) return SIN_DATO;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatFecha(v) : v;
}

const CAMPOS: { clave: keyof Expediente; etiqueta: string }[] = [
  { clave: "fechaSolicitud", etiqueta: "Solicitado" },
  { clave: "organo", etiqueta: "Órgano" },
  { clave: "numeroExpediente", etiqueta: "Expediente" },
  { clave: "numeroOriginal", etiqueta: "Número original" },
  { clave: "tramite", etiqueta: "Trámite" },
  { clave: "resultado", etiqueta: "Resultado" },
  { clave: "estado", etiqueta: "Estado" },
];

function valor(e: Expediente, clave: keyof Expediente): string {
  return clave === "fechaSolicitud" ? fecha(e.fechaSolicitud) : (e[clave] ?? SIN_DATO);
}

function Resultado({ consulta }: { consulta: ConsultaExpediente }) {
  const n = consulta.expedientes.length;
  return (
    <Card as="section" className="overflow-hidden" aria-labelledby="expediente-titulo">
      <CardHeader>
        <CardTitle id="expediente-titulo">Lo que publica el Registro</CardTitle>
        <CardAction className="font-mono tabular-nums">{consulta.numero}</CardAction>
      </CardHeader>
      <p className="px-5 pt-3 text-xs leading-relaxed text-ink-soft">
        {n === 1 ? "Una fila" : `${formatInt(n)} filas`} para este número, tal como las da el Registro. Las
        columnas son las de su propia página; si algo sale como «{SIN_DATO}», compáralo allí.
      </p>

      {/* En el teléfono, una ficha por fila; desde `sm`, el cuadro (docs/INFRAESTRUCTURA.md §11). */}
      <ol className="mt-2 divide-y divide-hairline border-t border-hairline sm:hidden">
        {consulta.expedientes.map((e, i) => (
          <li key={i} className="px-5 py-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {CAMPOS.map(({ clave, etiqueta }) => (
                <div key={clave} className="contents">
                  <dt className="text-xs leading-5 text-ink-soft">{etiqueta}</dt>
                  <dd className="min-w-0 leading-5 text-ink [overflow-wrap:anywhere]">{valor(e, clave)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>

      <Table className="mt-2 hidden sm:table">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Solicitado</TableHead>
            <TableHead>Órgano</TableHead>
            <TableHead>Expediente</TableHead>
            <TableHead>Trámite</TableHead>
            <TableHead className="pr-5">Resultado y estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {consulta.expedientes.map((e, i) => (
            <TableRow key={i}>
              <TableCell className="pl-5 align-top font-mono text-xs tabular-nums text-ink">{fecha(e.fechaSolicitud)}</TableCell>
              <TableCell className="min-w-40 align-top text-sm leading-snug text-ink">{e.organo ?? SIN_DATO}</TableCell>
              <TableCell className="align-top break-words font-mono text-xs tabular-nums text-ink">
                {e.numeroExpediente ?? SIN_DATO}
                {e.numeroOriginal && (
                  <span className="mt-0.5 block font-sans text-ink-soft">Original: {e.numeroOriginal}</span>
                )}
              </TableCell>
              <TableCell className="min-w-40 align-top text-sm leading-snug text-ink">{e.tramite ?? SIN_DATO}</TableCell>
              <TableCell className="pr-5 align-top text-sm leading-snug text-ink">
                {e.resultado ?? SIN_DATO}
                <span className="mt-0.5 block text-xs text-ink-soft">{e.estado ?? SIN_DATO}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
