import Link from "next/link";
import { Suspense, cache } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { esDesignacion, queEsNorma, resolverNorma, tipoDeRuta } from "@/lib/normativa";
import { INSTITUCIONES, hrefInstitucion } from "@/lib/instituciones";
import { ConectadoCon } from "@/components/conectado-con";
import { pesoDocumento, urlDeLectura } from "@/lib/documentos";
import { desdeMayusculas } from "@/lib/congreso";
import { formatFecha } from "@/lib/format";
import VisorDocumento from "@/components/visor-documento";
import { Esqueleto } from "@/components/esqueleto";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Ruta } from "@/components/ruta";
import AccionesFicha from "@/components/acciones-ficha";
import { ProyectosDeLaNorma } from "@/components/congreso/cruces";
import { EstadoVacio } from "@/components/estado-vacio";
import { Button } from "@/components/ui/button";
import { enlace, numeroCanonico } from "@/lib/grafo";
import { TextoEnlazado } from "@/components/texto-enlazado";
import Conversacion from "@/components/espacios/conversacion";
import { EnElGrafo, alternasRdf } from "@/components/en-el-grafo";
import { ETIQUETA_MOVIMIENTO, getFuncionarios, personaPorFirma, personasDelDecreto } from "@/lib/funcionarios";
import { decretoPorNumero } from "@/lib/decretos";

export const revalidate = 86400;

interface Props {
  params: Promise<{ tipo: string; numero: string }>;
}

/** Una consulta a la Consultoría por render, compartida con `generateMetadata`. */
const cargarNorma = cache((tipo: Parameters<typeof resolverNorma>[0], numero: string) =>
  resolverNorma(tipo, numero),
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tipo: slug, numero } = await params;
  const tipo = tipoDeRuta(slug);
  if (!tipo) return { title: "Norma no encontrada" };
  const norma = await cargarNorma(tipo, numero);
  // Un decreto del registro es un nodo del grafo: su RDF es una alterna de la ficha.
  const registro = tipo === "Decreto" ? await decretoPorNumero(numeroCanonico(slug, numero)) : null;
  return {
    title: `${tipo} ${numero}`,
    alternates: {
      canonical: enlace.norma(slug, numero) ?? undefined,
      ...(registro?.numero ? { types: alternasRdf({ tipo: "decreto", id: registro.numero }) } : {}),
    },
    // Sin el texto, la página es un camino, no contenido: se sigue, no se indexa.
    ...(norma ? {} : { robots: { index: false, follow: true } }),
    description: norma?.titulo
      ? `${tipo} ${numero}: ${desdeMayusculas(norma.titulo).slice(0, 150)}`
      : `Texto oficial de la ${tipo} ${numero}.`,
  };
}

/**
 * Ficha de una norma del Ejecutivo.
 *
 * La Consultoría publica el texto íntegro en PDF con capa de texto y lo sirve
 * `inline` y sin `frame-ancestors`, así que se lee incrustado directamente
 * desde el origen: no hay copia intermedia y el buscador del propio visor del
 * navegador funciona sobre el articulado.
 */
