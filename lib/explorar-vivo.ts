import { dgcpFetch, listProcesos, type Contrato, type Proceso } from "@/lib/dgcp";
import { getIniciativa, normalizarIniciativa, marcaDeIniciativa, desdeMayusculas } from "@/lib/congreso";
import { institucionPorId } from "@/lib/instituciones";
import { etapaDe, cierreMeta } from "@/lib/estados";
import { diasHasta, formatFecha } from "@/lib/format";
import { enlace, nodoDeRuta } from "@/lib/grafo";
import type { FilaViva, Vivo } from "@/lib/explorar-tipos";

/**
 * Lo que la fuente dice **ahora** de un nodo del banco de trabajo
 * (`/explorar`, docs/INFRAESTRUCTURA.md §7.7). El grafo se compila de
 * instantáneas; las fichas, en cambio, leen en vivo la DGCP y el SIL. Aquí se
 * juntan las dos cosas en el inspector: junto a lo que el grafo dice de una
 * institución, sus procesos abiertos a ofertas hoy; junto a un proceso, su
 * etapa de hoy y a quién se le adjudicó; junto a una iniciativa, su condición
 * de hoy en el SIL.
 *
 * No es una fuente nueva: llama a los adaptadores de siempre (`lib/dgcp.ts`,
 * `lib/congreso.ts`, §5.1 y §5.5), con su contrato de `lib/pedir.ts` y su
 * ventana de caché de cinco minutos. Sin base de datos ni clave. Un tipo de
 * nodo sin fuente en vivo devuelve `null`, y una fuente que no contesta
 * también: «no pudimos mirar» lo dice el inspector, no se finge un vacío.
 */

const VENTANA = "se relee cada 5 minutos";
const DGCP = "API de datos abiertos de la DGCP";
/** Cuántos procesos abiertos de una institución se listan; el enlace lleva a todos. */
const ABIERTOS = 6;

type Resultado = { vivo: Vivo | null; sinFuente: boolean };

function marcaDeProceso(p: Proceso): FilaViva["marca"] {
  const etapa = etapaDe(p.estado_proceso);
  const abierto = etapa.clave === "abiertos";
  const cierre = abierto ? cierreMeta(diasHasta(p.fecha_fin_recepcion_ofertas)) : null;
  // Un abierto que cierra pronto avisa; los demás llevan el tono de su etapa.
  if (cierre?.urgente) return { texto: cierre.texto, tono: "aviso", original: p.estado_proceso || null };
  return { texto: etapa.label, tono: etapa.tono, original: p.estado_proceso || null };
}

function filaDeProceso(p: Proceso): FilaViva {
  const abierto = etapaDe(p.estado_proceso).clave === "abiertos";
  return {
    titulo: desdeMayusculas(p.titulo),
    detalle: [p.modalidad, p.codigo_proceso].filter(Boolean).join(" · ") || null,
    href: enlace.proceso(p.codigo_proceso),
    externo: false,
    monto: p.monto_estimado > 0 ? p.monto_estimado : null,
    montoEs: p.monto_estimado > 0 ? (p.divisa && p.divisa !== "DOP" ? `estimado, en ${p.divisa}` : "estimado") : null,
    marca: marcaDeProceso(p),
    fecha: abierto ? p.fecha_fin_recepcion_ofertas || null : p.fecha_publicacion || null,
    prefijoFecha: abierto ? "Recibe ofertas hasta" : "Publicado",
  };
}

async function vivoDeInstitucion(id: number): Promise<Resultado> {
  const inst = institucionPorId(id);
  // Sin unidad de compra (el Congreso, las cortes, muchas juntas) la DGCP no tiene nada que decir de ella.
  if (!inst?.dgcp) return { vivo: null, sinFuente: true };
  const r = await listProcesos({ unidad_compra: id, etapa: "abiertos", limit: ABIERTOS });
  const total = r.totalResults;
  return {
    sinFuente: false,
    vivo: {
      fuente: DGCP,
      leido: new Date().toISOString(),
      ventana: VENTANA,
      titulo: "Abiertos a ofertas ahora",
      resumen:
        total === 0
          ? "Ningún proceso suyo recibe ofertas en este momento."
          : `${total === 1 ? "Un proceso recibe" : `${total} procesos reciben`} ofertas en este momento${total > r.content.length ? `; aquí van los ${r.content.length} más recientes` : ""}.`,
      filas: r.content.map(filaDeProceso),
      total,
      enlace: total > 0 ? { href: `/licitaciones?uc=${id}`, texto: "Todos sus procesos, con filtros" } : null,
    },
  };
}

