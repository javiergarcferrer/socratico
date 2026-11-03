/**
 * Un cupo repartido entre grupos: un ministerio con 140 cargos llenaría el
 * dibujo de cargos y escondería a quién le contrata y qué publica. Cada grupo
 * recibe su parte (al menos dos), lo que sobra se reparte en orden, y los
 * grupos siguen juntos y en su orden. Lo usan la red de un salto
 * (`RedVecinos` en `components/explorador/red.tsx`, antes del lienzo) y cada
 * expansión del lienzo (`components/grafo/modelo.ts`).
 */
export function repartir<T>(grupos: T[][], tope: number): T[] {
  if (grupos.length === 0 || tope <= 0) return [];
  const parte = Math.max(2, Math.floor(tope / grupos.length));
  const tomados = grupos.map((g) => Math.min(g.length, parte));
  let libres = tope - tomados.reduce((s, x) => s + x, 0);
  for (let i = 0; i < grupos.length && libres > 0; i++) {
    const mas = Math.min(grupos[i].length - tomados[i], libres);
    tomados[i] += mas;
    libres -= mas;
  }
  // Con muchos grupos la parte mínima puede pasarse del tope: se recorta por el final.
  return grupos.flatMap((g, i) => g.slice(0, tomados[i])).slice(0, tope);
}
