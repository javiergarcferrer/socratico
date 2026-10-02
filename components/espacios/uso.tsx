"use client";

import { useCallback, useEffect, useState } from "react";
import { usoDePlataforma, type FalloUso, type FilaUso, type UsoPlataforma } from "@/lib/espacios-cliente";
import { rutaPropia } from "@/lib/espacios";
import { formatFecha, MESES_CORTOS } from "@/lib/format";
import { BarrasHorizontales, SerieTemporal, formatearValor } from "@/components/graficos";
import { EstadoVacio } from "@/components/estado-vacio";
import { Cifra, Rotulo, TiraDeCifras } from "@/components/papel";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

const PANEL_VERCEL = "https://vercel.com/javiergarcferrers-projects/socratico/analytics";

const entero = (n: number) => formatearValor(n, "entero");

/** «3 sep»: la marca bajo una columna. El día ya viene en UTC (`AAAA-MM-DD`). */
function diaCorto(dia: string): string {
  const [, mes, d] = dia.split("-").map(Number);
  return `${d} ${MESES_CORTOS[mes - 1]}`;
}

/**
 * El nombre del país en español. `Intl.DisplayNames` no existe antes de
 * Safari 14.1: se crea al usarlo y, sin él, queda el código. Creado al cargar
 * el módulo, tumbaba `/espacio` entero en esos teléfonos, a cualquier cuenta.
 */
let regiones: Intl.DisplayNames | null | undefined;
function nombrePais(codigo: string): string {
  if (!codigo) return "Sin país";
  try {
    if (regiones === undefined) {
      regiones = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["es"], { type: "region" }) : null;
    }
    return regiones?.of(codigo.toUpperCase()) ?? codigo;
  } catch {
    return codigo;
  }
}

/** Vercel junta lo que pasa del límite en un grupo «Others». */
const resto = (clave: string, dicho: string) => (clave === "Others" ? dicho : null);

const FALLO: Record<FalloUso, { titulo: string; texto: string; caida: boolean; panel: boolean }> = {
  sin_datos: {
    titulo: "Vercel no tiene visitas registradas para este proyecto",
    texto: "O nadie ha entrado desde que se activó Web Analytics —cuenta solo producción y solo personas en un navegador—, o Web Analytics no está activado. Su panel dice cuál de las dos es.",
    caida: false,
    panel: true,
  },
  token_no_configurado: {
    titulo: "No pudimos leer el uso: falta el token de Vercel",
    texto: "La función que lee el uso todavía no tiene su token. Las cifras siguen guardadas en Vercel y se ven en su panel.",
    caida: true,
    panel: true,
  },
  token_rechazado: {
    titulo: "Vercel rechazó el token",
    texto: "Pudo vencer o no alcanzar al proyecto socratico. Las cifras siguen guardadas en Vercel y se ven en su panel; hace falta un token nuevo en la función.",
    caida: true,
    panel: true,
  },
  vercel_rechazo: {
    titulo: "Vercel no aceptó la consulta",
    texto: "Contestó, pero rechazó la lectura del uso (puede ser el plan o un límite de la cuenta). Las cifras siguen guardadas en Vercel y se ven en su panel.",
    caida: true,
    panel: true,
  },
  vercel_caida: {
    titulo: "Vercel no contestó",
    texto: "No pudimos traer el uso de la plataforma. Las cifras siguen guardadas en Vercel.",
    caida: true,
    panel: false,
  },
  forma: {
    titulo: "Vercel contestó con una forma que no conocemos",
    texto: "Preferimos no pintar cifras que podrían estar mal. Su panel las sigue mostrando.",
    caida: true,
    panel: true,
  },
};

/**
 * El uso de la plataforma (Vercel Web Analytics), al final de `/espacio`.
 * Solo existe para quien la lleva: la Edge Function `metricas-uso` decide por
 * el correo verificado (docs/INFRAESTRUCTURA.md §10.12) y, mientras no diga
 * `autorizado`, aquí no se pinta nada —ni el esqueleto, ni un fallo—.
 */