async function vivoDeProceso(codigo: string): Promise<Resultado> {
  // `dgcpFetch` y no `getProceso`: aquel convierte un fallo en «no hay», y
  // aquí una DGCP caída debe decirse como tal (la ruta responde 502).
  const [procesos, ctos] = await Promise.all([
    dgcpFetch<Proceso>("/procesos", { proceso: codigo, limit: 5 }),
    dgcpFetch<Contrato>("/contratos", { proceso: codigo, limit: 50 }),
  ]);
  const proceso = procesos.payload.content[0] ?? null;
  const contratos = ctos.payload.content;
  if (!proceso) {
    return {
      sinFuente: false,
      vivo: {
        fuente: DGCP,
        leido: new Date().toISOString(),
        ventana: VENTANA,
        titulo: "Su estado ahora",
        resumen: "La DGCP no devolvió este proceso al pedirlo por su código.",
        filas: [],
        total: 0,
        enlace: null,
      },
    };
  }
  const filas: FilaViva[] = [filaDeProceso(proceso)];
  // A quién se le adjudicó: lo que la tabla del grafo no ata (salvo en las obras) y la DGCP sí dice.
  for (const c of contratos) {
    filas.push({
      titulo: c.razon_social || `RPE ${c.rpe}`,
      detalle: ["Contrato", c.codigo_contrato, c.estado_contrato].filter(Boolean).join(" · "),
      href: c.rpe ? enlace.proveedor(c.rpe) : null,
      externo: false,
      monto: c.valor_contratado > 0 ? c.valor_contratado : null,
      montoEs: c.valor_contratado > 0 ? (c.divisa && c.divisa !== "DOP" ? `contratado, en ${c.divisa}` : "contratado") : null,
      marca: null,
      fecha: c.fecha_adjudicacion || null,
      prefijoFecha: "Adjudicado",
    });
  }
  return {
    sinFuente: false,
    vivo: {
      fuente: DGCP,
      leido: new Date().toISOString(),
      ventana: VENTANA,
      titulo: "Su estado ahora",
      resumen: contratos.length
        ? `${contratos.length === 1 ? "Un contrato" : `${contratos.length} contratos`} con este proceso en la DGCP: a quién y por cuánto.`
        : "La DGCP no le registra contratos todavía.",
      filas,
      total: null,
      enlace: { href: enlace.proceso(codigo), texto: "Su ficha, con artículos y documentos" },
    },
  };
}

async function vivoDeIniciativa(id: number): Promise<Resultado> {
  const raw = await getIniciativa(id);
  if (!raw) return { vivo: null, sinFuente: false };
  const ini = normalizarIniciativa(raw);
  const m = marcaDeIniciativa(ini);
  return {
    sinFuente: false,
    vivo: {
      fuente: "SIL de la Cámara de Diputados",
      leido: new Date().toISOString(),
      ventana: VENTANA,
      titulo: "Su condición ahora",
      resumen: ini.fechaUltimoCambio ? `Último cambio en el SIL el ${formatFecha(ini.fechaUltimoCambio)}.` : null,
      filas: [
        {
          titulo: ini.titulo,
          detalle: [ini.tipo, ini.numero ? `Expediente ${ini.numero.completo}` : null].filter(Boolean).join(" · ") || null,
          href: enlace.iniciativa(ini.id),
          externo: false,
          monto: null,
          montoEs: null,
          marca: { texto: m.label, tono: m.tono, original: m.original },
          fecha: ini.fechaDeposito,
          prefijoFecha: "Depositada",
        },
      ],
      total: null,
      enlace: { href: enlace.iniciativa(ini.id), texto: "Su ficha, con trámites y votaciones" },
    },
  };
}

/**
 * Lo que la fuente dice ahora del nodo de esa ruta. `sinFuente` es `true`
 * cuando ese tipo de nodo no tiene fuente en vivo (y el inspector no pinta
 * el bloque); `vivo` es `null` con `sinFuente: false` cuando la fuente no
 * contestó. Nunca lanza.
 */
export async function vivoDelNodo(ruta: string): Promise<Resultado> {
  const n = nodoDeRuta(ruta);
  if (!n) return { vivo: null, sinFuente: true };
  try {
    if (n.tipo === "institucion") return await vivoDeInstitucion(Number(n.id));
    if (n.tipo === "proceso") return await vivoDeProceso(n.id);
    if (n.tipo === "iniciativa") return await vivoDeIniciativa(Number(n.id));
    return { vivo: null, sinFuente: true };
  } catch (err) {
    console.error(`[explorar-vivo] ${ruta}:`, err);
    return { vivo: null, sinFuente: false };
  }
}
