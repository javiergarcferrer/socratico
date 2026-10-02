/**
 * Validación de la cédula de identidad dominicana (11 dígitos, verificador
 * Luhn: pesos 1,2 alternos sobre los primeros 10 dígitos, restando 9 a los
 * productos mayores de 9; el módulo 10 del complemento es el dígito 11).
 *
 * Sirve para rechazar tipeos y números inventados — **no** prueba que la
 * cédula exista en el padrón ni que pertenezca a quien la escribe (eso exige
 * la JCE; ver docs/INFRAESTRUCTURA.md §10). El servidor re-valida siempre en
 * `democracia.cedula_valida`: esta copia es solo feedback inmediato de UI.
 */

/** Deja solo dígitos. */
export function limpiarCedula(valor: string): string {
  return (valor || "").replace(/\D/g, "");
}

export function cedulaValida(valor: string): boolean {
  const c = limpiarCedula(valor);
  if (c.length !== 11) return false;

  let suma = 0;
  for (let i = 0; i < 10; i++) {
    const producto = Number(c[i]) * (i % 2 === 0 ? 1 : 2);
    suma += producto > 9 ? producto - 9 : producto;
  }
  return (10 - (suma % 10)) % 10 === Number(c[10]);
}

/** `001-1223344-0` para mostrar; no usar para almacenar. */
export function formatearCedula(valor: string): string {
  const c = limpiarCedula(valor);
  if (c.length !== 11) return valor;
  return `${c.slice(0, 3)}-${c.slice(3, 10)}-${c.slice(10)}`;
}
