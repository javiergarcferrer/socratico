import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import Antiguedad from "@/components/antiguedad";
import Plegable from "@/components/plegable";
import { Termino } from "@/components/termino";
import { IconExternal } from "@/components/icons";
import { formatFecha } from "@/lib/format";
import { enlace } from "@/lib/grafo";
import {
  declaracionesDe,
  declaracionesDeInstitucion,
  getDeclaraciones,
  institucionesQuePublican,
} from "@/lib/declaraciones";
import type { Persona } from "@/lib/funcionarios";

/**
 * «¿Dónde está su declaración jurada de patrimonio?» en la ficha de una
 * persona: las que publica la institución donde tiene o tuvo el cargo (atadas
 * sin dudas por `scripts/build-declaraciones.py`) y, para quien ocupa o
 * ocupó un cargo obligado, la consulta pública de la Cámara de Cuentas, que
 * es el registro completo y que la plataforma no lee (exige un CAPTCHA).
 *
 * Se enlaza, no se copia ni se transcribe: el documento vive en el portal de
 * quien lo publica (decisión del dueño, 2026-09-30, docs/DECISIONES.md).
 */
export async function DeclaracionJurada({ persona }: { persona: Persona }) {
  const [datos, propias] = await Promise.all([getDeclaraciones(), declaracionesDe(persona.id)]);
  const obligado = persona.pep.length > 0;
  if (!obligado && propias.length === 0) return null;

  return (
    <Card as="section" className="mt-5" aria-labelledby="declaracion-jurada">
      <CardHeader>
        <CardTitle id="declaracion-jurada">¿Dónde está su declaración jurada de patrimonio?</CardTitle>
        {propias.length > 0 && <CardAction className="font-mono tabular-nums">{propias.length}</CardAction>}
      </CardHeader>

      {propias.length > 0 && (
        <ul>
          {propias.map((d) => (
            <li key={d.url} className="relative border-t border-hairline first:border-t-0">
              <div className="px-4 py-3 sm:px-5">
                <a
                  href={d.url}
                  rel="noopener"
                  className="flex items-start gap-1.5 text-[15px] font-medium leading-snug text-ink [overflow-wrap:anywhere] estira hover:text-brand-700"
                >
                  <span>
                    {d.titulo}
                    <span className="sr-only"> (PDF en el portal de la institución)</span>
                  </span>
                  <IconExternal className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-soft" />
                </a>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                  La publica {d.institucion}
                  {d.fecha && (
                    <>
                      {" · subida "}
                      <Antiguedad iso={d.fecha} />
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {obligado && (
        <div className="border-t border-hairline px-5 py-4">
          <p className="text-sm leading-relaxed text-ink">
            La Cámara de Cuentas recibe la <Termino clave="declaracionJurada">declaración jurada</Termino> de
            quien ocupa un cargo obligado por la Ley 311-14 y la publica en su consulta pública, que busca por
            nombre. Esa consulta pide resolver un CAPTCHA en cada búsqueda, así que la plataforma no la lee por
            ti: ábrela y escribe «{persona.nombre}».
          </p>
          <Button asChild variant="secondary" className="mt-3">
            <a href={datos?.camara ?? "https://consultadjp.camaradecuentas.gob.do/"} rel="noopener">
              Buscarla en la Cámara de Cuentas
              <IconExternal className="h-4 w-4" />
            </a>
          </Button>
        </div>
      )}

      <p className="border-t border-hairline px-5 py-3 text-xs leading-relaxed text-ink-soft">
        {propias.length > 0
          ? "Cada enlace abre el PDF en el portal de la institución que lo publica: la plataforma no lo copia ni lo transcribe. Se ata a esta ficha porque su nombre y la institución coinciden sin dudas."
          : datos
            ? `Ninguna de las ${institucionesQuePublican(datos)} instituciones que publican declaraciones en los portales que lee la plataforma tiene una con su nombre.`
            : "La lista de declaraciones que publican las instituciones no está disponible ahora mismo."}
        {datos && ` Revisado el ${formatFecha(datos.generado)}.`}
      </p>
    </Card>
  );
}

/**
 * «¿Qué declaraciones juradas publica?» en la ficha de una institución: las
 * de sus directivos que sube a su propio portal, cada una con su enlace y, si
 * se ató, con la ficha de quien declara. No pinta nada si no publica ninguna
 * en lo que la plataforma lee.
 */
export async function DeclaracionesPublicadas({ id }: { id: number }) {
  const [datos, lista] = await Promise.all([getDeclaraciones(), declaracionesDeInstitucion(id)]);
  if (!datos || lista.length === 0) return null;
  const filas = (xs: typeof lista) => (
    <ul>
      {xs.map((d) => (
        <li key={d.url} className="border-t border-hairline first:border-t-0">
          <div className="px-4 py-3 sm:px-5">
            <a
              href={d.url}
              rel="noopener"
              className="inline-flex items-start gap-1.5 text-[15px] leading-snug text-ink [overflow-wrap:anywhere] hover:text-brand-700"
            >
              <span>
                {d.titulo}
                <span className="sr-only"> (PDF en el portal de la institución)</span>
              </span>
              <IconExternal className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-soft" />
            </a>
            <p className="mt-0.5 text-xs text-ink-soft">
              {d.fecha ? (
                <>
                  Subida <Antiguedad iso={d.fecha} />
                </>
              ) : (
                "Sin fecha de subida"
              )}
              {d.personaId && (
                <>
                  {" · "}
                  <Link href={enlace.funcionario(d.personaId)} className="font-medium text-brand-700 hover:underline">
                    Su ficha
                  </Link>
                </>
              )}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
  return (
    <Card as="section" aria-labelledby="declaraciones-publicadas">
      <CardHeader>
        <CardTitle id="declaraciones-publicadas">¿Qué declaraciones juradas publica?</CardTitle>
        <CardAction className="font-mono tabular-nums">{lista.length}</CardAction>
      </CardHeader>
      {lista.length <= 5 ? (
        filas(lista)
      ) : (
        <Plegable
          resumen={filas(lista.slice(0, 5))}
          etiqueta={`Ver las ${lista.length} declaraciones`}
          etiquetaCerrar="Ocultar las más viejas"
        >
          {filas(lista.slice(5))}
        </Plegable>
      )}
      <p className="border-t border-hairline px-5 py-3 text-xs leading-relaxed text-ink-soft">
        Las declaraciones juradas de patrimonio (Ley 311-14) de sus directivos, tal como las sube a su portal: el
        título es el suyo y la fecha es la de subida. La plataforma enlaza el PDF, no lo copia. El registro completo
        lo tiene la Cámara de Cuentas. Revisado el {formatFecha(datos.generado)}.
      </p>
    </Card>
  );
}