export default async function NormaPage({ params }: Props) {
  const { tipo: slug, numero } = await params;
  const tipo = tipoDeRuta(slug);
  if (!tipo || !/^\d{1,4}-\d{2,4}$/.test(numero)) notFound();
  // «Ley 47-2025» es la Ley 47-25: una sola dirección por norma.
  const canonico = numeroCanonico(slug, numero);
  if (canonico !== numero) permanentRedirect(enlace.norma(slug, canonico) ?? "/normativa");

  const norma = await cargarNorma(tipo, numero);
  // Una cita a una norma que no podemos leer —más vieja que lo que alcanza la
  // lectura, o con el origen tras su desafío de Cloudflare— no es un 404: el
  // enlace que llevó aquí salió de un texto oficial que la cita. Se dice qué
  // pasa y dónde seguir, y se muestran los proyectos que la citan.
  if (!norma) return <NormaFueraDeAlcance tipo={tipo} numero={numero} />;

  const explicacion = queEsNorma(tipo);
  // La institución que la Consultoría etiqueta, por la misma etiqueta con que
  // el cruce de instituciones la liga. La de la Cámara de Cuentas en un
  // nombramiento dice «declara patrimonio», no «trata de la Cámara».
  const etiqueta = norma.institucion?.trim();
  const etiquetadas =
    etiqueta && !esDesignacion(norma) ? INSTITUCIONES.filter((i) => i.consultoria.includes(etiqueta)) : [];
  // Quién lo firma, según el registro completo de decretos. Una fila fechada
  // fuera de los períodos de su firmante es un error de captura: no se afirma.
  const registro = tipo === "Decreto" ? await decretoPorNumero(norma.numero) : null;
  const firmante =
    registro?.firmante && registro.aviso !== "fuera" ? await personaPorFirma(registro.firmante) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <Ruta seccion="normativa" actual={`${tipo} ${norma.numero}`} />

      <header className="mt-1 sm:mt-3">
        <p className="font-mono text-sm font-semibold tabular-nums text-ink">
          {tipo} {norma.numero}
        </p>
        <h1 className="mt-1.5 break-words text-xl leading-snug text-ink sm:text-2xl">
          <TextoEnlazado texto={desdeMayusculas(norma.titulo)} excluir={enlace.norma(slug, numero) ?? undefined} />
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {[
            norma.fechaIso ? formatFecha(norma.fechaIso) : norma.fecha,
            norma.gaceta && `Gaceta Oficial ${norma.gaceta}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {norma.instantanea && (
          <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
            Datos de la instantánea del {formatFecha(norma.instantanea)}: la Consultoría no respondió a la
            lectura en vivo.
          </p>
        )}
        {registro?.aviso && (
          <p className="mt-1.5 text-xs leading-relaxed text-alerta-700">
            {registro.aviso === "fecha"
              ? `La fecha que da la Consultoría no casa con el año del número ${norma.numero}: es un error de captura probable del origen.`
              : "El registro de la Consultoría le pone una fecha fuera de los períodos de firma de su firmante: es un error de captura probable del origen."}
          </p>
        )}
      </header>
      <AccionesFicha className="mt-3" tipo="norma" id={`${slug}/${numero}`} titulo={`${tipo} ${norma.numero}: ${desdeMayusculas(norma.titulo)}`} href={enlace.norma(slug, numero) ?? "/normativa"} />

      <ConectadoCon
        className="mt-5"
        aristas={[
          firmante && {
            etiqueta: "Lo firma",
            href: enlace.funcionario(firmante.id),
            nombre: firmante.nombre,
            fuente: "Registro de decretos de la Consultoría Jurídica",
          },
          firmante && {
            etiqueta: "Todos sus decretos",
            href: enlace.decretosFirmados(firmante.id),
            nombre: `${firmante.firma?.decretos.toLocaleString("es-DO") ?? ""} decretos`,
            fuente: "Registro de decretos de la Consultoría Jurídica",
          },
          ...etiquetadas.slice(0, 3).map((i) => ({
            etiqueta: "Institución a la que se refiere",
            href: `${hrefInstitucion(i)}#decretos`,
            nombre: desdeMayusculas(i.nombre),
            fuente: "Etiqueta de la Consultoría Jurídica",
          })),
        ]}
      />

      {explicacion && (
        <Card as="section" className="mt-5 p-5">
          <p className="rotulo text-ink-soft">
            Qué es
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink">{explicacion}</p>
        </Card>
      )}

      {tipo === "Decreto" && <PersonasDelDecreto numero={norma.numero} />}

      <Card as="section" className="mt-5">
        <CardHeader>
          <CardTitle>El texto</CardTitle>
        </CardHeader>
        {norma.url ? (
          <Suspense fallback={<Esqueleto className="m-5 h-24" />}>
            <TextoNorma url={norma.url} nombre={`${tipo} ${norma.numero} · texto oficial`} />
          </Suspense>
        ) : (
          <p className="px-5 py-6 text-sm text-ink-soft">
            La Consultoría lista esta norma pero no expone su archivo.
          </p>
        )}
      </Card>

      {/* De la ley al proyecto que la originó y a los que hoy la tocan (plan 1.4). */}
      <Suspense fallback={null}>
        <ProyectosDeLaNorma tipo={tipo} numero={numero} titulo={norma.titulo} />
      </Suspense>

      <p className="mt-5 text-xs leading-relaxed text-ink-soft">
        Fuente: Consultoría Jurídica del Poder Ejecutivo. Esta plataforma no
        edita ni interpreta el texto: lo enlaza tal como el Estado lo publica.
        Para el trámite congresual de una pieza, ve a{" "}
        <Link href="/congreso" className="text-brand-700 underline">
          Congreso
        </Link>
        .
      </p>
      {registro?.numero && <EnElGrafo nodo={{ tipo: "decreto", id: registro.numero }} className="mt-6" />}
      {enlace.norma(slug, numero) && (
        <Conversacion
          className="mt-6"
          referencia={{ tipo: "norma", ref: enlace.norma(slug, numero)!, titulo: `${tipo} ${norma.numero}: ${desdeMayusculas(norma.titulo)}`, href: enlace.norma(slug, numero)! }}
        />
      )}
    </div>
  );
}

