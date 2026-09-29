import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import Plegable from "@/components/plegable";
import { formatFecha } from "@/lib/format";
import { enlace } from "@/lib/grafo";
import { formatInt } from "@/lib/nomina";
import { hrefFuncionarios } from "@/app/funcionarios/href";
import {
  ETIQUETA_MOVIMIENTO,
  esActual,
  getFuncionarios,
  personasDeInstitucion,
  quienDirige,
  type Cargo,
  type Persona,
} from "@/lib/funcionarios";

/**
 * «¿Quién la dirige?» en la ficha de institución: el cargo de más arriba que
 * el Directorio de Funcionarios del MAP da hoy en ella y, si el MAP no la
 * tiene, la designación más reciente de un cargo de cabeza en los decretos
 * (`quienDirige` en lib/funcionarios.ts). Debajo, las personas con cargo en la
 * institución, primero las de hoy; si son más de las que caben en una
 * tarjeta, el directorio filtrado por la institución, paginado.
 *
 * Solo aristas verificadas: una persona está aquí porque su fuente la pone en
 * esta institución (el MAP por su nombre, un decreto por el cargo que nombra).
 * Si no hay nadie, no pinta nada.
 */
/** Hasta cuántas personas se despliegan en la tarjeta; más, y se abre el directorio. */
const EN_TARJETA = 30;

export async function QuienDirige({ uc }: { uc: number }) {
  const datos = await getFuncionarios();
  if (!datos) return null;
  const dirige = quienDirige(datos, uc);
  const todas = personasDeInstitucion(datos, uc);
  if (!dirige && todas.length === 0) return null;

  // Una persona una vez, con el cargo que la ata aquí (el de hoy si lo hay).
  const vistas = new Set<string>();
  const filas = todas.filter(({ persona }) => (vistas.has(persona.id) ? false : (vistas.add(persona.id), true)));
  const hoy = filas.filter(({ cargo }) => esActual(cargo)).length;

  return (
    <Card as="section">
      <CardHeader>
        <CardTitle>¿Quién la dirige?</CardTitle>
      </CardHeader>
      {dirige && (
        <div className="relative border-t border-hairline px-4 py-4 sm:px-5">
          <Link
            href={enlace.funcionario(dirige.persona.id)}
            className="text-lg font-semibold leading-snug text-ink estira hover:text-brand-700"
          >
            {dirige.persona.nombre}
          </Link>
          <p className="mt-0.5 text-sm text-ink">{dirige.cargo.titulo}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{segun(dirige.segun, dirige.cargo, datos.fuentes.map.corte)}</p>
        </div>
      )}
      {filas.length > 1 && filas.length <= EN_TARJETA && (
        <Plegable
          etiqueta={`Ver las ${formatInt(filas.length)} personas con cargo en esta institución${hoy ? ` (${formatInt(hoy)} hoy)` : ""}`}
          etiquetaCerrar="Ocultar las personas"
        >
          <ul>
            {filas.map(({ persona, cargo }) => (
              <Fila key={persona.id} persona={persona} cargo={cargo} />
            ))}
          </ul>
        </Plegable>
      )}
      {filas.length > EN_TARJETA && (
        <div className="border-t border-hairline px-4 py-3 sm:px-5">
          <Button asChild variant="secondary">
            <Link href={hrefFuncionarios({ inst: uc })}>
              {`Ver las ${formatInt(filas.length)} personas con cargo en esta institución${hoy ? ` (${formatInt(hoy)} hoy)` : ""}`}
            </Link>
          </Button>
        </div>
      )}
      <p className="border-t border-hairline px-5 py-3 text-xs leading-relaxed text-ink-soft">
        Según el Directorio de Funcionarios del MAP y los decretos de la Consultoría Jurídica. Una persona es
        su nombre tal como lo escriben esas fuentes.
      </p>
    </Card>
  );
}

function segun(fuente: "map" | "decreto" | "organo" | "eleccion", c: Cargo, corteMap: string): string {
  if (fuente === "map") {
    return `En el cargo según el Directorio de Funcionarios del MAP, consultado el ${formatFecha(corteMap)}${
      c.decreto ? `; decreto de designación: ${c.decreto.numero}` : ""
    }.`;
  }
  if (fuente === "decreto" && c.decreto) {
    return `El decreto más reciente que nombra a alguien en ese cargo es el ${c.decreto.numero}${
      c.fecha ? `, del ${formatFecha(c.fecha)}` : ""
    }. El MAP no lista a esta institución: puede haber cambiado desde entonces.`;
  }
  if (fuente === "eleccion") return `Elección municipal de 2024 (JCE), período ${c.periodo ?? "2024-2028"}.`;
  return "Según la página de la propia institución.";
}

function Fila({ persona, cargo }: { persona: Persona; cargo: Cargo }) {
  const hoy = esActual(cargo);
  return (
    <li className="relative border-t border-hairline">
      <div className="flex items-start gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <Link
            href={enlace.funcionario(persona.id)}
            className="text-[15px] font-medium leading-snug text-ink estira hover:text-brand-700"
          >
            {persona.nombre}
          </Link>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
            {cargo.titulo}
            {cargo.fecha && !hoy && ` · ${ETIQUETA_MOVIMIENTO[cargo.movimiento].toLowerCase()} del ${formatFecha(cargo.fecha)}`}
          </p>
        </div>
        {hoy && (
          <Badge forma="etiqueta" variant="valido" className="mt-0.5">
            Hoy
          </Badge>
        )}
      </div>
    </li>
  );
}
