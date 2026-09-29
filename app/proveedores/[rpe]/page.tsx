import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { BarrasHorizontales } from "@/components/graficos";
import { Cifra, Rotulo, TiraDeCifras } from "@/components/papel";
import { notFound } from "next/navigation";
import { getHistorialProveedor, getProveedorRegistro } from "@/lib/dgcp";
import { titulizar } from "@/lib/capitulos";
import { formatFecha, formatMonto, tituloLegible, SIN_DATO } from "@/lib/format";
import { Ruta } from "@/components/ruta";
import Antiguedad from "@/components/antiguedad";
import { hrefInstitucion, institucionPorId } from "@/lib/instituciones";
import AccionesFicha from "@/components/acciones-ficha";
import { Termino } from "@/components/termino";
import { FichaRnc } from "@/components/fuentes-nuevas/ficha-rnc";
import { HistoriaDeProveedor } from "@/components/fuentes-nuevas/historia-compras";
import { diasEntre, getRegistroTributario, tieneFichaDeEmpresa } from "@/lib/rnc";
import { enlace } from "@/lib/grafo";
import { ConectadoCon } from "@/components/conectado-con";
import { provinciaDeTexto } from "@/lib/provincias";
import Conversacion from "@/components/espacios/conversacion";
import { MedidasDelProveedor, NotaOfac } from "@/components/fuentes-nuevas/medidas-proveedor";
import { medidasDeRnc, medidasDeRpe, metaSanciones, ofacDeRnc } from "@/lib/sanciones";

function nContratos(n: number): string {
  return `${n.toLocaleString("es-DO")} ${n === 1 ? "contrato" : "contratos"}`;
}

/** Días o años, en llano. */
function plazoDias(dias: number): string {
  const n = Math.abs(dias);
  if (n < 730) return `${n.toLocaleString("es-DO")} ${n === 1 ? "día" : "días"}`;
  return `${Math.floor(n / 365.25)} años`;
}

/**
 * El RNC de un documento del registro. Al cancelar un RPE la DGCP le pega
 * «@C» al número para liberarlo («132406079@C2»): las nueve cifras de delante
 * siguen siendo el RNC.
 */
function rncDeDocumento(documento: string | null | undefined): string | null {
  const m = /^(\d{9})(?:@C\d*)*$/.exec((documento ?? "").replace(/[\s-]/g, ""));
  return m ? m[1] : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ rpe: string }>;
}) {
  const { rpe } = await params;
  if (!/^\d{1,10}$/.test(rpe)) return { title: "Proveedor no encontrado" };
  // El nombre del proveedor es lo que se busca en Google, no su número de RPE.
  const [registro, medidas] = await Promise.all([
    getProveedorRegistro(rpe).catch(() => null),
    medidasDeRpe(rpe),
  ]);
  const nombre = registro?.razonSocial ?? medidas?.razonSocial;
  return {
    title: nombre ? `${nombre}: proveedor del Estado` : `Proveedor RPE ${rpe}`,
    description: nombre
      ? `Contratos de ${nombre} con el Estado dominicano: a quién le vende, cuánto y desde cuándo, con su ficha del Registro de Proveedores (RPE ${rpe}).`
      : `Contratos del proveedor RPE ${rpe} con el Estado dominicano.`,
    alternates: { canonical: enlace.proveedor(rpe) },
  };
}

