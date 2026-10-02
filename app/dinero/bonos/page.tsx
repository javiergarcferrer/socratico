import type { Metadata } from "next";
import Link from "next/link";
import {
  getTenedores,
  GRUPOS,
  nombreCorte,
  repartoDelMes,
  serieDeGrupo,
  type Acreedores,
  type FilaAcreedor,
} from "@/lib/tenedores";
import { getBalanceBcrd, mesLargo } from "@/lib/banco-central";
import { formatFecha, formatMagnitud, formatMes } from "@/lib/format";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Plegable from "@/components/plegable";
import { Portada, PortadaCifra, PortadaCifras } from "@/components/portada";
import { EstadoVacio } from "@/components/estado-vacio";
import { Termino } from "@/components/termino";
import { IconArrowRight } from "@/components/icons";
import { BarrasHorizontales, Multiples, SerieTemporal, maximoComun, type Punto } from "@/components/graficos";
import { SubastasDeuda } from "@/components/fuentes-nuevas/subastas-deuda";
import { RepartoTenedores } from "@/components/dinero/reparto-tenedores";
import { parte, pesosDeMillones } from "@/components/dinero/formato";

export const metadata: Metadata = {
  alternates: { canonical: "/dinero/bonos" },
  title: "Quién compra los bonos del Estado",
  description:
    "Quién tiene los bonos internos del Estado dominicano —fondos de pensiones, bancos, aseguradoras, personas, inversionistas del exterior— mes a mes desde 2011, a quién le debe el sector público no financiero y a qué tasa se endeuda en pesos, según Crédito Público.",
};

export const revalidate = 86400;

/** El nombre llano de cada acreedor; el del archivo va al lado. */
const LLANO: Record<string, string> = {
  bid: "BID (Banco Interamericano de Desarrollo)",
  "banco mundial": "Banco Mundial",
  caf: "CAF (Banco de Desarrollo de América Latina)",
  fmi: "Fondo Monetario Internacional",
  otros: "Otros organismos multilaterales",
  "otros paises": "Otros países",
  banca: "Bancos del exterior",
  bonos: "Bonos vendidos en el exterior",
  suplidores: "Suplidores del exterior",
  "bonos de recap bcrd (ley 167-07)": "Bonos para recapitalizar el Banco Central (Ley 167-07)",
  "bonos emitidos mh": "Bonos de Hacienda vendidos en el país",
  "titulo canjeado 2/": "Título canjeado",
  "bonos de cdeee": "Bonos de la CDEEE",
  "banca comercial u otras instituciones financieras 3/": "Préstamos de bancos y otras entidades del país",
};

const normal = (t: string) =>
  t.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();

function nombreLlano(f: FilaAcreedor): string {
  const k = normal(f.nombre);
  if (LLANO[k]) return LLANO[k];
  return f.grupo === "bilateral" ? `${f.nombre.trim()} (de gobierno a gobierno)` : f.nombre.trim();
}

