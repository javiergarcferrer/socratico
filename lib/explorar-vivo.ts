import { ESTADOS_VIGENTES, dgcpFetch, enPesos, fichaPorDocumento, getHistorialProveedor, leerCompetencia, listProcesos, type Contrato, type Proceso } from "@/lib/dgcp";
import { getIniciativa, normalizarIniciativa, marcaDeIniciativa, desdeMayusculas } from "@/lib/congreso";
import { institucionPorId } from "@/lib/instituciones";
import { etapaDe, cierreMeta } from "@/lib/estados";
import { diasHasta, formatFecha, formatPesos } from "@/lib/format";
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
/** Cuántos oferentes de un proceso y cuántos contratos de un proveedor se listan. */
const OFERENTES = 5;
const CONTRATOS = 6;

type Resultado = { vivo: Vivo | null; sinFuente: boolean };

/**
 * Un monto con su moneda. `formatPesos` dice «RD$»: un monto en otra moneda
 * no va por ahí, se escribe en el detalle con su código («USD 276,686») y no
 * se suma con los pesos.
 */
function monto(valor: number, divisa: string | null | undefined, es: string): Pick<FilaViva, "monto" | "montoEs"> & { otraMoneda: string | null } {
  if (!(valor > 0)) return { monto: null, montoEs: null, otraMoneda: null };
  if (enPesos(divisa)) return { monto: valor, montoEs: es, otraMoneda: null };
  return { monto: null, montoEs: null, otraMoneda: `${divisa} ${ENTERO.format(valor)} ${es}` };
}

