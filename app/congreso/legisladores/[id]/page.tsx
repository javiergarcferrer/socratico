import Link from "next/link";
import { Suspense, cache } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EstadoVacio } from "@/components/estado-vacio";
import { Esqueleto } from "@/components/esqueleto";
import { Ruta } from "@/components/ruta";
import { getLegislador } from "@/lib/congreso";
import { CORTES, Propuestas, Votos, type Corte } from "@/components/congreso/legislador";
import { hrefDirectorio } from "../href";
import { enlace } from "@/lib/grafo";
import { ConectadoCon } from "@/components/conectado-con";
import { provinciaDeTexto } from "@/lib/provincias";
import { filtrarObras, getObras } from "@/lib/obras";
import Conversacion from "@/components/espacios/conversacion";
import { personaDeLegislador } from "@/lib/funcionarios";

export const revalidate = 3600;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ver?: string }>;
};

const cargarLegislador = cache((id: number) => getLegislador(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const l = await cargarLegislador(Number(id));
  if (l === "caida") return { title: "Legislador" };
  if (l === "inexistente") return { title: "Legislador no encontrado" };
  return {
    title: l.nombre,
    alternates: { canonical: enlace.legislador(id) },
    description: `${[l.funcion, l.provincia, l.partidoSiglas].filter(Boolean).join(" · ")}: qué propuso, cuánto prosperó y cómo votó.`,
  };
}

export default async function LegisladorPage({ params, searchParams }: Props) {
  const { id: idParam } = await params;
  const { ver } = await searchParams;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();
  // Una persona, un nodo (docs/INFRAESTRUCTURA.md §7.4): el legislador casado
  // con su persona vive en la ficha de ella, con su sección Congreso. El 308 lo
  // da `redirects()` de next.config.ts; esto cubre una persona casada después
  // del build (aquí, con la respuesta ya en streaming, la redirección es del cliente).
  const casada = await personaDeLegislador(id);
  if (casada) permanentRedirect(`${enlace.funcionario(casada.id)}${ver && ver in CORTES ? `?ver=${ver}` : ""}#congreso`);

  const l = await cargarLegislador(id);
  if (l === "caida") {
    return (
      <div className="mx-auto max-w-4xl">
        <Ruta seccion="congreso" padre={{ href: "/congreso/legisladores", label: "Legisladores" }} actual="Legislador" />
        <EstadoVacio
          variante="caida"
          className="mt-4"
          titulo="El SIL de la Cámara no respondió"
          accion={
            <Button asChild variant="secondary">
              <Link href="/congreso/legisladores">Volver al directorio</Link>
            </Button>
          }
        >
          No es que este legislador no exista: es que el sistema de información
          legislativa no contestó. La ficha vuelve sola cuando el origen se
          restablece.
        </EstadoVacio>
      </div>
    );
  }
  if (l === "inexistente") notFound();

  const corte: Corte = ver && ver in CORTES ? (ver as Corte) : "todas";
  const provincia = provinciaDeTexto(l.provincia);
  const obras = provincia ? await getObras() : null;
  const obrasProvincia = provincia && obras ? filtrarObras(obras.proyectos, { provincia: provincia.slug }).length : 0;
  // Sin persona casada (un legislador que la instantánea aún no tiene): la ficha en vivo del SIL.

  return (
    <div className="mx-auto max-w-4xl">
      <Ruta
        seccion="congreso"
        padre={{ href: "/congreso/legisladores", label: "Legisladores" }}
        actual={l.nombre}
      />

      <header className="mt-1 sm:mt-3">
        <p className="rotulo text-ink-soft">
          {[l.funcion, l.provincia, l.circunscripcion].filter(Boolean).join(" · ")}
        </p>
        <h1 className="mt-1.5 font-display text-3xl leading-tight text-ink sm:text-4xl">
          {l.nombre}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {[
            l.partidoNombre && `${l.partidoNombre}${l.partidoSiglas ? ` (${l.partidoSiglas})` : ""}`,
            l.periodo && `Período ${l.periodo}`,
            l.ejercicio,
            l.profesion,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <ConectadoCon
        className="mt-5"
        aristas={[
          provincia && {
            etiqueta: "Su provincia",
            href: enlace.provincia(provincia.slug),
            nombre: provincia.nombre,
            fuente: "SIL de la Cámara",
          },
          l.provincia && {
            etiqueta: "Quién más representa a su provincia",
            href: hrefDirectorio({ provincia: l.provincia }),
            nombre: l.provincia,
            fuente: "SIL de la Cámara",
          },
          l.partidoSiglas && {
            etiqueta: "Su bancada",
            href: hrefDirectorio({ partido: l.partidoSiglas }),
            nombre: l.partidoNombre ?? l.partidoSiglas,
            fuente: "SIL de la Cámara",
          },
          provincia && {
            etiqueta: "Obras públicas en su provincia",
            href: `/obras?provincia=${provincia.slug}`,
            cuenta: obrasProvincia,
            fuente: "MapaInversiones",
          },
        ]}
      />

      <Suspense key={corte} fallback={<Esqueleto className="mt-6 h-96" />}>
        <Propuestas id={id} corte={corte} base={enlace.legislador(id)} />
      </Suspense>

      {l.camara === "diputados" ? (
        <Suspense fallback={<Esqueleto className="mt-5 h-80" />}>
          <Votos id={id} />
        </Suspense>
      ) : (
        <p className="mt-5 text-xs leading-relaxed text-ink-soft">
          El registro de votaciones del SIL es el de la Cámara de Diputados: el
          voto de un senador se emite y se registra en el Senado, y no aparece
          aquí.
        </p>
      )}
      <Conversacion className="mt-6" referencia={{ tipo: "legislador", ref: enlace.legislador(id), titulo: l.nombre, href: enlace.legislador(id) }} />
    </div>
  );
}

