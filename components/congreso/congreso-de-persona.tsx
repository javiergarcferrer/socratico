import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Cifra, TiraDeCifras } from "@/components/papel";
import { Esqueleto } from "@/components/esqueleto";
import { Propuestas } from "@/components/congreso/legislador";
import { formatFecha } from "@/lib/format";
import { enlace } from "@/lib/grafo";
import {
  NOTA_ASISTENCIA,
  NOTA_DISIDENCIA,
  ETIQUETA_SENTIDO,
  getLegisladores,
  partirAnio,
  proporcion,
  textoAsistencia,
  type Cuentas,
  type Legislador,
} from "@/lib/legisladores";

/** Los dos períodos del SIL, para repartir las disidencias. */
const PERIODO_INICIO: Record<string, string> = { "2020-2024": "2020-08-16", "2024-2028": "2024-08-16" };
const PERIODO_FIN: Record<string, string> = { "2020-2024": "2024-08-15", "2024-2028": "2028-08-15" };

/**
 * La sección Congreso de la ficha de una persona (docs/INFRAESTRUCTURA.md §3.3,
 * §7.4): su asistencia a las votaciones del pleno —siempre con su denominador,
 * al lado de la de su bancada y la de la cámara en el mismo corte—, sus
 * disidencias y lo que propuso. La asistencia y las disidencias salen del voto
 * nominal leído del SIL (`datos/votos/`); las propuestas, del SIL en vivo.
 */

const pct = (c: Cuentas | undefined) => {
  const p = proporcion(c);
  return p == null ? "—" : `${(Math.round(p * 1000) / 10).toLocaleString("es-DO", { maximumFractionDigits: 1 })} %`;
};

export async function CongresoDePersona({ legislador }: { legislador: Legislador }) {
  const datos = await getLegisladores();
  if (!datos) return null;
  const senado = legislador.camara === "senado";
  const periodos = Object.keys(legislador.asistencia?.periodo ?? {}).sort().reverse();
  const cobertura = new Map((datos.corte.nominal?.periodos ?? []).map((p) => [p.periodo, p]));
  const leido = datos.corte.nominalGenerado ?? datos.generado;

  return (
    <section id="congreso" className="mt-5 scroll-mt-20">
      <Card as="div">
        <CardHeader>
          <CardTitle>¿Asiste a las votaciones del pleno?</CardTitle>
          <CardAction>
            <Badge forma="sello" variant="neutro">
              {senado ? "Senado" : "Cámara de Diputados"}
            </Badge>
          </CardAction>
        </CardHeader>
        {senado ? (
          <p className="px-5 pb-5 text-sm leading-relaxed text-ink">
            El Senado no publica el voto nominal de sus senadores: su sistema de información legislativa da el trámite
            de los expedientes, no cómo votó cada quien. La asistencia al pleno sí la publica, en un PDF por sesión en
            su web, pero esa web veta en su <code className="font-mono">robots.txt</code> a los agentes de inteligencia
            artificial y la plataforma no la lee mientras no haya un acuerdo con el Senado. Por eso aquí no hay cifra,
            y no porque falte a las sesiones. Más en{" "}
            <Link href="/fuentes" className="text-brand-700 underline">el estado de las fuentes</Link>.
          </p>
        ) : periodos.length === 0 ? (
          <p className="px-5 pb-5 text-sm leading-relaxed text-ink-soft">
            Su voto nominal todavía no está leído: la lectura del SIL es incremental, de la votación más reciente a
            la más antigua.
          </p>
        ) : (
          periodos.map((periodo) => (
            <Periodo key={periodo} l={legislador} periodo={periodo} datos={datos} cobertura={cobertura.get(periodo)} />
          ))
        )}
        {!senado && periodos.length > 0 && (
          <p className="border-t border-hairline px-5 py-3 text-xs leading-relaxed text-ink-soft">
            {NOTA_ASISTENCIA} {NOTA_DISIDENCIA} Fuente: voto nominal del SIL de la Cámara de Diputados, leído el{" "}
            {formatFecha(leido)}, de las votaciones que lista la instantánea del{" "}
            {datos.corte.votacionesGenerado ? formatFecha(datos.corte.votacionesGenerado) : "?"} (hasta la del{" "}
            {datos.corte.votacionesHasta ? formatFecha(datos.corte.votacionesHasta) : "?"}); las posteriores aún no están.{" "}
            {legislador.evidencia && <>Cómo se sabe que este escaño es de esta persona: {legislador.evidencia}.</>}
          </p>
        )}
      </Card>
      <Suspense fallback={<Esqueleto className="mt-5 h-96" />}>
        <Propuestas id={legislador.id} corte="todas" base={null} />
      </Suspense>
    </section>
  );
}

