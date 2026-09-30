/**
 * El sistema de gráficos (docs/IDENTIDAD.md §Gráficos — el sistema). Un
 * gráfico nuevo se compone con estas piezas; no se dibuja a mano en una
 * página.
 */
export { BarrasHorizontales, FilaBarra, MarcaBarra, type Barra } from "./barras-horizontales";
export { SerieTemporal, type Punto } from "./serie-temporal";
export { BarraApilada, type Segmento } from "./barra-apilada";
export { MatrizMensual, type FilaMatriz } from "./matriz-mensual";
export { Multiples, maximoComun } from "./multiples";
export { Leyenda, EscalaSecuencial, type EntradaLeyenda } from "./leyenda";
export { VerComoTabla, type ColumnaTabla } from "./ver-como-tabla";
export { MapaProvincias, type ZonaMapa } from "./mapa-provincias";
export { CATEGORICA, SECUENCIAL, SECUENCIAL_RELLENO, DIVERGENTE, SERIE, CONTEXTO, OTROS, ORDEN_TONOS } from "./paleta";
export { formatearValor, type FormatoValor } from "./formato";
