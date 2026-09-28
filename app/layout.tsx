import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Serif, Public_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import MobileTabBar from "@/components/mobile-tab-bar";
import InstallPrompt from "@/components/install-prompt";
import ScrollTop from "@/components/scroll-top";
import Megamenu from "@/components/megamenu";
import { SITIO } from "@/lib/sitio";
import Paleta from "@/components/paleta";
import PuertaCuenta from "@/components/espacios/puerta-cuenta";
import SincronizarCuenta from "@/components/espacios/sincronizar";
import Rastro from "@/components/rastro";
import SectionBar from "@/components/section-bar";
import { SECCIONES } from "@/lib/secciones";
import { Logotipo, Sello } from "@/components/marca";
import { Card } from "@/components/ui/card";

/*
  Tres familias, tres oficios (ver app/globals.css):
    · Instrument Serif — la pregunta: titulares.
    · Public Sans      — la explicación: cuerpo e interfaz. Es la tipografía
      del estándar web de gobierno, puesta a servir al ciudadano.
    · IBM Plex Mono    — el registro: montos, códigos, expedientes y fechas,
      todo lo que se copia y se verifica.
*/
const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  // Base de las URL absolutas (canónicas, Open Graph): sin ella, cada enlace
  // compartido y cada canónica salía relativa.
  metadataBase: new URL(SITIO),
  title: {
    default: "Socrático — Preguntarle al Estado con sus propios datos",
    template: "%s · Socrático",
  },
  description:
    "El Estado dominicano con sus propios datos: compras públicas, presupuesto, deuda, Congreso, decretos, nómina, obras e instituciones, leídos desde sus fuentes oficiales. Herramienta independiente y no oficial.",
  openGraph: {
    title: "Socrático",
    description:
      "Compras, presupuesto, leyes, nómina, obras e instituciones del Estado dominicano en un solo lugar. Independiente y no oficial.",
    locale: "es_DO",
    type: "website",
    siteName: "Socrático",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Socrático",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b2d6b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${publicSans.variable} ${instrumentSerif.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))] antialiased lg:pb-0">
        {/*
          `NuqsAdapter` es el puente entre la URL y el estado de los
          buscadores de cliente (`nuqs`): licitaciones, la nómina y el campo
          `?q=` de las superficies que filtran en el servidor. Envuelve todo
          el cuerpo porque el campo de búsqueda y los filtros viven en
          componentes distintos y tienen que leer la misma URL.
        */}
        <NuqsAdapter>
        {/*
          Chrome de dos niveles:
          1) Header global — marca, búsqueda con alcance (solo donde aplica) y
             el megamenú en escritorio (`components/megamenu.tsx`). Responde «¿qué es esto y a
             dónde puedo ir?».
          2) SectionBar — solo dentro de una vertical: nombre, matiz y sus
             vistas. Responde «¿dónde estoy y qué hay aquí?».
          El contenido nunca carga con tareas de orientación.
        */}
        {/*
          Saltar al contenido. Antes de esta línea, llegar al primer resultado
          con el teclado costaba recorrer la marca, el buscador del header, seis
          enlaces del nav global y las pestañas de la barra de sección —en cada
          página—. El enlace es invisible hasta que recibe el foco, que es
          exactamente cuando sirve.
        */}
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-canvas"
        >
          Saltar al contenido
        </a>

        <header
          className="cabecera sticky top-0 z-50 text-canvas"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          {/*
            La cabecera es la misma en todas las páginas: marca, megamenú y
            «Buscar». Antes, en compras, el campo de licitaciones ocupaba este
            sitio y en el teléfono se comía el logotipo y la paleta, así que la
            misma franja buscaba cosas distintas según la página —y quien
            tecleaba ahí un decreto desde `/licitaciones` recibía procesos—. La
            búsqueda con alcance de una vertical vive ahora dentro de su página
            (`app/buscador.tsx`); la de aquí es siempre la de toda la
            plataforma.
          */}
          <div className="mx-auto flex min-h-[64px] max-w-6xl items-center gap-2.5 px-4 py-2 sm:gap-4">
            {/*
              La marca es la palabra, sola (decisión del dueño, 2026-09-28): sin
              placa, «socrático» con su acento de sello. En pantallas anchas la
              acompaña lo que promete, en el registro de la casa.
            */}
            <Link href="/" className="group/marca flex shrink-0 items-center gap-4 py-1" aria-label="Socrático, inicio">
              <Logotipo className="cabecera-marca text-[26px] sm:text-[30px]" />
              <span
                aria-hidden
                className="hidden border-l border-canvas/20 pl-4 font-mono text-[10.5px] font-medium uppercase leading-tight tracking-[0.16em] text-canvas/55 transition-colors group-hover/marca:text-canvas/80 xl:block"
              >
                Pregúntale
                <br />
                al Estado
              </span>
            </Link>

            <div className="min-w-0 flex-1" />

            <Megamenu />

            {/*
              «Buscar» vive en el borde derecho, que es donde llega el pulgar de
              la mano que sostiene el teléfono, y dice su nombre en todas las
              anchuras: una lupa sola no dice qué recorre.
            */}
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <Paleta />
              {/* La cuenta: «Entrar» o «Tu espacio» (docs/PLAN-ESPACIOS.md). */}
              <PuertaCuenta />
            </div>
          </div>
        </header>

        <SectionBar />

        <main id="contenido" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-6">
          {children}
        </main>

        <MobileTabBar />
        <ScrollTop />
        <Rastro />
        <InstallPrompt />
        <SincronizarCuenta />

        <footer className="mt-10 border-t border-hairline bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-ink-soft sm:py-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
              <div className="shrink-0 lg:w-60">
                {/* La palabra solo vive sobre el azul: el pie la lleva en su placa. */}
                <div className="flex items-center gap-4 rounded-lg bg-marca p-4 text-canvas sm:flex-col sm:items-start sm:p-5">
                  <Sello className="h-14 w-14 shrink-0 sm:h-20 sm:w-20" trazo="#f7f3ea" id="aro-pie" />
                  <Logotipo className="text-[22px] sm:text-[28px]" />
                </div>
                <p className="mt-4 max-w-xs text-xs leading-relaxed">
                  Qué compra, qué legisla y a quién paga el Estado dominicano,
                  leído en vivo desde sus fuentes oficiales. Herramienta
                  independiente y no oficial.
                </p>
              </div>

              {/*
                Columnas de texto y no una rejilla. Las verticales tienen entre
                una y siete vistas, y con `grid-cols-2` la altura de cada fila
                la fijaba la columna más larga: «Finanzas», con una sola vista,
                abría un hueco de seis renglones al lado de «Licitaciones». En
                columnas los bloques fluyen y se reparten solos; cada uno se
                mantiene entero con `break-inside-avoid`.
              */}
              <div className="flex-1 columns-2 gap-x-6 sm:columns-3 lg:columns-5">
                {SECCIONES.map((seccion) => (
                  <nav
                    key={seccion.id}
                    aria-label={seccion.nombre}
                    className="mb-6 break-inside-avoid"
                  >
                    <p className="rotulo flex items-center gap-2 text-ink">
                      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${seccion.hue.punto}`} />
                      {seccion.nombre}
                    </p>
                    <ul className="mt-2 space-y-0.5 sm:mt-3 sm:space-y-1.5">
                      {seccion.vistas.map((vista) => (
                        <li key={vista.href}>
                          {/*
                            En el teléfono cada enlace es una fila de 40 px, no
                            un renglón de texto: medidos daban 32, y el pie es
                            justo donde se navega con el pulgar cansado al final
                            de una página larga. Desde `sm` vuelve a ser una
                            lista compacta, que es donde hay puntero.
                          */}
                          <Link
                            href={vista.href}
                            className="flex min-h-10 items-center hover:text-brand-700 sm:block sm:min-h-0"
                          >
                            {vista.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </nav>
                ))}
              </div>
            </div>

            {/*
              Banda de seguridad y cumplimiento: los estándares a la vista en
              toda la plataforma, con el marco normativo dominicano nombrado.
              La credibilidad institucional se declara página por página.
            */}
            <Card className="mt-8 bg-canvas p-5 sm:mt-10 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="rotulo flex items-center gap-2 text-ink">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-sello-600"
                  />
                  Seguridad y cumplimiento
                </h2>
                <Link
                  href="/seguridad"
                  className="text-xs font-medium text-brand-700 hover:underline"
                >
                  Postura completa →
                </Link>
              </div>

              {/*
                En el teléfono los tres bloques se apilan, y apilados necesitan
                un filete y aire entre ellos: sin separación, «Ley 172-13» se
                leía como el último renglón del bloque anterior. Desde `sm`
                vuelven a ser tres columnas y el filete sobra.
              */}
              <div className="mt-4 grid gap-x-8 divide-y divide-hairline text-xs leading-relaxed sm:grid-cols-3 sm:gap-y-4 sm:divide-y-0 [&>*]:pt-4 sm:[&>*]:pt-0 [&>*:first-child]:pt-0">
                <div>
                  <p className="font-mono text-xs font-semibold text-ink">
                    Ley 172-13
                  </p>
                  <p className="mt-1 font-semibold text-ink">Protección de datos personales</p>
                  <p className="mt-0.5">
                    Las superficies de inteligencia no guardan datos personales.
                    La cuenta, opcional, guarda solo lo que eliges y ningún dato
                    del Estado. En Democracia, la cédula se cifra con una clave
                    que no sale de la base y el voto es privado.
                  </p>
                </div>
                <div>
                  <p className="font-mono text-xs font-semibold text-ink">
                    Ley 200-04
                  </p>
                  <p className="mt-1 font-semibold text-ink">Acceso a la información pública</p>
                  <p className="mt-0.5">
                    Fuentes oficiales leídas con agente identificable,
                    respetando robots.txt y sin evadir bloqueos. Lo que una
                    fuente niega, se declara.
                  </p>
                </div>
                <div>
                  <p className="font-mono text-xs font-semibold text-ink">
                    NORTIC · OGTIC
                  </p>
                  <p className="mt-1 font-semibold text-ink">Estándares web del Estado</p>
                  <p className="mt-0.5">
                    HTTPS de extremo a extremo, minimización de datos, código y
                    migraciones auditables en el repositorio.
                  </p>
                </div>
              </div>
            </Card>

            {/*
              El pie legal es lo último que se lee y suele ser lo primero que se
              encoge. Aquí no: 12 px, interlínea holgada, y los tres enlaces con
              48 px de alto de toque en el teléfono, que es donde se pulsan.
            */}
            <div className="mt-6 flex flex-col gap-2 border-t border-hairline pt-5 text-xs leading-relaxed sm:flex-row sm:items-center sm:justify-between">
              <p>
                Fuentes: DGCP, los SIL de ambas cámaras del Congreso, la
                Consultoría Jurídica del Poder Ejecutivo, Crédito Público y las
                nóminas de transparencia institucional.
              </p>
              <nav className="-mx-1 flex shrink-0 flex-wrap gap-x-2 sm:mx-0 sm:gap-x-4">
                <Link href="/" className="inline-flex min-h-11 items-center px-1 hover:text-brand-700 sm:min-h-0 sm:px-0">Inicio</Link>
                <Link href="/seguimiento" className="inline-flex min-h-11 items-center px-1 hover:text-brand-700 sm:min-h-0 sm:px-0">Mi seguimiento</Link>
                <Link href="/seguridad" className="inline-flex min-h-11 items-center px-1 hover:text-brand-700 sm:min-h-0 sm:px-0">Seguridad</Link>
                <Link href="/fuentes" className="inline-flex min-h-11 items-center px-1 font-medium text-brand-700 hover:underline sm:min-h-0 sm:px-0">
                  Estado de las fuentes
                </Link>
              </nav>
            </div>
          </div>
        </footer>
        </NuqsAdapter>
      </body>
    </html>
  );
}
