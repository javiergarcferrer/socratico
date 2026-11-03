#!/usr/bin/env node
/**
 * Mide el lienzo del banco de trabajo (`components/grafo/lienzo.tsx`) en el
 * Chromium de la máquina, contra un servidor ya en marcha (`next start` o una
 * preview de Vercel). Dos medidas, las de docs/INFRAESTRUCTURA.md §11.11:
 *
 *  1. **Cuadros por segundo** con 2 000 nodos y 5 000 aristas: se siembran por
 *     el evento `lienzo:sembrar` (la misma API que usa la ola 2) y se mueve la
 *     cámara con la rueda durante 6 s; cuenta los `requestAnimationFrame`.
 *  2. **Expandir un nodo**, p50 y p95: desde el Enter sobre un nodo sin abrir
 *     (el teclado, el camino real) hasta que la región `aria-live` anuncia lo
 *     que se abrió, que se escribe después de pintar los vecinos nuevos.
 *
 * Uso: NODE_PATH=$(npm root -g) BASE=http://localhost:3000 node scripts/medir-lienzo.mjs
 *      `playwright` no es dependencia del repositorio: el script lo toma de
 *      la instalación global de la máquina (con su Chromium), por eso el
 *      `NODE_PATH`. `RAIZ=` cambia el nodo de partida, `EXPANSIONES=` cuántas.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3000";
const RAIZ = process.env.RAIZ ?? "/instituciones/4";
const EXPANSIONES = Number(process.env.EXPANSIONES ?? 20);

function percentil(xs, p) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

async function abrir(navegador) {
  const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
  await pagina.goto(`${BASE}/?nodo=${encodeURIComponent(RAIZ)}&vista=red`, { waitUntil: "networkidle" });
  await pagina.waitForSelector("[data-lienzo][data-dispuesto]", { timeout: 60_000 });
  return pagina;
}

async function cuadros(navegador) {
  const pagina = await abrir(navegador);
  await pagina.evaluate(() => {
    // Un generador con semilla: la misma red en cada corrida.
    let s = 1;
    const azar = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const nodos = Array.from({ length: 2000 }, (_, i) => ({
      ruta: `/proveedores/${900000 + i}`,
      titulo: `Proveedor de prueba ${i + 1}`,
      tipo: "proveedor",
    }));
    const aristas = [];
    const vistas = new Set();
    while (aristas.length < 5000) {
      const a = Math.floor(azar() * 2000);
      // Mitad local (racimos), mitad lejana: como un grafo real, no una malla.
      const b = azar() < 0.5 ? (a + 1 + Math.floor(azar() * 20)) % 2000 : Math.floor(azar() * 2000);
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (a === b || vistas.has(k)) continue;
      vistas.add(k);
      aristas.push({ de: nodos[a].ruta, a: nodos[b].ruta, verbo: "Prueba" });
    }
    document.querySelector("[data-lienzo]").dispatchEvent(new CustomEvent("lienzo:sembrar", { detail: { nodos, aristas, reemplazar: true } }));
  });
  await pagina.waitForFunction(() => document.querySelector("[data-lienzo]")?.getAttribute("data-nodos") === "2000", null, { timeout: 60_000 });
  const aristas = await pagina.getAttribute("[data-lienzo]", "data-aristas");
  // Que la disposición llegue y su animación termine.
  await pagina.waitForTimeout(4000);
  const lienzo = await pagina.$("[data-lienzo] [role=application]");
  const caja = await lienzo.boundingBox();
  await pagina.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  const medida = pagina.evaluate(
    () =>
      new Promise((listo) => {
        const marcas = [];
        const fin = performance.now() + 6000;
        const paso = (t) => {
          marcas.push(t);
          if (t < fin) requestAnimationFrame(paso);
          else {
            const intervalos = marcas.slice(1).map((x, i) => x - marcas[i]);
            const total = (marcas.at(-1) - marcas[0]) / 1000;
            listo({ fps: (marcas.length - 1) / total, p95: intervalos.sort((a, b) => a - b)[Math.floor(intervalos.length * 0.95)] });
          }
        };
        requestAnimationFrame(paso);
      }),
  );
  // La rueda, alternando acercar y alejar: sigma anima cada zoom y repinta en cada cuadro.
  const fin = Date.now() + 6000;
  let i = 0;
  while (Date.now() < fin) {
    await pagina.mouse.wheel(0, i++ % 2 ? 240 : -240);
    await pagina.waitForTimeout(120);
  }
  const r = await medida;
  await pagina.close();
  return { ...r, aristas: Number(aristas) };
}

async function expandir(navegador) {
  const pagina = await abrir(navegador);
  await pagina.evaluate(() => {
    const vivos = document.querySelectorAll("[data-lienzo] [aria-live]");
    window.__medidas = [];
    window.__t0 = null;
    new MutationObserver(() => {
      if (window.__t0 != null) {
        window.__medidas.push(performance.now() - window.__t0);
        window.__t0 = null;
      }
    }).observe(vivos[0], { childList: true, characterData: true, subtree: true });
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter") window.__t0 = performance.now();
      },
      true,
    );
  });
  await pagina.focus("[data-lienzo] [role=application]");
  const flechas = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
  let hechas = 0;
  for (let intento = 0; intento < EXPANSIONES * 8 && hechas < EXPANSIONES; intento++) {
    await pagina.keyboard.press(flechas[intento % 4]);
    await pagina.waitForTimeout(250);
    const foco = await pagina.evaluate(() => document.querySelectorAll("[data-lienzo] [aria-live]")[1].textContent ?? "");
    if (!foco.includes("sin abrir")) continue;
    const antes = await pagina.evaluate(() => window.__medidas.length);
    await pagina.keyboard.press("Enter");
    try {
      await pagina.waitForFunction((n) => window.__medidas.length > n, antes, { timeout: 15_000 });
      hechas++;
    } catch {
      await pagina.evaluate(() => (window.__t0 = null));
    }
    // Que la disposición de esta expansión se asiente antes de la siguiente.
    await pagina.waitForTimeout(600);
  }
  const medidas = await pagina.evaluate(() => window.__medidas);
  const nodos = await pagina.getAttribute("[data-lienzo]", "data-nodos");
  await pagina.close();
  return { n: medidas.length, p50: percentil(medidas, 50), p95: percentil(medidas, 95), max: Math.max(...medidas), nodos: Number(nodos) };
}

const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  const fecha = new Date().toISOString().slice(0, 10);
  const c = await cuadros(navegador);
  console.log(`${fecha} ${BASE} cuadros: 2000 nodos, ${c.aristas} aristas → ${c.fps.toFixed(1)} fps (p95 del cuadro ${c.p95.toFixed(1)} ms)`);
  const e = await expandir(navegador);
  console.log(
    `${fecha} ${BASE} expandir: ${e.n} expansiones desde ${RAIZ} (${e.nodos} nodos al final) → p50 ${e.p50.toFixed(0)} ms, p95 ${e.p95.toFixed(0)} ms, máx ${e.max.toFixed(0)} ms`,
  );
} finally {
  await navegador.close();
}
