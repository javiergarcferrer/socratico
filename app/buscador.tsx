"use client";

import Link from "next/link";
import { useQueryStates } from "nuqs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { claves, leerJson, useRebotado } from "@/lib/consultas";
import type { OrdenProceso, Proceso } from "@/lib/dgcp";
/*
  Las etapas se importan de `lib/estados.ts` y no de `lib/dgcp.ts`: son
  vocabulario de interfaz —color y condición del estado— y este componente es
  de cliente. Traerlas del adaptador metería sus mil doscientas líneas de
  acceso a la DGCP en el bundle del navegador para leer cinco etiquetas.
*/
import {
  ETAPAS,
  etapaDe,
  etapaPorClave,
  type EtapaClave,
} from "@/lib/estados";
import ProcesoCard from "@/components/proceso-card";
import CampoLicitaciones from "@/components/campo-licitaciones";
import { FILTROS_LICITACIONES } from "@/components/licitaciones-url";
import { cn } from "@/lib/cn";
import { BottomSheet } from "@/components/bottom-sheet";
import {
  IconDownload,
  IconFilter,
  IconRss,
  IconSliders,
  IconX,
} from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EstadoVacio } from "@/components/estado-vacio";
import { Paginador } from "@/components/paginador";

interface FiltrosProps {
  etapa: EtapaFiltro;
  setEtapa: (v: EtapaFiltro) => void;
  modalidad: string;
  setModalidad: (v: string) => void;
  unidades: Unidad[];
  unidadTexto: string;
  setUnidadTexto: (v: string) => void;
  unidadSel: Unidad | null;
  startdate: string;
  setStartdate: (v: string) => void;
  enddate: string;
  setEnddate: (v: string) => void;
  orden: Orden;
  setOrden: (v: Orden) => void;
  mipyme: boolean;
  setMipyme: (v: boolean) => void;
}

/**
 * Radix no admite la cadena vacía como valor de una opción —la reserva para
 * «no hay nada elegido»—, así que «todas» viaja como un centinela explícito y
 * se traduce en los dos sentidos. El estado de la página sigue siendo `""`,
 * que es lo que la URL y la API entienden.
 */
const TODAS = "__todas__";

/** Etapa seleccionada; `""` es «todas», que no filtra nada. */
type EtapaFiltro = EtapaClave | "";

/** La etapa con la que abre el buscador: la pregunta del titular. */
const ETAPA_INICIAL: EtapaFiltro = "abiertos";

const MODALIDADES = [
  "Compras por Debajo del Umbral",
  "Contratación Menor",
  "Comparación de Precios",
  "Licitación Pública Nacional",
  "Licitación Pública Internacional",
  "Procesos de Excepción",
  "Subasta Inversa",
  "Sorteo de Obras",
];

/*
  El orden no se re-declara aquí. Es la misma enumeración que la ruta usa de
  allowlist (`ORDENES` en lib/dgcp.ts): si las dos listas divergieran, el
  `<select>` ofrecería un valor que el servidor descarta y el listado saldría
  ordenado por otra cosa mientras el control afirma lo contrario — un control
  sin efecto, que es justo lo que el gate persigue. Es un import de tipo: se
  borra al compilar y no arrastra el adaptador al bundle.
*/
type Orden = OrdenProceso;

interface Unidad {
  codigo: number;
  nombre: string;
  acronimo: string;
  /** Enlace a su ficha de institución, si está en el cruce (lo pone `/api/unidades`). */
  ficha?: string;
}

/**
 * Tope de filas que lee la descarga: `MAX_FILAS_DESCARGA` de `lib/dgcp.ts`
 * (seis páginas de 1000). Se repite aquí como literal porque importar el valor
 * metería el adaptador entero en el bundle del navegador; si uno cambia, el
 * otro también.
 */
const TOPE_DESCARGA = 6000;

function etiquetaUnidad(u: Unidad): string {
  return u.acronimo && u.acronimo !== "N/A" ? `${u.nombre} (${u.acronimo})` : u.nombre;
}

interface ApiResult {
  content: Proceso[];
  totalResults: number;
  pages: number;
  page: number;
  scanned?: number;
  truncated?: boolean;
  muestra?: boolean;
  error?: string;
}

/** Vacía y estable: una lista nueva en cada render dispararía los efectos que la leen. */
const SIN_UNIDADES: Unidad[] = [];