async function Periodo({
  l,
  periodo,
  datos,
  cobertura,
}: {
  l: Legislador;
  periodo: string;
  datos: NonNullable<Awaited<ReturnType<typeof getLegisladores>>>;
  cobertura?: { votaciones: number; leidas: number };
}) {
  const c = l.asistencia!.periodo[periodo];
  const siglas = l.periodos[periodo]?.partido ?? null;
  const camara = datos.camara.periodo[periodo];
  const bancada = siglas ? datos.bancadas[`periodo:${periodo}`]?.[siglas] : undefined;
  const anios = Object.entries(l.asistencia!.anio)
    .filter(([k]) => partirAnio(k).periodo === periodo)
    .sort(([a], [b]) => b.localeCompare(a));
  const base = l.disidencia?.base[periodo] ?? 0;
  const cuenta = l.disidencia?.cuenta[periodo] ?? 0;
  const [desde, hasta] = periodo.split("-");
  // Las disidencias más recientes de este período, con su fecha y su moción (sin leer votaciones.json).
  const delPeriodo = (l.disidencia?.ultimas ?? [])
    .filter((d) => (d.fecha ?? "") >= (PERIODO_INICIO[periodo] ?? "9999") && (d.fecha ?? "") <= (PERIODO_FIN[periodo] ?? ""))
    .slice(0, 8)
    .map((d) => ({ d }));
  const parcial = cobertura && cobertura.leidas < cobertura.votaciones;
  const ancla = parcial
    ? { alcance: "muestra" as const, escaneados: cobertura.leidas, universo: cobertura.votaciones, periodo: `las más recientes de ${periodo}` }
    : { alcance: "registro" as const, periodo: `período ${periodo}` };

  return (
    <div className="border-t border-hairline">
      <p className="px-5 pt-4 text-sm font-semibold text-ink">
        Período {desde}-{hasta}
        {siglas && <span className="font-normal text-ink-soft"> · bancada {siglas}</span>}
      </p>
      <TiraDeCifras className="mt-3">
        <Cifra etiqueta="Presente en las votaciones" valor={textoAsistencia(c)} ancla={ancla} />
        <Cifra etiqueta="Ausente" valor={c.ausente.toLocaleString("es-DO")} nota={`de ${c.listadas.toLocaleString("es-DO")} votaciones`} />
        <Cifra
          etiqueta={siglas ? `Su bancada (${siglas})` : "Su bancada"}
          valor={pct(bancada)}
          nota={bancada ? `${bancada.presente.toLocaleString("es-DO")} de ${bancada.listadas.toLocaleString("es-DO")} presencias de sus miembros` : "sin bancada en el SIL"}
        />
        <Cifra
          etiqueta="Toda la cámara"
          valor={pct(camara)}
          nota={camara ? `${camara.presente.toLocaleString("es-DO")} de ${camara.listadas.toLocaleString("es-DO")} presencias de los diputados` : undefined}
        />
      </TiraDeCifras>
      {parcial && (
        <p className="px-5 pt-3 text-xs leading-relaxed text-ink-soft">
          De las {cobertura.votaciones.toLocaleString("es-DO")} votaciones del período se han leído{" "}
          {cobertura.leidas.toLocaleString("es-DO")}, las más recientes: las cifras son de esas, y las de su bancada y la
          cámara, del mismo corte.
        </p>
      )}
      {anios.length > 0 && (
        <div className="px-5 py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Año</TableHead>
                <TableHead className="text-right">Presente, de</TableHead>
                <TableHead className="text-right">Ausente</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {anios.map(([k, x]) => {
                const cob = datos.corte.anios?.[k];
                const parcial = cob != null && cob.leidas < cob.votaciones;
                return (
                <TableRow key={k}>
                  <TableCell className="font-mono tabular-nums">
                    {partirAnio(k).anio}
                    {parcial && <span className="block font-sans text-xs text-ink-soft">{`leídas ${cob.leidas.toLocaleString("es-DO")} de ${cob.votaciones.toLocaleString("es-DO")}`}</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                    {`${x.presente.toLocaleString("es-DO")} de ${x.listadas.toLocaleString("es-DO")}`}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{x.ausente.toLocaleString("es-DO")}</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">{pct(x)}</TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="border-t border-hairline px-5 py-4">
        <p className="text-sm leading-relaxed text-ink">
          ¿Vota con su bancada? Votó distinto a la mayoría de ella en{" "}
          <span className="font-mono font-semibold tabular-nums">{cuenta.toLocaleString("es-DO")}</span> de{" "}
          <span className="font-mono tabular-nums">{base.toLocaleString("es-DO")}</span> votaciones en que votó y su
          bancada tuvo posición clara.
        </p>
        {delPeriodo.length > 0 && (
          <ul className="mt-2">
            {delPeriodo.map(({ d }) => (
              <li key={d.votacion} className="relative border-t border-hairline py-2.5 first:border-0">
                <Link href={enlace.votacion(d.votacion)} className="estira text-sm text-ink hover:text-brand-700">
                  {d.mocion || `Votación ${d.votacion}`}
                </Link>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {d.fecha && <time dateTime={d.fecha} className="font-mono tabular-nums">{formatFecha(d.fecha)}</time>}
                  {" · "}Votó «{ETIQUETA_SENTIDO[d.voto]}»; su bancada ({d.bancada}), «{ETIQUETA_SENTIDO[d.posicion]}»
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