const ENTERO = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 0 });

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
  const m = monto(p.monto_estimado, p.divisa, "estimado");
  return {
    titulo: desdeMayusculas(p.titulo),
    detalle: [m.otraMoneda, p.modalidad, p.codigo_proceso].filter(Boolean).join(" · ") || null,
    href: enlace.proceso(p.codigo_proceso),
    externo: false,
    monto: m.monto,
    montoEs: m.montoEs,
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
  const [procesos, ctos, competencia] = await Promise.all([
    dgcpFetch<Proceso>("/procesos", { proceso: codigo, limit: 5 }),
    dgcpFetch<Contrato>("/contratos", { proceso: codigo, limit: 50 }),
    leerCompetencia(codigo),
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
    const m = monto(c.valor_contratado, c.divisa, "contratado");
    filas.push({
      titulo: c.razon_social || `RPE ${c.rpe}`,
      detalle: [m.otraMoneda, "Contrato", c.codigo_contrato, c.estado_contrato].filter(Boolean).join(" · "),
      href: c.rpe ? enlace.proveedor(c.rpe) : null,
      externo: false,
      monto: m.monto,
      montoEs: m.montoEs,
      marca: null,
      fecha: c.fecha_adjudicacion || null,
      prefijoFecha: "Adjudicado",
    });
  }
  // Quién compitió: el registro de ofertas del proceso, no una muestra. Sin
  // ofertas cargadas no es «nadie compitió»: hay modalidades que no las publican.
  const oferentes = competencia?.oferentes ?? [];
  for (const o of oferentes.slice(0, OFERENTES)) {
    filas.push({
      titulo: o.razonSocial,
      detalle: ["Ofertó", o.ofertas > 1 ? `${o.ofertas} ofertas` : null, o.monto > 0 ? null : "sin monto legible en el registro"].filter(Boolean).join(" · "),
      href: o.rpe ? enlace.proveedor(o.rpe) : null,
      externo: false,
      monto: o.monto > 0 ? o.monto : null,
      montoEs: o.monto > 0 ? "ofertado" : null,
      marca: null,
      fecha: null,
      prefijoFecha: null,
    });
  }
  const partes = [
    contratos.length
      ? `${contratos.length === 1 ? "Un contrato" : `${contratos.length} contratos`} con este proceso: a quién y por cuánto.`
      : "La DGCP no le registra contratos todavía.",
    competencia
      ? competencia.oferenteUnico
        ? "Se presentó un solo oferente."
        : `Se presentaron ${competencia.oferentes.length} oferentes${competencia.menor != null && competencia.mayor != null ? `, de ${formatPesos(competencia.menor)} a ${formatPesos(competencia.mayor)}` : ""}${competencia.oferentes.length > OFERENTES ? `; aquí van los ${OFERENTES} de menor oferta` : ""}.`
      : "La DGCP no tiene ofertas cargadas para este proceso (hay modalidades que no las publican).",
  ];
  return {
    sinFuente: false,
    vivo: {
      fuente: DGCP,
      leido: new Date().toISOString(),
      ventana: VENTANA,
      titulo: "Su estado ahora",
      resumen: partes.join(" "),
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

/** Lo adjudicado a un RPE, según los contratos de la DGCP: los más recientes y la suma. */
async function adjudicado(rpe: string, inscripcion: string | null): Promise<Vivo> {
  const h = await getHistorialProveedor(rpe);
  const leido = new Date().toISOString();
  if (!h) {
    return {
      fuente: DGCP,
      leido,
      ventana: "se relee cada hora",
      titulo: "Lo adjudicado",
      resumen: [inscripcion, "La DGCP no le registra contratos."].filter(Boolean).join(" "),
      filas: [],
      total: 0,
      enlace: { href: enlace.proveedor(rpe), texto: "Su ficha de proveedor" },
    };
  }
  const recientes = [...h.contratos].sort((a, b) => (b.fecha_adjudicacion ?? "").localeCompare(a.fecha_adjudicacion ?? "")).slice(0, CONTRATOS);
  const leidos = h.contratos.length;
  // La suma del adaptador es solo de pesos; se dice cuántos vigentes en otra moneda quedan fuera.
  const pesos = h.montoVigente;
  const vigentes = h.contratos.filter((c) => ESTADOS_VIGENTES.has(c.estado_contrato));
  const otraMoneda = vigentes.filter((c) => !enPesos(c.divisa) && c.valor_contratado > 0).length;
  return {
    fuente: DGCP,
    leido,
    ventana: "se relee cada hora",
    titulo: "Lo adjudicado",
    resumen: [
      inscripcion,
      `${h.totalRegistro === 1 ? "Un contrato" : `${h.totalRegistro} contratos`} con ${h.instituciones === 1 ? "una institución" : `${h.instituciones} instituciones`}: ${formatPesos(pesos)} en pesos sin contar los cancelados ni los rescindidos (contratado, no pagado)${otraMoneda ? `, y ${otraMoneda === 1 ? "un contrato" : `${otraMoneda} contratos`} en otra moneda que no se suman` : ""}${h.totalRegistro > leidos ? `; se cuentan los ${leidos} que la API deja leer` : ""}.`,
    ]
      .filter(Boolean)
      .join(" "),
    filas: recientes.map((c) => {
      const m = monto(c.valor_contratado, c.divisa, "contratado");
      return {
        titulo: c.descripcion ? desdeMayusculas(c.descripcion) : c.codigo_contrato,
        // El código del contrato y no el del proceso: un proceso por lotes da varios contratos con la misma descripción.
        detalle: [m.otraMoneda, c.unidad_compra, c.codigo_contrato, c.estado_contrato].filter(Boolean).join(" · ") || null,
        href: c.codigo_proceso ? enlace.proceso(c.codigo_proceso) : null,
        externo: false,
        monto: m.monto,
        montoEs: m.montoEs,
        marca: null,
        fecha: c.fecha_adjudicacion || null,
        prefijoFecha: "Adjudicado",
      };
    }),
    total: h.totalRegistro,
    enlace: { href: enlace.proveedor(rpe), texto: "Su ficha de proveedor, con todo su historial" },
  };
}

async function vivoDeEmpresa(rnc: string): Promise<Resultado> {
  const reg = await fichaPorDocumento(rnc);
  if (!reg) {
    return {
      sinFuente: false,
      vivo: {
        fuente: "Registro de Proveedores del Estado (DGCP)",
        leido: new Date().toISOString(),
        ventana: "se relee cada día",
        titulo: "Como proveedora del Estado",
        resumen: "El Registro de Proveedores del Estado no tiene inscrita esta empresa por su RNC.",
        filas: [],
        total: 0,
        enlace: null,
      },
    };
  }
  return { sinFuente: false, vivo: await adjudicado(reg.rpe, `Inscrita en el RPE con el número ${reg.rpe}, en estado «${reg.estado}».`) };
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
    if (n.tipo === "proveedor") return { sinFuente: false, vivo: await adjudicado(n.id, null) };
    if (n.tipo === "empresa") return await vivoDeEmpresa(n.id);
    return { vivo: null, sinFuente: true };
  } catch (err) {
    console.error(`[explorar-vivo] ${ruta}:`, err);
    return { vivo: null, sinFuente: false };
  }
}