export default async function ProveedorPage({
  params,
}: {
  params: Promise<{ rpe: string }>;
}) {
  const { rpe } = await params;
  if (!/^\d{1,10}$/.test(rpe)) notFound();

  const [historial, registro, tributario, conMedidas, metaMedidas] = await Promise.all([
    getHistorialProveedor(rpe),
    getProveedorRegistro(rpe),
    getRegistroTributario(rpe),
    medidasDeRpe(rpe),
    metaSanciones(),
  ]);
  const medidas = conMedidas ?? null;
  /*
    Un proveedor sin contratos también tiene ficha si el registro lo conoce o
    si la DGCP le registra medidas: el directorio de medidas enlaza aquí a
    cientos de inscritos que nunca contrataron (una institución dada de baja,
    una empresa suspendida antes de ganar nada), y antes esta página les
    respondía 404. Solo se niega si ninguna de las tres fuentes lo conoce.
  */
  if (!historial && !registro && !medidas) notFound();

  const contratos = historial?.contratos ?? [];
  const nombre =
    registro?.razonSocial ?? historial?.razonSocial ?? medidas?.razonSocial ?? `RPE ${rpe}`;
  const total = historial?.totalRegistro ?? 0;
  const suma = historial?.montoTotal ?? 0;

  // El RNC con que cruzar las otras listas: el de la tabla de medidas, el del
  // registro en vivo o el del padrón de la DGII, el primero que haya.
  const rnc =
    medidas?.rnc ??
    (registro?.tipoDocumento === "RNC" ? rncDeDocumento(registro.numeroDocumento) : null) ??
    tributario?.rnc ??
    null;
  const [mismoRnc, ofac] = await Promise.all([medidasDeRnc(rnc), ofacDeRnc(rnc)]);
  const otrosConMedidas = mismoRnc.filter((p) => p.rpe !== String(Number(rpe)));

  /*
    Los clientes se agrupan por código de unidad de compra —el que publica la
    DGCP en cada contrato—, no por el nombre: así cada uno enlaza con certeza
    a su ficha de institución, y dos grafías del mismo nombre no se parten.
  */
  const porInstitucion = new Map<
    string,
    { nombre: string; n: number; monto: number; href: string | null }
  >();
  for (const c of contratos) {
    const cod = String(c.codigo_unidad_compra ?? "").trim();
    const clave = cod || `n:${c.unidad_compra}`;
    let a = porInstitucion.get(clave);
    if (!a) {
      const inst = cod ? institucionPorId(cod) : null;
      a = { nombre: c.unidad_compra, n: 0, monto: 0, href: inst ? hrefInstitucion(inst) : null };
      porInstitucion.set(clave, a);
    }
    a.n += 1;
    a.monto += c.valor_contratado || 0;
  }
  const topInstituciones = [...porInstitucion.entries()]
    .sort((a, b) => b[1].monto - a[1].monto)
    .slice(0, 8);

  const maxAnio = Math.max(1, ...(historial?.porAnio ?? []).map((a) => a.monto));

  // Distancia entre la constitución de la empresa y su primer contrato con el
  // Estado. No acusa a nadie: es el dato que el registro permite comprobar y
  // que hasta ahora había que creerse.
  //
  // Si el proveedor tiene más contratos de los que la API devuelve (tope de
  // 1.000), la adjudicación más antigua leída no es la primera de su historia:
  // no se calcula ninguna distancia en vez de calcular una falsa.
  const historiaCompleta = contratos.length >= total;
  const primeraAdjudicacion = historiaCompleta
    ? contratos
        .map((c) => (c.fecha_adjudicacion ?? "").slice(0, 10))
        .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
        .sort()[0]
    : undefined;
  const inicioDgii = tributario?.inicio ?? null;
  const mesesHastaPrimerContrato =
    registro?.fechaCreacion && primeraAdjudicacion
      ? Math.round(
          (new Date(primeraAdjudicacion).getTime() -
            new Date(registro.fechaCreacion).getTime()) /
            (1000 * 60 * 60 * 24 * 30.44),
        )
      : null;

  const recientes = [...contratos]
    .sort(
      (a, b) =>
        new Date(b.fecha_adjudicacion).getTime() -
        new Date(a.fecha_adjudicacion).getTime()
    )
    .slice(0, 25);

  const principal = topInstituciones.find(([, a]) => a.href)?.[1] ?? null;
  const provincia = provinciaDeTexto(registro?.provincia);
  // Solo si el padrón de empresas la publica: nunca una arista a una ficha que no existe.
  const empresa = tributario && (await tieneFichaDeEmpresa(tributario.rnc)) ? tributario.rnc : null;

  return (
    <div className="space-y-5">
      {/* La vuelta de toda ficha es `Ruta`, no un «Volver» hecho a mano. */}
      <Ruta
        seccion="licitaciones"
        padre={{ href: "/proveedores", label: "Proveedores del Estado" }}
        actual={nombre ?? `RPE ${rpe}`}
      />

      <Card as="section" className="p-6">
        <Rotulo>Proveedor del Estado · <Termino clave="rpe" /> {rpe}</Rotulo>
        <h1 className="mt-2 font-display text-3xl leading-tight text-ink">{nombre}</h1>
        <AccionesFicha className="mt-3" tipo="proveedor" id={rpe} titulo={nombre ?? `RPE ${rpe}`} href={enlace.proveedor(rpe)} />
        {/*
          Las tres cifras de la ficha pasan a la tira de casillas de la casa.
          Estaban dibujadas a mano —tres cajas, una de ellas de tinta con el
          texto en papel— en una rejilla de dos columnas que a 390 px dejaba la
          tercera sola en su fila y partía «RD$1,986,088,831» dentro de 150 px.
          `TiraDeCifras` es la forma canónica de un indicador y `Cifra` obliga a
          declarar la base: el número de contratos sale del registro entero, el
          monto solo de los que la API devuelve.
        */}
        {historial ? (
          <>
            <TiraDeCifras className="mt-5 lg:grid-cols-3">
              <Cifra
                etiqueta="Contratos registrados"
                valor={total.toLocaleString("es-DO")}
                nota="lo que el registro declara para este RPE"
              />
              <Cifra
                etiqueta="Monto adjudicado"
                valor={formatMonto(suma, "DOP")}
                tono="text-brand-700"
                nota={`sobre los ${contratos.length.toLocaleString("es-DO")} contratos que devuelve la API`}
              />
              <Cifra
                etiqueta="Instituciones cliente"
                valor={porInstitucion.size.toLocaleString("es-DO")}
                nota="distintas, en esos mismos contratos"
              />
            </TiraDeCifras>
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              Fuente: registro público de contratos de la DGCP. Útil para dimensionar a tu
              competencia antes de ofertar. Los montos incluyen todas las
              adjudicaciones; {formatMonto(historial.montoVigente, "DOP")} corresponden
              a contratos vigentes (sin cancelados ni rescindidos).
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            El registro público de contratos de la DGCP no le asigna ningún contrato a
            este RPE. Lo que sigue es lo que otras fuentes dicen de él.
          </p>
        )}
      </Card>

      <ConectadoCon
        aristas={[
          medidas && {
            etiqueta: "Medidas de la DGCP",
            href: "#medidas",
            cuenta: medidas.eventos.length,
            fuente: "Tabla de proveedores inhabilitados · DGCP",
          },
          ofac && {
            etiqueta: "En la lista SDN de la OFAC",
            href: "#ofac",
            nombre: ofac.nombre,
            fuente: "Tesoro de Estados Unidos",
          },
          principal?.href && {
            etiqueta: "Su mayor cliente",
            href: principal.href,
            nombre: titulizar(principal.nombre),
            fuente: `${principal.n.toLocaleString("es-DO")} contratos · DGCP`,
          },
          {
            etiqueta: "Instituciones que le compran",
            href: "#clientes",
            cuenta: porInstitucion.size,
            fuente: `DGCP · abajo, las ${Math.min(topInstituciones.length, porInstitucion.size)} que más compran`,
          },
          provincia && {
            etiqueta: "Provincia de su domicilio",
            href: enlace.provincia(provincia.slug),
            nombre: provincia.nombre,
            fuente: "Registro de Proveedores",
          },
          empresa && {
            etiqueta: "Su ficha en el padrón de empresas",
            href: enlace.empresa(empresa),
            nombre: `RNC ${empresa}`,
            fuente: "padrón de contribuyentes de la DGII",
          },
        ]}
      />

      {/*
        Lo que pesa sobre el registro va antes que su ficha: responde «¿puede
        venderle al Estado?», que es lo primero que se pregunta quien llega
        aquí. Si no hay nada, no se dice nada: un «sin sanciones» sería un
        certificado que una instantánea con fecha de corte no puede dar.
      */}
      {(medidas || otrosConMedidas.length > 0) && (
        <MedidasDelProveedor
          medidas={medidas}
          otros={otrosConMedidas}
          rnc={rnc}
          meta={metaMedidas}
        />
      )}
      {ofac && <NotaOfac entidad={ofac} fecha={metaMedidas?.fuentes.ofac.fecha ?? null} />}

      {registro && (
        <Card as="section" className="p-6">
          <CardTitle>Ficha de registro</CardTitle>
          <p className="mt-1 text-xs text-ink-soft">
            Lo que el Registro de Proveedores del Estado dice de esta empresa.
          </p>
          <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="rotulo text-ink-soft">{registro.tipoDocumento}</dt>
              <dd className="font-mono font-medium tabular-nums">
                {registro.numeroDocumento || SIN_DATO}
              </dd>
            </div>
            <div>
              <dt className="rotulo text-ink-soft">Estado en el RPE</dt>
              <dd className="font-medium">{registro.estado}</dd>
            </div>
            <div>
              <dt className="rotulo text-ink-soft">Forma jurídica</dt>
              <dd>{registro.formaJuridica || registro.tipoPersona}</dd>
            </div>
            {registro.fechaCreacion && (
              <div>
                <dt className="rotulo text-ink-soft">Constituida</dt>
                <dd className="font-mono tabular-nums">
                  {formatFecha(registro.fechaCreacion)}
                </dd>
              </div>
            )}
            {registro.fechaRegistroRpe && (
              <div>
                <dt className="rotulo text-ink-soft">Inscrita como proveedora</dt>
                <dd className="font-mono tabular-nums">
                  {formatFecha(registro.fechaRegistroRpe)}
                </dd>
              </div>
            )}
            {registro.registroMercantil && (
              <div>
                <dt className="rotulo text-ink-soft">Registro mercantil</dt>
                <dd className="font-mono">{registro.registroMercantil}</dd>
              </div>
            )}
            {registro.clasificacion && (
              <div>
                <dt className="rotulo text-ink-soft">Tamaño declarado</dt>
                <dd>{registro.clasificacion}</dd>
              </div>
            )}
            {registro.provee && (
              <div>
                <dt className="rotulo text-ink-soft">Provee</dt>
                <dd>{registro.provee}</dd>
              </div>
            )}
            {(registro.provincia || registro.municipio) && (
              <div>
                <dt className="rotulo text-ink-soft">Domicilio</dt>
                <dd>
                  {titulizar(
                    [
                      ...new Set(
                        [registro.municipio, registro.provincia].filter(
                          (x): x is string => Boolean(x),
                        ),
                      ),
                    ].join(", "),
                  )}
                </dd>
              </div>
            )}
          </dl>

          {(registro.esMipyme || registro.productorNacional ||
            registro.certificacionMicm) && (
            /*
              Tres marcas dibujadas a mano con su propio relleno y su propio
              radio, sobre la misma escala verde que la primitiva ya conoce.
              `Badge` las pone donde están sus hermanas de `/proveedores`.
            */
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {registro.esMipyme && (
                <li>
                  <Badge variant="valido">MIPYME</Badge>
                </li>
              )}
              {registro.certificacionMicm && (
                <li>
                  <Badge variant="valido">Certificación MICM</Badge>
                </li>
              )}
              {registro.productorNacional && (
                <li>
                  <Badge variant="valido">Productor nacional</Badge>
                </li>
              )}
            </ul>
          )}

          {primeraAdjudicacion && (registro?.fechaCreacion || inicioDgii) && (
            <p className="mt-4 text-sm text-ink-soft">
              Su primer contrato con el Estado que consta en el registro es del{" "}
              <span className="font-semibold text-ink">{formatFecha(primeraAdjudicacion)}</span>
              {registro?.fechaCreacion && mesesHastaPrimerContrato !== null && (
                <>
                  ;{" "}
                  <span className="font-semibold text-ink">
                    {mesesHastaPrimerContrato <= 0
                      ? "menos de un mes"
                      : mesesHastaPrimerContrato < 24
                        ? `${mesesHastaPrimerContrato} ${mesesHastaPrimerContrato === 1 ? "mes" : "meses"}`
                        : `${Math.floor(mesesHastaPrimerContrato / 12)} años`}
                  </span>{" "}
                  después de la constitución que anota el Registro de Proveedores (
                  {formatFecha(registro.fechaCreacion)})
                </>
              )}
              {inicioDgii && (
                <>
                  {registro?.fechaCreacion ? " y " : "; "}
                  <span className="font-semibold text-ink">
                    {plazoDias(diasEntre(inicioDgii, primeraAdjudicacion))}
                  </span>{" "}
                  {diasEntre(inicioDgii, primeraAdjudicacion) >= 0 ? "después" : "antes"} del inicio
                  de operaciones que declara a la DGII ({formatFecha(inicioDgii)})
                </>
              )}
              . Son dos fechas públicas que no siempre coinciden, restadas de la
              adjudicación más antigua que devuelve la API; no significan por sí
              solas nada más que eso.
            </p>
          )}
          {!historiaCompleta && (
            <p className="mt-4 text-xs text-ink-soft">
              Tiene {total.toLocaleString("es-DO")} contratos y la API devuelve{" "}
              {contratos.length.toLocaleString("es-DO")}: el primero de su historia
              puede ser anterior, así que no se calcula cuánto tardó en contratar.
            </p>
          )}

          <p className="mt-3 text-xs text-ink-soft">
            Fuente: Registro de Proveedores del Estado (DGCP). Omitimos a
            propósito los teléfonos y correos de contacto que el registro
            publica: esto es una herramienta de vigilancia, no un directorio
            comercial.
          </p>
        </Card>
      )}

      <FichaRnc rpe={rpe} />

      <HistoriaDeProveedor rpe={rpe} />

      {historial && historial.porAnio.length > 1 && (
        <Card as="section" className="p-6">
          <CardTitle>Contratos por año</CardTitle>
          <BarrasHorizontales
            className="mt-3"
            forma="periodo"
            maximo={maxAnio}
            etiqueta="Monto contratado por año"
            barras={historial.porAnio.map((a) => ({
              clave: String(a.anio),
              etiqueta: a.anio,
              titulo: `${a.anio}: ${formatMonto(a.monto, "DOP")} en ${nContratos(a.n)}`,
              valor: a.monto,
              cifra: formatMonto(a.monto, "DOP"),
              detalle: nContratos(a.n),
            }))}
          />
        </Card>
      )}

      {historial && (
        <div className="grid gap-5 lg:grid-cols-5">
          <Card as="section" id="clientes" className="p-6 lg:col-span-2">
            <CardTitle>Sus principales clientes</CardTitle>
            {porInstitucion.size > topInstituciones.length && (
              <p className="mt-1 text-xs text-ink-soft">
                Los {topInstituciones.length} que más le compraron, de {porInstitucion.size.toLocaleString("es-DO")} instituciones.
              </p>
            )}
            {/*
              Un ranking con nombre es `BarrasHorizontales`: antes eran cajas
              sobre papel con el nombre cortado a un renglón («Hospital
              General Region…») y una cuenta sin unidad («61 ·»).
            */}
            <BarrasHorizontales
              className="mt-3"
              lineas={2}
              etiqueta="Instituciones que más le compraron, por monto"
              barras={topInstituciones.map(([inst, a]) => ({
                clave: inst,
                etiqueta: a.nombre,
                titulo: `${a.nombre}: ${formatMonto(a.monto, "DOP")} en ${nContratos(a.n)}`,
                valor: a.monto,
                cifra: formatMonto(a.monto, "DOP"),
                detalle: nContratos(a.n),
                href: a.href ?? undefined,
              }))}
            />
          </Card>

          <Card as="section" className="p-6 lg:col-span-3">
            <CardTitle>Contratos recientes</CardTitle>
            {/*
              La fila entera lleva al proceso. Antes el enlace era «ver proceso →»
              en 12 px al final de una línea de metadatos que en un teléfono ya
              venía envuelta en tres: el objetivo medía unos ochenta píxeles de
              ancho por dieciséis de alto. Ahora el título se estira sobre la
              fila (`estira`) y la fecha pasa por `Antiguedad` —relativa en la
              fila, exacta en el `title`—, que es la regla para un listado. Son
              filas de una hoja y no una tarjeta por contrato dentro de otra: el
              título va a dos renglones, porque a uno solo «ADQUISICION DE…» se
              repetía veinte veces sin decir qué.
            */}
            <ul className="-mx-6 mt-3 divide-y divide-hairline border-t border-hairline text-sm">
              {recientes.map((c, i) => (
                <li key={i} className="relative px-6 py-3 transition-colors hover:bg-brand-50/40">
                  <span className="flex items-baseline justify-between gap-3">
                    <Link
                      href={enlace.proceso(c.codigo_proceso)}
                      title={c.descripcion}
                      className="line-clamp-2 min-w-0 break-words font-medium leading-snug text-ink estira hover:text-brand-700"
                    >
                      {tituloLegible(c.descripcion || c.codigo_proceso)}
                    </Link>
                    <span className="shrink-0 font-mono font-semibold tabular-nums">
                      {formatMonto(c.valor_contratado, c.divisa)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
                    {c.unidad_compra} ·{" "}
                    <Antiguedad iso={c.fecha_adjudicacion} prefijo="adjudicado" />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
      {/* El RPE sin ceros a la izquierda: un proveedor, una conversación. */}
      <Conversacion className="mt-6" referencia={{ tipo: "proveedor", ref: enlace.proveedor(String(Number(rpe))), titulo: nombre ?? `RPE ${rpe}`, href: enlace.proveedor(String(Number(rpe))) }} />
    </div>
  );
}
