import Link from "next/link";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import Plegable from "@/components/plegable";
import { formatFecha } from "@/lib/format";
import { enlace } from "@/lib/grafo";
import { getFuncionarios, gobiernoDeProvincia, type Cargo, type Persona } from "@/lib/funcionarios";
import { provinciaDeTexto, type Provincia } from "@/lib/provincias";
import { formatInt } from "@/lib/nomina";
import { hrefFuncionarios } from "@/app/funcionarios/href";

/**
 * «¿Quién gobierna la provincia?» en su ficha: el gobernador (el Directorio de
 * Funcionarios del MAP hoy; si no la lista, el último decreto del Presidente en
 * funciones) y las autoridades locales que la JCE dio por electas en 2024
 * (`gobiernoDeProvincia` en lib/funcionarios.ts). Cada nombre lleva a su
 * ficha. Si la instantánea no tiene a nadie de aquí, no pinta nada.
 */
export async function GobiernoProvincial({ provincia }: { provincia: Provincia }) {
  const datos = await getFuncionarios();
  if (!datos) return null;
  const g = gobiernoDeProvincia(datos, (t) => provinciaDeTexto(t)?.slug === provincia.slug);
  if (!g.gobernador && g.alcaldes.length === 0 && g.directores.length === 0) return null;
  const nombre = provincia.slug === "distrito-nacional" ? "el Distrito Nacional" : provincia.nombre;
  const gob = g.gobernador;

  return (
    <Card as="section">
      <CardHeader>
        <CardTitle>¿Quién gobierna {nombre}?</CardTitle>
      </CardHeader>
      {gob ? (
        <div className="relative border-t border-hairline px-4 py-4 sm:px-5">
          <div className="rotulo text-ink-soft">Gobernación provincial</div>
          <Link
            href={enlace.funcionario(gob.persona.id)}
            className="mt-1 block text-lg font-semibold leading-snug text-ink estira hover:text-brand-700"
          >
            {gob.persona.nombre}
          </Link>
          <p className="mt-0.5 text-sm text-ink">{gob.cargo.titulo}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            {gob.segun === "map"
              ? `En el cargo según el Directorio de Funcionarios del MAP, consultado el ${formatFecha(datos.fuentes.map.corte)}${
                  gob.cargo.decreto ? `; decreto de designación: ${gob.cargo.decreto.numero}` : ""
                }.`
              : `El MAP no lista hoy esta gobernación. El decreto más reciente que la cubre es el ${gob.cargo.decreto?.numero ?? ""}${
                  gob.cargo.fecha ? `, del ${formatFecha(gob.cargo.fecha)}` : ""
                }: puede haber cambiado desde entonces.`}
          </p>
        </div>
      ) : (
        provincia.slug !== "distrito-nacional" && (
          <p className="border-t border-hairline px-4 py-3 text-sm leading-relaxed text-ink-soft sm:px-5">
            Ni el Directorio de Funcionarios del MAP ni los decretos de este gobierno que se leyeron nombran
            gobernador de {provincia.nombre}.
          </p>
        )
      )}
      {g.alcaldes.length > 0 && (
        <>
          <div className="rotulo border-t border-hairline px-4 pt-4 text-ink-soft sm:px-5">
            {g.alcaldes.length === 1 ? "Alcaldía, elección de 2024" : `Alcaldías, elección de 2024 · ${g.alcaldes.length}`}
          </div>
          <ul className="pb-1">
            {g.alcaldes.map(({ persona, cargo }) => (
              <Fila key={`${persona.id}-${cargo.titulo}`} persona={persona} cargo={cargo} />
            ))}
          </ul>
        </>
      )}
      {g.directores.length > 0 && (
        <Plegable
          etiqueta={`Ver ${g.directores.length === 1 ? "la dirección" : `las ${g.directores.length} direcciones`} de distrito municipal`}
          etiquetaCerrar="Ocultar los distritos municipales"
        >
          <ul>
            {g.directores.map(({ persona, cargo }) => (
              <Fila key={`${persona.id}-${cargo.titulo}`} persona={persona} cargo={cargo} />
            ))}
          </ul>
        </Plegable>
      )}
      <p className="border-t border-hairline px-4 py-3 text-xs leading-relaxed text-ink-soft sm:px-5">
        {g.regidores > 0 && (
          <>
            Los concejos municipales suman{" "}
            <span className="font-mono tabular-nums">{formatInt(g.regidores)}</span>{" "}
            {g.regidores === 1 ? "regiduría" : "regidurías"} de la elección de 2024; cada persona tiene su ficha en{" "}
            <Link href={hrefFuncionarios({ poder: "local" })} className="font-medium text-brand-700 hover:underline">
              Funcionarios
            </Link>
            .{" "}
          </>
        )}
        Según el Directorio de Funcionarios del MAP, los decretos de la Consultoría Jurídica y la relación de
        electos de 2024 de la JCE. Los nombres van como los escriben esas fuentes (la JCE, sin tildes).
      </p>
    </Card>
  );
}

function Fila({ persona, cargo }: { persona: Persona; cargo: Cargo }) {
  return (
    <li className="relative border-t border-hairline first:border-t-0">
      <div className="px-4 py-3 sm:px-5">
        <Link
          href={enlace.funcionario(persona.id)}
          className="text-[15px] font-medium leading-snug text-ink estira hover:text-brand-700"
        >
          {persona.nombre}
        </Link>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{cargo.titulo}</p>
      </div>
    </li>
  );
}
