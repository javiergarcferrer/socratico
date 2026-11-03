"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorCampo } from "@/components/ui/error-campo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { claves, consultarSparql } from "@/lib/consultas";
import { formatFecha } from "@/lib/format";
import { formatInt } from "@/lib/nomina";
import { AYUDA_PARAMETRO, PLANTILLAS, llenarPlantilla, normalizar, parametroDeRuta, type ParametroPlantilla } from "@/lib/plantillas";

/** Las provincias para su lista, del mismo grafo: la consulta se guarda en la CDN y en la caché del navegador. */
const CONSULTA_PROVINCIAS =
  "PREFIX soc: <https://w3id.org/socratico/def/core#>\nPREFIX schema: <http://schema.org/>\nSELECT ?provincia ?nombre WHERE { ?provincia a soc:Provincia ; schema:name ?nombre } ORDER BY ?nombre";

/**
 * Las plantillas de investigación en la sección SPARQL del banco
 * (`lib/plantillas.ts`, docs/INFRAESTRUCTURA.md §7.12): se elige una pregunta,
 * se llenan sus parámetros —o se toma la ficha abierta en el inspector, si es
 * de ese tipo— y la consulta llena pasa al editor y corre. Lo escrito solo
 * entra a la consulta por `normalizar`: un número, un año o un slug.
 */
export function Plantillas({ nodo, onLlenar }: { nodo: string | null; onLlenar: (consulta: string, pregunta: string) => void }) {
  const [id, setId] = useState(PLANTILLAS[0].id);
  const plantilla = PLANTILLAS.find((p) => p.id === id) ?? PLANTILLAS[0];
  const [valores, setValores] = useState<Record<string, string>>({});
  const [intentado, setIntentado] = useState(false);
  const abierto = nodo ? parametroDeRuta(nodo) : null;
  const provincias = useQuery({
    queryKey: claves.sparql(CONSULTA_PROVINCIAS),
    queryFn: ({ signal }) => consultarSparql(CONSULTA_PROVINCIAS, signal),
    staleTime: Infinity,
    enabled: plantilla.parametros.some((p) => p.tipo === "provincia"),
  });
  const listaProvincias =
    provincias.data?.tipo === "filas"
      ? provincias.data.filas.flatMap((f) => {
          const slug = /\/provincias\/([a-z0-9-]+)#id$/.exec(f.provincia?.value ?? "")?.[1];
          return slug ? [{ slug, nombre: f.nombre?.value ?? slug }] : [];
        })
      : [];

  const valorDe = (p: ParametroPlantilla) => valores[`${plantilla.id}:${p.clave}`] ?? p.porOmision;
  const poner = (p: ParametroPlantilla, v: string) => setValores((x) => ({ ...x, [`${plantilla.id}:${p.clave}`]: v }));
  const invalidos = plantilla.parametros.filter((p) => normalizar(p.tipo, valorDe(p)) == null);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    const q = llenarPlantilla(plantilla, Object.fromEntries(plantilla.parametros.map((p) => [p.clave, valorDe(p)])));
    if (q) onLlenar(q, plantilla.pregunta);
  };

  return (
    <Card as="section" aria-labelledby="plantillas-titulo">
      <div className="border-b border-hairline px-4 py-3">
        <CardTitle id="plantillas-titulo">Plantillas de investigación</CardTitle>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
          {formatInt(PLANTILLAS.length)} preguntas con sus parámetros: se llenan, pasan al editor y corren. Cada una se verificó contra las tablas del grafo con
          los valores que trae.
        </p>
      </div>
      <form onSubmit={enviar} className="space-y-3 px-4 py-3" noValidate>
        <div className="space-y-1">
          <Label htmlFor="plantilla" className="text-sm font-semibold text-ink">
            La pregunta
          </Label>
          <Select
            value={plantilla.id}
            onValueChange={(v) => {
              setId(v);
              setIntentado(false);
            }}
          >
            <SelectTrigger id="plantilla" className="bg-canvas">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLANTILLAS.map((p) => (
                <SelectItem key={p.id} value={p.id} ayuda={p.parametros.map((x) => x.etiqueta).join(", ")}>
                  {p.pregunta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs leading-relaxed text-ink-soft">{plantilla.alcance}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {plantilla.parametros.map((p) => {
            const campo = `plantilla-${p.clave}`;
            const malo = intentado && normalizar(p.tipo, valorDe(p)) == null;
            return (
              <div key={p.clave} className="space-y-1">
                <Label htmlFor={campo} className="text-sm text-ink">
                  {p.etiqueta}
                </Label>
                {p.tipo === "provincia" ? (
                  <Select value={valorDe(p)} onValueChange={(v) => poner(p, v)}>
                    <SelectTrigger id={campo} className="bg-canvas" aria-describedby={`${campo}-ayuda`}>
                      <SelectValue placeholder={provincias.isError ? "No se pudo leer la lista" : "Leyendo las provincias…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(listaProvincias.length ? listaProvincias : [{ slug: valorDe(p), nombre: valorDe(p) }]).map((x) => (
                        <SelectItem key={x.slug} value={x.slug}>
                          {x.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={campo}
                    value={valorDe(p)}
                    onChange={(e) => poner(p, e.target.value)}
                    inputMode={p.tipo === "anio" ? "numeric" : "text"}
                    autoComplete="off"
                    aria-invalid={malo || undefined}
                    aria-describedby={`${campo}-ayuda ${campo}-error`}
                    className="bg-canvas font-mono"
                  />
                )}
                <p id={`${campo}-ayuda`} className="text-xs text-ink-soft">
                  {AYUDA_PARAMETRO[p.tipo]}
                </p>
                {p.tipo !== "provincia" && <ErrorCampo id={`${campo}-error`}>{malo ? "No tiene esa forma." : null}</ErrorCampo>}
                {p.tipo === "provincia" && provincias.isError && (
                  <p className="text-xs text-alerta-700">No se pudo leer la lista de provincias; se usa {valorDe(p)}.</p>
                )}
                {abierto && abierto.tipo === p.tipo && abierto.valor !== normalizar(p.tipo, valorDe(p)) && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => poner(p, abierto.valor)}>
                    Usar la ficha abierta ({abierto.valor})
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={intentado && invalidos.length > 0}>
            Llenar y correr
          </Button>
          <p className="text-xs text-ink-soft">
            Con {plantilla.parametros.map((p) => `${p.etiqueta.charAt(0).toLowerCase()}${p.etiqueta.slice(1)} ${p.porOmision}`).join(" y ")} dio {formatInt(plantilla.verificado.filas)}{" "}
            {plantilla.verificado.filas === 1 ? "fila" : "filas"} el {formatFecha(plantilla.verificado.fecha)}.
          </p>
        </div>
      </form>
    </Card>
  );
}
