import type { NextConfig } from "next";

/*
  Rendimiento percibido, no solo medido.

  · `staleTimes`: el router del cliente reutiliza durante 30 s la respuesta
    de una ruta dinámica ya visitada (volver de una ficha al listado no
    vuelve a esperar al SIL) y 5 min la de una estática. Es la caché de
    navegación, no la de datos: cada dato sigue con su propia ventana.
  · Las instantáneas de `public/data` (nómina, fiscal, deuda) solo cambian
    con un despliegue: el navegador las guarda una hora y las renueva en
    segundo plano una vez pasada.
  · Sin cabecera `x-powered-by`: no aporta nada y pesa en cada respuesta.
  · El índice del buscador (`public/data/busqueda`: corpus, vectores, modelo
    e índice por palabra ya construido, ~98 MB) se lee con `fs` desde
    `lib/busqueda.ts`. Se declara aquí para que
    el trazado de archivos lo meta en la función de las tres rutas que lo usan
    y solo en ellas, sin depender de que adivine la ruta.
*/
const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/buscar": ["./public/data/busqueda/**"],
    "/api/buscar": ["./public/data/busqueda/**"],
    "/proveedores": ["./public/data/busqueda/**"],
  },
  // Las instantáneas que solo lee `scripts/build-busqueda.py` no viajan en
  // ninguna función: su contenido ya está en el corpus.
  // Las claves casan como subcadena: «/proveedores» también es
  // «/proveedores/[rpe]» y «/api/proveedores», que no usan el índice.
  outputFileTracingExcludes: {
    "*": ["./public/data/{procesos,congreso,sentencias}.json"],
    "/proveedores/*": ["./public/data/busqueda/**"],
    "/api/proveedores": ["./public/data/busqueda/**"],
  },
  experimental: {
    staleTimes: { dynamic: 30, static: 300 },
  },
  async headers() {
    return [
      {
        source: "/data/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