/**
 * A quién nombra, confirma o cesa un decreto: lo que leyó de su título o de su
 * texto `scripts/build-funcionarios.py`. Cada persona lleva a su ficha, con el
 * resto de sus cargos.
 */
async function PersonasDelDecreto({ numero }: { numero: string }) {
  const datos = await getFuncionarios();
  if (!datos) return null;
  const vistas = new Set<string>();
  const filas = personasDelDecreto(datos, numero).filter(({ persona, cargo }) => {
    const k = `${persona.id}|${cargo.titulo}|${cargo.movimiento}`;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
  if (filas.length === 0) return null;
  return (
    <Card as="section" className="mt-5">
      <CardHeader>
        <CardTitle>¿A quién nombra este decreto?</CardTitle>
      </CardHeader>
      <ul>
        {filas.map(({ persona, cargo }) => (
          <li key={`${persona.id}-${cargo.titulo}-${cargo.movimiento}`} className="relative border-t border-hairline">
            <div className="px-4 py-3 sm:px-5">
              <Link
                href={enlace.funcionario(persona.id)}
                className="text-[15px] font-medium text-ink estira hover:text-brand-700"
              >
                {persona.nombre}
              </Link>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                {ETIQUETA_MOVIMIENTO[cargo.movimiento]} · {cargo.grado ? `${cargo.grado} · ` : ""}
                {cargo.titulo}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t border-hairline px-5 py-3 text-xs leading-relaxed text-ink-soft">
        Leído del título del decreto o, cuando nombra a varias personas, de su texto. El texto oficial manda:
        está justo debajo.
      </p>
    </Card>
  );
}

/**
 * El peso del PDF sale de un HEAD a la Consultoría. La ficha ya no lo espera:
 * se transmite en cuanto responde, y si no responde el visor sale sin peso.
 */
async function TextoNorma({ url, nombre }: { url: string; nombre: string }) {
  const peso = await pesoDocumento(url);
  return (
    <VisorDocumento
      url={url}
      urlVisor={urlDeLectura(url)}
      nombre={nombre}
      tipo={peso?.tipo ?? "application/pdf"}
      bytes={peso?.bytes ?? null}
      origen="la Consultoría Jurídica"
    />
  );
}

function NormaFueraDeAlcance({ tipo, numero }: { tipo: string; numero: string }) {
  const cita = `${tipo} ${numero}`;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Ruta seccion="normativa" actual={cita} />
      <EstadoVacio
        como="h1"
        titulo={`No tenemos el texto de la ${cita}`}
        accion={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild variant="secondary">
              <Link href={`/documentos?q=${encodeURIComponent(numero)}`}>Buscarla entre los documentos</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/buscar?q=${encodeURIComponent(numero)}`}>Buscar «{numero}» en todo</Link>
            </Button>
          </div>
        }
      >
        La cita lleva aquí, pero la Consultoría Jurídica no nos la entrega: la
        lectura alcanza las normas de los últimos años y, cuando el portal está
        tras su desafío, solo la instantánea. Puede que exista y no la tengamos. Muchas
        instituciones publican en su sitio las leyes que las rigen.
      </EstadoVacio>
      <Suspense fallback={null}>
        <ProyectosDeLaNorma tipo={tipo} numero={numero} titulo={null} />
      </Suspense>
    </div>
  );
}
