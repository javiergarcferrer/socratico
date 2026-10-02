import type { Metadata } from "next";
import Link from "next/link";
import { leerComunidad, type OrdenComunidad } from "@/lib/espacios";
import { EstadoVacio } from "@/components/estado-vacio";
import { FiltroEnlace, NavFiltros } from "@/components/nav-filtros";
import { Rotulo } from "@/components/papel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import FeedComunidad from "@/components/espacios/feed-comunidad";

export const metadata: Metadata = {
  title: "Comunidad",
  description:
    "Lo que la gente discute de cada compra pública, ley, decreto y proyecto: comentarios de personas con cédula registrada y votos de cualquier cuenta.",
  alternates: { canonical: "/comunidad" },
};

const ORDENES: { clave: OrdenComunidad; nombre: string; alcance: string }[] = [
  { clave: "destacado", nombre: "Destacado", alcance: "Votos y comentarios recientes pesan más que los viejos." },
  { clave: "nuevo", nombre: "Nuevo", alcance: "Las conversaciones abiertas más recientemente." },
  { clave: "votado", nombre: "Más votado", alcance: "Lo que más cuentas dicen que importa, de siempre." },
];

const LIMITE = 50;

/**
 * El feed de la comunidad (docs/INFRAESTRUCTURA.md §10): las conversaciones
 * abiertas sobre registros de la plataforma y sobre investigaciones
 * publicadas. Lo lee el servidor por HTTP (`leerComunidad`, medio minuto de
 * caché); votar y comentar pasan en el navegador, en la ficha.
 *
 * Es de lo que ponen los lectores, no del Estado: cada fila lleva a la ficha,
 * donde la cifra se sigue leyendo de su fuente.
 */
export default async function ComunidadPage({ searchParams }: { searchParams: Promise<{ orden?: string }> }) {
  const { orden: pedido } = await searchParams;
  const orden = ORDENES.find((o) => o.clave === pedido) ?? ORDENES[0];
  const r = await leerComunidad(orden.clave, LIMITE);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <Rotulo>Comunidad · votos y conversación</Rotulo>
        <h1 className="font-display mt-1 text-3xl text-ink sm:text-4xl">¿De qué está hablando la gente?</h1>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink-soft">
          Cada compra, ley, decreto, proveedor, institución y proyecto publicado tiene su
          conversación. Comentan personas con cédula registrada, con su nombre de firma; cualquier
          cuenta vota lo que importa.{" "}
          <Link href="/comunidad/normas" className="font-medium text-brand-700 hover:underline">
            Lee las normas
          </Link>
          .
        </p>
      </header>

      <NavFiltros etiqueta="Ordenar las conversaciones">
        {ORDENES.map((o) => (
          <FiltroEnlace key={o.clave} href={o.clave === "destacado" ? "/comunidad" : `/comunidad?orden=${o.clave}`} activo={o.clave === orden.clave}>
            {o.nombre}
          </FiltroEnlace>
        ))}
      </NavFiltros>

      {r.estado === "caida" ? (
        <EstadoVacio
          como="h2"
          variante="caida"
          titulo="No pudimos traer las conversaciones"
          accion={<Button asChild variant="secondary"><Link href={`/comunidad?orden=${orden.clave}`}>Volver a intentarlo</Link></Button>}
        >
          El servidor de cuentas no respondió. Los registros siguen en sus fichas, leídos de su fuente.
        </EstadoVacio>
      ) : r.estado === "cerrado" ? (
        <EstadoVacio como="h2" titulo="La comunidad abre pronto">
          La conversación todavía no está abierta en esta plataforma. Mientras tanto, cada ficha
          sigue completa y puedes seguirla con «Seguir».
        </EstadoVacio>
      ) : r.datos.length === 0 ? (
        <EstadoVacio
          como="h2"
          titulo="Todavía no hay conversaciones"
          accion={<Button asChild><Link href="/licitaciones">Ver lo que el Estado está comprando</Link></Button>}
        >
          Abre la primera: en la ficha de cualquier compra, ley o decreto, di que importa o deja una
          pregunta concreta al final de la página.
        </EstadoVacio>
      ) : (
        <Card as="section" aria-label={`Conversaciones, orden ${orden.nombre.toLowerCase()}`} className="px-4 sm:px-5">
          <FeedComunidad filas={r.datos} orden={orden.clave} />
        </Card>
      )}

      {r.estado === "ok" && r.datos.length > 0 && (
        <p className="px-1 text-xs leading-relaxed text-ink-soft">
          {orden.alcance} Se muestran hasta {LIMITE} conversaciones; lo oculto por reportes y los
          proyectos retirados no aparecen.
        </p>
      )}
    </div>
  );
}