function Acreedores({ a }: { a: Acreedores }) {
  const i = a.cortes.length - 1;
  const corte = a.cortes[i];
  const total = a.total[i];
  const detalle = a.filas
    .filter((f) => f.tipo === "detalle" && (f.usd[i] ?? 0) > 0.5)
    .sort((x, y) => (y.usd[i] ?? 0) - (x.usd[i] ?? 0));
  const de = (nombre: string) => a.filas.find((f) => normal(f.nombre) === nombre)?.usd ?? [];
  const externa = de("total deuda externa")[i] ?? 0;
  const oficial = de("total deuda oficial")[i] ?? 0;
  const bonosExterior = de("bonos")[i] ?? 0;
  const etiquetaCorte = nombreCorte(corte);
  const resumen = [
    { nombre: "Organismos multilaterales", fila: "total deuda multilateral" },
    { nombre: "Otros gobiernos", fila: "total deuda bilateral" },
    { nombre: "Bonos vendidos en el exterior", fila: "bonos" },
    { nombre: "Deuda interna", fila: "total deuda interna" },
  ];

  return (
    <Card as="section" className="p-5 sm:p-6">
      <CardTitle>¿A quién le debe el sector público?</CardTitle>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-soft">
        La deuda del <Termino clave="spnf">sector público no financiero</Termino> sumaba {formatMagnitud(total)} en{" "}
        {etiquetaCorte}{corte.preliminar ? ", cifra preliminar" : ""}. El {parte(externa / total)} se debe afuera:{" "}
        {formatMagnitud(oficial)} a organismos y a otros gobiernos, y {formatMagnitud(bonosExterior)} en{" "}
        <Termino clave="bonoGlobal">bonos vendidos en el exterior</Termino>, cuyos tenedores Crédito Público no
        publica.
      </p>
      <BarrasHorizontales
        etiqueta={`Deuda del sector público no financiero por acreedor, ${etiquetaCorte}, en millones de dólares`}
        filas
        className="-mx-5 mt-4 border-y border-hairline sm:-mx-6"
        barras={detalle.map((f) => ({
          clave: `${f.seccion}-${f.nombre}`,
          etiqueta: nombreLlano(f),
          titulo: `${nombreLlano(f)}: ${formatMagnitud(f.usd[i]!)}`,
          valor: f.usd[i]!,
          cifra: (
            <span className="whitespace-nowrap">
              {formatMagnitud(f.usd[i]!)} <span className="text-ink-soft">· {parte(f.usd[i]! / total)}</span>
            </span>
          ),
          detalle: `${f.seccion === "externa" ? "Deuda externa" : "Deuda interna"} · en el archivo: «${f.nombre.trim()}»`,
        }))}
      />
      <Plegable
        className="-mx-5 border-b border-hairline sm:-mx-6"
        etiqueta={`Ver los ${a.cortes.length} cortes en una tabla`}
        etiquetaCerrar="Ocultar la tabla"
      >
        <div className="px-5 py-3 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Acreedor</TableHead>
                {a.cortes.map((c) => (
                  <TableHead key={c.etiqueta} className="text-right">
                    {c.etiqueta}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {resumen.map((r) => (
                <TableRow key={r.fila}>
                  <TableCell>{r.nombre}</TableCell>
                  {de(r.fila).map((v, j) => (
                    <TableCell key={j} numerica className="whitespace-nowrap">
                      {v == null ? "sin dato" : formatMagnitud(v)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                {a.total.map((v, j) => (
                  <TableCell key={j} numerica className="whitespace-nowrap font-semibold">
                    {formatMagnitud(v)}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Plegable>
      <p className="mt-3 text-xs leading-relaxed text-ink-soft">
        «Saldo Deuda Histórico Sector Público No Financiero por Acreedor», Dirección General de Crédito Público, en
        millones de dólares. Los cierres de año van al 31 de diciembre; «*» es preliminar. No incluye la deuda del
        Banco Central, que va aparte más abajo.{" "}
        <a href={a.url} className="font-medium text-brand-700 hover:underline">
          Descargar el archivo
        </a>
        .
      </p>
    </Card>
  );
}

export default async function BonosPage() {
  const [datos, balance] = await Promise.all([getTenedores(), getBalanceBcrd()]);

  if (!datos) {
    return (
      <EstadoVacio
        variante="caida"
        como="h1"
        className="mx-auto max-w-2xl"
        titulo="No pudimos abrir la instantánea de Crédito Público"
        accion={
          <Button asChild variant="secondary">
            <a href="https://www.creditopublico.gob.do/emisiones/interna" target="_blank" rel="noopener noreferrer">
              Ir a las emisiones internas de Crédito Público
            </a>
          </Button>
        }
      >
        El archivo con los tenedores y los acreedores no está o no se pudo leer. Las tasas y el Banco Central
        siguen en pie en el resto de la vertical.
      </EstadoVacio>
    );
  }

  const t = datos.tenedores;
  const a = datos.acreedores;
  const i = t.meses.length - 1;
  const reparto = repartoDelMes(t, i);
  const de = (g: string) => reparto.find((r) => r.grupo === g);
  const pensiones = de("pensiones");
  const bancos = de("bancos");
  const personas = de("personas");
  const extranjeros = de("extranjeros");

  // La historia: el cierre de cada año y el último mes.
  const indices = t.meses.flatMap((m, j) => (m.endsWith("-12") || j === i ? [j] : []));
  const mayores = reparto.slice(0, 4);
  const series = mayores.map((g) => ({ g, s: serieDeGrupo(t, g.grupo) }));
  const maxComun = maximoComun(series.map(({ s }) => indices.map((j) => s[j] * 1e6)));
  const aPuntos = (s: number[], nombre: string): Punto[] =>
    indices.map((j, n) => ({
      clave: t.meses[j],
      valor: s[j],
      lectura: `${t.meses[j].endsWith("-12") ? `Cierre de ${t.meses[j].slice(0, 4)}` : formatMes(t.meses[j])}: ${nombre}, ${pesosDeMillones(s[j])}`,
      marca: n === 0 || n === indices.length - 1 || n % 4 === 0 ? t.meses[j].slice(0, 4) : undefined,
    }));
  const primero = indices[0];

  const valores = balance?.series.valoresEnCirculacion;

  // El mayor movimiento entre familias en un mes de reclasificación, para el ejemplo.
  const familias = Object.keys(GRUPOS) as (keyof typeof GRUPOS)[];
  const porFamilia = new Map(familias.map((g) => [g, serieDeGrupo(t, g)]));
  const salto = t.reclasificaciones
    .map((mes) => {
      const j = t.meses.indexOf(mes);
      if (j < 1) return null;
      const cambios = familias.map((g) => ({ g, d: porFamilia.get(g)![j] - porFamilia.get(g)![j - 1] }));
      const baja = cambios.reduce((x, y) => (y.d < x.d ? y : x));
      const sube = cambios.reduce((x, y) => (y.d > x.d ? y : x));
      return { mes, baja: baja.g, menos: -baja.d, sube: sube.g, mas: sube.d };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.menos > 1000 && x.mas > 1000)
    .sort((x, y) => y.menos - x.menos)[0];

  return (
    <div className="space-y-5">
      <Portada
        rotulo={`Crédito Público · Ministerio de Hacienda y Economía · ${mesLargo(t.meses[i])}`}
        titulo="¿Quién le presta al Estado dominicano?"
        descripcion={
          <>
            Cuando el Estado gasta más de lo que cobra, toma prestado: vende{" "}
            <Termino clave="bono">bonos</Termino> en el país y afuera, y pide préstamos a organismos como el BID.
            Aquí está quién tiene los bonos en pesos, a quién le debe el sector público no financiero y a qué tasa se
            endeuda.
          </>
        }
        aviso={`Instantánea del ${formatFecha(datos.generado)}: el servidor de Crédito Público no acepta lecturas desde la nube`}
      >
        <PortadaCifras>
          <PortadaCifra destacar etiqueta={`Bonos internos, ${formatMes(t.meses[i])}`} valor={pesosDeMillones(t.total[i])} />
          {pensiones && <PortadaCifra etiqueta="De fondos de pensiones" valor={parte(pensiones.parte)} />}
          {bancos && <PortadaCifra etiqueta="De bancos" valor={parte(bancos.parte)} />}
          <PortadaCifra
            etiqueta={`Deuda del sector público no financiero, ${nombreCorte(a.cortes.at(-1)!)}`}
            valor={formatMagnitud(a.total.at(-1)!)}
          />
        </PortadaCifras>
      </Portada>

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle>¿Quién tiene los bonos del Estado en pesos?</CardTitle>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-soft">
          Los {pesosDeMillones(t.total[i])} en bonos internos que debía el sector público en {mesLargo(t.meses[i])},
          repartidos según quién era su <Termino clave="tenedor">tenedor</Termino> ese mes.
          {pensiones && (
            <>
              {" "}Los fondos de pensiones tenían {pesosDeMillones(pensiones.valor)}: si cotizas a una{" "}
              <Termino clave="afp">AFP</Termino>, una parte de tu ahorro para el retiro está prestada al Estado.
            </>
          )}
          {personas && <> Las personas, a su nombre, tenían el {parte(personas.parte)}.</>}
          {extranjeros && <> Desde el exterior, el {parte(extranjeros.parte)}.</>}
        </p>
        <RepartoTenedores t={t} />
        <div className="mt-3 space-y-2 text-xs leading-relaxed text-ink-soft">
          <p>
            «Relación de Tenedores de Bonos Internos Emitidos por el Sector Público», de Crédito Público, en millones
            de pesos, con el registro de <Termino clave="cevaldom">CEVALDOM</Termino>. Cubre los bonos de Hacienda
            vendidos en el país (subastas y leyes de emisión); no los bonos vendidos en el exterior ni los títulos del
            Banco Central. Dice el tipo de tenedor, no su nombre: no dice qué banco ni qué AFP. Las ocho familias son
            una agrupación de Socrático; debajo de cada una va el nombre que usa el archivo.{" "}
            <a href={t.url} className="font-medium text-brand-700 hover:underline">
              Descargar el archivo
            </a>
            .
          </p>
          {t.actualizado && <p>El archivo dice: «{t.actualizado.replace(/\.$/, "")}».</p>}
        </div>
      </Card>

      {series.length > 0 && (
        <Card as="section" className="p-5 sm:p-6">
          <CardTitle>¿Cómo ha cambiado desde {t.meses[primero].slice(0, 4)}?</CardTitle>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-soft">
            Lo que tenía cada una de las cuatro familias mayores al cierre de cada año, y en {mesLargo(t.meses[i])}. En
            total, los bonos internos pasaron de {pesosDeMillones(t.total[primero])} al cierre de{" "}
            {t.meses[primero].slice(0, 4)} a {pesosDeMillones(t.total[i])}.
          </p>
          <Multiples className="mt-2">
            {series.map(({ g, s }) => (
              <figure key={g.grupo}>
                <figcaption className="text-sm font-semibold">{GRUPOS[g.grupo].nombre}</figcaption>
                <SerieTemporal
                  forma="linea"
                  formato="pesos"
                  maximo={maxComun}
                  alto="bajo"
                  className="mt-2"
                  etiqueta={`${GRUPOS[g.grupo].nombre}: de ${pesosDeMillones(s[primero])} en ${t.meses[primero].slice(0, 4)} a ${pesosDeMillones(s[i])} en ${formatMes(t.meses[i])}`}
                  puntos={aPuntos(
                    s.map((v) => v * 1e6),
                    GRUPOS[g.grupo].nombre.toLowerCase(),
                  )}
                />
              </figure>
            ))}
          </Multiples>
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">
            CEVALDOM reorganizó la clasificación de los tenedores en{" "}
            {t.reclasificaciones.map((r) => formatMes(r)).join(", ")}: un salto en esos meses puede ser un tenedor que
            cambió de casilla, no una compra.
            {salto &&
              ` En ${mesLargo(salto.mes)}, por ejemplo, ${GRUPOS[salto.baja].nombre.toLowerCase()} bajó ${pesosDeMillones(salto.menos)} y ${GRUPOS[salto.sube].nombre.toLowerCase()} subió ${pesosDeMillones(salto.mas)}.`}
            {t.descuadres.length > 0 &&
              ` El archivo trae ${t.descuadres.length === 1 ? "un mes viejo que no cuadra" : `${t.descuadres.length} descuadres en meses viejos`} (${[...new Set(t.descuadres.map((d) => formatMes(d.slice(0, 7))))].join(", ")}): se publican tal cual.`}
          </p>
        </Card>
      )}

      <SubastasDeuda />

      <Acreedores a={a} />

      {valores && (
        <Card as="section" className="p-5 sm:p-6">
          <CardTitle>¿Y la deuda del Banco Central?</CardTitle>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-soft">
            El Banco Central también vende sus propios títulos —certificados, notas, letras— para sacar pesos de la
            economía. Tenía{" "}
            <span className="font-mono font-semibold text-ink">
              {pesosDeMillones(valores.dia?.valor ?? valores.meses.at(-1)!.valor)}
            </span>{" "}
            en circulación {valores.dia ? `al ${formatFecha(valores.dia.fecha)}` : `en ${mesLargo(valores.meses.at(-1)!.periodo)}`}. Es
            deuda del Banco Central y no está en las cifras de arriba, que son las del sector público no financiero.
            Lo que sí está arriba son los bonos que Hacienda le entregó al Banco Central para cubrir parte de sus
            pérdidas (Ley 167-07, la recapitalización). Los archivos del Banco Central que leemos no dicen quién tiene
            sus títulos.
          </p>
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link href="/dinero/banco-central">
                El Banco Central por dentro
                <IconArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </Card>
      )}

      <Card as="section" className="p-5 sm:p-6">
        <CardTitle>Lo que estas cifras no dicen</CardTitle>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-soft">
          <li>
            <span className="text-ink">Quién tiene los bonos vendidos en el exterior.</span> Son la mayor parte de la
            deuda externa y Crédito Público no publica sus tenedores.
          </li>
          <li>
            <span className="text-ink">Qué banco, qué AFP, qué persona.</span> La relación cuenta por tipo de tenedor;
            no da nombres.
          </li>
          <li>
            <span className="text-ink">Quién tiene los títulos del Banco Central.</span> El balance dice cuánto debe,
            no a quién.
          </li>
        </ul>
        <p className="mt-3 text-sm">
          <Link href="/finanzas/guia/deuda" className="font-medium text-brand-700 hover:underline">
            Qué es la deuda pública
          </Link>
          {" · "}
          <Link href="/deuda" className="font-medium text-brand-700 hover:underline">
            Cómo ha crecido desde el año 2000
          </Link>
          {" · "}
          <Link href="/fuentes" className="font-medium text-brand-700 hover:underline">
            Todas las fuentes y sus límites
          </Link>
        </p>
      </Card>
    </div>
  );
}