export default function Uso() {
  const [carga, setCarga] = useState<UsoPlataforma | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    setOcupado(true);
    setCarga(await usoDePlataforma());
    setOcupado(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (!carga || carga.estado === "ajeno") return null;

  if (carga.estado === "fallo") {
    const f = FALLO[carga.error];
    return (
      <EstadoVacio
        rotulo="Uso de la plataforma"
        variante={f.caida ? "caida" : "vacio"}
        titulo={f.titulo}
        accion={
          f.panel ? (
            <Button asChild variant="secondary">
              <a href={PANEL_VERCEL} target="_blank" rel="noopener noreferrer">
                Abrir el panel de Vercel
              </a>
            </Button>
          ) : (
            <Button type="button" variant="secondary" disabled={ocupado} onClick={() => void cargar()}>
              Volver a mirar
            </Button>
          )
        }
      >
        {f.texto}
      </EstadoVacio>
    );
  }

  const { desde, consultado, semana, mes, dias, rutas, referentes, paises } = carga.datos;
  const primero = dias[0];
  const ultimo = dias[dias.length - 1];

  return (
    <section aria-labelledby="uso-titulo" className="space-y-4">
      <header>
        <Rotulo>Uso de la plataforma · privado</Rotulo>
        <h2 id="uso-titulo" className="font-display mt-1 text-2xl text-ink sm:text-3xl">
          ¿Quién está leyendo Socrático?
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          Personas en un navegador, en producción, sin bots ni cookies. Los asistentes de IA que leen por el
          servidor MCP no cuentan aquí.
        </p>
        <p className="mt-1 text-xs leading-snug text-ink-soft">
          Vercel Web Analytics, desde el {formatFecha(desde)} (día en UTC) hasta la consulta del{" "}
          {formatFecha(consultado, true)}
        </p>
      </header>

      <TiraDeCifras>
        <Cifra
          etiqueta="Visitantes, últimos 7 días"
          valor={entero(semana.visitantes)}
          nota="La misma persona en dos días cuenta dos veces."
        />
        <Cifra etiqueta="Páginas vistas, últimos 7 días" valor={entero(semana.paginas)} />
        <Cifra
          etiqueta="Visitantes, últimos 30 días"
          valor={entero(mes.visitantes)}
          nota="La misma persona en dos días cuenta dos veces."
        />
        <Cifra etiqueta="Páginas vistas, últimos 30 días" valor={entero(mes.paginas)} />
      </TiraDeCifras>

      {primero && ultimo && (
        <Card as="section" className="p-5">
          <CardTitle as="h3" className="text-base">Páginas vistas por día</CardTitle>
          <SerieTemporal
            className="mt-3"
            etiqueta={`Páginas vistas por día del ${formatFecha(primero.clave)} al ${formatFecha(ultimo.clave)}: ${entero(primero.paginas)} el primer día y ${entero(ultimo.paginas)} el último.`}
            puntos={dias.map((d, i) => ({
              clave: d.clave,
              valor: d.paginas,
              lectura: `${formatFecha(d.clave)}: ${entero(d.paginas)} páginas vistas, ${entero(d.visitantes)} visitantes`,
              marca: i === 0 || i === Math.floor(dias.length / 2) || i === dias.length - 1 ? diaCorto(d.clave) : undefined,
            }))}
          />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Lista
          titulo="Páginas más vistas"
          filas={rutas}
          nombre={(c) => resto(c, "Las demás páginas") ?? (c || "Sin ruta")}
          href={(c) => (rutaPropia(c) ? c : undefined)}
        />
        <Lista
          titulo="De dónde llegan"
          filas={referentes}
          nombre={(c) => resto(c, "Los demás sitios") ?? (c || "Directo o sin referente")}
        />
        <Lista titulo="Desde qué país" filas={paises} nombre={(c) => resto(c, "Los demás países") ?? nombrePais(c)} />
      </div>
    </section>
  );
}

function Lista({
  titulo,
  filas,
  nombre,
  href,
}: {
  titulo: string;
  filas: FilaUso[];
  nombre: (clave: string) => string;
  href?: (clave: string) => string | undefined;
}) {
  return (
    <Card as="section" className="p-5">
      <CardTitle as="h3" className="text-base">{titulo}</CardTitle>
      {filas.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">Nada en estos treinta días.</p>
      ) : (
        <BarrasHorizontales
          className="mt-3"
          etiqueta={`${titulo}, por páginas vistas en treinta días`}
          lineas={1}
          barras={filas.map((f, i) => {
            const dicho = nombre(f.clave);
            const gente = `${entero(f.visitantes)} ${f.visitantes === 1 ? "visitante" : "visitantes"}`;
            return {
              clave: `${i}:${f.clave}`,
              etiqueta: dicho,
              titulo: `${dicho}: ${entero(f.paginas)} páginas vistas, ${gente}`,
              valor: f.paginas,
              cifra: entero(f.paginas),
              detalle: gente,
              href: href?.(f.clave),
            };
          })}
        />
      )}
    </Card>
  );
}