function hoyMenosDias(dias: number): string {
  const d = new Date(Date.now() - dias * 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * La etapa que pide la URL.
 *
 * `?etapa=` es lo que se escribe hoy. `?estado=` es lo que llevan los enlaces
 * compartidos y las búsquedas guardadas de antes —`lib/busquedas.ts` guarda el
 * querystring crudo—, así que un estado literal de la DGCP se traduce a su
 * etapa en vez de quedar ignorado. `?estado=` vacío era «todos los estados»:
 * se conserva.
 */
function etapaDeUrl(etapa: string | null, estado: string | null): EtapaFiltro {
  if (etapa !== null) return (etapaPorClave(etapa)?.clave ?? "") as EtapaFiltro;
  if (estado !== null) return estado ? etapaDe(estado).clave : "";
  return ETAPA_INICIAL;
}

export default function Buscador() {
  /*
    Los filtros **son** la URL: `nuqs` la lee y la escribe, y el estado de la
    página se deriva de ella. Antes había dos copias —estado de React y
    querystring— y un efecto que las reconciliaba con `replaceState` y una
    bandera de primer render; una navegación de fuera (una búsqueda guardada,
    «atrás») tenía que re-aplicarse a mano. Ahora no hay nada que reconciliar.

    Cada cambio de filtro **reemplaza** la entrada del historial, como antes:
    tocar un filtro no es navegar, y «atrás» sale de la búsqueda en vez de
    deshacer los filtros de uno en uno.
  */
  const [url, setUrl] = useQueryStates(FILTROS_LICITACIONES);
  const q = url.q;
  const modalidad = url.modalidad;
  const enddate = url.hasta;
  const mipyme = url.mipyme;
  const orden: Orden = url.orden;
  const page = Math.max(1, url.page);
  const etapa = etapaDeUrl(url.etapa, url.estado);
  // `desde=` vacío es «todo el histórico»; su ausencia, la ventana de 30 días.
  const startdate = url.desde ?? hoyMenosDias(30);
  const etapaSel = etapaPorClave(etapa);

  /*
    Un enlace viejo con `?estado=` se reescribe a su `?etapa=` en cuanto se
    lee, igual que hacía la reconciliación de antes: la URL que queda en la
    barra —la que se copia y se guarda— es la de hoy.
  */
  useEffect(() => {
    if (url.estado === null) return;
    const e = etapaDeUrl(url.etapa, url.estado);
    setUrl({ estado: null, etapa: e === ETAPA_INICIAL ? null : e });
  }, [url.estado, url.etapa, setUrl]);

  /*
    Cualquier cambio de filtro reinicia la paginación, y lo hace **el propio
    cambio**: cada setter escribe su filtro y `page: null` en la misma
    actualización de la URL. Antes lo hacía un efecto que comparaba la firma
    de los filtros con la del render anterior, y ese efecto también saltaba
    cuando los filtros llegaban de fuera —una búsqueda guardada con `page=3`
    abría en la 1—. Leer la URL al montar o al volver ya no toca la página.
  */
  const setEtapa = useCallback(
    (v: EtapaFiltro) =>
      setUrl({ etapa: v === ETAPA_INICIAL ? null : v, estado: null, page: null }),
    [setUrl],
  );
  const setModalidad = useCallback(
    (v: string) => setUrl({ modalidad: v || null, page: null }),
    [setUrl],
  );
  const setStartdate = useCallback(
    (v: string) => setUrl({ desde: v === hoyMenosDias(30) ? null : v, page: null }),
    [setUrl],
  );
  const setEnddate = useCallback((v: string) => setUrl({ hasta: v || null, page: null }), [setUrl]);
  const setMipyme = useCallback((v: boolean) => setUrl({ mipyme: v, page: null }), [setUrl]);
  const setOrden = useCallback((v: Orden) => setUrl({ orden: v, page: null }), [setUrl]);
  const setPage = useCallback((p: number) => setUrl({ page: p }), [setUrl]);

  /*
    La institución se escribe con su nombre y viaja con su código. El texto
    del campo es estado local —mientras se teclea no nombra ninguna—, y `?uc=`
    se pone solo cuando el texto coincide con una de la lista. Al revés, si
    `?uc=` cambia desde fuera (una búsqueda guardada, «atrás»), el campo pasa a
    decir el nombre de esa institución.
  */
  // La lista no cambia en una visita: se pide una vez y la comparte cualquier
  // montaje del buscador. Si no llega, el campo sigue siendo texto libre.
  const { data: listaUnidades } = useQuery({
    queryKey: claves.unidades,
    queryFn: ({ signal }) => leerJson<Unidad[]>("/api/unidades", signal),
    staleTime: 60 * 60_000,
  });
  const unidades = Array.isArray(listaUnidades) ? listaUnidades : SIN_UNIDADES;
  const [unidadTexto, setUnidadTextoLocal] = useState("");

  const setUnidadTexto = useCallback(
    (v: string) => {
      setUnidadTextoLocal(v);
      const uc = unidades.find((x) => etiquetaUnidad(x) === v)?.codigo ?? null;
      // Teclear sin cambiar de institución no es cambiar de filtro.
      if (uc !== url.uc) setUrl({ uc, page: null });
    },
    [unidades, url.uc, setUrl],
  );

  useEffect(() => {
    if (unidades.length === 0) return;
    const u = url.uc !== null ? unidades.find((x) => x.codigo === url.uc) : undefined;
    if (u) {
      setUnidadTextoLocal(etiquetaUnidad(u));
    } else if (url.uc !== null) {
      // Un código que no está en la lista no filtra nada: se quita, como antes.
      setUrl({ uc: null });
    } else {
      // Sin `?uc=`, el campo solo se vacía si decía una institución entera; un
      // nombre a medio escribir es del usuario y se queda.
      setUnidadTextoLocal((t) =>
        unidades.some((x) => etiquetaUnidad(x) === t) ? "" : t,
      );
    }
  }, [url.uc, unidades, setUrl]);

  const unidadSel = useMemo(
    () => (url.uc !== null ? (unidades.find((u) => u.codigo === url.uc) ?? null) : null),
    [unidades, url.uc]
  );

  /*
    El listado es una consulta de TanStack Query con los filtros por clave.
    Cambiar un filtro cambia la clave: la petición anterior se cancela sola y
    una respuesta tardía ya no puede pisar la nueva. Mientras llega la página
    siguiente se queda la anterior en pantalla (`keepPreviousData`), atenuada
    por `aria-busy`, nunca un esqueleto encima de lo que se estaba leyendo.

    El texto espera 450 ms a que se deje de teclear; el resto de filtros, y
    borrar el texto, piden en el acto.
  */
  const qConsulta = useRebotado(q.trim(), q.trim() ? 450 : 0);
  const paramsListado = (() => {
    const params = new URLSearchParams();
    if (qConsulta) params.set("q", qConsulta);
    if (etapa) params.set("etapa", etapa);
    if (modalidad) params.set("modalidad", modalidad);
    if (startdate) params.set("startdate", startdate);
    if (enddate) params.set("enddate", enddate);
    if (mipyme) params.set("mipyme", "true");
    if (unidadSel) params.set("unidad_compra", String(unidadSel.codigo));
    // El orden viaja al servidor: ordenar aquí solo reordenaba las 24 filas
    // de la página y el control decía «Mayor monto» de miles de procesos.
    if (orden !== "recientes") params.set("orden", orden);
    params.set("page", String(page));
    params.set("limit", "24");
    return params.toString();
  })();
  const listado = useQuery({
    queryKey: claves.procesos(paramsListado),
    queryFn: ({ signal }) => leerJson<ApiResult>(`/api/procesos?${paramsListado}`, signal),
    placeholderData: keepPreviousData,
  });
  const data = listado.data ?? null;
  const loading = listado.isFetching;
  const error = listado.error ? listado.error.message || "Error inesperado" : null;
  const reintentar = () => void listado.refetch();

  /*
    La lista llega ya filtrada y ordenada, y paginada de verdad.

    Aquí vivían dos cosas que decían algo falso. Una: el orden se aplicaba
    sobre `data.content`, o sea sobre las 24 filas de la página, mientras el
    control ofrecía «Mayor monto» de un rango de miles. Otra: en modo búsqueda
    la capa recortaba a 300 coincidencias y esta lista las soltaba de 24 en 24
    con un «Mostrar más», así que la 301 no existía y nadie lo decía. Las dos
    se arreglan en el mismo sitio —`listProcesos` ordena y pagina lo que
    declara haber barrido—, y aquí solo se pinta.
  */
  const lista = data?.content ?? [];
  const enBusqueda = q.trim().length > 0;
  /* El conteo sale del barrido, no del censo: la interfaz está obligada a decirlo. */
  const esMuestra = Boolean(data?.muestra);

  /*
    La descarga es el barrido entero, no la página. Antes el CSV traía las 24
    filas visibles; ahora lo arma el servidor (`/api/procesos/csv`) con los
    mismos filtros que el listado y sin paginar, hasta el tope de registros
    que el listado ya declara leer. El botón dice cuántas filas baja.
  */
  const csvHref = (() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (etapa) params.set("etapa", etapa);
    if (modalidad) params.set("modalidad", modalidad);
    if (startdate) params.set("startdate", startdate);
    if (enddate) params.set("enddate", enddate);
    if (mipyme) params.set("mipyme", "true");
    if (unidadSel) params.set("unidad_compra", String(unidadSel.codigo));
    if (orden !== "recientes") params.set("orden", orden);
    return `/api/procesos/csv?${params}`;
  })();
  const filasCsv = data
    ? esMuestra
      ? data.totalResults
      : Math.min(data.totalResults, TOPE_DESCARGA)
    : 0;
  const csvRecortado = Boolean(data && (esMuestra ? data.truncated : data.totalResults > TOPE_DESCARGA));

  const [sheetOpen, setSheetOpen] = useState(false);
  const [barraOculta, setBarraOculta] = useOcultarAlBajar(!sheetOpen);

  /**
   * Devuelve la búsqueda a los filtros con los que abre. No es «limpiar»: la
   * etapa y la ventana de treinta días **vuelven a ponerse**, porque son los
   * valores de entrada y quitarlos sería otra búsqueda distinta. Lo usan el
   * enlace de escritorio y la pantalla de «sin resultados», donde en un
   * teléfono los chips quedaron fuera de pantalla.
   */
  const limpiarFiltros = useCallback(() => {
    setUnidadTextoLocal("");
    setUrl({
      etapa: null,
      estado: null,
      modalidad: null,
      uc: null,
      mipyme: null,
      desde: null,
      hasta: null,
      page: null,
    });
  }, [setUrl]);

  /*
    Todos los filtros puestos, incluidos los que vienen por defecto.
    Emitir un chip solo cuando el valor difiere del inicial deja invisibles
    justo los dos que más recortan —etapa y ventana de fechas—: quien busca
    «hospital» y ve «0 coincidencias» nunca se entera de que está mirando
    treinta días de procesos abiertos. El estado del sistema que más pesa no
    puede ser el que se le pide recordar sin habérselo dicho.

    `porDefecto` los distingue en gris: quitarlos **abre** la búsqueda en vez
    de restaurar nada.

    La fecha dice «publicados» y no solo «últimos 30 días» porque el filtro
    corre sobre la **publicación**, no sobre el cierre. Es lo que hace que un
    proceso que cerró ayer pero se publicó hace dos meses no salga; sin la
    palabra, la ausencia parece un hueco de la fuente y es la ventana pedida.
  */
  const chips: {
    key: string;
    label: string;
    clear: () => void;
    porDefecto?: boolean;
  }[] = [];
  chips.push(
    etapa === ETAPA_INICIAL
      ? {
          key: "etapa",
          label: "solo abiertos",
          porDefecto: true,
          clear: () => setEtapa(""),
        }
      : etapaSel
        ? { key: "etapa", label: etapaSel.label.toLowerCase(), clear: () => setEtapa("") }
        : {
            key: "etapa",
            label: "todas las etapas",
            porDefecto: true,
            clear: () => setEtapa(ETAPA_INICIAL),
          },
  );
  if (modalidad) chips.push({ key: "mod", label: modalidad, clear: () => setModalidad("") });
  if (unidadSel)
    chips.push({
      key: "uc",
      label:
        unidadSel.acronimo && unidadSel.acronimo !== "N/A"
          ? unidadSel.acronimo
          : unidadSel.nombre,
      clear: () => setUnidadTexto(""),
    });
  if (mipyme) chips.push({ key: "mip", label: "MIPYMES", clear: () => setMipyme(false) });
  chips.push(
    startdate === hoyMenosDias(30)
      ? {
          key: "desde",
          label: "publicados: últimos 30 días",
          porDefecto: true,
          clear: () => setStartdate(""),
        }
      : startdate
        ? { key: "desde", label: `publicados desde ${startdate}`, clear: () => setStartdate(hoyMenosDias(30)) }
        : { key: "desde", label: "todo el histórico", porDefecto: true, clear: () => setStartdate(hoyMenosDias(30)) },
  );
  if (enddate) chips.push({ key: "hasta", label: `hasta ${enddate}`, clear: () => setEnddate("") });

  const filtros: FiltrosProps = {
    etapa, setEtapa, modalidad, setModalidad, unidades, unidadTexto,
    setUnidadTexto, unidadSel, startdate, setStartdate, enddate, setEnddate,
    orden, setOrden, mipyme, setMipyme,
  };

  const feedHref = (() => {
    const f = new URLSearchParams();
    if (q.trim()) f.set("q", q.trim());
    // Siempre, incluso vacío: `etapa=` es «todas» y su ausencia es «abiertos».
    f.set("etapa", etapa);
    if (modalidad) f.set("modalidad", modalidad);
    if (mipyme) f.set("mipyme", "1");
    if (unidadSel) f.set("uc", String(unidadSel.codigo));
    return `/api/feed?${f.toString()}`;
  })();

  return (
    <div className="space-y-5">
      {/*
        Encabezado y, debajo, el campo de texto de esta vertical. El campo vivía
        en la cabecera global —solo en compras—, donde la misma franja buscaba
        cosas distintas según la página; aquí dice debajo qué recorre.
      */}
      <div className="space-y-3 pt-1">
        <div>
          <h1 className="font-display text-2xl leading-tight text-ink sm:text-3xl">
            ¿Qué está comprando el Estado ahora mismo?
          </h1>
          <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-ink-soft">
            <span className="relative inline-block h-1.5 w-1.5 rounded-md border border-brand-200 bg-brand-500 text-brand-500">
              <span className="live-dot" />
            </span>
            En vivo desde la API de datos abiertos de la DGCP
          </p>
        </div>
        <div className="max-w-2xl">
          <CampoLicitaciones />
        </div>
      </div>

      {/* Filtros — panel en escritorio */}
      <Card as="section" className="hidden p-5 lg:block">
        <CardTitle className="flex items-center gap-2">
          <IconFilter className="h-4 w-4 text-brand-600" />
          Filtros
        </CardTitle>
        <div className="mt-4">
          <FiltrosControles {...filtros} />
        </div>
      </Card>

      {/*
        Barra de control en móvil: el botón de filtros y los filtros puestos,
        en **una** fila de 48 px que se desliza de lado.

        Medida a 390 × 844 con la página desplazada, la barra de antes —botón,
        conteo y una segunda fila de chips— ocupaba 111 px; con la cabecera y
        la tab bar, el chrome fijo se llevaba el 28 % de la pantalla y el
        conteo salía dos veces en la primera vista. El conteo se queda donde
        declara su base, sobre los resultados; aquí sobraba.

        Se aparta al bajar y vuelve en cuanto se sube —o en cuanto uno de sus
        controles recibe el foco—, que es cuando se quiere cambiar un filtro.
        Con movimiento reducido cambia sin desplazarse.

        Se pega justo debajo del header: 64 px de caja, su filete de un píxel y
        el recorte superior del teléfono (`app/layout.tsx`). Con cinco píxeles
        de menos su borde quedaba bajo la banda de tinta y los chips salían
        recortados por arriba.
      */}
      <div
        data-oculta={barraOculta || undefined}
        onFocusCapture={() => setBarraOculta(false)}
        className="sticky z-30 -mx-4 flex h-12 items-center gap-2 border-b border-hairline bg-canvas px-4 transition-transform duration-200 ease-out motion-reduce:transition-none data-[oculta]:-translate-y-full lg:hidden"
        style={{ top: "calc(65px + env(safe-area-inset-top, 0px))" }}
      >
        <Button
          variant="secondary"
          onClick={() => setSheetOpen(true)}
          className="shrink-0 px-3"
        >
          <IconSliders className="h-4 w-4 text-brand-600" />
          Filtros
          {chips.length > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 font-mono text-[11px] font-semibold tabular-nums text-canvas">
              {chips.length}
            </span>
          )}
        </Button>
        {chips.length > 0 && (
          <div
            role="group"
            aria-label="Filtros puestos"
            className="no-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto"
          >
            {/*
              En el teléfono el chip mide 40 px de alto con 8 px de aire entre
              chips: es el mínimo con el que un pulgar acierta el aspa de
              quitar el filtro. En escritorio, donde hay puntero, se queda
              compacto —la fila de abajo, `hidden lg:flex`, pasa su propia
              medida.
            */}
            {chips.map((c) => (
              <Chip key={c.key} chip={c} className="h-10 shrink-0 px-3">
                <span className="max-w-[11rem] truncate">{c.label}</span>
              </Chip>
            ))}
          </div>
        )}
      </div>

      {/* Filtros — hoja inferior en móvil */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filtros"
        footer={
          <Button onClick={() => setSheetOpen(false)} className="h-12 w-full">
            {data
              ? `Ver ${data.totalResults.toLocaleString("es-DO")} resultados`
              : "Ver resultados"}
          </Button>
        }
      >
        <div className="pb-2">
          <FiltrosControles {...filtros} />
        </div>
      </BottomSheet>

      {/* Resultados */}
      <section>
        {chips.length > 0 && (
          <div className="mb-3 hidden flex-wrap items-center gap-1.5 lg:flex">
            {chips.map((c) => (
              <Chip key={c.key} chip={c}>
                {c.label}
              </Chip>
            ))}
            <Button
              variant="link"
              size="sm"
              onClick={limpiarFiltros}
              className="ml-1 h-auto px-0 text-xs font-medium text-ink-soft hover:text-brand-700"
            >
              Limpiar todo
            </Button>
          </div>
        )}
        {unidadSel?.ficha && (
          <p className="mb-3 text-sm text-ink-soft">
            Procesos de {unidadSel.nombre}.{" "}
            <Link href={unidadSel.ficha} className="font-medium text-brand-700 hover:underline">
              Ver la ficha de la institución
            </Link>{" "}
            —su presupuesto, sus proveedores, su nómina y sus decretos.
          </p>
        )}
        {/*
          El conteo cambia sin recargar la página: sin `aria-live` un lector de
          pantalla no se entera de que la búsqueda terminó ni de cuántos
          resultados hay. `polite` espera a que el usuario deje de teclear;
          `atomic` lee la frase entera («384 procesos») y no solo el número que
          cambió.
        */}
        <div className="mb-3 space-y-2.5">
          {/*
            En el teléfono el conteo va en su propia línea y los dos botones
            debajo. Compartiendo fila, la frase que declara la base —«entre
            6,000 registros del rango — rango amplio: acota las fechas»— caía
            en una columna de ciento cincuenta píxeles y cuatro renglones al
            lado de dos botones. Y esa frase es justo lo que impide usar una
            muestra como censo: no puede ser lo que se estrangula.
          */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-3">
            <div
              aria-live="polite"
              aria-atomic="true"
              className="min-w-0 text-sm text-ink-soft sm:flex-1"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-600" />
                  Consultando la DGCP…
                </span>
              ) : error ? (
                <span className="text-alerta-700">{error}</span>
              ) : data ? (
                <span>
                  <strong className="text-ink">
                    {data.totalResults.toLocaleString("es-DO")}
                  </strong>{" "}
                  {enBusqueda ? "coincidencias" : "procesos"}
                  {/*
                    La base se declara siempre que el conteo salga del barrido,
                    no solo al buscar texto: filtrar por etapa u ordenar por
                    monto también cuenta sobre la muestra, y un número sin su
                    base invita a usarlo de denominador.
                  */}
                  {esMuestra && data.scanned
                    ? ` · entre ${data.scanned.toLocaleString("es-DO")} registros del rango`
                    : ""}
                  {esMuestra && data.truncated
                    ? " — rango amplio: acota las fechas para contarlos todos"
                    : ""}
                </span>
              ) : null}
            </div>
            {!loading && lista.length > 0 && (
              <span className="flex shrink-0 items-center gap-2">
                {/*
                  El botón dice cuántas filas baja. Antes ponía «CSV» a secas
                  junto a un encabezado que anuncia miles de procesos, y el
                  archivo trae solo las de esta página: quien lo abre cree tener
                  el conjunto y cita veinticuatro filas. Es el peor error de
                  esta casa —silencioso y citable—, y se cierra diciendo el
                  alcance en el propio control.
                */}
                <Button asChild variant="secondary" size="sm" className="h-10 sm:h-9">
                  <a
                    href={csvHref}
                    download
                    title={
                      csvRecortado
                        ? `Descarga las ${filasCsv.toLocaleString("es-DO")} filas halladas entre los ${TOPE_DESCARGA.toLocaleString("es-DO")} registros más recientes del rango: acota las fechas para bajarlo entero`
                        : `Descarga las ${filasCsv.toLocaleString("es-DO")} filas de esta búsqueda, todas las páginas, con los filtros puestos`
                    }
                  >
                    <IconDownload className="h-4 w-4" /> CSV ({filasCsv.toLocaleString("es-DO")}
                    {csvRecortado ? ", muestra" : ""})
                  </a>
                </Button>
                <Button asChild variant="secondary" size="sm" className="h-10 sm:h-9">
                  <a
                    href={feedHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Suscríbete a esta búsqueda con cualquier lector RSS y entérate de los procesos nuevos"
                  >
                    <IconRss className="h-4 w-4" /> RSS
                  </a>
                </Button>
              </span>
            )}
          </div>
          {/*
            El paginador ya vale también en modo búsqueda: la capa pagina de
            verdad las coincidencias en vez de recortarlas a 300.
          */}
          {data && data.pages > 1 && (
            <Paginador
              etiqueta="Paginación de los resultados (arriba)"
              pagina={data.page}
              paginas={data.pages}
              pendiente={loading}
              onPage={setPage}
            />
          )}
        </div>

        {/*
          Mientras llega la página siguiente o un filtro nuevo, los resultados
          anteriores se quedan a la vista, atenuados: cambiar la rejilla por
          un esqueleto en cada clic hacía saltar la página y perder el sitio.
          El esqueleto solo aparece cuando aún no hay nada que mostrar.
        */}
        {loading && lista.length === 0 && !error ? (
          <div className="grid gap-3 md:grid-cols-2" role="status" aria-busy="true">
            <span className="sr-only">Consultando la DGCP…</span>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-lg border border-hairline" />
            ))}
          </div>
        ) : error ? (
          /*
            «No hay resultados» y «la fuente no contestó» son dos cosas
            distintas, y antes se pintaban igual: una rejilla vacía con una
            línea ocre de 12px. Sin esta rama, quien tropieza con un 502 de la
            DGCP se queda con una página en blanco y sin la única acción útil.
          */
          <Alert variant="aviso" className="px-5 py-10 text-center">
            <p className="font-sans text-sm font-semibold text-ink">
              La DGCP no respondió
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-soft">
              No es un problema de tu búsqueda: los filtros siguen puestos. La
              fuente oficial no contestó a tiempo.
            </p>
            <Button type="button" onClick={reintentar} className="mt-4">
              Reintentar
            </Button>
          </Alert>
        ) : lista.length === 0 ? (
          <EstadoVacio
            titulo="Sin resultados con estos filtros"
            /*
              En el teléfono los filtros que recortaron la búsqueda quedaron
              arriba, fuera de pantalla: sin esta acción hay que desplazarse de
              vuelta a la barra y quitarlos de uno en uno. La acción devuelve
              la búsqueda a como abre.
            */
            accion={
              <Button variant="secondary" onClick={limpiarFiltros}>
                Volver a los filtros de entrada
              </Button>
            }
          >
            {/*
              Pedir una etapa cerrada dentro de una ventana corta devuelve poco
              o nada, y la razón no se adivina: la ventana corre sobre la fecha
              de **publicación**. Un proceso que cerró la semana pasada pudo
              publicarse dos meses antes. Decirlo aquí es la diferencia entre
              «la plataforma no los tiene» y «pídelos bien».
            */}
            {!startdate && !etapaSel
              ? // Ya es todo el histórico y todas las etapas: ampliar no queda.
                "Ningún proceso de los leídos lleva todas esas palabras. Prueba con menos, o busca por el código exacto del proceso."
              : etapaSel && etapaSel.clave !== "abiertos"
                ? "El rango de fechas filtra por publicación, no por cierre: un proceso que acaba de cerrar pudo publicarse mucho antes. Amplía «Publicado desde» para alcanzarlo."
                : "Prueba ampliar el rango de fechas o quitar el filtro de etapa."}
          </EstadoVacio>
        ) : (
          <div
            aria-busy={loading}
            className={cn(
              "grid gap-3 transition-opacity duration-200 md:grid-cols-2",
              loading && "pointer-events-none opacity-50",
            )}
          >
            {lista.map((p) => (
              <ProcesoCard key={p.codigo_proceso} p={p} />
            ))}
          </div>
        )}

        {/*
          Y el paginador otra vez al pie. En escritorio la rejilla son dos
          columnas y el de arriba queda siempre cerca; en un teléfono son
          veinticuatro tarjetas en una sola columna, y al llegar al final el
          único control para seguir estaba a seis pantallas de desplazamiento
          hacia atrás.
        */}
        {!error && lista.length > 0 && data && data.pages > 1 && (
          <Paginador
            pagina={data.page}
            paginas={data.pages}
            pendiente={loading}
            onPage={setPage}
            className="mt-4"
            etiqueta="Paginación de los resultados (abajo)"
          />
        )}
      </section>
    </div>
  );
}

/**
 * Un filtro puesto, y cómo quitarlo.
 *
 * Los que vienen **de fábrica** se ven igual que los que puso el usuario, en
 * gris en vez de azul: un chip que solo aparece cuando difiere del valor por
 * defecto deja invisibles justo los que más recortan, y quien busca y lee «0
 * coincidencias» nunca se entera de que estaba mirando treinta días.
 */
function Chip({
  chip,
  children,
  className,
}: {
  chip: { porDefecto?: boolean; clear: () => void };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button
      variant={chip.porDefecto ? "secondary" : "outline"}
      size="sm"
      onClick={chip.clear}
      title={
        chip.porDefecto
          ? "Filtro por defecto — quítalo para ampliar la búsqueda"
          : "Quitar este filtro"
      }
      className={cn(
        "h-7 gap-1 px-2.5 font-medium",
        chip.porDefecto
          ? "bg-canvas text-ink-soft hover:text-ink"
          : "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 hover:text-brand-800",
        className,
      )}
    >
      {children}
      <IconX className="h-3 w-3 shrink-0" />
    </Button>
  );
}

function FiltrosControles({
  etapa, setEtapa, modalidad, setModalidad, unidades, unidadTexto,
  setUnidadTexto, unidadSel, startdate, setStartdate, enddate, setEnddate,
  orden, setOrden, mipyme, setMipyme,
}: FiltrosProps) {
  const etapaSel = etapaPorClave(etapa);
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="lg:col-span-12">
        <Label htmlFor="f-unidad" className="text-xs text-ink-soft">
          Institución (unidad de compra)
        </Label>
        <Input
          id="f-unidad"
          list="lista-unidades"
          value={unidadTexto}
          onChange={(e) => setUnidadTexto(e.target.value)}
          /*
            El teclado del teléfono no tiene que corregir el nombre de una
            institución ni ofrecer su propio autocompletado encima del de la
            lista, y la tecla de envío dice «listo» porque aquí no se envía
            nada: el filtro se aplica al elegir de la lista.
          */
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="done"
          placeholder={
            unidades.length
              ? "Todas — escribe para filtrar por institución…"
              : "Cargando instituciones…"
          }
          className="mt-1"
        />
        {/*
          Lista nativa a propósito: son más de mil instituciones y el navegador
          las filtra mientras se teclea sin traerse ninguna librería.
        */}
        <datalist id="lista-unidades">
          {unidades.map((u) => (
            <option key={u.codigo} value={etiquetaUnidad(u)} />
          ))}
        </datalist>
        {unidadTexto && !unidadSel && (
          <span className="mt-1 block text-xs text-alerta-600">
            Selecciona una institución de la lista para aplicar el filtro.
          </span>
        )}
      </div>

      {/*
        Etapa, no «estado». El control ofrecía los siete `estado_proceso` de la
        DGCP tal cual, así que «¿qué ya cerró?» —donde están el ganador y el
        precio— exigía saber que la respuesta se reparte entre seis de ellos y
        elegirlos de uno en uno. Ahora la pregunta es una opción, y cada una
        lleva pegada, dentro del desplegable, qué recoge exactamente.
      */}
      <div className="lg:col-span-3">
        <Label className="text-xs text-ink-soft">Etapa</Label>
        <Select
          value={etapa === "" ? TODAS : etapa}
          onValueChange={(v) => setEtapa(v === TODAS ? "" : (v as EtapaFiltro))}
        >
          <SelectTrigger aria-label="Etapa del proceso" className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value={TODAS}
              ayuda="Abiertos y cerrados, en cualquier punto de su trámite."
            >
              Todas las etapas
            </SelectItem>
            {ETAPAS.map((e) => (
              <SelectItem key={e.clave} value={e.clave} ayuda={e.ayuda}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/*
          La traducción de la jerga al lado del control, y a 12 px: es lo que
          dice qué recoge exactamente la etapa elegida, no una nota al pie.
        */}
        <span className="mt-1 block text-xs leading-snug text-ink-soft">
          {etapaSel?.ayuda ?? "Abiertos y cerrados, en cualquier punto de su trámite."}
        </span>
      </div>

      <div className="lg:col-span-3">
        <Label className="text-xs text-ink-soft">Modalidad</Label>
        <Select
          value={modalidad === "" ? TODAS : modalidad}
          onValueChange={(v) => setModalidad(v === TODAS ? "" : v)}
        >
          <SelectTrigger aria-label="Modalidad de compra" className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas</SelectItem>
            {MODALIDADES.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="lg:col-span-2">
        <Label htmlFor="f-desde" className="text-xs text-ink-soft">
          Publicado desde
        </Label>
        <Input
          id="f-desde"
          type="date"
          value={startdate}
          onChange={(e) => setStartdate(e.target.value)}
          className="mt-1"
        />
      </div>

      <div className="lg:col-span-2">
        <Label htmlFor="f-hasta" className="text-xs text-ink-soft">
          Publicado hasta
        </Label>
        <Input
          id="f-hasta"
          type="date"
          value={enddate}
          onChange={(e) => setEnddate(e.target.value)}
          className="mt-1"
        />
      </div>

      <div className="lg:col-span-2">
        <Label className="text-xs text-ink-soft">Ordenar por</Label>
        <Select value={orden} onValueChange={(v) => setOrden(v as Orden)}>
          <SelectTrigger aria-label="Ordenar los resultados" className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recientes">Más recientes</SelectItem>
            <SelectItem value="cierre">Cierre más próximo</SelectItem>
            {/*
              «(RD$)» no es adorno: el registro publica también en dólares y en
              euros, y sin tasa de cambio no hay forma honesta de mezclarlos en
              un mismo ranking. Se ordena dentro del peso y lo demás va al final
              con su divisa a la vista; la etiqueta dice exactamente eso.
            */}
            <SelectItem
              value="monto_desc"
              ayuda="Solo entre los publicados en pesos."
            >
              Mayor monto (RD$)
            </SelectItem>
            <SelectItem
              value="monto_asc"
              ayuda="Solo entre los publicados en pesos."
            >
              Menor monto (RD$)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/*
        La casilla mide 16 px y su etiqueta veinte: en un teléfono eso es una
        línea de texto, no un objetivo de toque. La fila entera pasa a medir
        44 px y la etiqueta la ocupa completa, así que se acierta en cualquier
        punto de ella.
      */}
      <div className="flex min-h-11 items-center lg:col-span-12">
        <Checkbox
          id="f-mipyme"
          checked={mipyme}
          onCheckedChange={(v) => setMipyme(v === true)}
        />
        <Label
          htmlFor="f-mipyme"
          className="flex min-h-11 flex-1 cursor-pointer items-center pl-2 font-normal"
        >
          Solo dirigidos a MIPYMES
        </Label>
      </div>
    </div>
  );
}

/**
 * ¿Se aparta ahora la barra pegajosa? Sí al bajar más allá de la primera
 * pantalla; no en cuanto se sube, por poco que sea, ni mientras `activo` sea
 * falso (con la hoja de filtros abierta la barra no se toca). El umbral de
 * 8 px evita que el temblor del dedo la haga parpadear.
 */
function useOcultarAlBajar(activo: boolean) {
  const [oculta, setOculta] = useState(false);
  useEffect(() => {
    if (!activo) {
      setOculta(false);
      return;
    }
    let previo = window.scrollY;
    const alDesplazar = () => {
      const y = window.scrollY;
      if (Math.abs(y - previo) < 8) return;
      setOculta(y > previo && y > 240);
      previo = y;
    };
    window.addEventListener("scroll", alDesplazar, { passive: true });
    return () => window.removeEventListener("scroll", alDesplazar);
  }, [activo]);
  return [oculta, setOculta] as const;
}
